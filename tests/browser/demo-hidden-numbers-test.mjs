// Step 2.62, part C: every public page of the demo-shaped league, as a visitor and as staff,
// checked for the numbers it hides (P9 §3 "What TCSAAL is shown"; S-22, T-87), in a real
// browser on the made-up database with the demo-shaped league asked for (APP_ENV=test,
// LOCAL_DATA=made-up-database, LOCAL_DEMO_LEAGUE=on; packages/database/src/seed/
// seed-demo-league.ts). Nothing leaves this computer; every league, school and person is
// made up. Builds the app first unless given --no-build.
//
// The demo-shaped league shows its tracked school's players' numbers to everyone and every
// other school's to staff only. The pages: the home page, schedule, standings, teams and
// statistics, every school's page, every game of the tracked school and one game between two
// other schools. Each is opened by a visitor (signed out) and by the league's made-up owner
// (signed in on "Be a made-up person"):
// - the page as the server sends it, to either, names no other school's player where numbers
//   are (a team page's roster names everyone: a roster is not a number), so a page kept by a
//   cache or a browser shows no hidden number to the next person;
// - what the visitor sees, once the page has asked for more, names no such player;
// - the owner, once the page has asked for more, is shown them: on the statistics page, and
//   on the pages of the schools the tracked school played, and on each of the tracked
//   school's ten game pages (staff-game-numbers.tsx), so the check is seen to find them there.
// Accessibility checks (T-186) on each kind of page, as each of the two. The visitor's checks
// on the same pages without the owner are demo-league-on-database-test.mjs's.
import { leagueUrl } from '@srleagues/core';
import { demoLeague } from '../../packages/database/src/seed/demo-league-data.ts';
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
  whatWentWrong,
} from './web-browser-kit.mjs';

const failures = [];
const checked = [];
const note = (label, ok, detail = '') => {
  checked.push(label);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};
const step = async (name, run) => {
  try {
    await run();
  } catch (error) {
    failures.push(`${name}: ${whatWentWrong(error)}`);
  }
};

const league = { slug: demoLeague.slug };
const schools = demoLeague.divisions.flatMap((division) => division.teams);
const tracked = schools.find((school) => school.shortName === demoLeague.trackedTeam);
/** The schools the tracked school played, whose players' lines the transfer brought in. */
const opponents = schools.filter(
  (school) => school !== tracked && demoLeague.trackerPlayers[school.shortName] !== undefined,
);
/** A player as a school league shows a child: first name and last initial (R-14). */
const shownAs = (name) => {
  const [first, last] = name.split(' ');
  return `${first} ${last[0]}.`;
};
const playersOf = (school) =>
  (demoLeague.trackerPlayers[school.shortName] ?? []).map(([, name]) => shownAs(name));
const hidden = opponents.flatMap(playersOf);
const withoutTags = (html) => html.replace(/<[^>]*>/g, ' ');
/** The part of a page's HTML where numbers are: a team page's roster names everyone. */
const numbersPart = (kind, html) => {
  if (kind !== 'team') return html;
  const from = html.indexOf('class="team-stats"');
  return from < 0 ? '' : html.slice(from, html.indexOf('</main>', from));
};
const hiddenIn = (text) => hidden.filter((name) => text.includes(name));

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}
let server;
let browser;
const origin = `http://localhost:${await freePort()}`;
if (built) {
  server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    LOCAL_DATA: 'made-up-database',
    LOCAL_DEMO_LEAGUE: 'on',
    PUBLIC_BASE_URL: origin,
  });
  await step('starting the server on the made-up database and the browser', async () => {
    await waitFor(`${origin}/`, server, [{ address: leagueUrl(league, 'standings') }]);
    browser = await launch();
  });
}

