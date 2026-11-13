// Every team a person has a line in a final game with, or a roster place on, in the
// season: how the public statistics find whose numbers a team's setting hides (S-22).
// A roster place counts even after the player left: a player with a hidden team has their
// totals recomputed from the shown teams' lines only (statistics-source.ts).
import { sql } from 'kysely';
import type { PlayerTeamLink } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listPlayerTeamLinks(
  scope: LeagueScope,
  seasonId: string,
): Promise<PlayerTeamLink[]> {
  const result = await sql<{ person_id: string; team_id: string }>`
    select s.person_id, s.team_id
      from player_game_stats s
      join games g on g.league_id = s.league_id and g.id = s.game_id
     where s.league_id = ${scope.leagueId} and g.season_id = ${seasonId}
       and g.status in ('final', 'forfeit') and g.deleted_at is null
    union
    select r.person_id, r.team_id
      from roster_entries r
      join teams t on t.league_id = r.league_id and t.id = r.team_id
     where r.league_id = ${scope.leagueId} and t.season_id = ${seasonId}
    order by person_id, team_id`.execute(transactionOf(scope));
  return result.rows.map((row) => ({ personId: row.person_id, teamId: row.team_id }));
}
