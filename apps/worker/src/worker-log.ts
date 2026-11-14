// The worker's log lines (T-196), through the observability logger, which redacts
// everything (T-86). Each line holds ids, fixed words and codes only: a queue fault
// gives its kind and a fixed code, never its message, which may hold an address.
import { errorCodeOf, type JobRunLine } from '@srleagues/core';
import type { Logger } from '@srleagues/observability';

/** For the queue's onError: looking for jobs failed (the database or pg-boss unreachable). */
export function queueErrorLogger(logger: Logger): (error: unknown) => void {
  return (error) => {
    const kind = error instanceof Error ? error.name : typeof error;
    logger.error('worker.queue_error', { kind, errorCode: errorCodeOf(error) });
  };
}

/** For the queue's log: what became of each job; a failed job at error level, a retry at warn. */
export function jobLogger(logger: Logger): (line: JobRunLine) => void {
  return (line) => {
    const level = line.outcome === 'failed' ? 'error' : line.outcome === 'retry' ? 'warn' : 'info';
    logger[level]('worker.job', {
      jobId: line.jobId,
      type: line.type,
      leagueId: line.leagueId,
      attempt: line.attempt,
      outcome: line.outcome,
      ...(line.errorCode === undefined ? {} : { errorCode: line.errorCode }),
    });
  };
}
