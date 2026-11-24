// Step 2.62, part A: a game night in one walk, in a real browser against the web app on its
// made-up stand-in (APP_ENV=test). Nothing leaves this computer; every team and player is made
// up (apps/web/src/server/stand-in-games.ts). Builds the app first unless given --no-build.
//
// The made-up scorekeeper (signed in by their session, as the other browser tests sign in)
// opens North Valley's live game, Hawks at home to Bears, on the scoring screen and scores it
// by taps (tracker-driver.mjs, as scoring-screen-test.mjs taps), while a visitor's phone shows
// the game's public page: each play, one by one, is on that second screen within 2 seconds,
// measured from the tap until the page shows the play's words and the score it makes. Then
// the made-up owner takes the game over on a second tablet's scoring screen: the first one
// says it can score no more, the owner taps on, each play still on the second screen within
// 2 seconds, and ends the game. The standings and the statistics move by the numbers counted
// from the plays tapped, and the Bears, whose players' numbers are for their staff only, are
// named on none of these pages. Accessibility checks (T-186) on every page the visitor opens.
//
// The same parts are proven one by one elsewhere: live-game-test.mjs (one play on two screens,
// the snapshot fallbacks), scoring-trouble-test.mjs (a takeover learnt on the scoring screen),
// first-test-walk-test.mjs (a game ended on the scoring screen, then the standings). The
// demo-shaped league on the made-up database cannot be scored live within 2 seconds yet: the
// database has no live service (database-ports.ts, `liveFeed: null`; steps 2.124 and 2.116),
// so a watcher there asks for the snapshot every 5 seconds; this walk is on the stand-in.
import { leagueUrl } from '@srleagues/core';
import { court, owner, scorekeeper, starters, trackerPath } from './tracker-driver.mjs';
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

// The made-up league and game (stand-in-games.ts); the Hawks' #3 is Max Hawkins
// (stand-in-world-seed.ts, players numbered 3, 5, 7, 9, 11, 13 in roster order).
const league = { slug: 'north-valley' };
const gameId = '01900000-0000-7000-8000-006a00000002';
/** The Bears' made-up players: their numbers are for the Bears' staff only (S-22). */
const bearsNames = ['Sol', 'Tam', 'Uma', 'Vic', 'Wes', 'Xan', 'Bearsley'];
const teamName = { home: 'Hawks', away: 'Bears' };
const pages = {
  game: leagueUrl(league, 'game', { game: gameId }),
  standings: leagueUrl(league, 'standings'),
  // Totals, not the page's first view of averages: a game's numbers are added, not averaged.
  stats: `${leagueUrl(league, 'stats')}?by=total`,
};
/** The longest a play may take to reach the second screen (P9 §3, item 3; T6 §11). */
const withinMs = 2_000;
const tablet = { width: 1180, height: 820 };

/** The plays tapped, in order: who taps, the side, the jersey and the option. */
const plays = [
  ['keeper', 'home', 3, 'p3'],
  ['keeper', 'away', 3, 'p2'],
  ['keeper', 'away', 5, 'foul'],
  ['keeper', 'home', 5, 'p2'],
  ['keeper', 'home', 7, 'p2'],
  ['keeper', 'away', 7, 'p2'],
  ['owner', 'home', 9, 'p2'],
  ['owner', 'away', 9, 'p3'],
  ['owner', 'home', 11, 'p1'],
];
const pointsOf = (act) => ({ p1: 1, p2: 2, p3: 3 })[act] ?? 0;
/** Counted from the plays: each team's points, and Max's (the Hawks' #3). */
const counted = {
  home: plays.filter((p) => p[1] === 'home').reduce((n, p) => n + pointsOf(p[3]), 0),
  away: plays.filter((p) => p[1] === 'away').reduce((n, p) => n + pointsOf(p[3]), 0),
  max: plays.filter((p) => p[1] === 'home' && p[2] === 3).reduce((n, p) => n + pointsOf(p[3]), 0),
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
if (built) {
  server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  await step('starting the server and the browser', async () => {
    await waitFor(`${origin}/`, server);
    browser = await launch();
  });
}

async function accessible(page, label) {
  const problems = await accessibilityProblems(page);
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
}

/** Every standings table on the page: its column headings and each team's cells. */
const standingsOf = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('table.ui-standings')].map((table) => ({
      headers: [...table.querySelectorAll('thead th[scope="col"]')].map((th) =>
        th.textContent.trim(),
      ),
      rows: [...table.querySelectorAll('tbody tr')].map((tr) => ({
        team: tr.querySelector('th[scope="row"]')?.textContent.trim() ?? '',
        cells: [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()),
      })),
    })),
  );
/** A team's row in the first table that has it: its numbers by column heading. */
function rowOf(tables, team) {
  for (const table of tables) {
    const row = table.rows.find((r) => r.team.includes(team));
    if (!row) continue;
    const headers = table.headers.slice(table.headers.length - row.cells.length);
    return Object.fromEntries(headers.map((h, i) => [h, Number.parseFloat(row.cells[i])]));
  }
  return null;
}
/** Every table of the statistics page: headings and each row's cells, its name first. */
const tablesOf = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('main table')].map((table) => ({
      headers: [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim()),
      rows: [...table.querySelectorAll('tbody tr')].map((tr) =>
        [...tr.querySelectorAll('th, td')].map((cell) => cell.textContent.trim()),
      ),
    })),
  );
