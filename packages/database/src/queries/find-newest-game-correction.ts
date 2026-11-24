// The newest correction of a game of the scope's league, its two documents read back
// (step 2.229): "put the sheet back" restores what the newest one kept (T-365, T-366).
// Newest by when it was written, then by id (uuid_v7, so later within one transaction).
// A document that does not read as a result reads as keeping nothing (core's
// resultDocumentOf). Only the documents: never the reason or who (S-7 stays private).
import { resultDocumentOf, type StoredGameCorrection } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findNewestGameCorrection(
  scope: LeagueScope,
  gameId: string,
): Promise<StoredGameCorrection | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('game_corrections')
    .select(['before', 'after'])
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .orderBy('at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (row === undefined) return undefined;
  const before = resultDocumentOf(row.before);
  const after = resultDocumentOf(row.after);
  if (before === undefined || after === undefined) return undefined;
  return { before, after };
}
