// Settling a job: only by the lease that holds it (T-137), in the job's own league.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { freshSchema, newLeague, one, type MadeLeague } from '../schema/schema.test-helper.ts';
import { insertJob } from './insert-job.ts';
import { settleJob, type JobSettlement } from './settle-job.ts';
import { takeJobs, type TakenJob } from './take-jobs.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let league: MadeLeague;
beforeAll(async () => {
  pglite = await freshSchema();
  league = await newLeague(pglite);
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

async function recordAndTake(): Promise<TakenJob> {
  await withTransaction(db, { leagueId: league.leagueId }, (scope) =>
    insertJob(scope, { type: 'email.send', leagueId: league.leagueId, ids: {} }),
  );
  const [job] = await withTransaction(db, {}, (scope) => takeJobs(scope, 1, 60));
  if (job === undefined) throw new Error('nothing taken');
  return job;
}

const settle = (job: TakenJob, settlement: JobSettlement, leaseToken = job.leaseToken) =>
  withTransaction(db, { leagueId: league.leagueId }, (scope) =>
    settleJob(scope, job.id, leaseToken, settlement),
  );

const row = (id: string) =>
  one<{
    state: string;
    last_error: string | null;
    finished: boolean;
    lease: boolean;
    later: boolean;
  }>(
    pglite,
    `select state, last_error, finished_at is not null as finished,
            lease_token is not null as lease, run_after > now() + interval '1 minute' as later
     from jobs where id = $1`,
    [id],
  );

describe('settleJob', () => {
  it('marks a job done, releasing its lease', async () => {
    const job = await recordAndTake();
    expect(await settle(job, { outcome: 'done' })).toBe(true);
    expect(await row(job.id)).toEqual({
      state: 'done',
      last_error: null,
      finished: true,
      lease: false,
      later: false,
    });
    // Settled once: the lease no longer holds it.
    expect(await settle(job, { outcome: 'done' })).toBe(false);
  });

  it('changes nothing for a lease that does not hold the job', async () => {
    const job = await recordAndTake();
    expect(await settle(job, { outcome: 'done' }, crypto.randomUUID())).toBe(false);
    expect((await row(job.id)).state).toBe('running');
    await settle(job, { outcome: 'done' });
  });

  it('puts a job back to wait for a retry, keeping the code of what went wrong', async () => {
    const job = await recordAndTake();
    const retry = { outcome: 'retry', inSeconds: 120, errorCode: 'rate-limited' } as const;
    expect(await settle(job, retry)).toBe(true);
    expect(await row(job.id)).toEqual({
      state: 'waiting',
      last_error: 'rate-limited',
      finished: false,
      lease: false,
      later: true,
    });
  });

  it('fails instead of retrying a job on its last attempt, whatever the caller asked', async () => {
    const first = await recordAndTake();
    let job = first;
    // Its lease runs out four times; the fifth take is its last attempt.
    for (let attempt = 2; attempt <= 5; attempt++) {
      await pglite.query(
        "update jobs set lease_expires_at = now() - interval '1 second' where id = $1",
        [first.id],
      );
      const [again] = await withTransaction(db, {}, (scope) => takeJobs(scope, 1, 60));
      if (again === undefined) throw new Error('nothing taken');
      job = again;
    }
    expect(job).toMatchObject({ id: first.id, attempt: 5, maxAttempts: 5 });
    const retry = { outcome: 'retry', inSeconds: 120, errorCode: 'unavailable' } as const;
    expect(await settle(job, retry)).toBe(true);
    expect(await row(job.id)).toEqual({
      state: 'failed',
      last_error: 'unavailable',
      finished: true,
      lease: false,
      later: true,
    });
  });

  it('fails a job, and hands one over to pg-boss', async () => {
    const failed = await recordAndTake();
    await settle(failed, { outcome: 'failed', errorCode: 'rejected' });
    expect(await row(failed.id)).toMatchObject({
      state: 'failed',
      last_error: 'rejected',
      finished: true,
    });
    const handed = await recordAndTake();
    await settle(handed, { outcome: 'handed-over' });
    expect(await row(handed.id)).toMatchObject({ state: 'handed_over', finished: true });
  });
});
