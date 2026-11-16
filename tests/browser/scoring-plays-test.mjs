// Step 2.37 in a real browser, by touch: a short game on the scoring screen, played with
// a finger's taps (a touch screen, `tap`, real touch points) against the web app on its
// made-up stand-in (APP_ENV=test). Nothing leaves this computer; every team, game and
// person is made up. Builds the app first unless given --no-build.
//
// The game is played from its start four times, each on a made-up world of its own: at
// the phone a scorekeeper really holds (390 x 664) and at a tablet lying down (1180 x
// 820), in this device's own letters and in ones as wide as GitHub's Ubuntu machines and
// some phones draw. A stop clock is set before tip-off, so a foul stops the clock and its
// undo has something to say.
//
// - Baskets and a foul by touch; Undo names the play it will take back, on the button
//   itself and in full for a screen reader; a wrong basket is undone and the screen says
//   what was taken back; Redo brings it back; greyed, each says why when tapped.
// - Undo is reached with a player's options open: nothing in the pad moves, the sentence
//   is drawn over the player's line, and the next tap is the option that was there.
// - Two fast taps on Undo take one play back, never two.
// - A foul that had stopped the clock, undone, says the clock stays stopped.
// - With the network held back the banner says "No connection" and how many plays wait,
//   the latest play's line says "Not sent yet", and in the play log the plays the league
//   does not have are dimmed and say so; every play is there newest first, with its
//   period, its clock and, after a basket, the score. With the network back they are
//   sent and marked no more.
// - At every state nothing scrolls, both fives are whole and on the screen, and Undo and
//   Redo are 44 x 44 or more, 8 or more from what is beside them, and lie over no option.
// - At all five sizes, in both faces, the row under the scoreboard holds its four things
//   whole: Start or Pause, the timeouts, Undo with a basket's play uncut, and Redo.
import {
  addPlayers,
  court,
  drawIn,
  lettersHere,
  scorekeeper,
  sizes,
  starters,
  stopClockGame,
  trackerPath,
  widerFace,
} from './tracker-driver.mjs';
import {
  accessibilityProblems,
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
const [, , , tabletLying, phoneInBrowser] = sizes;

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}

/** The page drawn twice: what the screen does just after a drawing is done by then. */
const twoFrames = (page) =>
  page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );

/** Where a thing is on the screen. */
const rectOf = (locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });

/**
 * Nothing scrolls and both fives are whole (DESIGN.md section 7, lines 5 and 8): the page,
 * the two teams' block and each team's panel have nothing to scroll to, and every floor
 * tile is on the screen, inside its block and over no part of the pad.
 */
async function still(page, label) {
  await twoFrames(page);
  const seen = await page.evaluate(() => {
    const pad = document.querySelector('[data-pad]').getBoundingClientRect();
    const teams = document.querySelector('[data-teams]');
    const held = getComputedStyle(teams).display !== 'contents';
    const block = teams.getBoundingClientRect();
    const tiles = [...document.querySelectorAll('[data-floor] .court-tile')];
    return {
      page: document.scrollingElement.scrollHeight - window.innerHeight,
      sideways: document.documentElement.scrollWidth - window.innerWidth,
      teams: held ? teams.scrollHeight - teams.clientHeight : 0,
      panels: [...document.querySelectorAll('.court-team')].map(
        (panel) => panel.scrollHeight - panel.clientHeight,
      ),
      floorTiles: tiles.length,
      tilesNotWhole: tiles.filter((el) => {
        const r = el.getBoundingClientRect();
        const underPad =
          r.bottom > pad.top + 0.5 &&
          r.top < pad.bottom &&
          r.right > pad.left &&
          r.left < pad.right;
        return (
          r.top < 0 ||
          r.bottom > window.innerHeight ||
          underPad ||
          (held && r.bottom > block.bottom + 0.5)
        );
      }).length,
      padOffScreen: pad.bottom > window.innerHeight + 0.5 || pad.top < 0,
    };
  });
  note(
    `${label}: nothing scrolls, both fives are whole and the pad is on the screen`,
    seen.page <= 0 &&
      seen.sideways <= 0 &&
      seen.teams <= 0 &&
      seen.panels.every((over) => over <= 0) &&
      seen.floorTiles === 10 &&
      seen.tilesNotWhole === 0 &&
      !seen.padOffScreen,
    JSON.stringify(seen),
  );
}

