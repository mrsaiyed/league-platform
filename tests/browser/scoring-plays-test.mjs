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
//
// Then the game is ended, still by touch (thing 3 of step 2.37, part 1):
// - End game at a level score is refused on the device at once, with the network off,
//   in words that say what is still to play (S-73; overtime only once the last period
//   has run out level); nothing is asked.
// - End game from More in the middle of the second half asks first: the score, that time
//   is still on the clock, and what ending does. Two fast taps on End game ask once.
// - Ended with the network off, the final panel says who won and that the result is not
//   sent yet; a tile or Undo tapped says the game is final; "Take back End game" makes it
//   live again on the device alone, the clock stopped (S-72), and it is scored on.
// - Ended with the network on, the panel says it is saved and offers "Reopen game" with
//   the time left; a visitor's browser finds the public game page final with the score
//   and the win and the loss in the standings.
// - Reopen, after its question with the reason filled in, carries on in place with no
//   reload; the public page is live again and the standings no longer count the game; the
//   next basket is saved; End again, and the standings count it once.
// - Once (the short phone), the game waits the half minute until the league tells the
//   device the game is over: the screen stays with its final panel, and reopens from it.
// - The try-out night, on a world of its own: a basket, Mark not started refused in
//   words that say to undo it first, Undo, Mark not started, and the lineups again on the
//   same screen, with a visitor seeing the game scheduled.
// - Every panel (the questions, the final panel not sent and saved, End game offered in
//   the pad at 0:00) at all five sizes in both faces: nothing scrolls, both fives whole,
//   the answers 44 x 44 or more in the pad's lowest band, nothing it says cut.
import {
  addPlayers,
  court,
  drawIn,
  keepStatistics,
  league,
  lettersHere,
  owner,
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

// A made-up world of its own for each game: up to a dozen servers in turn, each of which
// is told when this run ends (web-browser-kit.mjs). Node warns past ten such listeners.
process.setMaxListeners(32);

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

/** What a part of the screen says, on one line. */
const words = (text) => text.replace(/\s+/g, ' ').trim();

/** The sentence the screen is saying, as drawn: each form, whether shown, and its lines. */
const saidDrawn = (page) =>
  page.evaluate(() => {
    const p = document.querySelector('[data-say]');
    const long = p?.querySelector('.court-say-long');
    const short = p?.querySelector('.court-say-short');
    const shown = (el) =>
      el !== null && el !== undefined && getComputedStyle(el).display !== 'none'
        ? el.getBoundingClientRect().width > 1
        : false;
    const style = p === null ? null : getComputedStyle(p);
    const inner =
      p === null || style === null
        ? 0
        : p.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    return {
      long: long?.textContent ?? '',
      short: short?.textContent ?? '',
      longShown: shown(long),
      shortShown: shown(short),
      shortHidden: short?.getAttribute('aria-hidden') === 'true',
      lines: style === null ? 0 : Math.round(inner / parseFloat(style.lineHeight)),
    };
  });

/**
 * A long sentence fits (the two the first design lead named: after undoing a foul that
 * had stopped the clock, and after undoing a substitution). On the phone a scorekeeper
 * holds it is said shorter, in one line, with the full sentence kept out of sight for a
 * screen reader; where the pad has the room (a tablet) the full sentence is shown. And
 * with the phone turned on its side, where the pad is narrowest, the short form is what
 * shows, in two lines at the most.
 */
async function sentenceFits(page, size, at, said) {
  const drawn = await saidDrawn(page);
  const both = drawn.long === said.text && drawn.short === said.short && drawn.shortHidden;
  const roomless = size.width < 700;
  note(
    roomless
      ? `${at}: short of room, “${said.short}” is one line and the full sentence is kept out of sight for a screen reader`
      : `${at}: with room, the full sentence “${said.text}” is shown`,
    both &&
      (roomless
        ? drawn.shortShown && !drawn.longShown && drawn.lines === 1
        : drawn.longShown && !drawn.shortShown),
    JSON.stringify(drawn),
  );
  if (!roomless) return;
  const [, lying] = sizes;
  await page.setViewportSize({ width: lying.width, height: lying.height });
  await twoFrames(page);
  const turned = await saidDrawn(page);
  await page.setViewportSize({ width: size.width, height: size.height });
  await twoFrames(page);
  note(
    `${at}, the phone turned on its side: “${said.short}” is what shows, in two lines at the most`,
    turned.short === said.short && turned.shortShown && !turned.longShown && turned.lines <= 2,
    JSON.stringify(turned),
  );
}

/** A team's record in the standings ("3-1") with a win more, or a loss more. */
const won = (record) => record.replace(/^(\d+)-/, (_, wins) => `${Number(wins) + 1}-`);
const lost = (record) => record.replace(/-(\d+)$/, (_, losses) => `-${Number(losses) + 1}`);

/**
 * What a visitor sees of the game and in the standings, in a browser of its own, signed
 * in as nobody: the public game page's state and its two scores (the away team first, as
 * the page's board has them), and each team's wins and losses.
 */
async function publicResult(browser, origin, watch) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await page.goto(watch);
    const game = page.locator('[data-live-status]').first();
    await game.waitFor();
    const status = await game.getAttribute('data-live-status');
    const scores = (
      await page.locator('.ui-scoreboard .ui-scoreboard-score').allTextContents()
    ).map((score) => score.trim());
    await page.goto(`${origin}/${league}/standings`);
    const record = async (team) => {
      const table = page.locator('table.ui-standings', { hasText: team }).first();
      const heads = (await table.locator('thead th').allInnerTexts()).map((cell) => cell.trim());
      const cells = (
        await table.locator('tbody tr', { hasText: team }).first().locator('th, td').allInnerTexts()
      ).map((cell) => cell.trim());
      return `${cells[heads.indexOf('W')]}-${cells[heads.indexOf('L')]}`;
    };
    return {
      status,
      scores: scores.join('–'),
      hawks: await record('Hawks'),
      bears: await record('Bears'),
    };
  } finally {
    await context.close();
  }
}

