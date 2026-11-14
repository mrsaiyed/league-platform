// The queue for local work and tests (record 012): jobs run straight from the jobs
// table, one at a time. A job is leased while it runs; done, it is marked done; if
// its handler throws, it waits and is tried again, about five times over an hour,
// then goes to the failed list (T7 §5). A worker that stops or crashes mid-job lets
// its lease run out, and the job is taken again (T-137). `runDue` runs whatever is
// due now and returns, so a test needs no timers.
import { afterFailure, type JobHandlers, type QueuedJob, type WorkQueue } from '@srleagues/core';
import type { DatabaseHandle } from '../db/database-handle.ts';
import type { JobSettlement, TakenJob } from '../queries/index.ts';
import { noHandler, pollEvery, settle, takeDue, type QueueOptions } from './job-table.ts';

export type TableQueue = WorkQueue & {
  /** Runs every job due now, one at a time, and returns how many ran. */
  readonly runDue: (handlers: JobHandlers) => Promise<number>;
};

/** Rounds of `runDue` before it stops anyway: jobs that keep making due jobs. */
const maxRounds = 1000;

export function tableQueue(db: DatabaseHandle, options: QueueOptions = {}): TableQueue {
  const leaseSeconds = options.leaseSeconds ?? 15 * 60;
  const log = options.log ?? (() => {});
  let stop: (() => Promise<void>) | undefined;

  async function runOne(job: TakenJob, handlers: JobHandlers): Promise<void> {
    const handler = Object.hasOwn(handlers, job.type) ? handlers[job.type] : undefined;
    const queued: QueuedJob = {
      id: job.id,
      type: job.type,
      leagueId: job.leagueId,
      ids: job.ids,
      attempt: job.attempt,
    };
    let settlement: JobSettlement;
    if (handler === undefined) {
      settlement = afterFailure(noHandler, job.attempt, job.maxAttempts);
    } else {
      try {
        await handler(queued);
        settlement = { outcome: 'done' };
      } catch (error) {
        settlement = afterFailure(error, job.attempt, job.maxAttempts);
      }
    }
    const line = await settle(db, job, settlement);
    try {
      log(line);
    } catch {
      // A broken log must not stop the queue.
    }
  }

  async function runDue(handlers: JobHandlers, stopping = () => false): Promise<number> {
    let ran = 0;
    for (let round = 0; round < maxRounds && !stopping(); round++) {
      const [job] = await takeDue(db, 1, leaseSeconds);
      if (job === undefined) break;
      await runOne(job, handlers);
      ran++;
    }
    return ran;
  }

  return {
    kind: 'table',
    runDue: (handlers) => runDue(handlers),
    start: async (handlers) => {
      if (stop !== undefined) throw new Error('This queue has already been started.');
      stop = pollEvery(
        options.pollMs ?? 1000,
        (stopping) => runDue(handlers, stopping),
        options.onError ?? (() => {}),
        options.onPolled,
      );
    },
    stop: async () => {
      await stop?.();
    },
  };
}
