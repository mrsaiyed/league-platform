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
//    than the screen. On a phone (320, 360 and 390) home, standings and statistics each
//    have a table, every cell whole or scrolling in its own box, and no team's name broken
//    inside a word.
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

/**
 * The table cells on the page that a person on this screen cannot see whole and cannot
 * scroll to: a cell is fine when it lies inside the screen, or inside a box that scrolls
 * sideways (the table's own box, which DESIGN.md line 14 allows), and not fine when a box
 * that hides what overflows cuts it, or it runs past the screen's edge with no box to
 * scroll. A cell's own text cut short by the cell counts too, and so does a cell standing
 * half in view at the edge of its scrolling box while the table is at rest, or holding
 * words or a text box under the fade of that edge. The width check above only
 * sees a page wider than the screen, and a table cut inside a hidden box is not that.
 */
async function clippedCells(page) {
  return page.evaluate(() => {
    const out = [];
    const width = document.documentElement.clientWidth;
    for (const [t, table] of [...document.querySelectorAll('main table')].entries()) {
      for (const cell of table.querySelectorAll('th, td')) {
        const box = cell.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        const name = `table ${t + 1} "${(cell.textContent ?? '').trim().slice(0, 20)}"`;
        const own = getComputedStyle(cell);
        if (own.overflowX !== 'visible' && cell.scrollWidth > cell.clientWidth + 1) {
          out.push(`${name}: its text is cut by the cell`);
          continue;
        }
        let clip = null;
        for (let e = cell.parentElement; e && e !== document.body; e = e.parentElement) {
          if (getComputedStyle(e).overflowX !== 'visible') {
            clip = e;
            break;
          }
        }
        const scrolls = clip && ['auto', 'scroll'].includes(getComputedStyle(clip).overflowX);
        const edge = clip ? clip.getBoundingClientRect() : { left: 0, right: width };
        if (scrolls) {
          // In a box that scrolls, at rest a cell is wholly in view or wholly out of it (the
          // first one to scroll to starts at the box's edge): never half in view.
          const end = edge.left + clip.clientWidth;
          if (box.left < end - 1 && box.right > end + 1) {
            out.push(
              `${name}: half in view, ${Math.round(box.left)}..${Math.round(box.right)} at an edge of ${Math.round(end)}`,
            );
          }
          // While the box goes on, its far edge fades (DESIGN.md line 14, 16 wide): what a
          // cell wholly in view holds (its words or its text box) stands clear of that fade
          // but for a sliver, so the last column in view is never read half faded.
          const goesOn = clip.scrollWidth > clip.clientWidth + 1;
          if (goesOn && box.right <= end + 1) {
            // The words drawn (not those kept for screen readers only), or the text box.
            const field = cell.querySelector('input, select');
            let ends = field ? field.getBoundingClientRect().right : 0;
            const walk = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
            for (let n = walk.nextNode(); n && !field; n = walk.nextNode()) {
              if (!n.textContent.trim() || n.parentElement.closest('.ui-visually-hidden')) continue;
              const range = document.createRange();
              range.selectNodeContents(n);
              for (const r of range.getClientRects()) ends = Math.max(ends, r.right);
            }
            const held = { width: ends, right: ends };
            if (held.width > 0 && held.right > end - 12) {
              out.push(
                `${name}: under the far edge's fade, ends ${Math.round(held.right)} of ${Math.round(end)}`,
              );
            }
          }
          continue;
        }
        const right = Math.min(edge.right, width);
        const left = Math.max(edge.left, 0);
        if (box.right > right + 1 || box.left < left - 1) {
          out.push(
            `${name}: ${Math.round(box.left)}..${Math.round(box.right)} of ${left}..${right}`,
          );
        }
      }
    }
    return out;
  });
}

/**
 * The team names of the page's tables whose words are broken inside a word: a name wraps
 * only between its words, so each word's own letters stand on one line (a range over the
 * word has one line box). Also gives the narrowest team column seen, to say in a failure.
 */
async function brokenNames(page) {
  return page.evaluate(() => {
    const out = [];
    for (const name of document.querySelectorAll('main table .ui-team-name')) {
      const cell = name.closest('th, td');
      for (const node of name.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const text = node.textContent ?? '';
        for (const m of text.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, m.index);
          range.setEnd(node, m.index + m[0].length);
          const rects = [...range.getClientRects()];
          const tops = new Set(rects.map((r) => Math.round(r.top)));
          if (tops.size > 1) {
            const long = Math.round(rects.reduce((sum, r) => sum + r.width, 0));
            out.push(
              `"${m[0]}" (${long} px) in ${tops.size} lines (cell ${Math.round(cell.clientWidth)} px)`,
            );
          }
        }
      }
    }
    return out;
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

  // On a phone, the tables of home, standings and statistics: there is a table, each cell
  // is whole or scrolls in its own box, and no team's name is broken inside a word.
  const phoneTables = async (page, label, width) => {
    note(`${label} at ${width}: has a table`, (await page.locator('main table').count()) > 0);
    const cut = await clippedCells(page);
    note(
      `${label} at ${width}: every table cell is on the screen or in a box that scrolls`,
      cut.length === 0,
      cut.slice(0, 6).join('; '),
    );
    if (label === 'home' || label === 'standings') {
      const broken = await brokenNames(page);
      note(
        `${label} at ${width}: no team's name is broken inside a word`,
        broken.length === 0,
        broken.slice(0, 6).join('; '),
      );
    }
  };
  for (const width of [320, 360]) {
    await step(`home, standings and statistics at ${width} wide`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      page.setDefaultTimeout(60_000);
      for (const [label, address] of pages) {
        if (!['home', 'standings', 'statistics'].includes(label)) continue;
        await page.goto(origin + address);
        const wide = await page.evaluate(() => document.documentElement.scrollWidth);
        note(`${label} at ${width}: no wider than the screen`, wide <= width, `${wide} px`);
        await phoneTables(page, label, width);
        if (shots && label !== 'statistics') {
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
        if (width === 390 && ['home', 'standings', 'statistics'].includes(label)) {
          await phoneTables(page, label, 390);
        }
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
    // One typed final game's page in the admin, on a phone: its stat table is whole or
    // scrolls inside its own box, never cut at the screen's edge.
    const typed = pages.find(([label]) => label === 'a typed final game')?.[1];
    note('a typed final game to open in the admin', typed !== undefined);
    if (typed !== undefined) {
      for (const width of [320, 360, 390]) {
        await page.setViewportSize({ width, height: 844 });
        const answer = await page.goto(`${origin}/${slug}/admin/games/${typed.split('/').pop()}`);
        note(`the admin's game page at ${width} answers 200`, answer?.status() === 200);
        note(
          `the admin game page at ${width} has a stat table`,
          (await page.locator('main table').count()) > 0,
        );
        const cut = await clippedCells(page);
        note(
          `the admin's game page at ${width}: every table cell is on the screen or in a box that scrolls`,
          cut.length === 0,
          cut.slice(0, 6).join('; '),
        );
      }
    }
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
