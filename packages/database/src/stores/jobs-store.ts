// Core's JobQueue for one command's transaction (T-130): every job a command or an
// event handler records goes into the jobs table in that same transaction, so it
// is saved with the change that caused it or not at all. Apps put it in each
// command transaction's `jobs` (commandTransaction's makeTx).
import type { JobQueue } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import { insertJob } from '../queries/index.ts';

export function jobsStore(scope: LeagueScope): JobQueue {
  return { enqueue: (job) => insertJob(scope, job) };
}
