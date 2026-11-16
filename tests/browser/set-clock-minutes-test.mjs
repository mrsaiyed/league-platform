// Step 2.189: a clock set wrongly and put right leaves the minutes as they were, in a real
// browser on the new scoring screen, against the web app on its made-up stand-in
// (APP_ENV=test). Nothing leaves this computer; every team, game and person is made up.
// Builds the app first unless given --no-build (npm run test:web:browser builds it once in
// web-exit-test.mjs).
//
// The worked example the area 4 lead met on the screen (finding M4): in a half of 20:00,
// with 16:55 on the clock, all ten on the court have played 3:05, and a basket was made at
// 19:00. The scorekeeper sets the clock to 12:00 by mistake and back to 16:55. Before, all
// ten read 0:00 and the basket 16:55. Now (S-71, minutes on the game clock):
// - the form says before each set what it will do, from the engine's own helper: 12:00
//   adds 4:55 to the minutes of the players on the court; 16:55 then takes the 4:55 off;
// - after each set, the sentence says what truly happened, with the same figure;
// - all ten read 3:05 at the end, on the screen and again after a reload, and the basket
//   still reads 19:00 in the game the server holds.
import { court, leagueId, liveGame, scorekeeper, trackerPath } from './tracker-driver.mjs';
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  startNext,
  trackedPlayer,
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

const phone = { width: 390, height: 844 };
// The made-up game under way (stand-in-world-seed.ts): the third team at home, the fourth
// away, five of each on the court.
const home = [1, 2, 3, 4, 5].map((n) => trackedPlayer(3, n));
const away = [1, 2, 3, 4, 5].map((n) => trackedPlayer(4, n));
const everyone = [...home, ...away];

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
const keeper = `${scorekeeper.name}=${scorekeeper.value}`;

if (built) {
  server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  await step('starting the server and the browser', async () => {
    await waitFor(`${origin}/`, server, [{ address: trackerPath(), cookie: keeper }]);
    browser = await launch();
  });
}