/**
 * The row under the scoreboard (DESIGN.md section 7, lines 5 and 6): its four things
 * each 44 x 44 or more, 8 or more apart, inside the row, their words whole; Undo naming
 * `names` uncut when that is given.
 */
async function rowFits(page, label, names) {
  await twoFrames(page);
  const row = await page.evaluate(() => {
    const controls = document.querySelector('[data-slot="clock-controls"]');
    const edge = controls.getBoundingClientRect();
    const parts = [...controls.querySelectorAll(':scope > button')].map((el) => {
      const r = el.getBoundingClientRect();
      // Its words and marks. The play Undo names is judged by itself (`undoCut`): its own
      // place cuts it at its end, and what is cut there reaches nowhere.
      const inside = [...el.querySelectorAll('span')].filter(
        (s) => s.getClientRects().length > 0 && s.closest('[data-undo-play]') === null,
      );
      return {
        is:
          (el.hasAttribute('data-undo') && 'undo') ||
          (el.hasAttribute('data-redo') && 'redo') ||
          (el.hasAttribute('data-clock-toggle') && 'clock') ||
          'timeouts',
        left: r.left,
        right: r.right,
        width: r.width,
        height: r.height,
        // A word or a mark of it reaching outside the button: it has no room.
        spills: inside.some((s) => {
          const w = s.getBoundingClientRect();
          return w.left < r.left - 0.5 || w.right > r.right + 0.5;
        }),
        outsideRow: r.left < edge.left - 0.5 || r.right > edge.right + 0.5,
      };
    });
    const play = controls.querySelector('[data-undo-play]');
    const shown = play && [...play.children].find((s) => s.getClientRects().length > 0);
    return {
      parts,
      undoSays: shown?.textContent ?? null,
      undoCut: play === null ? null : play.scrollWidth > play.clientWidth + 0.5,
    };
  });
  const order = row.parts.map((part) => part.is).join(' ');
  const gaps = row.parts.slice(1).map((part, i) => part.left - row.parts[i].right);
  note(
    `${label}: the row under the scoreboard holds Start or Pause, the timeouts, Undo and Redo, each 44 x 44 or more, 8 or more apart and whole`,
    order === 'clock timeouts undo redo' &&
      row.parts.every(
        (part) => part.width >= 44 && part.height >= 44 && !part.spills && !part.outsideRow,
      ) &&
      gaps.every((gap) => gap >= 7.5),
    JSON.stringify({ order, gaps, parts: row.parts }),
  );
  if (names !== undefined) {
    note(
      `${label}: Undo names its play on the button, uncut (“${names}”)`,
      row.undoSays === names && row.undoCut === false,
      JSON.stringify({ says: row.undoSays, cut: row.undoCut }),
    );
  }
}

/** A finger's tap on the middle of a thing, wherever it is: greyed things too. */
async function finger(page, locator) {
  const r = await rectOf(locator);
  await page.touchscreen.tap((r.left + r.right) / 2, (r.top + r.bottom) / 2);
}

async function accessible(page, label) {
  const problems = await accessibilityProblems(page);
  const tree = await page.locator('body').ariaSnapshot();
  const nameless = tree
    .split('\n')
    .filter((line) => /^\s*- (button|link)(\s\[[^\]]*\])*:?\s*$/.test(line));
  if (nameless.length > 0) {
    problems.push(`${nameless.length} buttons or links have no name for a screen reader`);
  }
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
}

/**
 * One short game by touch, at `size` in the letters of `face`, on a made-up world of its
 * own (a server started for it and stopped after it).
 */
