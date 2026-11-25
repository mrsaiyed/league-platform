// A mercy-rule game played end to end on the scoring screen (step 2.69; P7 section 5.2,
// S-21, T-128), in a real browser on a made-up world of its own:
// - The owner gives the season a stop clock with a mercy lead of 10 ("Save the game
//   rules"). A basket that takes the lead to 10 switches the clock to running and the
//   notice says so; "Stop the clock on fouls again" switches it back. A later crossing says
//   it again; "Keep it running" hides it, and a reload of the page does not bring it back
//   for the same basket (the lead's decision of step 2.69: a scorekeeper's phone reloads).
// - The running-clock switch is turned off by hand with no signal (shown as unsaved, kept
//   by the device) and sent once when the signal returns, then turned on again.
// - The game is ended, and its public page shows the final score.
// - A season cannot hold both a mercy lead and a last-minutes stop clock (the first is a
//   stop clock's, the second a running clock's), so the "Stop clock" sign is played in a
//   second game of the same world, once the owner gives the season a running clock that
//   stops in the last 2 minutes: the sign is not there at 2:10 and is drawn as the running
//   clock reaches 2:00.
// Builds the app first unless given --no-build, so it never runs on an old build.
import {
  addPlayers,
  court,
  league,
  liveGame,
  owner,
  scorekeeper,
  starters,
  trackerPath,
} from './tracker-driver.mjs';
import { buildNext, freePort, launch, startNext, waitFor } from './web-browser-kit.mjs';

/** Lions at Hawks, no plays: the game the last-minutes sign is played in. */
const signGame = '01900000-0000-7000-8000-006a00000003';
/** How long a tap may take to show, the game to be saved as ended, the clock to reach 2:00. */
const tapLimit = 10_000;
const endLimit = 20_000;
const windowLimit = 25_000;

const failures = [];
let checks = 0;
const note = (what, ok, detail = '') => {
  checks += 1;
  if (!ok) failures.push(`${what}${detail === '' ? '' : `: ${detail}`}`);
};
const step = async (what, work) => {
  try {
    await work();
  } catch (error) {
    failures.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

if (!process.argv.includes('--no-build') && !(await buildNext())) {
  console.error('Mercy rule browser test: next build failed or took over 10 minutes');
  process.exit(1);
}

const origin = `http://localhost:${await freePort()}`;
const server = startNext(['start', '--port', new URL(origin).port], {
  APP_ENV: 'test',
  PUBLIC_BASE_URL: origin,
});
let browser;

/**
 * The owner sets the season's clock in "Game rules", as on the season's settings page:
 * `mode` stop or running, `lastMinutes` and `mercyLead` a number or '' for none. Throws
 * unless the page then shows the season so. Returns the season's number of periods.
 */
async function seasonClock(mode, lastMinutes, mercyLead) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    await context.addCookies([{ ...owner, url: origin }]);
    const page = await context.newPage();
    const address = `${origin}/${league}/admin/season?season=fall-2026&edit=game`;
    await page.goto(address);
    await page.locator(`input[name=clockMode][value=${mode}]`).check();
    await page.locator('input[name=lastMinutes]').fill(lastMinutes);
    await page.locator('input[name=mercyLead]').fill(mercyLead);
    await Promise.all([
      page.waitForEvent('load'),
      page.getByRole('button', { name: 'Save the game rules' }).click(),
    ]);
    await page.goto(address);
    const kept = {
      mode: await page.locator('input[name=clockMode]:checked').getAttribute('value'),
      lastMinutes: await page.locator('input[name=lastMinutes]').inputValue(),
      mercyLead: await page.locator('input[name=mercyLead]').inputValue(),
    };
    if (kept.mode !== mode || kept.lastMinutes !== lastMinutes || kept.mercyLead !== mercyLead) {
      throw new Error(`the season keeps ${JSON.stringify(kept)}`);
    }
    return Number(await page.locator('input[name=periods]:checked').getAttribute('value'));
  } finally {
    await context.close();
  }
}