/** The tracker's own endpoints, as a scorekeeper's tablet calls them. */
async function api(method, at, body) {
  const answer = await fetch(`${origin}/api/v1/leagues/${leagueId}/games/${liveGame}${at}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: keeper, origin },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await answer.text();
  if (!answer.ok) throw new Error(`${at} answered ${answer.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

/**
 * The half played up to 16:55 from another tablet, each tap at the moment it happened, so
 * the clock really ran 3:05 (the server runs the clock from a tap's own time, T6 §4), and
 * the tablet then lets go of the game for the browser.
 */
async function playedTo1655() {
  const { sessionId } = await api('POST', '/session', {
    type: 'open',
    deviceId: 'set-clock-tablet',
  });
  const tip = Date.now() - 190_000;
  const tap = (input, after) => ({ commandId: crypto.randomUUID(), at: tip + after, input });
  try {
    const reply = await api('POST', '/commands', {
      protocolVersion: 2,
      sessionId,
      commands: [
        tap({ type: 'lineup', side: 'home', playerIds: home }, 0),
        tap({ type: 'lineup', side: 'away', playerIds: away }, 0),
        tap({ type: 'start' }, 0),
        tap({ type: 'score', side: 'home', playerId: home[0], points: 2 }, 60_000),
        tap({ type: 'pause' }, 185_000),
      ],
    });
    const refused = reply.results.filter((r) => r.status !== 'accepted');
    if (refused.length > 0) throw new Error(`taps refused: ${JSON.stringify(refused)}`);
  } finally {
    await api('POST', '/session', { type: 'release', sessionId });
  }
}

/** Every one of the ten's minutes as their tiles show them. */
async function minutesShown(page) {
  return page.evaluate(
    (ids) =>
      ids.map(
        (id) =>
          document.querySelector(`[data-teams] [data-minutes-of="${id}"]`)?.textContent?.trim() ??
          '',
      ),
    everyone,
  );
}
const allAt = (shown, time) => shown.length === 10 && shown.every((m) => m === time);

if (browser) {
  await step('16:55 set to 12:00 and back to 16:55 leaves 3:05 played', async () => {
    await playedTo1655();
    const context = await browser.newContext({ viewport: phone });
    await context.addCookies([{ ...scorekeeper, url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(`${origin}${trackerPath()}`);
      const c = court(page);
      await c.open();
      await page.waitForFunction(
        () => document.querySelector('[data-clock-time]')?.textContent === '16:55',
      );
      let shown = await minutesShown(page);
      note(
        'the game opens at 16:55 with all ten on the court at 3:05',
        allAt(shown, '3:05'),
        shown.join(' '),
      );

      // The mistake: 12:00. The form says first what it will do.
      await c.typeClock('1200');
      const adds = (await c.clockSheet.locator('[data-clock-note]').innerText()).trim();
      note(
        'before the set to 12:00 the form says it adds 4:55 to the minutes of the players on the court',
        adds === 'This adds 4:55 to the minutes of the players on the court.',
        adds,
      );
      const problems = await accessibilityProblems(page);
      note(
        'accessibility: the clock form saying what a set adds',
        problems.length === 0,
        problems.join('; '),
      );
      await c.root.locator('[data-clock-sheet] [data-set-clock]').click();
      await c.root.locator('[data-clock-sheet]').waitFor({ state: 'detached' });
      await page.waitForFunction(
        () => document.querySelector('[data-clock-time]')?.textContent === '12:00',
      );
      await page.waitForFunction(() =>
        /^Clock set to 12:00\./.test(document.querySelector('[data-say]')?.textContent ?? ''),
      );
      note(
        'once set, the sentence says what truly happened: 4:55 was added',
        (await c.said.innerText()).trim() ===
          'Clock set to 12:00. 4:55 was added to the minutes of the players on the court.',
        await c.said.innerText(),
      );
      shown = await minutesShown(page);
      note('at 12:00, all ten read 8:00', allAt(shown, '8:00'), shown.join(' '));

      // Put right: 16:55 again.
      await c.typeClock('1655');
      const takes = (await c.clockSheet.locator('[data-clock-note]').innerText()).trim();
      note(
        'before the set back to 16:55 the form says it takes the 4:55 off, not the half',
        takes === 'This takes 4:55 off the minutes of the players on the court.',
        takes,
      );
      await c.root.locator('[data-clock-sheet] [data-set-clock]').click();
      await c.root.locator('[data-clock-sheet]').waitFor({ state: 'detached' });
      await page.waitForFunction(
        () => document.querySelector('[data-clock-time]')?.textContent === '16:55',
      );
      await page.waitForFunction(() =>
        /^Clock set to 16:55\./.test(document.querySelector('[data-say]')?.textContent ?? ''),
      );
      note(
        'once set back, the sentence says 4:55 came off',
        (await c.said.innerText()).trim() ===
          'Clock set to 16:55. 4:55 came off the minutes of the players on the court.',
        await c.said.innerText(),
      );
      shown = await minutesShown(page);
      note(
        'set wrongly and put right, all ten read 3:05 again',
        allAt(shown, '3:05'),
        shown.join(' '),
      );

      // The server holds the same: after every tap is saved, a reload reads 3:05, and the
      // basket made at 19:00 still reads 19:00 (its clock time is never rewritten).
      await c.saved();
      const held = await api('GET', '/state');
      const basket = held.state.plays.find((p) => p.type === 'score');
      note(
        'the game the server holds counts minutes on the game clock, and the basket reads 19:00',
        held.state.rules.minutesFollow === 'game-clock' &&
          basket?.clockMs === 1_140_000 &&
          held.state.clock.remainingMs === 1_015_000,
        JSON.stringify({ rules: held.state.rules.minutesFollow, basket: basket?.clockMs }),
      );
      await page.reload();
      await c.open();
      await page.waitForFunction(
        () => document.querySelector('[data-clock-time]')?.textContent === '16:55',
      );
      shown = await minutesShown(page);
      note('after a reload, all ten still read 3:05', allAt(shown, '3:05'), shown.join(' '));
      note('no error on the page', errors.length === 0, errors.join('; '));
    } finally {
      await context.close();
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Set-clock minutes browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Set-clock minutes browser test passed (${checked.length} checks).`);
