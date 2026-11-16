// The controls that rest for a moment (tap-rest.ts), on a clock the test moves by hand:
// when a tap is taken and when it is not, and what the screen is told to draw meanwhile.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clockToggleTap,
  createTapRest,
  drawRest,
  restMs,
  startBarTap,
  takeBackRestMs,
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

  it('tells a screen reader it rests, aria-disabled for exactly as long', () => {
    const attributes = new Map<string, string>();
    const button = {
      hasAttribute: (name: string) => attributes.has(name),
      setAttribute: (name: string, value: string) => void attributes.set(name, value),
      removeAttribute: (name: string) => void attributes.delete(name),
    };
    const rest = createTapRest(timers, () => drawRest(button, !rest.ready()));
    rest.begin();
    vi.advanceTimersByTime(340);
    expect(attributes.get('aria-disabled')).toBe('true');
    vi.advanceTimersByTime(20);
    // 360 ms on: ready, and nothing more is said of it.
    expect(attributes.has('aria-disabled')).toBe(false);
    expect([...attributes.keys()]).toEqual([]);
  });

  it('leaves alone an aria-disabled the screen gave for a reason of its own', () => {
    // Start greyed as "Period over" rests when its word changes, and stays disabled after.
    const attributes = new Map<string, string>([['aria-disabled', 'true']]);
    const button = {
      hasAttribute: (name: string) => attributes.has(name),
      setAttribute: (name: string, value: string) => void attributes.set(name, value),
      removeAttribute: (name: string) => void attributes.delete(name),
    };
    const rest = createTapRest(timers, () => drawRest(button, !rest.ready()));
    rest.begin();
    vi.advanceTimersByTime(340);
    expect(attributes.get('aria-disabled')).toBe('true');
    vi.advanceTimersByTime(20);
    expect(attributes.get('aria-disabled')).toBe('true');
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

describe('the pad’s Start clock button (the area 4 review, M5; the code review, M-c)', () => {
  it('340 ms after the pad came to rest a tap is not taken, and the button shows not ready', () => {
    const drawn: boolean[] = [];
    const rest = createTapRest(timers, () => drawn.push(rest.ready()));
    // The pad comes to rest: +2 was tapped, and the options closed.
    rest.begin();
    expect(drawn).toEqual([false]);
    vi.advanceTimersByTime(340);
    expect(startBarTap(rest, finger())).toBeNull();
    expect(rest.ready()).toBe(false);
    // A tap that is not taken changes nothing: the button is ready when it would have been.
    expect(drawn).toEqual([false]);
  });

  it('360 ms after, it shows ready and a tap starts the clock', () => {
    const drawn: boolean[] = [];
    const rest = createTapRest(timers, () => drawn.push(rest.ready()));
    rest.begin();
    vi.advanceTimersByTime(360);
    expect(drawn).toEqual([false, true]);
    expect(rest.ready()).toBe(true);
    expect(startBarTap(rest, finger())).toEqual({ type: 'start' });
  });

  it('the second tap of a double tap on an option never starts the clock, however fast', () => {
    for (const apart of [50, 90, 150, 250, 349]) {
      const rest = createTapRest(timers);
      // The first tap closed the options and the pad came to rest; the second lands on
      // the Start clock button `apart` ms later.
      rest.begin();
      vi.advanceTimersByTime(apart);
      expect(startBarTap(rest, finger())).toBeNull();
      rest.stop();
    }
  });

  it('is as ready as it looks: never drawn ready while a tap would not be taken', () => {
    const rest = createTapRest(timers);
    rest.begin();
    for (let at = 0; at <= 400; at += 10) {
      if (rest.ready()) expect(startBarTap(rest, finger())).not.toBeNull();
      vi.advanceTimersByTime(10);
    }
    expect(rest.ready()).toBe(true);
  });

  it('Enter and Space start the clock at once: no finger landed there by accident', () => {
    const rest = createTapRest(timers);
    rest.begin();
    expect(startBarTap(rest, key())).toEqual({ type: 'start' });
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
  /** −'s own rest, as the screen makes it: longer than the other controls'. */
  const minusRest = (drawn?: () => void) => createTapRest(timers, drawn, takeBackRestMs);

  it('rests 600 ms after a take-back, its own length, not the Start clock’s third of a second', () => {
    expect(takeBackRestMs).toBe(600);
    expect(takeBackRestMs).toBeGreaterThan(restMs);
  });

  it('a fast double tap takes one timeout back, never two', () => {
    const rest = minusRest();
    expect(takeBackTimeoutTap('home', rest, finger())).toEqual({ type: 'untimeout', side: 'home' });
    // The second touch of a double tap, 90 ms on: not taken, and − shows it is resting.
    vi.advanceTimersByTime(90);
    expect(takeBackTimeoutTap('home', rest, finger())).toBeNull();
    expect(rest.ready()).toBe(false);
    // A tap that is not taken does not start the rest again.
    vi.advanceTimersByTime(520);
    expect(rest.ready()).toBe(true);
  });

  it('a slow double tap, 310 to 550 ms apart, takes one back too; at 550 ms − is drawn resting and aria-disabled, at 650 ready', () => {
    const attributes = new Map<string, string>();
    const button = {
      hasAttribute: (name: string) => attributes.has(name),
      setAttribute: (name: string, value: string) => void attributes.set(name, value),
      removeAttribute: (name: string) => void attributes.delete(name),
    };
    const drawn: boolean[] = [];
    const rest = minusRest(() => {
      drawn.push(rest.ready());
      drawRest(button, !rest.ready());
    });
    const first = Date.now();
    expect(takeBackTimeoutTap('home', rest, finger(first))).not.toBeNull();
    // The second touch of a slow double tap, as the area lead's touches made it.
    for (const apart of [310, 340, 450, 550]) {
      expect(tapTaken(rest, finger(first + apart))).toBe(false);
    }
    vi.advanceTimersByTime(550);
    expect(takeBackTimeoutTap('home', rest, finger())).toBeNull();
    expect(rest.ready()).toBe(false);
    expect(drawn).toEqual([false]);
    expect(attributes.get('aria-disabled')).toBe('true');
    vi.advanceTimersByTime(100);
    // 650 ms on: drawn ready, said ready, and a tap is taken.
    expect(drawn).toEqual([false, true]);
    expect(attributes.has('aria-disabled')).toBe(false);
    expect(takeBackTimeoutTap('home', rest, finger())).toEqual({ type: 'untimeout', side: 'home' });
  });

  it('two deliberate taps take two back', () => {
    const rest = minusRest();
    expect(takeBackTimeoutTap('away', rest, finger())).not.toBeNull();
    vi.advanceTimersByTime(650);
    expect(takeBackTimeoutTap('away', rest, finger())).toEqual({ type: 'untimeout', side: 'away' });
    // And it rests again from the second.
    vi.advanceTimersByTime(100);
    expect(takeBackTimeoutTap('away', rest, finger())).toBeNull();
  });

  it('rests for the other team’s − too: the two are side by side', () => {
    const rest = minusRest();
    expect(takeBackTimeoutTap('home', rest, finger())).not.toBeNull();
    vi.advanceTimersByTime(90);
    expect(takeBackTimeoutTap('away', rest, finger())).toBeNull();
  });
});
