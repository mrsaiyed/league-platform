// Records a job for the scope's league in the scope's transaction (T-130): it exists
// only if that transaction commits. A job with a dedupe key already recorded for
// this league and type is not recorded again (0006, jobs_dedupe_key_once).
import type { Job } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function insertJob(scope: LeagueScope, job: Job): Promise<void> {
  await transactionOf(scope)
    .insertInto('jobs')
    .values({
      league_id: scope.leagueId,
      type: job.type,
      ids: { ...job.ids },
      dedupe_key: job.dedupeKey ?? null,
      run_after: sql<Date>`now() + make_interval(secs => ${job.delaySeconds ?? 0})`,
    })
    .onConflict((conflict) =>
      conflict
        .columns(['league_id', 'type', 'dedupe_key'])
        .where('dedupe_key', 'is not', null)
        .doNothing(),
    )
    .execute();
}
