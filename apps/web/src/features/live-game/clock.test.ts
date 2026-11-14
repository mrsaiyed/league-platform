import { describe, expect, it } from 'vitest';
import {
  clockIsRunning,
  clockRemainingMs,
  formatClock,
  largestOffsetMs,
  serverOffsetMs,
} from './clock.ts';

const running = { state: 'running', remainingMs: 462_000, asOf: 1_000_000 } as const;

describe('clock reference', () => {
  it('counts down from the reference instant', () => {
    expect(clockRemainingMs(running, 1_000_000)).toBe(462_000);
    expect(clockRemainingMs(running, 1_010_000)).toBe(452_000);
  });
  it('does not move while stopped', () => {
    const stopped = { state: 'stopped', remainingMs: 462_000 } as const;
    expect(clockRemainingMs(stopped, 9_999_999)).toBe(462_000);
    expect(clockIsRunning(stopped, 9_999_999)).toBe(false);
  });
  it('stops at zero and never goes negative', () => {
    expect(clockRemainingMs(running, 2_000_000)).toBe(0);
    expect(clockIsRunning(running, 2_000_000)).toBe(false);
    expect(clockIsRunning(running, 1_100_000)).toBe(true);
  });
  it('keeps the largest offset measured: a slow arrival never lowers it', () => {
    const first = serverOffsetMs(1_000_000, 500); // arrived after 500 ms in transit
    expect(largestOffsetMs(first, 2_000_000, 1_000_100)).toBe(999_900); // a quicker one raises it
    expect(largestOffsetMs(999_900, 3_000_000, 2_003_000)).toBe(999_900); // a slow one does not
  });
  it('does not run backwards when the device is slightly behind', () => {
    expect(clockRemainingMs(running, 999_000)).toBe(462_000);
  });
  it('gives the same time on devices whose own clocks disagree', () => {
    const serverNow = 1_030_000;
    const times = [0, 5_000_000, -3_000_000, 123_456].map((skew) => {
      const deviceNow = serverNow + skew;
      const offset = serverOffsetMs(1_000_250, 1_000_250 + skew);
      return clockRemainingMs(running, deviceNow + offset);
    });
    expect(new Set(times)).toEqual(new Set([432_000]));
  });
  it('formats minutes and seconds, rounding up', () => {
    expect(formatClock(462_000)).toBe('7:42');
    expect(formatClock(461_001)).toBe('7:42');
    expect(formatClock(59_000)).toBe('0:59');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-5)).toBe('0:00');
  });
  it('reads a bad number as zero', () => {
    expect(formatClock(Number.NaN)).toBe('0:00');
  });
});