async function shortGame(browser, size, face) {
  const at = `${size.width} x ${size.height}${face.letters}`;
  const origin = `http://localhost:${await freePort()}`;
  const server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  let context;
  try {
    await waitFor(`${origin}/`, server);
    await addPlayers(origin);
    await stopClockGame(origin);
    context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      hasTouch: true,
    });
    await context.addCookies([{ ...scorekeeper, url: origin }]);
    if (face.family !== '') {
      await context.addInitScript((family) => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.setAttribute('data-drawn-in', '');
          style.textContent = `.court, .court * { font-family: ${family}, sans-serif !important; }`;
          document.head.append(style);
        });
      }, face.family);
    }
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}${trackerPath()}`);
    const c = court(page);
    await c.open();
    /** A player's tile tapped, then one of their options, by touch. */
    const play = async (side, jersey, act) => {
      const options = c.pad.locator(
        `[data-options="${await c.tile(side, jersey).getAttribute('data-player')}"]`,
      );
      if (!(await options.isVisible())) await c.tile(side, jersey).tap();
      await c.recorded(() => options.locator(`[data-act="${act}"]`).tap());
      await c.pad.locator('[data-rest]').waitFor();
    };
    /** What the screen says next holds `words`. */
    const said = (words) => c.said.filter({ hasText: words }).waitFor();
    const quiet = () => c.said.filter({ hasText: /./ }).waitFor({ state: 'hidden' });

    await step(`${at}: tip-off, three baskets and a foul by touch`, async () => {
      for (const jersey of starters) await c.tile('home', jersey).tap();
      for (const jersey of starters) await c.tile('away', jersey).tap();
      await page.locator('[data-scoring][data-stage="play"]').waitFor();
      // Before the first play Undo names the lineup it would take back, and Redo is greyed.
      note(
        `${at}: before the first basket Undo names the lineup it would take back; Redo is greyed`,
        (await c.undoButton.getAttribute('aria-label')).startsWith('Undo Bears starters: ') &&
          (await c.redoButton.getAttribute('aria-disabled')) === 'true' &&
          (await c.redoButton.getAttribute('aria-label')) === 'Redo: nothing to bring back',
        await c.undoButton.getAttribute('aria-label'),
      );
      await c.root.locator('[data-clock-toggle][data-state="start"]:not([data-resting])').tap();
      await c.root.locator('[data-clock-toggle][data-state="pause"]').waitFor();
      await play('home', 5, 'p2');
      await play('away', 3, 'p3');
      await play('home', 9, 'p2');
      await c.saved();
      note(
        `${at}: three baskets by touch`,
        JSON.stringify(await c.score()) === '{"home":4,"away":3}',
      );
      await rowFits(page, `${at}, in play`, '+2 #9 Pia');
      await still(page, `${at}, in play`);
      await accessible(page, `${at}, in play, the pad at rest`);
    });

    await step(`${at}: a wrong basket undone, and brought back`, async () => {
      await quiet();
      await play('away', 7, 'p3');
      note(
        `${at}: Undo names the wrong basket: shortest on the button, in full for a screen reader`,
        (await c.undoButton.getAttribute('aria-label')) === 'Undo #7 Uma Bearsley +3' &&
          (await c.undoNames()) === '#7 Uma Bearsley +3' &&
          (await c.undoButton.locator('.court-turn-short').textContent()) === '+3 #7 Uma',
        await c.undoButton.getAttribute('aria-label'),
      );
      await c.recorded(() => c.root.locator('[data-undo]:not([data-resting])').tap());
      await said(/^Undone: #7 Uma Bearsley \+3\.$/);
      note(
        `${at}: one tap on Undo took the basket back and said so`,
        JSON.stringify(await c.score()) === '{"home":4,"away":3}' &&
          (await c.points('away', 7)) === 0 &&
          (await c.undoButton.getAttribute('aria-label')) === 'Undo #9 Pia Hawkins +2' &&
          (await c.redoButton.getAttribute('aria-label')) === 'Redo #7 Uma Bearsley +3' &&
          (await c.redoButton.getAttribute('aria-disabled')) === null,
        JSON.stringify(await c.score()),
      );
      await still(page, `${at}, a basket undone`);
      await c.recorded(() => c.root.locator('[data-redo]:not([data-resting])').tap());
      await said(/^Brought back: #7 Uma Bearsley \+3\.$/);
      note(
        `${at}: Redo brought it back`,
        JSON.stringify(await c.score()) === '{"home":4,"away":6}' &&
          (await c.points('away', 7)) === 3 &&
          (await c.redoButton.getAttribute('aria-disabled')) === 'true',
        JSON.stringify(await c.score()),
      );
      // Greyed, Redo is still a thing to tap: it says why.
      await quiet();
      await finger(page, c.redoButton);
      await said(/^There is nothing to redo\.$/);
      note(
        `${at}: Redo tapped while greyed says why, and records nothing`,
        (await c.score()).away === 6,
      );
    });

    await step(`${at}: Undo with a player’s options open, and two fast taps on it`, async () => {
      await quiet();
      await c.saved();
      await c.tile('home', 5).tap();
      const options = c.pad.locator('[data-options]');
      await options.waitFor();
      const before = {
        p2: await rectOf(options.locator('[data-act="p2"]')),
        foul: await rectOf(options.locator('[data-act="foul"]')),
        undo: await rectOf(c.undoButton),
        redo: await rectOf(c.redoButton),
      };
      const others = await c.pad.locator('[data-options] button').evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        }),
      );
      const over = (a, b) =>
        a.left < b.right - 0.5 &&
        b.left < a.right - 0.5 &&
        a.top < b.bottom - 0.5 &&
        b.top < a.bottom - 0.5;
      note(
        `${at}: with a player’s options open Undo and Redo are on the screen, 44 x 44 or more, and lie over no option`,
        [before.undo, before.redo].every(
          (r) =>
            r.right - r.left >= 44 &&
            r.bottom - r.top >= 44 &&
            r.top >= 0 &&
            r.bottom <= size.height &&
            others.every((other) => !over(r, other)),
        ),
        JSON.stringify(before),
      );
      const plays = Number(await c.root.getAttribute('data-plays'));
      // Two real touches, as fast as a double tap: one play comes back, never two.
      const middle = {
        x: (before.undo.left + before.undo.right) / 2,
        y: (before.undo.top + before.undo.bottom) / 2,
      };
      await page.touchscreen.tap(middle.x, middle.y);
      await page.touchscreen.tap(middle.x, middle.y);
      await said(/^Undone: #7 Uma Bearsley \+3\.$/);
      await page.waitForTimeout(700);
      note(
        `${at}: two fast taps on Undo took one play back, not two`,
        Number(await c.root.getAttribute('data-plays')) === plays - 1 &&
          (await c.score()).away === 3,
        `${plays} plays before, ${await c.root.getAttribute('data-plays')} after`,
      );
      const after = {
        p2: await rectOf(options.locator('[data-act="p2"]')),
        foul: await rectOf(options.locator('[data-act="foul"]')),
      };
      const sentence = await rectOf(c.said);
      note(
        `${at}: the options stayed open and nothing in the pad moved; what Undo said is drawn over the player’s line, above +1, +2, +3`,
        (await options.isVisible()) &&
          JSON.stringify(after.p2) === JSON.stringify(before.p2) &&
          JSON.stringify(after.foul) === JSON.stringify(before.foul) &&
          sentence.bottom <= before.p2.top + 0.5,
        JSON.stringify({ before, after, sentence }),
      );
      await still(page, `${at}, Undo with options open`);
      // The next tap is the option that was there all along.
      await c.recorded(() => options.locator('[data-act="p2"]').tap());
      await c.pad.locator('[data-rest]').waitFor();
      note(`${at}: and the option tapped next was taken`, (await c.score()).home === 6);
    });

    await step(`${at}: a foul that stopped the clock, undone`, async () => {
      await quiet();
      await play('away', 5, 'foul');
      await c.startButton.waitFor();
      note(
        `${at}: the foul stopped the running clock`,
        (await c.toggle.getAttribute('data-state')) === 'start' && (await c.fouls('away', 5)) === 1,
      );
      await quiet();
      await c.recorded(() => c.root.locator('[data-undo]:not([data-resting])').tap());
      await said(
        /^Undone: Foul on #5 Tam Bearsley\. The clock stays stopped: start it when play goes on\.$/,
      );
      note(
        `${at}: the foul is taken back, the clock is still stopped and the screen says so`,
        (await c.fouls('away', 5)) === 0 && (await c.toggle.getAttribute('data-state')) === 'start',
      );
      await still(page, `${at}, a foul undone, the Start clock button offered`);
      await quiet();
      await c.startButton.tap();
      await c.root.locator('[data-clock-toggle][data-state="pause"]').waitFor();
    });

    await step(`${at}: the play log, with the network held back`, async () => {
      await c.saved();
      await context.setOffline(true);
      await play('home', 7, 'p1');
      await play('away', 9, 'turnover');
      await c.root.locator('[data-saved-banner][data-state="waiting"]').waitFor();
      const banner = (await c.banner.innerText()).trim().replace(/\s*\n\s*/g, ' · ');
      note(
        `${at}: with no connection the banner says so, and how many plays wait`,
        size.width < 700
          ? banner === 'No connection · 2 to send'
          : banner === 'No connection: plays are kept on this device · 2 plays waiting to send',
        banner,
      );
      await quiet();
      // The latest play's line, where the pad has it: it says the play is not sent yet.
      const hasLine = await c.latest.isVisible();
      note(
        `${at}: the latest play is ${size === tabletLying ? 'the first line of the log’s own panel under the pad' : 'the pad’s first line at rest'}`,
        size === tabletLying ? !hasLine && (await c.logPanel.isVisible()) : hasLine,
      );
      if (hasLine) {
        const line = (await c.latest.innerText()).replace(/\s+/g, ' ').trim();
        note(
          `${at}: the latest play’s line names the play and says it is not sent yet`,
          // (Its last words are a screen reader's: what the button does.)
          /^Not sent yet H1 \d+:\d\d \d+ plays Turnover by #9 Vic Bearsley Open the play log: \d+ plays · 2 not sent yet$/.test(
            line,
          ) &&
            (await c.latest
              .locator('[data-latest-play]')
              .evaluate((el) => el.scrollWidth <= el.clientWidth + 0.5)),
          line,
        );
      } else {
        const first = (await c.logPanel.locator('[data-play]').first().innerText())
          .replace(/\s+/g, ' ')
          .trim();
        note(
          `${at}: the panel’s first line names the play and says it is not sent yet`,
          /^H1 \d+:\d\d Turnover by #9 Vic Bearsley Not sent yet$/.test(first),
          first,
        );
      }
      await still(page, `${at}, plays waiting`);
      await c.openLog();
      await accessible(page, `${at}, the play log open`);
      const rows = await c.logRows.evaluateAll((els) =>
        els.map((el) => ({
          says: el.innerText.replace(/\s+/g, ' ').trim(),
          unsent: el.hasAttribute('data-unsent'),
          dim: Number(getComputedStyle(el.querySelector('.court-logged-text')).opacity),
        })),
      );
      const plays = Number(await c.root.getAttribute('data-plays'));
      const score = await c.score();
      note(
        `${at}: the log lists every play newest first, each with its period and clock, a basket with the score it made`,
        rows.length === plays &&
          rows.every((row) => /^H1 \d+:\d\d /.test(row.says)) &&
          /^H1 \d+:\d\d Turnover by #9 Vic Bearsley Not sent yet$/.test(rows[0].says) &&
          new RegExp(
            `^H1 \\d+:\\d\\d #7 Oz Hawkins \\+1 Not sent yet ${score.home}–${score.away}$`,
          ).test(rows[1].says) &&
          // The oldest: the stop clock set before tip-off, then the home team's starters.
          /^H1 20:00 Stop clock on$/.test(rows.at(-1).says) &&
          /^H1 20:00 Hawks starters: /.test(rows.at(-2).says),
        JSON.stringify(rows.slice(0, 3)),
      );
      note(
        `${at}: the two plays the league does not have are dimmed and say so in words; the others are not`,
        rows[0].unsent &&
          rows[1].unsent &&
          rows[0].dim < 1 &&
          rows[1].dim < 1 &&
          rows
            .slice(2)
            .every((row) => !row.unsent && row.dim === 1 && !/Not sent yet/.test(row.says)),
        JSON.stringify(rows.slice(0, 4)),
      );
      const title = (await c.logSheet.locator('h2').innerText()).replace(/\s+/g, ' ').trim();
      note(
        `${at}: its title counts the plays and those not sent yet`,
        title === `Play log ${plays} plays · 2 not sent yet`,
        title,
      );
      // The list scrolls inside the sheet; the page behind it does not.
      const sheet = await c.logSheet.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const list = el.querySelector('.court-log-rows');
        return {
          onScreen:
            r.top >= 0 &&
            r.bottom <= window.innerHeight + 0.5 &&
            r.right <= window.innerWidth + 0.5,
          sheetScrolls: el.scrollHeight - el.clientHeight,
          listInside: list.getBoundingClientRect().bottom <= r.bottom + 0.5,
          page: document.scrollingElement.scrollHeight - window.innerHeight,
        };
      });
      note(
        `${at}: the log is on the screen, its list scrolling inside it and nothing else`,
        sheet.onScreen && sheet.sheetScrolls <= 0 && sheet.listInside && sheet.page <= 0,
        JSON.stringify(sheet),
      );
      // Back on the network: the plays are sent, and the log marks none.
      await context.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await c.saved();
      await page.waitForFunction(
        () => document.querySelector('[data-play-log] [data-unsent]') === null,
      );
      const sent = (await c.logSheet.locator('h2').innerText()).replace(/\s+/g, ' ').trim();
      note(
        `${at}: with the network back the plays are sent, and the log marks none`,
        sent === `Play log ${plays} plays`,
        sent,
      );
      await c.closeLog();
      // Escape closes it too.
      await c.openLog();
      await page.keyboard.press('Escape');
      await c.root.locator('[data-play-log]').waitFor({ state: 'detached' });
      note(`${at}: × and Escape close the log`, true);
      await still(page, `${at}, the log closed`);
    });

    note(`${at}: nothing broke on the page`, errors.length === 0, errors.join('; '));
  } finally {
    await context?.close();
    server.child.kill();
  }
}

