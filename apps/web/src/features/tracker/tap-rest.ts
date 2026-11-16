// A control that takes no tap for a moment (the fix round of step 2.36; the area 4 review,
// M2 and M5, and the code review, M-a and M-c), with no drawing: when it rests, whether a
// tap is taken, and when it shows ready again.
//
// A scorekeeper double-taps. The second tap lands a tenth to a third of a second after the
// first, on whatever is under the finger by then: the Start clock button the pad shows
// once a player's options close, Pause where Start was, − again after the list has lost
// its latest timeout, an answer where the timeout button was. None of those second taps
// was meant, and each would change the game. So such a control RESTS for a third of a
// second after it comes under the finger, and a pointer's tap in that time is not taken.
//
// A tap that is not taken must never look as if it were (M5: a real tap was swallowed
// with no sign, and the scorekeeper carried on believing the clock ran). So the rest is
// also something the screen SHOWS: `ready()` is false while the control rests, the screen
// draws it not yet ready (hollow, or dimmed), and `drawn` is called when that changes, at
// the start of the rest and at its end.
import type { TapInput } from './tracker-controller.ts';

/** How long a control rests: longer than a double tap, shorter than a second thought. */
export const restMs = 350;

/** The clock and the timer a rest runs on: the page's own, or a test's. */
export type RestTimers = {
  /** The steady clock a tap's own time is read on, in milliseconds. */
  now(): number;
  /** Runs `run` after `ms`; gives back what cancels it. */
  after(ms: number, run: () => void): () => void;
};

export type TapRest = {
  /** The control comes to rest at `at` (now, when left out): no tap is taken for `restMs`. */
  begin(at?: number): void;
  /** Whether a pointer's tap made at `at` is taken. */
  takes(at: number): boolean;
  /** Whether the control is drawn ready: false from `begin` until the rest is over. */
  ready(): boolean;
  /** The screen is gone: nothing more is drawn. */
  stop(): void;
};

/** A rest for one control (or one group that rests together); `drawn` redraws it. */
export function createTapRest(timers: RestTimers, drawn: () => void = () => undefined): TapRest {
  let until = Number.NEGATIVE_INFINITY;
  let resting = false;
  let cancel: (() => void) | null = null;
  return {
    begin(at = timers.now()) {
      until = at + restMs;
      resting = true;
      cancel?.();
      cancel = timers.after(Math.max(0, until - timers.now()), () => {
        cancel = null;
        resting = false;
        drawn();
      });
      drawn();
    },
    takes: (at) => at >= until,
    ready: () => !resting,
    stop() {
      cancel?.();
      cancel = null;
      resting = false;
    },
  };
}

/** The few things of a drawn button that its rest changes (an element, or a test's stand-in). */
export type RestDrawn = {
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};

/**
 * Tells a screen reader that a button rests, as the hollow look tells the eye (the code
 * review's confirming look): `aria-disabled="true"` while it rests, the attribute the
 * screen already gives Start greyed as "Period over". An `aria-disabled` the screen gave
 * for a reason of its own is left alone: only the one the rest put on is taken off
 * (it is marked `data-rest-disabled`).
 */
export function drawRest(button: RestDrawn, resting: boolean): void {
  if (resting) {
    if (button.hasAttribute('aria-disabled')) return;
    button.setAttribute('aria-disabled', 'true');
    button.setAttribute('data-rest-disabled', '');
  } else if (button.hasAttribute('data-rest-disabled')) {
    button.removeAttribute('aria-disabled');
    button.removeAttribute('data-rest-disabled');
  }
}

/** A tap as the guards read it: when it was made, and whether a key made it. */
export type Tap = { readonly at: number; readonly keyboard: boolean };

/**
 * Whether a tap on a control is taken. Enter and Space are always taken: a key is pressed
 * on the control that has the keyboard, never on one that moved under a finger.
 */
export const tapTaken = (rest: TapRest, tap: Tap): boolean => tap.keyboard || rest.takes(tap.at);

/**
 * Start or Pause tapped in the row under the scoreboard (checklist T2; the code review,
 * M-a): the tap that is sent, or null while the button rests. The button changes from
 * Start to Pause as soon as the device has kept the tap, so the second tap of a double
 * tap would land on Pause and stop the clock that had just been started (and Pause, then
 * Start, likewise). So it rests from each tap it takes, and again when its word changes
 * (the screen begins that rest): one double tap is one tap.
 */
export function clockToggleTap(kind: 'start' | 'pause', rest: TapRest, tap: Tap): TapInput | null {
  if (!tapTaken(rest, tap)) return null;
  rest.begin(tap.at);
  return { type: kind };
}

/**
 * The pad's large Start clock button tapped (checklist T7; the area 4 review, M5, and the
 * code review, M-c): the tap that starts the clock, or null while the pad has only just
 * come to rest. The pad returns to rest with +1, +2, +3, Foul, a substitute and ×, and
 * the second tap of a double tap on one of those must never start the clock. The screen
 * begins the rest when the pad comes to rest, and draws the button not yet ready for as
 * long, so a tap that is not taken was plainly not taken.
 */
export const startBarTap = (rest: TapRest, tap: Tap): TapInput | null =>
  tapTaken(rest, tap) ? { type: 'start' } : null;

/**
 * − tapped on a team's timeouts (G7; M2): the tap that takes the latest one back, or null
 * while − rests. It rests from each tap taken, so two timeouts come back only by two
 * deliberate taps: a fast double tap takes one.
 */
export function takeBackTimeoutTap(
  side: 'home' | 'away',
  rest: TapRest,
  tap: Tap,
): TapInput | null {
  if (!tapTaken(rest, tap)) return null;
  rest.begin(tap.at);
  return { type: 'untimeout', side };
}
