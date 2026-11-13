import { describe, expect, it } from 'vitest';
import { createAttemptLimiter } from './attempt-limiter.ts';

const limits = { windowMinutes: 15, slowAfter: 3, slowSeconds: 30, lockAfter: 5, lockMinutes: 15 };

function clock() {
  let at = Date.UTC(2026, 10, 13, 12);
  return { now: () => new Date(at), advance: (seconds: number) => (at += seconds * 1000) };
}

describe('attempt limiter', () => {
  it('allows tries until the slow-down count, then makes each wait after the last failure', () => {
    const time = clock();
    const limiter = createAttemptLimiter(limits, time.now);
    limiter.recordFailure('a');
    limiter.recordFailure('a');
    expect(limiter.check('a')).toEqual({ allowed: true });
    limiter.recordFailure('a');
    expect(limiter.check('a')).toEqual({ allowed: false, retryAfterSeconds: 30 });
    time.advance(29);
    expect(limiter.check('a')).toEqual({ allowed: false, retryAfterSeconds: 1 });
    time.advance(1);
    expect(limiter.check('a')).toEqual({ allowed: true });
  });

  it('locks at the lock count and opens again with a clean slate', () => {
    const time = clock();
    const limiter = createAttemptLimiter(limits, time.now);
    for (let i = 0; i < 5; i++) {
      limiter.recordFailure('a');
      time.advance(31);
    }
    expect(limiter.check('a')).toEqual({ allowed: false, retryAfterSeconds: 15 * 60 - 31 });
    time.advance(15 * 60);
    expect(limiter.check('a')).toEqual({ allowed: true });
    limiter.recordFailure('a');
    expect(limiter.check('a')).toEqual({ allowed: true });
  });

  it('forgets failures older than the window', () => {
    const time = clock();
    const limiter = createAttemptLimiter(limits, time.now);
    for (let i = 0; i < 4; i++) limiter.recordFailure('a');
    time.advance(15 * 60);
    limiter.recordFailure('a');
    expect(limiter.check('a')).toEqual({ allowed: true });
  });

  it('keeps keys apart and clears one on request', () => {
    const time = clock();
    const limiter = createAttemptLimiter(limits, time.now);
    for (let i = 0; i < 5; i++) limiter.recordFailure('a');
    expect(limiter.check('b')).toEqual({ allowed: true });
    limiter.clear('a');
    expect(limiter.check('a')).toEqual({ allowed: true });
  });

  it('takes back one counted failure, and the lock it set, without touching the others', () => {
    const time = clock();
    const limiter = createAttemptLimiter(limits, time.now);
    for (let i = 0; i < 4; i++) limiter.recordFailure('a');
    const forgive = limiter.recordFailure('a');
    expect(limiter.check('a').allowed).toBe(false);
    forgive();
    // Four left: past the slow-down count, but no lock.
    expect(limiter.check('a')).toEqual({ allowed: false, retryAfterSeconds: 30 });
    time.advance(30);
    expect(limiter.check('a')).toEqual({ allowed: true });
    forgive();
    expect(limiter.check('a')).toEqual({ allowed: true });
  });
});
