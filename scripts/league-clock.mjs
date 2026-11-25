// The made-up league's own clock, for the build's checks (step 2.246, T-404): when a check
// starts the made-up world's clock (LOCAL_NOW) and how it names a day relative to it. A
// check never compares a fixed date with the real clock: the made-up world dates its games
// from its own clock's today, so a check pins that clock or works its days out from it here.
// Shared by scripts/check-web-shell.mjs and tests/browser (re-exported by web-browser-kit.mjs).

/** The made-up league's own zone (stand-in-world-seed.ts). */
const leagueZone = 'America/Chicago';

/** The wall clock at `moment` in the league's zone, as if it were UTC: milliseconds. */
function wallClock(moment) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: leagueZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
      .formatToParts(moment)
      .map((p) => [p.type, Number(p.value)]),
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

/**
 * When the made-up world's clock starts (LOCAL_NOW, step 2.179), for a test whose games
 * must not depend on the hour it is run at: noon in the league's zone on the league's
 * today, so a test never meets the league's midnight or a clock change. The day's final
 * game was played three hours before the world is made and the games list starts at the
 * league's midnight: at noon it is always this morning's, on the list, and already played;
 * the game under way started this morning too. `--now=<UTC time>` on the test's command
 * line starts it there instead. One helper for every such test (step 2.175).
 */
export function worldAtNoon(argv = process.argv) {
  return worldAtLeagueTime('12:00', argv);
}

/**
 * The same at `time` (HH:MM) in the league's zone on the league's today: a test that is
 * about the hour itself, such as just after the league's midnight (step 2.175).
 */
export function worldAtLeagueTime(time, argv = process.argv) {
  const asked = argv.find((a) => a.startsWith('--now='))?.slice('--now='.length);
  if (asked !== undefined) return asked;
  const today = new Date(wallClock(new Date())).toISOString().slice(0, 10);
  const wanted = Date.parse(`${today}T${time}:00Z`);
  // That time there: moved by the zone's offset, twice so a day of a clock change settles.
  let guess = wanted;
  for (let i = 0; i < 2; i += 1) guess += wanted - wallClock(new Date(guess));
  return new Date(guess).toISOString();
}

/**
 * How the page writes the day `days` after the league's today, the league's today being
 * the day in its own zone at `worldNow` (the LOCAL_NOW a test starts the world at), e.g.
 * "Mon, Nov 23". The made-up world dates its games relative to that day (a game's `day`
 * in stand-in-world-seed.ts), so a test that names a game's date works it out here, never
 * by writing a weekday or a date by hand: that holds only on one day of the week.
 */
export function leagueDayWords(worldNow, days) {
  const today = new Date(wallClock(new Date(worldNow))).toISOString().slice(0, 10);
  const day = new Date(Date.parse(`${today}T12:00:00Z`) + days * 86_400_000);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(day);
}

/**
 * The day `days` after the league's today (yyyy-mm-dd), the league's today being the day in
 * its own zone at `worldNow`: for a test that types a date, so the date is always as far
 * ahead (or back) of the made-up world's clock as the test means, whatever day it is run.
 */
export function leagueDay(worldNow, days) {
  const today = new Date(wallClock(new Date(worldNow))).toISOString().slice(0, 10);
  return new Date(Date.parse(`${today}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
