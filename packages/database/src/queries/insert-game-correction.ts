// Adds a correction (S-7) for a game of the scope's league: who, why, and the result
// before and after (with the sheet a reopen keeps, T-365). History: only ever added (T-45). The database dates it itself.
import type { GameResultDocument, NewGameCorrection } from '@srleagues/core';
import type { JsonObject } from '../db/schema-types.ts';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

// The document as plain JSON: a kept sheet's lines are arrays of objects (step 2.229, T-365).
const documentOf = (document: GameResultDocument): JsonObject =>
  JSON.parse(JSON.stringify(document)) as JsonObject;

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
      before: documentOf(correction.before),
      after: documentOf(correction.after),
    })
    .execute();
}
