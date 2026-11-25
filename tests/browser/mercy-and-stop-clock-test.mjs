// A season with a mercy rule and a last-minutes stop clock plays a tracked game (step 2.248;
// P7 section 5.2, S-28 to S-32, S-113, T-442), in a real browser on a made-up world of its
// own:
// - The owner gives the season a stop clock, a mercy lead of 10 and a stop clock in the
//   last 2 minutes ("Save the game rules"): the settings keep all three.
// - Before the mercy line a foul stops the running clock.
// - The basket that takes the lead to 12 switches to a running clock: the notice says the
//   clock keeps running and offers the way back; a foul then leaves the clock running.
// - In the last regulation period, from 2:10, the clock reaches 2:00: the notice now says
//   the clock stops on every foul there and offers only "Got it"; the "Stop clock" sign is
//   drawn; a foul stops the clock; the running-clock switch is shown but cannot be used.
// - Overtime is a new period: the running clock, the notice's own words with its way back
//   and the switch all come back.
// Builds the app first unless given --no-build, so it never runs on an old build.
import {
  addPlayers,
  court,
  liveGame,
  seasonClock,
  scorekeeper,
  starters,
  trackerPath,
} from './tracker-driver.mjs';
import { buildNext, freePort, launch, startNext, waitFor } from './web-browser-kit.mjs';

/** How long a tap may take to show, and the running clock to reach 2:00 from 2:10. */
const tapLimit = 10_000;
const windowLimit = 25_000;

const said =
  'One team leads by 10 or more, so the clock now keeps running after fouls (the mercy rule).';
const saidLast =
  'One team leads by 10 or more (the mercy rule), but in these last minutes the clock stops on every foul.';

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
  console.error('Mercy and stop clock browser test: next build failed or took over 10 minutes');
  process.exit(1);
}

const origin = `http://localhost:${await freePort()}`;
const server = startNext(['start', '--port', new URL(origin).port], {
  APP_ENV: 'test',
  PUBLIC_BASE_URL: origin,
});
let browser;

try {
  await waitFor(`${origin}/`, server);
  browser = await launch();

  let periods = 0;
  await step('the owner gives the season a mercy lead of 10 and the last 2 minutes', async () => {
    periods = await seasonClock(browser, origin, 'stop', '2', '10');
  });
  await addPlayers(origin);

  await step('the tracked game', async () => {
    if (periods < 1) throw new Error('the season was not saved');
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
    try {
      await context.addCookies([{ ...scorekeeper, url: origin }]);
      const page = await context.newPage();
      await page.goto(`${origin}${trackerPath(liveGame)}`);
      const c = court(page);
      await c.open();
      const root = c.root;
      const notice = root.locator('[data-mercy-notice]');
      const sign = root.locator('[data-clock] [data-last-minutes]');
      const sheet = root.locator('[data-clock-sheet] [role="dialog"]');
      const modeIs = (mode) =>
        root.locator(`[data-clock][data-clock-mode="${mode}"]`).waitFor({ timeout: tapLimit });
      const toggle = (state) =>
        root.locator(`[data-clock-toggle][data-state="${state}"]`).waitFor({ timeout: tapLimit });
      const running = async () => (await root.locator('[data-clock][data-running]').count()) === 1;
      const words = async () => ((await notice.locator('p').textContent()) ?? '').trim();
      /** The switch in the clock's form: whether it reads On and whether it can be used. */
      const theSwitch = async () => {
        await root.locator('[data-clock]').click();
        await sheet.waitFor({ timeout: tapLimit });
        const button = sheet.locator('[data-clock-switch]');
        const seen = {
          on: (await button.getAttribute('aria-checked')) === 'true',
          usable: await button.isEnabled(),
          help: ((await sheet.locator('[data-clock-mode-help]').textContent()) ?? '').trim(),
        };
        await page.keyboard.press('Escape');
        await sheet.waitFor({ state: 'detached', timeout: tapLimit });
        return seen;
      };

      await c.pick('home', starters);
      await c.pick('away', starters);
      await modeIs('stop');

      // Before the mercy line: a stop clock, so the whistle stops the running clock.
      await c.setClock('500');
      await c.startClock();
      await c.play('away', 3, 'foul');
      await toggle('start');
      note('before the mercy line a foul stops the clock', !(await running()));

      // 12–0: the lead crosses 10, the clock now runs through fouls.
      for (const jersey of [3, 5, 7, 9]) await c.play('home', jersey, 'p3');
      await modeIs('running');
      await notice.waitFor({ timeout: tapLimit });
      note(
        'after the mercy line the notice says the clock keeps running',
        (await words()) === said,
      );
      note(
        'after the mercy line the notice offers the way back',
        (await notice.locator('[data-mercy-back]').count()) === 1,
      );
      await c.startClock();
      await c.play('away', 5, 'foul');
      await page.waitForTimeout(1_500);
      note('after the mercy line a foul leaves the clock running', await running());
      await c.pauseClock();

      // The last regulation period, from 2:10: the clock runs into the last minutes.
      await c.pickPeriod(periods);
      await page.keyboard.press('Escape');
      await c.setClock('210');
      await modeIs('running');
      await notice.waitFor({ timeout: tapLimit });
      note('at 2:10 the notice still says the clock keeps running', (await words()) === said);
      const outside = await theSwitch();
      note('at 2:10 the switch reads On and can be used', outside.on && outside.usable);
      await c.startClock();
      await notice.locator('[data-mercy-last-minutes]').waitFor({ timeout: windowLimit });
      await modeIs('stop');
      note('in the last minutes the notice says the clock stops', (await words()) === saidLast);
      note(
        'in the last minutes the notice offers no way back, only "Got it"',
        (await notice.locator('[data-mercy-back]').count()) === 0 &&
          ((await notice.locator('[data-mercy-keep]').textContent()) ?? '').trim() === 'Got it',
      );
      note('in the last minutes the "Stop clock" sign is drawn', (await sign.count()) === 1);
      await c.play('away', 7, 'foul');
      await toggle('start');
      note('in the last minutes a foul stops the clock', !(await running()));
      const inside = await theSwitch();
      note(
        'in the last minutes the switch reads Off, cannot be used and says why',
        !inside.on &&
          !inside.usable &&
          inside.help ===
            'These are the last minutes, so the clock stops on every foul. The switch comes back when they end.',
        JSON.stringify(inside),
      );
      note('the notice is still there after the foul', (await words()) === saidLast);

      // Overtime is a new period: the running clock, the notice and the switch come back.
      await c.pickPeriod(periods + 1);
      await page.keyboard.press('Escape');
      await modeIs('running');
      await notice.locator('[data-mercy-back]').waitFor({ timeout: tapLimit });
      note('in overtime the notice says the clock keeps running again', (await words()) === said);
      note('in overtime the sign is gone', (await sign.count()) === 0);
      const overtime = await theSwitch();
      note('in overtime the switch reads On and can be used', overtime.on && overtime.usable);
      await c.startClock();
      await c.play('away', 9, 'foul');
      await page.waitForTimeout(1_500);
      note('in overtime a foul leaves the clock running', await running());
      await c.pauseClock();
    } finally {
      await context.close();
    }
  });
} finally {
  await browser?.close();
  server.child.kill();
}

if (failures.length > 0) {
  console.error(`Mercy and stop clock browser test: ${failures.length} problem(s)`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`Mercy and stop clock browser test passed: ${checks} checks.`);