/**
 * The row under the scoreboard at all five sizes, in both faces, with a basket the play
 * Undo names: on one game, drawn in each face in turn.
 */
async function rowAtEverySize(browser, faces) {
  const origin = `http://localhost:${await freePort()}`;
  const server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  let context;
  try {
    await waitFor(`${origin}/`, server);
    await addPlayers(origin);
    context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies([{ ...scorekeeper, url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await page.goto(`${origin}${trackerPath()}`);
    const c = court(page);
    await c.open();
    await c.pick('home', starters);
    await c.pick('away', starters);
    // A two-figure number and a short name: the usual play.
    await c.play('home', 11, 'p3');
    await c.pad.locator('[data-rest]').waitFor();
    for (const face of faces) {
      for (const size of sizes) {
        await page.setViewportSize({ width: size.width, height: size.height });
        await drawIn(page, face.family);
        const label = `${size.width} x ${size.height}${face.letters}`;
        // In full where the row is the screen's width (a tablet upright), shortest elsewhere.
        const full = size.width >= 700 && size.width < 880 && size.height > 520;
        await rowFits(page, label, full ? '#11 Quin Hawkins +3' : '+3 #11 Quin');
        await still(page, `${label}, the clock stopped`);
      }
    }
    await drawIn(page, '');
  } finally {
    await context?.close();
    server.child.kill();
  }
}

let browser;
if (built) {
  await step('starting the browser', async () => {
    browser = await launch();
  });
}
if (browser) {
  // The two faces the fit is measured in (tracker-driver.mjs): where this device's own
  // letters are already as wide as the wider ones, the game is played once at each size.
  let faces = [{ letters: '', family: '' }];
  await step('measuring this device’s letters', async () => {
    const origin = `http://localhost:${await freePort()}`;
    const server = startNext(['start', '--port', new URL(origin).port], {
      APP_ENV: 'test',
      PUBLIC_BASE_URL: origin,
    });
    const context = await browser.newContext({ viewport: { width: 390, height: 664 } });
    try {
      await waitFor(`${origin}/`, server);
      await context.addCookies([{ ...scorekeeper, url: origin }]);
      const page = await context.newPage();
      await page.goto(`${origin}${trackerPath()}`);
      const c = court(page);
      await c.open();
      const { own, wider } = await lettersHere(page);
      if (wider >= own * 1.02)
        faces = [...faces, { letters: ', in wider letters', family: widerFace }];
      await c.leave();
    } finally {
      await context.close();
      server.child.kill();
    }
  });
  for (const face of faces) {
    for (const size of [phoneInBrowser, tabletLying]) {
      await step(`${size.width} x ${size.height}${face.letters}: the short game`, () =>
        shortGame(browser, size, face),
      );
    }
  }
  await step('the row under the scoreboard at every size', () => rowAtEverySize(browser, faces));
}

await browser?.close();

if (failures.length > 0) {
  console.error(`Scoring plays browser test: ${failures.length} problem(s)`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`Scoring plays browser test passed: ${checked.length} checks.`);
