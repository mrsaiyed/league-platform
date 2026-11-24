// Step 2.119 (P7 §5.1 and §5.2; S-35, S-39): the game format at the table, in a real browser,
// against the web app on its made-up stand-in (APP_ENV=test). Nothing leaves this computer;
// every team, game and person is made up. Builds the app first unless given --no-build
// (npm run test:web:browser builds it once in web-exit-test.mjs).
//
// - A scorekeeper at the table changes one game (Lions at Hawks, no plays) from the season's
//   halves to 8-minute quarters with a bonus at 2 fouls, before the first play, through
//   "Change the format"; it is said back in one line. On the device the clock shows 8:00
//   and Q1, two fouls put the other team in the bonus, and the second period is Q2 at 8:00
//   with the fouls reset; on the server the game's rules are the same. The season's other
//   games keep the season's format.
// - After the first play the server refuses a change, and the games area greys the button.
// - The owner marks the game not started: it keeps the 8-minute quarters it was given.
// - The owner gives another game its own format from the games area, then "Use the
//   season's format" takes it away again.
// - With the league's setting off, a scorekeeper sees no "Change the format" and the
//   server refuses a request made by hand.
// - The tracker's and the admin's forms at the four sizes: nothing wider than the screen,
//   Save on the screen. With GAME_FORMAT_PICTURES set to a folder, a picture of each.
import path from 'node:path';
import { court, leagueId, owner, scorekeeper, sizes, trackerPath } from './tracker-driver.mjs';
import {
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

const pictures = process.env.GAME_FORMAT_PICTURES;
const phone = { width: 390, height: 844 };
const fourSizes = sizes.slice(0, 4);
// The made-up games (stand-in-world-seed.ts): Lions at Hawks tomorrow and Bears at Tigers in
// two days, neither with a play; Tigers at Lions today, its final score only.
const tableGame = '01900000-0000-7000-8000-006a00000003';
const adminGame = '01900000-0000-7000-8000-006a00000004';
const otherGame = '01900000-0000-7000-8000-006a00000001';
const LIMIT = 30_000;

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
const boss = `${owner.name}=${owner.value}`;

if (built) {
  server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  await step('starting the server and the browser', async () => {
    await waitFor(`${origin}/`, server, [{ address: trackerPath(tableGame), cookie: keeper }]);
    browser = await launch();
  });
}

/** The format endpoint, as a device or the games area calls it: the reply and its status. */
async function formatApi(cookie, game, body) {
  const answer = await fetch(`${origin}/api/v1/leagues/${leagueId}/games/${game}/format`, {
    method: body === undefined ? 'GET' : 'PUT',
    headers: { 'content-type': 'application/json', cookie, origin },
    signal: AbortSignal.timeout(LIMIT),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: answer.status, reply: JSON.parse(await answer.text()) };
}

/** A game's format as the server reads it: where it comes from, its periods and length. */
async function formatOf(game) {
  const { reply } = await formatApi(boss, game);
  if (reply.status !== 'format') throw new Error(`format of ${game} refused: ${reply.code}`);
  const { gameFormat } = reply.view.applies;
  return {
    source: reply.view.source,
    periods: gameFormat.periods,
    periodSeconds: gameFormat.periodSeconds,
    view: reply.view,
  };
}

/** The format with its periods turned the other way, for this game only, as a device would send it by hand. */
async function changedByHand(cookie, game) {
  const { view } = await formatOf(game);
  const format = {
    ...view.applies,
    gameFormat: {
      ...view.applies.gameFormat,
      periods: view.applies.gameFormat.periods === 4 ? 2 : 4,
    },
  };
  return formatApi(cookie, game, { version: view.version, format });
}

/** The game as the server holds it, as the scorekeeper's device reads it. */
async function serverGame(game) {
  const answer = await fetch(`${origin}/api/v1/leagues/${leagueId}/games/${game}/state`, {
    headers: { cookie: keeper },
    signal: AbortSignal.timeout(LIMIT),
  });
  const text = await answer.text();
  if (!answer.ok) throw new Error(`state answered ${answer.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text).state;
}

async function contextAs(cookie) {
  const [name, value] = cookie.split('=');
  const context = await browser.newContext({ viewport: phone });
  await context.addCookies([{ name, value, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(LIMIT);
  return { context, page };
}

/**
 * The open form at the four sizes: nothing on the page is wider than the screen, and Save
 * and every box are inside it. A picture of each with GAME_FORMAT_PICTURES set.
 */
async function formFits(page, where) {
  for (const size of fourSizes) {
    await page.setViewportSize({ width: size.width, height: size.height });
    const form = page.locator('[data-format-form]');
    await form.locator('[data-format-save]').scrollIntoViewIfNeeded();
    const fit = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const outside = [
        ...document.querySelectorAll('[data-format-form] :is(input, select, button)'),
      ]
        .map((el) => ({ el, box: el.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && (box.left < -0.5 || box.right > width + 0.5))
        .map(({ el }) => el.getAttribute('name') ?? el.textContent?.trim());
      return { wider: document.documentElement.scrollWidth > width + 0.5, outside };
    });
    note(
      `${where} at ${size.width} x ${size.height}: the form is no wider than the screen and Save and every box are on it`,
      !fit.wider && fit.outside.length === 0,
      JSON.stringify(fit),
    );
    if (pictures) {
      await page.screenshot({
        path: path.join(
          pictures,
          `game-format-${where.split(' ')[1]}-${size.width}x${size.height}.png`,
        ),
      });
    }
  }
  await page.setViewportSize(phone);
}

/** Taps a player by their id, then one of their options, and waits for the play. */
async function playById(page, id, act) {
  const c = court(page);
  const options = c.pad.locator(`[data-options="${id}"]`);
  if (!(await options.isVisible()))
    await c.root.locator(`[data-teams] [data-player="${id}"]`).click();
  await c.recorded(() => options.locator(`[data-act="${act}"]`).click());
}

const periodShown = async (page) =>
  (await court(page).root.locator('[data-clock] [data-period]').innerText()).trim();

if (browser) {
  await step('the scorekeeper changes one game from halves to quarters at the table', async () => {
    const before = await formatOf(tableGame);
    note(
      "before: the game follows the season's halves",
      before.source === 'season' && before.periods === 2,
      JSON.stringify(before),
    );
    const { context, page } = await contextAs(keeper);
    try {
      await page.goto(origin + trackerPath(tableGame));
      const panel = page.locator('[data-game-format]');
      await panel.waitFor();
      note(
        'the start confirmation lists every rule, the clock mode included',
        // A last-minutes scope is listed only when there is a last-minutes stop clock.
        (await panel.locator('[data-format-facts] li').count()) ===
          before.view.facts.filter((f) => !(f.fact === 'stopClockScope' && f.value === null))
            .length && before.view.facts.some((f) => f.fact === 'clockMode'),
        `${await panel.locator('[data-format-facts] li').count()} shown, facts ${before.view.facts.map((f) => f.fact).join(',')}`,
      );
      await panel.locator('[data-format-change]:not([disabled])').click();
      const form = page.locator('[data-format-form]');
      await form.waitFor();
      await formFits(page, 'the tracker form');
      // While the form is open the game cannot be started: what is typed is never lost.
      const confirm = page.getByRole('button', { name: 'Confirm and start scoring' });
      const closeFirst = page.locator('[data-format-close-first]');
      note(
        'while the form is open "Confirm and start scoring" waits, saying to save or close the form first',
        (await confirm.isDisabled()) &&
          (await closeFirst.innerText()).trim() === 'Save or close the format form first.',
        `${await confirm.isDisabled()} ${await closeFirst.count()}`,
      );
      await form.locator('input[name=minutes]').fill('9');
      await form.getByRole('button', { name: 'Cancel' }).click();
      await form.waitFor({ state: 'detached', timeout: 30_000 });
      const unsaved = await formatOf(tableGame);
      note(
        'closed with unsaved typing, nothing starts and nothing is saved: the confirmation waits, ready',
        (await page.locator('[data-format]').isVisible()) &&
          (await confirm.isEnabled()) &&
          (await closeFirst.count()) === 0 &&
          unsaved.source === 'season' &&
          unsaved.periods === 2,
        JSON.stringify({ ...unsaved, view: undefined }),
      );
      await panel.locator('[data-format-change]:not([disabled])').click();
      await form.waitFor();
      await form.locator('select[name=periods]').selectOption('4');
      await form.locator('input[name=minutes]').fill('8');
      await form.locator('select[name=teamFoulsReset]').selectOption('period');
      await form.locator('input[name=bonusFouls]').fill('2');
      await form.locator('[data-format-save]').click();
      const said = page.locator('[data-format-said="saved"]');
      await said.waitFor();
      const words = (await said.innerText()).trim();
      note(
        'the change is said back in one line',
        words.startsWith('Saved for this game only:') && !words.includes('\n'),
        words,
      );
      const after = await formatOf(tableGame);
      note(
        'on the server the game now has 8-minute quarters of its own',
        after.source === 'given' && after.periods === 4 && after.periodSeconds === 480,
        JSON.stringify({ ...after, view: undefined }),
      );
      for (const game of [adminGame, otherGame]) {
        const other = await formatOf(game);
        note(
          `the season's other game ${game.slice(-1)} keeps the season's halves`,
          other.source !== 'given' && other.periods === 2,
          JSON.stringify({ ...other, view: undefined }),
        );
      }

      const c = court(page);
      await c.open();
      note(
        "on the device the clock reads 8:00, not the season's half",
        (await c.clockText()) === '8:00',
        await c.clockText(),
      );
      note(
        'on the device the period is Q1',
        (await periodShown(page)) === 'Q1',
        await periodShown(page),
      );
      const ids = async (side) =>
        c.root
          .locator(`[data-teams] [data-side="${side}"][data-player]`)
          .evaluateAll((els) => els.slice(0, 5).map((el) => el.getAttribute('data-player')));
      const home = await ids('home');
      const away = await ids('away');
      for (const id of [...home, ...away])
        await c.root.locator(`[data-teams] [data-player="${id}"]`).click();
      await c.root.locator('[data-teams] [data-oncourt="1"]').nth(9).waitFor();
      await playById(page, home[0], 'foul');
      await playById(page, home[1], 'foul');
      note(
        "on the device two fouls put the other team in the bonus (2 in this game, not the season's number)",
        (await c.root.locator('[data-bonus]').count()) === 1,
        String(await c.root.locator('[data-bonus]').count()),
      );
      await c.pickPeriod(2);
      note(
        'on the device the second period is Q2',
        (await periodShown(page)) === 'Q2',
        await periodShown(page),
      );
      note(
        'on the device the second quarter starts at 8:00',
        (await c.clockText()) === '8:00',
        await c.clockText(),
      );
      note(
        'on the device the team fouls are reset by the quarter: no bonus in Q2',
        (await c.root.locator('[data-bonus]').count()) === 0,
      );
      // The clock follows: it runs down from the quarter's 8:00, for a moment, then stops.
      await c.startClock();
      await page.waitForFunction(
        () => /^7:[0-5]\d$/.test(document.querySelector('[data-clock-time]')?.textContent ?? ''),
        null,
        { timeout: 30_000 },
      );
      await c.pauseClock();
      const ran = await c.clockText();
      note(
        "on the device the clock runs down from 8:00 in Q2, not from the season's half",
        /^7:[0-5]\d$/.test(ran) && (await periodShown(page)) === 'Q2',
        ran,
      );
      await c.saved();
      const state = await serverGame(tableGame);
      note(
        'on the server the game is played in 8-minute quarters, the bonus at 2, in its second period',
        state.rules.periods === 4 &&
          state.rules.periodSeconds === 480 &&
          state.rules.bonusFouls === 2 &&
          state.clock.remainingMs < 480_000 &&
          state.clock.remainingMs > 420_000 &&
          !state.clock.running &&
          state.plays.some((p) => p.period === 2),
        JSON.stringify({ rules: state.rules, clock: state.clock, plays: state.plays.length }),
      );
      await c.leave();
    } finally {
      await context.close();
    }
  });

  await step(
    'after the first play the server refuses and the games area greys the button',
    async () => {
      const asked = await changedByHand(keeper, tableGame);
      note(
        'after the first play the server refuses a scorekeeper',
        asked.status >= 400 && asked.reply.status === 'refused' && asked.reply.code === 'under-way',
        JSON.stringify(asked),
      );
      const byAdmin = await changedByHand(boss, tableGame);
      note(
        'after the first play the server refuses an admin too',
        byAdmin.status >= 400 && byAdmin.reply.code === 'under-way',
        JSON.stringify(byAdmin),
      );
      const { context, page } = await contextAs(boss);
      try {
        await page.goto(`${origin}/north-valley/admin/games/${tableGame}`);
        const button = page.locator('[data-admin-format] [data-format-change]');
        await button.waitFor();
        note(
          'in the games area "Change the format" is greyed once the game is under way',
          await button.isDisabled(),
        );
      } finally {
        await context.close();
      }
    },
  );

  await step('marked not started, the game keeps the 8-minute quarters it was given', async () => {
    const { context, page } = await contextAs(boss);
    try {
      await page.goto(origin + trackerPath(tableGame));
      const c = court(page);
      await c.open();
      await c.fromMore('more-not-started').catch(async (error) => {
        const text = await page.locator('body').innerText({ timeout: 5_000 });
        throw new Error(`${whatWentWrong(error)}; the page says: ${text.slice(0, 600)}`);
      });
      await c.notStartedAsk.waitFor();
      await c.answer('yes').click();
      // Cleared, the game is scheduled again: the start confirmation asks about its format.
      await page
        .locator('[data-game-format]')
        .waitFor()
        .catch(async (error) => {
          const text = await page.locator('body').innerText({ timeout: 5_000 });
          throw new Error(`${whatWentWrong(error)}; the page says: ${text.slice(0, 600)}`);
        });
      note(
        'marked not started, the confirmation says the game has its own format',
        (await page.locator('[data-game-format]').getAttribute('data-format-source')) === 'given',
      );
      note(
        'marked not started, the server holds no play',
        (await serverGame(tableGame)).plays.length === 0,
      );
      const after = await formatOf(tableGame);
      note(
        'marked not started, the game still has 8-minute quarters, its own',
        after.source === 'given' && after.periods === 4 && after.periodSeconds === 480,
        JSON.stringify({ ...after, view: undefined }),
      );
      // The confirmation has no way out of its own: the page is closed, and the scorekeeper
      // below takes the game over, as a second device would.
    } finally {
      await context.close();
    }
  });

  await step(
    'an admin gives one game its own format from the games area, and takes it away',
    async () => {
      const { context, page } = await contextAs(boss);
      try {
        await page.goto(`${origin}/north-valley/admin/games/${adminGame}`);
        const section = page.locator('[data-admin-format]');
        await section.locator('[data-format-change]:not([disabled])').click();
        const form = section.locator('[data-format-form]');
        await form.waitFor();
        await formFits(page, 'the admin form');
        await form.locator('select[name=periods]').selectOption('4');
        await form.locator('input[name=minutes]').fill('10');
        await form.locator('[data-format-save]').click();
        await section.locator('[data-format-said="saved"]').waitFor();
        const given = await formatOf(adminGame);
        note(
          'the admin gave the game 10-minute quarters of its own',
          given.source === 'given' && given.periods === 4 && given.periodSeconds === 600,
          JSON.stringify({ ...given, view: undefined }),
        );
        await section.locator('[data-format-season]').click();
        await section
          .locator('[data-format-said="saved"]')
          .filter({ hasText: /season's format again/ })
          .waitFor();
        const back = await formatOf(adminGame);
        note(
          '"Use the season\'s format" takes it away again',
          back.source === 'season' && back.view.given === null && back.periods === 2,
          JSON.stringify({ ...back, view: undefined }),
        );
      } finally {
        await context.close();
      }
    },
  );

  await step(
    'with the setting off a scorekeeper has no button and the server refuses',
    async () => {
      const admin = await contextAs(boss);
      try {
        await admin.page.goto(`${origin}/north-valley/admin/settings`);
        const setting = admin.page.locator(
          'section[data-setting="games.scorekeepersMayChangeFormat"]',
        );
        await setting.locator('input[type=radio][value=false]').check();
        await Promise.all([
          admin.page.waitForURL(/done=|problem=/),
          setting.locator('button[type=submit]').click(),
        ]);
        note('the owner turns the setting off', /done=/.test(admin.page.url()), admin.page.url());
      } finally {
        await admin.context.close();
      }
      const { context, page } = await contextAs(keeper);
      try {
        await page.goto(origin + trackerPath(tableGame));
        const panel = page.locator('[data-game-format]');
        const takeOver = page.getByRole('button', { name: 'Take over scoring' });
        await panel.or(takeOver).first().waitFor();
        if (await takeOver.isVisible()) {
          await takeOver.click();
          await page.getByRole('button', { name: 'Yes, take over' }).click();
        }
        await panel.waitFor();
        note(
          'with the setting off the confirmation lists the rules with no "Change the format"',
          (await panel.locator('[data-format-facts] li').count()) > 0 &&
            (await page.locator('[data-format-change]').count()) === 0,
        );
      } finally {
        await context.close();
      }
      const asked = await changedByHand(keeper, tableGame);
      note(
        'with the setting off the server refuses a scorekeeper',
        asked.status >= 400 && asked.reply.code === 'setting-off',
        JSON.stringify(asked),
      );
      note(
        'and the game keeps the quarters it was given',
        (await formatOf(tableGame)).periods === 4,
      );
    },
  );
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Game format browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Game format browser test passed (${checked.length} checks).`);
