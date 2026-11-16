// Runs first in every test worker. vitest's main process answers each worker's progress
// report; the config gives it a little extra priority (vitest.config.ts) so that, when
// workers and other runs crowd the computer, a report is never left unanswered for a
// minute ("Timeout calling onTaskUpdate", a failed run although every test passed).
// Workers start from the main process's priority, so they go back to normal here.
import { constants, setPriority } from 'node:os';

try {
  setPriority(0, constants.priority.PRIORITY_NORMAL);
} catch {
  // A computer that refuses to change priority just runs the tests as before.
}

// TEST_FAKE_NOW: run the tests as if "now" were another moment, to prove that no test
// depends on the hour it runs at (step 2.175). Read here only, by the tests' own setup,
// never by product code, and this computer's clock is never touched: only this test
// worker's `Date` is shifted, and it runs on from the moment given, as a clock does.
// Either a time of day, HH:MM, in the made-up adult league's own time zone on today's date
// there (`TEST_FAKE_NOW=00:20` is twenty past midnight in that league), or a full ISO time
// (`TEST_FAKE_NOW=2026-11-16T06:20:00Z`). Unset, the tests read the real clock.
/** The made-up adult league's own time zone (apps/web/src/server/stand-in-world-seed.ts). */
const leagueZone = 'America/Chicago';

function shiftTestClockTo(wanted: string): void {
  const RealDate = Date;
  const target = /^\d{2}:\d{2}$/.test(wanted) ? leagueMomentToday(wanted) : RealDate.parse(wanted);
  if (Number.isNaN(target)) {
    throw new Error(`TEST_FAKE_NOW must be HH:MM or an ISO time, not "${wanted}".`);
  }
  const realNow = RealDate.now.bind(RealDate);
  const offset = target - realNow();
  const now = () => realNow() + offset;
  // A `Date` like the real one in every way but the moment it reads, with `now` its own
  // property, so a test that spies on `Date.now` or fakes the timers still does.
  const Shifted = function (...args: unknown[]): unknown {
    if (new.target === undefined) return new RealDate(now()).toString();
    return Reflect.construct(RealDate, args.length === 0 ? [now()] : args, new.target);
  } as unknown as DateConstructor;
  Object.setPrototypeOf(Shifted, RealDate);
  Object.defineProperty(Shifted, 'prototype', { value: RealDate.prototype });
  Object.defineProperty(Shifted, 'now', { value: now, writable: true, configurable: true });
  globalThis.Date = Shifted;
}

/** The moment it is `time` (HH:MM) on today's date in the league's zone, sound across a change of clocks. */
function leagueMomentToday(time: string): number {
  const wall = new Intl.DateTimeFormat('en-US', {
    timeZone: leagueZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });
  const wallAt = (moment: number) => {
    const parts = Object.fromEntries(
      wall.formatToParts(new Date(moment)).map((p) => [p.type, Number(p.value)]),
    ) as Record<string, number>;
    return Date.UTC(
      parts['year'] ?? 0,
      (parts['month'] ?? 1) - 1,
      parts['day'] ?? 1,
      parts['hour'] ?? 0,
      parts['minute'] ?? 0,
    );
  };
  const today = new Date(wallAt(Date.now())).toISOString().slice(0, 10);
  const [y, m, d] = today.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wanted = Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1, hour ?? 0, minute ?? 0);
  let guess = wanted;
  for (let i = 0; i < 2; i += 1) guess += wanted - wallAt(guess);
  return guess;
}

const fakeNow = process.env['TEST_FAKE_NOW'];
if (fakeNow !== undefined && fakeNow !== '') shiftTestClockTo(fakeNow);
