// Step 2.93 part 2 (record 069): the public home, schedule and standings pages read from
// the made-up database, in a real browser. The web app is started on its made-up
// database (APP_ENV=test, LOCAL_DATA=made-up-database): every migration and the two seed
// leagues in memory, each season under way (a game a week ago with its score and one a
// week on in each division). Nothing leaves this computer; every league and team is made
// up. Builds the app first unless given --no-build (npm run test:web:browser builds it
// once in web-exit-test.mjs, then runs this with --no-build). The same pages on the
// stand-in are checked by web-exit-test.mjs and one-world-test.mjs.
//
// For each seed league: the home page shows its season, its result and its standings;
// the schedule lists the season's four games, two with their final scores; the standings
// show both divisions' three teams, with one win and one loss in each; no team of the
// stand-in's made-up leagues appears; each page passes the accessibility checks. The
// statistics have not moved yet (part 3): their page is the error page, never made-up
// data.
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

/**
 * The seed leagues as packages/database/src/seed/seed-data.ts makes them, and what their
 * seasons under way hold (seed-season-under-way.ts): in each division its first two teams
 * played (one final), and its second and third play next.
 */
const leagues = [
  {
    slug: 'lakeside',
    season: 'Winter Season',
    divisions: {
      North: ['Lakeside Herons', 'Lakeside Otters', 'Lakeside Pines'],
      South: ['Lakeside Gulls', 'Lakeside Foxes', 'Lakeside Owls'],
    },
    finals: 2,
    teamsPlaying: 6,
  },
  {
    slug: 'maple-street',
    season: 'Spring Season',
    divisions: { Open: ['Maple Comets', 'Maple Rockets', 'Maple Hawks', 'Maple Bears'] },
    finals: 1,
    teamsPlaying: 3,
  },
];
/** Whether a page's text holds some words, whatever case the page's styles draw them in. */
const has = (text, words) => text.toLowerCase().includes(words.toLowerCase());
/** What only the stand-in's made-up leagues hold, which must never show on the database. */
const standInOnly = /Falcons|Badgers|Lions|Tigers|Meteors|Fall 2026|North Valley|Harbor City/i;

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
    PUBLIC_BASE_URL: origin,
  });
  await step('starting the server on the made-up database and the browser', async () => {
    await waitFor(`${origin}/`, server);
    browser = await launch();
  });
}

if (browser) {
  const visitor = await browser.newContext();
  const page = await visitor.newPage();
  page.setDefaultTimeout(60_000);
  const open = async (address) => {
    const response = await page.goto(origin + address);
    await page.locator('main').first().waitFor();
    return { status: response?.status() ?? 0, text: await page.locator('main').innerText() };
  };
  const accessible = async (label) => {
    const problems = await accessibilityProblems(page);
    note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
  };

  for (const league of leagues) {
    await step(`${league.slug}: the seed league's teams, read from the database`, async () => {
      const standings = await open(`/${league.slug}/standings`);
      note(`${league.slug}: the standings page is served`, standings.status === 200);
      const tables = await page.evaluate(() =>
        [...document.querySelectorAll('table.ui-standings')].map((table) =>
          [...table.querySelectorAll('tbody tr')].map((row) => ({
            team: row.querySelector('.ui-team-cell > [dir]')?.textContent?.trim() ?? '',
            cells: [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim()),
          })),
        ),
      );
      const divisions = Object.entries(league.divisions);
      note(
        `${league.slug}: the standings show a table per division, each with its teams`,
        JSON.stringify(tables.map((rows) => rows.length)) ===
          JSON.stringify(divisions.map(([, teams]) => teams.length)),
        JSON.stringify(tables.map((rows) => rows.map((r) => r.team))),
      );
      const teams = tables.flat().map((row) => row.team);
      const expected = divisions.flatMap(([, names]) => names).sort();
      note(
        `${league.slug}: the standings list the seed's teams`,
        JSON.stringify([...teams].sort()) === JSON.stringify(expected),
        teams.join(', '),
      );
      for (const [division] of divisions) {
        note(
          `${league.slug}: the standings name the ${division} division`,
          has(standings.text, division),
        );
      }
      note(
        `${league.slug}: each table holds its played game (a 1 for a win)`,
        tables.every((rows) => rows.some((row) => row.cells.includes('1'))),
        JSON.stringify(tables),
      );
      note(
        `${league.slug}: nothing of the stand-in in the standings`,
        !standInOnly.test(standings.text),
      );
      await accessible(`/${league.slug}/standings on the database`);

      const schedule = await open(`/${league.slug}/schedule`);
      note(`${league.slug}: the schedule page is served`, schedule.status === 200);
      note(`${league.slug}: the schedule names its season`, has(schedule.text, league.season));
      const named = expected.filter((team) => has(schedule.text, team));
      note(
        `${league.slug}: the schedule shows the season's games, teams by name`,
        named.length === league.teamsPlaying,
        named.join(', '),
      );
      note(
        `${league.slug}: the schedule shows the played games as final`,
        (schedule.text.match(/\bFinal\b/gi) ?? []).length >= league.finals,
        schedule.text.slice(0, 400),
      );
      note(
        `${league.slug}: nothing of the stand-in on the schedule`,
        !standInOnly.test(schedule.text),
      );
      await accessible(`/${league.slug}/schedule on the database`);

      const home = await open(`/${league.slug}`);
      note(`${league.slug}: the home page is served`, home.status === 200);
      note(`${league.slug}: the home page names the season`, has(home.text, league.season));
      note(
        `${league.slug}: the home page shows the standings' teams`,
        expected.every((team) => has(home.text, team)),
      );
      note(
        `${league.slug}: nothing of the stand-in on the home page`,
        !standInOnly.test(home.text),
      );
      await accessible(`/${league.slug} on the database`);
    });
  }

  await step('the statistics have not moved yet (part 3)', async () => {
    const response = await page.goto(`${origin}/lakeside/stats`);
    const text = await page.locator('body').innerText();
    note(
      'statistics: the error page, not a page of statistics',
      (response?.status() ?? 0) >= 500 && !has(text, 'Lakeside Herons'),
      `status ${response?.status()}`,
    );
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Public pages on the database browser check failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `Public pages on the database browser check passed: ${checked.length} checks in a real browser.`,
);