/** The scoring screen of `game` on a tablet lying down; `work` gets the court, page and context. */
async function onTheScreen(game, work) {
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  try {
    await context.addCookies([{ ...scorekeeper, url: origin }]);
    const page = await context.newPage();
    await page.goto(`${origin}${trackerPath(game)}`);
    const c = court(page);
    await c.open();
    await work(c, page, context);
  } finally {
    await context.close();
  }
}

/** The mode the scoreboard's clock says is in force, once it says `mode` (or a timeout). */
const modeIs = (page, mode) =>
  page.locator(`[data-scoring] [data-clock][data-clock-mode="${mode}"]`).waitFor({
    timeout: tapLimit,
  });
const notice = (page) => page.locator('[data-scoring] [data-mercy-notice]');

/**
 * Opens the clock's form and taps the running-clock switch, which reads On or Off as the
 * mode in force; the tap closes the form, and the scoreboard's clock then says the mode.
 */
async function flipSwitch(page, on) {
  const sheet = page.locator('[data-clock-sheet] [role="dialog"]');
  if (!(await sheet.isVisible())) await page.locator('[data-scoring] [data-clock]').click();
  await sheet.waitFor({ timeout: tapLimit });
  const before = await sheet.locator('[data-clock-switch]').getAttribute('aria-checked');
  if (before !== String(!on)) throw new Error(`the switch read ${before} before the tap`);
  await sheet.locator('[data-clock-switch]').click();
  await sheet.waitFor({ state: 'detached', timeout: tapLimit });
  await modeIs(page, on ? 'running' : 'stop');
}

