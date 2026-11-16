// The running clock's timer (clock-ticker.ts), on timers the test moves by hand: how often
// the clock is read, what happens while the page is hidden, and that the end of a period
// is said once, when the page is there to say it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClockTicker, tickMs, type ClockTickerDeps } from './clock-ticker.ts';

/** A clock that runs out `runsFor` ms after the test began, and what the ticker did. */
function running(runsFor: number) {
  const began = Date.now();
  const seen = { paints: 0, ranOut: 0, timers: 0 };
  const deps: ClockTickerDeps = {
    paint: () => {
      seen.paints += 1;
      return Date.now() - began < runsFor;
    },
    ranOut: () => (seen.ranOut += 1),
    every: (ms, run) => {
      seen.timers += 1;
      const timer = setInterval(run, ms);
      return () => {
        seen.timers -= 1;
        clearInterval(timer);
      };
    },
  };
  return { deps, seen };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(500_000);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the running clock’s timer', () => {
  it('reads the clock four times a second while the page is shown', () => {
    const { deps, seen } = running(60_000);
    const ticker = createClockTicker(deps, true);
    expect(tickMs).toBe(250);
    vi.advanceTimersByTime(1_000);
    expect(seen.paints).toBe(4);
    ticker.stop();
    vi.advanceTimersByTime(1_000);
    expect(seen).toEqual({ paints: 4, ranOut: 0, timers: 0 });
  });

  it('says the clock ran out once, and then reads no more', () => {
    const { deps, seen } = running(1_100);
    createClockTicker(deps, true);
    vi.advanceTimersByTime(1_000);
    expect(seen.ranOut).toBe(0);
    vi.advanceTimersByTime(250);
    expect(seen).toEqual({ paints: 5, ranOut: 1, timers: 0 });
    vi.advanceTimersByTime(5_000);
    expect(seen).toEqual({ paints: 5, ranOut: 1, timers: 0 });
  });

  it('puts its timer down while the page is hidden, and reads at once when it is shown again', () => {
    const { deps, seen } = running(600_000);
    const ticker = createClockTicker(deps, true);
    vi.advanceTimersByTime(500);
    expect(seen.paints).toBe(2);
    ticker.shown(false);
    // Hidden for a minute: nothing is read, and no timer is left for a browser to slow.
    vi.advanceTimersByTime(60_000);
    expect(seen).toEqual({ paints: 2, ranOut: 0, timers: 0 });
    // Shown again: read in that moment, not a quarter of a second later, then as before.
    ticker.shown(true);
    expect(seen).toEqual({ paints: 3, ranOut: 0, timers: 1 });
    vi.advanceTimersByTime(500);
    expect(seen.paints).toBe(5);
    // Told twice that it is shown (two events for one return): still one timer.
    ticker.shown(true);
    expect(seen.timers).toBe(1);
  });

  it('a period that ended while the page was hidden is said the moment it is shown, once', () => {
    const { deps, seen } = running(10_000);
    const ticker = createClockTicker(deps, true);
    vi.advanceTimersByTime(1_000);
    ticker.shown(false);
    // The clock runs out with the phone locked: nothing is said to nobody.
    vi.advanceTimersByTime(120_000);
    expect(seen.ranOut).toBe(0);
    ticker.shown(true);
    expect(seen.ranOut).toBe(1);
    expect(seen.timers).toBe(0);
    // And never a second time.
    ticker.shown(false);
    ticker.shown(true);
    vi.advanceTimersByTime(5_000);
    expect(seen.ranOut).toBe(1);
  });

  it('opened on a hidden page, it waits until the page is shown', () => {
    const { deps, seen } = running(60_000);
    const ticker = createClockTicker(deps, false);
    vi.advanceTimersByTime(2_000);
    expect(seen).toEqual({ paints: 0, ranOut: 0, timers: 0 });
    ticker.shown(true);
    expect(seen).toEqual({ paints: 1, ranOut: 0, timers: 1 });
  });

  it('once stopped, says nothing even if the page is shown again', () => {
    const { deps, seen } = running(1_000);
    const ticker = createClockTicker(deps, true);
    ticker.stop();
    vi.advanceTimersByTime(5_000);
    ticker.shown(true);
    expect(seen).toEqual({ paints: 0, ranOut: 0, timers: 0 });
  });
});
