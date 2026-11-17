'use client';
// A time on the device list in the person's own time (step 2.163; the using-it audit,
// M26): "Signed in today at 8:41 PM" by the clock of the phone reading it, not "Nov 15,
// 2026, 2:41 AM UTC". The server does not know the person's time zone, so the page is
// drawn with the time in UTC, said as such, and the browser puts it into its own time as
// soon as the page's script runs; with scripts off the UTC words stay, which are true.
// The words come from the message files, handed over by the page: the line with a hole
// where the time goes (`before` and `after`), and the three ways to say a time.
import { useEffect, useState } from 'react';

export type LocalTimeWords = {
  /** The line's words before and after the time ("Signed in ", ""). */
  readonly before: string;
  readonly after: string;
  /** "today at {time}", "yesterday at {time}", "{date} at {time}". */
  readonly today: string;
  readonly yesterday: string;
  readonly day: string;
};

/** The calendar day of `at` in the browser's own time zone, as a number to compare. */
function dayNumber(at: Date): number {
  return Math.floor(
    Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()) / (24 * 60 * 60 * 1000),
  );
}

/** `at` in the reader's own time, as words: "today at 8:41 PM", "Nov 3 at 9:05 AM". */
export function localWhen(at: Date, now: Date, locale: string, words: LocalTimeWords): string {
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(at);
  const days = dayNumber(now) - dayNumber(at);
  if (days === 0) return words.today.replace('{time}', time);
  if (days === 1) return words.yesterday.replace('{time}', time);
  const date = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(at);
  return words.day.replace('{date}', date).replace('{time}', time);
}

export function LocalTime({
  at,
  utcWords,
  locale,
  words,
}: {
  /** The moment, as an ISO string. */
  readonly at: string;
  /** The moment in UTC, in words, for the page as drawn by the server. */
  readonly utcWords: string;
  readonly locale: string;
  readonly words: LocalTimeWords;
}) {
  const [when, setWhen] = useState(utcWords);
  useEffect(() => {
    const moment = new Date(at);
    if (!Number.isNaN(moment.getTime())) setWhen(localWhen(moment, new Date(), locale, words));
  }, [at, locale, words]);
  return (
    <>
      {words.before}
      <time dateTime={at} data-local-time="">
        {when}
      </time>
      {words.after}
    </>
  );
}
