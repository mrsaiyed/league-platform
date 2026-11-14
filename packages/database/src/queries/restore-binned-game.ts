// Brings a game of the scope's league back from the bin (`deleted_at` cleared). Only a
// game that was never played comes back: a decided game changes only with a correction
// (S-7). False if it is not there, is not in the bin or was played. Bringing it back can
// meet a game number or outside reference another game of the season took meanwhile
// (0009): the name of which, and the transaction is then unusable.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';

export async function restoreBinnedGame(
  scope: LeagueScope,
  gameId: string,
): Promise<boolean | 'game-number-taken' | 'external-ref-taken'> {
  try {
    const row = await transactionOf(scope)
      .updateTable('games')
      .set({ deleted_at: null })
      .where('league_id', '=', scope.leagueId)
      .where('id', '=', gameId)
      .where('deleted_at', 'is not', null)
      .where('status', 'in', ['scheduled', 'postponed', 'cancelled'])
      .returning('id')
      .executeTakeFirst();
    return row !== undefined;
  } catch (error) {
    const constraint = constraintOf(error)?.constraint;
    if (constraint === 'games_game_number_key') return 'game-number-taken';
    if (constraint === 'games_external_ref_key') return 'external-ref-taken';
    throw error;
  }
}
