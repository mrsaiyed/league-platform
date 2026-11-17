// The final games of a season, not in the bin, whose saved plays hold a turnover charged
// to a team rather than a player (step 2.196, the numbers audit's H1): each with its two
// teams and the engine's saved state as stored. Core reads the team's own count out of the
// state with the engine (teamOwnCounts), as a game's page does, and adds it to the team's
// season totals; the query only picks the games that have such a play, so a season's
// statistics never read every game's plays. A play taken back stays in the plays with the
// play that takes it back, so the engine, not this query, says what stands.
import { sql } from 'kysely';
import type { TeamTurnoverGame } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

/** A play of the engine's that is charged to a team itself (packages/sports, `team-turnover`). */
const teamTurnoverPlay = JSON.stringify([{ type: 'team-turnover' }]);

export async function listTeamTurnoverGames(
  scope: LeagueScope,
  seasonId: string,
): Promise<TeamTurnoverGame[]> {
  const result = await sql<{
    game_id: string;
    home_team_id: string;
    away_team_id: string;
    state: unknown;
  }>`
    select g.id as game_id, g.home_team_id, g.away_team_id, s.state
      from games g
      join game_states s on s.league_id = g.league_id and s.game_id = g.id
     where g.league_id = ${scope.leagueId} and g.season_id = ${seasonId}
       and g.status = 'final' and g.deleted_at is null
       and jsonb_typeof(s.state -> 'plays') = 'array'
       and s.state -> 'plays' @> ${teamTurnoverPlay}::jsonb
     order by g.id`.execute(transactionOf(scope));
  return result.rows.map((row) => ({
    gameId: row.game_id,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    state: row.state,
  }));
}
