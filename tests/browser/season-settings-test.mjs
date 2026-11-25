// Step 2.47: Season settings, in a real browser at phone width (390), on the web app's
// made-up stand-in (APP_ENV=test). Nothing leaves this computer; every league, team and
// season is made up. Builds the app first unless given --no-build; --dev runs `next dev`.
//
// The made-up owner, with scripts off, starts at the admin's home and only taps from
// there: Season settings shows every part of the current season (Fall 2026, which has
// results) and never the word "program". The game rules: "Use High school" fills the
// boxes and saves nothing, Save saves them and "Saved" is said beside the part. The
// standings: a tiebreaker chosen twice is refused beside its box, with everything typed
// kept; putting points scored first asks before saving, naming the teams it moves, while
// a visitor's table is still as it was; "Yes" saves it, and the visitor's table follows.
// The columns: the owner unticks DIFF and ticks PF and STRK, and the visitor's table
// draws exactly the columns chosen, in their order. Then with scripts on: a refused name
// keeps what was typed, and the name and dates are saved with "Saved" beside them, where
// the person is looking. A scheduler is refused Season settings and its forms' steps.
import {
  accessibilityProblems,
  buildNext,
  freePort,
  leagueDay,
  launch,
  openStaffMenu,
  startNext,
  waitFor,
  whatWentWrong,
} from './web-browser-kit.mjs';

