// The production queue (record 012): jobs recorded in the jobs table are handed over
// to pg-boss, which runs them. Run here on PGlite, which pg-boss supports as a
// backend; not verified against a hosted PostgreSQL.
import { EmailSendError, type QueuedJob } from '@srleagues/core';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgBoss } from './create-pg-boss.ts';
import { pgBossQueue, type PgBossQueue } from './pg-boss-queue.ts';
import { eventually, queueSetUp, type QueueSetUp } from './queue.test-helper.ts';

let s: QueueSetUp;
let boss: PgBoss;
let queue: PgBossQueue;
const seen: QueuedJob[] = [];
const errors: unknown[] = [];
const invitationId = '0190abcd-0000-7000-8000-00000000000f';

beforeAll(async () => {
  s = await queueSetUp();
  boss = createPgBoss({ kind: 'pglite', pglite: s.pglite });
  // Started, but its own relay loop is slow: the tests hand jobs over with relayDue.
  queue = pgBossQueue(s.db, boss, {
    pollMs: 60_000,
    pollingIntervalSeconds: 0.5,
    stopTimeoutMs: 2000,
    log: (line) => void s.lines.push(line),
    onError: (error) => void errors.push(error),
  });
  await queue.start({
    'email.send': async (job) => void seen.push(job),
    'email.status': async () => {
      throw new EmailSendError('rejected', false, 422);
    },
    'recaps.send': async () => {},
  });
}, 60_000);
afterAll(async () => {
  await queue.stop();
  await s.close();
});

const bossJob = async (type: string, id: string) => (await boss.findJobs(type, { id }))[0];

describe('pgBossQueue', () => {
  it('hands a due job over under its own id, and pg-boss gives it to its handler', async () => {
    const id = await s.record({ ids: { invitationId } });
    expect(await queue.relayDue()).toBe(1);
    expect((await s.row(id)).state).toBe('handed_over');
    await eventually(() => seen.some((job) => job.id === id));
    expect(seen.find((job) => job.id === id)).toEqual({
      id,
      type: 'email.send',
      leagueId: s.league.leagueId,
      ids: { invitationId },
      attempt: 1,
    });
    await eventually(async () => (await bossJob('email.send', id))?.state === 'completed');
    // pg-boss holds the league and ids, nothing more (T-131).
    expect((await bossJob('email.send', id))?.data).toEqual({
      leagueId: s.league.leagueId,
      ids: { invitationId },
    });
  });

  it('hands a job over once however often the handover is repeated (T-137)', async () => {
    const id = await s.record();
    await queue.relayDue();
    // A worker that crashed after handing it over, before marking it: it is due again.
    await s.pglite.query(
      "update jobs set state = 'waiting', finished_at = null, run_after = now() where id = $1",
      [id],
    );
    expect(await queue.relayDue()).toBe(1);
    expect((await s.row(id)).state).toBe('handed_over');
    await eventually(async () => (await bossJob('email.send', id))?.state === 'completed');
    expect(await boss.findJobs('email.send', { id })).toHaveLength(1);
    expect(seen.filter((job) => job.id === id)).toHaveLength(1);
  });

  it('fails at once in pg-boss a job whose error says it cannot succeed', async () => {
    const id = await s.record({ type: 'email.status' });
    await queue.relayDue();
    await eventually(async () => (await bossJob('email.status', id))?.state === 'failed');
    expect(s.lines.find((line) => line.jobId === id && line.outcome === 'failed')).toMatchObject({
      errorCode: 'rejected',
    });
  });

  it('keeps in the jobs table a job no handler here can run', async () => {
    const id = await s.record({ type: 'recaps.plan' });
    expect(await queue.relayDue()).toBe(0);
    expect(await s.row(id)).toEqual({ state: 'waiting', attempts: 1, last_error: 'no_handler' });
    expect(errors).toEqual([]);
  });

  it('keeps a job whose handover failed, to try again later', async () => {
    // pg-boss refuses it: its queue is gone.
    await boss.deleteQueue('recaps.send');
    const id = await s.record({ type: 'recaps.send' });
    expect(await queue.relayDue()).toBe(0);
    expect(await s.row(id)).toEqual({ state: 'waiting', attempts: 1, last_error: 'unexpected' });
    expect(s.lines.at(-1)).toMatchObject({ jobId: id, outcome: 'retry', errorCode: 'unexpected' });
  });
});
