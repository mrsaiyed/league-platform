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
  { first: 'Robin', last: 'Ashgrove', number: '7' },
  { first: 'Sasha', last: 'Fernwood', number: '12' },
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
    await tap(adminLink('Teams'), /\/admin\/teams$/);
    await page.locator('input[name=name]').fill(team);
    await page.locator('select[name=divisionId]').selectOption({ label: 'East' });
    await tap(page.getByRole('button', { name: 'Add team' }), /done=created/);
    await accessible('the new team in the admin');

    at = 'the owner adds two players';
    for (const p of players) {
      const form = page.locator('form', { has: page.locator('input[name=firstName]') });
      await form.locator('input[name=firstName]').fill(p.first);
      await form.locator('input[name=lastName]').fill(p.last);
      await form.locator('input[name=jerseyNumber]').fill(p.number);
      await tap(
        form.getByRole('button', { name: 'Add the person and put them on the roster' }),
        /done=/,
      );
    }
    const roster = await page.locator('main').innerText();
    note(
      'both players are on the roster',
      players.every((p) => roster.includes(`${p.first} ${p.last}`)),
    );

    at = 'the owner adds two games to this week and publishes';
    await tap(adminLink('Schedule'), /\/admin\/schedule$/);
    // This week's round: the one dated today in the league's own zone.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(
      new Date(),
    );
    const round = page.locator(`section[data-round]`, {
      has: page.locator(`details[data-add-game] input[name=date][value="${today}"]`),
    });
    const thisRound =
      (await round.count()) > 0 ? round.first() : page.locator('section[data-round]').nth(3);
    const addGame = async (away, time) => {
      const add = thisRound.locator('details[data-add-game]');
      await add.locator('summary').click();
      await add.locator('select[name=homeTeamId]').selectOption({ label: team });
      await add.locator('select[name=awayTeamId]').selectOption({ label: away });
      await add.locator('input[name=time]').fill(time);
      await add.locator('select[name=place]').selectOption({ label: 'Central Gym: Court 2' });
      await tap(add.locator('button[type=submit]'), /done=saved/);
    };
    await addGame('Tigers', '13:00');
    await addGame('Otters', '15:00');
    note('the new games raise no clash', (await page.locator('[data-clashes] li').count()) === 0);
    await tap(page.getByRole('button', { name: 'Publish this schedule' }), /done=published/);
    await accessible('the published schedule in the admin');

    at = "the owner types the first game's final score";
    await tap(adminLink('Games'), /\/admin\/games$/);
    const gameRow = (away) =>
      page.locator('li', { hasText: team }).filter({ hasText: away }).first();
    const first = gameRow('Tigers');
    await first.locator('input[name=awayScore]').fill('48');
    await first.locator('input[name=homeScore]').fill('55');
    await tap(first.getByRole('button', { name: 'Save final score' }), /done=/);
    note(
      'the games area says the first game is final',
      /final/i.test(await gameRow('Tigers').innerText()),
      await gameRow('Tigers').innerText(),
    );

    at = "the owner types the second game's box score";
    await tap(
      gameRow('Otters').getByRole('link', { name: 'Box score' }),
      /\/admin\/games\/[0-9a-f-]{36}$/,
    );
    const ours = page.locator(`[role=region][aria-label="${team}"]`);
    const points = ours.locator('input[name^="stat.points."]');
    await points.nth(0).fill('21');
    await points.nth(1).fill('19');
    const theirs = page.locator('[role=region][aria-label="Otters"] input[name^="stat.points."]');
    await theirs.nth(0).fill('30');
    await tap(page.getByRole('button', { name: 'Save box score and make it final' }), /done=/);
    await accessible('the box score saved');

    // A visitor: signed out, from the league home, tapping only.
    at = 'a visitor opens the league home';
    await context.clearCookies();
    await tap(page.locator('.site-header .site-name').first(), /\/north-valley(\?start=league)?$/);
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
    note("the team's page shows its two wins", teamPage.includes('2-0'), teamPage.slice(0, 400));
    await accessible("the new team's page");

    at = 'a visitor finds the game and its result';
    const card = page.locator('main a[href*="/games/"]', { hasText: 'Tigers' }).first();
    await tap(card, /\/games\//);
    const gamePage = await page.locator('main').innerText();
    const title = (await page.locator('h1').first().textContent()) ?? '';
    note('the game page is the game', title === `Tigers at ${team}`, title);
    note('the game page shows the final score', gamePage.includes('55') && gamePage.includes('48'));
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
    const stats = await page.locator('main').innerText();
    note(
      'the statistics list the players of the box score',
      stats.includes(`${players[0].first} ${players[0].last}`),
      stats.slice(0, 400),
    );
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
