// What a game of the scope's league was when it was last cancelled (step 2.158): the
// `was` its newest `games.cancel_game` activity entry keeps ("scheduled" or "postponed"),
// so putting it back returns it to that. Undefined when there is no such entry, or one
// written before entries kept it.
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findStatusBeforeCancelled(
  scope: LeagueScope,
  gameId: string,
): Promise<string | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('activity_log')
    .select(sql<string | null>`details ->> 'was'`.as('was'))
    .where('league_id', '=', scope.leagueId)
    .where('target_type', '=', 'game')
    .where('target_id', '=', gameId)
    .where('action', '=', 'games.cancel_game')
    .orderBy('at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();
  return row?.was ?? undefined;
}
