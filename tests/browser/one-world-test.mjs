// Step 2.152: one made-up league walked end to end in a real browser, at phone width, on
// the web app's made-up stand-in (APP_ENV=test). Nothing leaves this computer; every team,
// person and score is made up. Builds the app first unless given --no-build.
//
// The made-up owner signs in as the other browser tests do (the stand-in's session
// cookie), opens the league home, and from there only taps: adds a team with two players,
// adds two games for it to this week's round and publishes the schedule, types the first
// game's final score and the second's box score. Then, signed out, a visitor taps from the
// league home to the team, its players, the game and its result, and finds the win in the
// standings and the box score's points in the statistics: the admin's work is what the
// public pages show (one made-up world, the using-it audit's M1).
//
// One address is typed after the first: the admin's home (/north-valley/admin), which no
// public page links to yet (a finding for the lead: step 2.127, the account menu).
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  showSheetTeamOf,
  startNext,
  waitFor,
} from './web-browser-kit.mjs';

const failures = [];
const checked = [];
const note = (label, ok, detail = '') => {
  checked.push(label);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const team = 'Kestrels';
const players = [
  { first: 'Robin', last: 'Ashgrove', number: '7', points: 21 },
  { first: 'Sasha', last: 'Fernwood', number: '12', points: 19 },
];

let built = true;
if (!process.argv.includes('--no-build')) {
  built = await buildNext();
  if (!built) failures.push('next build failed or took over 10 minutes');
}

if (built) {
  const origin = `http://localhost:${await freePort()}`;
  const server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  let browser;
  /** The step running now, so a failure says where it stopped. */
  let at = 'starting';
  try {
    await waitFor(`${origin}/`, server);
    browser = await launch();
    // Scripts off, as the schedule grid's own test runs it: every form is a plain post and
    // every tap a whole page, so each step waits for the page it leads to.
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 390, height: 844 },
    });
    await context.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    const accessible = async (label) => {
      const problems = await accessibilityProblems(page);
      note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
      const wide = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      );
      note(`no sideways scrolling at phone width: ${label}`, wide);
    };
    /** Taps a link or button, waits for the page it leads to, and checks its address. */
    const tap = async (locator, url) => {
      await Promise.all([page.waitForEvent('load'), locator.click()]);
      if (!url.test(page.url())) throw new Error(`landed on ${page.url()}, not ${url}`);
    };
    /** Opens the phone's menu (a plain disclosure with scripts off) if it is closed. */
    const openMenu = async () => {
      const menu = page.locator('summary', { hasText: 'Menu' }).first();
      if ((await menu.count()) === 0) return;
      if (!(await menu.evaluate((el) => el.parentElement?.hasAttribute('open')))) {
        await menu.click();
      }
    };
    const adminLink = (name) =>
      page.locator('nav').getByRole('link', { name, exact: true }).first();

    // The owner: the league home, then the admin (typed: no page links to it yet).
    at = 'the owner opens the league';
    await page.goto(`${origin}/north-valley`);
    await page.goto(`${origin}/north-valley/admin`);
    await page.getByRole('heading', { level: 1 }).first().waitFor();

    at = 'the owner adds a team';
    // The admin's areas are behind its own menu button on a phone (step 2.103).
    await openMenu();
    await tap(adminLink('Teams'), /\/admin\/teams$/);
    await page.locator('input[name=name]').fill(team);
    await page.locator('select[name=divisionId]').selectOption({ label: 'East' });
    await tap(
      page.getByRole('button', { name: 'Add team' }),
      /\/admin\/teams\/[0-9a-f-]{36}(#add-team)?$/,
    );
    // The save is proved by the page itself: the new team's page says so (2.155).
    await page
      .getByRole('status')
      .filter({ hasText: `Saved: ${team} was added to the season.` })
      .waitFor({ timeout: 10_000 });
    await accessible('the new team in the admin');

    at = 'the owner adds two players';
    for (const p of players) {
      const form = page.locator('form', { has: page.locator('input[name=firstName]') });
      await form.locator('input[name=firstName]').fill(p.first);
      await form.locator('input[name=lastName]').fill(p.last);
      await form.locator('input[name=jerseyNumber]').fill(p.number);
      await form.getByRole('button', { name: 'Add the person and put them on the roster' }).click();
      await page
        .locator('[data-said-on] [role=status]', {
          hasText: `Saved: ${p.first} ${p.last} was added to`,
        })
        .waitFor({ timeout: 10_000 });
    }
    const roster = await page.locator('main').innerText();
    note(
      'both players are on the roster',
      players.every((p) => roster.includes(`${p.first} ${p.last}`)),
    );

    at = 'the owner adds two games to this week and publishes';
    await openMenu();
    await tap(adminLink('Schedule'), /\/admin\/schedule$/);
    // This week's round: the one dated the world's today. That day is the world's own,
    // taken once when the server made it, not this test's clock (a midnight could fall
    // between): the seed's six rounds are a week apart, three weeks of them before today.
    const dates = await page
      .locator('section[data-round] details[data-add-game] input[name=date]')
      .evaluateAll((inputs) => inputs.map((input) => input.value));
    if (dates.length !== 6) throw new Error(`the season has ${dates.length} rounds, not six`);
    const firstRound = new Date(`${dates[0]}T12:00:00Z`);
    firstRound.setUTCDate(firstRound.getUTCDate() + 21);
    const today = firstRound.toISOString().slice(0, 10);
    const round = page.locator(`section[data-round]`, {
      has: page.locator(`details[data-add-game] input[name=date][value="${today}"]`),
    });
    // The seed always has a round dated today; without one this test proves nothing.
    if ((await round.count()) !== 1) {
      throw new Error(`${await round.count()} rounds are dated today (${today}), not one`);
    }
    const thisRound = round.first();
    const addGame = async (away, time) => {
      const add = thisRound.locator('details[data-add-game]');
      await add.locator('summary').click();
      await add.locator('select[name=homeTeamId]').selectOption({ label: team });
      await add.locator('select[name=awayTeamId]').selectOption({ label: away });
      await add.locator('input[name=time]').fill(time);
      // A court no seed game uses, against teams whose own games today are at other hours,
      // so no clash can come from the time of day the test runs at.
      await add.locator('select[name=place]').selectOption({ label: 'Riverside Hall: Court A' });
      await tap(add.locator('button[type=submit]'), /done=saved/);
    };
    await addGame('Tigers', '13:00');
    await addGame('Herons', '15:00');
    note('the new games raise no clash', (await page.locator('[data-clashes] li').count()) === 0);
    await tap(page.getByRole('button', { name: 'Publish this schedule' }), /done=published/);
    await accessible('the published schedule in the admin');

    at = "the owner types the first game's final score";
    await openMenu();
    await tap(adminLink('Games'), /\/admin\/games$/);
    const gameRow = (away) =>
      page.locator('li', { hasText: team }).filter({ hasText: away }).first();
    const first = gameRow('Tigers');
    // Step 2.154: the boxes open only after "Enter the final score", and saving asks first.
    await first.getByText('Enter the final score').click();
    await first.locator('input[name=awayScore]').fill('48');
    await first.locator('input[name=homeScore]').fill('55');
    // Since step 2.155 no answer rides in the address (record 067): the question and "Saved"
    // are on the page the post answers, at the game's place on the list.
    await tap(first.getByRole('button', { name: 'Save final score' }), /\/admin\/games#game-/);
    note(
      'saving the score asks first',
      (await gameRow('Tigers').locator('[data-question]').count()) === 1,
    );
    await tap(
      gameRow('Tigers').getByRole('button', { name: 'Yes, make it final' }),
      /\/admin\/games#game-/,
    );
    note(
      'the games area says "Saved" beside the first game',
      /^Saved: /.test((await gameRow('Tigers').getByRole('status').textContent()) ?? ''),
    );
    note(
      'the games area says the first game is final',
      /final/i.test(await gameRow('Tigers').innerText()),
      await gameRow('Tigers').innerText(),
    );

    at = "the owner types the second game's box score";
    await tap(
      gameRow('Herons').getByRole('link', { name: 'Box score' }),
      /\/admin\/games\/[0-9a-f-]{36}$/,
    );
    const ours = page.locator(`[role=region][aria-label="${team}"]`);
    const points = ours.locator('input[name^="stat.points."]');
    if ((await points.count()) !== players.length) {
      throw new Error(
        `the grid has ${await points.count()} ${team} players, not ${players.length}`,
      );
    }
    // Robin's row first: the roster's order. On a phone one team's grid is shown at a
    // time (step 2.103): each team is picked before its boxes are typed in.
    await showSheetTeamOf(page, points.nth(0));
    await points.nth(0).fill(String(players[0].points));
    await points.nth(1).fill(String(players[1].points));
    const theirs = page.locator('[role=region][aria-label="Herons"] input[name^="stat.points."]');
    await showSheetTeamOf(page, theirs.nth(0));
    await theirs.nth(0).fill('30');
    await tap(
      page.getByRole('button', { name: 'Save box score and make it final' }),
      /\/admin\/games\/[0-9a-f-]{36}#box-score-scores$/,
    );
    note(
      'the box score says "Saved" beside the scores',
      /^Saved: /.test((await page.locator('#box-score-scores [role=status]').textContent()) ?? ''),
    );
    await accessible('the box score saved');

    // A visitor: signed out, from the league home, tapping only.
    at = 'a visitor opens the league home';
    await context.clearCookies();
    // The public site's header is not drawn in the admin (step 2.103): the way out is the
    // admin's own "View the site", behind its menu button on a phone.
    await openMenu();
    await tap(
      page.locator('.staff-bar').getByRole('link', { name: 'View the site' }),
      /\/north-valley(\?start=league)?$/,
    );
    const home = await page.locator('main').innerText();
    note(`the home page names ${team}`, home.includes(team));

    at = 'a visitor finds the team and its players';
    await openMenu();
    await tap(page.getByRole('link', { name: 'Teams', exact: true }).first(), /\/teams$/);
    await tap(page.locator('main').getByRole('link', { name: team }).first(), /\/teams\/kestrels/);
    const teamPage = await page.locator('main').innerText();
    note(
      "the team's page lists both players",
      players.every((p) => teamPage.includes(`${p.first} ${p.last}`)),
      teamPage.slice(0, 400),
    );
    // The record in the team's own facts, exactly: two games, two wins.
    const record = await page
      .locator('dl.ui-facts dt', { hasText: /^Record$/ })
      .locator('xpath=following-sibling::dd[1]')
      .first()
      .textContent();
    note("the team's page shows its two wins", record?.trim() === '2-0', record ?? 'no record');
    await accessible("the new team's page");

    at = 'a visitor finds the game and its result';
    const card = page.locator('main a[href*="/games/"]', { hasText: 'Tigers' }).first();
    await tap(card, /\/games\//);
    const gamePage = await page.locator('main').innerText();
    const title = (await page.locator('h1').first().textContent()) ?? '';
    note('the game page is the game', title === `Tigers at ${team}`, title);
    // The board's two scores, away team first, exactly.
    const scores = (
      await page.locator('.ui-scoreboard .ui-scoreboard-score').allTextContents()
    ).map((s) => s.trim());
    note('the game page shows the final score', scores.join() === '48,55', scores.join());
    note('the game page says it is final', /final/i.test(gamePage));
    await accessible('the game page');

    at = 'a visitor finds the win in the standings';
    await openMenu();
    await tap(page.getByRole('link', { name: 'Standings', exact: true }).first(), /\/standings$/);
    const table = page.locator('table.ui-standings', { hasText: team }).first();
    const heads = (await table.locator('thead th').allInnerTexts()).map((c) => c.trim());
    const row = table.locator('tbody tr', { hasText: team }).first();
    const cells = (await row.locator('th, td').allInnerTexts()).map((c) => c.trim());
    const column = (name) => cells[heads.indexOf(name)];
    note(
      `the standings have ${team} with two wins and no loss`,
      column('W') === '2' && column('L') === '0',
      `${heads.join(' | ')} / ${cells.join(' | ')}`,
    );
    await accessible('the standings');

    at = "a visitor finds the box score's points in the statistics";
    await openMenu();
    await tap(page.getByRole('link', { name: 'Stats', exact: true }).first(), /\/stats$/);
    // Each player's points in the full table, exactly: one game each, so a game's average
    // is the box score's number.
    for (const p of players) {
      const name = `${p.first} ${p.last}`;
      const tables = page.locator('main table', {
        has: page.locator('tbody tr', { hasText: name }),
      });
      if ((await tables.count()) === 0) {
        note(
          `the statistics list ${name}`,
          false,
          (await page.locator('main').innerText()).slice(0, 400),
        );
        continue;
      }
      // The full table of every player comes after the leaders.
      const table = tables.last();
      const heads = (await table.locator('thead th').allInnerTexts()).map((c) => c.trim());
      const cells = (
        await table.locator('tbody tr', { hasText: name }).first().locator('th, td').allInnerTexts()
      ).map((c) => c.trim());
      // A heading reads "Sort by PTS points" to a screen reader; PTS is the points column.
      const ptsAt = heads.findIndex((h) => /\bPTS\b/i.test(h));
      if (heads.filter((h) => /\bPTS\b/i.test(h)).length !== 1) {
        throw new Error(`no one points column among ${heads.join(' | ')}`);
      }
      const pts = cells[ptsAt];
      note(
        `the statistics give ${name} the box score's ${p.points} points`,
        pts === `${p.points}.0`,
        `${heads.join(' | ')} / ${cells.join(' | ')}`,
      );
    }
  } catch (error) {
    failures.push(`${at}: ${String(error?.message ?? error).split('\n')[0]}`);
  } finally {
    await browser?.close();
    server.child.kill();
  }
}

if (failures.length > 0) {
  console.error(`One made-up world browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`One made-up world browser test passed: ${checked.length} checks in a real browser.`);
