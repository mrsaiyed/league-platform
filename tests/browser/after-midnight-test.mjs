// Step 2.175: just after the league's midnight, in a real browser at phone width, against
// the web app on its made-up stand-in (APP_ENV=test). Nothing leaves this computer; every
// team, game and person is made up. Builds the app first unless given --no-build (npm run
// test:web:browser builds it once in web-exit-test.mjs).
//
// The made-up world starts at 00:10 in the league's own zone (LOCAL_NOW; `--now=<UTC time>`
// starts it elsewhere). The game under way started half an hour before, so last evening.
// Its scorekeeper ends it from the tablet; a day on the Games screen ends at the league's
// midnight (S-59), so it is not on today's lists: the scorekeeper finds it under "Earlier
// games", in the round its day falls in (the latest the picker offers), and, inside the
// league's minutes to reopen a game its tracker ended, opens it and corrects it there: it
// is live again, scored in the tracker. The other browser tests start their world at noon
// so that this half hour never moves what they read; this one is about the half hour.
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  startNext,
  trackedPlayer,
  trackerTablet,
  waitFor,
  whatWentWrong,
  worldAtLeagueTime,
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

// The made-up game under way (stand-in-world-seed.ts): Bears at Hawks.
const liveGame = '01900000-0000-7000-8000-006a00000002';
const keeper = 'local-scorekeeper-token';
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
const worldNow = worldAtLeagueTime('00:10');

if (built) {
  server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
    LOCAL_NOW: worldNow,
  });
  await step('starting the server and the browser', async () => {
    await waitFor(`${origin}/`, server, [
      { address: '/north-valley/admin/games', cookie: `srl_session=${keeper}` },
    ]);
    browser = await launch();
  });
}

/** A part of the Games screen by its heading: "Today", "Earlier games", … */
const part = (page, title) =>
  page.locator('section.ui-section').filter({
    has: page.getByRole('heading', { level: 2, name: title, exact: true }),
  });
const gameOn = (page, id) => page.locator(`li[id="game-${id}"]`);

if (browser) {
  await step('a game ended at 00:10 is found under "Earlier games" and corrected', async () => {
    const send = await trackerTablet(origin, liveGame, keeper, 'after-midnight-tablet');
    const five = (team) => [1, 2, 3, 4, 5].map((n) => trackedPlayer(team, n));
    await send(
      { type: 'lineup', side: 'home', playerIds: five(3) },
      { type: 'lineup', side: 'away', playerIds: five(4) },
      { type: 'start' },
      { type: 'score', side: 'home', playerId: trackedPlayer(3, 1), points: 2 },
      { type: 'end' },
    );
    const context = await browser.newContext({ viewport: phone });
    await context.addCookies([{ name: 'srl_session', value: keeper, url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    try {
      // From the scorekeeper's home to Games, by tapping the admin's own "Games".
      await page.goto(`${origin}/north-valley/admin`);
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/north-valley/admin/games'),
        page
          .getByRole('navigation', { name: 'Admin areas' })
          .locator('a[href="/north-valley/admin/games"]')
          .click(),
      ]);
      await page.getByRole('heading', { level: 1, name: 'Games' }).waitFor();
      note(
        "the game ended last evening is not on today's lists",
        (await gameOn(page, liveGame).count()) === 0,
        `world at ${worldNow}`,
      );

      // Two taps: the way to Earlier games, then the latest round the picker offers.
      await page.getByRole('link', { name: 'Earlier games', exact: true }).first().click();
      const picker = part(page, 'Earlier games').getByLabel('Round');
      const latest = await picker
        .locator('option')
        .evaluateAll((options) => options.find((o) => o.value !== '')?.value ?? '');
      await Promise.all([
        page.waitForURL((url) => url.searchParams.get('round') === latest),
        picker.selectOption(latest),
      ]);
      const game = part(page, 'Earlier games').locator(`li[id="game-${liveGame}"]`);
      await game.waitFor();
      note(
        'under "Earlier games", in its round, the scorekeeper reads until when they may reopen it',
        /^You ended this game in the tracker, so you can reopen it until .+\. Correct this result$/.test(
          ((await game.locator('[data-reopen]').textContent()) ?? '').trim(),
        ),
        (await game.locator('[data-reopen]').textContent()) ?? '',
      );
      const problems = await accessibilityProblems(page);
      note(
        'accessibility: Earlier games, the round shown',
        problems.length === 0,
        problems.join('; '),
      );

      // Opened from there and corrected, inside the league's minutes.
      await Promise.all([
        page.waitForURL((url) => url.pathname === `/north-valley/admin/games/${liveGame}`),
        game.getByRole('link', { name: 'Correct this result' }).click(),
      ]);
      await page
        .getByLabel('Why it needs correcting (kept in the log, never shown publicly)')
        .fill('End game tapped by mistake');
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/north-valley/admin/games'),
        page.getByRole('button', { name: 'Reopen to correct' }).click(),
      ]);
      const live = gameOn(page, liveGame);
      await live.getByRole('status').waitFor();
      note(
        'reopened after midnight, it is live again and scored in the tracker',
        (await live.getByRole('status').textContent()) ===
          'The game is live again. Correct it in the tracker, then end it again.' &&
          (await live.getByRole('link', { name: 'Score this game' }).count()) === 1,
        (await live.getByRole('status').textContent()) ?? '',
      );
    } finally {
      await context.close();
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`After-midnight browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`After-midnight browser test passed (${checked.length} checks).`);
