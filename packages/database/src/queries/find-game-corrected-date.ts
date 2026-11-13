// The date (YYYY-MM-DD, UTC) of a game's latest correction, or undefined if it was
// never corrected. Only the date: the reason stays private (S-7).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findGameCorrectedDate(
  scope: LeagueScope,
  gameId: string,
): Promise<string | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('game_corrections')
    .select('created_at')
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst();
  return row === undefined ? undefined : row.created_at.toISOString().slice(0, 10);
}
