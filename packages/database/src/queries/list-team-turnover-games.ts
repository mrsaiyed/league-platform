// The turnovers charged to a team rather than a player in each final game of a season,
// not in the bin (step 2.196, the numbers audit's H1): a row per team and game where the
// team was charged any, with whether the game is counted already among the games its
// turnovers were recorded in (a line of one of its players who came on carries turnovers).
// Core adds them to the team's season totals (statistics-source.ts).
//
// Counted from the saved plays, per side: the team turnovers less those taken back. That
// is the engine's own count (packages/sports, `derive`, `teamTurnovers`): Undo takes a
// play out of the plays (onto the redo stack), and the engine refuses a take-back while
// the team has none standing, so every take-back in the plays took one back. A game's
// page reads the same count by the engine itself (teamOwnCounts); the tests hold the two
// to the same number. Only the count leaves the database, never a game's saved state.
import { sql } from 'kysely';
import type { TeamOwnTurnoversRecord } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

/** A play of the engine's charged to a team itself (packages/sports, `team-turnover`). */
const teamTurnoverPlay = JSON.stringify([{ type: 'team-turnover' }]);

export async function listTeamTurnoverGames(
  scope: LeagueScope,
  seasonId: string,
): Promise<TeamOwnTurnoversRecord[]> {
  const result = await sql<{
    game_id: string;
    team_id: string;
    turnovers: string;
    counted: boolean;
  }>`
    select game_id, team_id, turnovers::text, counted
      from (
        select g.id as game_id,
               case t.side when 'home' then g.home_team_id else g.away_team_id end as team_id,
               (select count(*) filter (where p ->> 'type' = 'team-turnover')
                     - count(*) filter (where p ->> 'type' = 'team-unturnover')
                  from jsonb_array_elements(s.state -> 'plays') p
                 where p ->> 'side' = t.side) as turnovers,
               exists (
                 select 1 from player_game_stats l
                  where l.league_id = g.league_id and l.game_id = g.id and l.played
                    and l.team_id = case t.side when 'home' then g.home_team_id
                                                else g.away_team_id end
                    and jsonb_typeof(l.stats -> 'turnovers') = 'number'
               ) as counted
          from games g
          join game_states s on s.league_id = g.league_id and s.game_id = g.id
          cross join (values ('home'), ('away')) as t (side)
         where g.league_id = ${scope.leagueId} and g.season_id = ${seasonId}
           and g.status = 'final' and g.deleted_at is null
           and jsonb_typeof(s.state -> 'plays') = 'array'
           and s.state -> 'plays' @> ${teamTurnoverPlay}::jsonb
      ) own
     where turnovers > 0
     order by game_id, team_id`.execute(transactionOf(scope));
  return result.rows.map((row) => ({
    gameId: row.game_id,
    teamId: row.team_id,
    turnovers: Number(row.turnovers),
    countedByLines: row.counted,
  }));
}
