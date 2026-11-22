// Step 2.236, part 3: a simulated league, made by the web app at start, opened in a real
// browser. The app is started on its made-up database with LOCAL_SIMULATED_LEAGUE set to a
// size in `npm run simulate`'s words (12 teams, 2 divisions, 6 rounds, 2 tracked, seed 3):
// at start it plays that season from empty to its final tables through the product's own
// commands, the same code as the command (packages/database/src/seed/simulate-league.ts).
// Nothing leaves this computer; every league, team and person is made up.
//
// 1. As a visitor, at 390 and at 1280 wide: home, schedule, standings, statistics, two
//    teams, a typed final game, a tracked final game (its box score and play by play), the
//    overtime game when this size has one ("Final, OT"), a postponed game still waiting and
//    a forfeited game, each saying so. Each answers 200, shows no error and is no wider
//    than the screen.
// 2. The standings' games played for one team are what the simulator's own check counts:
//    its games, less those never played.
// 3. As the league's owner, signed in on "Be a made-up person": Admin → Games shows the
//    game still waiting for a new date.
// Builds the app first unless given --no-build; with --shots <folder>, also saves pictures
// of home and standings at both widths there.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  neverPlayed,
  planSimulation,
  simulatedOwner,
} from '../../packages/database/src/seed/simulate-league-plan.ts';
import {
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
  whatWentWrong,
} from './web-browser-kit.mjs';

const size = { teams: 12, divisions: 2, rounds: 6, tracked: 2, seed: 3 };
const plan = planSimulation(size);
const { slug } = plan;
const shotsAt = process.argv.indexOf('--shots');
const shots = shotsAt === -1 ? null : path.resolve(process.argv[shotsAt + 1]);

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
const started = Date.now();
if (built) {
  server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    LOCAL_DATA: 'made-up-database',
    LOCAL_SIMULATED_LEAGUE: Object.entries(size)
      .map(([name, value]) => `--${name} ${value}`)
      .join(' '),
    PUBLIC_BASE_URL: origin,
  });
  await step('starting the server with a simulated league, and the browser', async () => {
    await waitFor(`${origin}/`, server, [{ address: `/${slug}/standings` }]);
    browser = await launch();
  });
}

