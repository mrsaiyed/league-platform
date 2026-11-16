// Step 2.36 in a real browser: the clock, periods, team fouls and timeouts of the scoring
// screen, as steps of scoring-screen-test.mjs, which runs them last on the game its own
// steps have played (fifteen a side, in play). Everything is tapped where it is on the
// screen, as a finger taps it; nothing leaves this computer and everyone is made up.
//
// - Start and Pause differ in word and shape and are named for a screen reader; the clock
//   counts down; the large Start clock button is in the pad at rest, says why the clock is
//   stopped, and lies where no option of a picked player lies, so two fast taps on +2, on
//   Foul or on × never start the clock; × and Escape hide it until the clock next stops.
// - The clock's form has large keys, says what a time will do before it is set, is
//   closed by × and by Escape with nothing changed, and a clock set wrongly is put right
//   by setting it again. The period picker offers every period and three overtimes;
//   "Halftime." and "End of H2." are said when the clock runs out, Start is then greyed
//   as "Period over" and says why when tapped.
// - A device whose own clock is 30 seconds slow, and one 30 seconds fast, show the game
//   clock a correct device shows (finding M1): it counts from the server's time.
// - Team fouls grow at the bonus and the double bonus; the badge is in the box of the team
//   that shoots it; the bonus horn sounds one note, then two higher ones, with its
//   sentence; a game opened already in the bonus is silent; and a device whose sound
//   fails or is missing shows the badge and the sentence all the same, with no error.
// - Timeouts: left by length, the clock stopped and why, "none left", the question before
//   one too many with both answers, those taken, and the latest taken back.
// - At the five sizes, in each state the clock adds, nothing tapped is under 44 x 44 or
//   closer than 8 to the next, nothing scrolls, and each team's fouls and badge are whole
//   in its box of the scoreboard.
// - What is measured of fit (a team's name on the scoreboard at its fullest, a picked
//   player's second line, the hint in its place, nothing scrolling, the sizes of the
//   bonus) is measured in this device's own letters and again in wider ones: the screen
//   draws with the face a device already has, and GitHub's Ubuntu machines, like some
//   phones, draw letters a sixth wider than Windows does (`facesOf`, in the test).
import { court, drawIn, sizes, stopClockGame, trackerPath } from './tracker-driver.mjs';

const [phone, phoneLying, tabletUpright, , phoneInBrowser] = sizes;

/** "7:58" as seconds. */
const seconds = (clock) => {
  const [m, s] = clock.split(':').map(Number);
  return m * 60 + s;
};

/** Where a thing is on the screen, as numbers a test can compare. */
const rectOf = (locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
const overlap = (a, b) =>
  a.left < b.right - 0.5 &&
  b.left < a.right - 0.5 &&
  a.top < b.bottom - 0.5 &&
  b.top < a.bottom - 0.5;
/** Every button drawn inside `within`, with where it is; `close` marks the pad's own ×. */
const buttonsOf = (within) =>
  within.locator('button').evaluateAll((els) =>
    els
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          name: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30),
          close: el.matches('.court-close'),
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
        };
      }),
  );

/**
 * The steps of step 2.36. `kit` is what scoring-screen-test.mjs has for every step: its
 * notes, the browser at a size, opening and letting go of the game, and its measures.
 */
