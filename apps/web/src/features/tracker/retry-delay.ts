// How long the queue waits before sending again after a send got no answer: doubling
// from a second up to half a minute, so a long outage costs two requests a minute, and
// spread a little at random so the trackers in one gym do not all knock at once.

export type RetryTiming = {
  /** The wait after the first failure. */
  readonly firstMs: number;
  /** The longest wait, however long the outage. */
  readonly longestMs: number;
};

export const defaultRetryTiming: RetryTiming = { firstMs: 1_000, longestMs: 30_000 };

/**
 * The wait after `failures` sends in a row got no answer (1 or more). `random` is a
 * number from 0 to 1; the wait is between half and all of the doubled delay.
 */
export function retryDelayMs(
  failures: number,
  random: number,
  timing: RetryTiming = defaultRetryTiming,
): number {
  const doublings = Math.min(Math.max(failures, 1) - 1, 30);
  const full = Math.min(timing.longestMs, timing.firstMs * 2 ** doublings);
  const spread = Math.min(Math.max(random, 0), 1);
  return Math.round(full * (0.5 + spread / 2));
}
