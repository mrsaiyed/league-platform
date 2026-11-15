// The words of the games list's headings (step 2.156): a day of the week ahead, and a round
// of earlier games as the round picker offers it. A day is the league's own (YYYY-MM-DD,
// worked out in its time zone by the commands), so it is written as that calendar day,
// whatever the server's zone. The words are in the message files (T-187).
import type { EarlierRound } from '@srleagues/core';
import { t } from '../../server/messages.ts';

/** A calendar day as written in `locale`, at noon so no zone moves it to the next day. */
function dayOf(day: string, locale: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
    new Date(`${day}T12:00:00.000Z`),
  );
}

/** The day after `today` (YYYY-MM-DD). */
function nextDay(today: string): string {
  const next = new Date(`${today}T12:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** "Tomorrow", or "Wednesday, November 18". */
export function dayHeadingText(day: string, today: string, locale: string): string {
  if (day === nextDay(today)) return t('admin.games.tomorrow');
  return dayOf(day, locale, { weekday: 'long', month: 'long', day: 'numeric' });
}

/**
 * A round of earlier games: "Round 3, Sun, Nov 8 (4)", or with its season when the list
 * spans more than one ("Round 1, Spring 2026, Sat, Aug 7 to Sun, Aug 8 (2)"); a round's own
 * name in place of its number where it has one.
 */
export function earlierRoundText(
  round: EarlierRound,
  season: string | undefined,
  locale: string,
): string {
  const name =
    round.roundId === null
      ? t('admin.games.earlier.noRound')
      : (round.label ?? t('admin.games.earlier.roundNumber', { number: String(round.number) }));
  const short = { weekday: 'short', month: 'short', day: 'numeric' } as const;
  const first = dayOf(round.firstDay, locale, short);
  const days =
    round.firstDay === round.lastDay
      ? first
      : t('admin.games.earlier.days', { first, last: dayOf(round.lastDay, locale, short) });
  const count = String(round.games);
  return season === undefined
    ? t('admin.games.earlier.option', { round: name, days, count })
    : t('admin.games.earlier.optionSeason', { round: name, season, days, count });
}