export async function clockSteps(kit) {
  const { step, note, origin, scorekeeperAt, openCourt, letGo } = kit;
  const { tapWhereItIs, measureTargets, watchScrolling, scrollsSeen, twoFrames } = kit;
  const { accessible, keyboardOn, restFits, facesOf } = kit;
  /**
   * Each size in each face the fit is measured in (this device's own, then a wider one):
   * a measure draws the screen in `family` first, and ends its name with `letters`.
   */
  const fits = async (page, among = sizes) =>
    (await facesOf(page)).flatMap((face) => among.map((size) => ({ size, ...face })));

  /** The floor player of a team in place `nth`, whoever that is by now. */
  const floor = (c, side, nth = 0) => c.root.locator(`[data-floor="${side}"] .court-tile`).nth(nth);
  /** A foul on a floor player (by place, or the tile itself), through the screen's own buttons. */
  const foul = async (c, side, which = 0) => {
    const tile = typeof which === 'number' ? floor(c, side, which) : which;
    const id = await tile.getAttribute('data-player');
    const options = c.pad.locator(`[data-options="${id}"]`);
    if (!(await options.isVisible())) await tile.click();
    await c.recorded(() => options.locator('[data-act="foul"]').click());
    await c.pad.locator('[data-rest]').waitFor();
  };
  /** Waits for the sentence the screen says next to hold `words`. */
  const said = (c, words) => c.said.filter({ hasText: words }).waitFor();
  /** The pad at rest for longer than the Start clock button waits after it comes to rest. */
  const atRest = async (page, c) => {
    await c.pad.locator('[data-rest]').waitFor();
    await page.waitForTimeout(450);
  };

  await step('the clock: Start and Pause, the Start clock button, the form, periods', async () => {
    // A foul or a timeout stops a running clock from here on (the league's own format is
    // a running clock): the engine's switch, sent while the game is free.
    await stopClockGame(origin);
    const { context, page, errors } = await scorekeeperAt(phoneInBrowser);
    try {
      await page.goto(`${origin}${trackerPath()}`);
      const c = await openCourt(page);
      await c.saved();
      // The first half, with time on the clock, whatever the steps before left.
      if ((await c.clock.locator('[data-period]').getAttribute('data-period')) !== '1') {
        await c.pickPeriod(1);
      }
      await c.setClock('1500');
      await watchScrolling(page);

      // --- Start, in a word and a shape; the large button in the pad says why (T2, T7, T9).
      note(
        'Start is named "Start the clock" for a screen reader and says "Start"',
        (await page.getByRole('button', { name: 'Start the clock', exact: true }).isVisible()) &&
          (await c.toggle.innerText()).trim() === 'Start' &&
          (await c.toggle.locator('.court-mark-start').count()) === 1,
      );
      await atRest(page, c);
      const bar = (await c.pad.locator('[data-start-bar]').innerText()).replace(/\s+/g, ' ');
      note(
        'the Start clock button is in the pad at rest, with the period, the time and why the clock is stopped',
        /Start clock H1 · 15:00/.test(bar) &&
          /The clock is stopped\. Scoring and substitutions still work\. × hides this button\./.test(
            bar,
          ),
        bar,
      );
      await measureTargets(page, '390 x 664, the clock stopped');
      await restFits(page, '390 x 664, the Start clock button offered', 2);
      await accessible(page, 'the clock stopped, the Start clock button offered');

      // It lies where no option of a picked player lies (the area 4 review of 2.35).
      const [startAt, hideAt] = [await rectOf(c.startButton), await rectOf(c.hideStart)];
      const tile = floor(c, 'home');
      const tileId = await tile.getAttribute('data-player');
      await tapWhereItIs(page, tile, 'a floor player');
      const options = c.pad.locator(`[data-options="${tileId}"]`);
      await options.waitFor();
      const buttons = await buttonsOf(options);
      const under = buttons.filter((b) => !b.close && overlap(b, startAt));
      const closeAt = buttons.find((b) => b.close);
      note(
        'the Start clock button lies where no option of a picked player lies: not +1, +2, +3, Foul or a substitute',
        buttons.length >= 9 && under.length === 0,
        under.map((b) => b.name).join(', '),
      );
      note(
        'its × is where the pad’s own × is, and nothing else of a player’s options is there',
        closeAt !== undefined &&
          overlap(closeAt, hideAt) &&
          buttons.filter((b) => !b.close && overlap(b, hideAt)).length === 0,
      );

      // Two fast taps on +2, on Foul and on ×: one play each, and the clock is not started.
      const twice = async (act) => {
        if (!(await options.isVisible())) await tapWhereItIs(page, tile, 'a floor player');
        await options.waitFor();
        const target = act === 'close' ? options.locator('.court-close') : c.option(act);
        const box = await target.boundingBox();
        const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
        const before = Number(await c.root.getAttribute('data-plays'));
        await page.mouse.click(x, y);
        await page.waitForTimeout(90);
        await page.mouse.click(x, y);
        await atRest(page, c);
        await c.saved();
        return Number(await c.root.getAttribute('data-plays')) - before;
      };
      const twoOnPoints = await twice('p2');
      const twoOnFoul = await twice('foul');
      const twoOnClose = await twice('close');
      note(
        'two fast taps on +2, on Foul and on × record one basket, one foul and nothing, and never start the clock',
        twoOnPoints === 1 &&
          twoOnFoul === 1 &&
          twoOnClose === 0 &&
          (await c.toggle.getAttribute('data-state')) === 'start' &&
          (await c.startButton.isVisible()),
        JSON.stringify({ twoOnPoints, twoOnFoul, twoOnClose }),
      );

      // --- Not yet ready, and seen to be (the area 4 review, M5). For a third of a second
      // after the pad comes to rest the button takes no tap; a real tap made then used to
      // do nothing and show nothing. It is now drawn hollow for exactly that long. Tapped
      // and looked at inside the page, in one go, so the third of a second is not spent
      // on the way to the browser and back.
      if (!(await options.isVisible())) await tapWhereItIs(page, tile, 'a floor player');
      await options.waitFor();
      const rested = await page.evaluate(async () => {
        const pad = document.querySelector('[data-pad]');
        /** A tap as a finger makes it (a click with a pointer behind it), where the thing is. */
        const tap = (el) =>
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
        const look = () => {
          const bar = pad.querySelector('[data-start-bar]');
          if (bar === null) return null;
          return {
            resting: bar.hasAttribute('data-resting'),
            ground: getComputedStyle(bar.querySelector('[data-start-clock]')).backgroundColor,
            cross: getComputedStyle(bar.querySelector('[data-hide-start]')).opacity,
          };
        };
        tap(pad.querySelector('[data-options] .court-close'));
        // The pad is drawn at rest in the next frame or two: looked at the moment it is.
        const waited = performance.now();
        while (look() === null && performance.now() - waited < 1000) {
          await new Promise((next) => requestAnimationFrame(next));
        }
        const began = performance.now();
        const early = look();
        // The tap that used to be swallowed with no sign: made while the button rests.
        const button = pad.querySelector('[data-start-clock]');
        if (button !== null) tap(button);
        const tappedAfter = performance.now() - began;
        await new Promise((done) => setTimeout(done, 650));
        return {
          early,
          tappedAfter,
          late: look(),
          clock: document.querySelector('[data-clock-toggle]').dataset.state,
        };
      });
      const hollow = (ground) => /rgba\(0, 0, 0, 0\)|transparent/.test(ground ?? '');
      note(
        'for a third of a second after the pad comes to rest the Start clock button is drawn not yet ready: hollow, its × faint',
        rested.early !== null &&
          rested.early.resting &&
          hollow(rested.early.ground) &&
          Number(rested.early.cross) < 0.6,
        JSON.stringify(rested.early),
      );
      note(
        'a tap made then does not start the clock, and the button is seen not to have taken it',
        rested.tappedAfter < 300 && rested.clock === 'start' && rested.early?.resting === true,
        `tapped ${rested.tappedAfter.toFixed(0)} ms after the pad came to rest; the clock: ${rested.clock}`,
      );
      note(
        'once it has rested it is drawn ready: filled, its × whole',
        rested.late !== null &&
          !rested.late.resting &&
          !hollow(rested.late.ground) &&
          Number(rested.late.cross) === 1,
        JSON.stringify(rested.late),
      );

      // --- The large button starts the clock; Pause is a different word and shape (T2, T3).
      await tapWhereItIs(page, c.startButton, 'the Start clock button');
      await c.root.locator('[data-clock-toggle][data-state="pause"]').waitFor();
      note(
        'Pause is named "Pause the clock", says "Pause" and is drawn as two bars',
        (await page.getByRole('button', { name: 'Pause the clock', exact: true }).isVisible()) &&
          (await c.toggle.innerText()).trim() === 'Pause' &&
          (await c.toggle.locator('.court-mark-pause').count()) === 1 &&
          (await c.toggle.locator('.court-mark-start').count()) === 0,
      );
      note(
        'while the clock runs the Start clock button is not offered',
        !(await c.startButton.isVisible()),
      );
      const first = seconds(await c.clockText());
      await page.waitForTimeout(2300);
      const later = seconds(await c.clockText());
      note(
        'the clock counts down by itself',
        first - later >= 1 && first - later <= 4,
        `${first} to ${later} in 2.3 seconds`,
      );
      await measureTargets(page, '390 x 664, the clock running');
      await restFits(page, '390 x 664, the clock running', 4);
      // The clock's form opened while the clock runs shows the clock as it reads now,
      // ticking, until a time is typed: it used to stand at the moment the form opened.
      await c.clock.click();
      await c.clockSheet.waitFor();
      const shownInForm = c.clockSheet.locator('[data-clock-entry]');
      const formFirst = seconds((await shownInForm.innerText()).trim());
      await page.waitForTimeout(2300);
      const formLater = seconds((await shownInForm.innerText()).trim());
      note(
        'the clock’s form, opened while the clock runs, shows the time ticking, the same as the scoreboard’s',
        formFirst - formLater >= 1 &&
          formFirst - formLater <= 4 &&
          Math.abs(formLater - seconds(await c.clockText())) <= 1 &&
          (await shownInForm.getAttribute('aria-live')) === 'off',
        `${formFirst} to ${formLater} in 2.3 seconds; the scoreboard: ${await c.clockText()}`,
      );
      await page.keyboard.press('Escape');
      await c.root.locator('[data-clock-sheet]').waitFor({ state: 'detached' });
      note(
        'closing the form leaves the clock running',
        (await c.toggle.getAttribute('data-state')) === 'pause',
      );
      await tapWhereItIs(page, c.toggle, 'Pause');
      await c.root.locator('[data-clock-toggle][data-state="start"]').waitFor();
      const paused = await c.clockText();
      await page.waitForTimeout(1300);
      note('paused, the clock stands still', (await c.clockText()) === paused);

      // --- × and Escape hide the large button until the clock next stops (T10).
      await atRest(page, c);
      await tapWhereItIs(page, c.hideStart, 'the × of the Start clock button');
      await c.startButton.waitFor({ state: 'detached' });
      note(
        '× hides the Start clock button; Start under the scoreboard is still there',
        (await c.toggle.getAttribute('data-state')) === 'start' && (await c.toggle.isVisible()),
      );
      await c.startClock();
      await c.pauseClock();
      await c.startButton.waitFor();
      note('once the clock stops again the Start clock button is back', true);
      await page.keyboard.press('Escape');
      await c.startButton.waitFor({ state: 'detached' });
      note('Escape hides it too, and the keyboard is then on Start', await keyboardOn(c.toggle));
      await c.startClock();
      await c.pauseClock();
      await c.startButton.waitFor();

      // --- The clock's form: large keys, × and Escape, and setting it again (T5, M2).
      await tapWhereItIs(page, c.clock, 'the clock');
      await c.clockSheet.waitFor();
      note(
        'the clock opens a form named "Clock and period", and the keyboard is in it',
        (await page.getByRole('dialog', { name: 'Clock and period' }).isVisible()) &&
          (await c.clockSheet.evaluate((el) => el.contains(document.activeElement))),
      );
      await measureTargets(page, '390 x 664, the clock’s form');
      await accessible(page, 'the clock’s form');
      const keys = await c.clockSheet
        .locator('[data-key]')
        .evaluateAll((els) =>
          els.map((el) =>
            Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height),
          ),
        );
      note(
        'the form has twelve keys, each 48 or more on its short side',
        keys.length === 12 && keys.every((size) => size >= 47.99),
        keys.map((size) => size.toFixed(0)).join(' '),
      );
      note(
        'the whole form is on the screen and nothing in it scrolls',
        await c.clockSheet.evaluate(
          (el) =>
            el.scrollHeight <= el.clientHeight &&
            el.getBoundingClientRect().bottom <= window.innerHeight &&
            el.querySelector('[data-set-clock]').getBoundingClientRect().bottom <=
              window.innerHeight,
        ),
      );
      const before = await c.clockText();
      for (const key of ['6', '3', '0']) {
        await tapWhereItIs(page, c.clockSheet.locator(`[data-key="${key}"]`), `the ${key} key`);
      }
      note(
        'the keys fill the time from the right and the button names what it will do',
        (await c.clockSheet.locator('[data-clock-entry]').innerText()).trim() === '6:30' &&
          (await c.clockSheet.locator('[data-set-clock]').innerText()).trim() ===
            'Set clock to 6:30',
      );
      await page.keyboard.press('Escape');
      await c.root.locator('[data-clock-sheet]').waitFor({ state: 'detached' });
      note(
        'Escape closes the form with nothing changed, and the keyboard is back on the clock',
        (await c.clockText()) === before && (await keyboardOn(c.clock)),
      );
      await c.typeClock('75');
      note(
        'a time the clock does not take is explained and cannot be set',
        /Seconds go up to 59\./.test(await c.clockSheet.locator('[data-clock-note]').innerText()) &&
          (await c.clockSheet.locator('[data-set-clock]').isDisabled()),
      );
      // Longer than the half is long (the area 4 review, L5): refused in words, not set.
      await c.clockSheet.locator('[data-key="clear"]').click();
      await c.typeClock('2500');
      note(
        'a time longer than the period is refused in words before Set is offered',
        (await c.clockSheet.locator('[data-clock-note]').innerText()).trim() ===
          'H1 is 20:00 long: type 20:00 or less.' &&
          (await c.clockSheet.locator('[data-set-clock]').isDisabled()) &&
          (await c.clockSheet.locator('[data-set-clock]').innerText()).trim() === 'Set clock',
        await c.clockSheet.locator('[data-clock-note]').innerText(),
      );
      await tapWhereItIs(page, c.clockSheet.locator('.court-close'), 'the × of the clock’s form');
      await c.root.locator('[data-clock-sheet]').waitFor({ state: 'detached' });
      note('× closes the form with nothing changed', (await c.clockText()) === before);
      // Typed on a keyboard, where there is one.
      await c.clock.click();
      await c.clockSheet.waitFor();
      await page.keyboard.type('1800');
      await page.keyboard.press('Backspace');
      await page.keyboard.type('0');
      // What the form says comes off the minutes is the engine's own figure (the code
      // review, M-b): never more than this half has run, and, when it is all of that,
      // said so. The sentence after the tap then says the same figure.
      const warning = (await c.clockSheet.locator('[data-clock-note]').innerText()).trim();
      const warned =
        /^This takes (\d+:\d\d) off (?:the minutes of the players on the court|the players’ minutes: all they have played this period)\.$/.exec(
          warning,
        );
      note(
        'time put back on the clock is said before it is set: what comes off the players’ minutes',
        warned !== null,
        warning,
      );
      await tapWhereItIs(page, c.clockSheet.locator('[data-set-clock]'), 'Set clock');
      await c.root.locator('[data-clock-sheet]').waitFor({ state: 'detached' });
      await said(c, /^Clock set to 18:00\. \d+:\d\d came off the minutes/);
      const after = /^Clock set to 18:00\. (\d+:\d\d) came off/.exec(
        (await c.said.innerText()).trim(),
      );
      note(
        'the clock is set, stopped, and the screen says what came off the minutes: the figure the form said',
        (await c.clockText()) === '18:00' &&
          (await c.toggle.getAttribute('data-state')) === 'start' &&
          after !== null &&
          after[1] === warned?.[1],
        `${warned?.[1]} said before, ${after?.[1]} after`,
      );
      // Set wrongly: put right by setting it again (finding M2).
      await c.setClock('1200');
      const wrong = await c.clockText();
      await c.setClock('1630');
      note(
        'a clock set wrongly is put right by setting it again',
        wrong === '12:00' && (await c.clockText()) === '16:30',
        `${wrong}, then ${await c.clockText()}`,
      );

      // --- The end of a period: "Halftime.", Start greyed, the way to the next (T2, T4, T6).
      await c.setClock('2');
      await c.startClock();
      await c.root.locator('[data-clock-toggle][data-state="over"]').waitFor();
      await said(c, /^Halftime\.$/);
      // "Halftime." under the gold button is plainly a statement, not a second gold
      // button (the area 4 review, L1): not gold, and marked with a line at its start.
      const strip = await page.evaluate(() => {
        const say = getComputedStyle(document.querySelector('[data-say]'));
        const button = getComputedStyle(document.querySelector('[data-pick-period]'));
        return {
          say: say.backgroundColor,
          button: button.backgroundColor,
          line: say.borderInlineStartWidth,
        };
      });
      note(
        'at 0:00 the sentence under the gold "Pick the next period" is drawn as a statement, not as a second gold bar',
        strip.say !== strip.button && strip.line === '4px',
        JSON.stringify(strip),
      );
      const overToggle = c.toggle;
      note(
        'at 0:00 the clock is marked, and Start is greyed as "Period over", named with the reason',
        (await c.clockText()) === '0:00' &&
          (await c.clock.getAttribute('data-zero')) !== null &&
          (await overToggle.innerText()).trim() === 'Period over' &&
          (await overToggle.getAttribute('aria-disabled')) === 'true' &&
          (await page
            .getByRole('button', { name: 'Period over: pick the next period', exact: true })
            .isVisible()),
      );
      await page.waitForTimeout(3400);
      await tapWhereItIs(page, overToggle, 'the greyed Start');
      await said(c, /^This period is over\. Pick the next period first\.$/);
      note('tapped, the greyed Start says what to do, in a sentence', true);
      await measureTargets(page, '390 x 664, the period over');
      await restFits(page, '390 x 664, the period over', 2);
      await accessible(page, 'the period over');
      await tapWhereItIs(page, c.pickPeriodButton, 'Pick the next period');
      await c.clockSheet.waitFor();
      const periods = await c.clockSheet.locator('[data-period-pick]').evaluateAll((els) =>
        els.map((el) => ({
          name: el.querySelector('.court-opt-word').textContent,
          now: el.getAttribute('aria-pressed') === 'true' && el.disabled,
          next: el.getAttribute('data-next'),
        })),
      );
      note(
        'the picker offers both halves and three overtimes, the one played marked and the next one due',
        periods.map((p) => p.name).join(' ') === 'H1 H2 OT1 OT2 OT3' &&
          periods[0].now &&
          periods[1].next === 'due' &&
          periods.slice(2).every((p) => !p.now && p.next === null),
        JSON.stringify(periods),
      );
      await c.recorded(() =>
        tapWhereItIs(page, c.clockSheet.locator('[data-period-pick="2"]'), 'H2'),
      );
      await said(c, /^Start of H2\. Clock set to 20:00\.$/);
      await c.startButton.waitFor();
      note(
        'picking a period sets the clock to its length, stopped, and the Start clock button says "Start of H2."',
        (await c.clockText()) === '20:00' &&
          (await c.clock.locator('[data-period]').innerText()).trim() === 'H2' &&
          (await c.stopReason.innerText()).trim() === 'Start of H2.' &&
          (await c.toggle.getAttribute('data-state')) === 'start',
      );
      note(
        'team fouls start again with the new period (F5)',
        (await c.teamFouls('home').innerText()).trim() === '0 fouls' &&
          (await c.teamFouls('away').innerText()).trim() === '0 fouls',
      );

      // --- A foul on a running clock stops it, and says so (D8, T9).
      await c.startClock();
      // A player not yet at the foul limit: one who is has a sentence of their own.
      const notOut = c.root.locator('[data-floor="home"] .court-tile:not([data-out])').first();
      // That player's own tile from here on, whatever the foul makes of them.
      const fouled = c.root.locator(
        `[data-teams] [data-player="${await notOut.getAttribute('data-player')}"]`,
      );
      const fouledName = (await fouled.getAttribute('aria-label')).split(',')[0];
      await foul(c, 'home', fouled);
      await c.root.locator('[data-clock-toggle][data-state="start"]').waitFor();
      await said(c, `Foul on ${fouledName}. Clock stopped.`);
      await c.startButton.waitFor();
      note(
        'a foul on a running clock stops it; the Start clock button says who it was for',
        (await c.stopReason.innerText()).trim() === `Stopped for a foul on ${fouledName}.`,
        await c.stopReason.innerText(),
      );
      // A free throw on the stopped clock: scored as always, and the reason stays (T8).
      await c.play('away', await floor(c, 'away').locator('.court-tile-number').innerText(), 'p1');
      await atRest(page, c);
      note(
        'a free throw is scored on the stopped clock, and the button still says why it stopped',
        (await c.stopReason.innerText()).trim() === `Stopped for a foul on ${fouledName}.` &&
          (await c.toggle.getAttribute('data-state')) === 'start',
      );
      // That foul taken back: the button no longer names it (the area 4 review, L4).
      await fouled.click();
      await c.recorded(() => c.option('unfoul').click());
      await atRest(page, c);
      note(
        'once the foul that stopped the clock is taken back, the button says only that the clock is stopped',
        (await c.stopReason.innerText()).trim() === 'The clock is stopped.' &&
          (await c.toggle.getAttribute('data-state')) === 'start',
        await c.stopReason.innerText(),
      );
      // Given again on the stopped clock: it did not stop the clock, and is not named.
      await foul(c, 'home', fouled);
      await atRest(page, c);
      note(
        'a foul given on a clock that is already stopped is not named as what stopped it',
        (await c.stopReason.innerText()).trim() === 'The clock is stopped.',
        await c.stopReason.innerText(),
      );

      // --- "End of H2." at the end of the last period; overtime in the picker (T4, T6).
      await c.setClock('2');
      await c.startClock();
      await c.root.locator('[data-clock-toggle][data-state="over"]').waitFor();
      await said(c, /^End of H2\.$/);
      await c.pickPeriod(3);
      note(
        'overtime is picked from the same form: OT1, at its own length',
        (await c.clock.locator('[data-period]').innerText()).trim() === 'OT1' &&
          (await c.clockText()) === '5:00',
      );
      note(
        'overtime carries on the last period’s team fouls (F5)',
        (await c.teamFouls('home').innerText()).trim() === '1 foul',
        await c.teamFouls('home').innerText(),
      );

      const scrolled = await scrollsSeen(page);
      note(
        'nothing scrolled through all of it: Start, Pause, the form, the periods',
        scrolled.events === 0 && scrolled.moved.length === 0,
        JSON.stringify(scrolled),
      );
      await c.saved();
      note('nothing broke on the page', errors.length === 0, errors.join('; '));
    } finally {
      await letGo(page, context);
    }
  });

  // Start and Pause under a double tap (the code review, M-a). The button changes from
  // Start to Pause as soon as the device has kept the tap, so the second tap of a double
  // tap used to land on Pause and stop the clock again. It now rests after a tap on it
  // and after its word changes: two taps 150 ms apart are one.
  for (const size of [phoneInBrowser, phoneLying]) {
    const at = `${size.width} x ${size.height}`;
    await step(`Start and Pause under a double tap, at ${at} (M-a)`, async () => {
      const { context, page, errors } = await scorekeeperAt(size);
      try {
        await page.goto(`${origin}${trackerPath()}`);
        const c = await openCourt(page);
        await c.saved();
        // Stopped, with time on the clock, whatever the step before left.
        await c.setClock('300');
        await page.waitForTimeout(3400);
        const ready = (state) =>
          c.root.locator(`[data-clock-toggle][data-state="${state}"]:not([data-resting])`);
        /** Two taps where the button is, 150 ms apart, as a double tap lands. */
        const twice = async () => {
          const box = await c.toggle.boundingBox();
          const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
          await page.mouse.click(x, y);
          await page.waitForTimeout(150);
          await page.mouse.click(x, y);
          const drawnResting = (await c.toggle.getAttribute('data-resting')) !== null;
          await page.waitForTimeout(700);
          await c.saved();
          return drawnResting;
        };

        await ready('start').waitFor();
        const restingAfterStart = await twice();
        const running = await c.toggle.getAttribute('data-state');
        const first = seconds(await c.clockText());
        await page.waitForTimeout(1300);
        const later = seconds(await c.clockText());
        note(
          `${at}: two taps on Start 150 ms apart: the clock is running, once, and nothing was refused`,
          running === 'pause' &&
            later < first &&
            restingAfterStart &&
            (await c.said.innerText()).trim() === '',
          JSON.stringify({ running, first, later, said: await c.said.innerText() }),
        );
        note(
          `${at}: once it has rested the button is drawn ready again`,
          (await ready('pause').count()) === 1,
        );

        const restingAfterPause = await twice();
        const paused = await c.toggle.getAttribute('data-state');
        const stoodAt = await c.clockText();
        await page.waitForTimeout(1300);
        note(
          `${at}: two taps on Pause 150 ms apart: the clock is paused, once, and nothing was refused`,
          paused === 'start' &&
            (await c.clockText()) === stoodAt &&
            restingAfterPause &&
            (await c.said.innerText()).trim() === '',
          JSON.stringify({ paused, stoodAt, now: await c.clockText() }),
        );
        note('nothing broke on the page', errors.length === 0, errors.join('; '));
      } finally {
        await letGo(page, context);
      }
    });
  }

  // A device whose own clock is wrong (finding M1): its `Date` and the time its steady
  // clock starts from are both moved, as on a tablet that was set wrongly. The game
  // clock it shows is the one a correct device shows, because it counts from the
  // server's time. Painted from the device's own time, a slow one would stand still for
  // the first 30 seconds, and a fast one would drop 30 seconds at the tap.
  for (const [what, wrong] of [
    ['30 seconds slow', -30_000],
    ['30 seconds fast', 30_000],
  ]) {
    await step(`a device whose clock is ${what} shows the same game clock (M1)`, async () => {
      const { context, page, errors } = await scorekeeperAt(phone);
      try {
        await context.addInitScript((off) => {
          const RealDate = Date;
          const started = performance.timeOrigin + off;
          Object.defineProperty(performance, 'timeOrigin', { get: () => started });
          class DeviceDate extends RealDate {
            constructor(...given) {
              if (given.length === 0) super(RealDate.now() + off);
              else super(...given);
            }
            static now() {
              return RealDate.now() + off;
            }
          }
          window.Date = DeviceDate;
        }, wrong);
        await page.goto(`${origin}${trackerPath()}`);
        const c = await openCourt(page);
        const device = await page.evaluate(() => Date.now());
        note(
          `the device’s own clock is ${what}`,
          Math.abs(device - Date.now() - wrong) < 3_000,
          String(device - Date.now()),
        );
        await c.setClock('400');
        const tapped = Date.now();
        await c.startClock();
        await page.waitForTimeout(3200);
        const shown = seconds(await c.clockText());
        const ran = (Date.now() - tapped) / 1000;
        // What a correct device shows: four minutes less the time that really passed,
        // give or take the second the tap took to be taken and the rounding of the clock.
        note(
          `${what}: after ${ran.toFixed(1)} seconds the clock shows ${shown} seconds left, as a correct device does`,
          Math.abs(240 - ran - shown) <= 1.6,
          `${shown} shown, ${(240 - ran).toFixed(1)} on a correct device`,
        );
        await c.pauseClock();
        const stopped = seconds(await c.clockText());
        note(
          `${what}: paused, it stops on the time it showed`,
          shown - stopped >= 0 && shown - stopped <= 2,
          `${shown}, then ${stopped}`,
        );
        await c.saved();
        note('nothing broke on the page', errors.length === 0, errors.join('; '));
      } finally {
        await letGo(page, context);
      }
    });
  }

  await step('team fouls, the bonus badge and the bonus horn with its sentence', async () => {
    // The notes the horn is asked to play are counted by the page itself.
    const hears = (context) =>
      context.addInitScript(() => {
        window.hornNotes = [];
        const Audio = window.AudioContext;
        if (Audio === undefined) return;
        const create = Audio.prototype.createOscillator;
        Audio.prototype.createOscillator = function counted(...given) {
          const oscillator = create.apply(this, given);
          const set = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
          oscillator.frequency.setValueAtTime = (value, at) => {
            window.hornNotes.push(value);
            return set(value, at);
          };
          return oscillator;
        };
      });
    const notes = (page) => page.evaluate(() => window.hornNotes);
    const level = (locator) => locator.getAttribute('data-level');
    /**
     * Each team's box as a glance takes it in: the sizes of its count, its badge and its
     * score; the words its badge shows (where a device's letters are too wide for
     * "Double bonus" beside the count it says "Double", at the same size) and what the
     * line would need to show both; whether the count and the badge are whole in the
     * box; and whether the screen had to set them a step smaller (`tight`: only for a
     * face wider than any measured here).
     */
    const glance = (page) =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-score]')].map((box) => {
          const px = (part) =>
            part === null ? null : Number.parseFloat(getComputedStyle(part).fontSize);
          const edge = box.getBoundingClientRect();
          const inBox = (part) => {
            const r = part.getBoundingClientRect();
            return (
              r.width > 0 &&
              r.left >= edge.left - 0.5 &&
              r.right <= edge.right + 0.5 &&
              r.top >= edge.top - 0.5 &&
              r.bottom <= edge.bottom + 0.5
            );
          };
          const line = box.querySelector('.court-score-fouls');
          const count = box.querySelector('[data-team-fouls]');
          const badge = box.querySelector('[data-bonus]');
          const seen = { level: null, px: null, shows: null, needsForAll: null };
          if (badge !== null) {
            const words = badge.querySelector('.court-bonus-words');
            const place = words.getBoundingClientRect();
            const node = words.firstChild;
            const onItsLine = [];
            let at = 0;
            for (const word of node.textContent.split(' ')) {
              const range = document.createRange();
              range.setStart(node, at);
              range.setEnd(node, at + word.length);
              const r = range.getBoundingClientRect();
              const middle = (r.top + r.bottom) / 2;
              if (middle > place.top && middle < place.bottom) onItsLine.push(word);
              at += word.length + 1;
            }
            // How wide all its words are on one line, measured on a copy beside them.
            const copy = words.cloneNode(true);
            copy.style.cssText =
              'position: absolute; visibility: hidden; white-space: nowrap; inline-size: max-content;';
            badge.append(copy);
            const all = copy.getBoundingClientRect().width;
            copy.remove();
            seen.level = badge.getAttribute('data-level');
            seen.px = px(badge);
            seen.shows = onItsLine.join(' ');
            seen.needsForAll =
              count.getBoundingClientRect().width +
              Number.parseFloat(getComputedStyle(line).columnGap) +
              (badge.getBoundingClientRect().width - place.width) +
              all;
          }
          return {
            side: box.getAttribute('data-score'),
            level: count.getAttribute('data-level'),
            count: px(count),
            badge: seen.px,
            badgeLevel: seen.level,
            shows: seen.shows,
            needsForAll: seen.needsForAll,
            has: line.clientWidth,
            score: px(box.querySelector('.court-score-value')),
            whole: inBox(count) && (badge === null || inBox(badge)),
            tight: line.hasAttribute('data-tight'),
            heard: box.getAttribute('aria-label'),
          };
        }),
      );
    /** The steps the fix round gave the count and the badge, at a size (court.css). */
    const steps = (size) =>
      size.width >= 700 && size.height >= 521
        ? { count: [14, 20, 26], badge: [15, 19] }
        : { count: [11, 13, 15], badge: [11, 12] };
    const { context, page, errors } = await scorekeeperAt(phoneLying);
    try {
      await hears(context);
      await page.goto(`${origin}${trackerPath()}`);
      const c = await openCourt(page);
      await c.saved();
      // The second half: the home team has the one foul the step before gave it there,
      // the visitors none. (A period's fouls are its own: going back to it finds them.)
      // Going back to the first half finds its bonus again. Nobody reached anything, so
      // the horn stays silent: the badge shows, and what is said is the sentence about
      // the period (the lead's answer on the area 4 review; the code review, L-2).
      await c.pickPeriod(1);
      await said(c, /^Start of H1\. Clock set to 20:00\.$/);
      const backInFirst = {
        badges: (await c.bonus('home').count()) + (await c.bonus('away').count()),
        notes: (await notes(page)).length,
      };
      note(
        'going back to a period that is already in the bonus: the badge shows, the horn is silent, and the period’s own sentence is said',
        backInFirst.badges >= 1 && backInFirst.notes === 0,
        JSON.stringify(backInFirst),
      );
      await c.pickPeriod(2);
      await page.waitForTimeout(3400);
      await page.evaluate(() => (window.hornNotes.length = 0));
      note(
        'each team’s fouls are in its box of the scoreboard, there from the first: "0 fouls"',
        (await c.teamFouls('home').innerText()).trim() === '1 foul' &&
          (await c.teamFouls('away').innerText()).trim() === '0 fouls' &&
          (await level(c.teamFouls('away'))) === '0' &&
          (await c.bonus('home').count()) === 0 &&
          (await c.bonus('away').count()) === 0,
        `${await c.teamFouls('home').innerText()} / ${await c.teamFouls('away').innerText()}`,
      );
      // Up to six by the home team: counted, no bonus yet (the bonus is on the seventh).
      for (let i = 1; i < 6; i += 1) await foul(c, 'home', i % 5);
      note(
        'six team fouls: counted, not yet the bonus, and no horn',
        (await c.teamFouls('home').innerText()).trim() === '6 fouls' &&
          (await level(c.teamFouls('home'))) === '0' &&
          (await c.bonus('away').count()) === 0 &&
          (await notes(page)).length === 0,
        JSON.stringify(await notes(page)),
      );
      await page.waitForTimeout(3400);
      await foul(c, 'home', 1);
      await c.bonus('away').waitFor();
      await said(c, /^Bonus: Bears\.$/);
      note(
        'the seventh: the count grows, the OTHER team’s box gets "Bonus", the horn plays one note and the screen says it',
        (await level(c.teamFouls('home'))) === '1' &&
          (await c.bonus('away').textContent()) === 'Bonus' &&
          (await level(c.bonus('away'))) === '1' &&
          (await c.bonus('home').count()) === 0 &&
          JSON.stringify(await notes(page)) === '[523]',
        JSON.stringify(await notes(page)),
      );
      // The bonus at a glance (the area 4 review, M3), at every size, in this device's
      // own letters and in wider ones: the count that reached the bonus and the badge
      // it gave are at the step the fix round set, whole in their boxes, and the screen
      // has not set them a step smaller for want of room.
      for (const { size, letters, family } of await fits(page)) {
        await drawIn(page, family);
        await page.setViewportSize({ width: size.width, height: size.height });
        await twoFrames(page);
        const [home, away] = await glance(page);
        const least = steps(size);
        console.log(
          `  ${size.width} x ${size.height}${letters}: at the bonus the count is ${home?.count} px (${away?.count} px at rest), the badge ${away?.badge} px and says “${away?.shows}”`,
        );
        note(
          `${size.width} x ${size.height}${letters}: at the bonus the count and the badge are at their steps, whole, and not set smaller`,
          home !== undefined &&
            away !== undefined &&
            home.level === '1' &&
            home.count >= least.count[1] &&
            away.level === '0' &&
            away.count >= least.count[0] &&
            away.badgeLevel === '1' &&
            away.badge >= least.badge[0] &&
            away.shows === 'Bonus' &&
            home.whole &&
            away.whole &&
            !home.tight &&
            !away.tight &&
            home.score > home.count,
          JSON.stringify({ home, away }),
        );
      }
      await drawIn(page, '');
      await page.setViewportSize({ width: phoneLying.width, height: phoneLying.height });
      await twoFrames(page);
      await foul(c, 'home', 2);
      await foul(c, 'home', 3);
      await page.waitForTimeout(3400);
      await foul(c, 'home', 4);
      await said(c, /^Double bonus: Bears\.$/);
      note(
        'the tenth: the count grows again, the badge says "Double bonus", the horn plays two higher notes',
        (await level(c.teamFouls('home'))) === '2' &&
          (await c.bonus('away').textContent()) === 'Double bonus' &&
          (await level(c.bonus('away'))) === '2' &&
          JSON.stringify(await notes(page)) === '[523,740,740]',
        JSON.stringify(await notes(page)),
      );
      // A foul taken back drops it again, in silence.
      await floor(c, 'home', 4).click();
      await c.recorded(() => c.option('unfoul').click());
      await c.root.locator('[data-bonus="away"][data-level="1"]').waitFor();
      note(
        'a foul taken back drops the badge to "Bonus" with no horn',
        (await c.teamFouls('home').innerText()).trim() === '9 fouls' &&
          (await notes(page)).length === 3,
      );
      await c.pad.locator('[data-rest]').waitFor();
      await foul(c, 'home', 4);
      // The visitors to ten as well: both boxes at their fullest.
      for (let i = 0; i < 10; i += 1) await foul(c, 'away', i % 5);
      await c.root.locator('[data-bonus="home"][data-level="2"]').waitFor();
      await c.saved();
      for (const { size, letters, family } of await fits(page)) {
        await drawIn(page, family);
        await page.setViewportSize({ width: size.width, height: size.height });
        await twoFrames(page);
        const boxes = await page.evaluate(() =>
          [...document.querySelectorAll('[data-score]')].map((box) => {
            const edge = box.getBoundingClientRect();
            const line = box.querySelector('.court-score-fouls');
            const shown = [
              ...line.querySelectorAll('.court-fouls-words, .court-fouls-short, .court-bonus'),
            ]
              .filter((el) => el.getClientRects().length > 0)
              .map((el) => {
                const r = el.getBoundingClientRect();
                return {
                  says: el.textContent,
                  whole:
                    r.left >= edge.left - 0.5 &&
                    r.right <= edge.right + 0.5 &&
                    r.top >= edge.top - 0.5 &&
                    r.bottom <= edge.bottom + 0.5,
                };
              });
            return { fits: line.scrollWidth <= line.clientWidth + 1, shown };
          }),
        );
        // The badge's words are in the page whole ("Double bonus"), and the box's own
        // name gives a screen reader both. What the badge SHOWS is both words, or, on a
        // device whose letters are too wide for both beside the count, the first: "Double",
        // at the same size, and only where the line truly has no room for both.
        const drawn = await glance(page);
        note(
          `${size.width} x ${size.height}${letters}: both teams in the double bonus: each box holds its count and its badge whole, the badge showing "Double bonus" where both words fit and "Double" only where they cannot`,
          boxes.length === 2 &&
            boxes.every(
              (box) =>
                box.fits &&
                box.shown.length === 2 &&
                box.shown.every((part) => part.whole) &&
                /^10( fouls|F)$/.test(box.shown[0].says) &&
                box.shown[1].says === 'Double bonus',
            ) &&
            drawn.length === 2 &&
            drawn.every(
              (box) =>
                box.whole &&
                /, shooting the Double bonus$/.test(box.heard) &&
                (box.shows === 'Double bonus' ||
                  (box.shows === 'Double' && box.needsForAll > box.has - 0.5)),
            ),
          JSON.stringify({ boxes, drawn }),
        );
        // The bonus at a glance (the area 4 review, M3): at the double bonus the count is
        // 15 px or more and the badge 12 or more on a phone, 26 and 19 on a tablet, in
        // this device's own letters and in wider ones: the screen never sets them a step
        // smaller for want of room (it shortens the badge's words, above). And the count
        // is never larger than the score beside it.
        const least = steps(size);
        console.log(
          `  ${size.width} x ${size.height}${letters}: at the double bonus the count is ${drawn[0]?.count} px, the badge ${drawn[0]?.badge} px and says “${drawn[0]?.shows}”, the score ${drawn[0]?.score} px${drawn.some((box) => box.tight) ? ' (letters wider than the box: a step smaller)' : ''}`,
        );
        note(
          `${size.width} x ${size.height}${letters}: at the double bonus the count and the badge are at their largest, and the score is larger still`,
          drawn.length === 2 &&
            drawn.every(
              (box) =>
                box.score > box.count &&
                !box.tight &&
                box.level === '2' &&
                box.count >= least.count[2] &&
                box.badgeLevel === '2' &&
                box.badge >= least.badge[1],
            ),
          JSON.stringify(drawn),
        );
      }
      await drawIn(page, '');
      // A team's name is never cut on the scoreboard at its fullest, lying down (the
      // pictures after the fix round: "HAWKS" read "HA W…"). Both teams in the double
      // bonus, three-figure scores made with no connection, so the banner is waiting,
      // and then the longest the banner can say. The name sat beside the fouls and was
      // left 3 wide; it is over them now, and only a truly long one ends in "…".
      await page.setViewportSize({ width: phoneLying.width, height: phoneLying.height });
      await context.setOffline(true);
      await page.evaluate(async () => {
        const drawn = () => new Promise((resolve) => setTimeout(resolve, 0));
        for (const side of ['home', 'away']) {
          for (let i = 0; i < 34; i += 1) {
            document.querySelector(`[data-floor="${side}"] .court-tile`).click();
            while (document.querySelector('[data-pad] [data-act="p3"]') === null) await drawn();
            document.querySelector('[data-pad] [data-act="p3"]').click();
            while (document.querySelector('[data-pad] [data-rest]') === null) await drawn();
          }
        }
      });
      await c.root.locator('[data-saved-banner][data-state="waiting"]').waitFor();
      const fullest = await c.score();
      /**
       * Each name on the scoreboard, as wide as it is drawn, and whether its text is cut:
       * lying down a name is one line, upright it takes two before it is cut.
       */
      const names = () =>
        page.evaluate(() =>
          [...document.querySelectorAll('[data-score] .court-score-name')].map((name) => {
            const style = getComputedStyle(name);
            return {
              says: name.textContent,
              width: Math.round(name.clientWidth),
              // Cut at its end, or by a line of it that does not show. (Half a line of
              // doubt: some faces' letters are a pixel higher than the line they sit on.)
              cut:
                name.scrollWidth > name.clientWidth + 0.5 ||
                name.scrollHeight > name.clientHeight + Number.parseFloat(style.lineHeight) / 2,
              // How its cut end is drawn: "…" by its own `text-overflow`, or by a clamp of
              // two lines, which draws one only on a box that clamps (Chromium reports
              // `-webkit-box` for it). A clamp left set on a name drawn as a block does
              // nothing, so it is not read as an "…" there.
              ends:
                style.textOverflow === 'ellipsis' ||
                (['-webkit-box', '-webkit-inline-box'].includes(style.display) &&
                  style.webkitBoxOrient === 'vertical' &&
                  style.webkitLineClamp === '2')
                  ? 'ellipsis'
                  : style.textOverflow,
              display: style.display,
            };
          }),
        );
      /**
       * Writes words into the page for a moment (`null` puts back what was there): a
       * sentence, or the lines of the banner's short form, drawn as the screen draws them.
       */
      const written = (into) =>
        page.evaluate((words) => {
          window.keptWords ??= new Map();
          for (const [selector, text] of Object.entries(words)) {
            for (const el of document.querySelectorAll(selector)) {
              if (text === null) {
                el.replaceChildren(...(window.keptWords.get(el) ?? []));
                continue;
              }
              if (!window.keptWords.has(el)) window.keptWords.set(el, [...el.childNodes]);
              if (typeof text === 'string') {
                el.textContent = text;
                continue;
              }
              const span = (name, says) => {
                const part = document.createElement('span');
                part.className = name;
                part.textContent = says;
                return part;
              };
              el.replaceChildren(
                ...text.flatMap((line, index) => [
                  ...(index === 0 ? [] : [span('court-banner-dot', ' · ')]),
                  span('court-banner-line', line),
                ]),
              );
            }
          }
        }, into);
      /** Whether anything is pushed off the screen, under the pad, or made to scroll. */
      const pushed = () =>
        page.evaluate(() => {
          const pad = document.querySelector('[data-pad]').getBoundingClientRect();
          const rest = document.querySelector('[data-pad] [data-rest]');
          return {
            page: document.scrollingElement.scrollHeight - window.innerHeight,
            sideways: document.documentElement.scrollWidth - window.innerWidth,
            panels: [...document.querySelectorAll('.court-team')].map(
              (panel) => panel.scrollHeight - panel.clientHeight,
            ),
            tilesUnderThePad: [...document.querySelectorAll('[data-floor] .court-tile')].filter(
              (el) => {
                const r = el.getBoundingClientRect();
                const under =
                  r.bottom > pad.top + 0.5 &&
                  r.top < pad.bottom &&
                  r.right > pad.left &&
                  r.left < pad.right;
                return under || r.top < 0 || r.bottom > window.innerHeight;
              },
            ).length,
            hintCutBy: rest === null ? null : rest.scrollHeight - rest.clientHeight,
          };
        });
      // On both phones that are short of room: lying down (the banner sits beside the
      // scoreboard there and takes its width from the names), and upright in a browser
      // (where a name of two lines and a banner of two lines push the players down).
      for (const { size, letters, family } of await fits(page, [phoneLying, phoneInBrowser])) {
        await drawIn(page, family);
        await page.setViewportSize({ width: size.width, height: size.height });
        await twoFrames(page);
        const at = `${size.width} x ${size.height}${letters}`;
        // The three checks keep the names they had: lying down, in this device's own letters.
        const again = letters === '' && size === phoneLying ? '' : ` (${at})`;
        const asTheyAre = await names();
        const bannerNow = (await c.banner.locator('.court-banner-long').textContent()) ?? '';
        const bannerShort = (await c.banner.locator('.court-banner-short').textContent()) ?? '';
        // What the banner shows a scorekeeper here, and what it gives a screen reader.
        const bannerShows = {
          words: (await c.banner.innerText()).trim(),
          heard: (await c.banner.ariaSnapshot()).trim(),
        };
        // The longest the banner says: all three of its lines at once (queue-banner.ts),
        // in its long form and in the short one that a phone short of room shows.
        await written({
          '[data-saved-banner] .court-banner-long': `This device could not save to its storage · ${bannerNow} · 12 actions not saved`,
          '[data-saved-banner] .court-banner-short': [
            'Storage failed',
            bannerShort,
            '12 not saved',
          ],
        });
        await twoFrames(page);
        const longestBanner = await names();
        const longestShows = (await c.banner.innerText()).trim().replace(/\s*\n\s*/g, ' · ');
        // A name of fifteen letters, and a truly long one (made-up names, written in).
        await written({
          '[data-score="home"] .court-score-name': 'Riverside Bears',
          '[data-score="away"] .court-score-name': 'Northside Academy Hawks of the Valley',
        });
        await twoFrames(page);
        const longNames = await names();
        const atItsFullest = await pushed();
        await written({
          '[data-saved-banner] .court-banner-long': null,
          '[data-saved-banner] .court-banner-short': null,
          '[data-score="home"] .court-score-name': null,
          '[data-score="away"] .court-score-name': null,
        });
        note(
          `${at}, both teams in the double bonus, three-figure scores and the banner waiting: neither team’s name is cut`,
          fullest.home >= 100 &&
            fullest.away >= 100 &&
            /waiting to send/.test(bannerNow) &&
            asTheyAre.length === 2 &&
            asTheyAre.every((name) => !name.cut),
          JSON.stringify({ fullest, bannerNow, asTheyAre }),
        );
        note(
          `${at}: the banner says it shorter (“68 to send”), in one form for the eye and for a screen reader`,
          /^\d+ to send$/.test(bannerShows.words) &&
            bannerShows.words === bannerShort &&
            bannerShows.heard.includes(bannerShort) &&
            !bannerShows.heard.includes('waiting to send'),
          JSON.stringify({ bannerShows, bannerShort }),
        );
        note(
          `…and with the longest the banner says, neither name is cut${again}`,
          longestBanner.length === 2 &&
            longestBanner.every((name) => !name.cut) &&
            /^Storage failed · \d+ to send · 12 not saved$/.test(longestShows),
          JSON.stringify({ longestBanner, longestShows }),
        );
        note(
          `…a name of fifteen letters is whole; only a truly long one is cut, ending in "…", with room for fifteen${again}`,
          longNames.length === 2 &&
            !longNames[0].cut &&
            longNames[1].cut &&
            longNames[1].ends === 'ellipsis' &&
            longNames[1].width >= longNames[0].width - 1,
          JSON.stringify(longNames),
        );
        note(
          `…and with all of that at once, nothing is pushed under the pad or off the screen, nothing scrolls and the hint is whole (${at})`,
          atItsFullest.page <= 0 &&
            atItsFullest.sideways <= 0 &&
            atItsFullest.panels.every((over) => over <= 0) &&
            atItsFullest.tilesUnderThePad === 0 &&
            atItsFullest.hintCutBy !== null &&
            atItsFullest.hintCutBy <= 0,
          JSON.stringify(atItsFullest),
        );
      }
      await drawIn(page, '');
      // Where there is room (a phone upright at its full height, a tablet) the banner
      // says it at length.
      await page.setViewportSize({ width: phone.width, height: phone.height });
      await twoFrames(page);
      const atLength = (await c.banner.innerText()).trim();
      note(
        '390 x 844: the banner says it at length (“68 actions waiting to send”)',
        /^\d+ actions waiting to send$/.test(atLength),
        atLength,
      );
      await page.setViewportSize({ width: phoneLying.width, height: phoneLying.height });
      await context.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await page.waitForFunction(
        () => document.querySelector('[data-saved-banner]').dataset.state === 'saved',
        null,
        { timeout: 120_000 },
      );
      await accessible(page, 'both teams in the double bonus');
      note('nothing broke on the page', errors.length === 0, errors.join('; '));
    } finally {
      await letGo(page, context);
    }

    // Opened already in the bonus: silent. And the horn's failure never stops the screen:
    // a device that refuses to make sound, and one with no sound at all, still show the
    // badge and say the sentence, with no error.
    const broken = {
      'a device that refuses to make sound': () => {
        window.AudioContext = class {
          constructor() {
            throw new DOMException('no sound allowed', 'NotAllowedError');
          }
        };
        window.webkitAudioContext = undefined;
      },
      'a device with no sound at all': () => {
        window.AudioContext = undefined;
        window.webkitAudioContext = undefined;
      },
      'a device whose sound breaks as the note is made': () => {
        window.AudioContext.prototype.createOscillator = () => {
          throw new Error('no speaker');
        };
      },
    };
    for (const [device, breakSound] of Object.entries(broken)) {
      const quiet = await scorekeeperAt(phoneInBrowser);
      try {
        await quiet.context.addInitScript(breakSound);
        await quiet.page.goto(`${origin}${trackerPath()}`);
        const c = await openCourt(quiet.page);
        await c.bonus('away').waitFor();
        note(
          `${device}: a game opened already in the bonus says nothing`,
          (await c.said.innerText()).trim() === '',
        );
        // Down to the bonus and up to the double again: the horn is asked for, and fails.
        await floor(c, 'home', 4).click();
        await c.recorded(() => c.option('unfoul').click());
        await c.root.locator('[data-bonus="away"][data-level="1"]').waitFor();
        await c.pad.locator('[data-rest]').waitFor();
        await foul(c, 'home', 4);
        await said(c, /^Double bonus: Bears\.$/);
        await c.saved();
        note(
          `${device}: the badge and the sentence are there all the same, and the screen goes on`,
          (await c.bonus('away').textContent()) === 'Double bonus' &&
            (await c.toggle.isEnabled()) &&
            quiet.errors.length === 0,
          quiet.errors.join('; '),
        );
      } finally {
        await letGo(quiet.page, quiet.context);
      }
    }
  });

  await step(
    'timeouts: left by length, the question, those taken, taking the latest back',
    async () => {
      const { context, page, errors } = await scorekeeperAt(tabletUpright);
      try {
        await page.goto(`${origin}${trackerPath()}`);
        const c = await openCourt(page);
        await c.saved();
        // A new half: two full timeouts each, and no 30-second ones in this league.
        await c.pickPeriod(1);
        await c.pickPeriod(2);
        await page.waitForTimeout(3400);
        const chip = (side) => c.root.locator(`[data-timeouts-chip="${side}"]`);
        note(
          'on a tablet each team’s heading says how many it has left, named in full for a screen reader',
          (await chip('home').innerText()).trim() === 'Timeouts 2' &&
            (await page.getByRole('button', { name: 'Hawks: 2 timeouts left' }).isVisible()),
          await chip('home').innerText(),
        );
        note(
          'the Timeouts button says how many each team has left, home first, and is named in full for a screen reader',
          /^Timeouts\s*2\s*2$/.test((await c.timeoutsButton.innerText()).trim()) &&
            (await page
              .getByRole('button', { name: 'Timeouts: Hawks 2 left, Bears 2 left', exact: true })
              .isVisible()) &&
            (await c.timeoutsButton.locator('[data-none]').count()) === 0,
          await c.timeoutsButton.innerText(),
        );
        await c.startClock();
        await watchScrolling(page);
        await tapWhereItIs(page, c.timeoutsButton, 'Timeouts');
        await c.timeoutsPad.waitFor();
        const padWords = (await c.timeoutsPad.innerText()).replace(/\s+/g, ' ');
        note(
          'the pad holds both teams’ timeouts, how many are left by length, and the rule in one line',
          /Timeouts 2 full a half · 1 more each overtime · none carried over/.test(padWords) &&
            /HAWKS Full 2 left None taken\./i.test(padWords) &&
            /BEARS Full 2 left None taken\./i.test(padWords) &&
            (await c.timeoutsPad.locator('[data-seconds="30"]').count()) === 0,
          padWords,
        );
        note(
          'the rule is read whole, never cut',
          await c.timeoutsPad
            .locator('.court-timeout-head')
            .evaluate(
              (el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight + 1,
            ),
        );
        await measureTargets(page, '820 x 1180, the timeouts');
        await accessible(page, 'the timeouts');
        const clockBefore = seconds(await c.clockText());
        await c.recorded(() => tapWhereItIs(page, c.timeoutButton('home'), 'Full, for Hawks'));
        await said(c, /^Full timeout: Hawks\. Clock stopped\.$/);
        await c.startButton.waitFor();
        note(
          'a timeout on a running clock stops it, the list closes, and the Start clock button says why',
          (await c.toggle.getAttribute('data-state')) === 'start' &&
            !(await c.timeoutsPad.isVisible()) &&
            (await c.stopReason.innerText()).trim() === 'Stopped for a Hawks timeout.' &&
            clockBefore - seconds(await c.clockText()) <= 3 &&
            (await chip('home').innerText()).trim() === 'Timeouts 1' &&
            /^Timeouts\s*1\s*2$/.test((await c.timeoutsButton.innerText()).trim()),
          await c.stopReason.innerText(),
        );
        await c.timeout('home');
        await page.waitForTimeout(3400);
        note(
          'with none left the heading says so',
          (await chip('home').innerText()).trim() === 'Timeouts 0' &&
            (await chip('home').getAttribute('data-none')) !== null &&
            (await page.getByRole('button', { name: 'Hawks: no timeouts left' }).isVisible()),
        );
        await c.timeoutsButton.click();
        await c.timeoutsPad.waitFor();
        const none = c.timeoutButton('home');
        note(
          'the button says "none left", and is named so',
          /none left/.test(await none.innerText()) &&
            (await none.getAttribute('aria-label')) === 'Full timeout for Hawks, none left',
        );
        const taken = c.timeoutsPad.locator('[data-timeouts-taken="home"] li');
        /** How many the home team has taken in all: the pad writes out the latest two. */
        const takenInAll = async () =>
          Number(
            await c.timeoutsPad
              .locator('[data-timeouts-of="home"]')
              .getAttribute('data-taken-count'),
          );
        const earlier = c.timeoutsPad.locator('[data-timeouts-earlier="home"]');
        note(
          'those taken are listed with their period and clock time, and no "Full" where the league has one length',
          (await taken.count()) === 2 &&
            (await takenInAll()) === 2 &&
            (await earlier.count()) === 0 &&
            (await taken.allInnerTexts()).every((line) => /^H2 \d+:\d\d$/.test(line.trim())),
          JSON.stringify(await taken.allInnerTexts()),
        );
        // Two fast taps on the button of a team with none left: asked, not recorded.
        const plays = await c.root.getAttribute('data-plays');
        const at = await none.boundingBox();
        await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
        await page.waitForTimeout(90);
        await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
        const ask = c.pad.locator('[data-timeout-ask]');
        await ask.waitFor();
        await page.waitForTimeout(500);
        note(
          'one more than the team has is asked about first, and two fast taps record nothing',
          /^No full timeouts left for Hawks\. Officials charge a technical foul for an extra one\. Record it anyway\?/.test(
            (await ask.innerText()).trim(),
          ) && (await c.root.getAttribute('data-plays')) === plays,
          await ask.innerText(),
        );
        await measureTargets(page, '820 x 1180, the question before a timeout too many');
        await accessible(page, 'the question before a timeout too many');
        await tapWhereItIs(page, ask.locator('[data-answer="no"]'), 'Do not record it');
        await c.timeoutsPad.locator('[data-timeouts-of="home"]').waitFor();
        note(
          '"Do not record it" records nothing and goes back to the timeouts',
          (await c.root.getAttribute('data-plays')) === plays && (await takenInAll()) === 2,
        );
        await none.click();
        await ask.waitFor();
        await page.keyboard.press('Escape');
        await c.timeoutsPad.locator('[data-timeouts-of="home"]').waitFor();
        note('Escape answers no as well', (await c.root.getAttribute('data-plays')) === plays);
        await none.click();
        await ask.waitFor();
        await page.waitForTimeout(450);
        await c.recorded(() =>
          tapWhereItIs(page, ask.locator('[data-answer="yes"]'), 'Record it anyway'),
        );
        await said(c, /^Full timeout: Hawks\.$/);
        await c.timeoutsButton.click();
        await c.timeoutsPad.waitFor();
        note(
          '"Record it anyway" records it: three taken, the latest two written out and "and 1 earlier"',
          (await takenInAll()) === 3 &&
            (await taken.count()) === 2 &&
            (await earlier.innerText()).trim() === 'and 1 earlier',
          `${await takenInAll()} taken, ${await taken.count()} written`,
        );
        // − takes back the latest, and says so; once more gives the team one back.
        const minus = c.timeoutsPad.locator('[data-act="untimeout"][data-side="home"]');
        note(
          '− is named for what it takes back',
          (await minus.getAttribute('aria-label')) === 'Take back the latest Hawks timeout',
        );
        // Two fast taps on −, 90 ms apart (the area 4 review, M2): one comes back, not
        // two. − rests after the first, is drawn so, and the screen says which came back.
        const minusAt = await minus.boundingBox();
        const [mx, my] = [minusAt.x + minusAt.width / 2, minusAt.y + minusAt.height / 2];
        await page.mouse.click(mx, my);
        await page.waitForTimeout(90);
        await page.mouse.click(mx, my);
        const restingSeen = (await minus.getAttribute('data-resting')) !== null;
        await said(c, /^Timeout taken back: Hawks, H2 \d+:\d\d\.$/);
        // While the sentence is on the screen nothing under the finger has moved: it is
        // drawn over the panel's first line, not above the panel. (It used to push the
        // panel down, and the second tap then landed on "Full" and called a timeout.)
        const [minusNow, fullNow] = [await minus.boundingBox(), await none.boundingBox()];
        const sayAt = await c.said.boundingBox();
        note(
          'what the screen says does not move − or the timeout buttons: it is drawn over the panel’s first line',
          minusNow !== null &&
            minusNow.x === minusAt.x &&
            minusNow.y === minusAt.y &&
            fullNow !== null &&
            fullNow.y === at.y &&
            sayAt !== null &&
            sayAt.y + sayAt.height <= fullNow.y,
          JSON.stringify({ minusAt, minusNow, fullBefore: at, fullNow, sayAt }),
        );
        // − rests 600 ms after a take-back (takeBackRestMs): looked at once it is over.
        await page.waitForTimeout(700);
        await c.saved();
        note(
          'two fast taps on − take one timeout back, not two: − rests, is drawn resting, and the screen says which came back',
          (await takenInAll()) === 2 &&
            restingSeen &&
            (await minus.getAttribute('data-resting')) === null &&
            (await c.timeoutsPad.locator('[data-timeout-ask]').count()) === 0,
          `${await takenInAll()} taken; drawn resting: ${restingSeen}`,
        );
        // A second, deliberate tap takes the next one back.
        await c.recorded(() => tapWhereItIs(page, minus, '−'));
        note(
          'taking back the latest gives it back: one taken, one left, and the list stays open',
          (await taken.count()) === 1 &&
            (await takenInAll()) === 1 &&
            /Full 1 left/.test((await none.innerText()).replace(/\s+/g, ' ')) &&
            (await none.getAttribute('data-none')) === null &&
            (await c.timeoutsPad.isVisible()),
        );
        await page.keyboard.press('Escape');
        await c.pad.locator('[data-rest]').waitFor();
        note('Escape closes the timeouts', await keyboardOn(c.timeoutsButton));
        const scrolled = await scrollsSeen(page);
        note(
          'nothing scrolled through the timeouts',
          scrolled.events === 0 && scrolled.moved.length === 0,
          JSON.stringify(scrolled),
        );
        await c.saved();
        note('nothing broke on the page', errors.length === 0, errors.join('; '));
      } finally {
        await letGo(page, context);
      }
    },
  );

  // The same double tap on − on a phone (the code review's confirming look): the sentence
  // is drawn over the panel's first line there too (on two lines lying down), so nothing
  // under the finger moves and the second tap lands on − again, never on "Full".
  for (const size of [phoneInBrowser, phoneLying]) {
    const at = `${size.width} x ${size.height}`;
    await step(`two fast taps on − in the timeouts, at ${at}`, async () => {
      const { context, page, errors } = await scorekeeperAt(size);
      try {
        await page.goto(`${origin}${trackerPath()}`);
        const c = await openCourt(page);
        await c.saved();
        const takenInAll = async () =>
          Number(
            await c.timeoutsPad
              .locator('[data-timeouts-of="home"]')
              .getAttribute('data-taken-count'),
          );
        // Two taken at least, so one can come back.
        await c.timeoutsButton.click();
        await c.timeoutsPad.waitFor();
        while ((await takenInAll()) < 2) {
          await c.timeout('home');
          await c.timeoutsButton.click();
          await c.timeoutsPad.waitFor();
        }
        // Measured with nothing said, then tapped twice, 90 ms apart, where − is.
        await page.waitForFunction(
          () => document.querySelector('[data-say]')?.textContent === '',
          null,
          { timeout: 10_000 },
        );
        const before = await takenInAll();
        const minus = c.timeoutsPad.locator('[data-act="untimeout"][data-side="home"]');
        const full = c.timeoutButton('home');
        const [minusAt, fullAt] = [await minus.boundingBox(), await full.boundingBox()];
        const [mx, my] = [minusAt.x + minusAt.width / 2, minusAt.y + minusAt.height / 2];
        await page.mouse.click(mx, my);
        await page.waitForTimeout(90);
        await page.mouse.click(mx, my);
        await said(c, /^Timeout taken back: Hawks, H2 \d+:\d\d\.$/);
        const [minusNow, fullNow] = [await minus.boundingBox(), await full.boundingBox()];
        const sayAt = await c.said.boundingBox();
        note(
          `${at}: what the screen says does not move − or the timeout buttons: it is drawn over the panel’s first line`,
          minusNow !== null &&
            minusNow.x === minusAt.x &&
            minusNow.y === minusAt.y &&
            fullNow !== null &&
            fullNow.x === fullAt.x &&
            fullNow.y === fullAt.y &&
            sayAt !== null &&
            sayAt.y + sayAt.height <= fullNow.y,
          JSON.stringify({ minusAt, minusNow, fullAt, fullNow, sayAt }),
        );
        await page.waitForTimeout(500);
        await c.saved();
        note(
          `${at}: two fast taps on − take one timeout back, not two, and call none`,
          (await takenInAll()) === before - 1 &&
            (await c.timeoutsPad.locator('[data-timeout-ask]').count()) === 0,
          `${before} taken before, ${await takenInAll()} after`,
        );
        // A slow double tap (the area lead's second look, with touch: two came back at
        // 310 to 340 ms apart): − rests 600 ms after a take-back, so at 350 and at 450 ms
        // apart exactly one comes back too.
        if (size === phoneInBrowser) {
          for (const apart of [350, 450]) {
            await page.waitForTimeout(700);
            while ((await takenInAll()) < 2) {
              await c.timeout('home');
              await c.timeoutsButton.click();
              await c.timeoutsPad.waitFor();
            }
            const was = await takenInAll();
            const box = await minus.boundingBox();
            const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
            await page.mouse.click(x, y);
            await page.waitForTimeout(apart);
            await page.mouse.click(x, y);
            const restingWhenTapped = (await minus.getAttribute('data-resting')) !== null;
            await page.waitForTimeout(700);
            await c.saved();
            note(
              `${at}: two taps on − ${apart} ms apart take exactly one timeout back, and − was drawn resting for the second`,
              (await takenInAll()) === was - 1 &&
                restingWhenTapped &&
                (await c.timeoutsPad.locator('[data-timeout-ask]').count()) === 0,
              `${was} taken before, ${await takenInAll()} after; resting at the second: ${restingWhenTapped}`,
            );
          }
        }
        note(`${at}: nothing broke on the page`, errors.length === 0, errors.join('; '));
      } finally {
        await letGo(page, context);
      }
    });
  }

  await step('the five sizes: the clock’s states, their targets, nothing scrolling', async () => {
    const { context, page, errors } = await scorekeeperAt(phone);
    try {
      await page.goto(`${origin}${trackerPath()}`);
      const c = await openCourt(page);
      await c.saved();
      // Six timeouts taken by each team, as in a game that reaches its second half and an
      // overtime (the area 4 review, M1): the list is then at its longest at every size.
      // Neither team has any left, so the question can be asked at every size too.
      const takenBy = async (side) => {
        if (!(await c.timeoutsPad.isVisible())) await c.timeoutsButton.click();
        await c.timeoutsPad.waitFor();
        return Number(
          await c.timeoutsPad
            .locator(`[data-timeouts-of="${side}"]`)
            .getAttribute('data-taken-count'),
        );
      };
      for (const side of ['home', 'away']) {
        while ((await takenBy(side)) < 6) await c.timeout(side);
      }
      if (await c.timeoutsPad.isVisible()) await c.pad.locator('.court-close').click();
      await c.pad.locator('[data-rest]').waitFor();
      await page.waitForTimeout(3400);
      /**
       * Measures the state the screen is in at each of the five sizes, in this device's
       * own letters and in wider ones, then comes back.
       */
      const atEverySize = async (state, more = async () => {}) => {
        for (const { size, letters, family } of await fits(page)) {
          await drawIn(page, family);
          await page.setViewportSize({ width: size.width, height: size.height });
          const label = `${size.width} x ${size.height}${letters}, ${state}`;
          await measureTargets(page, label);
          const still = await page.evaluate(() => ({
            page: document.scrollingElement.scrollHeight - window.innerHeight,
            sideways: document.documentElement.scrollWidth - window.innerWidth,
            panels: [...document.querySelectorAll('.court-team')].map(
              (panel) => panel.scrollHeight - panel.clientHeight,
            ),
            board: [...document.querySelectorAll('[data-score], [data-clock]')].every((el) => {
              const r = el.getBoundingClientRect();
              return r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0;
            }),
            tiles: [...document.querySelectorAll('[data-floor] .court-tile')].every((el) => {
              const r = el.getBoundingClientRect();
              const pad = document.querySelector('[data-pad]').getBoundingClientRect();
              const under =
                r.bottom > pad.top + 0.5 &&
                r.top < pad.bottom &&
                r.right > pad.left &&
                r.left < pad.right;
              return r.top >= 0 && r.bottom <= window.innerHeight && !under;
            }),
          }));
          note(
            `${label}: nothing scrolls, the scoreboard and both fives are whole on the screen`,
            still.page <= 0 &&
              still.sideways <= 0 &&
              still.panels.every((over) => over <= 0) &&
              still.board &&
              still.tiles,
            JSON.stringify(still),
          );
          await more(size, label);
        }
        await drawIn(page, '');
        await page.setViewportSize({ width: phone.width, height: phone.height });
        await twoFrames(page);
      };
      /** A thing is whole inside the pad, and on top there. */
      const wholeInPad = (locator) =>
        locator.evaluate((el) => {
          const [r, pad] = [
            el.getBoundingClientRect(),
            document.querySelector('[data-pad]').getBoundingClientRect(),
          ];
          return (
            r.left >= pad.left &&
            r.right <= pad.right &&
            r.top >= pad.top &&
            r.bottom <= pad.bottom &&
            el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))
          );
        });

      await c.startButton.waitFor();
      await atEverySize('the clock stopped', async (size, label) => {
        const box = await c.startButton.boundingBox();
        note(
          `${label}: the Start clock button is whole in the pad, 44 or more high and most of the pad wide`,
          (await wholeInPad(c.startButton)) &&
            (await wholeInPad(c.hideStart)) &&
            box.height >= 43.99 &&
            box.width >= 200,
          JSON.stringify(box),
        );
        await restFits(page, label, 2);
        // Start and Pause, the clock and the timeouts are named for a screen reader.
        note(
          `${label}: Start, the clock and the timeouts are each named for a screen reader`,
          (await page.getByRole('button', { name: 'Start the clock', exact: true }).isVisible()) &&
            (await page
              .getByRole('button', { name: /Set the clock or change the period$/ })
              .isVisible()) &&
            (await page
              .getByRole('button', {
                name: 'Timeouts: Hawks none left, Bears none left',
                exact: true,
              })
              .isVisible()) &&
            (await page.getByRole('button', { name: 'Hide the Start clock button' }).isVisible()),
        );
        // Timeouts left are one tap away on a phone, and the button itself says how many
        // (the lead's answer on the area 4 review): both numbers, home first as on the
        // scoreboard, whole inside the button; a team with none has its number on red.
        const left = await c.timeoutsButton.evaluate((button) => {
          const edge = button.getBoundingClientRect();
          return [...button.querySelectorAll('[data-timeouts-left]')].map((number) => {
            const r = number.getBoundingClientRect();
            return {
              side: number.getAttribute('data-timeouts-left'),
              says: number.textContent,
              none: number.hasAttribute('data-none'),
              ground: getComputedStyle(number).backgroundColor,
              whole:
                r.width > 0 &&
                r.left >= edge.left &&
                r.right <= edge.right &&
                r.top >= edge.top &&
                r.bottom <= edge.bottom,
            };
          });
        });
        note(
          `${label}: the Timeouts button carries both teams’ numbers left, home first, and a team with none has its number on red`,
          left.length === 2 &&
            left[0].side === 'home' &&
            left[1].side === 'away' &&
            left[0].says === '0' &&
            left[1].says === '0' &&
            left.every(
              (number) => number.none && number.whole && !/rgba\(0, 0, 0, 0\)/.test(number.ground),
            ) &&
            /^Timeouts\s*0\s*0$/.test((await c.timeoutsButton.innerText()).trim()),
          JSON.stringify(left),
        );
      });
      await accessible(page, 'the clock stopped, at a phone upright');

      // Nothing that is tapped in the pad lies under the Start clock button, at every
      // size (the code review, M-c: it was measured at 390 x 664 only). The pad returns
      // to rest with each of these taps, so a second fast tap lands where the button is:
      // a floor player's options, a team's whole bench, and a bench player's options.
      for (const { size, letters, family } of await fits(page)) {
        await drawIn(page, family);
        await page.setViewportSize({ width: size.width, height: size.height });
        await twoFrames(page);
        const label = `${size.width} x ${size.height}${letters}`;
        await c.startButton.waitFor();
        const [startAt, hideAt] = [await rectOf(c.startButton), await rectOf(c.hideStart)];
        const measured = {};
        const measure = async (what, within) => {
          const buttons = await buttonsOf(within);
          const close = buttons.find((b) => b.close);
          measured[what] = {
            buttons: buttons.length,
            under: buttons.filter((b) => !b.close && overlap(b, startAt)).map((b) => b.name),
            underCross: buttons.filter((b) => !b.close && overlap(b, hideAt)).map((b) => b.name),
            crossOnCross: close !== undefined && overlap(close, hideAt),
          };
        };
        const tile = floor(c, 'home');
        await tile.click();
        const floorOptions = c.pad.locator(
          `[data-options="${await tile.getAttribute('data-player')}"]`,
        );
        await floorOptions.waitFor();
        await measure('a floor player’s options', floorOptions);
        // A picked player's second line is whole, to the end of the minutes (the area 4
        // review, L6: it was cut on a tablet lying down). Where a device's letters are
        // too wide for all of it, the line leaves words off, never letters: "On court"
        // first, then the word after the minutes. So it is read here as a scorekeeper
        // reads it: each part of it either shows whole on the line or is not there at
        // all, and a part is left off only where the line truly had no room for it.
        const facts = await floorOptions.locator('.court-who-facts').evaluate((el) => {
          const box = el.getBoundingClientRect();
          const widthOf = (part) => part?.getBoundingClientRect().width ?? 0;
          const parts = [];
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
            const range = document.createRange();
            range.selectNodeContents(node);
            const r = range.getBoundingClientRect();
            // Not drawn at this size at all (a narrow pad begins at the fouls).
            if (r.width === 0) continue;
            const middle = (r.top + r.bottom) / 2;
            const onTheLine = middle > box.top && middle < box.bottom;
            const whole = onTheLine && r.left >= box.left - 0.5 && r.right <= box.right + 0.5;
            parts.push({
              says: node.textContent,
              width: r.width,
              shows: whole ? 'whole' : onTheLine ? 'cut' : 'left off',
            });
          }
          const [where, core] = [
            el.querySelector('.court-who-where'),
            el.querySelector('.court-who-core'),
          ];
          const after = parts.at(-1);
          return {
            shows: parts
              .filter((part) => part.shows === 'whole')
              .map((part) => part.says)
              .join(''),
            cut: parts.filter((part) => part.shows === 'cut').map((part) => part.says),
            leftOff: parts.filter((part) => part.shows === 'left off').map((part) => part.says),
            all: el.textContent,
            has: box.width,
            // What the line needs with the word after the minutes, and with "On court" too.
            withPlayed: widthOf(core) + after.width,
            withWhere: widthOf(where) + widthOf(core) + after.width,
            px: Number.parseFloat(getComputedStyle(el).fontSize),
          };
        });
        // A space's width of doubt: a word that wraps away is measured without its space.
        const noRoom = (needs) => needs > facts.has - 6;
        const offWhere = facts.leftOff.some((part) => /^On court/.test(part));
        const offPlayed = facts.leftOff.some((part) => /played/.test(part));
        if (facts.leftOff.length > 0) {
          console.log(`  ${label}: a picked player’s second line reads “${facts.shows}”`);
        }
        note(
          `${label}: a picked player’s second line is whole, to the end of the minutes`,
          /^(On court · )?\d+ fouls? · \d+ pts · \d+:\d\d( played)?$/.test(facts.shows) &&
            facts.cut.length === 0 &&
            // The whole of it is still what a screen reader is given.
            /^On court · \d+ fouls? · \d+ pts · \d+:\d\d played$/.test(facts.all) &&
            // Words are left off only for want of room, "On court" before "played".
            (!offWhere || noRoom(facts.withWhere)) &&
            (!offPlayed || (noRoom(facts.withPlayed) && !/^On court/.test(facts.shows))) &&
            // And never by setting it smaller than the pad's other second-rank words.
            facts.px >= (size.width >= 700 && size.height >= 521 ? 15 : 13),
          JSON.stringify(facts),
        );
        await floorOptions.locator('.court-close').click();
        await c.pad.locator('[data-rest]').waitFor();
        // The bench's button is drawn only where the bench is folded away; it is there
        // at every size, and opens the same panel.
        await c.benchButton('home').evaluate((button) => button.click());
        const bench = c.pad.locator('[data-bench-list="home"]');
        await bench.waitFor();
        await measure('the whole bench', bench);
        await bench.locator('[data-bench-pick]').first().click();
        const benchOptions = c.pad.locator('[data-options]');
        await benchOptions.waitFor();
        await measure('a bench player’s options', benchOptions);
        await benchOptions.locator('.court-close').click();
        await c.pad.locator('[data-rest]').waitFor();
        const all = Object.values(measured);
        note(
          `${label}: no option, substitute or bench player lies under the Start clock button, and only the pad’s own × lies under its ×`,
          all.length === 3 &&
            all.every(
              (one) =>
                one.buttons >= 6 &&
                one.under.length === 0 &&
                one.underCross.length === 0 &&
                one.crossOnCross,
            ),
          JSON.stringify(measured),
        );
      }
      await drawIn(page, '');
      await page.setViewportSize({ width: phone.width, height: phone.height });
      await twoFrames(page);

      await c.startClock();
      await atEverySize('the clock running', async (size, label) => {
        await restFits(page, label, 4);
      });
      await c.pauseClock();

      await c.timeoutsButton.click();
      await c.timeoutsPad.waitFor();
      await atEverySize('the timeouts', async (size, label) => {
        const parts = await c.timeoutsPad
          .locator('button, .court-timeout-head, [data-timeouts-taken] li, [data-timeouts-earlier]')
          .evaluateAll((els) => {
            const pad = document.querySelector('[data-pad]').getBoundingClientRect();
            return els.every((el) => {
              const r = el.getBoundingClientRect();
              return (
                r.left >= pad.left &&
                r.right <= pad.right &&
                r.top >= pad.top &&
                r.bottom <= pad.bottom
              );
            });
          });
        note(`${label}: every button and every line of them is whole in the pad`, parts);
        // Six taken by each team (M1): the latest two written out, each on one line that
        // is whole in its team's frame, then the count; and nothing in the pad scrolls.
        const lists = await c.timeoutsPad.locator('[data-timeouts-of]').evaluateAll((teams) =>
          teams.map((team) => {
            const frame = team.getBoundingClientRect();
            const lines = [...team.querySelectorAll('[data-timeouts-taken] li')];
            const minus = team.querySelector('[data-act="untimeout"]').getBoundingClientRect();
            return {
              taken: team.getAttribute('data-taken-count'),
              written: lines.map((line) => line.textContent),
              earlier: team.querySelector('[data-timeouts-earlier]')?.textContent ?? '',
              oneLineEach: lines.every((line) => {
                const high = line.getBoundingClientRect().height;
                return high <= Number.parseFloat(getComputedStyle(line).fontSize) * 1.5;
              }),
              whole: lines.every((line) => {
                // The words themselves, not the line's box: none runs under − or out of the frame.
                const range = document.createRange();
                range.selectNodeContents(line);
                const r = range.getBoundingClientRect();
                const underMinus =
                  r.right > minus.left + 0.5 && r.bottom > minus.top && r.top < minus.bottom;
                return r.left >= frame.left && r.right <= frame.right + 0.5 && !underMinus;
              }),
            };
          }),
        );
        const scrolling = await c.pad.evaluate((pad) =>
          [pad, ...pad.querySelectorAll('*')]
            .filter(
              (el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
            )
            .filter((el) => /auto|scroll|hidden/.test(getComputedStyle(el).overflow))
            .map((el) => el.className || el.tagName),
        );
        note(
          `${label}: six timeouts a team: the latest two whole on a line each, then "and 4 earlier"; nothing in the pad scrolls or is cut`,
          lists.length === 2 &&
            lists.every(
              (list) =>
                list.taken === '6' &&
                list.written.length === 2 &&
                list.written.every((line) => /^(H\d|OT\d) \d+:\d\d$/.test(line)) &&
                list.earlier === 'and 4 earlier' &&
                list.oneLineEach &&
                list.whole,
            ) &&
            scrolling.length === 0,
          JSON.stringify({ lists, scrolling }),
        );
      });
      await c.timeoutButton('home').click();
      await c.pad.locator('[data-timeout-ask]').waitFor();
      await atEverySize('the question before a timeout too many', async (size, label) => {
        note(
          `${label}: the question and both answers are whole in the pad`,
          (await wholeInPad(c.pad.locator('[data-answer="yes"]'))) &&
            (await wholeInPad(c.pad.locator('[data-answer="no"]'))) &&
            (await c.pad
              .locator('[data-timeout-ask] p')
              .evaluate((el) => el.scrollHeight <= el.clientHeight + 1)),
        );
      });
      await page.waitForTimeout(450);
      await c.pad.locator('[data-answer="no"]').click();
      await c.pad.locator('.court-close').click();
      await c.pad.locator('[data-rest]').waitFor();

      await c.typeClock('1234');
      await atEverySize('the clock’s form', async (size, label) => {
        // A period's button acts at once: 56 or more on its short side (the area 4
        // review, L2: they were 53 x 48).
        const periodSizes = await c.clockSheet
          .locator('[data-period-pick]')
          .evaluateAll((els) =>
            els.map((el) =>
              Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height),
            ),
          );
        note(
          `${label}: every period’s button in the form is 56 or more on its short side`,
          periodSizes.length === 5 && periodSizes.every((short) => short >= 55.99),
          periodSizes.map((short) => short.toFixed(0)).join(' '),
        );
        note(
          `${label}: the whole form is on the screen, every key 44 or more, nothing in it scrolling`,
          await c.clockSheet.evaluate((el) => {
            const within = (part) => {
              const r = part.getBoundingClientRect();
              return (
                r.top >= 0 &&
                r.left >= 0 &&
                r.bottom <= window.innerHeight &&
                r.right <= window.innerWidth
              );
            };
            const keys = [
              ...el.querySelectorAll('[data-key], [data-period-pick], [data-set-clock]'),
            ];
            return (
              el.scrollHeight <= el.clientHeight &&
              within(el) &&
              keys.length === 18 &&
              keys.every((key) => {
                const r = key.getBoundingClientRect();
                return within(key) && r.width >= 43.99 && r.height >= 43.99;
              })
            );
          }),
        );
      });
      await c.clockSheet.locator('.court-close').click();
      await c.root.locator('[data-clock-sheet]').waitFor({ state: 'detached' });

      await c.setClock('1');
      await c.startClock().catch(() => undefined);
      await c.pickPeriodButton.waitFor();
      await page.waitForTimeout(3400);
      await atEverySize('the period over', async (size, label) => {
        note(
          `${label}: the way to the next period is whole in the pad`,
          await wholeInPad(c.pickPeriodButton),
        );
        await restFits(page, label, 2);
      });
      await c.setClock('500');
      await c.saved();
      note('nothing broke on the page', errors.length === 0, errors.join('; '));
    } finally {
      await letGo(page, context);
    }
  });
}