/**
 * A panel of the pad about ending the game (a question, the final panel) fits (DESIGN.md
 * section 7, lines 6 and 8): its answers are in the pad's lowest band, each 44 x 44 or
 * more, 8 or more apart and whole; nothing it says is cut, hidden or under the answers;
 * the pad itself has nothing to scroll to; and a field is 16 or larger, so no phone
 * zooms into it, and 44 high.
 */
async function panelFits(page, label) {
  await twoFrames(page);
  const seen = await page.evaluate(() => {
    const pad = document.querySelector('[data-pad]');
    const box = pad.getBoundingClientRect();
    const band = pad.querySelector('[data-ask-answers], [data-final-actions]');
    if (band === null) return null;
    const bandBox = band.getBoundingClientRect();
    const inside = (r, o) =>
      r.left >= o.left - 0.5 &&
      r.right <= o.right + 0.5 &&
      r.top >= o.top - 0.5 &&
      r.bottom <= o.bottom + 0.5;
    const buttons = [...band.querySelectorAll('button, a')].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        says: el.textContent.trim(),
        left: r.left,
        right: r.right,
        width: r.width,
        height: r.height,
        cut: el.scrollWidth > el.clientWidth + 0.5 || el.scrollHeight > el.clientHeight + 0.5,
        outside: !inside(r, box),
      };
    });
    const said = [
      ...pad.querySelectorAll(
        '.court-ask-title, .court-ask-text > *, .court-final-result > *, .court-final-state > *, .court-ask-field-label',
      ),
    ];
    const notWhole = said
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.width === 0 ||
          !inside(r, el.parentElement.getBoundingClientRect()) ||
          !inside(r, box) ||
          r.bottom > bandBox.top + 0.5 ||
          el.scrollWidth > el.clientWidth + 0.5
        );
      })
      .map((el) => el.textContent.trim().slice(0, 50));
    const field = pad.querySelector('.court-input');
    return {
      padScrolls: pad.scrollHeight - pad.clientHeight,
      bandFromBottom: box.bottom - bandBox.bottom,
      buttons,
      notWhole,
      field:
        field === null
          ? null
          : {
              size: Number.parseFloat(getComputedStyle(field).fontSize),
              height: field.getBoundingClientRect().height,
              outside: !inside(field.getBoundingClientRect(), box),
            },
    };
  });
  if (seen === null) {
    note(`${label}: fits in the pad`, false, 'the pad holds no such panel');
    return;
  }
  const gaps = seen.buttons.slice(1).map((button, i) => button.left - seen.buttons[i].right);
  note(
    `${label}: its answers are in the pad’s lowest band, each 44 x 44 or more, 8 or more apart and whole`,
    seen.buttons.length >= 1 &&
      seen.bandFromBottom >= 0 &&
      seen.bandFromBottom <= 24 &&
      seen.buttons.every((b) => b.width >= 44 && b.height >= 44 && !b.cut && !b.outside) &&
      gaps.every((gap) => gap >= 7.5),
    JSON.stringify({ fromBottom: seen.bandFromBottom, gaps, buttons: seen.buttons }),
  );
  note(
    `${label}: everything it says is whole, over its answers, and the pad has nothing to scroll to`,
    seen.notWhole.length === 0 && seen.padScrolls <= 0,
    JSON.stringify({ notWhole: seen.notWhole, padScrolls: seen.padScrolls }),
  );
  if (seen.field !== null) {
    note(
      `${label}: its field is 16 or larger (no phone zooms into it), 44 high, and in the pad`,
      seen.field.size >= 16 && seen.field.height >= 44 && !seen.field.outside,
      JSON.stringify(seen.field),
    );
  }
}

/**
 * One short game by touch, at `size` in the letters of `face`, on a made-up world of its
 * own (a server started for it and stopped after it). `afterRenewal`: the game then waits
 * about half a minute, until the league has told the device that the game is over.
 */