try {
  await waitFor(`${origin}/`, server);
  browser = await launch();

  await step('the owner gives the season a stop clock with a mercy lead of 10', () =>
    seasonClock('stop', '', '10'),
  );
  await addPlayers(origin);

  await step('the mercy game on the scoring screen', () =>
    onTheScreen(liveGame, async (c, page, context) => {
      await c.pick('home', starters);
      await c.pick('away', starters);
      await modeIs(page, 'stop');
      // 9–0 is a lead under the mercy line: no notice.
      for (const jersey of [3, 5, 7]) await c.play('home', jersey, 'p3');
      note('no notice under the mercy lead', (await notice(page).count()) === 0);
      // 11–0 crosses it: the clock now runs, and the notice says so with the way back.
      await c.play('home', 9, 'p2');
      await notice(page).waitFor({ timeout: tapLimit });
      await modeIs(page, 'running');
      note(
        'the notice names the mercy lead',
        ((await notice(page).textContent()) ?? '').includes('10'),
      );
      await notice(page).locator('[data-mercy-back]').click();
      await modeIs(page, 'stop');
      await notice(page).waitFor({ state: 'detached', timeout: tapLimit });
      note('"Stop the clock on fouls again" stops it and ends the notice', true);

      // 11–3, then 13–3: a later crossing is a new notice; "Keep it running" hides it.
      await c.play('away', 3, 'p3');
      note('no notice under the lead once switched back', (await notice(page).count()) === 0);
      await c.play('home', 11, 'p2');
      await notice(page).waitFor({ timeout: tapLimit });
      await modeIs(page, 'running');
      await notice(page).locator('[data-mercy-keep]').click();
      await notice(page).waitFor({ state: 'detached', timeout: tapLimit });
      await modeIs(page, 'running');
      note('"Keep it running" hides the notice and the clock still runs', true);
      await c.saved();

      // The phone reloads: the same basket's notice is not said again.
      await page.reload();
      await c.open();
      await modeIs(page, 'running');
      note('after a reload the dismissed notice stays away', (await notice(page).count()) === 0);

      // The switch by hand with no signal: kept as unsaved, sent once when it returns.
      const sent = [];
      page.on('request', (request) => {
        if (!request.url().endsWith('/commands') || request.method() !== 'POST') return;
        const body = JSON.parse(request.postData() ?? '{}');
        for (const command of body.commands ?? []) {
          if (command.input?.type === 'clock-mode') sent.push(command.commandId);
        }
      });
      await context.setOffline(true);
      await flipSwitch(page, false);
      await modeIs(page, 'stop');
      await page
        .locator('[data-saved-banner][data-state="waiting"]')
        .waitFor({ timeout: tapLimit });
      note('with no signal the switch is shown as unsaved', true);
      await context.setOffline(false);
      await page.locator('[data-saved-banner][data-state="saved"]').waitFor({ timeout: endLimit });
      note(
        'the switch is sent once the signal returns, as one command',
        sent.length >= 1 && new Set(sent).size === 1,
        JSON.stringify(sent),
      );
      // And back on, with signal: the clock runs again.
      await flipSwitch(page, true);
      await modeIs(page, 'running');
      await c.saved();
      note('the switch turned on by hand runs the clock again', true);

      // 13–3, home ahead: the game is ended.
      await c.endGame();
      await c.pad.locator('[data-final="saved"]').waitFor({ timeout: endLimit });
    }),
  );

  await step('a new device sees the switch kept once: a stop clock, then running', () =>
    onTheScreen(liveGame, async (_c, page) => {
      const plays = await page.locator('[data-scoring]').getAttribute('data-plays');
      note('the game is opened again with its plays', Number(plays) > 0, String(plays));
      await page.locator('[data-scoring] [data-clock][data-clock-mode="running"]').waitFor({
        timeout: tapLimit,
      });
    }),
  );

  await step('the public game page shows the final score', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      const page = await context.newPage();
      const answer = await page.goto(`${origin}/${league}/games/${liveGame}`);
      note('the game page answers 200', answer?.status() === 200, String(answer?.status()));
      const board = page.locator('.ui-scoreboard[data-state="final"]').first();
      await board.waitFor({ timeout: tapLimit });
      // Away first, home second, as the scoreboard draws them.
      const scores = await board.locator('.ui-scoreboard-score').allTextContents();
      note('the final score is 13–3 to the home team', scores.join('-') === '3-13', scores.join());
    } finally {
      await context.close();
    }
  });

  let periods = 4;
  await step(
    'the owner gives the season a running clock that stops in the last 2 minutes',
    async () => {
      periods = await seasonClock('running', '2', '');
    },
  );
  // The Hawks are the mercy game's home team too, so only the Lions are given players.
  const lions = [
    ['60', 'Gus Lionel'],
    ['61', 'Hal Lionel'],
    ['62', 'Ida Lionel'],
    ['63', 'Jo Lionel'],
    ['64', 'Kit Lionel'],
  ];
  await addPlayers(origin, { away: lions }, signGame);

  await step('the "Stop clock" sign in the last minutes', () =>
    onTheScreen(signGame, async (c, page) => {
      const sign = page.locator('[data-scoring] [data-clock] [data-last-minutes]');
      await c.pick('home', starters);
      await c.pick(
        'away',
        lions.map(([jersey]) => Number(jersey)),
      );
      await c.pickPeriod(periods);
      await page.keyboard.press('Escape');
      await c.setClock('210');
      await modeIs(page, 'running');
      note('no sign before the last minutes', (await sign.count()) === 0);
      await c.startClock();
      // The running clock reaches 2:00: the sign is drawn and a foul would stop it.
      await sign.waitFor({ timeout: windowLimit });
      await modeIs(page, 'stop');
      note(
        'the sign says "Stop clock" beside the period',
        ((await sign.textContent()) ?? '').trim() === 'Stop clock',
      );
      await c.pauseClock();
    }),
  );
} finally {
  await browser?.close();
  server.child.kill();
}

if (failures.length > 0) {
  console.error(`Mercy rule browser test: ${failures.length} problem(s)`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`Mercy rule browser test passed: ${checks} checks.`);
