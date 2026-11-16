// Step 2.35: the scoring screen in a real browser, against the web app on its made-up
// stand-in (APP_ENV=test). Nothing leaves this computer; every team, game and person is
// made up. Builds the app first unless given --no-build (npm run test:web:browser builds
// it once in web-exit-test.mjs, then runs this with --no-build).
//
// - The scorekeeper starts where they start (the admin's home), taps "Score this game",
//   confirms the format and is on the scoring screen: a frame of its own, with no public
//   header, menu or footer, the title saying the two teams, the day and the time, and one
//   way out behind More.
// - Starters are picked by tapping, kept through a reload, and a short-handed team starts
//   with fewer than five.
// - On an upright phone (390 x 844) a basket, a foul and a substitution for EACH of both
//   teams' floor players are recorded with real taps at the place each thing is on the
//   screen, and nothing ever scrolls (checklist S6, finding H4). With twelve a side all
//   seven on each bench are whole in their line, and a drag scrolls nothing.
// - The same on the phone a scorekeeper really holds (390 x 664, what its browser shows):
//   a basket and a foul for each of the ten on the floor, and a substitution for each team
//   by "Sub in" and by the bench opened in the pad, nothing scrolling.
// - At 390 x 844, 844 x 390, 820 x 1180, 1180 x 820 and 390 x 664 nothing that can be
//   tapped during play is under 44 x 44 where it shows, the point buttons and floor tiles
//   are 56 or more on their short side, targets are at least 8 apart, and no player in a
//   line of players is cut: each is whole, or counted on the line's end tile.
// - The keyboard does what a tap does (S4); a wrong drag is explained; turnovers, team
//   turnovers, swap colors and the fouled-out mark; a refusal is said in a sentence.
// - Two fingers (two real touch points) on two tiles record nothing; one finger dragging a
//   bench player onto a floor player substitutes them.
// - With 500 taps waiting to send and the processor slowed four times, a tap is painted
//   within 100 ms 95 times in 100 (finding M6): a tapped player's tile is ringed, and an
//   option tapped marks the tile with what was tapped, before anything is saved. Each tap
//   is timed from the click (the finger lifting) to the frame that shows it, lasts as long
//   as a finger's (60 ms), and nothing is asked of the page between taps. One run of a
//   hundred plays is measured and judged; the figures are printed, with how long the
//   options and the count take to follow. And the tile counts a play only after the
//   device's own store has finished writing it (T-114): the store's writes are timed.
//   The clock runs through those hundred plays (step 2.36), and for three seconds after
//   them its ticking is seen to change the clock's own place and nothing of any tile.
// - Then the clock, periods, team fouls and timeouts of step 2.36, on the same game:
//   scoring-clock-steps.mjs says what they check.
// Accessibility checks on each state (T-186), and no sideways scrolling.
import { clockSteps } from './scoring-clock-steps.mjs';
import {
  addPlayers,
  court,
  evenMorePlayers,
  league,
  liveGame,
  scorekeeper,
  sizes,
  starters,
  trackerPath,
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

// Hawks v Lions tomorrow, recorded live, assigned to nobody (stand-in-games.ts): each
// team has its six players, for the lineups that are picked short-handed.
const otherGame = '01900000-0000-7000-8000-006a00000003';
const [phone, phoneLying, , tabletLying, phoneInBrowser] = sizes;
/** Where the bench strips are folded away and the bench is opened in the pad (court.css). */
const folded = (size) => size.width < 700 && size.height < 760 && size.height > size.width;
// The name the device's own store of waiting taps is kept under (indexeddb-queue-storage.ts).
const queueDatabase = 'srleagues-tracker-queue';
// And the name its opened games, with the starters picked so far, are kept under
// (indexeddb-opened-game-storage.ts).
const gamesDatabase = 'srleagues-tracker-games';
// The screen asks for the device's own face, and devices differ: GitHub's Linux machines
// draw wider letters than Windows does. `SCORING_TEST_FACE="Verdana"` (or any face this
// computer has) runs every measure here with the screen drawn in that face instead, to
// try the sizes with other letters before GitHub does. Off unless asked for.
const otherFace = process.env.SCORING_TEST_FACE ?? '';

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
    // The pages its first taps reach, as the made-up scorekeeper: the admin's home, the
    // tracker of the game it is reached from and the tracker of the game being played,
    // each drawn once before the browser starts, so no tap or speed check here meets a
    // page drawn cold (the kit's waitFor, step 2.175). Drawing a tracker takes no session.
    const keeper = `${scorekeeper.name}=${scorekeeper.value}`;
    await waitFor(`${origin}/`, server, [
      { address: `/${league}/admin`, cookie: keeper },
      { address: trackerPath(otherGame), cookie: keeper },
      { address: trackerPath(), cookie: keeper },
    ]);
    // Twelve players a side, as on a real game night.
    await addPlayers(origin);
    browser = await launch();
  });
}

async function scorekeeperAt(size, options = {}) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    ...options,
  });
  await context.addCookies([{ ...scorekeeper, url: origin }]);
  if (otherFace) {
    await context.addInitScript((face) => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = `.court, .court * { font-family: ${face}, sans-serif !important; }`;
        document.head.append(style);
      });
    }, otherFace);
  }
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return { context, page, errors };
}
async function accessible(page, label) {
  const problems = await accessibilityProblems(page);
  // The kit reads a button's words wherever they are in the page; a screen reader is not
  // given words that are taken out of it (`display: none`). So the browser itself is
  // asked what it hands a screen reader: a button or link with no name there is a problem.
  const tree = await page.locator('body').ariaSnapshot();
  const nameless = tree
    .split('\n')
    .filter((line) => /^\s*- (button|link)(\s\[[^\]]*\])*:?\s*$/.test(line));
  if (nameless.length > 0) {
    problems.push(`${nameless.length} buttons or links have no name for a screen reader`);
  }
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
}
async function noSidewaysScroll(page, label) {
  const [width, inner] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  note(`no sideways scrolling: ${label}`, width <= inner, `${width} > ${inner}`);
}

/** Lets the page draw twice: what it does just after drawing (its effects) is done by then. */
const twoFrames = (page) =>
  page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );

/**
 * Counts every scroll of the page or of anything in it from now on, so a test can say
 * "nothing scrolled": a browser test's own click would scroll a thing into view silently.
 */
const watchScrolling = (page) =>
  page.evaluate(() => {
    window.scrollsSeen = 0;
    document.addEventListener('scroll', () => (window.scrollsSeen += 1), true);
  });
const scrollsSeen = (page) =>
  page.evaluate(() => ({
    events: window.scrollsSeen,
    moved: [document.scrollingElement, ...document.querySelectorAll('[data-scoring] *')]
      .filter((el) => el.scrollTop !== 0 || el.scrollLeft !== 0)
      .map((el) => el.className || el.tagName),
  }));

/**
 * Taps a thing where it is on the screen, as a finger does: never scrolled to. Fails if
 * it is not wholly on the screen, or if something else is in front of it there.
 */
async function tapWhereItIs(page, locator, what) {
  // A hand taps a thing once it sees it, at rest: the thing is waited for (waiting
  // scrolls nothing) and measured only when two frames running find it in one place. A
  // measure taken in the frame the pad is drawn again finds nothing, on a slower machine.
  await locator.waitFor();
  let box = await locator.boundingBox();
  for (let tries = 0; tries < 40; tries += 1) {
    await twoFrames(page);
    const again = await locator.boundingBox();
    const still =
      box !== null &&
      again !== null &&
      ['x', 'y', 'width', 'height'].every((side) => box[side] === again[side]);
    box = again;
    if (still) break;
  }
  if (box === null) throw new Error(`${what} is not on the screen`);
  const view = page.viewportSize();
  if (box.x < 0 || box.y < 0 || box.x + box.width > view.width || box.y + box.height > view.height)
    throw new Error(`${what} is not wholly on the screen without scrolling`);
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  const onTop = await locator.evaluate(
    (el, at) => el.contains(document.elementFromPoint(at.x, at.y)),
    { x, y },
  );
  if (!onTop) throw new Error(`${what} is covered where it would be tapped`);
  await page.mouse.click(x, y);
}

/**
 * At rest the pad's words fit their place (the second look's L3): nothing of them is cut
 * and there is nothing to scroll to, with `sentences` of the hint's four showing (two
 * before the first play, under what to do next; all four once the game is in play).
 */
async function restFits(page, label, sentences) {
  await twoFrames(page);
  const rest = await page.evaluate(() => {
    const el = document.querySelector('[data-pad] [data-rest]');
    if (el === null) return null;
    const shown = [...el.querySelectorAll('[data-hint] p')].filter(
      (p) => p.getClientRects().length > 0,
    );
    const edge = el.getBoundingClientRect();
    return {
      place: el.clientHeight,
      over: el.scrollHeight - el.clientHeight,
      sentences: shown.length,
      cut: shown.filter((p) => p.getBoundingClientRect().bottom > edge.bottom + 0.5).length,
    };
  });
  note(
    `${label}: at rest the pad’s words fit their place, nothing cut and nothing to scroll`,
    rest !== null && rest.over <= 0 && rest.cut === 0 && rest.sentences === sentences,
    JSON.stringify(rest),
  );
}

/**
 * Whether the keyboard comes to rest on this thing. The screen moves it there once it has
 * been drawn again, a frame or two after what the test waited for; so it is looked for
 * frame by frame for a few seconds, not asked once.
 */
const keyboardOn = (locator) =>
  locator.evaluate(
    (el) =>
      new Promise((resolve) => {
        const began = performance.now();
        const look = () => {
          if (el === document.activeElement) resolve(true);
          else if (performance.now() - began > 5000) resolve(false);
          else requestAnimationFrame(look);
        };
        look();
      }),
  );

/**
 * A play made as a hand makes it, every tap where the thing is: the player's tile, then,
 * once the pad shows that player's options, one of them; then the play is waited for and
 * the pad is at rest again before anything else is tapped.
 */
async function playWhereItIs(page, c, tile, act, what) {
  const id = await tile.getAttribute('data-player');
  await tapWhereItIs(page, tile, what);
  await c.pad.locator(`[data-options="${id}"]`).waitFor();
  await c.recorded(() => tapWhereItIs(page, c.option(act), `${act} for ${what}`));
  await c.pad.locator('[data-rest]').waitFor();
}

/**
 * The scoring screen of the game at this address, opened. Each step lets go of the game
 * when it ends (`letGo`), so the next finds it free; a game still held is taken over, and
 * that is a failure of its own unless a step before this one had already failed (it then
 * left taps unsent, and a game with taps unsent is not let go of).
 */
async function openCourt(page) {
  const c = court(page);
  const hadFailed = failures.length > 0;
  const { tookOver } = await c.open();
  if (tookOver) {
    note('the game was free to open, not held by a device that had left it', hadFailed);
  }
  return c;
}

/**
 * Ends a step: the game is left by the screen's own way out, which lets go of it before
 * the page goes, and the browser's window is closed. A step that broke has said so
 * already; its game is taken over by the next.
 */
async function letGo(page, context) {
  try {
    const c = court(page);
    // Not waited on for long: a screen that broke may have no way out.
    page.setDefaultTimeout(8_000);
    if (await c.root.isVisible()) {
      await page.keyboard.press('Escape');
      await c.leave();
    }
  } catch {
    // Said by the step itself, or by the next step's `openCourt`.
  } finally {
    await context.close();
  }
}

/**
 * Everything a scorekeeper can tap on the scoring screen now: the part of each button
 * and link that shows (what the screen's edge or a panel cuts off is left out), and only
 * where a finger would reach it (not under an open sheet). A thing that is cut is judged
 * by the part that shows: that is all a finger has.
 */
