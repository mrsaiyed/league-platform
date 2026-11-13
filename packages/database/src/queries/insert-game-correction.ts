// Adds a correction (S-7) for a game of the scope's league: who, why, and the result
// before and after. History: only ever added (T-45). The database dates it itself.
import type { NewGameCorrection } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function insertGameCorrection(
  scope: LeagueScope,
  correction: NewGameCorrection,
): Promise<void> {
  await transactionOf(scope)
    .insertInto('game_corrections')
    .values({
      league_id: scope.leagueId,
      game_id: correction.gameId,
      account_id: correction.accountId,
      reason: correction.reason,
      before: { ...correction.before },
      after: { ...correction.after },
    })
    .execute();
}
