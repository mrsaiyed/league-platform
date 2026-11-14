// Saves an import's status and, when given, its report or created document, in the scope's
// league, only if it is still at `version` (T-46). The first time it becomes applied its
// applied_at is stamped, and when it becomes undone its undone_at; the database refuses any
// other order. The new version, or undefined if it is not there or moved on.
import type { ImportChange } from '@srleagues/core';
import { sql } from 'kysely';
import type { JsonObject } from '../db/schema-types.ts';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function updateImport(
  scope: LeagueScope,
  importId: string,
  change: ImportChange,
  version: number,
): Promise<number | undefined> {
  const row = await transactionOf(scope)
    .updateTable('imports')
    .set({
      status: change.status,
      version: version + 1,
      ...(change.report === undefined ? {} : { report: change.report as JsonObject }),
      ...(change.created === undefined ? {} : { created: change.created as JsonObject }),
      ...(change.status === 'applied'
        ? { applied_at: sql<Date>`coalesce(applied_at, now())` }
        : {}),
      ...(change.status === 'undone' ? { undone_at: sql<Date>`now()` } : {}),
    })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', importId)
    .where('version', '=', version)
    .returning('version')
    .executeTakeFirst();
  return row?.version;
}