async function shortGame(browser, size, face, { afterRenewal = false } = {}) {
  const at = `${size.width} x ${size.height}${face.letters}`;
  const origin = `http://localhost:${await freePort()}`;
  const server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  let context;
  // Every renewal of the hold once the last End is about to be tapped (`afterRenewal`).
  const renewals = [];
  const isRenewal = (request) => request.url().endsWith('/session') && request.method() === 'POST';
  let endSavedAt = Number.POSITIVE_INFINITY;
  try {
    await waitFor(`${origin}/`, server);
    await addPlayers(origin);
    await stopClockGame(origin);
    // The game taps a turnover: its season keeps them (S-93, S-107; step 2.241).
    await keepStatistics(browser, origin);
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
      // The sentence has a short form for a phone short of room (as the sentence after a
      // set clock, step 2.189): the full one is first in the page, for a screen reader.
      await said(
        /^Undone: Foul on #5 Tam Bearsley\. The clock stays stopped: start it when play goes on\./,
      );
      await sentenceFits(page, size, at, {
        text: 'Undone: Foul on #5 Tam Bearsley. The clock stays stopped: start it when play goes on.',
        short: 'Foul #5 Tam undone · clock stopped',
      });
      note(
        `${at}: the foul is taken back, the clock is still stopped and the screen says so`,
        (await c.fouls('away', 5)) === 0 && (await c.toggle.getAttribute('data-state')) === 'start',
      );
      await still(page, `${at}, a foul undone, the Start clock button offered`);
      await quiet();
      await c.startButton.tap();
      await c.root.locator('[data-clock-toggle][data-state="pause"]').waitFor();
    });

    await step(`${at}: a substitution undone`, async () => {
      // #13 comes in for #3 by "Sub in" (a short phone's bench is folded away), and Undo
      // puts them back: the screen says who is where now.
      await c.tile('home', 3).tap();
      const options = c.pad.locator('[data-options]');
      await options.waitFor();
      await c.recorded(() => options.locator('[data-act="sub"]').first().tap());
      await c.pad.locator('[data-rest]').waitFor();
      note(
        `${at}: #13 came in for #3`,
        (await c.onCourt('home', 13)) && !(await c.onCourt('home', 3)),
      );
      await quiet();
      await c.recorded(() => c.root.locator('[data-undo]:not([data-resting])').tap());
      await said(
        /^Undone: #3 Max Hawkins is back on the court and #13 Ray Hawkins is on the bench\./,
      );
      await sentenceFits(page, size, at, {
        text: 'Undone: #3 Max Hawkins is back on the court and #13 Ray Hawkins is on the bench.',
        short: '#3 Max back on · #13 Ray off',
      });
      note(
        `${at}: the substitution is taken back: #3 is on the court again and #13 on the bench`,
        (await c.onCourt('home', 3)) && !(await c.onCourt('home', 13)),
      );
      await still(page, `${at}, a substitution undone`);
      await quiet();
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

    // --- Ending the game (thing 3 of step 2.37, part 1). ---
    /** More opened and one of its buttons tapped, by touch: More closes with the tap. */
    const fromMore = async (which) => {
      await c.more.tap();
      await c.sheet.waitFor();
      await c.sheet.locator(`[data-${which}]`).tap();
      await c.sheet.waitFor({ state: 'detached' });
    };
    const online = async (on) => {
      await context.setOffline(!on);
      if (on) await page.evaluate(() => window.dispatchEvent(new Event('online')));
      else await c.banner.filter({ hasText: /No connection/ }).waitFor();
    };
    const playsNow = async () => Number(await c.root.getAttribute('data-plays'));
    const padMode = () => c.root.getAttribute('data-pad-mode');
    /** The league's public page of this game, and the standings before any End. */
    let watch = '';
    let before = null;
    const visitor = () => publicResult(browser, origin, watch);

    await step(`${at}: End game at a level score, with no connection`, async () => {
      await quiet();
      await c.more.tap();
      await c.sheet.waitFor();
      const items = await c.sheet
        .locator('.court-sheet-item')
        .evaluateAll((els) => els.map((el) => el.querySelector('button, a').textContent.trim()));
      note(
        `${at}: behind More, End game comes first and Mark not started is there while the game is live`,
        items[0] === 'End game' && items.includes('Mark not started'),
        items.join(' | '),
      );
      watch = new URL(
        await c.sheet.getByRole('link', { name: 'Open the public game page' }).getAttribute('href'),
        origin,
      ).href;
      await c.sheet.locator('.court-close').tap();
      await c.sheet.waitFor({ state: 'detached' });
      before = await visitor();
      note(
        `${at}: before the End a visitor sees the game live`,
        before.status === 'live',
        JSON.stringify(before),
      );
      await play('away', 3, 'p3');
      await play('away', 3, 'p1');
      await c.saved();
      note(`${at}: the score is level`, JSON.stringify(await c.score()) === '{"home":7,"away":7}');
      await quiet();
      await online(false);
      const plays = await playsNow();
      await fromMore('more-end');
      await c.endRefused.waitFor();
      const says = words(await c.endRefused.innerText());
      note(
        `${at}: End game at a level score in the first half is refused on the device at once, with no connection, in words that say what is still to play, not overtime (the fix round's F3); nothing is asked`,
        /^The score is level Hawks 7, Bears 7 This season allows no ties, so a level game cannot end\. (H1 still has \d{1,2}:\d\d to play|H1 is over, and H2 is still to play)\. Keep playing$/.test(
          says,
        ) &&
          (await c.pad.locator('[data-answer="yes"]').count()) === 0 &&
          (await playsNow()) === plays &&
          (await c.finalPanel.count()) === 0,
        says,
      );
      await panelFits(page, `${at}, End game refused at a level score`);
      await still(page, `${at}, End game refused at a level score`);
      await accessible(page, `${at}, End game refused at a level score`);
      await c.answer('no').tap();
      await c.pad.locator('[data-rest]').waitFor();
      await online(true);
      await c.saved();
    });

    await step(`${at}: End game in the middle of the second half asks first`, async () => {
      await play('home', 5, 'p2');
      await c.pickPeriod(2);
      await c.root.locator('[data-clock-toggle][data-state="start"]:not([data-resting])').tap();
      await c.root.locator('[data-clock-toggle][data-state="pause"]').waitFor();
      await c.saved();
      const plays = await playsNow();
      // Two fast taps on End game, as a scorekeeper double-taps: asked once, and the
      // second tap is taken nowhere (under the button lie the clock and a team's chips).
      await c.more.tap();
      await c.sheet.waitFor();
      const button = await rectOf(c.sheet.locator('[data-more-end]'));
      const middle = { x: (button.left + button.right) / 2, y: (button.top + button.bottom) / 2 };
      await page.touchscreen.tap(middle.x, middle.y);
      await page.touchscreen.tap(middle.x, middle.y);
      await c.endAsk.waitFor();
      await page.waitForTimeout(500);
      note(
        `${at}: two fast taps on End game ask once: the question stands, and nothing that lay under the button was opened`,
        (await padMode()) === 'end' &&
          (await c.endAsk.isVisible()) &&
          !(await c.clockSheet.isVisible()) &&
          !(await c.sheet.isVisible()),
        `the pad shows ${await padMode()}`,
      );
      const asks = words(await c.endAsk.innerText());
      note(
        `${at}: the question says the score, that time is still on the clock and in which period, and what ending does`,
        /^End the game\? Hawks 9, Bears 7 H2 still has (19|20):\d\d on the clock\. This becomes the final score and goes into the standings\. A game ended by mistake can be reopened\. Keep playing End game$/.test(
          asks,
        ),
        asks,
      );
      // The clock is not stopped by asking: the time in the question ticks with it.
      const first = await c.endAsk.locator('[data-clock-now]').textContent();
      await page.waitForTimeout(1200);
      const [second, board] = [
        await c.endAsk.locator('[data-clock-now]').textContent(),
        await c.clockText(),
      ];
      note(
        `${at}: the time in the question ticks with the game clock`,
        first !== second && second === board,
        `${first} then ${second}, the clock ${board}`,
      );
      await panelFits(page, `${at}, the End game question`);
      await still(page, `${at}, the End game question`);
      await accessible(page, `${at}, the End game question`);
      await c.answer('no').tap();
      await c.pad.locator('[data-rest]').waitFor();
      note(
        `${at}: “Keep playing” ends nothing: the game is live with every play`,
        (await playsNow()) === plays && (await c.toggle.getAttribute('data-state')) === 'pause',
      );
    });

    await step(`${at}: End game with the network off, then “Take back End game”`, async () => {
      await online(false);
      await fromMore('more-end');
      await c.endAsk.waitFor();
      await c.answer('yes').tap();
      await c.pad.locator('[data-final="not-sent"]').waitFor();
      const panel = words(await c.finalPanel.innerText());
      note(
        `${at}: ended with no connection, the final panel says who won with the score, and that the result is not sent yet`,
        /^final Hawks won, 9–7 Not sent yet\. The league gets the result once the connection is back\. Until then End game can be taken back here\. Take back End game Back to the games$/i.test(
          panel,
        ),
        panel,
      );
      const banner = (await c.banner.innerText()).trim().replace(/\s*\n\s*/g, ' · ');
      note(
        `${at}: the banner says there is no connection and that a play waits`,
        size.width < 700
          ? banner === 'No connection · 1 to send'
          : banner === 'No connection: plays are kept on this device · 1 play waiting to send',
        banner,
      );
      // A final game takes no play: a tile and Undo each say so (checklist D12, J4).
      await c.tile('home', 5).tap();
      await said(/^This game is final\. Reopen it to make changes\.$/);
      note(
        `${at}: a player tapped on a final game says it is final, and the final panel stays`,
        (await padMode()) === 'final' && (await c.pad.locator('[data-options]').count()) === 0,
      );
      await quiet();
      await finger(page, c.undoButton);
      await said(/^This game is final\. Reopen it to make changes\.$/);
      note(
        `${at}: on a final game the clock, Start and the timeouts are switched off, and Undo and Redo are greyed`,
        (await c.clock.isDisabled()) &&
          (await c.toggle.isDisabled()) &&
          (await c.timeoutsButton.isDisabled()) &&
          (await c.undoButton.getAttribute('aria-disabled')) === 'true' &&
          (await c.redoButton.getAttribute('aria-disabled')) === 'true',
      );
      await quiet();
      await panelFits(page, `${at}, the final panel not sent`);
      await still(page, `${at}, the final panel not sent`);
      await accessible(page, `${at}, the final panel not sent`);
      // Leaving while the result waits asks first (the fix round's F1): what waits is sent
      // only from this screen. "Stay here" keeps it.
      const address = page.url();
      await c.finalButton('final-back').tap();
      const leaveAsk = c.pad.locator('[data-leave-ask]');
      await leaveAsk.waitFor();
      const asked = words(await leaveAsk.innerText());
      note(
        `${at}: “Back to the games” with the result not sent asks first, in plain words, and does not leave`,
        asked ===
          'Not sent yet The result is not sent yet. Stay on this screen until it says “Saved”. If you leave, it stays on this device and is sent only when this game’s scoring screen is opened on it again. Leave anyway Stay here' &&
          page.url() === address,
        asked,
      );
      await panelFits(page, `${at}, the question before leaving`);
      await still(page, `${at}, the question before leaving`);
      await accessible(page, `${at}, the question before leaving`);
      await c.answer('no').tap();
      await c.pad.locator('[data-final="not-sent"]').waitFor();
      note(
        `${at}: “Stay here” keeps the scoring screen, with the final panel`,
        page.url() === address && (await padMode()) === 'final',
      );
      // Taken back on the device alone: no reason asked, no signal needed.
      await c.finalButton('take-back').tap();
      await said(/^End game taken back\. The game is live; the clock is stopped\.$/);
      await c.pad.locator('[data-rest]').waitFor();
      note(
        `${at}: “Take back End game” with the network off: the game is live again with its score, the clock stopped where the End found it`,
        (await c.finalPanel.count()) === 0 &&
          (await c.toggle.getAttribute('data-state')) === 'start' &&
          JSON.stringify(await c.score()) === '{"home":9,"away":7}' &&
          (await c.undoButton.getAttribute('aria-disabled')) === null,
        JSON.stringify(await c.score()),
      );
      await still(page, `${at}, the End taken back`);
      // And it is scored on, still with no connection.
      await quiet();
      await play('home', 7, 'p2');
      await online(true);
      await c.saved();
      const seen = await visitor();
      note(
        `${at}: the End that was taken back never reached the league: a visitor sees the game live at 11 to 7, and the standings as before`,
        seen.status === 'live' &&
          seen.scores === '7–11' &&
          seen.hawks === before.hawks &&
          seen.bears === before.bears,
        JSON.stringify(seen),
      );
    });

    await step(
      `${at}: End game, saved: the final panel, the public page and the standings`,
      async () => {
        await quiet();
        await fromMore('more-end');
        await c.endAsk.waitFor();
        await c.answer('yes').tap();
        await c.pad.locator('[data-final="saved"]').waitFor();
        await c.pad
          .locator('[data-reopen-line]')
          .filter({ hasText: /minute/ })
          .waitFor();
        const panel = words(await c.finalPanel.innerText());
        note(
          `${at}: the final panel says who won with the score, that it is saved, and “Reopen game” with the time left`,
          /^final Hawks won, 11–7 Saved\. It counts in the standings\. You can reopen it for (30|29) more minutes\. Reopen game Back to the games$/i.test(
            panel,
          ),
          panel,
        );
        await c.saved();
        await panelFits(page, `${at}, the final panel saved`);
        await still(page, `${at}, the final panel saved`);
        await accessible(page, `${at}, the final panel saved`);
        const seen = await visitor();
        note(
          `${at}: after the End the game’s public page says final, 11 to 7`,
          seen.status === 'final' && seen.scores === '7–11',
          JSON.stringify(seen),
        );
        note(
          `${at}: after the End the standings count it: a win for the Hawks, a loss for the Bears`,
          seen.hawks === won(before.hawks) && seen.bears === lost(before.bears),
          `before ${JSON.stringify(before)}, after ${JSON.stringify(seen)}`,
        );
      },
    );

    await step(`${at}: Reopen carries on in place, and End again`, async () => {
      await page.evaluate(() => {
        window.sameScreenAsBefore = true;
      });
      await c.finalButton('reopen').tap();
      await c.reopenAsk.waitFor();
      const asks = words(await c.reopenAsk.innerText());
      const reason = c.reopenAsk.locator('[data-reopen-reason]');
      // The field starts empty, with the usual reason one tap beside it (the fix round, F6).
      note(
        `${at}: the Reopen question says what reopening does, with an empty reason field and “By mistake” beside it`,
        asks ===
          'Reopen this game? It goes back to live with every play as it was, and stops counting in the standings until it is ended again. Why (kept with the game, never shown publicly) By mistake Keep it final Reopen the game' &&
          (await reason.inputValue()) === '',
        `${asks} / ${await reason.inputValue()}`,
      );
      await c.reopenAsk.locator('[data-reopen-mistake]').tap();
      note(
        `${at}: “By mistake” fills in the reason in one tap`,
        (await reason.inputValue()) === 'End game tapped by mistake',
        await reason.inputValue(),
      );
      // Its label is whole above the field, and the field stands 8 or more above the answers.
      const [label, field, chip, answers] = [
        await rectOf(c.reopenAsk.locator('.court-ask-field-label')),
        await rectOf(reason),
        await rectOf(c.reopenAsk.locator('[data-reopen-mistake]')),
        await rectOf(c.reopenAsk.locator('[data-ask-answers]')),
      ];
      note(
        `${at}: the reason's label is not cut by its field, the field and “By mistake” are 44 high, 8 apart and 8 or more above the answers`,
        label.bottom <= field.top &&
          field.bottom - field.top >= 44 &&
          chip.bottom - chip.top >= 44 &&
          chip.left - field.right >= 8 &&
          answers.top - field.bottom >= 8,
        JSON.stringify({ label, field, chip, answers }),
      );
      await panelFits(page, `${at}, the Reopen question`);
      await still(page, `${at}, the Reopen question`);
      await accessible(page, `${at}, the Reopen question`);
      await c.answer('yes').tap();
      await said(/^The game is live again\. Carry on scoring\.$/);
      await c.pad.locator('[data-rest]').waitFor();
      note(
        `${at}: reopened, the same screen carries on with no reload: live, its score kept, the clock stopped`,
        (await page.evaluate(() => window.sameScreenAsBefore === true)) &&
          (await c.finalPanel.count()) === 0 &&
          (await c.toggle.getAttribute('data-state')) === 'start' &&
          JSON.stringify(await c.score()) === '{"home":11,"away":7}',
        JSON.stringify(await c.score()),
      );
      await still(page, `${at}, reopened`);
      // Step 2.159 (S-47): a visitor sees the result as it stood, 7 to 11, held while it is
      // corrected (game-states-test reads its "Being corrected"), and the standings no
      // longer count it (S-101).
      const live = await visitor();
      note(
        `${at}: reopened, a visitor sees the result as it stood and the standings no longer count it`,
        live.status === 'final' &&
          live.scores === '7–11' &&
          live.hawks === before.hawks &&
          live.bears === before.bears,
        JSON.stringify(live),
      );
      // The next basket is taken and saved.
      await quiet();
      await play('home', 9, 'p2');
      await c.saved();
      note(
        `${at}: and the next basket is saved`,
        JSON.stringify(await c.score()) === '{"home":13,"away":7}',
      );
      await quiet();
      // Every renewal of the hold is noted from here: since T-295 the first one after the
      // End is saved comes within five seconds, and may be gone before the step that
      // waits for it begins (the screen then stops renewing, the game being over).
      if (afterRenewal) {
        page.on('request', (request) => {
          if (isRenewal(request)) renewals.push({ request, at: Date.now() });
        });
      }
      await fromMore('more-end');
      await c.endAsk.waitFor();
      await c.answer('yes').tap();
      await c.pad.locator('[data-final="saved"]').waitFor();
      endSavedAt = Date.now();
      await c.saved();
      const again = await visitor();
      note(
        `${at}: ended again, the public page says final at 13 to 7 and the standings count it once`,
        again.status === 'final' &&
          again.scores === '7–13' &&
          again.hawks === won(before.hawks) &&
          again.bears === lost(before.bears),
        JSON.stringify(again),
      );
      const more = await (async () => {
        await c.more.tap();
        await c.sheet.waitFor();
        const items = await c.sheet
          .locator('.court-sheet-item')
          .evaluateAll((els) => els.map((el) => el.querySelector('button, a').textContent.trim()));
        await c.sheet.locator('.court-close').tap();
        await c.sheet.waitFor({ state: 'detached' });
        return items;
      })();
      note(
        `${at}: on a final game More offers neither End game nor Mark not started`,
        !more.includes('End game') && !more.includes('Mark not started'),
        more.join(' | '),
      );
    });

    if (afterRenewal) {
      await step(`${at}: the screen stays once the league says the game is over`, async () => {
        // Within five seconds of an End being saved (T-295) the device renews its hold on
        // the game and is told the game is over: the page used to swap the scoring screen
        // for a card that says so.
        const sent = renewals.find((renewal) => renewal.at >= endSavedAt)?.request;
        const told = sent ?? (await page.waitForRequest(isRenewal, { timeout: 90_000 }));
        await told.response();
        await page.waitForTimeout(1500);
        const panel = words(await c.finalPanel.innerText());
        note(
          `${at}: after the device is told the game is over the scoring screen stays, with its final panel and no notice above it`,
          /^final Hawks won, 13–7 Saved\./i.test(panel) &&
            (await c.root.locator('.court-notices').count()) === 0 &&
            (await page.locator('.court-opening').count()) === 0,
          panel,
        );
        await still(page, `${at}, the final panel after the league’s word`);
        await c.tile('away', 3).tap();
        await said(/^This game is final\. Reopen it to make changes\.$/);
        // Reopened from there, it scores again with no reload.
        await quiet();
        await c.finalButton('reopen').tap();
        await c.reopenAsk.waitFor();
        // The reason starts empty: "By mistake" gives it in one tap (the fix round, F6).
        await c.reopenAsk.locator('[data-reopen-mistake]').tap();
        await c.answer('yes').tap();
        await said(/^The game is live again\. Carry on scoring\.$/);
        await quiet();
        await play('away', 5, 'p2');
        await c.saved();
        note(
          `${at}: reopened after that, the same screen scores again and the basket is saved`,
          (await page.evaluate(() => window.sameScreenAsBefore === true)) &&
            JSON.stringify(await c.score()) === '{"home":13,"away":9}',
          JSON.stringify(await c.score()),
        );
      });
    }

    note(`${at}: nothing broke on the page`, errors.length === 0, errors.join('; '));
  } finally {
    await context?.close();
    server.child.kill();
  }
}

