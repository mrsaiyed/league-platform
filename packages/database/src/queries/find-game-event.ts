// The event a game of the scope's league took for one command id (T3 §8 `game_events`):
// its number, type and sender, or undefined. The scorekeeper's reopen uses its request
// id as the reopen event's command id, so a retry finds the reopen it already made
// (step 2.120, record 060).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findGameEvent(
  scope: LeagueScope,
  gameId: string,
  commandId: string,
): Promise<
  { readonly seq: number; readonly type: string; readonly accountId: string | null } | undefined
> {
  const row = await transactionOf(scope)
    .selectFrom('game_events')
    .select(['seq', 'type', 'account_id'])
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .where('command_id', '=', commandId)
    .executeTakeFirst();
  return row === undefined
    ? undefined
    : { seq: row.seq, type: row.type, accountId: row.account_id };
}
