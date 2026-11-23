// Step 2.180 (A-17): a team that still has games is not moved to the bin by mistake, and no
// screen shows a code for a team. In a real browser at phone width (390), on the web app's
// made-up stand-in (APP_ENV=test): made-up leagues, teams and games, nothing leaves this
// computer. Scripts are off, so every form is a plain post. Builds the app first unless
// given --no-build; --dev runs `next dev` instead.
//
// The world is made with the Otters put in the bin, games and results kept
// (LOCAL_BINNED_TEAM), as a team could be before A-17. The made-up owner signs in as the
// other browser tests do and starts at the admin's home (/north-valley/admin, typed: no page
// links to it yet). From there only taps.
// - A new team, the Kestrels, has its tick and button while it has no games. Given three
//   games, published, its panel says up front it cannot be removed yet, names the games by
//   round and day, and draws no tick or button; "Go to Schedule" leads there with "Back to
//   Kestrels" kept through every form. Once its games are removed in the draft, the panel
//   says they are removed in the draft and leads to Schedule's publish box; once published,
//   the team goes to the bin. An old address carrying a refusal draws none once its cause
//   has gone.
// - The Badgers, with results and games to come, cannot be removed this season: said up
//   front, with the advice for a team that has left, no tick or button.
// - The Otters, in the bin: "Otters (removed)" in the grid, their row in the public
//   standings with its note and no link, every place filled; no page shows a team's id.
// Pictures of the panel at each state go to .local/shots/390/team-bin-*.jpg (not committed).
import fs from 'node:fs';
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  openStaffMenu,
  startNext,
  waitFor,
  whatWentWrong,
  worldAtNoon,
} from './web-browser-kit.mjs';

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
const kestrels = 'Kestrels';
/** A team's id written out, as the grid once showed one ("01900000-… at Herons"). */
const anId = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** The Kestrels' three games: their opponents and times, early, so nothing else is then. */
const games = [
  { home: 'Herons', time: '06:00' },
  { home: 'Owls', time: '07:00' },
  { home: 'Falcons', time: '08:00' },
];
const pictures = '.local/shots/390';

