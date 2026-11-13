// What happens when a job's handler throws (T7 §5): it is tried again with growing
// waits, about five attempts over an hour, then goes to the failed list. An error
// that says it cannot succeed (`retryable: false`) fails it at once. What is kept
// of the error is a fixed code, never its message, which may carry personal content
// such as an email address (T-86).

/** Attempts a job gets in all. */
export const maxJobAttempts = 5;

/** Seconds to wait after attempt 1, 2, 3 and 4 fail: 2, 5, 15 and 40 minutes. */
const waits = [120, 300, 900, 2400] as const;

/** How long to wait after `attempt` failed before trying again. */
export function jobRetryWaitSeconds(attempt: number): number {
  return waits[Math.min(Math.max(Math.floor(attempt), 1), waits.length) - 1] ?? waits[3];
}

/**
 * Every code a job's failure is kept as: the queue's own, and EmailSendError's. The
 * jobs table accepts these and no others (0006, jobs_last_error_known); a test in
 * packages/database fails when the lists differ.
 */
export const jobErrorCodes = [
  'bad_job_data',
  'lease_expired',
  'no_handler',
  'not-authorized',
  'rate-limited',
  'rejected',
  'unavailable',
  'unexpected',
  'unexpected-answer',
] as const;

export type JobErrorCode = (typeof jobErrorCodes)[number];

const knownCodes: ReadonlySet<string> = new Set(jobErrorCodes);

/**
 * The code for what went wrong: the error's own `code` when it is one of
 * jobErrorCodes (as EmailSendError's are), else `unexpected`. Never its message.
 */
export function errorCodeOf(error: unknown): JobErrorCode {
  if (typeof error === 'object' && error !== null) {
    const { code } = error as { code?: unknown };
    if (typeof code === 'string' && knownCodes.has(code)) return code as JobErrorCode;
  }
  return 'unexpected';
}

export type AfterFailure =
  | { readonly outcome: 'retry'; readonly inSeconds: number; readonly errorCode: JobErrorCode }
  | { readonly outcome: 'failed'; readonly errorCode: JobErrorCode };

/** What to do with a job whose attempt `attempt` (of `maxAttempts`) threw `error`. */
export function afterFailure(error: unknown, attempt: number, maxAttempts: number): AfterFailure {
  const errorCode = errorCodeOf(error);
  const retryable = !(
    typeof error === 'object' &&
    error !== null &&
    (error as { retryable?: unknown }).retryable === false
  );
  if (!retryable || attempt >= maxAttempts) return { outcome: 'failed', errorCode };
  return { outcome: 'retry', inSeconds: jobRetryWaitSeconds(attempt), errorCode };
}
