// Who sent a game's latest end in the scope's league (T3 §8 `game_events`, its last event
// of type `end`): the account, null for an event with none, or undefined if its tracker
// never ended it. The scorekeeper's reopening asks it (step 2.120, record 060).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findLastGameEnd(
  scope: LeagueScope,
  gameId: string,
): Promise<{ readonly accountId: string | null } | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('game_events')
    .select('account_id')
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .where('type', '=', 'end')
    .orderBy('seq', 'desc')
    .limit(1)
    .executeTakeFirst();
  return row === undefined ? undefined : { accountId: row.account_id };
}
