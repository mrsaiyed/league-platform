// The activity log (core's ActivityLog, A-6), bound to one league scope.
import type { ActivityLog } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import { insertActivity, listActivityEntries } from '../queries/index.ts';

export function activityLogStore(scope: LeagueScope): ActivityLog {
  return {
    record: (entry) => insertActivity(scope, entry),
    list: (limit, before) => listActivityEntries(scope, limit, before),
  };
}
