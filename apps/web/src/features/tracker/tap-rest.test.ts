// The controls that rest for a moment (tap-rest.ts), on a clock the test moves by hand:
// when a tap is taken and when it is not, and what the screen is told to draw meanwhile.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clockToggleTap,
  createTapRest,
  restMs,
  takeBackTimeoutTap,
  tapTaken,
  type RestTimers,
  type Tap,
} from './tap-rest.ts';

/** The test's own clock and timers: vitest's, moved with `vi.advanceTimersByTime`. */
const timers: RestTimers = {
  now: () => Date.now(),
  after: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
};
const finger = (at = Date.now()): Tap => ({ at, keyboard: false });
const key = (at = Date.now()): Tap => ({ at, keyboard: true });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a control that rests', () => {
  it('takes every tap until it is told to rest', () => {
    const rest = createTapRest(timers);
    expect(rest.ready()).toBe(true);
    expect(tapTaken(rest, finger())).toBe(true);
  });

  it('takes no tap for a third of a second, and shows not ready for exactly as long', () => {
    const drawn: boolean[] = [];
    const rest = createTapRest(timers, () => drawn.push(rest.ready()));
    rest.begin();
    // Drawn not ready at once.
    expect(drawn).toEqual([false]);
    vi.advanceTimersByTime(340);
    expect(rest.ready()).toBe(false);
    expect(tapTaken(rest, finger())).toBe(false);
    vi.advanceTimersByTime(20);
    // 360 ms on: drawn ready again, and a tap is taken.
    expect(drawn).toEqual([false, true]);
    expect(rest.ready()).toBe(true);
    expect(tapTaken(rest, finger())).toBe(true);
    expect(restMs).toBe(350);
  });

  it('reads a tap by when the finger made it, not by when the page got round to it', () => {
    const rest = createTapRest(timers);
    rest.begin();
    const early = finger(Date.now() + 200);
    const late = finger(Date.now() + 400);
    // A slow tablet hands both taps over late: the first was still made too soon.
    vi.advanceTimersByTime(1_000);
    expect(tapTaken(rest, early)).toBe(false);
    expect(tapTaken(rest, late)).toBe(true);
  });

  it('rests from the moment it is given, and again when it is told again', () => {
    const rest = createTapRest(timers);
    // The tap that began it was made 100 ms ago: 250 ms are left.
    rest.begin(Date.now() - 100);
    vi.advanceTimersByTime(240);
    expect(rest.ready()).toBe(false);
    rest.begin();
    vi.advanceTimersByTime(340);
    expect(rest.ready()).toBe(false);
    expect(tapTaken(rest, finger())).toBe(false);
    vi.advanceTimersByTime(20);
    expect(rest.ready()).toBe(true);
  });

  it('always takes Enter and Space: a key is pressed on the control that has the keyboard', () => {
    const rest = createTapRest(timers);
    rest.begin();
    expect(tapTaken(rest, key())).toBe(true);
    expect(tapTaken(rest, finger())).toBe(false);
  });

  it('draws nothing more once the screen is gone', () => {
    const drawn: boolean[] = [];
    const rest = createTapRest(timers, () => drawn.push(rest.ready()));
    rest.begin();
    rest.stop();
    vi.advanceTimersByTime(1_000);
    expect(drawn).toEqual([false]);
    expect(rest.ready()).toBe(true);
  });
});

describe('Start and Pause under the scoreboard (the code review, M-a)', () => {
  it('a double tap on Start starts the clock once: the second tap is not a tap on Pause', () => {
    const rest = createTapRest(timers);
    expect(clockToggleTap('start', rest, finger())).toEqual({ type: 'start' });
    // The device has kept the tap and the button now says Pause; the second touch of the
    // double tap lands on it 100, 150 and 250 ms after the first.
    for (const later of [100, 50, 100]) {
      vi.advanceTimersByTime(later);
      expect(clockToggleTap('pause', rest, finger())).toBeNull();
      expect(rest.ready()).toBe(false);
    }
    // Once it has rested, Pause is Pause.
    vi.advanceTimersByTime(110);
    expect(rest.ready()).toBe(true);
    expect(clockToggleTap('pause', rest, finger())).toEqual({ type: 'pause' });
  });

  it('and a double tap on Pause pauses it once: the second tap is not a tap on Start', () => {
    const rest = createTapRest(timers);
    expect(clockToggleTap('pause', rest, finger())).toEqual({ type: 'pause' });
    vi.advanceTimersByTime(150);
    expect(clockToggleTap('start', rest, finger())).toBeNull();
    vi.advanceTimersByTime(210);
    expect(clockToggleTap('start', rest, finger())).toEqual({ type: 'start' });
  });

  it('rests again when its word changes, however late the device kept the tap', () => {
    const rest = createTapRest(timers);
    expect(clockToggleTap('start', rest, finger())).not.toBeNull();
    // A slow tablet: the word changes 300 ms after the tap, and the screen begins the
    // rest again. A tap 100 ms after the change is still not taken.
    vi.advanceTimersByTime(300);
    rest.begin();
    vi.advanceTimersByTime(100);
    expect(clockToggleTap('pause', rest, finger())).toBeNull();
    vi.advanceTimersByTime(260);
    expect(clockToggleTap('pause', rest, finger())).toEqual({ type: 'pause' });
  });

  it('Enter and Space are always taken', () => {
    const rest = createTapRest(timers);
    expect(clockToggleTap('start', rest, key())).toEqual({ type: 'start' });
    expect(clockToggleTap('pause', rest, key())).toEqual({ type: 'pause' });
  });
});

describe('− on a team’s timeouts (the area 4 review, M2)', () => {
  it('a fast double tap takes one timeout back, never two', () => {
    const rest = createTapRest(timers);
    expect(takeBackTimeoutTap('home', rest, finger())).toEqual({ type: 'untimeout', side: 'home' });
    // The second touch of a double tap, 90 ms on: not taken, and − shows it is resting.
    vi.advanceTimersByTime(90);
    expect(takeBackTimeoutTap('home', rest, finger())).toBeNull();
    expect(rest.ready()).toBe(false);
    // A tap that is not taken does not start the rest again.
    vi.advanceTimersByTime(270);
    expect(rest.ready()).toBe(true);
  });

  it('two deliberate taps take two back', () => {
    const rest = createTapRest(timers);
    expect(takeBackTimeoutTap('away', rest, finger())).not.toBeNull();
    vi.advanceTimersByTime(400);
    expect(takeBackTimeoutTap('away', rest, finger())).toEqual({ type: 'untimeout', side: 'away' });
    // And it rests again from the second.
    vi.advanceTimersByTime(100);
    expect(takeBackTimeoutTap('away', rest, finger())).toBeNull();
  });

  it('rests for the other team’s − too: the two are side by side', () => {
    const rest = createTapRest(timers);
    expect(takeBackTimeoutTap('home', rest, finger())).not.toBeNull();
    vi.advanceTimersByTime(90);
    expect(takeBackTimeoutTap('away', rest, finger())).toBeNull();
  });
});
