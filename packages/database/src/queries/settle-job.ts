// Settles a job the worker holds, in a transaction for the job's own league: done,
// handed over to pg-boss, back to waiting until a retry, or onto the failed list.
// Only the holder of the current lease can (T-137): if the lease ran out and another
// worker took the job, this changes nothing and says so. A retry with no attempts
// left goes to the failed list whatever the caller asked.
import type { AfterFailure } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export type JobSettlement =
  | { readonly outcome: 'done' }
  | { readonly outcome: 'handed-over' }
  | AfterFailure;

/** True if the job was settled; false if this lease no longer holds it. */
export async function settleJob(
  scope: LeagueScope,
  jobId: string,
  leaseToken: string,
  settlement: JobSettlement,
): Promise<boolean> {
  const released = { lease_token: null, lease_expires_at: null } as const;
  const finished = { ...released, finished_at: sql<Date>`now()` };
  const changes =
    settlement.outcome === 'done'
      ? { ...finished, state: 'done' }
      : settlement.outcome === 'handed-over'
        ? { ...finished, state: 'handed_over' }
        : settlement.outcome === 'failed'
          ? { ...finished, state: 'failed', last_error: settlement.errorCode }
          : {
              ...released,
              state: sql<string>`case when attempts < max_attempts then 'waiting' else 'failed' end`,
              finished_at: sql<Date | null>`case when attempts < max_attempts then null else now() end`,
              run_after: sql<Date>`now() + make_interval(secs => ${settlement.inSeconds})`,
              last_error: settlement.errorCode,
            };
  const row = await transactionOf(scope)
    .updateTable('jobs')
    .set(changes)
    .where('id', '=', jobId)
    .where('league_id', '=', scope.leagueId)
    .where('state', '=', 'running')
    .where('lease_token', '=', leaseToken)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}