/** The game pages the schedule links to, each with its page's text, fetched once. */
async function gamePages() {
  const schedule = await (await fetch(`${origin}/${slug}/schedule`)).text();
  const addresses = [...new Set(schedule.match(new RegExp(`/${slug}/games/[0-9a-f-]+`, 'g')))];
  return Promise.all(
    addresses.map(async (address) => {
      const html = await (await fetch(origin + address)).text();
      // The page's main part only, its tags taken out: what a person reads there.
      const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
      return { address, text: main.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ') };
    }),
  );
}

if (browser) {
  const games = await gamePages();
  const find = (label, test) => {
    const found = games.find(({ text }) => test(text));
    note(`the schedule links to ${label}`, found !== undefined);
    return found?.address;
  };
  const tracked = (text) => text.includes('Play by play') && text.includes('Box scores');
  const special = [
    ['a typed final game', (t) => t.includes('No statistics were recorded for this game.')],
    ['a tracked final game', (t) => tracked(t) && !t.includes('Final, OT')],
    ...(plan.games.some((g) => g.overtime)
      ? [['the overtime game, "Final, OT"', (t) => tracked(t) && t.includes('Final, OT')]]
      : []),
    ['a postponed game still waiting', (t) => t.includes('This game has been postponed.')],
    ['a forfeited game', (t) => / forfeited this game\./.test(t)],
  ];
  const [first, second] = plan.divisions.map((division) => division.teams[0]);
  const pages = [
    ['home', `/${slug}`],
    ['schedule', `/${slug}/schedule`],
    ['standings', `/${slug}/standings`],
    ['statistics', `/${slug}/stats`],
    [`${first.name}'s page`, `/${slug}/teams/${first.shortName}`],
    [`${second.name}'s page`, `/${slug}/teams/${second.shortName}`],
    ...special.map(([label, test]) => [label, find(label, test)]),
  ].filter(([, address]) => address !== undefined);
  note(`the season has ${plan.games.length} games, every one linked`, games.length > 30);

  for (const width of [390, 1280]) {
    await step(`the league's pages at ${width} wide`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      page.setDefaultTimeout(60_000);
      for (const [label, address] of pages) {
        const response = await page.goto(origin + address);
        const text = await page.locator('main').first().innerText();
        note(`${label} at ${width}: answers 200`, response?.status() === 200);
        note(
          `${label} at ${width}: shows no error`,
          !/went wrong|cannot be shown|\berror\b/i.test(text),
        );
        const wide = await page.evaluate(() => document.documentElement.scrollWidth);
        note(`${label} at ${width}: no wider than the screen`, wide <= width, `${wide} px`);
        if (shots && (label === 'home' || label === 'standings')) {
          mkdirSync(shots, { recursive: true });
          await page.screenshot({
            path: `${shots}/simulated-${label}-${width}.png`,
            fullPage: true,
          });
        }
      }
      await context.close();
    });
  }

  await step("the standings' games played are the simulator's count", async () => {
    const page = await browser.newPage();
    await page.goto(`${origin}/${slug}/standings`);
    const played = await page.evaluate((team) => {
      for (const table of document.querySelectorAll('main table')) {
        const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
        const column = heads.indexOf('GP');
        for (const row of table.querySelectorAll('tbody tr')) {
          if (column >= 0 && row.textContent.includes(team)) {
            return Number(row.children[column]?.textContent.trim());
          }
        }
      }
      return null;
    }, first.name);
    const counted = plan.games.filter(
      (g) => (g.home === first.name || g.away === first.name) && !neverPlayed(g.callOff),
    ).length;
    note(
      `${first.name}: ${counted} games played in the standings`,
      played === counted,
      `${played}`,
    );
    await page.close();
  });

  await step('the owner sees the game still waiting in Admin → Games', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    await page.goto(`${origin}/signin/made-up-people`);
    await page.getByRole('heading', { level: 1, name: 'Be a made-up person' }).waitFor();
    await Promise.all([
      page.waitForURL((url) => url.pathname !== '/signin/made-up-people'),
      page
        .getByRole('button', { name: `Open ${plan.name} as ${simulatedOwner.displayName}` })
        .click(),
    ]);
    // On the made-up database a first sign-in is a sign-up: "Choose your password", then on.
    if (new URL(page.url()).pathname === '/signup/password') {
      await page.getByLabel('Password').fill('a made-up chosen password');
      await Promise.all([
        page.waitForURL((url) => url.pathname !== '/signup/password'),
        page.getByRole('button', { name: 'Save and sign in' }).click(),
      ]);
    }
    note(
      'the owner is taken to the league’s admin',
      new URL(page.url()).pathname === `/${slug}/admin`,
      page.url(),
    );
    const response = await page.goto(`${origin}/${slug}/admin/games`);
    const text = await page.locator('main').first().innerText();
    note('Admin → Games answers 200 for the owner', response?.status() === 200);
    const waiting = plan.games.find((g) => g.callOff?.kind === 'postponed-waiting');
    note(
      'Admin → Games shows the game waiting for a new date',
      /waiting for a new date/i.test(text) &&
        waiting !== undefined &&
        text.includes(waiting.home) &&
        text.includes(waiting.away),
      `${page.url()} ${waiting?.home} v ${waiting?.away}: ${text.slice(0, 1200)}`,
    );
    await context.close();
  });
}

await browser?.close();
server?.child.kill();
const seconds = ((Date.now() - started) / 1000).toFixed(0);

if (failures.length > 0) {
  console.error(`Simulated league browser check failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `Simulated league browser check passed: ${checked.length} checks in a real browser, ${seconds} s from the start.`,
);
