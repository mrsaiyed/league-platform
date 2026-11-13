// Adds an entry to the scope's league's activity log (A-6). Its time is left to
// the database (T3 §12); the log is only ever added to (T-45).
import type { ActivityEntry } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function insertActivity(scope: LeagueScope, entry: ActivityEntry): Promise<void> {
  await transactionOf(scope)
    .insertInto('activity_log')
    .values({
      league_id: scope.leagueId,
      actor_account_id: entry.actorAccountId,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId,
      summary: entry.summary,
      details: { ...entry.details },
    })
    .execute();
}
