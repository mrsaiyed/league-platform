// The clock mode as the scoring screen shows it (step 2.69; P7 section 5.2, S-21, T-128):
// the running-clock switch, the sign that the last-minutes stop clock holds, and the
// notice that the mercy rule switched the clock. Everything here is read from the
// engine's own plays and helpers (`clockModeAt`, `inLastMinutes`), so the screen never
// says other than what the engine then does with a foul.
import { basketball } from '@srleagues/sports';
import type { TapInput } from './tracker-controller.ts';

export type ClockModeShown = {
  /** The mode in force now: what a foul follows (`clockModeAt`). */
  readonly now: basketball.ClockMode;
  /**
   * The last-minutes stop clock holds now: the game is on a running clock, but these are
   * the final seconds the format stops the clock in, and the scorer has not switched to a
   * running clock inside them.
   */
  readonly lastMinutes: boolean;
  /**
   * While the game is on a running clock and this period has a last-minutes window not
   * yet reached: the time left at which it starts, so the screen can draw the sign then.
   * Null otherwise.
   */
  readonly lastMinutesAtMs: number | null;
};

/** The clock mode at `remainingMs` of the period being played. */
export function clockModeShown(
  game: basketball.GameState,
  remainingMs: number = game.clock.remainingMs,
): ClockModeShown {
  const d = basketball.derive(game);
  const now = basketball.clockModeAt(game, d, remainingMs);
  const seconds = game.rules.stopClockLastSeconds;
  const windowMs = seconds == null ? null : seconds * 1000;
  const inWindow = basketball.inLastMinutes(game.rules, d.period, remainingMs);
  // Whether this period has a window at all: its final moment is in it or nothing is.
  const hasWindow = basketball.inLastMinutes(game.rules, d.period, 0);
  return {
    now,
    lastMinutes: d.clockMode === 'running' && inWindow && now === 'stop',
    lastMinutesAtMs: d.clockMode === 'running' && !inWindow && hasWindow ? windowMs : null,
  };
}

/** What a tap on the switch sends: the other mode from the one in force. */
export const switchedClock = (
  shown: ClockModeShown,
): Extract<TapInput, { type: 'clock-mode' }> => ({
  type: 'clock-mode',
  mode: shown.now === 'running' ? 'stop' : 'running',
});

/** The switch the mercy rule made, while it still holds: the basket that made it. */
export type MercySwitch = {
  /** The basket's play id: once dismissed, the notice is not shown again for it. */
  readonly playId: string;
  /** The season's mercy lead, as the notice says it. */
  readonly lead: number;
};

/**
 * The mercy rule's switch to a running clock, while the game is still on the running
 * clock it brought: null once the scorer switched the mode by hand since, or the basket
 * was undone (undoing it undoes the switch).
 */
export function mercySwitch(game: basketball.GameState): MercySwitch | null {
  const lead = game.rules.mercyLead;
  if (lead == null || basketball.derive(game).clockMode !== 'running') return null;
  for (let i = game.plays.length - 1; i >= 0; i--) {
    const play = game.plays[i]!;
    if (play.type === 'clock-mode') return null;
    if (play.mercyClock === true) return { playId: play.id, lead };
  }
  return null;
}
