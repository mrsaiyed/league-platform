// The season's games with these ids in the scope's league, in the bin or not and dated
// or not, with what publishing must know: whether each one's events keep it out of the
// bin (record 030), read by the same function as the bin's own rule, so a publication
// is never told it may remove a game the bin then refuses (record 061).
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
      // As the bin's own rule reads it (record 061, migration 0016): a play since its last
      // "not started" marker, or events in a game that was ever decided.
      sql<boolean>`public.game_scored_for_bin(games.league_id, games.id)`.as('has_events'),
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
