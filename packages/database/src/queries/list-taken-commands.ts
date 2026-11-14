// Of these command ids, the ones a game of the scope's league has already taken (T3 §12):
// a retry or a replayed queue is answered "duplicate" for them.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listTakenCommands(
  scope: LeagueScope,
  gameId: string,
  commandIds: readonly string[],
): Promise<string[]> {
  if (commandIds.length === 0) return [];
  const rows = await transactionOf(scope)
    .selectFrom('game_events')
    .select('command_id')
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .where('command_id', 'in', [...commandIds])
    .execute();
  return rows.map((row) => row.command_id);
}
