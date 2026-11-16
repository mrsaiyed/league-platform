// Step 2.180 (A-17): a team that still has games is not moved to the bin by mistake, and no
// screen shows a code for a team. In a real browser at phone width (390), on the web app's
// made-up stand-in (APP_ENV=test): made-up leagues, teams and games, nothing leaves this
// computer. Scripts are off, so every form is a plain post. Builds the app first unless
// given --no-build; --dev runs `next dev` instead.
//
// The made-up owner signs in as the other browser tests do (the stand-in's session cookie)
// and starts at the admin's home (/north-valley/admin, typed: no page links to it yet, as
// tests/browser/one-world-test.mjs says). From there only taps. A new team, the Kestrels,
// is given three games in the last round and the schedule is published; its "Remove this
// team" panel says "Kestrels have played no games and have 3 still to play." before
// anything is ticked, and moving it to the bin is refused with the sentence and a way to
// Schedule, said where the phone is looking. Its three games are removed there: while
// that is only the draft the team still stays (the public still sees the games); once
// published it goes to the bin. The Badgers, with results and games to come, are refused
// with the results sentence and a way to Games, and the public standings read the same
// before and after, the Badgers in them. No page visited shows a team's id.
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

if (built) {
  const origin = `http://localhost:${await freePort()}`;
  const port = new URL(origin).port;
  const server = startNext(dev ? ['dev', '--port', port] : ['start', '--port', port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
    LOCAL_NOW: worldAtNoon(),
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
    const gamesSaid = async () => (await bin().locator('[data-remove-games]').innerText()).trim();
    /** Ticks the box and taps "Move the team to the bin"; the address it lands on. */
    const moveToBin = async (url) => {
      await bin().locator('input[name=confirm]').check();
      await tap(bin().getByRole('button', { name: 'Move the team to the bin' }), url);
    };
    const refusal = () => bin().locator('[data-remove-refused]');
    const refusalText = async () =>
      (await refusal().count()) === 1
        ? (await refusal().locator('p').first().innerText()).trim()
        : '';
    /** The grid's games the Kestrels play, by the names on each game's own line. */
    const theirGames = () =>
      page.locator('li[data-game]', {
        has: page.locator('.admin-slot-line strong', { hasText: kestrels }),
      });
    const publish = async () => {
      await openArea('Schedule', /\/admin\/schedule$/);
      await tap(page.locator('button', { hasText: 'Publish this schedule' }), /done=published/);
    };

    at = 'the owner opens the admin';
    await page.goto(`${origin}/north-valley`);
    await page.goto(`${origin}/north-valley/admin`);
    await accessible("the admin's home");

    at = 'a new team is made';
    await openArea('Teams', /\/admin\/teams$/);
    await page.locator('input[name=name]').fill(kestrels);
    await tap(page.getByRole('button', { name: 'Add team' }), /done=created/);
    note(
      'a new team with no games says so',
      (await gamesSaid()) === 'Kestrels have played no games and have none to play.',
      await gamesSaid(),
    );

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
    note(
      'the three games are in the draft',
      (await theirGames().count()) === 3,
      `${await theirGames().count()}`,
    );
    await accessible('the grid with the new games');
    await publish();
    const publicSchedule = await publicText('/schedule');
    note(
      'the three games are on the public schedule',
      publicSchedule.split(kestrels).length - 1 >= 3,
    );

    at = 'the new team says what it has, and is refused the bin';
    await openTeam(kestrels);
    note(
      'the panel says what the team has before anything is ticked',
      (await gamesSaid()) === 'Kestrels have played no games and have 3 still to play.',
      await gamesSaid(),
    );
    await moveToBin(/problem=teams\.remove_team\.team-has-games-to-play#remove-team$/);
    note(
      'the refusal names the count and the way on',
      (await refusalText()) ===
        'Kestrels still have 3 games to play. Remove them from the schedule, or record them as forfeited or cancelled, first.',
      await refusalText(),
    );
    note('the refusal is where the phone is looking', await onScreen(refusal()));
    note(
      'the refusal is said once, in the panel, not again at the top',
      (await page.locator('main [role=alert]').count()) === 1,
    );
    const toSchedule = refusal().getByRole('link', { name: 'Go to Schedule' });
    note('the refusal leads to Schedule', (await toSchedule.count()) === 1);
    await accessible('a team with games to play refused the bin');

    at = 'its games are removed in Schedule';
    await tap(toSchedule, /\/admin\/schedule$/);
    for (let left = 3; left > 0; left -= 1) {
      const game = theirGames().first();
      await game.locator('summary', { hasText: 'Edit this game' }).click();
      await tap(game.getByRole('button', { name: 'Remove game' }), /saved=game-removed/);
    }
    note('the draft holds none of their games', (await theirGames().count()) === 0);
    await accessible('the grid with their games removed from the draft');

    at = 'while that is only the draft, the team stays';
    await openTeam(kestrels);
    note(
      'their published games still count until the draft is published',
      (await gamesSaid()) === 'Kestrels have played no games and have 3 still to play.',
      await gamesSaid(),
    );
    await moveToBin(/problem=teams\.remove_team\.team-has-games-to-play/);

    at = 'once published, the team goes to the bin';
    await publish();
    note(
      'the public schedule no longer lists their games',
      !(await publicText('/schedule')).includes(kestrels),
    );
    await openTeam(kestrels);
    note(
      'the panel says they have no games now',
      (await gamesSaid()) === 'Kestrels have played no games and have none to play.',
      await gamesSaid(),
    );
    await moveToBin(/\/admin\/teams\?done=removed/);
    note(
      'the team is gone from the list',
      (await page.locator('main').getByRole('link', { name: kestrels, exact: true }).count()) === 0,
    );
    await accessible('the teams list after the team went to the bin');

    at = 'the Badgers, with results, are refused';
    const standingsBefore = await publicText('/standings');
    note('the Badgers are in the standings', standingsBefore.includes('Badgers'));
    await openTeam('Badgers');
    const badgersHave = await gamesSaid();
    note(
      'the panel says what the Badgers have',
      /^Badgers have played \d+ games? and have (\d+|none) still to play\.$/.test(badgersHave),
      badgersHave,
    );
    await moveToBin(/problem=teams\.remove_team\.team-has-results#remove-team$/);
    note(
      'the refusal says their results are part of other teams’ records',
      /^Badgers have results? in \d+ games?\. (Those results are|That result is) part of other teams’ records, so the team stays\. If the team has left, record its games to come as forfeited; it keeps the games it played\.$/.test(
        await refusalText(),
      ),
      await refusalText(),
    );
    note('said where the phone is looking', await onScreen(refusal()));
    if (!/none still to play/.test(badgersHave)) {
      note(
        'with games to come, the refusal leads to Games',
        (await refusal().getByRole('link', { name: 'Go to Games' }).count()) === 1,
      );
    }
    await accessible('a team with results refused the bin');
    note(
      'the Badgers are still in the standings, every record as it was',
      (await publicText('/standings')) === standingsBefore,
    );
    await openArea('Schedule', /\/admin\/schedule$/);
    await noId('the admin schedule grid');
    await openArea('Games', /\/admin\/games$/);
    await noId("the admin's games");
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
