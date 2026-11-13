// Counts failures per key and says when the next try may come (T-85: wrong guesses
// are limited, then slowed and locked for a while). The local stand-in uses it for
// password guesses per address typed and per network address, and for code requests.
// The in-memory store behind the Supabase adapter uses it too. In memory only: not
// for production.
import type { AttemptLimits } from '../sign-in-settings.ts';

export type { AttemptLimits };

export type AttemptCheck =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterSeconds: number };

export type AttemptLimiter = {
  readonly check: (key: string) => AttemptCheck;
  /**
   * Counts a failure now and returns a way to take it back. A caller counts the try
   * before it awaits anything and takes it back if the try turns out right, so tries
   * made in parallel cannot all slip under the limit together.
   */
  readonly recordFailure: (key: string) => () => void;
  readonly clear: (key: string) => void;
};

const minute = 60_000;

type Failure = { readonly at: number };

export function createAttemptLimiter(limits: AttemptLimits, now: () => Date): AttemptLimiter {
  const failures = new Map<string, Failure[]>();
  const locks = new Map<string, { until: number; by: Failure }>();

  const recent = (key: string, at: number): Failure[] => {
    const kept = (failures.get(key) ?? []).filter((f) => at - f.at < limits.windowMinutes * minute);
    if (kept.length) failures.set(key, kept);
    else failures.delete(key);
    return kept;
  };

  const wait = (until: number, at: number) => ({
    allowed: false as const,
    retryAfterSeconds: Math.max(1, Math.ceil((until - at) / 1000)),
  });

  return {
    check(key) {
      const at = now().getTime();
      const lock = locks.get(key);
      if (lock !== undefined) {
        if (at < lock.until) return wait(lock.until, at);
        locks.delete(key);
        failures.delete(key);
      }
      const kept = recent(key, at);
      const last = kept[kept.length - 1];
      if (last !== undefined && kept.length >= limits.slowAfter) {
        const until = last.at + limits.slowSeconds * 1000;
        if (at < until) return wait(until, at);
      }
      return { allowed: true };
    },
    recordFailure(key) {
      const failure: Failure = { at: now().getTime() };
      const kept = [...recent(key, failure.at), failure];
      failures.set(key, kept);
      if (kept.length >= limits.lockAfter) {
        locks.set(key, { until: failure.at + limits.lockMinutes * minute, by: failure });
      }
      return () => {
        const list = failures.get(key);
        if (list)
          failures.set(
            key,
            list.filter((f) => f !== failure),
          );
        if (locks.get(key)?.by === failure) locks.delete(key);
      };
    },
    clear(key) {
      failures.delete(key);
      locks.delete(key);
    },
  };
}
