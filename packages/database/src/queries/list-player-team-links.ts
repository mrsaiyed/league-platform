// Every team a person has a line in a final game with, or a roster place on, in the
// season: how the public statistics find whose numbers a team's setting hides (S-22).
// A roster place counts even after the player left: a player with a hidden team has their
// totals recomputed from the shown teams' lines only (statistics-source.ts). It carries the
// number of the roster place, which a line shows where the league hides the name (R-24).
import { sql } from 'kysely';
import type { PlayerTeamLink } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listPlayerTeamLinks(
  scope: LeagueScope,
  seasonId: string,
): Promise<PlayerTeamLink[]> {
  // The number is the roster place's: a current place's before a former one's, the
  // greatest when several are alike (a player who left and came back with a new number).
  const result = await sql<{ person_id: string; team_id: string; jersey_number: string | null }>`
    select person_id, team_id,
           coalesce(max(jersey_number) filter (where current_place),
                    max(jersey_number)) as jersey_number
      from (
        select s.person_id, s.team_id, null::text as jersey_number, false as current_place
          from player_game_stats s
          join games g on g.league_id = s.league_id and g.id = s.game_id
         where s.league_id = ${scope.leagueId} and g.season_id = ${seasonId}
           and g.status in ('final', 'forfeit') and g.deleted_at is null
        union all
        select r.person_id, r.team_id, nullif(btrim(r.jersey_number), ''),
               r.left_on is null
          from roster_entries r
          join teams t on t.league_id = r.league_id and t.id = r.team_id
         where r.league_id = ${scope.leagueId} and t.season_id = ${seasonId}
      ) links
     group by person_id, team_id
     order by person_id, team_id`.execute(transactionOf(scope));
  return result.rows.map((row) => ({
    personId: row.person_id,
    teamId: row.team_id,
    jerseyNumber: row.jersey_number,
  }));
}