/**
 * A made-up world of its own: a server started for it, players added, stopped after
 * `run`. `as` is who opens the game: the scorekeeper, unless told otherwise.
 */
async function onItsOwnWorld(
  browser,
  viewport,
  run,
  { hasTouch = false, family = '', as = scorekeeper } = {},
) {
  const origin = `http://localhost:${await freePort()}`;
  const server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  let context;
  try {
    await waitFor(`${origin}/`, server);
    await addPlayers(origin);
    context = await browser.newContext({ viewport, hasTouch });
    await context.addCookies([{ ...as, url: origin }]);
    if (family !== '') {
      await context.addInitScript((face) => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.setAttribute('data-drawn-in', '');
          style.textContent = `.court, .court * { font-family: ${face}, sans-serif !important; }`;
          document.head.append(style);
        });
      }, family);
    }
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}${trackerPath()}`);
    const c = court(page);
    await c.open();
    await run({ origin, context, page, c, errors });
  } finally {
    await context?.close();
    server.child.kill();
  }
}

/**
 * The try-out night by touch (the review of the two doors): a game started only to try
 * the tracker, a basket, Mark not started refused in words that say to undo it first,
 * Undo, Mark not started, and the lineups picked again on the same screen. On the made-up
 * league's own format, since a game marked not started has its season's rules again.
 */
async function tryOut(browser, size, face) {
  const at = `${size.width} x ${size.height}${face.letters}, the try-out`;
  await onItsOwnWorld(
    browser,
    { width: size.width, height: size.height },
    async ({ origin, page, c, errors }) => {
      const said = (text) => c.said.filter({ hasText: text }).waitFor();
      const quiet = () => c.said.filter({ hasText: /./ }).waitFor({ state: 'hidden' });
      const fromMore = async (which) => {
        await c.more.tap();
        await c.sheet.waitFor();
        await c.sheet.locator(`[data-${which}]`).tap();
        await c.sheet.waitFor({ state: 'detached' });
      };
      const tipOff = async () => {
        for (const jersey of starters) await c.tile('home', jersey).tap();
        for (const jersey of starters) await c.tile('away', jersey).tap();
        await page.locator('[data-scoring][data-stage="play"]').waitFor();
        await c.root.locator('[data-clock-toggle][data-state="start"]:not([data-resting])').tap();
        await c.root.locator('[data-clock-toggle][data-state="pause"]').waitFor();
      };
      const basket = async () => {
        await c.tile('home', 5).tap();
        await c.recorded(() => c.pad.locator('[data-options] [data-act="p2"]').tap());
        await c.pad.locator('[data-rest]').waitFor();
      };
      await tipOff();
      await basket();
      await c.saved();
      await c.more.tap();
      await c.sheet.waitFor();
      const watch = new URL(
        await c.sheet.getByRole('link', { name: 'Open the public game page' }).getAttribute('href'),
        origin,
      ).href;
      await c.sheet.locator('[data-more-not-started]').tap();
      await c.notStartedAsk.waitFor();
      const refused = words(await c.notStartedAsk.innerText());
      note(
        `${at}: with a basket standing, Mark not started tells the scorekeeper to undo it first, and offers no “yes”`,
        refused ===
          'Mark this game as not started? 1 basket, foul or turnover is recorded. Undo it first, then mark the game not started. Keep scoring' &&
          (await c.pad.locator('[data-answer="yes"]').count()) === 0,
        refused,
      );
      await panelFits(page, `${at}, undo first`);
      await still(page, `${at}, undo first`);
      await accessible(page, `${at}, undo first`);
      await c.answer('no').tap();
      await c.pad.locator('[data-rest]').waitFor();
      await c.recorded(() => c.root.locator('[data-undo]:not([data-resting])').tap());
      await said(/^Undone: #5 Ned Hawkins \+2\.$/);
      await c.saved();
      await quiet();
      await page.evaluate(() => {
        window.sameScreenAsBefore = true;
      });
      await fromMore('more-not-started');
      await c.notStartedAsk.waitFor();
      const asks = words(await c.notStartedAsk.innerText());
      note(
        `${at}: the basket undone, Mark not started asks first and says what it clears`,
        asks ===
          'Mark this game as not started? Its score and every stat recorded for it are cleared, here and on the live page. It shows as scheduled again. Keep scoring Yes, mark not started',
        asks,
      );
      await panelFits(page, `${at}, the Mark not started question`);
      await still(page, `${at}, the Mark not started question`);
      await accessible(page, `${at}, the Mark not started question`);
      const live = await publicResult(browser, origin, watch);
      await c.answer('yes').tap();
      await said(/^The game is scheduled again\. Nothing recorded in it counts\.$/);
      await page.locator('[data-scoring][data-stage="lineups"]').waitFor();
      const cleared = await publicResult(browser, origin, watch);
      note(
        `${at}: marked not started, the same screen asks for the lineups again with no reload, and a visitor sees the game scheduled`,
        (await page.evaluate(() => window.sameScreenAsBefore === true)) &&
          Number(await c.root.getAttribute('data-plays')) === 0 &&
          live.status === 'live' &&
          cleared.status === 'scheduled',
        JSON.stringify({ live: live.status, cleared: cleared.status }),
      );
      // The game is then played for real: lineups, tip-off, and a basket that is saved.
      await quiet();
      await tipOff();
      await basket();
      await c.saved();
      note(
        `${at}: and the game is then scored from its start: lineups again, a basket saved`,
        JSON.stringify(await c.score()) === '{"home":2,"away":0}',
        JSON.stringify(await c.score()),
      );
      note(`${at}: nothing broke on the page`, errors.length === 0, errors.join('; '));
    },
    { hasTouch: true, family: face.family },
  );
}

/**
 * Every panel about ending a game at all five sizes, in both faces: on one game, brought
 * to each state in turn and drawn in each face at each size. Nothing scrolls, both fives
 * are whole, and the panel fits its pad.
 */
async function endAtEverySize(browser, faces) {
  await onItsOwnWorld(browser, { width: 390, height: 844 }, async ({ context, page, c }) => {
    const everywhere = async (state) => {
      for (const face of faces) {
        for (const size of sizes) {
          await page.setViewportSize({ width: size.width, height: size.height });
          await drawIn(page, face.family);
          const label = `${size.width} x ${size.height}${face.letters}, ${state}`;
          await panelFits(page, label);
          await still(page, label);
        }
      }
      await drawIn(page, '');
      await page.setViewportSize({ width: 390, height: 844 });
    };
    await c.pick('home', starters);
    await c.pick('away', starters);
    await c.startClock();
    await c.play('home', 11, 'p3');
    await c.saved();
    await c.fromMore('more-not-started');
    await c.notStartedAsk.waitFor();
    await everywhere('Mark not started, undo first');
    await c.answer('no').click();
    await c.play('away', 3, 'p3');
    await c.saved();
    await c.fromMore('more-end');
    await c.endRefused.waitFor();
    await everywhere('End game refused at a level score');
    await c.answer('no').click();
    await c.play('home', 5, 'p2');
    await c.fromMore('more-end');
    await c.endAsk.waitFor();
    await everywhere('the End game question, time still on the clock');
    await context.setOffline(true);
    await c.banner.filter({ hasText: /No connection/ }).waitFor();
    await c.answer('yes').click();
    await c.pad.locator('[data-final="not-sent"]').waitFor();
    await everywhere('the final panel not sent');
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await c.pad.locator('[data-final="saved"]').waitFor();
    await c.pad
      .locator('[data-reopen-line]')
      .filter({ hasText: /minute/ })
      .waitFor();
    await everywhere('the final panel saved');
    await c.finalButton('reopen').click();
    await c.reopenAsk.waitFor();
    await everywhere('the Reopen question');
    // The reason starts empty: "By mistake" gives it in one tap (the fix round, F6).
    await c.reopenAsk.locator('[data-reopen-mistake]').click();
    await c.answer('yes').click();
    await c.said.filter({ hasText: /live again/ }).waitFor();
    // The last period run out with a team ahead: End game offered in the pad.
    await c.pickPeriod(2);
    await c.setClock('1');
    await c.startClock().catch(() => undefined);
    await c.endOffer.waitFor();
    const offer = words(await c.pad.locator('[data-end-offer]').innerText());
    note(
      'at 0:00 of the last period with a team ahead the pad offers End game, and says who leads',
      offer === 'End game H2 is over. Hawks lead 5–3: end the game once the score is right.',
      offer,
    );
    for (const face of faces) {
      for (const size of sizes) {
        await page.setViewportSize({ width: size.width, height: size.height });
        await drawIn(page, face.family);
        const label = `${size.width} x ${size.height}${face.letters}, End game offered in the pad`;
        const fits = await c.pad.locator('[data-end-offer]').evaluate((bar) => {
          const pad = bar.closest('[data-pad]').getBoundingClientRect();
          const button = bar.querySelector('[data-end-game]');
          const why = bar.querySelector('.court-start-why');
          const [b, w] = [button.getBoundingClientRect(), why.getBoundingClientRect()];
          return {
            height: b.height,
            width: b.width,
            buttonCut: button.scrollWidth > button.clientWidth + 0.5,
            whyInPad: w.bottom <= pad.bottom + 0.5 && w.right <= pad.right + 0.5,
          };
        });
        note(
          `${label}: the button is 44 or more high and whole, and the line that says who leads is in the pad`,
          fits.height >= 44 && fits.width >= 44 && !fits.buttonCut && fits.whyInPad,
          JSON.stringify(fits),
        );
        await still(page, label);
      }
    }
    await drawIn(page, '');
    await page.setViewportSize({ width: 390, height: 844 });
    // Offered, never done by itself: the tap asks.
    await c.endOffer.click();
    await c.endAsk.waitFor();
    const asks = words(await c.endAsk.innerText());
    note(
      'End game tapped in the pad asks first, and with the last period run out says nothing of time left',
      asks ===
        'End the game? Hawks 5, Bears 3 This becomes the final score and goes into the standings. A game ended by mistake can be reopened. Keep playing End game',
      asks,
    );
  });
  // The fullest panel of all is the Mark not started question as someone who may correct
  // games is asked it (the league's owner here): what is cleared, a reason from the list,
  // and the answer in red. And their final panel says Reopen is offered at any time.
  await onItsOwnWorld(
    browser,
    { width: 390, height: 844 },
    async ({ page, c }) => {
      const everywhere = async (state) => {
        for (const face of faces) {
          for (const size of sizes) {
            await page.setViewportSize({ width: size.width, height: size.height });
            await drawIn(page, face.family);
            const label = `${size.width} x ${size.height}${face.letters}, ${state}`;
            await panelFits(page, label);
            await still(page, label);
          }
        }
        await drawIn(page, '');
        await page.setViewportSize({ width: 390, height: 844 });
      };
      await c.pick('home', starters);
      await c.pick('away', starters);
      await c.startClock();
      await c.play('home', 11, 'p3');
      await c.play('away', 3, 'foul');
      await c.saved();
      await c.fromMore('more-not-started');
      await c.notStartedAsk.waitFor();
      const asks = words(await c.notStartedAsk.innerText());
      const reasons = await c.notStartedAsk
        .locator('[data-not-started-reason] option')
        .allInnerTexts();
      note(
        'someone who may correct games is told how many plays and what score Mark not started clears, and picks a reason from the fixed list',
        asks.startsWith(
          'Mark this game as not started? 2 plays and the score, Hawks 3, Bears 0, will be cleared. Why it needs clearing (kept in the log, never shown publicly)',
        ) &&
          asks.endsWith('Keep scoring Yes, mark not started') &&
          reasons.join(' | ') ===
            'Started by mistake | Only trying the tracker | Wrong game | Wrong game format | Another reason',
        `${asks} / ${reasons.join(' | ')}`,
      );
      await everywhere('Mark not started, what is cleared and why');
      await accessible(page, 'Mark not started, what is cleared and why');
      await c.answer('yes').click();
      await c.said.filter({ hasText: /scheduled again/ }).waitFor();
      note(
        'with the reason chosen the league clears the game: the lineups are asked for again',
        (await c.root.getAttribute('data-stage')) === 'lineups' &&
          Number(await c.root.getAttribute('data-plays')) === 0,
      );
      await c.pick('home', starters);
      await c.pick('away', starters);
      await c.startClock();
      await c.play('home', 11, 'p3');
      await c.endGame();
      await c.pad.locator('[data-final="saved"]').waitFor();
      await c.pad
        .locator('[data-reopen-line]')
        .filter({ hasText: /any time/ })
        .waitFor();
      const panel = words(await c.finalPanel.innerText());
      note(
        'for someone who may correct games the final panel says the game can be reopened at any time',
        /^final Hawks won, 3–0 Saved\. It counts in the standings\. You can reopen it at any time\. Reopen game Back to the games$/i.test(
          panel,
        ),
        panel,
      );
    },
    { as: owner },
  );
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
      // Once, at the phone a scorekeeper holds, the game waits until the league has told
      // the device that the game is over (about half a minute): the screen must stay.
      const afterRenewal = face === faces[0] && size === phoneInBrowser;
      await step(`${size.width} x ${size.height}${face.letters}: the short game`, () =>
        shortGame(browser, size, face, { afterRenewal }),
      );
      await step(`${size.width} x ${size.height}${face.letters}: the try-out night`, () =>
        tryOut(browser, size, face),
      );
    }
  }
  await step('the row under the scoreboard at every size', () => rowAtEverySize(browser, faces));
  await step('ending a game at every size', () => endAtEverySize(browser, faces));
}

await browser?.close();

if (failures.length > 0) {
  console.error(`Scoring plays browser test: ${failures.length} problem(s)`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`Scoring plays browser test passed: ${checked.length} checks.`);