const targets = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-scoring] button, [data-scoring] a[href]')]
      .map((el) => {
        const r = el.getBoundingClientRect();
        let [left, top, right, bottom] = [
          Math.max(r.left, 0),
          Math.max(r.top, 0),
          Math.min(r.right, window.innerWidth),
          Math.min(r.bottom, window.innerHeight),
        ];
        for (let up = el.parentElement; up !== null; up = up.parentElement) {
          const style = getComputedStyle(up);
          if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
          const c = up.getBoundingClientRect();
          left = Math.max(left, c.left);
          top = Math.max(top, c.top);
          right = Math.min(right, c.right);
          bottom = Math.min(bottom, c.bottom);
        }
        const [w, h] = [right - left, bottom - top];
        const shown = w > 0 && h > 0;
        const reached = shown && el.contains(document.elementFromPoint(left + w / 2, top + h / 2));
        return {
          name: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
          kind: el.matches('.court-opt-points')
            ? 'points'
            : el.matches('[data-floor] .court-tile')
              ? 'floor-tile'
              : // A link inside a sentence is text, not a button.
                el.matches('p > a')
                ? 'text-link'
                : 'other',
          reached,
          x: left,
          y: top,
          w,
          h,
        };
      })
      .filter((t) => t.reached && t.kind !== 'text-link'),
  );

/** Checks the sizes of everything tappable now, and the room between them. */
async function measureTargets(page, label) {
  await twoFrames(page);
  const list = await targets(page);
  const small = list.filter((t) => t.w < 43.99 || t.h < 43.99);
  note(
    `${label}: nothing tapped is under 44 x 44 (${list.length} targets)`,
    list.length > 0 && small.length === 0,
    small.map((t) => `${t.name} ${t.w.toFixed(0)}x${t.h.toFixed(0)}`).join(', '),
  );
  const large = list.filter((t) => t.kind !== 'other');
  const notLarge = large.filter((t) => Math.min(t.w, t.h) < 55.99);
  note(
    `${label}: point buttons and floor tiles are 56 or more on the short side`,
    notLarge.length === 0,
    notLarge.map((t) => `${t.name} ${t.w.toFixed(0)}x${t.h.toFixed(0)}`).join(', '),
  );
  const close = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const [a, b] = [list[i], list[j]];
      const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
      const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
      const gap = Math.max(dx, dy);
      // Overlapping targets are one inside another (none here); touching ones are too close.
      if (gap < 7.99) close.push(`${a.name} / ${b.name}: ${gap.toFixed(1)}`);
    }
  }
  note(`${label}: targets are at least 8 apart`, close.length === 0, close.slice(0, 4).join('; '));
}

/**
 * Every line of players on the screen now (a team's bench, the pad's "Sub in" and "In
 * for"): how many players it has, how many show whole, how many are cut by the line's or
 * the screen's edge, and what its end tile says ("5 more": read from its words, as a
 * scorekeeper reads it).
 */
const playerLines = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-scoring] [data-fit]')]
      .filter((row) => row.getClientRects().length > 0)
      .map((row) => {
        const clips = getComputedStyle(row).overflowX !== 'visible';
        const edge = row.getBoundingClientRect();
        const seen = (el) => {
          const r = el.getBoundingClientRect();
          const [left, right, top, bottom] = clips
            ? [edge.left, edge.right, edge.top, edge.bottom]
            : [0, window.innerWidth, 0, window.innerHeight];
          const w = Math.min(r.right, right, window.innerWidth) - Math.max(r.left, left, 0);
          const h = Math.min(r.bottom, bottom, window.innerHeight) - Math.max(r.top, top, 0);
          if (w <= 0.5 || h <= 0.5 || getComputedStyle(el).visibility === 'hidden') return 'hidden';
          return w >= r.width - 0.5 && h >= r.height - 0.5 ? 'whole' : 'cut';
        };
        const players = [
          ...row.querySelectorAll(':scope > [data-player], :scope > [data-other]'),
        ].map(seen);
        const end = row.querySelector(':scope > .court-more-tile');
        const endShown = end !== null && getComputedStyle(end).display !== 'none';
        const says = endShown ? end.innerText.trim().replace(/\s+/g, ' ') : '';
        return {
          line: row.getAttribute('data-bench') ?? 'pad',
          players: players.length,
          whole: players.filter((state) => state === 'whole').length,
          cut: players.filter((state) => state === 'cut').length,
          end: endShown ? seen(end) : 'none',
          says,
          more: endShown ? Number(/^(\d+) more$/.exec(says)?.[1] ?? NaN) : 0,
          scrolled: row.scrollLeft !== 0 || row.scrollTop !== 0,
        };
      }),
  );

/**
 * No bench player is hidden without a sign (finding M2): in every line of players each
 * one shows whole or not at all, the ones that do not show are counted on the line's
 * end tile, that tile is whole, and the line has not been scrolled.
 */
