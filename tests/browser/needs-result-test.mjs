// Step 2.156: yesterday's game can be found, however old (the using-it audit's H8), in a
// real browser at phone width, against the web app on its made-up stand-in (APP_ENV=test).
// Nothing leaves this computer; every team, game and person is made up. Builds the app
// first unless given --no-build (npm run test:web:browser builds it once in
// web-exit-test.mjs).
//
// Each person starts where they start (the admin's home, signed in as the other browser
// tests sign in) and reaches Games by tapping; no other address is typed.
//
// - The owner opens Games the morning after: the game played three days ago with no score
//   is the first game under "Needs a result"; two numbers and "Yes" make it final, "Saved"
//   names it on the screen without scrolling, and it is gone from that list.
// - A game from three weeks back is found under "Earlier games" in two taps: the way to
//   Earlier games at the top, then its round in the round picker.
// - The archived league has 300 past games: Games still opens quickly and small, offering
//   its thirty rounds and drawing one round's ten games at a time.
// - In the league that scores assigned games only, a scorekeeper sees under "Needs a
//   result" only their one assigned past game, while its admin sees the game under way.
// - Accessibility checks (T-186) and no sideways scrolling at phone width (A-2).
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
const step = async (name, run) => {
  try {
    await run();
  } catch (error) {
    failures.push(`${name}: ${String(error?.message ?? error).split('\n')[0]}`);
  }
};

// The made-up world's games (apps/web/src/server/stand-in-world-seed.ts).
const threeDaysAgo = '01900000-0000-7000-8000-0000b20032dc'; // Badgers at Herons, no score
const threeWeeksAgo = '01900000-0000-7000-8000-0000b20032c8'; // Herons at Falcons, final
const fallRoundOne = 'r-01900000-0000-7000-8000-0000b2000001';
const historyRoundTen = 'r-01900000-0000-7000-8000-0000b600000a';
const liveGame = '01900000-0000-7000-8000-006a00000002'; // Bears at Hawks, under way
// The draft league's game two days ago with no score, assigned to its scorekeeper.
const draftUnscored = '01900000-0000-7000-8000-0000b20003e8'; // Bears at Hawks
const phone = { width: 390, height: 844 };

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

