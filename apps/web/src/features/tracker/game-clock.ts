// The game clock as the scoring screen reads it (step 2.36), with no drawing and no words.
// Everything here is worked out from the engine's state and the SERVER's time
// (`status.now()` of tracker-controller.ts; T-121, finding M1 of the 2.107 audit), never
// the device's own clock: a tablet whose clock is 30 seconds wrong reads the same game
// clock as a correct one. The engine itself is used as it is (T-110): it knows Start,
// Pause, setting the clock, periods and what stopped the clock; this only reads it.
import { basketball } from '@srleagues/sports';

export type ClockReading = {
  /** What is left of the period, in milliseconds of game clock. */
  readonly remainingMs: number;
  /** All the time the clock has run, across every period: what minutes are counted in. */
  readonly elapsedMs: number;
  /** Counting down at this moment. A clock that reached 0:00 has stopped there. */
  readonly running: boolean;
  /** At 0:00: the period is over, and the next one is picked before the clock starts. */
  readonly over: boolean;
  /** "7:58". */
  readonly text: string;
};

/** The clock as it reads at `serverNow`, the server's time in milliseconds. */
export function readClock(game: basketball.GameState, serverNow: number): ClockReading {
  const clock = basketball.clockAt(game, serverNow);
  return {
    remainingMs: clock.remainingMs,
    elapsedMs: clock.elapsedMs,
    running: clock.running,
    over: clock.remainingMs <= 0,
    text: basketball.formatClock(clock.remainingMs),
  };
}

/**
 * A player's time on the court as it reads now, "4:12": what the game holds for them
 * (`baseMs`, as of its latest tap) and, for a player on the court, the time the clock has
 * run since. So the minutes tick with the clock without the game being worked out again.
 */
export function minutesNow(
  game: basketball.GameState,
  reading: ClockReading,
  baseMs: number,
  onCourt: boolean,
): string {
  const since = onCourt ? Math.max(0, reading.elapsedMs - game.clock.elapsedMs) : 0;
  return basketball.formatMinutes(baseMs + since);
}

/** Why the clock is stopped, as far as the plays tell (checklist T9). */
export type StopReason =
  /** Nothing is played yet: it starts at the tip. */
  | { readonly kind: 'tip-off' }
  /** A foul stopped it (a stop clock). */
  | { readonly kind: 'foul'; readonly side: basketball.Side; readonly playerId: string }
  /** A timeout stopped it. */
  | { readonly kind: 'timeout'; readonly side: basketball.Side }
  /** A period was picked and the clock stands at its start. */
  | { readonly kind: 'period-start'; readonly period: number }
  /** Paused by hand, or set; or stopped for a foul or timeout that was since taken back. */
  | { readonly kind: 'stopped' };

/**
 * Whether the foul or the timeout at place `at` of the plays still stands. A take-back
 * takes back the latest foul of that player, or the latest timeout of that team: this
 * one, unless another was given after it.
 */
function stillStands(plays: basketball.GameState['plays'], at: number): boolean {
  const play = plays[at];
  if (play === undefined) return false;
  let later = 0;
  for (const next of plays.slice(at + 1)) {
    if (play.type === 'foul') {
      if (next.type === 'foul' && next.playerId === play.playerId) later += 1;
      else if (next.type === 'unfoul' && next.playerId === play.playerId) {
        if (later === 0) return false;
        later -= 1;
      }
    } else if (play.type === 'timeout') {
      if (next.type === 'timeout' && next.side === play.side) later += 1;
      else if (next.type === 'untimeout' && next.side === play.side) {
        if (later === 0) return false;
        later -= 1;
      }
    }
  }
  return true;
}

export function stopReason(game: basketball.GameState): StopReason {
  if (game.status === 'scheduled') return { kind: 'tip-off' };
  // The play that stopped the clock carries the moment it did, which the clock keeps
  // until it is started again.
  for (let i = game.plays.length - 1; i >= 0; i -= 1) {
    const play = game.plays[i];
    if (play === undefined || play.stoppedClock !== true) continue;
    if (play.at !== game.clock.anchorAt) break;
    // A foul or a timeout that has since been taken back is no longer named as the
    // reason (the area 4 review of step 2.36, L4): the clock is stopped, and that is all
    // that is said.
    if (!stillStands(game.plays, i)) break;
    if (play.type === 'foul') return { kind: 'foul', side: play.side, playerId: play.playerId };
    if (play.type === 'timeout') return { kind: 'timeout', side: play.side };
    break;
  }
  const last = game.plays.at(-1);
  if (last?.type === 'period' && last.clockMs === game.clock.remainingMs) {
    return { kind: 'period-start', period: last.period };
  }
  return { kind: 'stopped' };
}

/**
 * One stop of the clock: when it stopped and in which period. The Start clock button
 * hidden with × stays hidden for this stop only: the next stop, or a new period, shows
 * it again (checklist T10).
 */
export const stopKey = (game: basketball.GameState, period: number): string =>
  `${game.clock.anchorAt}|${period}`;

/**
 * Whether the large Start clock button is offered (checklist T7): the clock is stopped
 * with time left, in a game under way or with every team's lineup set, on a game that is
 * not final, and the scorekeeper has not hidden it for this stop.
 */
export function startOffered(
  game: basketball.GameState,
  reading: ClockReading,
  options: {
    readonly lineupsSet: boolean;
    readonly period: number;
    readonly hiddenFor: string | null;
  },
): boolean {
  if (game.status === 'final' || reading.running || reading.over) return false;
  if (game.status !== 'live' && !options.lineupsSet) return false;
  return options.hiddenFor !== stopKey(game, options.period);
}

