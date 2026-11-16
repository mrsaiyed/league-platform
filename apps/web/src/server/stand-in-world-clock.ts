// A made-up league's own clock (T9): the day and time it is in the league's time zone,
// and back from a day and time there to a moment. What the database works out with
// `at time zone`, for the stand-in's one world (stand-in-world.ts). Local work only.
// "Today" is always the league's own day, by core's own rule (dayIn of the leagues module).
import { dayIn as leagueDayIn } from '@srleagues/core';

/** yyyy-mm-dd, `days` days on from `day` (or back, when negative). */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Answers already worked out, by what was asked: each of these is the same answer every time
 * for the same zone and moment, and working one out reads the zone's rules, which is slow
 * when a world of hundreds of games is read or made again and again (step 2.179's kept test).
 * Emptied when it grows large, so a long-running server never holds more than a few.
 */
function remembered<T>(work: (key: string) => T): (key: string) => T {
  const known = new Map<string, T>();
  return (key) => {
    const found = known.get(key);
    if (found !== undefined) return found;
    if (known.size >= 20_000) known.clear();
    const made = work(key);
    known.set(key, made);
    return made;
  };
}

const dayAt = remembered((key) => {
  const cut = key.indexOf('|');
  return leagueDayIn(key.slice(0, cut), Number(key.slice(cut + 1)));
});

/** The day it is at `moment` in the league's zone, yyyy-mm-dd: core's own rule. */
export function dayIn(moment: Date, timeZone: string): string {
  return dayAt(`${timeZone}|${moment.getTime()}`);
}

/** One reader of the wall clock for each zone: making one is the slow part. */
const wallClocks = new Map<string, Intl.DateTimeFormat>();
const wallClockOf = (timeZone: string): Intl.DateTimeFormat => {
  const known = wallClocks.get(timeZone);
  if (known !== undefined) return known;
  const made = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });
  wallClocks.set(timeZone, made);
  return made;
};

const wallClockAt = remembered((key) => {
  const cut = key.indexOf('|');
  const parts = Object.fromEntries(
    wallClockOf(key.slice(0, cut))
      .formatToParts(new Date(Number(key.slice(cut + 1))))
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  return Date.UTC(
    parts['year'] ?? 0,
    (parts['month'] ?? 1) - 1,
    parts['day'] ?? 1,
    parts['hour'] ?? 0,
    parts['minute'] ?? 0,
  );
});

/** The wall clock at `moment` in the zone, as if it were UTC: milliseconds. */
function wallClockIn(moment: Date, timeZone: string): number {
  return wallClockAt(`${timeZone}|${moment.getTime()}`);
}

/** The time it is at `moment` in the zone, HH:MM. */
export function timeIn(moment: Date, timeZone: string): string {
  return new Date(wallClockIn(moment, timeZone)).toISOString().slice(11, 16);
}

const momentAt = remembered((key) => {
  const [timeZone = 'UTC', day = '', time = ''] = key.split('|');
  return momentWorkedOut(day, time, timeZone);
});

/** The moment it is `time` (HH:MM) on `day` in the zone, as an ISO time. */
export function momentIn(day: string, time: string, timeZone: string): string {
  return momentAt(`${timeZone}|${day}|${time}`);
}

function momentWorkedOut(day: string, time: string, timeZone: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wanted = Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1, hour ?? 0, minute ?? 0);
  let guess = new Date(wanted);
  for (let i = 0; i < 2; i += 1) {
    guess = new Date(guess.getTime() + (wanted - wallClockIn(guess, timeZone)));
  }
  return guess.toISOString();
}
