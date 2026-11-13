import { describe, expect, it } from 'vitest';
import { retryDelayMs } from './retry-delay.ts';

describe('retry delay', () => {
  it('doubles from a second up to half a minute', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 50].map((n) => retryDelayMs(n, 1))).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000,
    ]);
  });

  it('spreads each wait between half and all of it', () => {
    expect(retryDelayMs(3, 0)).toBe(2_000);
    expect(retryDelayMs(3, 0.5)).toBe(3_000);
  });

  it('keeps odd inputs inside the bounds', () => {
    expect(retryDelayMs(0, 1)).toBe(1_000);
    expect(retryDelayMs(-4, 2)).toBe(1_000);
    expect(retryDelayMs(Number.MAX_SAFE_INTEGER, -1)).toBe(15_000);
    expect(retryDelayMs(2, 1, { firstMs: 10, longestMs: 15 })).toBe(15);
  });
});