async function signedInAs(token) {
  const context = await browser.newContext({ viewport: phone });
  await context.addCookies([{ name: 'srl_session', value: token, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { context, page };
}

/** From the admin's home to the games list, by tapping the admin's own "Games". */
async function openGames(page, league) {
  await page.goto(`${origin}/${league}/admin`);
  await Promise.all([
    page.waitForURL((url) => url.pathname === `/${league}/admin/games`),
    // The admin's own navigation: the account button holds a hidden link to the same place.
    page
      .getByRole('navigation', { name: 'Admin areas' })
      .locator(`a[href="/${league}/admin/games"]`)
      .click(),
  ]);
  await page.getByRole('heading', { level: 1, name: 'Games' }).waitFor();
}

/** A part of the page by its heading: "Needs a result", "Today", "This week", "Earlier games". */
const part = (page, title) =>
  page.locator('section.ui-section').filter({
    has: page.getByRole('heading', { level: 2, name: title, exact: true }),
  });
const idsIn = (locator) =>
  locator.locator('li[id^="game-"]').evaluateAll((items) => items.map((li) => li.id.slice(5)));

/** Whether the element is wholly on the screen, unscrolled, and not covered. */
const seenWhole = (locator) =>
  locator.evaluate((el) => {
    const box = el.getBoundingClientRect();
    if (box.top < 0 || box.bottom > window.innerHeight || box.height === 0) return false;
    const atCentre = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return atCentre !== null && el.contains(atCentre);
  });

async function accessible(page, label) {
  const problems = await accessibilityProblems(page);
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
  const [width, inner] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  note(`no sideways scrolling at phone width: ${label}`, width <= inner, `${width} > ${inner}`);
}

/** Two taps from the top of Games: the way to Earlier games, then the round. */
async function earlierRound(page, key) {
  await page.getByRole('link', { name: 'Earlier games', exact: true }).first().click();
  await Promise.all([
    page.waitForURL((url) => url.searchParams.get('round') === key),
    part(page, 'Earlier games').getByLabel('Round').selectOption(key),
  ]);
  await part(page, 'Earlier games').locator('li[id^="game-"]').first().waitFor();
}

if (browser) {
  await step('the owner finds the game from three days ago and makes it final', async () => {
    const { context, page } = await signedInAs('local-owner-token');
    try {
      await openGames(page, 'north-valley');
      const needs = part(page, 'Needs a result');
      const first = needs.locator('li[id^="game-"]').first();
      note(
        '"Needs a result" is the first part of Games',
        (await page.locator('section.ui-section h2').first().textContent()) === 'Needs a result',
      );
      note(
        'the game played three days ago with no score is first under "Needs a result"',
        (await first.getAttribute('id')) === `game-${threeDaysAgo}`,
        String(await first.getAttribute('id')),
      );
      note(
        'it says it is awaiting its result',
        (await first.getByText('Awaiting result').count()) === 1,
      );
      note(
        'the game under way is under "Needs a result" too',
        (await idsIn(needs)).includes(liveGame),
      );
      const all = [
        ...(await idsIn(needs)),
        ...(await idsIn(part(page, 'Today'))),
        ...(await idsIn(part(page, 'This week'))),
      ];
      note('each game is on the page once', new Set(all).size === all.length, all.join(' '));
      note(
        '"This week" has a heading for each day',
        (await part(page, 'This week').locator('h3').count()) >= 1,
      );
      await accessible(page, 'Games, the morning after');

      await first.getByText('Enter the final score').click();
      await first.getByLabel('Score for Badgers').fill('45');
      await first.getByLabel('Score for Herons').fill('50');
      await first.getByRole('button', { name: 'Save final score' }).click();
      await first.getByRole('button', { name: 'Yes, make it final' }).click();
      const saved = page.getByRole('status').filter({ hasText: 'Saved: Badgers 45, Herons 50' });
      await saved.waitFor();
      note(
        '"Saved" names the game and its score',
        (await saved.textContent()) === 'Saved: Badgers 45, Herons 50 is final.',
        (await saved.textContent()) ?? '',
      );
      note('"Saved" is on the screen without scrolling', await seenWhole(saved));
      note(
        'the game is gone from "Needs a result"',
        !(await idsIn(part(page, 'Needs a result'))).includes(threeDaysAgo),
      );
      note(
        'nothing of the save is in the address',
        new URL(page.url()).search === '' && !page.url().includes('Saved'),
        page.url(),
      );

      // It is final: found in its earlier round, with its score.
      await earlierRound(page, 'r-01900000-0000-7000-8000-0000b2000003');
      const now = part(page, 'Earlier games').locator(`li[id="game-${threeDaysAgo}"]`);
      note(
        'the game is final, in its earlier round',
        (await now.getByText('Final', { exact: true }).count()) === 1 &&
          (await now.getByText('50').count()) >= 1,
      );
      await page.reload();
      note(
        'a reload says nothing old',
        (await page.getByText('Saved: Badgers 45, Herons 50 is final.').count()) === 0,
      );
    } finally {
      await context.close();
    }
  });

  await step('a game from three weeks back is found in two taps', async () => {
    const { context, page } = await signedInAs('local-owner-token');
    try {
      await openGames(page, 'north-valley');
      const earlier = part(page, 'Earlier games');
      note(
        'before a round is chosen, "Earlier games" shows no game',
        (await earlier.locator('li[id^="game-"]').count()) === 0,
      );
      await earlierRound(page, fallRoundOne);
      note(
        'the round shows the game from three weeks back',
        (await idsIn(earlier)).includes(threeWeeksAgo),
        (await idsIn(earlier)).join(' '),
      );
      note(
        'the round is named, with its season, as the picker offers it',
        /^Round 1, Fall 2026, /.test((await earlier.locator('h3').first().textContent()) ?? ''),
        (await earlier.locator('h3').first().textContent()) ?? '',
      );
      note(
        'its result can be put right from here',
        (await earlier
          .locator(`li[id="game-${threeWeeksAgo}"]`)
          .getByText('Correct this result')
          .count()) >= 1,
      );
      await accessible(page, 'an earlier round');
    } finally {
      await context.close();
    }
  });

  await step('a league with 300 past games still opens quickly, a round at a time', async () => {
    const { context, page } = await signedInAs('local-owner-token');
    try {
      await page.goto(`${origin}/old-meadow/admin`);
      const started = Date.now();
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/old-meadow/admin/games'),
        page
          .getByRole('navigation', { name: 'Admin areas' })
          .locator('a[href="/old-meadow/admin/games"]')
          .click(),
      ]);
      await page.getByRole('heading', { level: 1, name: 'Games' }).waitFor();
      const took = Date.now() - started;
      const size = await page.evaluate(() => document.documentElement.outerHTML.length);
      note('Games opens within 5 seconds', took < 5000, `${took} ms`);
      note(
        'the page holds no game before a round is chosen',
        (await page.locator('li[id^="game-"]').count()) === 0,
      );
      note('the page is small (under 150 KB)', size < 150_000, `${size} characters`);
      const options = await part(page, 'Earlier games')
        .getByLabel('Round')
        .locator('option')
        .allTextContents();
      note(
        'the picker offers the thirty rounds, ten games each',
        options.length === 31 && options.slice(1).every((o) => o.endsWith('(10)')),
        `${options.length}: ${options.slice(0, 3).join(' | ')}`,
      );
      await earlierRound(page, historyRoundTen);
      const shown = await idsIn(part(page, 'Earlier games'));
      const after = await page.evaluate(() => document.documentElement.outerHTML.length);
      note('one round is drawn: its ten games', shown.length === 10, String(shown.length));
      note(
        'with a round shown the page is still small (under 400 KB)',
        after < 400_000,
        `${after}`,
      );
      await accessible(page, '300 past games');
    } finally {
      await context.close();
    }
  });

  await step('a scorekeeper sees only the games they may score', async () => {
    // The draft league scores assigned games only; its scorekeeper is given game 4 (in two
    // days) and the game two days ago nobody scored, and its admin the game under way.
    const keeper = await signedInAs('local-scorekeeper-token');
    try {
      const { page } = keeper;
      await page.goto(`${origin}/quiet-pines/admin`);
      await page.getByRole('heading', { level: 1, name: 'Your games' }).waitFor();
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/quiet-pines/admin/games'),
        page.getByRole('link', { name: 'Enter the score' }).first().click(),
      ]);
      await page.getByRole('heading', { level: 1, name: 'Games' }).waitFor();
      const theirs = await idsIn(part(page, 'Needs a result'));
      note(
        'the scorekeeper\'s "Needs a result" is their one assigned past game, and no other',
        theirs.length === 1 && theirs[0] === draftUnscored,
        theirs.join(' '),
      );
      // None of their games is in an earlier round: said of their games, not the league's.
      const earlierText = await part(page, 'Earlier games').innerText();
      note(
        'their empty "Earlier games" speaks only of the games they score',
        earlierText.includes('There are no earlier games you score yet.') &&
          !earlierText.includes('There are no earlier games yet.'),
        earlierText.slice(0, 200),
      );
      await accessible(page, "a scorekeeper's Games");
    } finally {
      await keeper.context.close();
    }
    const admin = await signedInAs('local-admin-token');
    try {
      await openGames(admin.page, 'quiet-pines');
      note(
        'the admin of the same league sees the game under way there',
        (await idsIn(part(admin.page, 'Needs a result'))).includes(liveGame),
      );
    } finally {
      await admin.context.close();
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Needs-a-result browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Needs-a-result browser test passed (${checked.length} checks).`);
