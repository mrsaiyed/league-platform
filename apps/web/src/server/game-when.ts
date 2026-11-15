// When a game is played, in words, for the admin's lists of games (the games area and a
// scorekeeper's games): in the league's own time zone and the page's language, so a
// game at 7 pm in Chicago reads 7 pm, not the hour in UTC. The words are in the
// message files (T-187).
import { t } from './messages.ts';

/** How a league writes its times: the page's language and the league's time zone. */
export type LeagueTimes = {
  readonly locale: string;
  /** An IANA zone name, such as `America/Chicago`. */
  readonly timeZone: string;
};

/** "Sat, 5 Dec, 7:00 PM"; "Today, 7:00 PM" for a game the caller says is today. */
export function gameWhenText(
  startsAt: string | null,
  times: LeagueTimes,
  options: { readonly today?: boolean } = {},
): string {
  if (startsAt === null) return t('admin.games.noTime');
  const when = new Date(startsAt);
  const time = new Intl.DateTimeFormat(times.locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: times.timeZone,
  }).format(when);
  if (options.today === true) return t('admin.games.today', { time });
  const day = new Intl.DateTimeFormat(times.locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: times.timeZone,
  }).format(when);
  return t('admin.games.when', { day, time });
}
