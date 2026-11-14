// The season's calendar for placing games (P7 §4.1): which dates can hold games, week by week.

/**
 * The longest season the generator lays out, in days. A guard against a mistyped year
 * producing an enormous calendar, not a league rule: no real season comes near two years.
 */
export const maxSeasonDays = 731;

/** A date (YYYY-MM-DD) as a whole number of days since 1970-01-01, or null if it is not a real date. */
export function dayNumber(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const time = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(time)) return null;
  // Date.parse rolls 2026-02-30 over to March; a real date comes back unchanged.
  if (new Date(time).toISOString().slice(0, 10) !== date) return null;
  return time / 86_400_000;
}

/** The date (YYYY-MM-DD) of a day number. */
export function dateOfDay(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

/** The day of the week of a day number: 0 is Sunday, 6 is Saturday. */
export function weekdayOf(day: number): number {
  // 1970-01-01 was a Thursday.
  return (((day + 4) % 7) + 7) % 7;
}

/** One week of the season: seven days from `firstDay`, and its dates that can hold games. */
export type SeasonWeek = { firstDay: number; dates: string[] };

/**
 * The season week by week, from its first date to its last. Weeks are counted in blocks of
 * seven days from the season's first date, so a league that plays Saturdays and Sundays and
 * starts on a Saturday has both days in one week. A week's dates are its playing days, in
 * order, less the dates to skip; a week whose dates are all skipped is still listed, empty,
 * so week numbers follow the calendar.
 */
export function seasonWeeks(
  firstDay: number,
  lastDay: number,
  playingDays: ReadonlySet<number>,
  skipDates: ReadonlySet<string>,
): SeasonWeek[] {
  const weeks: SeasonWeek[] = [];
  for (let start = firstDay; start <= lastDay; start += 7) {
    const dates: string[] = [];
    for (let day = start; day < start + 7 && day <= lastDay; day++) {
      const date = dateOfDay(day);
      if (playingDays.has(weekdayOf(day)) && !skipDates.has(date)) dates.push(date);
    }
    weeks.push({ firstDay: start, dates });
  }
  return weeks;
}
