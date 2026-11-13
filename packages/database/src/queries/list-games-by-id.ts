// The season's games with these ids in the scope's league, in the bin or not and dated
// or not, with what publishing must know: whether each has been scored (it then never
// goes to the bin, record 030).
import type { GameFacts } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listGamesById(
  scope: LeagueScope,
  seasonId: string,
  gameIds: readonly string[],
): Promise<readonly GameFacts[]> {
  if (gameIds.length === 0) return [];
  const rows = await transactionOf(scope)
    .selectFrom('games')
    .select([
      'id',
      'status',
      'deleted_at',
      sql<boolean>`exists (
        select 1 from game_events e
        where e.league_id = games.league_id and e.game_id = games.id
      )`.as('has_events'),
    ])
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('id', 'in', [...gameIds])
    .execute();
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    binned: row.deleted_at !== null,
    hasEvents: row.has_events,
  }));
}
