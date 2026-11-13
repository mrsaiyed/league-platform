// The jobs table as both queues use it: taking due jobs (one transaction with no
// league, through take_jobs) and settling one (a transaction for its own league).
import type { JobRunLine } from '@srleagues/core';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { settleJob, takeJobs, type JobSettlement, type TakenJob } from '../queries/index.ts';

export const takeDue = (db: DatabaseHandle, howMany: number, leaseSeconds: number) =>
  withTransaction(db, {}, (scope) => takeJobs(scope, howMany, leaseSeconds));

/** Settles `job` and says how it went, as a log line. */
export async function settle(
  db: DatabaseHandle,
  job: TakenJob,
  settlement: JobSettlement,
): Promise<JobRunLine> {
  const kept = await withTransaction(db, { leagueId: job.leagueId }, (scope) =>
    settleJob(scope, job.id, job.leaseToken, settlement),
  );
  return {
    jobId: job.id,
    type: job.type,
    leagueId: job.leagueId,
    attempt: job.attempt,
    outcome: kept ? settlement.outcome : 'lease-lost',
    ...('errorCode' in settlement ? { errorCode: settlement.errorCode } : {}),
  };
}

/** Thrown for a job whose type no handler is given: tried again, then failed. */
export const noHandler = Object.freeze({ code: 'no_handler', retryable: true });

/** Options both queues take. */
export type QueueOptions = {
  /** How long a worker holds a job before another may take it. Default 15 minutes. */
  readonly leaseSeconds?: number;
  /** How often to look for due jobs. Default 1 second. */
  readonly pollMs?: number;
  /** Told what became of each job. Must not throw. */
  readonly log?: (line: JobRunLine) => void;
  /** Told when looking for jobs failed (the database was unreachable). Must not throw. */
  readonly onError?: (error: unknown) => void;
};

/**
 * Calls `tick` every `pollMs` until stopped; `stop` waits for the tick under way.
 * A failing tick is reported and the loop goes on.
 */
export function pollEvery(
  pollMs: number,
  tick: (stopping: () => boolean) => Promise<unknown>,
  onError: (error: unknown) => void,
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> = Promise.resolve();
  const loop = () => {
    running = tick(() => stopped)
      .then(
        () => undefined,
        (error: unknown) => {
          try {
            onError(error);
          } catch {
            // The reporter's own fault must not stop the worker.
          }
        },
      )
      .then(() => {
        if (!stopped) timer = setTimeout(loop, pollMs);
      });
  };
  loop();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await running;
  };
}
