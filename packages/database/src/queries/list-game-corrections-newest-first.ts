// The corrections of a game of the scope's league, newest first, their two documents read
// back (step 2.229): "put the sheet back" looks back through them for the newest one that
// kept a sheet (T-365, T-366, T-368). Newest by when it was written, then by id (uuid_v7,
// so later within one transaction). A document that does not read as a result (core's
// resultDocumentOf) ends the list there: nothing older is looked at past it. Only the
// documents: never the reason or who (S-7 stays private).
import { resultDocumentOf, type StoredGameCorrection } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listGameCorrectionsNewestFirst(
  scope: LeagueScope,
  gameId: string,
): Promise<readonly StoredGameCorrection[]> {
  const rows = await transactionOf(scope)
    .selectFrom('game_corrections')
    .select(['before', 'after'])
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .orderBy('at', 'desc')
    .orderBy('id', 'desc')
    .execute();
  const read: StoredGameCorrection[] = [];
  for (const row of rows) {
    const before = resultDocumentOf(row.before);
    const after = resultDocumentOf(row.after);
    if (before === undefined || after === undefined) break;
    read.push({ before, after });
  }
  return read;
}