// The live season's first and last day, as far from the made-up world's today (it reads this
// computer's clock) as the days this was written with: whatever day it is run (T-404).
const worldNow = new Date().toISOString();
const firstDay = leagueDay(worldNow, -85);
const failures = [];
const checked = [];
const note = (label, ok, detail = '') => {
  checked.push(label);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const dev = process.argv.includes('--dev');
let built = true;
if (!dev && !process.argv.includes('--no-build')) {
  built = await buildNext();
  if (!built) failures.push('next build failed or took over 10 minutes');
}

const screen = { width: 390, height: 844 };

if (built) {
  const origin = `http://localhost:${await freePort()}`;
  const port = new URL(origin).port;
  const server = startNext(dev ? ['dev', '--port', port] : ['start', '--port', port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  let browser;
  let at = 'starting';
  try {
    const owner = 'srl_session=local-owner-token';
    await waitFor(`${origin}/`, server, [
      { address: '/north-valley/admin', cookie: owner },
      { address: '/north-valley/admin/season', cookie: owner },
      { address: '/north-valley/admin/season?season=fall-2026&edit=game', cookie: owner },
      { address: '/north-valley/standings?season=fall-2026' },
    ]);
    browser = await launch();
    const pageAs = async (token, scripts = false) => {
      const context = await browser.newContext({ javaScriptEnabled: scripts, viewport: screen });
      if (token !== undefined) {
        await context.addCookies([{ name: 'srl_session', value: token, url: origin }]);
      }
      const page = await context.newPage();
      page.setDefaultTimeout(dev ? 120_000 : 60_000);
      return page;
    };
    const accessible = async (on, label) => {
      const problems = await accessibilityProblems(on);
      note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
      const wide = await on.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      );
      note(`no sideways scrolling at phone width: ${label}`, wide);
    };
    /** Taps a link or button with scripts off, waits for the page it leads to. */
    const tap = async (on, locator, url) => {
      await Promise.all([on.waitForEvent('load'), locator.click()]);
      if (url !== undefined && !url.test(on.url())) {
        throw new Error(`landed on ${on.url()}, not ${url}`);
      }
    };
    const panel = (on, part) => on.locator(`#season-${part}`);
    const change = (on, part, name) =>
      tap(on, panel(on, part).getByRole('link', { name }), new RegExp(`edit=${part}`));
    /** The visitor's standings: each table's headings and teams in order. */
    const visitor = await pageAs(undefined);
    // Only the cells a visitor sees: a column left out of its place on a phone is drawn a
    // second time after the percentage and one of the two is never displayed (table-css.ts).
    const publicTables = async (width = screen.width) => {
      await visitor.setViewportSize({ width, height: screen.height });
      await visitor.goto(`${origin}/north-valley/standings?season=fall-2026`);
      return visitor.evaluate(() => {
        const shown = (cell) => getComputedStyle(cell).display !== 'none';
        return [...document.querySelectorAll('table.ui-standings')].map((table) => ({
          heads: [...table.querySelectorAll('thead th')]
            .filter(shown)
            .map((th) => th.textContent.trim()),
          rowCells: [...table.querySelectorAll('tbody tr')].map(
            (tr) => [...tr.children].filter(shown).length,
          ),
          teams: [...table.querySelectorAll('tbody .ui-team-name')].map((n) =>
            n.textContent.trim(),
          ),
        }));
      });
    };

    at = 'the owner opens Season settings from the admin';
    const page = await pageAs('local-owner-token');
    await page.goto(`${origin}/north-valley/admin`);
    await openStaffMenu(page);
    await tap(
      page,
      page.locator('nav').getByRole('link', { name: 'Season settings', exact: true }).first(),
      /\/admin\/season$/,
    );
    const main = await page.locator('main').innerText();
    for (const title of ['Name and dates', 'Game rules', 'Games and statistics', 'Standings']) {
      note(`Season settings shows "${title}"`, main.includes(title));
    }
    note(
      'the roster limits and lock date are marked "Not in use yet"',
      (await panel(page, 'rosters').getByText('Not in use yet').count()) === 2,
    );
    note('a league with one program never reads "program"', !/program/i.test(main));
    await accessible(page, 'Season settings');

    at = 'the owner chooses a preset for the game rules';
    await change(page, 'game', 'Change the game rules');
    await accessible(page, "the game rules' form");
    await tap(page, page.getByRole('button', { name: 'Use High school' }), /edit=game/);
    note(
      'the preset fills the boxes: four 8-minute quarters',
      (await page.locator('input[name=periods][value="4"]').isChecked()) &&
        (await page.locator('input[name=periodMinutes]').inputValue()) === '8',
    );
    note(
      'and says nothing is saved yet',
      (await page.locator('[data-filled]').innerText()).includes('nothing is saved until you save'),
    );
    await tap(page, page.getByRole('button', { name: 'Save the game rules' }), /#season-game$/);
    const game = await panel(page, 'game').innerText();
    note(
      '"Saved" is said beside the game rules, which are now the preset',
      game.includes('Saved: the game rules.') &&
        game.includes('Four quarters of 8 minutes') &&
        game.includes('High school'),
      game,
    );
    note(
      '"Saved" is said once: a reload says nothing old',
      ((await page.reload()) !== null &&
        (await panel(page, 'game').innerText()).includes('Saved:')) === false,
    );

    at = 'the owner chooses one tiebreaker twice';
    const before = await publicTables();
    await change(page, 'standings', 'Change the standings rules');
    await accessible(page, "the standings' form");
    await page.locator('select[name=tiebreaker2]').selectOption('head-to-head');
    await page.locator('input[name=forfeitWinner]').fill('25');
    await tap(
      page,
      page.getByRole('button', { name: 'Save the standings rules' }),
      /edit=standings/,
    );
    const second = page.locator('select[name=tiebreaker2]');
    note(
      'the second tiebreaker is marked, and says why beside it',
      (await second.getAttribute('aria-invalid')) === 'true' &&
        (await page.locator('main').innerText()).includes(
          'Second tiebreaker: each tiebreaker can be chosen once.',
        ),
    );
    note(
      'everything typed is kept',
      (await second.inputValue()) === 'head-to-head' &&
        (await page.locator('input[name=forfeitWinner]').inputValue()) === '25',
    );
    await accessible(page, 'a refused save');

    at = 'the owner changes a tiebreaker after a result';
    await page.locator('select[name=tiebreaker1]').selectOption('points-scored');
    await second.selectOption('point-difference');
    await page.locator('select[name=tiebreaker3]').selectOption('');
    await page.locator('input[name=forfeitWinner]').fill('20');
    await tap(
      page,
      page.getByRole('button', { name: 'Save the standings rules' }),
      /edit=standings/,
    );
    const ask = page.locator('[data-rules-ask]');
    const asked = await ask.innerText();
    note(
      'saving asks first, naming each team it moves and how',
      /Saving these rules moves \d+ teams in the standings of Fall 2026:/.test(asked) &&
        asked.includes('Falcons (East): place 2 to 1.'),
      asked,
    );
    await accessible(page, 'the question before moving teams');
    note(
      "while it is asked, the visitor's table has not moved",
      JSON.stringify(await publicTables()) === JSON.stringify(before),
    );
    await tap(
      page,
      ask.getByRole('button', { name: 'Yes, save and move them' }),
      /#season-standings$/,
    );
    const standings = await panel(page, 'standings').innerText();
    note(
      '"Saved" is said beside the standings, with the new order of tiebreakers',
      standings.includes('Saved: the standings rules.') &&
        standings.includes('Points scored, then point difference'),
      standings,
    );
    const after = await publicTables();
    note(
      "the visitor's table follows: Falcons first in their division",
      after.some((table) => table.teams[0] === 'Falcons') &&
        JSON.stringify(after) !== JSON.stringify(before),
      JSON.stringify(after.map((t) => t.teams)),
    );

    at = 'the owner changes the columns';
    await change(page, 'standings', 'Change the standings rules');
    await page.getByLabel('Point difference (DIFF)').uncheck();
    await page.getByLabel('Points scored (PF)').check();
    await page.getByLabel('Streak (STRK)').check();
    await tap(
      page,
      page.getByRole('button', { name: 'Save the standings rules' }),
      /#season-standings$/,
    );
    // On a phone games played stands straight after the percentage, one scroll away; wider,
    // every column chosen is in its own place. At every width each column is shown once and
    // every row has a cell under each heading shown.
    for (const [width, order] of [
      [1280, 'GP W L PCT PF STRK'],
      [768, 'GP W L PCT PF STRK'],
      [320, 'W L PCT GP PF STRK'],
      [screen.width, 'W L PCT GP PF STRK'],
    ]) {
      const tables = await publicTables(width);
      const heads = tables.map((table) =>
        table.heads.slice(table.heads.indexOf('Team') + 1).join(' '),
      );
      note(
        `the visitor's table shows exactly the columns chosen, in their order, at ${width}`,
        heads.length > 0 && heads.every((h) => h === order),
        JSON.stringify(heads),
      );
      note(
        `every row of the visitor's table has one cell under each heading shown, at ${width}`,
        tables.every((table) => table.rowCells.every((n) => n === table.heads.length)),
        JSON.stringify(tables.map((table) => [table.heads.length, table.rowCells])),
      );
    }
    await accessible(visitor, "the visitor's standings");

    at = 'the owner, with scripts on, changes the name and dates';
    const live = await pageAs('local-owner-token', true);
    await live.goto(`${origin}/north-valley/admin/season?season=fall-2026`);
    await panel(live, 'name').getByRole('link', { name: 'Change the name and dates' }).click();
    await live.waitForURL(/edit=name/);
    await live.getByLabel('Season name').fill(' ');
    await live.getByLabel('First day').fill(firstDay);
    await live.getByRole('button', { name: 'Save the name and dates' }).click();
    const nameBox = live.getByLabel('Season name');
    await live.locator('#season-name [data-problem=part]').waitFor({ timeout: 10_000 });
    note(
      'with scripts on, an empty name is refused beside its box, the day kept',
      (await nameBox.getAttribute('aria-invalid')) === 'true' &&
        (await live.getByLabel('First day').inputValue()) === firstDay,
    );
    await nameBox.fill('Fall 2026 Season');
    await live.getByLabel('Last day').fill(leagueDay(worldNow, 17));
    await live.getByRole('button', { name: 'Save the name and dates' }).click();
    // The answer itself, ten seconds at most; then where the browser landed.
    const saved = live.locator('#season-name [data-notice=saved]');
    await saved.waitFor({ timeout: 10_000 });
    note('with scripts on, the save lands at the name and dates', /#season-name$/.test(live.url()));
    const named = await panel(live, 'name').innerText();
    note(
      '"Saved" is said beside the name and dates, in view',
      named.includes('Saved: the name and dates.') &&
        named.includes('Fall 2026 Season') &&
        (await saved.isVisible()),
      named,
    );
    await accessible(live, 'Season settings after a save, scripts on');

    at = 'a scheduler is refused Season settings';
    const scheduler = await pageAs('local-scheduler-token');
    for (const address of ['/admin/season', '/admin/season?season=fall-2026&edit=standings']) {
      const answer = await scheduler.goto(`${origin}/north-valley${address}`);
      note(
        `Season settings is not the scheduler's: ${address}`,
        answer?.status() === 403 &&
          (await scheduler.getByRole('button', { name: 'Save the standings rules' }).count()) === 0,
        `${answer?.status()}`,
      );
    }
  } catch (error) {
    failures.push(`${at}: ${whatWentWrong(error)}`);
  } finally {
    await browser?.close();
    server.child.kill();
  }
}

if (failures.length > 0) {
  console.error(`Season settings browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Season settings browser test passed: ${checked.length} checks in a real browser.`);
