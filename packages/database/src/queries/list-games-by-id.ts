// The season's games with these ids in the scope's league, in the bin or not and dated
// or not, with what publishing must know: whether each has been scored (it then never
// goes to the bin, record 030); a game marked not started counts only what came after
// its marker (record 061).
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
      // Past its last "not started" marker (record 061), as the bin's own rule reads it.
      sql<boolean>`public.game_tracked_past_marker(games.league_id, games.id)`.as('has_events'),
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