async function measureLines(page, label, expected) {
  // The screen counts what fits in a line just after it has drawn it: two frames on.
  await twoFrames(page);
  const lines = await playerLines(page);
  const wrong = lines.filter(
    (line) =>
      line.cut > 0 ||
      line.scrolled ||
      line.whole + line.more !== line.players ||
      (line.more > 0 ? line.end !== 'whole' : line.end !== 'none'),
  );
  note(
    `${label}: every player in a line is whole or counted on its end tile (${lines.length} lines)`,
    lines.length === expected && wrong.length === 0,
    `${lines.length} lines, ${expected} expected; ${JSON.stringify(wrong)}`,
  );
  // "+" means points on this screen, and nothing else (the second look's F1): no
  // player's tile and no tile of a line of players starts with one, in its words or in
  // anything the stylesheet draws before them. Only the points buttons do.
  const plus = await page.evaluate(() => {
    const starts = (text) => /^\s*["']?\s*\+/.test(text);
    const drawnBefore = (el) => {
      const content = getComputedStyle(el, '::before').content;
      return content === 'none' || content === 'normal' ? '' : content;
    };
    return [...document.querySelectorAll('[data-scoring] :is(.court-tile, .court-opt)')]
      .filter((el) => el.getClientRects().length > 0 && !el.matches('.court-opt-points'))
      .filter(
        (el) =>
          starts(el.innerText) ||
          [el, ...el.querySelectorAll('*')].some((n) => starts(drawnBefore(n))),
      )
      .map((el) => (el.getAttribute('aria-label') || el.innerText).trim().slice(0, 40));
  });
  note(
    `${label}: no tile but the points buttons starts with "+"`,
    plus.length === 0,
    plus.join('; '),
  );
  return lines;
}

if (browser) {
  await step('reached by tapping; the frame; lineups kept through a reload', async () => {
    const { context, page, errors } = await scorekeeperAt(phone);
    try {
      // Where a scorekeeper starts: the admin's home, which is their games.
      await page.goto(`${origin}/${league}/admin`);
      await page
        .locator(`li[data-game="${otherGame}"]`)
        .getByRole('link', { name: 'Score this game' })
        .click();
      const c = await openCourt(page);
      note('the address is the game’s tracker', page.url().endsWith(trackerPath(otherGame)));

      // The frame: the tracker's own, nothing of the public site (DESIGN.md section 7, line 11).
      // The one navigation the frame holds is the account button's own menu (step 2.127,
      // line 11), and it is in the account button: any other counts as a public part.
      const frame = await page.evaluate(() => ({
        publicParts: [
          ...document.querySelectorAll('.site-header, .site-footer, .site-skip, nav'),
        ].filter((el) => !(el.matches('nav') && el.closest('[data-scoring] [data-account]')))
          .length,
        accountMenus: document.querySelectorAll('[data-scoring] [data-account] nav').length,
        leagueLook: document.querySelectorAll('.league-site, .ui-root').length,
        title: document.querySelector('h1')?.innerText ?? '',
        font: getComputedStyle(document.querySelector('[data-scoring]')).fontFamily,
      }));
      note('no public header, menu or footer around the scoring screen', frame.publicParts === 0);
      note(
        'the frame holds the account button of step 2.127, with its one menu (line 11)',
        frame.accountMenus === 1,
      );
      note('nothing of the league’s design around the scoring screen', frame.leagueLook === 0);
      note(
        'the title says the two teams, the day and the time (A3)',
        /Lions at Hawks/.test(frame.title) && /\d{1,2}:\d{2}/.test(frame.title),
        frame.title,
      );
      note(
        'a plain sans face the device already has',
        /^system-ui/.test(frame.font) || otherFace !== '',
        frame.font,
      );
      await accessible(page, 'lineups, nobody picked');
      await noSidewaysScroll(page, 'lineups');

      // Before tip-off: how many players each team has and what to do next (A6).
      const pregame = await c.pad.locator('[data-pregame]').innerText();
      note(
        'before tip-off the pad says each team’s players and what to do next (A6)',
        /Hawks: 12 players · Lions: 6 players/.test(pregame) &&
          /tap each team’s starters, then start the clock/.test(pregame.replace(/'/g, '’')),
        pregame,
      );

      // Picking (C1, C2): tapped players are picked, a line counts them.
      await c.pick('home', [3, 5, 7]);
      await page.getByText('3 of 5 picked.').waitFor();
      note(
        'a picked starter is marked, and said to be pressed (C1)',
        (await c.tile('home', 3).getAttribute('aria-pressed')) === 'true' &&
          (await c.tile('home', 9).getAttribute('aria-pressed')) === 'false',
      );
      // Tapped again: unpicked.
      await c.tile('home', 7).click();
      await page.getByText('2 of 5 picked.').waitFor();

      // A reload mid-pick keeps the picks (C3). The page is reloaded once the device's own
      // store holds the two picks: looked for there, not guessed at by waiting a while,
      // which a slower machine would lose.
      const picked = [
        await c.tile('home', 3).getAttribute('data-player'),
        await c.tile('home', 5).getAttribute('data-player'),
      ];
      await page.waitForFunction(
        async ([name, game, want]) => {
          const db = await new Promise((resolve, reject) => {
            const opening = indexedDB.open(name);
            opening.onsuccess = () => resolve(opening.result);
            opening.onerror = () => reject(opening.error);
          });
          try {
            const row = await new Promise((resolve, reject) => {
              const get = db.transaction('games', 'readonly').objectStore('games').get(game);
              get.onsuccess = () => resolve(get.result);
              get.onerror = () => reject(get.error);
            });
            const home = row?.lineupPicks?.home ?? [];
            return home.length === want.length && want.every((id) => home.includes(id));
          } finally {
            db.close();
          }
        },
        [gamesDatabase, otherGame, picked],
      );
      await page.reload();
      await c.open();
      await page.getByText('2 of 5 picked.').waitFor();
      note(
        'the picks survive a reload (C3)',
        (await c.tile('home', 3).getAttribute('aria-pressed')) === 'true' &&
          (await c.tile('home', 5).getAttribute('aria-pressed')) === 'true',
      );

      // A short-handed team starts with fewer than five (C2).
      await page.getByRole('button', { name: 'Start with 2' }).click();
      await c.root.locator('[data-floor="home"] .court-tile').nth(1).waitFor();
      note(
        'a short-handed team starts with the players picked (C2)',
        (await c.root.locator('[data-floor="home"] .court-tile').count()) === 2 &&
          (await c.onCourt('home', 3)) &&
          (await c.onCourt('home', 5)),
      );
      // The fifth pick sets the other team's lineup at once.
      await c.pick('away', [3, 5, 7, 9]);
      note(
        'four picked: the lineup waits',
        (await c.root.locator('[data-floor="away"]').count()) === 0,
      );
      await c.tile('away', 11).click();
      await c.root.locator('[data-floor="away"] .court-tile').nth(4).waitFor();
      await c.saved();
      // Setting lineups does not make the game live for viewers (C4): nothing scored yet.
      note(
        'lineups alone score nothing',
        (await c.score()).home === 0 && (await c.score()).away === 0,
      );

      // Before the first play the pad at rest says what to do next and, under it, how to
      // score and how to substitute; at each of the five sizes it all fits (L3). With
      // both lineups set, what to do next is the Start clock button of step 2.36, which
      // says "Start it at the tip."; the words that said to tap the starters make way.
      for (const size of sizes) {
        await page.setViewportSize({ width: size.width, height: size.height });
        await c.pad.locator('[data-start-bar]').waitFor();
        note(
          `${size.width} x ${size.height}: before tip-off the pad says what to do next: start the clock at the tip`,
          /Start clock · tip-off/.test(await c.pad.locator('[data-start-clock]').innerText()) &&
            /Start it at the tip\./.test(await c.pad.locator('[data-start-bar]').innerText()),
        );
        await restFits(page, `${size.width} x ${size.height}, before the first play`, 2);
      }
      await page.setViewportSize({ width: phone.width, height: phone.height });
      await twoFrames(page);

      // One way out, behind More, with the public page beside it (A4).
      note(
        'no way out on the screen itself, where a stray tap could leave the game',
        (await page.getByRole('link', { name: 'Back to your games' }).count()) === 0,
      );
      await c.more.click();
      await c.sheet.waitFor();
      await accessible(page, 'More');
      const watch = c.sheet.getByRole('link', { name: 'Open the public game page' });
      note(
        'More holds the one way out and the public page, opened beside the tracker (A4)',
        (await c.sheet.getByRole('link', { name: 'Back to your games' }).count()) === 1 &&
          (await watch.getAttribute('href')) === `/${league}/games/${otherGame}` &&
          (await watch.getAttribute('target')) === '_blank' &&
          (await c.sheet.getByRole('link', { name: 'Sign out on your account page' }).count()) ===
            1,
      );
      await measureTargets(page, 'More, phone upright');
      await Promise.all([
        page.waitForURL(`${origin}/${league}/admin`),
        c.sheet.getByRole('link', { name: 'Back to your games' }).click(),
      ]);
      note('nothing broke on the page', errors.length === 0, errors.join('; '));
    } finally {
      await letGo(page, context);
    }
  });

  await step(
    'upright phone: every floor player scored, fouled and substituted, never scrolling',
    async () => {
      const { context, page, errors } = await scorekeeperAt(phone);
      try {
        await page.goto(`${origin}/${league}/admin`);
        await page
          .locator(`li[data-game="${liveGame}"]`)
          .getByRole('link', { name: 'Score this game' })
          .click();
        const c = await openCourt(page);
        await c.pick('home', starters);
        await c.pick('away', starters);
        await page.locator('[data-scoring][data-stage="play"]').waitFor();
        await accessible(page, 'in play, the pad at rest');
        await noSidewaysScroll(page, 'in play');

        // Both teams' five, their benches, the scoreboard and the pad are all on one screen.
        const layout = await page.evaluate(() => {
          const box = (selector) => {
            const r = document.querySelector(selector)?.getBoundingClientRect();
            return r ? { top: r.top, bottom: r.bottom, height: r.height } : null;
          };
          const teams = document.querySelector('[data-teams]');
          return {
            top: box('.court-top'),
            pad: box('[data-pad]'),
            controls: box('[data-slot="clock-controls"]'),
            floorTiles: [...document.querySelectorAll('[data-floor] .court-tile')].map((el) => {
              const r = el.getBoundingClientRect();
              return (
                r.top >= 0 &&
                r.bottom <= window.innerHeight &&
                r.left >= 0 &&
                r.right <= window.innerWidth
              );
            }),
            teamsOverflow: teams.scrollHeight - teams.clientHeight,
            viewport: window.innerHeight,
          };
        });
        note(
          'all ten floor tiles are on the screen at once',
          layout.floorTiles.length === 10 && layout.floorTiles.every(Boolean),
        );
        note(
          'the teams fit: nothing to scroll',
          layout.teamsOverflow <= 0,
          String(layout.teamsOverflow),
        );
        note(
          'the scoreboard takes no more than about a fifth of the screen (line 5)',
          layout.top.height <= layout.viewport * 0.2,
          `${layout.top.height} of ${layout.viewport}`,
        );
        note(
          'room is left for the clock controls, 44 or more high',
          layout.controls !== null && layout.controls.height >= 44,
        );

        // Twelve a side (finding M2): all seven of each bench show whole in their line,
        // so the line needs no end tile.
        const benches = await measureLines(page, 'twelve a side, in play', 2);
        note(
          'twelve a side: all seven of each bench show whole in their line, with no "+" tile',
          benches.every((line) => line.players === 7 && line.whole === 7 && line.more === 0),
          JSON.stringify(benches),
        );

        await watchScrolling(page);
        // And all seven show whole in a floor player's "Sub in".
        await tapWhereItIs(page, c.tile('home', 3), 'home #3');
        await c.pad.locator('[data-act="sub"]').first().waitFor();
        const subIn = (await measureLines(page, 'twelve a side, "Sub in"', 3)).filter(
          (line) => line.line === 'pad',
        );
        note(
          'twelve a side: all seven who can come in show whole in "Sub in"',
          subIn.length === 1 && subIn[0].players === 7 && subIn[0].whole === 7,
          JSON.stringify(subIn),
        );
        await tapWhereItIs(page, c.tile('home', 3), 'home #3');
        await c.pad.locator('[data-rest]').waitFor();

        // Who comes in for each of the five starters: the first five of each bench.
        const fresh = { home: [13, 20, 21, 22, 23], away: [13, 20, 21, 22, 24] };
        // A basket and a foul for each of the ten, then each is substituted: every tap made
        // where the thing is on the screen.
        for (const side of ['home', 'away']) {
          for (const jersey of starters) {
            await playWhereItIs(page, c, c.tile(side, jersey), 'p2', `${side} #${jersey}`);
            await playWhereItIs(page, c, c.tile(side, jersey), 'foul', `${side} #${jersey}`);
          }
          // Each is substituted from their own options: who can come in is in the pad. A
          // fresh bench player comes in every time, so all five starters go off.
          for (const [i, jersey] of starters.entries()) {
            const coming = fresh[side][i];
            const going = await c.tile(side, jersey).getAttribute('data-player');
            await tapWhereItIs(page, c.tile(side, jersey), `${side} #${jersey}`);
            await c.pad.locator(`[data-options="${going}"]`).waitFor();
            await c.recorded(() =>
              tapWhereItIs(
                page,
                c.pad.locator('[data-act="sub"]').filter({
                  has: page.locator('.court-opt-number', { hasText: new RegExp(`^${coming}$`) }),
                }),
                `#${coming} of "Sub in"`,
              ),
            );
            await c.root
              .locator(`[data-bench="${side}"] [data-player]`)
              .filter({
                has: page.locator('.court-tile-number', { hasText: new RegExp(`^${jersey}$`) }),
              })
              .waitFor();
            await c.pad.locator('[data-rest]').waitFor();
          }
        }
        // And from the bench: "In for" shows all five on the court, with no scrolling (E1).
        const bench = { home: 30, away: 30 };
        for (const side of ['home', 'away']) {
          const comingId = await c.tile(side, bench[side]).getAttribute('data-player');
          await tapWhereItIs(page, c.tile(side, bench[side]), `${side} bench #${bench[side]}`);
          const inFor = c.pad.locator(`[data-options="${comingId}"] [data-act="sub"]`);
          await inFor.first().waitFor();
          note(`"In for" offers the five on the court (${side})`, (await inFor.count()) === 5);
          for (let i = 0; i < 5; i += 1) {
            const box = await inFor.nth(i).boundingBox();
            note(
              `"In for" button ${i + 1} of ${side} is on the screen`,
              box !== null && box.x >= 0 && box.x + box.width <= phone.width,
            );
          }
          await c.recorded(() => tapWhereItIs(page, inFor.nth(4), 'the fifth of "In for"'));
          await c.pad.locator('[data-rest]').waitFor();
          await c.root
            .locator(`[data-floor="${side}"] [data-player]`)
            .filter({
              has: page.locator('.court-tile-number', { hasText: new RegExp(`^${bench[side]}$`) }),
            })
            .waitFor();
        }
        // A drag scrolls nothing (M2): the one of the five who went off again is dragged
        // from the bench back onto the player who replaced them, then a bench player is
        // dragged along the bench, which is explained and moves nothing.
        for (const side of ['home', 'away']) {
          let off = null;
          for (const jersey of fresh[side]) if (!(await c.onCourt(side, jersey))) off = jersey;
          await c.recorded(() => c.drag(c.tile(side, off), c.tile(side, bench[side])));
          note(
            `a bench player dragged onto a floor player comes on, with nothing scrolling (${side})`,
            (await c.onCourt(side, off)) && !(await c.onCourt(side, bench[side])),
          );
          await c.drag(c.tile(side, bench[side]), c.tile(side, 3));
          await c.said
            .filter({ hasText: 'Drag a bench player onto someone on the court.' })
            .waitFor();
        }
        await c.saved();
        const scrolled = await scrollsSeen(page);
        note(
          'nothing scrolled: not the page, not a panel, not a strip',
          scrolled.events === 0 && scrolled.moved.length === 0,
          JSON.stringify(scrolled),
        );
        const score = await c.score();
        note(
          'ten baskets are on the scoreboard',
          score.home === 10 && score.away === 10,
          JSON.stringify(score),
        );
        for (const side of ['home', 'away']) {
          const tiles = c.root.locator(`[data-teams] [data-side="${side}"][data-player]`);
          const facts = await tiles.evaluateAll((els) =>
            els.map((el) => ({
              number: el.querySelector('.court-tile-number').textContent,
              court: el.dataset.oncourt,
              points: el.querySelector('[data-points]')?.dataset.points,
              fouls: el.querySelector('[data-fouls]')?.dataset.fouls,
            })),
          );
          const scored = facts.filter((f) => f.points === '2' && f.fouls === '1');
          note(
            `five ${side} players have a basket and a foul each`,
            scored.length === 5,
            JSON.stringify(facts),
          );
          const off = facts.filter((f) => f.court === '0' && f.points === '2');
          note(`all five ${side} starters were substituted`, off.length === 5, JSON.stringify(off));
        }
        // The server holds it: a reload shows the same game.
        await page.reload();
        await c.open();
        const again = await c.score();
        note(
          'saved on the server: the same score after a reload',
          again.home === 10 && again.away === 10,
        );
        note('nothing broke on the page', errors.length === 0, errors.join('; '));
      } finally {
        await letGo(page, context);
      }
    },
  );

  await step('options, turnovers, fouling out, swap colors, drags and the keyboard', async () => {
    const { context, page, errors } = await scorekeeperAt(phone);
    try {
      await page.goto(`${origin}${trackerPath()}`);
      const c = await openCourt(page);
      // The game stands as the step before left it; the floors are these.
      const floor = async (side) =>
        c.root
          .locator(`[data-floor="${side}"] .court-tile-number`)
          .evaluateAll((els) => els.map((el) => Number(el.textContent)));
      const [h1, h2] = await floor('home');
      const [a1] = await floor('away');

      // Options open in the pad under the tapped tile's ring; nothing else moves (D4, D6).
      const before = await c.tile('home', h2).boundingBox();
      await c.tile('home', h1).click();
      await c.pad.locator('[data-options]').waitFor();
      const after = await c.tile('home', h2).boundingBox();
      note(
        'opening a player’s options moves no tile (D4)',
        before.x === after.x && before.y === after.y,
      );
      note(
        'the tapped tile says its options are open',
        (await c.tile('home', h1).getAttribute('aria-expanded')) === 'true',
      );
      await accessible(page, 'a floor player’s options');
      await measureTargets(page, 'a floor player’s options, phone upright');
      // Tapping the tile again closes them; so does a tap anywhere else.
      await c.tile('home', h1).click();
      await c.pad.locator('[data-rest]').waitFor();
      await c.tile('home', h1).click();
      // The options are seen open before the tap elsewhere, so "closed" after it is that
      // tap's doing and not the pad not yet drawn.
      await c.pad.locator('[data-options]').waitFor();
      // A team's box of the scoreboard: the clock beside it is a button since step 2.36.
      await c.root.locator('.court-score').first().click();
      await c.pad.locator('[data-rest]').waitFor();
      note(
        'a tap anywhere else closes the options (D4)',
        (await c.pad.locator('[data-options]').count()) === 0,
      );

      // −Foul takes back that player's latest foul (D11); greyed when there is none.
      const hadFouls = await c.fouls('home', h1);
      await c.play('home', h1, 'foul');
      await c.root
        .locator(`[data-teams] [data-fouls="${hadFouls + 1}"]`)
        .first()
        .waitFor();
      await c.play('away', a1, 'p3');
      await c.play('home', h1, 'unfoul');
      await c.saved();
      note(
        '−Foul takes back the player’s latest foul (D11)',
        (await c.fouls('home', h1)) === hadFouls,
      );
      await c.tile('home', 33).click();
      note('−Foul is greyed for a player with no foul (D5)', await c.option('unfoul').isDisabled());
      await accessible(page, 'a bench player’s options');
      // A bench player is scored without being brought on (E4).
      await c.choose('p1');
      await c.saved();
      note(
        'a bench player scores without coming on (E4)',
        (await c.points('home', 33)) === 1 && !(await c.onCourt('home', 33)),
      );

      // A turnover says who; turnovers are counted in the team's chip, not on tiles (D9, G1).
      const chip = c.turnoversChip('home');
      note('the chip counts turnovers', (await chip.innerText()).trim() === '0 turnovers');
      await c.play('home', h1, 'turnover');
      await c.said.filter({ hasText: 'Turnover:' }).waitFor();
      await c.play('home', h2, 'turnover');
      await c.play('home', h2, 'turnover');
      await c.saved();
      note('three turnovers on the chip (G1)', (await chip.innerText()).trim() === '3 turnovers');
      note(
        'no tile shows turnovers (D9)',
        !/turnover|\bTO\b/i.test(
          await c.root
            .locator('[data-teams]')
            .innerText()
            .then((s) => s.replace(/\d+ turnovers?/g, '')),
        ),
      );
      await chip.click();
      const list = c.pad.locator('[data-turnover-list="home"]');
      await list.waitFor();
      await accessible(page, 'a team’s turnovers');
      await measureTargets(page, 'a team’s turnovers, phone upright');
      const rows = await list.locator('li').allInnerTexts();
      note(
        'the list has each player’s, most first (G1)',
        rows.length === 2 && /2/.test(rows[0]) && /1/.test(rows[1]),
        rows.join(' | '),
      );
      // Taken back from the list.
      await list.locator('li').nth(1).getByRole('button').click();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-turnovers="home"]').textContent.trim() === '2 turnovers',
      );
      // A team turnover, charged to no player (G2), and taken back.
      await list.getByRole('button', { name: '+ Team turnover' }).click();
      await c.said.filter({ hasText: 'Team turnover: Hawks.' }).waitFor();
      await list.locator('[data-turnovers-of="team"]').waitFor();
      note(
        'a team turnover counts for the team (G2)',
        (await chip.innerText()).trim() === '3 turnovers',
      );
      // Two taps at once on its take-back: the second is refused, in a sentence (I6).
      await list.locator('[data-turnovers-of="team"] button').evaluate((button) => {
        button.click();
        button.click();
      });
      await c.said.filter({ hasText: 'There is no team turnover to take back.' }).waitFor();
      note('a refusal is said in a sentence from the message files (I6)', true);
      await c.saved();
      note(
        'the team turnover was taken back once',
        (await chip.innerText()).trim() === '2 turnovers',
      );
      await page.keyboard.press('Escape');
      await c.pad.locator('[data-rest]').waitFor();
      note(
        'Escape closes the list and the keyboard is back on its chip (S4)',
        await keyboardOn(chip),
      );

      // Fouling out at the league's limit: marked, in words, and still tappable (D10).
      const fouls = await c.fouls('away', a1);
      for (let i = fouls; i < 5; i += 1) await c.play('away', a1, 'foul');
      await c.tile('away', a1).and(page.locator('[data-out]')).waitFor();
      note(
        'a player at the league’s foul limit is marked "Out" (D10)',
        /Out/i.test(await c.tile('away', a1).innerText()) &&
          /fouled out/.test(await c.tile('away', a1).getAttribute('aria-label')),
      );
      const outPoints = await c.points('away', a1);
      await c.play('away', a1, 'p2');
      await c.saved();
      note('and can still be scored (D10)', (await c.points('away', a1)) === outPoints + 2);

      // Dragging a bench player onto a floor player substitutes them (E2).
      await c.recorded(() => c.drag(c.tile('home', 33), c.tile('home', h2)));
      await c.saved();
      note(
        'a bench player dragged onto a floor player comes on for them (E2)',
        (await c.onCourt('home', 33)) && !(await c.onCourt('home', h2)),
      );
      // A wrong drag is explained (E3).
      await c.drag(c.tile('home', h2), c.tile('away', a1));
      await c.said.filter({ hasText: 'Substitutions have to stay within one team.' }).waitFor();
      await c.drag(c.tile('home', 33), c.tile('home', h1));
      await c.said.filter({ hasText: 'Drag a bench player onto someone on the court.' }).waitFor();
      note('a wrong drag is explained in a sentence (E3)', true);
      // A press that barely moves is a tap (E2): the options open.
      const tile = await c.tile('away', a1).boundingBox();
      await page.mouse.move(tile.x + 20, tile.y + 20);
      await page.mouse.down();
      await page.mouse.move(tile.x + 24, tile.y + 23);
      await page.mouse.up();
      await c.pad.locator('[data-options]').waitFor();
      note('a press that moves less than 8 pixels is a tap (E2)', true);
      await c.pad.locator('.court-close').click();

      // The keyboard (S4): Enter on a tile opens its options and goes into them; Enter
      // on an option records it and returns to the tile; Escape closes and returns.
      const scoreBefore = (await c.score()).away;
      await c.tile('away', a1).focus();
      await page.keyboard.press('Enter');
      await c.pad.locator('[data-options]').waitFor();
      note(
        'Enter on a tile opens the options and moves into them (S4)',
        await keyboardOn(c.option('p1')),
      );
      const ring = await c
        .option('p1')
        .evaluate(
          (el) => getComputedStyle(el).outlineStyle + ' ' + getComputedStyle(el).outlineWidth,
        );
      note('the focused option has a visible ring (S4)', /^solid [3-9]px/.test(ring), ring);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await page.waitForFunction(
        (was) =>
          Number(document.querySelector('[data-score="away"] .court-score-value').textContent) ===
          was + 2,
        scoreBefore,
      );
      note(
        'Enter on +2 records it and the keyboard is back on the tile (S4)',
        await keyboardOn(c.tile('away', a1)),
      );
      await page.keyboard.press('Space');
      await c.pad.locator('[data-options]').waitFor();
      await page.keyboard.press('Escape');
      await c.pad.locator('[data-rest]').waitFor();
      note(
        'Escape closes the options and returns to the tile (S4)',
        await keyboardOn(c.tile('away', a1)),
      );

      // Swap colors (D3): behind More; saved with the game.
      const colorOf = (side) => c.root.locator(`[data-score="${side}"]`).getAttribute('data-color');
      note(
        'home is drawn light and away dark (D3)',
        (await colorOf('home')) === 'light' && (await colorOf('away')) === 'dark',
      );
      await c.more.focus();
      await page.keyboard.press('Enter');
      await c.sheet.waitFor();
      await page.keyboard.press('Escape');
      await c.sheet.waitFor({ state: 'detached' });
      note(
        'Escape closes More and the keyboard is back on its button (S4)',
        await keyboardOn(c.more),
      );
      await c.more.click();
      await c.sheet.getByRole('button', { name: 'Swap colors' }).click();
      await c.root.locator('[data-score="home"][data-color="dark"]').waitFor();
      await c.saved();
      await accessible(page, 'colors swapped');
      await page.reload();
      await c.open();
      note(
        'the swap is saved with the game (D3)',
        (await colorOf('home')) === 'dark' && (await colorOf('away')) === 'light',
      );
      note('nothing broke on the page', errors.length === 0, errors.join('; '));
    } finally {
      await letGo(page, context);
    }
  });

  await step(
    'the phone in its browser (390 x 664): every floor player scored and fouled, a substitution each way, never scrolling',
    async () => {
      const { context, page, errors } = await scorekeeperAt(phoneInBrowser);
      const label = '390 x 664';
      try {
        await page.goto(`${origin}${trackerPath()}`);
        const c = await openCourt(page);
        await page.locator('[data-scoring][data-stage="play"]').waitFor();
        await accessible(page, `${label}, in play`);
        await noSidewaysScroll(page, label);
        const layout = await page.evaluate(() => {
          const whole = (el) => {
            const r = el.getBoundingClientRect();
            return (
              r.height > 0 &&
              r.top >= 0 &&
              r.left >= 0 &&
              r.bottom <= window.innerHeight &&
              r.right <= window.innerWidth
            );
          };
          const teams = document.querySelector('[data-teams]');
          return {
            floorTiles: [...document.querySelectorAll('[data-floor] .court-tile')].map(whole),
            pad: whole(document.querySelector('[data-pad]')),
            teamsOverflow: teams.scrollHeight - teams.clientHeight,
            page: document.scrollingElement.scrollHeight - window.innerHeight,
          };
        });
        note(
          `${label}: both fives and the pad are whole on the screen (finding M1)`,
          layout.floorTiles.length === 10 && layout.floorTiles.every(Boolean) && layout.pad,
          JSON.stringify(layout),
        );
        note(
          `${label}: the teams fit and the page is no longer than the screen: nothing to scroll`,
          layout.teamsOverflow <= 0 && layout.page <= 0,
          JSON.stringify(layout),
        );

        await watchScrolling(page);
        const player = (id) => c.root.locator(`[data-teams] [data-player="${id}"]`);
        const facts = (id) =>
          player(id).evaluate((el) => ({
            points: Number(el.querySelector('[data-points]').dataset.points),
            fouls: Number(el.querySelector('[data-fouls]').dataset.fouls),
            court: el.dataset.oncourt,
          }));
        const before = await c.score();
        for (const side of ['home', 'away']) {
          const floor = await c.root
            .locator(`[data-floor="${side}"] > [data-player]`)
            .evaluateAll((els) => els.map((el) => el.dataset.player));
          // A basket and a foul for each of the five, tapped where they are.
          let counted = 0;
          for (const id of floor) {
            const was = await facts(id);
            await playWhereItIs(page, c, player(id), 'p2', `a ${side} floor player`);
            await playWhereItIs(page, c, player(id), 'foul', `a ${side} floor player`);
            const now = await facts(id);
            if (now.points === was.points + 2 && now.fouls === was.fouls + 1) counted += 1;
          }
          note(
            `${label}: a basket and a foul for each of the five ${side} floor players`,
            floor.length === 5 && counted === 5,
            `${counted} of ${floor.length}`,
          );

          // A substitution from a floor player's own options: "Sub in" holds the bench.
          await tapWhereItIs(page, player(floor[0]), `a ${side} floor player`);
          const subIn = c.pad.locator(`[data-options="${floor[0]}"] [data-act="sub"]`);
          await subIn.first().waitFor();
          await measureLines(page, `${label}, "Sub in" (${side})`, 1);
          const coming = await subIn.first().getAttribute('data-other');
          await c.recorded(() => tapWhereItIs(page, subIn.first(), 'the first of "Sub in"'));
          await c.pad.locator('[data-rest]').waitFor();
          note(
            `${label}: "Sub in" brings a bench player on for the one tapped (${side})`,
            (await facts(coming)).court === '1' && (await facts(floor[0])).court === '0',
          );

          // And from the bench, which is folded away here: its button beside the team's
          // name opens the whole bench in the pad, and a bench player's "In for" is there.
          await tapWhereItIs(page, c.benchButton(side), `the ${side} bench button`);
          const picks = c.pad.locator(`[data-bench-list="${side}"] [data-bench-pick]`);
          await picks.first().waitFor();
          const shown = await picks.evaluateAll((els) =>
            els.map((el) => {
              const r = el.getBoundingClientRect();
              return (
                r.top >= 0 &&
                r.left >= 0 &&
                r.bottom <= window.innerHeight &&
                r.right <= window.innerWidth &&
                el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))
              );
            }),
          );
          note(
            `${label}: the bench button opens all seven of the bench in the pad, each on the screen (${side})`,
            shown.length === 7 && shown.every(Boolean),
            JSON.stringify(shown),
          );
          if (side === 'home') {
            await accessible(page, `${label}, the bench in the pad`);
            await measureTargets(page, `${label}, the bench in the pad`);
          }
          const fromBench = await picks.last().getAttribute('data-bench-pick');
          await tapWhereItIs(page, picks.last(), 'the last of the bench in the pad');
          const inFor = c.pad.locator(`[data-options="${fromBench}"] [data-act="sub"]`);
          await inFor.nth(4).waitFor();
          const going = await inFor.nth(1).getAttribute('data-other');
          await c.recorded(() => tapWhereItIs(page, inFor.nth(1), 'the second of "In for"'));
          await c.pad.locator('[data-rest]').waitFor();
          note(
            `${label}: a player picked from the bench in the pad comes in by "In for" (${side})`,
            (await facts(fromBench)).court === '1' && (await facts(going)).court === '0',
          );
        }
        await c.saved();
        const scrolled = await scrollsSeen(page);
        note(
          `${label}: nothing scrolled: not the page, not a panel, not a line of players`,
          scrolled.events === 0 && scrolled.moved.length === 0,
          JSON.stringify(scrolled),
        );
        const after = await c.score();
        note(
          `${label}: ten more baskets are on the scoreboard`,
          after.home === before.home + 10 && after.away === before.away + 10,
          `${JSON.stringify(before)} then ${JSON.stringify(after)}`,
        );
        note('nothing broke on the page', errors.length === 0, errors.join('; '));
      } finally {
        await letGo(page, context);
      }
    },
  );

  await step('two fingers on two tiles record nothing; one finger drags', async () => {
    // A screen that is touched, with real touch points (finding H1).
    const { context, page, errors } = await scorekeeperAt(phone, { hasTouch: true });
    try {
      await page.goto(`${origin}${trackerPath()}`);
      const c = await openCourt(page);
      await c.saved();
      const cdp = await context.newCDPSession(page);
      // Each finger is `[x, y]` or `[x, y, id]`: a finger left out of a move has lifted.
      const touch = (type, points) =>
        cdp.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: points.map(([x, y, id], place) => ({ x, y, id: id ?? place })),
        });
      const middle = async (locator) => {
        const box = await locator.boundingBox();
        return [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)];
      };
      const benchTile = c.root.locator('[data-bench="home"] > [data-player]').first();
      const floorTile = c.root.locator('[data-floor="home"] > [data-player]').first();
      const [benchId, floorId] = [
        await benchTile.getAttribute('data-player'),
        await floorTile.getAttribute('data-player'),
      ];
      const [a, b] = [await middle(benchTile), await middle(floorTile)];
      // What the page is told of the fingers, so the check can say it saw two.
      await page.evaluate(() => {
        window.pressesSeen = [];
        document.addEventListener(
          'pointerdown',
          (event) => window.pressesSeen.push({ type: event.pointerType, first: event.isPrimary }),
          true,
        );
      });
      const plays = await c.root.getAttribute('data-plays');
      // Two ways two fingers rest on two tiles of one team. Nobody dragged anyone in
      // either, so neither may record anything.
      const cases = [
        {
          // The fault itself (the second look, M1): finger A rests on a FLOOR player;
          // finger B lands on a BENCH player of the same team; A moves a pixel and lifts,
          // then B lifts. A screen that followed the newest finger and took any finger's
          // moves as its own would see the bench player dragged onto the floor player.
          name: 'a finger on a floor player, then one on a bench player; the first moves and lifts',
          async fingers() {
            await touch('touchStart', [[...b, 0]]);
            await touch('touchStart', [
              [...b, 0],
              [...a, 1],
            ]);
            await touch('touchMove', [
              [b[0] + 1, b[1], 0],
              [...a, 1],
            ]);
            await touch('touchMove', [[...a, 1]]);
            await touch('touchEnd', []);
          },
        },
        {
          // And the other way round: A rests on a bench player; B comes down on a floor
          // player of the same team, slides a little and lifts; then A lifts.
          name: 'a finger on a bench player, then one on a floor player; the second slides and lifts',
          async fingers() {
            await touch('touchStart', [a]);
            await touch('touchStart', [a, b]);
            for (let i = 1; i <= 4; i += 1) {
              await touch('touchMove', [a, [b[0] + i * 4, b[1] + i * 3]]);
            }
            await touch('touchMove', [a]);
            await touch('touchEnd', []);
          },
        },
      ];
      for (const fingers of cases) {
        await page.evaluate(() => (window.pressesSeen = []));
        await fingers.fingers();
        // A play made wrongly would be stored and shown a moment later: a moment is given
        // here, and the count after the one drag below (exactly one play more) settles it
        // however slow the machine.
        await page.waitForTimeout(600);
        const presses = await page.evaluate(() => window.pressesSeen);
        note(
          `the page was touched by two fingers at once (${fingers.name})`,
          presses.length === 2 &&
            presses.every((press) => press.type === 'touch') &&
            presses.filter((press) => press.first).length === 1,
          JSON.stringify(presses),
        );
        note(
          `two fingers on two tiles record no substitution and no play (finding H1; ${fingers.name})`,
          (await c.root.getAttribute('data-plays')) === plays &&
            (await c.onCourtById(benchId)) === false &&
            (await c.onCourtById(floorId)) === true &&
            (await c.root.locator('[data-drop]').count()) === 0,
          `plays ${plays} then ${await c.root.getAttribute('data-plays')}; bench player on: ${await c.onCourtById(benchId)}; floor player on: ${await c.onCourtById(floorId)}`,
        );
        // Whatever the fingers left open is closed.
        await page.keyboard.press('Escape');
        await c.pad.locator('[data-rest]').waitFor();
      }
      // Then one finger drags the bench player onto the floor player: a substitution.
      await c.recorded(async () => {
        await touch('touchStart', [a]);
        for (let i = 1; i <= 8; i += 1) {
          await touch('touchMove', [
            [a[0] + ((b[0] - a[0]) * i) / 8, a[1] + ((b[1] - a[1]) * i) / 8].map(Math.round),
          ]);
        }
        await touch('touchEnd', []);
      });
      await c.saved();
      note(
        'one finger dragging a bench player onto a floor player substitutes them',
        (await c.onCourtById(benchId)) === true && (await c.onCourtById(floorId)) === false,
      );
      note(
        'the game holds exactly one play more: the drag’s, and nothing from the two fingers',
        Number(await c.root.getAttribute('data-plays')) === Number(plays) + 1,
      );
      const moved = await scrollsSeen(page);
      note(
        'a finger’s drag scrolled nothing',
        moved.moved.length === 0,
        JSON.stringify(moved.moved),
      );
      note('nothing broke on the page', errors.length === 0, errors.join('; '));
    } finally {
      await letGo(page, context);
    }
  });

  await step('a press whose lift never comes records nothing (the code look, L1)', async () => {
    const { context, page, errors } = await scorekeeperAt(phone);
    try {
      await page.goto(`${origin}${trackerPath()}`);
      const c = await openCourt(page);
      await c.saved();
      const benchTile = c.root.locator('[data-bench="home"] > [data-player]').first();
      const floorTile = c.root.locator('[data-floor="home"] > [data-player]').first();
      const [benchId, floorId] = [
        await benchTile.getAttribute('data-player'),
        await floorTile.getAttribute('data-player'),
      ];
      const plays = await c.root.getAttribute('data-plays');
      // The mouse presses a bench player and drags it; the button is let go outside the
      // window, so the page never hears the lift. The press and the moves are sent as the
      // browser sends them, and no lift.
      const pressAndDrag = () =>
        benchTile.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const [x, y] = [r.x + r.width / 2, r.y + r.height / 2];
          const send = (type, dy) =>
            el.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                composed: true,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true,
                button: type === 'pointerdown' ? 0 : -1,
                buttons: 1,
                clientX: x,
                clientY: y - dy,
              }),
            );
          send('pointerdown', 0);
          for (let i = 1; i <= 6; i += 1) send('pointermove', i * 6);
        });
      await pressAndDrag();
      await c.root.locator('.court-ghost').waitFor();
      note('a mouse press on a bench player that moves is a drag', true);
      // Back in the window, the mouse comes to a floor player of the same team and clicks.
      const box = await floorTile.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await c.pad.locator(`[data-options="${floorId}"]`).waitFor();
      await page.waitForTimeout(600);
      note(
        'the mouse let go outside the window: the click on a floor player selects them, and records nothing',
        (await c.root.getAttribute('data-plays')) === plays &&
          (await c.onCourtById(benchId)) === false &&
          (await c.onCourtById(floorId)) === true &&
          (await c.root.locator('.court-ghost').count()) === 0 &&
          (await c.root.locator('[data-drop]').count()) === 0,
        `plays ${plays} then ${await c.root.getAttribute('data-plays')}`,
      );
      await page.keyboard.press('Escape');
      await c.pad.locator('[data-rest]').waitFor();
      // The window losing the focus in the middle of a drag ends it too.
      await pressAndDrag();
      await c.root.locator('.court-ghost').waitFor();
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await c.root.locator('.court-ghost').waitFor({ state: 'detached' });
      note(
        'the window losing the focus ends a drag, recording nothing',
        (await c.root.getAttribute('data-plays')) === plays &&
          (await c.root.locator('[data-drop]').count()) === 0,
      );
      note('nothing broke on the page', errors.length === 0, errors.join('; '));
    } finally {
      await letGo(page, context);
    }
  });

  /**
   * Records every change of a tile's mark from now on, as the page sees it: whose tile,
   * where it is drawn (floor or bench), what it says and its state (`data-mark-state`).
   */
  const watchMarks = (c) =>
    c.root.evaluate((root) => {
      window.markLog = [];
      new MutationObserver((changes) => {
        for (const change of changes) {
          const el = change.target;
          if (!(el instanceof Element) || !el.matches('[data-teams] [data-player]')) continue;
          window.markLog.push({
            player: el.dataset.player,
            floor: el.closest('[data-floor]') !== null,
            mark: el.getAttribute('data-mark'),
            state: el.getAttribute('data-mark-state'),
          });
        }
      }).observe(root, { attributes: true, subtree: true, attributeFilter: ['data-mark-state'] });
    });
  /**
   * Waits until `player`'s tile has shown these states in this order (null: the mark taken
   * off), where asked on the floor or the bench and with that mark. False if it never does.
   */
  const marksShown = (page, player, states, where = {}) =>
    page
      .waitForFunction(
        ([id, wanted, floor, mark]) => {
          const seen = window.markLog
            .filter((one) => one.player === id)
            .filter((one) => floor === null || one.floor === floor)
            .filter((one) => mark === null || one.mark === mark || one.state === null)
            .map((one) => one.state);
          let at = 0;
          for (const state of seen) if (at < wanted.length && state === wanted[at]) at += 1;
          return at === wanted.length;
        },
        [player, states, where.floor ?? null, where.mark ?? null],
        { timeout: 15_000 },
      )
      .then(
        () => true,
        () => false,
      );
  const markLog = (page) => page.evaluate(() => JSON.stringify(window.markLog));

  await step('a substitution’s marks stay with the two players (the code look, L2)', async () => {
    const { context, page, errors } = await scorekeeperAt(phone);
    try {
      await page.goto(`${origin}${trackerPath()}`);
      const c = await openCourt(page);
      await c.saved();
      await watchMarks(c);
      // A substitution stored: the player who came on carries "On" on their floor tile,
      // drawn anew there, as stored; the one who went off carries "Off" on the bench.
      const benchTile = c.root.locator('[data-bench="home"] > [data-player]').first();
      const benchId = await benchTile.getAttribute('data-player');
      const goingTile = c.root.locator('[data-floor="home"] > [data-player]').nth(1);
      const goingId = await goingTile.getAttribute('data-player');
      await c.recorded(() => c.drag(benchTile, goingTile));
      note(
        'after a stored substitution the incoming player’s floor tile carries "On", stored (L2)',
        (await c.onCourtById(benchId)) &&
          (await marksShown(page, benchId, ['stored'], { floor: true, mark: 'On' })),
        await markLog(page),
      );
      note(
        'and the player who went off carries "Off" on their bench tile, stored (L2)',
        await marksShown(page, goingId, ['stored'], { floor: false, mark: 'Off' }),
        await markLog(page),
      );
      await c.saved();
      note('nothing broke on the page', errors.length === 0, errors.join('; '));
    } finally {
      await letGo(page, context);
    }
  });

  await step('a tap’s mark: taken, then stored or gone (the code look, L4)', async () => {
    const { context, page, errors } = await scorekeeperAt(phone);
    let other = null;
    try {
      await page.goto(`${origin}${trackerPath()}`);
      const c = await openCourt(page);
      await c.saved();
      await watchMarks(c);
      const floorTile = c.root.locator('[data-floor="home"] > [data-player]').first();
      const floorId = await floorTile.getAttribute('data-player');

      // An accepted tap: its mark is taken (hollow), then stored (solid).
      await floorTile.click();
      await c.pad.locator(`[data-options="${floorId}"]`).waitFor();
      await c.recorded(() => c.option('p2').click());
      note(
        'an accepted tap marks the tile "taken", then "stored" (L4)',
        await marksShown(page, floorId, ['taken', 'stored']),
        await markLog(page),
      );
      await c.saved();

      // A refused tap: the device cannot keep it (its store refuses every write). The mark
      // is taken off at once and the refusal is said in a sentence (L4).
      await page.evaluate(() => {
        window.markLog.length = 0;
        const transaction = IDBDatabase.prototype.transaction;
        window.storeWorks = () => (IDBDatabase.prototype.transaction = transaction);
        IDBDatabase.prototype.transaction = function refusing(names, mode, ...rest) {
          if (mode === 'readwrite') throw new DOMException('made-up failure', 'UnknownError');
          return transaction.call(this, names, mode, ...rest);
        };
      });
      const playsBefore = await c.root.getAttribute('data-plays');
      await floorTile.click();
      await c.pad.locator(`[data-options="${floorId}"]`).waitFor();
      await c.option('p3').click();
      await c.said
        .filter({ hasText: 'This device could not keep that tap, so it was not recorded.' })
        .waitFor();
      const refusedMark = await floorTile.evaluate((el) => ({
        mark: el.getAttribute('data-mark'),
        state: el.getAttribute('data-mark-state'),
      }));
      note(
        'a refused tap: the mark was shown taken, is gone, and the sentence is shown (L4)',
        (await marksShown(page, floorId, ['taken', null])) &&
          refusedMark.mark === null &&
          refusedMark.state === null &&
          (await c.root.getAttribute('data-plays')) === playsBefore,
        JSON.stringify({ refusedMark, log: await page.evaluate(() => window.markLog) }),
      );
      await page.evaluate(() => window.storeWorks());

      // A tap made as this device stops scoring (another device takes the game over
      // while the tap is being kept): the page that replaces the scoring screen says the
      // last tap was not recorded (`data-last-tap-lost`, L4).
      await page.evaluate((storeName) => {
        let open;
        window.writesHeld = new Promise((resolve) => (open = resolve));
        window.letWritesGo = () => open();
        const transaction = IDBDatabase.prototype.transaction;
        IDBDatabase.prototype.transaction = function holding(names, mode, ...rest) {
          const made = transaction.call(this, names, mode, ...rest);
          if (this.name !== storeName || mode !== 'readwrite') return made;
          // Its end is told only once the writes are let go.
          Object.defineProperty(made, 'oncomplete', {
            set(run) {
              made.addEventListener('complete', (event) =>
                window.writesHeld.then(() => run.call(made, event)),
              );
            },
          });
          return made;
        };
      }, queueDatabase);
      await floorTile.click();
      await c.pad.locator(`[data-options="${floorId}"]`).waitFor();
      await c.option('p1').click();
      other = await scorekeeperAt(phone);
      await other.page.goto(`${origin}${trackerPath()}`);
      const taken = await court(other.page).open();
      note('another device takes the game over', taken.tookOver);
      // This device asks the server again (as when the network is back), and is told.
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await c.root.waitFor({ state: 'detached' });
      await page.evaluate(() => window.letWritesGo());
      const lost = page.locator('[data-last-tap-lost]');
      await lost.waitFor();
      note(
        'a tap made as the device stops scoring is said not recorded on the page that follows (L4)',
        /Your last tap was made as this device stopped scoring/.test(await lost.innerText()),
      );
      note('nothing broke on the page', errors.length === 0, errors.join('; '));
    } finally {
      await letGo(page, context);
      if (other !== null) await letGo(other.page, other.context);
    }
  });

  await step('the five sizes: targets, the two teams’ places, less motion', async () => {
    for (const size of sizes) {
      const { context, page } = await scorekeeperAt(size);
      const label = `${size.width} x ${size.height}`;
      const fold = folded(size);
      try {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(`${origin}${trackerPath()}`);
        const c = await openCourt(page);
        await noSidewaysScroll(page, label);
        await measureTargets(page, `${label}, the pad at rest`);
        note(
          `${label}: neither team’s panel scrolls, so no row of it is cut`,
          await page.evaluate(() =>
            [...document.querySelectorAll('.court-team')].every(
              (panel) => panel.scrollHeight <= panel.clientHeight,
            ),
          ),
        );
        // The hint says only what this size offers (second look, L2): dragging a bench
        // player where a bench is on the screen to drag from, the bench's button where
        // it is folded away.
        const hint = await c.pad.locator('[data-hint]').innerText();
        note(
          `${label}: the hint offers ${fold ? 'the bench’s button, and no drag' : 'the drag from the bench'}`,
          fold ? !/drag/i.test(hint) && /“Bench”/.test(hint) : /drag a bench player/.test(hint),
          hint,
        );
        // And it fits (L3). The game is in play and its clock is stopped, so the pad
        // begins with the Start clock button of step 2.36, whose own line says the rest:
        // the hint is then its first two sentences. All four, with the clock running, are
        // measured at each size by that step (scoring-clock-steps.mjs).
        await restFits(page, `${label}, in play`, 2);
        // Where only its three dots show, More is still named for a screen reader.
        note(
          `${label}: the More button is named "More" for a screen reader, word shown or not`,
          await page.getByRole('button', { name: 'More', exact: true }).isVisible(),
        );
        // The benches are lines of players, except where they are folded away.
        await measureLines(page, `${label}, the pad at rest`, fold ? 0 : 2);
        note(
          `${label}: the bench is ${fold ? 'folded away, behind its button' : 'on the screen, with no button'}`,
          (await c.benchButton('home').isVisible()) === fold &&
            (await c.root.locator('[data-bench="home"]').isVisible()) === !fold,
        );
        const places = await page.evaluate(() => {
          const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
          const [home, away, top, pad] = [
            rect('.court-team[data-side="home"]'),
            rect('.court-team[data-side="away"]'),
            rect('.court-top'),
            rect('[data-pad]'),
          ];
          return {
            sideBySide: away.left >= home.right,
            stacked: away.top >= home.bottom,
            scoreboardOnTop: top.top < 12 && top.bottom <= Math.min(home.top, away.top, pad.top),
            floorTilesOnScreen: [...document.querySelectorAll('[data-floor] .court-tile')].every(
              (el) => {
                const r = el.getBoundingClientRect();
                return r.top >= 0 && r.bottom <= window.innerHeight;
              },
            ),
            padOnScreen: pad.top >= 0 && pad.bottom <= window.innerHeight,
            page: document.scrollingElement.scrollHeight - window.innerHeight,
          };
        });
        const wide = size === phoneLying || size === tabletLying;
        note(
          `${label}: the two teams are ${wide ? 'side by side' : 'stacked'} (S2)`,
          wide ? places.sideBySide : places.stacked,
        );
        note(
          `${label}: the scoreboard is on top and never leaves (T1)`,
          places.scoreboardOnTop && places.page <= 0,
        );
        note(
          `${label}: both teams’ five and the pad are on the screen`,
          places.floorTilesOnScreen && places.padOnScreen,
        );
        // The account button of step 2.127 is in the frame (DESIGN.md section 7, line 11):
        // its menu opens inside the screen, whole, over everything (not under the pad),
        // and opening it scrolls nothing.
        await watchScrolling(page);
        const account = c.root.locator('[data-account]');
        const summary = account.locator(':scope > summary');
        await summary.click();
        await account.locator('.site-account-panel').waitFor();
        const menu = await account.evaluate((el) => {
          const panel = el.querySelector('.site-account-panel').getBoundingClientRect();
          const button = el.querySelector(':scope > summary').getBoundingClientRect();
          const entries = [
            ...el.querySelectorAll('.site-account-panel a, .site-account-panel button'),
          ];
          return {
            inside:
              panel.left >= 0 &&
              panel.top >= 0 &&
              panel.right <= window.innerWidth &&
              panel.bottom <= window.innerHeight,
            button: [Math.round(button.width), Math.round(button.height)],
            entries: entries.length,
            onTop: entries.every((entry) => {
              const r = entry.getBoundingClientRect();
              return (
                r.height >= 43.99 &&
                entry.contains(
                  document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2),
                )
              );
            }),
            signOut: entries.some((entry) => entry.textContent.trim() === 'Sign out'),
            page: document.scrollingElement.scrollHeight - window.innerHeight,
          };
        });
        const scrolledByMenu = await scrollsSeen(page);
        note(
          `${label}: the account button’s menu opens inside the screen, over the pad, nothing scrolling`,
          menu.inside &&
            menu.onTop &&
            menu.signOut &&
            menu.entries >= 3 &&
            menu.button[0] >= 44 &&
            menu.button[1] >= 44 &&
            menu.page <= 0 &&
            scrolledByMenu.events === 0 &&
            scrolledByMenu.moved.length === 0,
          JSON.stringify({ menu, scrolledByMenu }),
        );
        await summary.click();
        await account.locator('.site-account-panel').waitFor({ state: 'hidden' });
        // With a floor player's options open, and a bench player's.
        const first = c.root.locator('[data-floor="home"] .court-tile').first();
        await first.click();
        await c.pad.locator('[data-options]').waitFor();
        await measureTargets(page, `${label}, a floor player’s options`);
        await measureLines(page, `${label}, a floor player’s options`, fold ? 1 : 3);
        note(
          `${label}: the options are on the screen`,
          await c.pad.locator('[data-act="turnover"]').evaluate((el) => {
            const r = el.getBoundingClientRect();
            return r.bottom <= window.innerHeight && r.right <= window.innerWidth;
          }),
        );
        // A bench player is tapped in the bench's line, or, where the bench is folded
        // away, in the bench its button opens in the pad.
        if (fold) {
          await c.benchButton('away').click();
          await c.pad.locator('[data-bench-list="away"]').waitFor();
          await measureTargets(page, `${label}, the bench in the pad`);
          await c.pad.locator('[data-bench-pick]').first().click();
        } else {
          await c.root.locator('[data-bench="away"] > [data-player]').first().click();
        }
        await c.pad.locator('[data-options] [data-act="sub"]').nth(4).waitFor();
        await measureTargets(page, `${label}, a bench player’s options`);
        // "In for" is not a line that folds: all five on the court are in it, whole.
        await measureLines(page, `${label}, a bench player’s options`, fold ? 0 : 2);
        const inFor = await c.pad.locator('[data-all] > [data-act="sub"]').evaluateAll((els) => {
          const pad = document.querySelector('[data-pad]').getBoundingClientRect();
          return els.map((el) => {
            const r = el.getBoundingClientRect();
            return (
              r.width >= 43.99 &&
              r.height >= 43.99 &&
              r.left >= pad.left &&
              r.right <= pad.right &&
              r.top >= pad.top &&
              r.bottom <= pad.bottom &&
              el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))
            );
          });
        });
        note(
          `${label}: "In for" shows all five on the court, each whole in the pad`,
          inFor.length === 5 && inFor.every(Boolean),
          JSON.stringify(inFor),
        );
        await accessible(page, `${label}, a bench player’s options`);
        // Less motion: what was tapped still shows on the tile, with no movement (S5).
        await first.click();
        await c.pad
          .locator(`[data-options="${await first.getAttribute('data-player')}"]`)
          .waitFor();
        const playsBefore = await c.root.getAttribute('data-plays');
        // The mark is read by the page itself the moment it is put on the tile: it stays
        // two thirds of a second, which a slower machine could take to ask for it.
        await first.evaluate((el) => {
          window.markSeen = null;
          window.markStored = null;
          new MutationObserver(() => {
            if (window.markStored === null && el.getAttribute('data-mark-state') === 'stored') {
              window.markStored = {
                state: 'stored',
                animation: getComputedStyle(el, '::after').animationName,
              };
            }
          }).observe(el, { attributes: true, attributeFilter: ['data-mark-state'] });
          new MutationObserver(() => {
            if (window.markSeen !== null || !el.hasAttribute('data-mark')) return;
            window.markSeen = {
              mark: el.getAttribute('data-mark'),
              state: el.getAttribute('data-mark-state'),
              animation: getComputedStyle(el, '::after').animationName,
            };
          }).observe(el, { attributes: true, attributeFilter: ['data-mark'] });
        });
        await c.option('p1').click();
        const motion = await (await page.waitForFunction(() => window.markSeen)).jsonValue();
        note(
          `${label}: with less motion asked for, the tap shows and nothing moves (S5)`,
          motion.mark === '+1' && motion.state === 'taken' && motion.animation === 'none',
          JSON.stringify(motion),
        );
        // And once stored, the mark is solid, still with nothing moving.
        const storedMotion = await (
          await page.waitForFunction(() => window.markStored)
        ).jsonValue();
        note(
          `${label}: with less motion asked for, the stored mark is solid and nothing moves (S5)`,
          storedMotion.state === 'stored' && storedMotion.animation === 'none',
          JSON.stringify(storedMotion),
        );
        // Nothing is selected by a long press, and a double tap does not zoom (S1).
        const calm = await c.root.evaluate((el) => ({
          select: getComputedStyle(el).userSelect,
          touch: getComputedStyle(el).touchAction,
        }));
        note(
          `${label}: calm under the hand (S1)`,
          calm.select === 'none' && calm.touch === 'manipulation',
        );
        await page.waitForFunction(
          (before) => document.querySelector('[data-scoring]').dataset.plays !== before,
          playsBefore,
        );
        await c.saved();
      } finally {
        await letGo(page, context);
      }
    }
  });

  await step(
    'a tap is painted within 100 ms with 500 taps waiting and the processor slowed four times',
    async () => {
      const { context, page } = await scorekeeperAt(phone);
      try {
        // The clock's ticker is a timer of a quarter of a second (step 2.36): each of
        // its ticks is timed, from outside the screen's code.
        await context.addInitScript(() => {
          window.clockTicks = [];
          const set = window.setInterval;
          window.setInterval = (run, ms, ...rest) =>
            ms === 250
              ? set(
                  () => {
                    const began = performance.now();
                    run();
                    window.clockTicks.push(performance.now() - began);
                  },
                  ms,
                  ...rest,
                )
              : set(run, ms, ...rest);
        });
        await page.goto(`${origin}${trackerPath()}`);
        const c = await openCourt(page);
        await c.saved();
        // No connection: every tap from here waits on the device.
        await context.setOffline(true);
        const home = c.root.locator('[data-floor="home"] .court-tile').first();
        const id = await home.getAttribute('data-player');
        await page.evaluate(async (playerId) => {
          const tile = document.querySelector(`[data-teams] [data-player="${playerId}"]`);
          const drawn = () => new Promise((resolve) => setTimeout(resolve, 0));
          for (let i = 0; i < 500; i += 1) {
            tile.click();
            // The options are drawn before the next tap, as for a hand.
            while (document.querySelector('[data-pad] [data-act="p1"]') === null) await drawn();
            document.querySelector('[data-pad] [data-act="p1"]').click();
            while (document.querySelector('[data-pad] [data-act="p1"]') !== null) await drawn();
          }
        }, id);
        await page.waitForFunction(
          () => /^500 /.test(document.querySelector('[data-saved-banner]').textContent),
          null,
          { timeout: 120_000 },
        );
        note(
          'the banner tells the truth: 500 waiting to send',
          (await c.banner.getAttribute('data-state')) === 'waiting',
        );
        // The clock is started (step 2.36) and runs through the hundred plays measured
        // below: a running clock must never make a tile's tap late. Start is a tap like
        // any other, kept on the device with no connection.
        await c.startClock();

        // The processor slowed four times, as on a five-year-old tablet.
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        // Times each tap from the moment it is made (the finger lifts: the browser's own
        // time on the click) to the frame that shows it.
        await page.evaluate(
          ([playerId, storeName]) => {
            const tile = document.querySelector(`[data-teams] [data-player="${playerId}"]`);
            const pad = document.querySelector('[data-pad]');
            const painted = (since, into) =>
              requestAnimationFrame(() => {
                const channel = new MessageChannel();
                channel.port1.onmessage = () => into.push(performance.now() - since);
                channel.port2.postMessage(0);
              });
            const times = { ringed: [], opened: [], marked: [], counted: [], stored: [] };
            window.tapTimes = times;
            // When the device's own store of waiting taps finishes a write: every writing
            // transaction on it is watched to its end, from outside the screen's code.
            const writes = [];
            times.writes = writes;
            const transaction = IDBDatabase.prototype.transaction;
            IDBDatabase.prototype.transaction = function watched(names, mode, ...rest) {
              const made = transaction.call(this, names, mode, ...rest);
              if (this.name === storeName && mode === 'readwrite') {
                const began = performance.now();
                made.addEventListener('complete', () =>
                  writes.push({ began, done: performance.now() }),
                );
              }
              return made;
            };
            let touched = 0;
            let waiting = null;
            document.addEventListener(
              'click',
              (event) => {
                touched = event.timeStamp;
                waiting = event.target.closest('[data-act]') ? 'option' : 'tile';
              },
              true,
            );
            // The options are in the pad: drawn a frame after the tile's ring.
            let opening = 0;
            new MutationObserver(() => {
              if (opening !== 0 && pad.querySelector('[data-options]') !== null) {
                painted(opening, times.opened);
                opening = 0;
              }
            }).observe(pad, { childList: true, subtree: true });
            // The tile is ringed the moment it is tapped; an option tapped marks it with
            // what was tapped, before that is saved; then the tile counts it.
            let marked = 0;
            new MutationObserver((changes) => {
              for (const change of changes) {
                const set = tile.hasAttribute(change.attributeName);
                const ringed = tile.getAttribute('data-tapped') === 'on';
                if (change.attributeName === 'data-tapped' && ringed && waiting === 'tile') {
                  waiting = null;
                  opening = touched;
                  painted(touched, times.ringed);
                } else if (change.attributeName === 'data-mark' && set && waiting === 'option') {
                  waiting = null;
                  marked = touched;
                  painted(touched, times.marked);
                } else if (change.attributeName === 'data-points' && marked !== 0) {
                  painted(marked, times.counted);
                  // The tile counts the play now. The store's first write begun since the
                  // tap, and when it finished: after now, if the count was shown first.
                  const now = performance.now();
                  const since = marked;
                  const write = writes.find((one) => one.began >= since);
                  times.stored.push({
                    wrote: write === undefined ? null : write.done - since,
                    counted: now - since,
                  });
                  marked = 0;
                }
              }
            }).observe(tile, { attributes: true, subtree: true });
          },
          [id, queueDatabase],
        );
        const center = async (locator) => {
          const box = await locator.boundingBox();
          return [box.x + box.width / 2, box.y + box.height / 2];
        };
        // The pad never moves, so where +2 is, is found once. Nothing is asked of the
        // page between taps: the only work on it is the screen's own, as on a tablet.
        const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const tileAt = await center(home);
        await page.mouse.click(...tileAt);
        await c.pad.locator('[data-act="p2"]').waitFor();
        const optionAt = await center(c.option('p2'));
        await page.mouse.click(...optionAt);
        const p = (list, q) =>
          [...list].sort((a, b) => a - b)[Math.ceil(list.length * q) - 1] ?? NaN;
        const line = (name, list) =>
          `${name}: ${list.length} taps, median ${p(list, 0.5).toFixed(0)} ms, 95th in 100 ${p(list, 0.95).toFixed(0)} ms, slowest ${Math.max(...list).toFixed(0)} ms`;
        const inTime = (list) => list.length === 100 && p(list, 0.95) <= 100;
        // A hundred plays at a scorekeeper's pace: the option a third of a second after
        // the player, the next play a little later. Each tap lasts as long as a finger's
        // does (60 ms down); a tap with no length at all is a test's, not a hand's.
        const finger = { delay: 60 };
        const hundredPlays = async () => {
          await pause(1500);
          await page.evaluate(() => {
            for (const list of Object.values(window.tapTimes)) list.length = 0;
          });
          for (let i = 0; i < 100; i += 1) {
            await page.mouse.click(...tileAt, finger);
            await pause(300);
            await page.mouse.click(...optionAt, finger);
            await pause(600);
          }
          await pause(1500);
          const measured = await page.evaluate(() => window.tapTimes);
          console.log('Tap to paint, 500 taps waiting, processor slowed 4 times (finding M6):');
          console.log(`  ${line('a player tapped, the tile ringed', measured.ringed)}`);
          console.log(`  ${line('…and its options drawn in the pad', measured.opened)}`);
          console.log(`  ${line('an option tapped, the tile marked with it', measured.marked)}`);
          console.log(`  ${line('…and the tile counting it, once stored', measured.counted)}`);
          console.log(
            `  ${line(
              '…of which, the device’s store finishing its write',
              measured.stored.map((play) => play.wrote ?? NaN),
            )}`,
          );
          return measured;
        };
        // One run, and it is the answer: a run that misses is a failure, not a reason
        // to measure again.
        const times = await hundredPlays();
        // The clock's ticking draws no tile again (step 2.36): for three seconds of a
        // running clock, still slowed four times, with nobody tapping, the clock's own
        // place changes and nothing of any tile does: no tile is replaced, none gains or
        // loses a mark or a word. (Only the minutes' own places are written, and they
        // are not shown on a phone.) The last play's mark has left its tile first.
        await page.waitForFunction(
          () => document.querySelector('[data-teams] [data-mark]') === null,
        );
        const ticking = await page.evaluate(
          () =>
            new Promise((resolve) => {
              const teams = document.querySelector('[data-teams]');
              const tiles = [...teams.querySelectorAll('[data-player]')];
              const seen = { clock: 0, tiles: 0, minutes: 0 };
              const onTiles = new MutationObserver((changes) => {
                for (const change of changes) {
                  const at =
                    change.target.nodeType === Node.TEXT_NODE
                      ? change.target.parentElement
                      : change.target;
                  if (at?.closest('[data-minutes-of]')) seen.minutes += 1;
                  else seen.tiles += 1;
                }
              });
              onTiles.observe(teams, {
                subtree: true,
                childList: true,
                attributes: true,
                characterData: true,
              });
              const onClock = new MutationObserver(() => (seen.clock += 1));
              onClock.observe(document.querySelector('[data-clock-time]'), {
                subtree: true,
                childList: true,
                characterData: true,
              });
              setTimeout(() => {
                onTiles.disconnect();
                onClock.disconnect();
                const after = [...teams.querySelectorAll('[data-player]')];
                // Every tick of the clock since it was started, the hundred plays
                // included: how long each held the page (timed from outside the
                // screen's code, by the watch put on its quarter-second timer).
                const ticks = [...window.clockTicks].sort((a, b) => a - b);
                resolve({
                  ...seen,
                  ticks: ticks.length,
                  usual: ticks[Math.ceil(ticks.length * 0.95) - 1] ?? NaN,
                  long: Math.max(0, ...ticks),
                  running: document.querySelector('[data-clock-toggle]').dataset.state,
                  sameTiles: tiles.length === after.length && tiles.every((t, i) => t === after[i]),
                });
              }, 3200);
            }),
        );
        console.log(
          `  the clock running, slowed 4 times: in 3.2 seconds its place written ${ticking.clock} times, a tile changed ${ticking.tiles} times; ${ticking.ticks} ticks through the hundred plays, each holding the page ${ticking.usual.toFixed(1)} ms or less 95 times in 100, the slowest ${ticking.long.toFixed(1)} ms`,
        );
        note(
          'the clock’s ticking draws no tile again: only the clock’s own place changes',
          ticking.running === 'pause' &&
            ticking.clock >= 2 &&
            ticking.clock <= 5 &&
            ticking.tiles === 0 &&
            ticking.sameTiles,
          JSON.stringify(ticking),
        );
        // A tick is the clock read and, once a second, a few words written: with the
        // processor slowed four times it takes less than the 16 ms of one frame, 95
        // times in 100 as the taps are judged, so a tap made while the clock runs does
        // not wait on it.
        note(
          'a tick of the clock holds the page for less than a frame (16 ms), 95 times in 100, slowed four times, through the hundred plays',
          ticking.ticks >= 100 && ticking.usual < 16,
          `${ticking.ticks} ticks, 95 in 100 within ${ticking.usual.toFixed(1)} ms, the slowest ${ticking.long.toFixed(1)} ms`,
        );
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        await c.pauseClock();
        note(
          'a player’s tap is painted within 100 ms, 95 times in 100',
          inTime(times.ringed),
          line('ringed', times.ringed),
        );
        note(
          'an option’s tap is painted on the tile within 100 ms, 95 times in 100',
          inTime(times.marked),
          line('marked', times.marked),
        );
        note(
          'every tap opened its options and its play was counted on the tile',
          times.opened.length === 100 && times.counted.length === 100,
          `${times.opened.length} opened, ${times.counted.length} counted`,
        );
        // Write before show (T-114): for every play, the device's store had finished a
        // write after the tap and before the tile counted it. A screen that counted
        // first would show `wrote` missing or later than `counted`.
        const shownFirst = times.stored.filter(
          (play) => play.wrote === null || play.wrote > play.counted,
        );
        note(
          'every play was written to the device’s store before the tile counted it (T-114)',
          times.stored.length === 100 && shownFirst.length === 0,
          `${times.stored.length} plays timed; counted before written: ${JSON.stringify(shownFirst.slice(0, 3))}`,
        );
        // And the store wrote once for each play, no more: a write found after a tap is
        // that tap's own, not some other work of the store's.
        note(
          'the device’s store wrote once for each of the hundred plays',
          times.writes.length === 100,
          `${times.writes.length} writes`,
        );
        // Back on the network, everything waiting is sent and nothing is lost.
        await context.setOffline(false);
        await page.evaluate(() => window.dispatchEvent(new Event('online')));
        await page.waitForFunction(
          () => document.querySelector('[data-saved-banner]').dataset.state === 'saved',
          null,
          { timeout: 180_000 },
        );
        // The 500 plays, the hundred measured, and the clock's Start and Pause.
        note('with the network back, every waiting tap is saved', true);
      } finally {
        await letGo(page, context);
      }
    },
  );

  await step('fifteen a side: a long bench ends in a tile that says how many more', async () => {
    const { context, page, errors } = await scorekeeperAt(phone);
    try {
      await page.goto(`${origin}${trackerPath()}`);
      const c = await openCourt(page);
      await c.saved();
      // The game is let go of, three more a side are added at the table, and it is
      // opened again: fifteen a side, a bench of ten.
      await c.more.click();
      await Promise.all([
        page.waitForURL((url) => !url.pathname.includes('/score/')),
        c.sheet.getByRole('link', { name: 'Back to your games' }).click(),
      ]);
      await addPlayers(origin, evenMorePlayers);
      await page.goto(`${origin}${trackerPath()}`);
      await c.open();
      await c.root.locator('[data-bench="home"][data-more]').waitFor();
      await c.root.locator('[data-bench="away"][data-more]').waitFor();
      const lines = await measureLines(page, 'fifteen a side, in play', 2);
      note(
        'fifteen a side: each bench shows as many as fit whole and its end tile says how many more',
        lines.every((line) => line.players === 10 && line.more >= 2 && line.end === 'whole'),
        JSON.stringify(lines),
      );
      await measureTargets(page, 'fifteen a side, in play');
      await accessible(page, 'fifteen a side, in play');
      await noSidewaysScroll(page, 'fifteen a side');

      // The phone turned on its side (second look, L1): a bench of ten is two rows ending
      // in the tile that says how many more; no third row is cut and neither team's
      // panel scrolls. Then it is turned back.
      await page.setViewportSize({ width: phoneLying.width, height: phoneLying.height });
      const lying = await measureLines(page, 'fifteen a side, the phone lying down', 2);
      const panels = await page.evaluate(() =>
        [...document.querySelectorAll('.court-team')].map(
          (panel) => panel.scrollHeight - panel.clientHeight,
        ),
      );
      note(
        'fifteen a side, the phone lying down: two rows of bench and "N more", no panel scrolling',
        lying.every((line) => line.players === 10 && line.more >= 2 && line.end === 'whole') &&
          panels.every((over) => over <= 0),
        JSON.stringify({ lying, panels }),
      );
      await measureTargets(page, 'fifteen a side, the phone lying down');
      await page.setViewportSize({ width: phone.width, height: phone.height });
      await measureLines(page, 'fifteen a side, the phone upright again', 2);

      // The keyboard goes through the bench without landing on a player who is not
      // shown, and without scrolling the line to one.
      await c.root.locator('[data-bench="home"] > [data-player]').first().focus();
      let lost = 0;
      for (let i = 0; i < 12; i += 1) {
        await page.keyboard.press('Tab');
        lost += await page.evaluate(() => {
          const el = document.activeElement;
          const r = el.getBoundingClientRect();
          return el.hasAttribute('data-folded') || r.width === 0 || r.height === 0 ? 1 : 0;
        });
      }
      const afterKeys = await playerLines(page);
      note(
        'fifteen a side: the keyboard never lands on a hidden player or scrolls a line',
        lost === 0 && afterKeys.every((line) => !line.scrolled),
        `${lost} hidden; ${JSON.stringify(afterKeys)}`,
      );

      // The end tile opens the whole bench in the pad.
      await c.moreTile(c.root.locator('[data-bench="home"]')).click();
      const list = c.pad.locator('[data-bench-list="home"]');
      await list.waitFor();
      note(
        'fifteen a side: the end tile opens all ten of the bench in the pad',
        (await list.locator('[data-bench-pick]').count()) === 10,
      );
      await accessible(page, 'fifteen a side, the bench in the pad');
      await measureTargets(page, 'fifteen a side, the bench in the pad');
      await c.pad.locator('.court-close').click();
      await c.pad.locator('[data-rest]').waitFor();

      // A floor player's "Sub in" ends in the tile too; it opens the bench to come in
      // for that player, and the last of the bench (not shown in the line) comes on.
      const going = c.root.locator('[data-floor="home"] > [data-player]').first();
      const goingId = await going.getAttribute('data-player');
      await going.click();
      await c.pad.locator('[data-subs] [data-more]').waitFor();
      const subIn = (await measureLines(page, 'fifteen a side, "Sub in"', 3)).filter(
        (line) => line.line === 'pad',
      );
      note(
        'fifteen a side: "Sub in" shows as many as fit whole and says how many more',
        subIn.length === 1 && subIn[0].players === 10 && subIn[0].more >= 2,
        JSON.stringify(subIn),
      );
      await measureTargets(page, 'fifteen a side, "Sub in"');
      await c.moreTile(c.pad).click();
      await list.waitFor();
      const last = list.locator('[data-bench-pick]').last();
      const comingId = await last.getAttribute('data-bench-pick');
      await c.recorded(() => last.click());
      await c.saved();
      note(
        'fifteen a side: a bench player the line does not show comes on through the end tile',
        (await c.onCourtById(comingId)) && !(await c.onCourtById(goingId)),
      );
      await measureLines(page, 'fifteen a side, after the substitution', 2);
      note('nothing broke on the page', errors.length === 0, errors.join('; '));
    } finally {
      await letGo(page, context);
    }
  });

  // Step 2.36: the clock, periods, team fouls and timeouts, on the game played above.
  await clockSteps({
    step,
    note,
    origin,
    scorekeeperAt,
    openCourt,
    letGo,
    tapWhereItIs,
    measureTargets,
    watchScrolling,
    scrollsSeen,
    twoFrames,
    accessible,
    keyboardOn,
    restFits,
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Scoring screen browser test: ${failures.length} problem(s)`);
  for (const failure of failures) console.error(`  - ${failure}`);
  if (server) console.error(server.output().split('\n').slice(-15).join('\n'));
  process.exit(1);
}
console.log(`Scoring screen browser test passed: ${checked.length} checks.`);
