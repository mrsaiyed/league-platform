// Step 2.194 (TEST 1): the first test's walk, done whole, by touch at a phone's size (390
// wide), in a real browser against the web app on its made-up stand-in (APP_ENV=test).
// Nothing leaves this computer; every league, team, person and score is made up. It is
// docs/operations/first-test.md step by step, in the same order, and each check's name
// starts with the number of the step it checks there, so the two cannot drift apart. The
// numbers are pinned without a browser by
// apps/web/src/features/stats-pages/first-test-walk.test.ts, which plays the same taps.
//
// The made-up owner signs in on the local sign-in page and takes the empty league Still
// Waters (step 2.192) from nothing to a final table: three teams (the Owls play no game),
// five players each for the Ravens and the Wolves, a round today with two games and no
// place, published; the season is already shown. Game 1, Wolves at Ravens, is opened from
// "Score this game" on the league home and scored on the tracker: the fives, baskets, a
// foul, no turnover (the season keeps none), a wrong basket taken back with Undo, the clock set wrongly and
// right again, the second half, End game from More after its question. Game 2's final
// score is typed in Admin → Games, 50 to 45 for the Wolves, so the two teams end level.
// League settings' minimum games for the leaders is set to 1 (so the statistics page shows
// leaders after one game: more for the founder to see than "No leaders yet"). Then the
// game's page, the standings and the statistics, read by a visitor (signed out, a fresh
// browser with no cookies), where every number is what was scored.
//
// Still Waters starts live (made-up data only): the screen that publishes a league (step
// 2.125, part 2) is not built yet. A real new league still starts as a draft, and a draft
// league is still proven hidden from visitors (league-gate.test.ts, check-web-shell.mjs,
// on Quiet Pines and Reed Marsh).
//
// The tracker runs with scripts on (it is a page that needs them); the admin's screens
// with scripts off, as the other admin tests do, every form a plain post. Both are the one
// signed-in owner: the cookie the sign-in page set is carried from one to the other.
// `--no-build` serves the build already here; `--say` prints what each screen said, for
// writing first-test.md.
//
// The walk itself is first-test-walk.mjs, shared with the test copy's rehearsal (step 2.207).
import { signInWithPassword, walkFirstTest } from './first-test-walk.mjs';
import {
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
  whatWentWrong,
  worldAtLeagueTime,
} from './web-browser-kit.mjs';

const failures = [];
const checked = [];
/** The made-up world's clock in the league's zone for the walk being done (HH:MM). */
let clock = '';
const note = (label, ok, detail = '') => {
  checked.push(label);
  if (!ok) failures.push(`[at ${clock}] ${label}${detail ? `: ${detail}` : ''}`);
};
const saying = process.argv.includes('--say');
const say = (step, words) => {
  if (saying) console.log(`--- step ${step}\n${words}`);
};
/** `--shots=<folder>`: a picture of the screens first-test.md describes by their look. */
const shots = process.argv.find((a) => a.startsWith('--shots='))?.slice('--shots='.length);
const shot = async (on, name) => {
  if (shots !== undefined) await on.screenshot({ path: `${shots}/${name}.png` });
};
/**
 * `WALK_PICTURES=<folder>`: one picture of every step, full page, at the phone's size
 * (390 wide, device scale 1), as `step-01.png` to `step-18.png`, taken by this same walk so
 * the pictures and the test are one thing (for the lead to look over the founder's walk).
 */
const pictures = process.env.WALK_PICTURES;
if (pictures !== undefined) (await import('node:fs')).mkdirSync(pictures, { recursive: true });
const picture = async (on, step) => {
  if (pictures === undefined) return;
  await on.screenshot({
    path: `${pictures}/step-${String(step).padStart(2, '0')}.png`,
    fullPage: true,
  });
};
/** What went wrong in the browser on the pages with scripts on, printed at the end. */
const browserErrors = [];
const watchErrors = (on, where) => {
  on.on('pageerror', (error) => browserErrors.push(`${where}: ${error.message}`));
  on.on('console', (m) => {
    if (m.type() === 'error') browserErrors.push(`${where}: ${m.text()}`);
  });
};

let built = true;
if (!process.argv.includes('--no-build')) {
  built = await buildNext();
  if (!built) failures.push('next build failed or took over 10 minutes');
}

const league = 'still-waters';
const owner = { email: 'owner@example.test', password: 'made-up owner password' };
const started = Date.now();

// The walk works at any hour (first-test.md, step 4): it is done whole twice, with the made-up
// world's clock at midday and at 00:45 at night in the league's zone, when no hour of today
// has passed yet. `--now=<instant>` does it once, at that instant.
const clocks = process.argv.some((a) => a.startsWith('--now=')) ? ['--now'] : ['12:00', '00:45'];
for (const at24 of built ? clocks : []) {
  clock = at24;
  const worldNow = worldAtLeagueTime(at24 === '--now' ? '12:00' : at24);
  /** The league's today (America/Chicago, as the made-up world's), YYYY-MM-DD. */
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(
    new Date(worldNow),
  );
  /** The day before the league's today, as the "Date" box takes it. */
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const origin = `http://localhost:${await freePort()}`;
  const server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
    LOCAL_NOW: worldNow,
  });
  let browser;
  let at = 'starting';
  try {
    await waitFor(`${origin}/`, server, [
      { address: '/signin' },
      { address: `/${league}/admin`, cookie: 'srl_session=local-owner-token' },
      { address: `/${league}/admin/teams`, cookie: 'srl_session=local-owner-token' },
      { address: `/${league}/admin/schedule`, cookie: 'srl_session=local-owner-token' },
    ]);
    browser = await launch();
    await walkFirstTest({
      origin,
      browser,
      league: { slug: league, name: 'Still Waters League', season: 'First Season' },
      today,
      yesterday,
      signIn: signInWithPassword(owner),
      note,
      say,
      shot,
      picture,
      watchErrors,
    });
  } catch (error) {
    failures.push(`[at ${clock}] ${error?.at ?? at}: ${whatWentWrong(error)}`);
  } finally {
    await browser?.close();
    server.child.kill();
  }
}

const seconds = Math.round((Date.now() - started) / 1000);
if (browserErrors.length > 0) {
  console.log(`What the browser reported as errors on the way:\n  ${browserErrors.join('\n  ')}`);
}
if (failures.length > 0) {
  console.error(`First test walk browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `First test walk browser test passed: ${checked.length} checks in a real browser, ${seconds}s.`,
);