if (built) {
  const origin = `http://localhost:${await freePort()}`;
  const port = new URL(origin).port;
  const server = startNext(dev ? ['dev', '--port', port] : ['start', '--port', port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
    LOCAL_NOW: worldAtNoon(),
    LOCAL_BINNED_TEAM: 'otters',
  });
  let browser;
  let at = 'starting';
  try {
    await waitFor(`${origin}/`, server);
    browser = await launch();
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: screen });
    await context.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(dev ? 120_000 : 60_000);
    const visitor = await browser.newContext({ javaScriptEnabled: false, viewport: screen });
    const publicPage = await visitor.newPage();
    publicPage.setDefaultTimeout(dev ? 120_000 : 60_000);
    fs.mkdirSync(pictures, { recursive: true });

    /** No team's id on the page, in its words. */
    const noId = async (label, which = page) => {
      const text = await which.locator('main').innerText();
      const found = text.match(anId);
      note(`no id shown: ${label}`, found === null, found?.[0]);
    };
    const publicText = async (path) => {
      await publicPage.goto(`${origin}/north-valley${path}`);
      await noId(`the public ${path} page`, publicPage);
      return publicPage.locator('main').innerText();
    };
    const accessible = async (label) => {
      const problems = await accessibilityProblems(page);
      note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
      const wide = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      );
      note(`no sideways scrolling at phone width: ${label}`, wide);
      await noId(label);
    };
    /** Taps a link or button, waits for the page it leads to, and checks its address. */
    const tap = async (locator, url) => {
      await Promise.all([page.waitForEvent('load'), locator.click()]);
      if (!url.test(page.url())) throw new Error(`landed on ${page.url()}, not ${url}`);
    };
    /** On the screen as the page shows it now, without scrolling. */
    const onScreen = async (locator) => {
      const box = await locator.first().boundingBox();
      return box !== null && box.y >= 0 && box.y + Math.min(box.height, 40) <= screen.height;
    };
    const adminLink = (name) =>
      page.locator('nav').getByRole('link', { name, exact: true }).first();
    const openArea = async (name, url) => {
      // On a phone the admin's areas are behind its own menu button (step 2.103).
      await openStaffMenu(page);
      await tap(adminLink(name), url);
    };
    const openTeam = async (name) => {
      await openArea('Teams', /\/admin\/teams$/);
      await tap(page.locator('main').getByRole('link', { name, exact: true }), /\/admin\/teams\//);
    };
    const bin = () =>
      page.locator('section', { has: page.getByRole('heading', { name: 'Remove this team' }) });
    const held = () => bin().locator('[data-remove-held]');
    const heldLines = async () =>
      (await held().count()) === 0
        ? []
        : (await held().locator('p').allInnerTexts()).map((line) => line.trim());
    const binButtons = () => bin().getByRole('button', { name: 'Move the team to the bin' });
    const picture = async (name) => {
      await bin().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${pictures}/team-bin-${name}.jpg`, quality: 80 });
    };
    /** The grid's games the Kestrels play, by the names on each game's own line. */
    const theirGames = () =>
      page.locator('li[data-game]', {
        has: page.locator('.admin-slot-line strong', { hasText: kestrels }),
      });
    const backToKestrels = () => page.getByRole('link', { name: `Back to ${kestrels}` });

    at = 'the owner opens the admin';
    await page.goto(`${origin}/north-valley`);
    await page.goto(`${origin}/north-valley/admin`);
    await accessible("the admin's home");

    at = 'a new team with no games has its tick and button';
    await openArea('Teams', /\/admin\/teams$/);
    await page.locator('input[name=name]').fill(kestrels);
    await tap(page.getByRole('button', { name: 'Add team' }), /done=created/);
    const freeText = await bin().innerText();
    note(
      'a new team says it has no games',
      freeText.includes('This team has played no games.') &&
        freeText.includes('It has no game without a result.'),
      freeText,
    );
    note('a team with no games has the bin button', (await binButtons().count()) === 1);
    const teamAddress = page.url().split('?')[0];

    at = 'the new team is given three games and they are published';
    await openArea('Schedule', /\/admin\/schedule$/);
    for (const game of games) {
      const add = page.locator('section[data-round]').last().locator('details[data-add-game]');
      await add.locator('summary').click();
      await add.locator('select[name=homeTeamId]').selectOption({ label: game.home });
      await add.locator('select[name=awayTeamId]').selectOption({ label: kestrels });
      await add.locator('input[name=time]').fill(game.time);
      await tap(add.locator('button[type=submit]'), /saved=/);
    }
    note('the three games are in the draft', (await theirGames().count()) === 3);
    await tap(page.locator('button', { hasText: 'Publish this schedule' }), /done=published/);

    at = 'the new team cannot be removed yet, said up front with no button';
    await openTeam(kestrels);
    const yet = await heldLines();
    note(
      'the panel says it cannot be removed yet',
      yet[0] === 'Kestrels cannot be removed yet: it has games without a result.',
      yet.join(' | '),
    );
    note(
      'it names its three games by round and day',
      /^It has 3 games without a result yet: Round \d+, \w{3}, \w{3} \d+; Round \d+, /.test(
        yet[2] ?? '',
      ),
      yet[2],
    );
    note(
      'the way on is remove or cancel, never forfeit',
      (yet[3] ?? '').startsWith(
        'Remove them from the schedule in Schedule, or cancel this week’s in Games. Do not record them as forfeited',
      ),
      yet[3],
    );
    note('no tick and no button that could only refuse', (await binButtons().count()) === 0);
    note('no box to tick', (await bin().locator('input[name=confirm]').count()) === 0);
    await picture('not-yet');
    await accessible('a team with games without a result');

    at = 'its games are removed in Schedule, with a way back kept';
    await tap(held().getByRole('link', { name: 'Go to Schedule' }), /\/admin\/schedule\?fromTeam=/);
    note('Schedule offers the way back to the team', (await backToKestrels().count()) === 1);
    for (let left = 3; left > 0; left -= 1) {
      const game = theirGames().first();
      await game.locator('summary', { hasText: 'Edit this game' }).click();
      const removedId = await game.getAttribute('data-game');
      // Since step 2.185 the answer is a one-time notice at the struck game, not the
      // address: the page lands at the game, which stays struck through with "Removed:".
      await tap(game.getByRole('button', { name: 'Remove game' }), /fromTeam=[^#]+#game-/);
      note(
        `the game removed is said removed at its struck row (${4 - left})`,
        (await page
          .locator(`li[data-removed-game="${removedId}"] #saved`, { hasText: 'Removed:' })
          .count()) === 1,
      );
      note(
        `the way back stays after removing a game (${4 - left})`,
        (await backToKestrels().count()) === 1,
      );
    }
    note('the draft holds none of their games', (await theirGames().count()) === 0);
    await accessible('the grid with their games removed from the draft');

    at = 'removed in the draft: the panel says so and leads to publishing';
    await tap(backToKestrels(), /\/admin\/teams\/[^?#]+#remove-team$/);
    const drafted = await heldLines();
    note(
      'the panel says the games are removed in the draft, not yet published',
      drafted.includes(
        '3 of them are removed in the draft, which is not published yet: publish the schedule to finish.',
      ),
      drafted.join(' | '),
    );
    note(
      'it does not say to remove them again',
      !drafted.some((line) => line.startsWith('Remove them from the schedule')),
    );
    note('said where the phone is looking', await onScreen(held()));
    const toPublish = held().getByRole('link', { name: 'Go to publishing' });
    note(
      'the only way on is publishing',
      (await held().getByRole('link').count()) === 1 && (await toPublish.count()) === 1,
    );
    note('still no button', (await binButtons().count()) === 0);
    await picture('removed-in-draft');
    await tap(toPublish, /\/admin\/schedule\?fromTeam=[^#]+#publish-heading$/);
    await tap(page.locator('button', { hasText: 'Publish this schedule' }), /done=published/);
    note(
      'the public schedule no longer lists their games',
      !(await publicText('/schedule')).includes(kestrels),
    );

    at = 'an old address with a refusal draws none once its cause is gone';
    await page.goto(`${teamAddress}?problem=teams.remove_team.team-has-games-to-play#remove-team`);
    note(
      'no refusal drawn from the address',
      (await bin().locator('[data-remove-refused]').count()) === 0,
    );
    note('no alert on the page', (await page.locator('main [role=alert]').count()) === 0);
    note('the button is back: it has no games now', (await binButtons().count()) === 1);
    note(
      'the panel says it has no games',
      (await bin().innerText()).includes('It has no game without a result.'),
    );
    await picture('free');

    at = 'the team goes to the bin';
    await bin().locator('input[name=confirm]').check();
    await tap(binButtons(), /\/admin\/teams\?done=removed/);
    note(
      'the team is gone from the list',
      (await page.locator('main').getByRole('link', { name: kestrels, exact: true }).count()) === 0,
    );
    await accessible('the teams list after the team went to the bin');

    at = 'the Badgers, with results, cannot be removed this season';
    const standingsBefore = await publicText('/standings');
    await openTeam('Badgers');
    const season = await heldLines();
    note(
      'said up front, with why',
      season[0] ===
        'Badgers cannot be removed this season: its results are part of other teams’ records.',
      season.join(' | '),
    );
    note(
      'forfeiting is advice for a team that has left, never a way to remove it',
      season.some((line) => line.startsWith('If the team has left the league, mark it so above')) &&
        season.some((line) => line.includes('it stays, with the games it played')),
    );
    note('no button', (await binButtons().count()) === 0);
    note(
      'ways on to Games and Schedule',
      (await held().getByRole('link', { name: 'Go to Games' }).count()) === 1 &&
        (await held().getByRole('link', { name: 'Go to Schedule' }).count()) === 1,
    );
    await picture('cannot-this-season');
    await accessible('a team with results');
    note(
      'the public standings read the same',
      (await publicText('/standings')) === standingsBefore,
    );

    at = 'the Otters, in the bin with their games, are named everywhere and linked nowhere';
    await openArea('Schedule', /\/admin\/schedule$/);
    const grid = await page.locator('main').innerText();
    note('the grid names them "(removed)"', grid.includes('Otters (removed)'));
    await noId('the admin schedule grid');
    const otterOptions = await page
      .locator('select[name=homeTeamId] option', { hasText: 'Otters' })
      .count();
    note('the grid offers them for no new game', otterOptions === 0);
    await openArea('Games', /\/admin\/games$/);
    await noId("the admin's games");
    await publicPage.goto(`${origin}/north-valley/standings`);
    const standings = await publicPage.locator('main').innerText();
    note('their row is in the public standings', standings.includes('Otters'));
    note(
      'with the note',
      standings.includes(
        'No longer in the league. Its results stay in the table, as they are part of other teams’ records.',
      ),
    );
    note(
      'and no link to a page that is not there',
      (await publicPage.locator('a[href*="/teams/otters"]').count()) === 0,
    );
    await noId('the public standings', publicPage);
    await publicPage.screenshot({
      path: `${pictures}/team-bin-standings-with-otters-binned.jpg`,
      fullPage: true,
      quality: 80,
    });
    for (const path of ['', '/schedule', '/teams']) {
      await publicPage.goto(`${origin}/north-valley${path}`);
      note(
        `no link to the removed team's page: /north-valley${path}`,
        (await publicPage.locator('a[href*="/teams/otters"]').count()) === 0,
      );
      await noId(`the public ${path || 'home'} page`, publicPage);
    }
    await visitor.close();
  } catch (error) {
    failures.push(`${at}: ${whatWentWrong(error)}`);
  } finally {
    await browser?.close();
    server.child.kill();
  }
}

if (failures.length > 0) {
  console.error(`Team-bin browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Team-bin browser test passed: ${checked.length} checks in a real browser.`);
