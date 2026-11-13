// The worker's side of the queue (T7 §1, record 012). Commands record jobs through
// tx.jobs (command/ports.ts); the worker takes them back out and gives each to the
// handler for its type. packages/database supplies the queue (the jobs table on its
// own, or with pg-boss running the jobs); apps/worker plugs the handlers in.

/** A job as its handler receives it: ids, never content (T-131). */
export type QueuedJob = {
  /** The same on every attempt, so a handler can tell it has seen this job (T-137). */
  readonly id: string;
  readonly type: string;
  readonly leagueId: string;
  readonly ids: Readonly<Record<string, string>>;
  /** 1 on the first run, then 2, 3... */
  readonly attempt: number;
};

/**
 * Carries out one job. Resolves when done. Throws to have it tried again later, or
 * throws an error whose `retryable` is false to fail it at once (job-failures.ts).
 * May run more than once for one job, so it must be safe to run twice (T-137).
 */
export type JobHandler = (job: QueuedJob) => Promise<void>;

/** The handler for each job type, by type. */
export type JobHandlers = Readonly<Record<string, JobHandler>>;

/** What became of one run of a job: ids and a fixed code only (T-86, T-196). */
export type JobRunLine = {
  readonly jobId: string;
  readonly type: string;
  readonly leagueId: string;
  readonly attempt: number;
  /**
   * done; retry: tried again later; failed: on the failed list; handed-over: given
   * to pg-boss to run; lease-lost: another worker took it meanwhile.
   */
  readonly outcome: 'done' | 'retry' | 'failed' | 'handed-over' | 'lease-lost';
  readonly errorCode?: string;
};

/** A queue the worker runs (T7 §1, §9). */
export type WorkQueue = {
  /** Which implementation, for the worker's startup line. */
  readonly kind: 'table' | 'pg-boss';
  /** Starts taking jobs and giving each to the handler for its type. Call once. */
  readonly start: (handlers: JobHandlers) => Promise<void>;
  /** Stops taking jobs and waits for the ones it holds to finish (T7 §9). */
  readonly stop: () => Promise<void>;
};
