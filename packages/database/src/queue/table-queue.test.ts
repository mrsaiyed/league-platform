// The queue for local work and tests (record 012): jobs run straight from the jobs
// table; retried with growing waits, then failed (T7 §5); safe to run twice (T-137).
import { EmailSendError, type QueuedJob } from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eventually, queueSetUp, type QueueSetUp } from './queue.test-helper.ts';
import { tableQueue } from './table-queue.ts';

let s: QueueSetUp;
beforeAll(async () => {
  s = await queueSetUp();
});
afterAll(async () => {
  await s.close();
});

const queue = () => tableQueue(s.db, { log: (line) => void s.lines.push(line) });
const invitationId = '0190abcd-0000-7000-8000-00000000000f';

describe('tableQueue', () => {
  it('gives a due job to the handler for its type, ids only, and marks it done', async () => {
    const id = await s.record({ ids: { invitationId } });
    const seen: QueuedJob[] = [];
    const ran = await queue().runDue({ 'email.send': async (job) => void seen.push(job) });
    expect(ran).toBe(1);
    expect(seen).toEqual([
      { id, type: 'email.send', leagueId: s.league.leagueId, ids: { invitationId }, attempt: 1 },
    ]);
    expect(await s.row(id)).toMatchObject({ state: 'done', attempts: 1 });
    expect(s.lines.at(-1)).toEqual({
      jobId: id,
      type: 'email.send',
      leagueId: s.league.leagueId,
      attempt: 1,
      outcome: 'done',
    });
  });

  it('runs nothing that is not yet due', async () => {
    const id = await s.record({ delaySeconds: 600 });
    expect(await queue().runDue({ 'email.send': async () => {} })).toBe(0);
    expect((await s.row(id)).state).toBe('waiting');
    await s.pglite.query("update jobs set state = 'done', finished_at = now() where id = $1", [id]);
  });

  it('tries a failing job again later, keeping only the code of what went wrong', async () => {
    const id = await s.record();
    const failing = async () => {
      throw new Error('could not reach someone@example.test');
    };
    expect(await queue().runDue({ 'email.send': failing })).toBe(1);
    expect(await s.row(id)).toEqual({ state: 'waiting', attempts: 1, last_error: 'unexpected' });
    expect(s.lines.at(-1)).toMatchObject({ outcome: 'retry', errorCode: 'unexpected' });
    expect(JSON.stringify(s.lines)).not.toContain('example.test');
    // Due again: the next attempt is counted, and after the last it fails.
    for (let attempt = 2; attempt <= 5; attempt++) {
      await s.pglite.query('update jobs set run_after = now() where id = $1', [id]);
      await queue().runDue({ 'email.send': failing });
      expect((await s.row(id)).attempts).toBe(attempt);
    }
    expect(await s.row(id)).toEqual({ state: 'failed', attempts: 5, last_error: 'unexpected' });
  });

  it('fails at once a job whose error says it cannot succeed', async () => {
    const id = await s.record();
    await queue().runDue({
      'email.send': async () => {
        throw new EmailSendError('rejected', false, 422);
      },
    });
    expect(await s.row(id)).toEqual({ state: 'failed', attempts: 1, last_error: 'rejected' });
  });

  it('keeps a job whose type has no handler, for a worker that has one', async () => {
    const id = await s.record({ type: 'recaps.plan' });
    await queue().runDue({ 'email.send': async () => {} });
    expect(await s.row(id)).toEqual({ state: 'waiting', attempts: 1, last_error: 'no_handler' });
    await s.pglite.query("update jobs set state = 'done', finished_at = now() where id = $1", [id]);
  });

  it('runs a job again when its worker stopped holding it, with the same id (T-137)', async () => {
    const id = await s.record();
    const seen: QueuedJob[] = [];
    // The first attempt's lease is taken from it while it works (it stalled, its lease
    // ran out and the job was taken again): its result is not kept, and the job,
    // whose new lease has run out too, is run again.
    await queue().runDue({
      'email.send': async (job) => {
        seen.push(job);
        if (job.attempt > 1) return;
        await s.pglite.query(
          "update jobs set lease_token = gen_random_uuid(), lease_expires_at = now() - interval '1 second' where id = $1",
          [id],
        );
      },
    });
    expect(s.lines.at(-2)).toMatchObject({ jobId: id, attempt: 1, outcome: 'lease-lost' });
    expect(s.lines.at(-1)).toMatchObject({ jobId: id, attempt: 2, outcome: 'done' });
    expect(seen.map((job) => [job.id, job.attempt])).toEqual([
      [id, 1],
      [id, 2],
    ]);
    expect(await s.row(id)).toMatchObject({ state: 'done', attempts: 2 });
  });

  it('once started, runs jobs as they come due, and stops after the one in hand', async () => {
    const running = tableQueue(s.db, { pollMs: 20 });
    const done: string[] = [];
    await running.start({ 'email.send': async (job) => void done.push(job.id) });
    await expect(running.start({})).rejects.toThrow('already been started');
    const first = await s.record();
    const second = await s.record();
    await eventually(() => done.length === 2);
    expect(done).toEqual([first, second]);
    await running.stop();
    const after = await s.record();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(done).toHaveLength(2);
    expect((await s.row(after)).state).toBe('waiting');
  });
});
