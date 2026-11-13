// Moves games of a season of the scope's league to the bin, as a publication removes
// them (T-45); how many went. A game that is live or decided, or that the tracker has
// recorded anything for, stays (the database refuses a scored game in the bin), so the
// count tells the caller if any was left.
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function binPublishedGames(
  scope: LeagueScope,
  seasonId: string,
  gameIds: readonly string[],
): Promise<number> {
  if (gameIds.length === 0) return 0;
  const rows = await transactionOf(scope)
    .updateTable('games')
    .set({ deleted_at: sql<Date>`now()` })
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('id', 'in', [...gameIds])
    .where('deleted_at', 'is', null)
    .where('status', 'in', ['scheduled', 'postponed', 'cancelled'])
    .where(
      sql<boolean>`not exists (
        select 1 from game_events e
        where e.league_id = games.league_id and e.game_id = games.id
      )`,
    )
    .returning('id')
    .execute();
  return rows.length;
}
