// A season with a mercy rule and a last-minutes stop clock plays a tracked game (step 2.248;
// P7 section 5.2, S-28 to S-32, S-113, S-124), in a real browser on a made-up world of its
// own:
// - The owner gives the season a stop clock, a mercy lead of 10 and a stop clock in the
//   last 2 minutes ("Save the game rules"): the settings keep all three.
// - Before the mercy line a foul stops the running clock.
// - The basket that takes the lead to 12 switches to a running clock: the notice says the
//   clock keeps running and offers the way back; a foul then leaves the clock running.
// - A refused rules save keeps what was typed.
// - In the last regulation period, from 2:10, the clock reaches 2:00: the notice now says
//   the clock stops on every foul there and offers only "Got it" (60 tall); the "Stop
//   clock" sign is drawn; a foul stops the clock; the switch reads Off and works.
// - Overtime is a new period: the running clock, the notice with its way back (not kept
//   away by "Got it") and the switch come back. In its last minutes the switch On keeps
//   the clock running; Off leaves a stop clock for the game, and the screen says so at
//   every size, moving nothing (S-124); it comes back if done again; in the next overtime
//   it still says so, and one tap puts it right.
// Builds the app first unless given --no-build, so it never runs on an old build.
import {
  addPlayers,
  court,
  liveGame,
  seasonClock,
  league,
  owner,
  scorekeeper,
  sizes,
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

const saidStop =
  'The clock now stops on fouls for the rest of the game. Tap Running clock to change it back.';

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

  await step('a refused rules save keeps what was typed', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      await context.addCookies([{ ...owner, url: origin }]);
      const page = await context.newPage();
      await page.goto(`${origin}/${league}/admin/season?season=fall-2026&edit=game`);
      await page.locator('input[name=clockMode][value=stop]').check();
      // Two last minutes in a one-minute period: the season's rules refuse it.
      await page.locator('input[name=periodMinutes]').fill('1');
      await page.locator('input[name=lastMinutes]').fill('2');
      await page.locator('input[name=mercyLead]').fill('10');
      await page.getByRole('button', { name: 'Save the game rules' }).click();
      const why = page.getByText(/last minutes cannot be longer than/);
      await why.waitFor({ timeout: tapLimit });
      note('a refused save says why', await why.isVisible());
      const kept = [
        await page.locator('input[name=clockMode]:checked').getAttribute('value'),
        await page.locator('input[name=periodMinutes]').inputValue(),
        await page.locator('input[name=lastMinutes]').inputValue(),
        await page.locator('input[name=mercyLead]').inputValue(),
      ];
      note('a refused save keeps what was typed', kept.join() === 'stop,1,2,10', kept.join());
    } finally {
      await context.close();
    }
  });

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
      /** A tap on the switch in the clock's form, which closes the form; waits for the play. */
      const flip = async () => {
        await root.locator('[data-clock]').click();
        await sheet.waitFor({ timeout: tapLimit });
        const count = await page.locator('[data-scoring]').getAttribute('data-plays');
        await sheet.locator('[data-clock-switch]').click();
        await sheet.waitFor({ state: 'detached', timeout: tapLimit });
        await page
          .locator(`[data-scoring]:not([data-plays="${count}"])`)
          .waitFor({ timeout: tapLimit });
      };
      /** The foul just taken is the latest play and the server has it: then the clock is read. */
      const fouled = () =>
        page
          .locator('[data-latest] [data-log-open]:not([data-unsent])', { hasText: /foul/i })
          .waitFor({ state: 'attached', timeout: tapLimit });
      const stopNotice = root.locator('[data-last-minutes-stop]');
      const stopSeen = stopNotice.locator('[data-last-minutes-stop-seen]');
      const stopWords = async () => ((await stopNotice.locator('p').textContent()) ?? '').trim();

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
      await fouled();
      note('after the mercy line a foul leaves the clock running', await running());
      await c.pauseClock();

      // The last regulation period, from 2:10: the clock runs into the last minutes.
      await c.pickPeriod(periods);
      await page.keyboard.press('Escape');
      await c.setClock('210');
      await modeIs('running');
      await notice.waitFor({ timeout: tapLimit });
      note('at 2:10 the notice still says the clock keeps running', (await words()) === said);
      const answerHeight = (await notice.locator('[data-mercy-back]').boundingBox())?.height ?? 0;
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
      const gotIt = (await notice.locator('[data-mercy-keep]').boundingBox())?.height ?? 0;
      note(
        '"Got it" is as tall as the notice’s other answers (60)',
        Math.round(gotIt) === 60 && Math.round(answerHeight) === 60,
        `${gotIt} and ${answerHeight}`,
      );
      note('in the last minutes the "Stop clock" sign is drawn', (await sign.count()) === 1);
      await c.play('away', 7, 'foul');
      await toggle('start');
      note('in the last minutes a foul stops the clock', !(await running()));
      const inside = await theSwitch();
      note(
        'in the last minutes the switch reads Off, can be used and says what a tap does',
        !inside.on &&
          inside.usable &&
          inside.help ===
            'These are the last minutes, so the clock stops on every foul. Turn it on to keep the clock going.',
        JSON.stringify(inside),
      );
      note('the notice is still there after the foul', (await words()) === saidLast);
      await notice.locator('[data-mercy-keep]').click();
      await notice.waitFor({ state: 'detached', timeout: tapLimit });

      // Overtime is a new period: the running clock, the notice with its way back (not
      // kept away by "Got it" inside the last minutes) and the switch come back.
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
      await fouled();
      note('in overtime a foul leaves the clock running', await running());

      // Overtime's own last minutes (S-124): the switch works there; On then Off leaves a
      // stop clock for the rest of the game, and the screen says so.
      await c.pauseClock();
      await c.setClock('205');
      await c.startClock();
      // The notice was answered "Got it" for this basket's last minutes: the sign says it.
      await sign.waitFor({ timeout: windowLimit });
      await modeIs('stop');
      await c.pauseClock();
      await flip();
      await modeIs('running');
      note(
        'in the last minutes the switch turns the running clock On',
        (await notice.count()) === 0,
      );
      await c.startClock();
      await c.play('away', 11, 'foul');
      await fouled();
      note('in the last minutes, switched On, a foul leaves the clock running', await running());
      // Switched Off with the clock running, as at a game; with it stopped, below.
      const boxes = async () =>
        JSON.stringify([
          await root.locator('[data-clock]').boundingBox(),
          await root.locator('[data-pad]').boundingBox(),
        ]);
      const before = await boxes();
      await flip();
      await modeIs('stop');
      await stopNotice.waitFor({ timeout: tapLimit });
      note('switched Off there, the screen says so', (await stopWords()) === saidStop);
      note('the sentence moves and resizes nothing', (await boxes()) === before);
      for (const size of sizes) {
        await page.setViewportSize({ width: size.width, height: size.height });
        const box = await stopNotice.boundingBox();
        note(
          `the sentence is in sight at ${size.name}`,
          (await stopNotice.isVisible()) &&
            box !== null &&
            box.x >= 0 &&
            box.y >= 0 &&
            box.x + box.width <= size.width &&
            box.y + box.height <= size.height,
          JSON.stringify(box),
        );
      }
      await page.setViewportSize({ width: 1180, height: 820 });
      await c.pauseClock();
      const seenHeight = (await stopSeen.boundingBox())?.height ?? 0;
      note('its "Got it" is 60 tall', Math.round(seenHeight) === 60, String(seenHeight));
      await stopSeen.click();
      await stopNotice.waitFor({ state: 'detached', timeout: tapLimit });
      await flip();
      await modeIs('running');
      await flip();
      await modeIs('stop');
      await stopNotice.waitFor({ timeout: tapLimit });
      note('On then Off again: the sentence comes back', (await stopWords()) === saidStop);

      // Switched Off with the clock STOPPED (the second fix round): the gold line said with
      // the tap is drawn with no box under a notice with one answer, so that answer is in
      // sight from the first moment, at every size, and nothing else moves; the line's
      // words are still in the page, for a screen reader.
      for (const size of sizes) {
        await page.setViewportSize({ width: size.width, height: size.height });
        await flip();
        await modeIs('running');
        const unmoved = await boxes();
        await flip();
        await modeIs('stop');
        await stopNotice.waitFor({ timeout: tapLimit });
        const answers = [];
        for (const answer of await stopNotice.locator('button').all()) {
          const box = await answer.boundingBox();
          answers.push(
            box !== null &&
              box.x >= 0 &&
              box.y >= 0 &&
              box.x + box.width <= size.width &&
              box.y + box.height <= size.height
              ? 'in'
              : JSON.stringify(box),
          );
        }
        const line = ((await root.locator('[data-say]').textContent()) ?? '').trim();
        note(
          `switched Off with the clock stopped, its answer is in sight at once at ${size.name}`,
          answers.length === 1 && answers.every((seen) => seen === 'in'),
          answers.join(' '),
        );
        note(
          `and the line said is in the page, nothing moved, at ${size.name}`,
          line !== '' && (await boxes()) === unmoved,
          line,
        );
      }
      await page.setViewportSize({ width: 1180, height: 820 });

      // After the last minutes the screen still says the truth; one tap puts it right.
      await c.pickPeriod(periods + 2);
      await page.keyboard.press('Escape');
      await modeIs('stop');
      note(
        'after the last minutes the sentence is still there, and no mercy notice',
        (await stopWords()) === saidStop && (await notice.count()) === 0,
      );
      const after = await theSwitch();
      note(
        'after the last minutes the switch reads Off and can be used',
        !after.on && after.usable,
      );
      await c.startClock();
      await c.play('away', 3, 'foul');
      await toggle('start');
      note('after the last minutes a foul stops the clock, as said', !(await running()));
      await flip();
      await modeIs('running');
      await stopNotice.waitFor({ state: 'detached', timeout: tapLimit });
      await c.startClock();
      await c.play('away', 5, 'foul');
      await fouled();
      note('one tap puts it right: a foul leaves the clock running', await running());
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