/** What is said when the clock runs out: "Halftime." at the middle, else "End of Q1." (T4). */
export const periodEnd = (period: number, periods: 2 | 4): 'halftime' | 'period' =>
  period === periods / 2 ? 'halftime' : 'period';

/** The longest clock the engine takes. */
const maxClockMs = 60 * 60 * 1000;
/** How many digits the clock's keys take: "6000" is 60:00. */
export const clockEntryDigits = 4;

export type ClockEntry = {
  /** As the form shows it while it is typed: "0:08", "6:30". */
  readonly text: string;
  /** The time in milliseconds, or null while what is typed is not a time the clock takes. */
  readonly ms: number | null;
  /**
   * `empty`: nothing typed yet; `seconds`: the seconds are over 59; `range`: more than
   * the clock holds (60:00); `period`: more than the period being played is long.
   */
  readonly problem: 'empty' | 'seconds' | 'range' | 'period' | null;
};

/**
 * The time typed on the clock's keys (checklist T5). The digits fill from the right, as
 * on a scoreboard's own controller or a kitchen timer: 6, 3, 0 is 6:30; 8, 0, 0 is 8:00.
 *
 * `periodMs` is the length of the period being played: a time longer than that (25:00 in
 * a 20-minute half) is a slip of the finger, and is refused in words before Set is
 * offered (the area 4 review of step 2.36, L5). Left out, only the engine's own limit
 * holds.
 */
export function clockEntry(digits: string, periodMs: number = maxClockMs): ClockEntry {
  const typed = digits.replace(/\D/g, '').slice(0, clockEntryDigits);
  const padded = typed.padStart(3, '0');
  const minutes = Number(padded.slice(0, -2));
  const seconds = Number(padded.slice(-2));
  const text = `${minutes}:${padded.slice(-2)}`;
  if (typed === '') return { text, ms: null, problem: 'empty' };
  if (seconds > 59) return { text, ms: null, problem: 'seconds' };
  const ms = (minutes * 60 + seconds) * 1000;
  if (ms > maxClockMs) return { text, ms: null, problem: 'range' };
  if (ms > periodMs) return { text, ms: null, problem: 'period' };
  return { text, ms, problem: null };
}

/**
 * A key pressed on the clock's form: a digit is added at the right, as far as it holds.
 * A zero typed first is 0:00 (the period is over) and gives way to the next digit.
 */
export function clockEntryKey(digits: string, key: string): string {
  if (!/^\d$/.test(key)) return digits;
  const typed = digits === '0' ? '' : digits;
  return typed.length < clockEntryDigits ? typed + key : digits;
}

/** What setting the clock will do to the players' minutes, as the clock's form says it. */
export type SetEffect =
  /**
   * `time` ("4:55") comes off the minutes of the players on the court; `wholePeriod` when
   * that is all this period has run.
   */
  | { readonly kind: 'back'; readonly time: string; readonly wholePeriod: boolean }
  /** `time` is added to the minutes of the players on the court. */
  | { readonly kind: 'added'; readonly time: string }
  /** The clock has not run in this period: it will start at `clock`, and no minutes change. */
  | { readonly kind: 'start'; readonly clock: string };

/**
 * What setting the clock to `ms` at `serverNow` will do to the players' minutes, so the
 * form can say so before it is done; null when the minutes do not move. It is the
 * engine's own helper (`clockSetEffect`), which makes the set on a copy of the game, so
 * the form never says other than what the engine then does, under the game's own rule.
 *
 * A game of the new product counts minutes on the game clock (S-71, step 2.189): time put
 * back comes off the players on the court, time taken off is added to them, and a clock
 * set wrongly and put right changes nothing (16:55 set to 12:00 adds 4:55; set back to
 * 16:55, it takes the 4:55 off again, and every starter is at 3:05 as before). A game
 * saved before keeps the rule it was played by: there, only time of the period being
 * played comes off (the code review of step 2.36, M-b), and it can be all of it (the
 * area 4 review, M4), which the form says too.
 */
export function setEffect(
  game: basketball.GameState,
  ms: number,
  serverNow: number,
): SetEffect | null {
  const effect = basketball.clockSetEffect(game, ms, serverNow);
  switch (effect.kind) {
    case 'back':
      return {
        kind: 'back',
        time: basketball.formatClock(effect.ms),
        wholePeriod: effect.wholePeriod,
      };
    case 'added':
      return { kind: 'added', time: basketball.formatClock(effect.ms) };
    case 'start':
      return { kind: 'start', clock: basketball.formatClock(ms) };
    case 'none':
      return null;
  }
}

/**
 * What a set clock truly did to the minutes, for the sentence said once it is done: the
 * game time before (`before`, read as the form was used) against the engine's own after
 * the set. Null when the minutes did not move.
 */
export function minutesMoved(
  before: ClockReading,
  after: basketball.GameState,
): { readonly kind: 'back' | 'added'; readonly time: string } | null {
  const change = after.clock.elapsedMs - before.elapsedMs;
  if (change === 0) return null;
  return { kind: change < 0 ? 'back' : 'added', time: basketball.formatClock(Math.abs(change)) };
}

/** A period the picker offers. */
export type PeriodChoice = {
  readonly period: number;
  /** The game is in this period now. */
  readonly current: boolean;
  /** The one after the period the game is in: what is usually picked. */
  readonly next: boolean;
};

/**
 * Every regulation period and three overtimes, and more if the game ran past them
 * (checklist T6): the engine's own list.
 */
export function periodChoices(rules: basketball.Rules, period: number): PeriodChoice[] {
  return basketball.periodOptions(rules, period).map((option) => ({
    period: option.value,
    current: option.value === period,
    next: option.value === period + 1,
  }));
}
