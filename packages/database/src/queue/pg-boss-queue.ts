// The queue for staging and production (T-7, record 012). Commands record jobs in
// the jobs table as everywhere else (T-130, behind the league fence). This worker
// hands each due job over to pg-boss, under the job's own id, and pg-boss runs it:
// leases, retries with growing waits, the failed list, several workers at once.
//
// The handover is safe to repeat (T-137): pg-boss keeps one job per id, so a worker
// that crashes after handing a job over but before marking it, hands it over again
// later and pg-boss ignores the second copy. What pg-boss is given is the job's
// league and ids, never content (T-131).
//
// Not verified against a hosted PostgreSQL: tested on PGlite only, which pg-boss
// supports as a backend of its own (pg-boss 12.38.0, PGlite 0.5.12).
import {
  afterFailure,
  maxJobAttempts,
  type JobHandlers,
  type JobRunLine,
  type WorkQueue,
} from '@srleagues/core';
import type { JobResult, PgBoss } from 'pg-boss';
import { z } from 'zod';
import type { DatabaseHandle } from '../db/database-handle.ts';
import type { JobSettlement } from '../queries/index.ts';
import { noHandler, pollEvery, settle, takeDue, type QueueOptions } from './job-table.ts';

export type PgBossQueue = WorkQueue & {
  /** Hands every job due now over to pg-boss and returns how many it handed over. */
  readonly relayDue: () => Promise<number>;
};

export type PgBossQueueOptions = QueueOptions & {
  /** How often each pg-boss worker looks for jobs, in seconds (at least 0.5). Default 2. */
  readonly pollingIntervalSeconds?: number;
  /** How long `stop` waits for running jobs, in ms. Default 30 seconds. */
  readonly stopTimeoutMs?: number;
};

/** What pg-boss holds for a job: its league and ids. */
const jobData = z.object({
  leagueId: z.uuid(),
  ids: z.record(z.string(), z.string()),
});

/** Jobs handed over per look at the jobs table. */
const relayBatch = 50;
/** How long a handover holds a job: a moment, so a worker that dies mid-handover delays it little. */
const handoverLeaseSeconds = 60;

export function pgBossQueue(
  db: DatabaseHandle,
  boss: PgBoss,
  options: PgBossQueueOptions = {},
): PgBossQueue {
  const leaseSeconds = options.leaseSeconds ?? 15 * 60;
  const onError = options.onError ?? (() => {});
  const log = (line: JobRunLine) => {
    try {
      options.log?.(line);
    } catch {
      // A broken log must not stop the queue.
    }
  };
  // pg-boss reports its own troubles as 'error' events; with no listener, Node ends
  // the process.
  boss.on('error', (error) => {
    try {
      onError(error);
    } catch {
      // The reporter's own fault must not end the worker.
    }
  });
  let types = new Set<string>();
  let stopRelay: (() => Promise<void>) | undefined;

  async function relayDue(stopping = () => false): Promise<number> {
    let handed = 0;
    while (!stopping()) {
      const jobs = await takeDue(db, relayBatch, handoverLeaseSeconds);
      for (const job of jobs) {
        let settlement: JobSettlement;
        if (!types.has(job.type)) {
          settlement = afterFailure(noHandler, job.attempt, job.maxAttempts);
        } else {
          try {
            // null when pg-boss already has it (an earlier handover): handed over either way.
            await boss.send(job.type, { leagueId: job.leagueId, ids: job.ids }, { id: job.id });
            settlement = { outcome: 'handed-over' };
          } catch (error) {
            settlement = afterFailure(error, job.attempt, job.maxAttempts);
          }
        }
        const line = await settle(db, job, settlement);
        log(line);
        if (line.outcome === 'handed-over') handed++;
      }
      if (jobs.length < relayBatch) break;
    }
    return handed;
  }

  async function work(type: string, handlers: JobHandlers) {
    const handler = handlers[type];
    if (handler === undefined) return;
    await boss.createQueue(type, {
      retryLimit: maxJobAttempts - 1,
      retryDelay: 120,
      retryBackoff: true,
      retryDelayMax: 2400,
      expireInSeconds: leaseSeconds,
    });
    await boss.work(
      type,
      {
        batchSize: 1,
        perJobResults: true,
        pollingIntervalSeconds: options.pollingIntervalSeconds ?? 2,
      },
      async (jobs): Promise<JobResult[]> => {
        const results: JobResult[] = [];
        for (const job of jobs) {
          const attempt = job.retryCount + 1;
          const data = jobData.safeParse(job.data);
          if (!data.success) {
            // Not a job this worker recorded: off to the failed list, no retries.
            results.push({ id: job.id, status: 'deadletter', output: { code: 'bad_job_data' } });
            continue;
          }
          const { leagueId, ids } = data.data;
          const base = { jobId: job.id, type, leagueId, attempt };
          try {
            await handler({ id: job.id, type, leagueId, ids, attempt });
            results.push({ id: job.id, status: 'completed' });
            log({ ...base, outcome: 'done' });
          } catch (error) {
            const after = afterFailure(error, attempt, maxJobAttempts);
            results.push({
              id: job.id,
              status: after.outcome === 'failed' ? 'deadletter' : 'failed',
              output: { code: after.errorCode },
            });
            log({ ...base, outcome: after.outcome, errorCode: after.errorCode });
          }
        }
        return results;
      },
    );
  }

  return {
    kind: 'pg-boss',
    relayDue: () => relayDue(),
    start: async (handlers) => {
      if (stopRelay !== undefined) throw new Error('This queue has already been started.');
      types = new Set(Object.keys(handlers));
      await boss.start();
      for (const type of types) await work(type, handlers);
      stopRelay = pollEvery(
        options.pollMs ?? 1000,
        (stopping) => relayDue(stopping),
        onError,
        options.onPolled,
      );
    },
    stop: async () => {
      if (stopRelay === undefined) return; // never started
      await stopRelay();
      await boss.stop({ graceful: true, timeout: options.stopTimeoutMs ?? 30_000 });
    },
  };
}
