// The games of the scope's league that hold a game's place now (step 2.158): not in the
// bin, not postponed or cancelled (those hold no place), starting at exactly the same
// time, and with one of its teams or on its court. The schedule's own clash rule
// (packages/core/src/modules/scheduling/rules/find-clashes.ts): the spec gives no game
// length, so only the same start is compared. None for a game with no time, or not here.
import type { GameAtSameTime } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listGameClashes(
  scope: LeagueScope,
  gameId: string,
): Promise<GameAtSameTime[]> {
  const { rows } = await sql<{ id: string; home_team_id: string; away_team_id: string }>`
    select o.id, o.home_team_id, o.away_team_id
    from games g
    join games o
      on o.league_id = g.league_id
     and o.id <> g.id
     and o.starts_at = g.starts_at
     and o.deleted_at is null
     and o.status not in ('postponed', 'cancelled')
     and (
       o.home_team_id in (g.home_team_id, g.away_team_id)
       or o.away_team_id in (g.home_team_id, g.away_team_id)
       or (g.court_id is not null and o.court_id = g.court_id)
     )
    where g.league_id = ${scope.leagueId} and g.id = ${gameId} and g.starts_at is not null
    order by o.id
  `.execute(transactionOf(scope));
  return rows.map((r) => ({ id: r.id, homeTeamId: r.home_team_id, awayTeamId: r.away_team_id }));
}