/**
 * The points of the first row named `name` in the table of `kind` ('Player' or 'Team', its
 * first column's heading): 0 when no row has it yet.
 */
function pointsIn(tables, kind, name) {
  for (const table of tables.filter((t) => t.headers[0]?.includes(kind))) {
    const row = table.rows.find((cells) => cells[0]?.includes(name));
    const column = table.headers.findIndex((h) => /\bPTS\b/.test(h));
    if (!row || column < 0) continue;
    const value = Number.parseFloat(row[column + row.length - table.headers.length]);
    return Number.isNaN(value) ? 0 : value;
  }
  return 0;
}
/** Whether a Bears player is named, word by word, in a page's words. */
const namesABear = (text) => bearsNames.some((name) => new RegExp(`\\b${name}\\b`).test(text));
const rose = (before, after, column) => (after?.[column] ?? NaN) - (before?.[column] ?? NaN);

/** A visitor's page, opened fresh, waited for. */
async function visit(context, address) {
  const page = await context.newPage();
  await page.goto(origin + address);
  await page.locator('main').first().waitFor();
  return page;
}

/** A scorekeeper's tablet: a browser of its own, signed in, its scoring screen open. */
async function scoringTablet(cookie) {
  const context = await browser.newContext({ viewport: tablet });
  await context.addCookies([{ ...cookie, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  await page.goto(origin + trackerPath(gameId));
  const c = court(page);
  const { tookOver } = await c.open();
  return { context, page, c, tookOver };
}

/** What the second screen shows now: each team's score and the latest play's words. */
const shownOn = (page) =>
  page.evaluate(() => {
    const sides = [...document.querySelectorAll('.game-live .ui-scoreboard-side')];
    const scoreOf = (name) =>
      Number(
        sides
          .find((s) => s.querySelector('.ui-scoreboard-name')?.textContent.includes(name))
          ?.querySelector('.ui-scoreboard-score')?.textContent ?? NaN,
      );
    return {
      home: scoreOf('Hawks'),
      away: scoreOf('Bears'),
      latest:
        document.querySelector('.game-latest-play > span:not(.ui-visually-hidden)')?.textContent ??
        '',
    };
  });

if (browser) {
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let standingsBefore = [];
  let statsBefore = [];
  await step('the standings and statistics before the game', async () => {
    const standings = await visit(visitor, pages.standings);
    standingsBefore = await standingsOf(standings);
    note(
      'the standings list the Hawks and the Bears',
      !!rowOf(standingsBefore, 'Hawks') && !!rowOf(standingsBefore, 'Bears'),
      JSON.stringify(standingsBefore).slice(0, 400),
    );
    await standings.close();
    const stats = await visit(visitor, pages.stats);
    statsBefore = await tablesOf(stats);
    await stats.close();
  });

  const took = [];
  const tablets = {};
  let screen;
  const score = { home: 0, away: 0 };
  /** One play tapped on a tablet, timed from the tap until the second screen shows it. */
  const play = async ([who, side, jersey, act]) => {
    const before = Number(
      await screen.locator('[data-live-sequence]').getAttribute('data-live-sequence'),
    );
    score[side] += pointsOf(act);
    const started = Date.now();
    await tablets[who].c.play(side, jersey, act);
    await screen
      .waitForFunction(
        ({ home, away, words, before }) => {
          const sides = [...document.querySelectorAll('.game-live .ui-scoreboard-side')];
          const scoreOf = (name) =>
            Number(
              sides
                .find((s) => s.querySelector('.ui-scoreboard-name')?.textContent.includes(name))
                ?.querySelector('.ui-scoreboard-score')?.textContent ?? NaN,
            );
          const latest =
            document.querySelector('.game-latest-play > span:not(.ui-visually-hidden)')
              ?.textContent ?? '';
          return (
            scoreOf('Hawks') === home &&
            scoreOf('Bears') === away &&
            Number(document.querySelector('[data-live-sequence]')?.dataset.liveSequence) > before &&
            words.every((word) => latest.includes(word))
          );
        },
        // The play's own words: its team, and the points it scored.
        {
          ...score,
          words: [teamName[side], ...(pointsOf(act) > 0 ? [String(pointsOf(act))] : [])],
          before,
        },
        { timeout: 10_000 },
      )
      .catch(async (error) => {
        const shown = JSON.stringify(await shownOn(screen));
        throw new Error(`${side} #${jersey} ${act}: the second screen shows ${shown}: ${error}`);
      });
    took.push(Date.now() - started);
  };

  await step(
    'the scorekeeper opens the game on the scoring screen, a visitor watching',
    async () => {
      tablets.keeper = await scoringTablet(scorekeeper);
      note('the game was free for the scorekeeper to open', !tablets.keeper.tookOver);
      await tablets.keeper.c.pick('home', starters);
      await tablets.keeper.c.pick('away', starters);
      screen = await visit(visitor, pages.game);
      await screen.locator('[data-live-connection="open"]').waitFor({ timeout: 10_000 });
      await accessible(screen, 'the live game on the second screen');
    },
  );

  await step(
    'each of the scorekeeper’s taps is on the second screen within 2 seconds',
    async () => {
      for (const p of plays.filter((p) => p[0] === 'keeper')) await play(p);
    },
  );

  await step('a second scorekeeper takes the game over on another tablet', async () => {
    tablets.owner = await scoringTablet(owner);
    note('the second tablet was asked to take the game over', tablets.owner.tookOver);
    // The first tablet learns it by its next renewal of the hold (T-295) and says so.
    const keeper = tablets.keeper.page;
    await keeper
      .getByText(
        'Someone else is now scoring this game on another device. This device can no longer score it.',
      )
      .waitFor({ timeout: 20_000 });
    note(
      'the first tablet no longer shows the scoring screen once the game is taken over',
      (await tablets.keeper.c.root.count()) === 0,
    );
  });

  await step(
    'each of the second scorekeeper’s taps is on the second screen within 2 seconds',
    async () => {
      for (const p of plays.filter((p) => p[0] === 'owner')) await play(p);
    },
  );
  console.log(`game night: each play reached the second screen in ${took.join(', ')} ms`);
  note('every play was timed', took.length === plays.length, `${took.length} timed`);
  note(
    `every play reached the second screen within ${withinMs} ms`,
    took.length > 0 && Math.max(...took) <= withinMs,
    `${took.join(', ')} ms`,
  );

  await step('the second scorekeeper ends the game', async () => {
    const { c } = tablets.owner;
    await c.endGame();
    await c.root.locator('[data-final="saved"]').waitFor({ timeout: 20_000 });
    note('the game is ended and saved', true);
    await screen.reload();
    await screen.locator('main').first().waitFor();
    const shown = await shownOn(screen);
    const state = await screen.locator('.game-live .ui-scoreboard').getAttribute('data-state');
    note(
      `the game’s page reads final, ${counted.home} to ${counted.away}`,
      state === 'final' && shown.home === counted.home && shown.away === counted.away,
      `${state}: ${JSON.stringify(shown)}`,
    );
    note(
      'the game’s page names no Bears player',
      !namesABear(await screen.locator('main').innerText()),
    );
    await accessible(screen, 'the ended game');
  });

  await step('the standings move by the result', async () => {
    const page = await visit(visitor, pages.standings);
    const after = await standingsOf(page);
    const [hb, bb, ha, ba] = [
      rowOf(standingsBefore, 'Hawks'),
      rowOf(standingsBefore, 'Bears'),
      rowOf(after, 'Hawks'),
      rowOf(after, 'Bears'),
    ];
    const [winner, loser] =
      counted.home > counted.away
        ? [
            [hb, ha],
            [bb, ba],
          ]
        : [
            [bb, ba],
            [hb, ha],
          ];
    const columns = Object.keys(ha ?? {});
    const played = columns.filter((c) => rose(hb, ha, c) === 1 && rose(bb, ba, c) === 1);
    const won = columns.filter((c) => rose(...winner, c) === 1 && rose(...loser, c) === 0);
    const lost = columns.filter((c) => rose(...loser, c) === 1 && rose(...winner, c) === 0);
    const seen = JSON.stringify({ hb, ha, bb, ba });
    note('the standings count one more game for both teams', played.length > 0, seen);
    note('the standings count a win for the team with more points', won.length > 0, seen);
    note('the standings count a loss for the other', lost.length > 0, seen);
    const words = await page.locator('main').innerText();
    note('the standings name no Bears player', !namesABear(words));
    await accessible(page, 'the standings after the game');
    await page.close();
  });

  await step('the statistics move by the points tapped', async () => {
    const page = await visit(visitor, pages.stats);
    const after = await tablesOf(page);
    const grew = (kind, name) => pointsIn(after, kind, name) - pointsIn(statsBefore, kind, name);
    const seen = JSON.stringify(
      after.map((t) => [t.headers, t.rows.filter((r) => /Hawk|Bears/.test(r.join(' ')))]),
    ).slice(0, 900);
    note(`the Hawks’ points grew by ${counted.home}`, grew('Team', 'Hawks') === counted.home, seen);
    note(`the Bears’ points grew by ${counted.away}`, grew('Team', 'Bears') === counted.away, seen);
    note(
      `Max Hawkins’ points grew by ${counted.max}`,
      grew('Player', 'Max Hawkins') === counted.max,
      seen,
    );
    note(
      'the statistics name no Bears player',
      !namesABear(await page.locator('main').innerText()),
    );
    await accessible(page, 'the statistics after the game');
    await page.close();
  });
  for (const t of Object.values(tablets)) await t.context.close();
  await visitor.close();
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Game night browser check failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Game night browser check passed: ${checked.length} checks in a real browser.`);
