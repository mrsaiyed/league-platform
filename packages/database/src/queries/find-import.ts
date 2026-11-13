// An import of the scope's league, with its report and created documents as stored.
// Undefined if it is not in the scope's league.
import type { ImportKind, ImportRecord, ImportStatus } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

const iso = (value: Date | null) => (value === null ? null : value.toISOString());

export async function findImport(
  scope: LeagueScope,
  importId: string,
): Promise<ImportRecord | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('imports')
    .select([
      'id',
      'season_id',
      'kind',
      'status',
      'account_id',
      'file_name',
      'report',
      'created',
      'applied_at',
      'undone_at',
      'version',
    ])
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', importId)
    .executeTakeFirst();
  return row === undefined
    ? undefined
    : {
        id: row.id,
        seasonId: row.season_id,
        kind: row.kind as ImportKind,
        status: row.status as ImportStatus,
        accountId: row.account_id,
        fileName: row.file_name,
        report: row.report,
        created: row.created,
        appliedAt: iso(row.applied_at),
        undoneAt: iso(row.undone_at),
        version: row.version,
      };
}