if (browser) {
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const staff = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const people = { visitor, staff };

  await step('the owner signs in as a made-up person', async () => {
    const page = await staff.newPage();
    await page.goto(`${origin}/signin/made-up-people`);
    const person = page.locator(`li[data-made-up-person="${demoLeague.owner.email}"]`);
    await Promise.all([
      page.waitForURL((url) => url.pathname !== '/signin/made-up-people'),
      person.getByRole('button').first().click(),
    ]);
    // On the made-up database it signs in by an emailed code, as a sign-up does, and the
    // browser is then on "Choose your password" (be-made-up-person.ts).
    if (new URL(page.url()).pathname === '/signup/password') {
      await page.getByLabel('Password').fill('a made-up chosen password');
      await Promise.all([
        page.waitForURL((url) => url.pathname !== '/signup/password'),
        page.getByRole('button', { name: 'Save and sign in' }).click(),
      ]);
    }
    await page.goto(`${origin}/account`);
    note(
      'the owner is signed in, by an ordinary session',
      (await page.getByText(`Signed in as ${demoLeague.owner.email}`).count()) === 1,
      `${page.url()} ${(await staff.cookies()).map((c) => c.name).join(',')}`,
    );
    await page.close();
  });

  /** The pages, each with its kind: [kind, address, label]. */
  const list = [
    ['home', leagueUrl(league, 'home'), 'the home page'],
    ['schedule', leagueUrl(league, 'schedule'), 'the schedule'],
    ['standings', leagueUrl(league, 'standings'), 'the standings'],
    ['teams', leagueUrl(league, 'teams'), 'the teams'],
    ['stats', leagueUrl(league, 'stats'), 'the statistics'],
    ...schools.map((s) => ['team', leagueUrl(league, 'team', { team: s.shortName }), s.name]),
  ];
  await step('the games to open', async () => {
    const page = await visitor.newPage();
    const gamesOn = async (school) => {
      await page.goto(origin + leagueUrl(league, 'team', { team: school.shortName }));
      await page.locator('main').first().waitFor();
      return page.evaluate(() => [
        ...new Set(
          [...document.querySelectorAll('main a[href*="/games/"]')].map(
            (a) => new URL(a.href).pathname,
          ),
        ),
      ]);
    };
    const ofTracked = await gamesOn(tracked);
    note(
      `${tracked.name}'s ten games are linked`,
      ofTracked.length === 10,
      String(ofTracked.length),
    );
    ofTracked.forEach((address, i) =>
      list.push(['game', address, `${tracked.name}'s game ${i + 1}`]),
    );
    const other = schools.find((s) => s !== tracked && !opponents.includes(s));
    const elsewhere = (await gamesOn(other)).find((address) => !ofTracked.includes(address));
    if (elsewhere) list.push(['game', elsewhere, `${other.name}'s game`]);
    await page.close();
  });

  const shownToStaff = [];
  const accessibleKinds = { visitor: new Set(), staff: new Set() };
  for (const [kind, address, label] of list) {
    await step(`${label}, as a visitor and as staff`, async () => {
      for (const [who, context] of Object.entries(people)) {
        const page = await context.newPage();
        const response = await page.goto(origin + address);
        note(
          `${label} is served to the ${who}`,
          response?.status() === 200,
          String(response?.status()),
        );
        await page.locator('main').first().waitFor();
        // The page asks for more once it is drawn (`private, no-store`): let it answer.
        await page.waitForLoadState('networkidle');
        const sent = numbersPart(kind, (await response?.text()) ?? '');
        note(
          `${label}: the page as the server sent it to the ${who} names no hidden player`,
          hiddenIn(sent).length === 0,
          `${hiddenIn(sent).length} found`,
        );
        const drawn = numbersPart(kind, await page.content());
        const seen = hiddenIn(withoutTags(drawn));
        if (who === 'visitor') {
          note(
            `${label}: the visitor is shown no hidden player`,
            seen.length === 0,
            seen.join(', '),
          );
        } else if (seen.length > 0) {
          shownToStaff.push(label);
        }
        if (!accessibleKinds[who].has(kind)) {
          accessibleKinds[who].add(kind);
          const problems = await accessibilityProblems(page);
          note(
            `accessibility: ${label}, as the ${who}`,
            problems.length === 0,
            problems.join('; '),
          );
        }
        await page.close();
      }
    });
  }
  note(
    'the owner is shown the hidden numbers on the statistics page',
    shownToStaff.includes('the statistics'),
    shownToStaff.join(', '),
  );
  for (const school of opponents) {
    note(
      `the owner is shown ${school.name}'s players' numbers on its page`,
      shownToStaff.includes(school.name),
      shownToStaff.join(', '),
    );
  }
  // Staff are shown a game's hidden lines too (staff-game-numbers.tsx): so on each of the
  // tracked school's games the check is seen to find them, and could find a leak there.
  for (const [kind, , label] of list) {
    if (kind !== 'game' || !label.startsWith(`${tracked.name}'s game`)) continue;
    note(
      `the owner is shown the hidden numbers on ${label}`,
      shownToStaff.includes(label),
      shownToStaff.join(', '),
    );
  }
  await visitor.close();
  await staff.close();
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Demo hidden numbers browser check failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `Demo hidden numbers browser check passed: ${checked.length} checks in a real browser.`,
);
