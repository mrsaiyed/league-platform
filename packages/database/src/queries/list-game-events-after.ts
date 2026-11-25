// The events a game of the scope's league took after one sequence number, oldest first
// and at most `limit` (T3 §8 `game_events`): their number, command id, type and
// sender. "Send these plays" looks through them to tell whether anybody recorded
// anything since the plays were made (S-43, T-335). With each, where it came from when
// a correction wrote it (T-408): read from the event's payload, which keeps the mark.
import { correctionPlaySource, playSourceKey, type PlaySource } from '@srleagues/contracts';
import { sql } from 'kysely';
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
    readonly source?: PlaySource;
  }[]
> {
  const rows = await transactionOf(scope)
    .selectFrom('game_events')
    .select(['seq', 'command_id', 'type', 'account_id'])
    .select(sql<string | null>`payload ->> ${sql.lit(playSourceKey)}`.as('source'))
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
    ...(row.source === correctionPlaySource ? { source: correctionPlaySource } : {}),
  }));
}
