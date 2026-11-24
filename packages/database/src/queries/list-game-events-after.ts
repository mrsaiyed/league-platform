// The events a game of the scope's league took after one sequence number, oldest first
// and at most `limit` (T3 §8 `game_events`): their number, command id, type and
// sender. "Send these plays" looks through them to tell whether anybody recorded
// anything since the plays were made (S-43, T-335).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listGameEventsAfter(
  scope: LeagueScope,
  gameId: string,
  afterSeq: number,
  limit: number,
): Promise<
  readonly {
    readonly seq: number;
    readonly commandId: string;
    readonly type: string;
    readonly accountId: string | null;
  }[]
> {
  const rows = await transactionOf(scope)
    .selectFrom('game_events')
    .select(['seq', 'command_id', 'type', 'account_id'])
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .where('seq', '>', afterSeq)
    .orderBy('seq')
    .limit(limit)
    .execute();
  return rows.map((row) => ({
    seq: row.seq,
    commandId: row.command_id,
    type: row.type,
    accountId: row.account_id,
  }));
}
