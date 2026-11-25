// Step 2.61, last part: the bad gym Wi-Fi test played as the table really is (2.107 audit,
// finding M13), in a real browser against the web app on its made-up stand-in
// (APP_ENV=test). Nothing leaves this computer; every team, game and person is made up.
// Builds the app first unless given --no-build. The cuts are those of bad-wifi-test.mjs,
// kept in a file of its own so each run stays short and readable.
//
// The made-up league's game under way (Hawks v Bears), on a server of its own, in a season
// switched to unique numbers, with every visiting player marked as left by the owner: a
// visiting team with no roster. At the phone upright, while the connection is cut and
// restored at random (the network off, the answers lost, batches slow, and a cut a random
// moment after a tap), the scorekeeper adds the visitors by number at the table through
// the Players panel ("4 8 15", then "16 Ada Walk-On", "23 Bo Guest"; the second add always
// goes slowly with its answer lost, so it is sent twice), picks both lineups and plays a
// scripted game in which the added players score and foul. The tab is closed and opened
// again three times: with no signal after the adds, with signal mid-game, with no signal
// after the clash.
//
// The number clash with no signal (S-44, P7 §2, T-261): with the signal off, a late "8 Cy
// Twin" is added while #8 is worn. The add is taken on the device and marked, never
// refused: the panel marks the clash while it is typed and on both #8 rows. What must hold
// once the signal is back, as S-44 says: the twin was taken by the server, not refused
// (nothing refused, nothing waiting, nothing listed not saved on the screen), both #8 rows
// still marked as a clash; on the server both #8 are on the visiting team, every player
// added at the table is marked for review (S-6), and the league's own roster screen marks
// the clash on both players for the admin (the season's unique rule waits for the admin's
// confirming, step 2.71).
//
// A session that ends while the device is away (step 2.242, T-356, T-357), twice. First,
// with the server's state held back from the device (so the state it keeps is older), an
// add of its own ("30 Di Own") is taken and "77 Ry Refused" is given an id the server
// refuses (one not made by a device, version 7); both count in the server's sequence. A
// foul is made with no signal and the tab closed; another tablet takes the game over and
// lets it go; the tab opened again with signal gets a new session, judges the commands
// since the state it kept by their IDs as its own, and carries the foul on: saved, nothing
// listed not saved. Second, at the end, a tap made with no signal and the tab closed;
// another tablet takes over, scores and lets go: the tab opened again lists the tap as not
// saved, with "Enter again" and nothing offered to send, and it is entered again. At the
// end the refused add is the only thing not saved, and nothing is listed.
//
// At the end the score and box score on the screen and the box score folded from the
// server's plays must equal the one counted from the script, the added players included,
// and the server must hold each added player with the number and name typed.
//
// BAD_WIFI_SEED=<n> replays a run's cuts (printed first; the browser's timing still varies);
// a failing run prints the seed and the order of events, BAD_WIFI_EVENTS=1 a passing one's
// too. Every wait has a limit, and the whole run fails after five minutes.
import { randomInt, randomUUID } from 'node:crypto';
import {
  court,
  league,
  leagueId,
  liveGame,
  owner,
  scorekeeper,
  sizes,
  starters,
  trackerPath,
} from './tracker-driver.mjs';
import {
  answered,
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
  whatWentWrong,
} from './web-browser-kit.mjs';

process.setMaxListeners(32);

const seed = Number(process.env.BAD_WIFI_SEED ?? randomInt(1, 2 ** 31));
if (!Number.isSafeInteger(seed)) throw new Error('BAD_WIFI_SEED must be a whole number');
console.log(`bad-wifi-visitors: seed ${seed} (BAD_WIFI_SEED=${seed} replays this run)`);

/** A small seeded generator (mulberry32), as in bad-wifi-test.mjs: the same seed, the same cuts. */
const generator = (start) => {
  let a = start >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const random = generator(seed);
const slowness = generator(seed ^ 0x9e3779b9);

const bears = ['Sol', 'Tam', 'Uma', 'Vic', 'Wes', 'Xan'].map((first) => `${first} Bearsley`);
const awayStarters = [4, 8, 15, 16, 23];
/** The players the table adds, as the server must keep them: number, first and last name. */
const added = [
  [4, '', ''],
  [8, '', ''],
  [15, '', ''],
  [16, 'Ada', 'Walk-On'],
  [23, 'Bo', 'Guest'],
  [30, 'Di', 'Own'],
];
const twin = [8, 'Cy', 'Twin'];
/** The add the server refuses (step 2.242): the id the device gives it is not version 4. */
const refusedAdd = { line: '77', name: 'Ry Refused', id: '018f0000-0000-7000-8000-000000000077' };

/** The game: adds, the lineups, the clash, and plays [side, jersey, what]. */
const script = [
  ['add', '4 8 15', ''],
  ['add', '16', 'Ada Walk-On'],
  ['add', '23', 'Bo Guest'],
  ['lineups'],
  ['home', 5, 'p2'],
  ['away', 4, 'p3'],
  ['away', 16, 'p2'],
  ['add', '30', 'Di Own'],
  ['refused'],
  ['home', 9, 'foul'],
  ['away', 8, 'p2'],
  ['away', 23, 'foul'],
  ['home', 3, 'p3'],
  ['away', 15, 'p1'],
  ['clash'],
  ['away', 8, 'p3'],
  ['away', 16, 'foul'],
  ['home', 7, 'p2'],
  ['away', 23, 'p2'],
  ['away', 4, 'foul'],
  ['home', 11, 'p1'],
  ['away', 15, 'p2'],
  ['away', 16, 'p1'],
  // Another tablet's play, while this device is away (step 2.242).
  ['other', 'home', 5, 'p2'],
];
const clashAt = script.findIndex(([what]) => what === 'clash') + 1;
/** The add of this device's own while the server's state is held back (step 2.242). */
const ownAt = script.findIndex(([what, a]) => what === 'add' && a === '30') + 1;
const otherAt = script.length;
/** After which step (counted from 1) the tab is closed and opened again. */
const reopenAfter = {
  3: 'with no signal',
  [ownAt + 2]: 'after the session ended',
  [clashAt + 3]: 'with no signal',
  [otherAt]: 'after another device scored',
};
/**
 * The steps whose connection is set, not left to chance (step 2.242): the own add and the
 * refused add reach the server, the foul after them and the last tap wait with no signal.
 */
const forcedSignal = {
  [ownAt]: 'on',
  [ownAt + 1]: 'on',
  [ownAt + 2]: 'off',
  [otherAt - 1]: 'sent-then-off',
  [otherAt]: 'off',
};
/** The visitors the panel lists after step `n`: the own add and the twin come late. */
const visitorsBy = (n) => 5 + (n >= ownAt ? 1 : 0) + (n >= clashAt ? 1 : 0);
/** The steps taken with no signal at all: the clash and the three plays after it. */
const noSignal = { from: clashAt, to: clashAt + 3 };
/** The step whose batch always goes slowly with its answer lost: the add of a named player. */
const lostAt = 2;
/** After which steps, the signal put back on, the server must have every play so far. */
const promptAfter = [11];

const keys = [
  ...starters.map((jersey) => `home ${jersey}`),
  ...awayStarters.map((jersey) => `away ${jersey}`),
];
/** The box score counted by hand from the first `n` steps of the script. */
function counted(n = script.length) {
  const box = Object.fromEntries(keys.map((key) => [key, { points: 0, fouls: 0 }]));
  const score = { home: 0, away: 0 };
  for (const step of script.slice(0, n)) {
    const [side, jersey, what] = step[0] === 'other' ? step.slice(1) : step;
    if (side !== 'home' && side !== 'away') continue;
    const line = box[`${side} ${jersey}`];
    if (what === 'foul') line.fouls += 1;
    else {
      line.points += Number(what.slice(1));
      score[side] += Number(what.slice(1));
    }
  }
  return { score, box };
}

const [phone] = sizes;
const failures = [];
const checked = [];
const events = [];
const note = (label, ok, detail = '') => {
  checked.push(label);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};
const printEvents = () => {
  console.error('the order of events:');
  for (const event of events) console.error(`  ${event}`);
};
/** Fails when `promise` has not settled within `ms`, naming what never came. */
const within = (ms, promise, what) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, fail) => {
      timer = setTimeout(() => fail(new Error(`${what}: not within ${ms / 1000} s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
};
setTimeout(() => {
  console.error(`bad-wifi-visitors: the run was still going after five minutes (seed ${seed})`);
  for (const failure of failures) console.error(`- ${failure}`);
  printEvents();
  process.exit(1);
}, 5 * 60_000).unref();
const step = async (name, run) => {
  try {
    await run();
  } catch (error) {
    failures.push(`${name}: ${whatWentWrong(error)}`);
  }
};
/** Asks `what` every 250 ms until `test` holds, failing with the last answer after `ms`. */
async function until(what, test, label, ms = 20_000) {
  const end = Date.now() + ms;
  let last = await what();
  while (!test(last)) {
    if (Date.now() > end) throw new Error(`${label}: ${JSON.stringify(last)}`);
    await new Promise((done) => setTimeout(done, 250));
    last = await what();
  }
  return last;
}

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}

const toServer = (url) => url.pathname.endsWith('/commands');
const gameApi = (origin, part) => `${origin}/api/v1/leagues/${leagueId}/games/${liveGame}/${part}`;
const asScorekeeper = { cookie: `${scorekeeper.name}=${scorekeeper.value}` };

/**
 * Another tablet of the same scorekeeper takes the game over from the browser (its tab
 * closed with no signal, its session still held), sends `inputs`, and lets the game go:
 * the browser's session has ended (step 2.242).
 */
async function anotherTabletTakesOver(origin, inputs) {
  const post = async (part, body) => {
    const answer = await fetch(gameApi(origin, part), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...asScorekeeper, origin },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await answer.text();
    if (!answer.ok) throw new Error(`/${part} answered ${answer.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  };
  const deviceId = 'another-tablet';
  const held = await post('session', { type: 'open', deviceId });
  if (held.status !== 'held-by-other') throw new Error(`the game was not held: ${held.status}`);
  const taken = await post('session', {
    type: 'take-over',
    deviceId,
    confirmed: true,
    expectedHolderSince: held.holder.since,
  });
  if (taken.status !== 'held-by-you') throw new Error(`not taken over: ${taken.status}`);
  try {
    if (inputs.length > 0) {
      const commands = inputs.map((input) => ({ commandId: randomUUID(), at: Date.now(), input }));
      const reply = await post('commands', {
        protocolVersion: 2,
        sessionId: taken.sessionId,
        commands,
      });
      const refused = reply.results.filter((r) => r.status !== 'accepted');
      if (refused.length > 0) throw new Error(`another tablet refused: ${JSON.stringify(refused)}`);
    }
  } finally {
    await post('session', { type: 'release', sessionId: taken.sessionId });
  }
}

/** The owner marks every visiting player as left (yesterday) and makes numbers unique. */
async function setUp(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ ...owner, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  try {
    await page.goto(`${origin}/${league}/admin/teams`);
    await Promise.all([
      page.waitForURL(/\/admin\/teams\/.+/),
      page.locator('main').getByRole('link', { name: 'Bears', exact: true }).click(),
    ]);
    const teamPage = page.url().split('?')[0];
    for (const name of bears) {
      const line = page
        .locator('main ol > li', { hasText: name })
        .filter({ has: page.getByRole('button', { name: 'Mark as left' }) });
      await line.locator('input[name=leftOn]').fill(yesterday);
      // The answer is a one-time notice on the same page (step 2.155 part 6): with scripts
      // on, the page is redrawn in place and fires no load, so wait for what it says.
      await line.getByRole('button', { name: 'Mark as left' }).click();
      await answered(page, `${name} was marked as having left`, 30_000);
    }
    const stillOn = await page
      .locator('main ol > li')
      .filter({ has: page.getByRole('button', { name: 'Mark as left' }) })
      .count();
    note('the owner marked every visiting player as left: no roster', stillOn === 0, `${stillOn}`);
    await page.goto(`${origin}/${league}/admin/season?season=fall-2026&edit=rosters`);
    await page.locator('input[name=uniqueJerseys]').check();
    await Promise.all([
      page.waitForEvent('load'),
      page.getByRole('button', { name: /^Save the roster/ }).click(),
    ]);
    await page.goto(`${origin}/${league}/admin/season?season=fall-2026&edit=rosters`);
    note(
      'the season wears each number once (S-44 is tried in a unique-numbers season)',
      await page.locator('input[name=uniqueJerseys]').isChecked(),
    );
    return teamPage;
  } finally {
    await context.close();
  }
}

/** The visiting team's roster lines on the owner's own team page (open lines only). */
async function ownersRoster(browser, origin, teamPage) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ ...owner, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  try {
    await page.goto(teamPage);
    const open = page
      .locator('main ol > li')
      .filter({ has: page.getByRole('button', { name: 'Mark as left' }) });
    return {
      lines: await open.count(),
      review: await open.filter({ has: page.locator('[data-flag="review"]') }).count(),
      clash: await open.filter({ has: page.locator('[data-flag="clash"]') }).count(),
    };
  } finally {
    await context.close();
  }
}

/** Whether the worker keeps the tracker page of the game, so it opens with no signal. */
const pageKept = (page) =>
  page.evaluate(async (game) => {
    for (const name of await caches.keys()) {
      if (!name.startsWith('srleagues-tracker ')) continue;
      const box = await caches.open(name);
      for (const asked of await box.keys())
        if (new URL(asked.url).pathname.endsWith(`/score/${game}`)) return true;
    }
    return false;
  }, liveGame);

async function oneGame(browser) {
  const origin = `http://localhost:${await freePort()}`;
  const server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  let context;
  const started = Date.now();
  const log = (what) => events.push(`${((Date.now() - started) / 1000).toFixed(2)}s ${what}`);
  try {
    await waitFor(`${origin}/`, server);
    const teamPage = await setUp(browser, origin);
    log('the Bears have no roster; numbers unique');
    context = await browser.newContext({
      viewport: { width: phone.width, height: phone.height },
      hasTouch: true,
    });
    await context.addCookies([{ ...scorekeeper, url: origin }]);
    // The next id the page makes, once asked, is one the server refuses (step 2.242).
    await context.addInitScript((id) => {
      const real = globalThis.crypto.randomUUID.bind(globalThis.crypto);
      globalThis.crypto.randomUUID = () => {
        if (globalThis.__refuseNextId !== true) return real();
        globalThis.__refuseNextId = false;
        return id;
      };
    }, refusedAdd.id);
    const errors = [];
    let page;
    let c;
    let panel;
    const openTab = async () => {
      page = await context.newPage();
      page.setDefaultTimeout(30_000);
      page.on('dialog', (dialog) => void dialog.accept());
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${origin}${trackerPath()}`);
      c = court(page);
      panel = page.locator('[data-players-panel]');
      return c.open();
    };
    const away = () => panel.locator('[data-players-team="away"]');
    // The refused add's row (shown while it waits) is not one of the visitors counted.
    const rows = () =>
      away().locator(`[data-player-row]:not([data-player-row="${refusedAdd.id}"])`);
    const refusedGroups = () => panel.locator('[data-players-refused-player]');
    const openPanel = async () => {
      if (await panel.isVisible()) return;
      await c.more.click();
      await page.locator('[data-players-open="more"]').click();
      await panel.waitFor();
    };
    const closePanel = async () => {
      if (!(await panel.isVisible())) return;
      await panel.locator('[data-players-close]').click();
      await panel.waitFor({ state: 'detached' });
    };
    /** What the panel shows of the visiting team. */
    const panelSays = async () => ({
      rows: await rows().count(),
      clash: await rows()
        .filter({ has: page.locator('[data-player-clash]') })
        .count(),
      waiting: await away().locator('[data-player-row][data-waiting]').count(),
      // Refused, other than the add refused on purpose.
      refused: await refusedGroups()
        .and(panel.locator(`:not([data-players-refused-player="${refusedAdd.id}"])`))
        .count(),
    });

    // The three ways the connection goes, as in bad-wifi-test.mjs.
    let offline = false;
    let answersLost = false;
    let slow = false;
    let answerLost;
    const firstLost = new Promise((done) => (answerLost = done));
    const setOffline = async (to) => {
      if (to === offline) return;
      offline = to;
      await context.setOffline(to);
      log(to ? 'network cut' : 'network back');
    };
    await context.route(toServer, async (route) => {
      if (slow) {
        const wait = Math.floor(slowness() * 1500);
        log(`a batch held ${wait} ms on the way`);
        await new Promise((done) => setTimeout(done, wait));
      }
      if (!answersLost) return route.continue().catch(() => undefined);
      // The batch reaches the server and is taken; the device never hears so.
      const answer = await route.fetch().catch(() => null);
      if (answer === null) log('a batch never reached the server (the fetch failed)');
      else log(`a batch reached the server (${answer.status()}), its answer lost`);
      if (answer?.ok() === true) answerLost();
      return route.abort('connectionreset').catch(() => undefined);
    });
    // The server's state held back from the device (step 2.242): the state it keeps stays
    // the one before its own add and the refused add.
    let statesHeld = false;
    await context.route(
      (url) => url.pathname.endsWith('/state'),
      (route) =>
        (statesHeld ? route.abort('connectionreset') : route.continue()).catch(() => undefined),
    );
    const setSlow = (to) => {
      if (to === slow) return;
      slow = to;
      log(to ? 'slow from now' : 'fast again');
    };
    const setAnswersLost = (to) => {
      if (to === answersLost) return;
      answersLost = to;
      log(to ? 'answers lost from now' : 'answers come back');
    };
    let pending = Promise.resolve();
    const cutSoon = () => {
      const wait = Math.floor(random() * 400);
      const to = !offline;
      pending = pending.then(async () => {
        await new Promise((done) => setTimeout(done, wait));
        await setOffline(to);
      });
    };
    const later = () => within(10_000, pending, 'a cut after a tap was switched');

    /** Each player's id by "side jersey", read off the tiles once the lineups are set. */
    const idOf = {};
    const tileOf = (key) => c.root.locator(`[data-teams] [data-player="${idOf[key]}"]`);
    const addLine = async (line, name) => {
      await openPanel();
      const before = await rows().count();
      const want = before + line.split(' ').length;
      await away().locator('[data-players-line="away"]').fill(line);
      await away().locator('[data-players-name="away"]').fill(name);
      await away().locator('[data-players-add="away"]').click();
      await until(
        () => rows().count(),
        (n) => n === want,
        `the line "${line}" was not listed`,
      );
    };
    const play = async (side, jersey, act) => {
      const options = c.pad.locator(`[data-options="${idOf[`${side} ${jersey}`]}"]`);
      if (!(await options.isVisible())) await tileOf(`${side} ${jersey}`).tap();
      await c.recorded(() => options.locator(`[data-act="${act}"]`).tap());
      await c.pad.locator('[data-rest]').waitFor();
    };
    const shownBox = async () => {
      const box = {};
      for (const key of keys) {
        const tile = tileOf(key);
        box[key] = {
          points: Number(await tile.locator('[data-points]').getAttribute('data-points')),
          fouls: Number(await tile.locator('[data-fouls]').getAttribute('data-fouls')),
        };
      }
      return { score: await c.score(), box };
    };
    const boxIs = async (n, label) => {
      const want = counted(n);
      const shown = await shownBox();
      note(label, JSON.stringify(shown) === JSON.stringify(want), JSON.stringify({ shown, want }));
    };
    /** The box score folded from the server's `/state` plays, by the ids the screen showed. */
    const serverBox = async () => {
      const answer = await fetch(gameApi(origin, 'state'), {
        headers: asScorekeeper,
        signal: AbortSignal.timeout(10_000),
      });
      if (!answer.ok) throw new Error(`/state answered ${answer.status}`);
      const { state } = await answer.json();
      const keyOf = Object.fromEntries(Object.entries(idOf).map(([key, id]) => [id, key]));
      const read = Object.fromEntries(keys.map((key) => [key, { points: 0, fouls: 0 }]));
      const unknown = [];
      for (const p of state.plays) {
        if (!['score', 'foul', 'unfoul'].includes(p.type)) continue;
        const line = read[keyOf[p.playerId]];
        if (!line) unknown.push(p);
        else if (p.type === 'score') line.points += p.points;
        else line.fouls += p.type === 'foul' ? 1 : -1;
      }
      return { read, unknown };
    };
    const sentPromptly = async (n) => {
      await later();
      setAnswersLost(false);
      setSlow(false);
      await setOffline(false);
      const want = JSON.stringify(counted(n).box);
      const end = Date.now() + 10_000;
      let got = await serverBox();
      while (JSON.stringify(got.read) !== want && Date.now() < end) {
        await new Promise((done) => setTimeout(done, 250));
        got = await serverBox();
      }
      const ok = got.unknown.length === 0 && JSON.stringify(got.read) === want;
      log(`the server ${ok ? 'has' : 'lacks'} steps 1 to ${n}, signal on`);
      note(
        `with the signal on, the server has the plays of steps 1 to ${n} within ten seconds`,
        ok,
        JSON.stringify({ read: got.read, want: counted(n).box, unknown: got.unknown }),
      );
    };

    await step('the game is opened, the visitors with no roster', async () => {
      const { tookOver } = await openTab();
      note('the game was free when the run began', !tookOver);
      await panel.waitFor({ timeout: 10_000 });
      note('the panel opens by itself on the empty visiting team', (await rows().count()) === 0);
      const end = Date.now() + 20_000;
      while (!(await pageKept(page))) {
        if (Date.now() > end) throw new Error('the tracker page was never kept');
        await page.waitForTimeout(250);
      }
      log('page kept');
    });

    await step(
      'the visitors added and the game played while the connection comes and goes',
      async () => {
        for (const [index, [what, a, b]] of script.entries()) {
          const n = index + 1;
          const quiet = n >= noSignal.from && n <= noSignal.to;
          const roll = random();
          const forced = forcedSignal[n];
          if (forced !== undefined) {
            await later();
            setAnswersLost(false);
            setSlow(false);
            if (forced === 'sent-then-off') {
              await setOffline(false);
              await until(
                () => c.root.locator('[data-saved-banner][data-state="waiting"]').count(),
                (waiting) => waiting === 0,
                `step ${n}: taps still waiting with the signal on`,
                30_000,
              );
            }
            await setOffline(forced !== 'on');
            if (n === ownAt) {
              statesHeld = true;
              log('the server state held back from now');
            }
          } else if (quiet) {
            // A cut still to come after the last tap must not bring the signal back here.
            await later();
            await setOffline(true);
          } else if (roll < 0.3) await setOffline(!offline);
          else if (roll < 0.42) setAnswersLost(!answersLost);
          else if (roll < 0.54) setSlow(!slow);
          if (n === lostAt) {
            await later();
            await setOffline(false);
            setAnswersLost(true);
            setSlow(true);
          }
          if (random() < 0.3 && !quiet && forced === undefined) cutSoon();
          if (what === 'add') {
            await addLine(a, b);
            log(`step ${n}: added "${a}"${b ? ` "${b}"` : ''}`);
          } else if (what === 'lineups') {
            await closePanel();
            await c.pick('home', starters);
            await c.pick('away', awayStarters);
            await page.locator('[data-scoring][data-stage="play"]').waitFor();
            for (const side of ['home', 'away'])
              for (const jersey of side === 'home' ? starters : awayStarters)
                idOf[`${side} ${jersey}`] = await c.tile(side, jersey).getAttribute('data-player');
            log(`step ${n}: both lineups set`);
          } else if (what === 'refused') {
            await openPanel();
            await page.evaluate(() => (globalThis.__refuseNextId = true));
            await away().locator('[data-players-line="away"]').fill(refusedAdd.line);
            await away().locator('[data-players-name="away"]').fill(refusedAdd.name);
            await away().locator('[data-players-add="away"]').click();
            // Listed while it waits, or refused already: either way the device made it.
            await until(
              async () =>
                (await away().locator(`[data-player-row="${refusedAdd.id}"]`).count()) +
                (await panel.locator(`[data-players-refused-player="${refusedAdd.id}"]`).count()),
              (n) => n > 0,
              'the add to be refused was neither listed nor refused',
            );
            note(
              'the page gave the add the id the server refuses',
              (await page.evaluate(() => globalThis.__refuseNextId)) === false,
            );
            // Both adds reach the server before the foul is made with no signal.
            await until(
              async () => ({
                refused: await panel
                  .locator(`[data-players-refused-player="${refusedAdd.id}"]`)
                  .count(),
                waiting: await rows().and(away().locator('[data-waiting]')).count(),
              }),
              (s) => s.refused === 1 && s.waiting === 0,
              'the own add not taken, or the add to be refused not refused',
            );
            await closePanel();
            log(`step ${n}: "${refusedAdd.line} ${refusedAdd.name}" added, to be refused`);
          } else if (what === 'other') {
            log(`step ${n}: another tablet is to score ${a} #${b} ${script[n - 1][3]}`);
          } else if (what === 'clash') {
            // S-44 with no signal: #8 is worn; a late arrival given 8 is taken and marked.
            await openPanel();
            await away().locator('[data-players-line="away"]').fill(String(twin[0]));
            note(
              'with no signal, the clash is marked while the number is typed (S-44)',
              (await away().locator('[data-players-typed-clash]').count()) === 1,
            );
            await addLine(String(twin[0]), `${twin[1]} ${twin[2]}`);
            const says = await panelSays();
            note(
              'with no signal, the clashing add is taken and marked on both #8, never refused (S-44)',
              says.rows === visitorsBy(n) &&
                says.clash === 2 &&
                says.waiting >= 1 &&
                says.refused === 0,
              JSON.stringify(says),
            );
            await closePanel();
            log(`step ${n}: "8 Cy Twin" added with no signal while #8 is worn`);
          } else {
            await play(what, a, b);
            log(`step ${n}: ${what} #${a} ${b}`);
          }
          if (n === lostAt)
            await within(20_000, firstLost, `step ${n} reached the server with its answer lost`);
          if (promptAfter.includes(n)) await sentPromptly(n);
          const how = reopenAfter[n];
          if (!how) continue;
          const ended = how.startsWith('after');
          await later();
          await setOffline(how === 'with no signal' || ended);
          await page.close({ runBeforeUnload: true });
          if (ended) {
            // Closed with no signal, its session still held: another tablet takes the game
            // over (and scores, the second time) and lets it go. The session has ended.
            const [, side, jersey, act] = script[n - 1];
            const playerId = idOf[`${side} ${jersey}`];
            await anotherTabletTakesOver(
              origin,
              what === 'other'
                ? [{ type: 'score', side, playerId, points: Number(act.slice(1)) }]
                : [],
            );
            log(`another tablet took the game over${what === 'other' ? ' and scored' : ''}`);
            statesHeld = false;
            await setOffline(false);
          }
          log(`tab closed; opened again ${how}`);
          const { tookOver } = await openTab();
          note(
            `the tab opened again ${how} found the game ${ended ? 'free' : "still this device's"}`,
            !tookOver,
          );
          const keptSays = async () => ({
            plays: await page.locator('[data-kept-list] [data-kept-play]').count(),
            again: await page.locator('[data-kept-list] [data-enter-again]').count(),
            send: await page.locator('[data-send-plays]').count(),
            cannotTell: await page.locator('[data-cannot-tell]').count(),
          });
          if (how === 'after the session ended') {
            // Its own add and the refused add came after the state it kept: judged its own
            // by their IDs, the foul made under the ended session is carried on and saved.
            await sentPromptly(n);
            const says = await keptSays();
            note(
              'the session ended while away, its own add and refused add since the state it kept: the tap carried on, nothing listed not saved (step 2.242, T-357)',
              says.plays === 0 && says.cannotTell === 0,
              JSON.stringify(says),
            );
          } else if (how === 'after another device scored') {
            const says = await until(
              keptSays,
              (s) => s.plays > 0,
              'the tap made under the session taken over was never listed',
              30_000,
            );
            note(
              'another tablet scored while away: the tap is listed not saved with "Enter again", nothing offered to send, no "could not tell" (step 2.242, T-358)',
              says.plays === 1 && says.again === 1 && says.send === 0 && says.cannotTell === 0,
              JSON.stringify(says),
            );
            await page.locator('[data-kept-list] [data-enter-again]').click();
            await until(
              () => page.locator('[data-kept-list]').count(),
              (lists) => lists === 0,
              'the tap entered again is still listed',
            );
          }
          if (idOf['away 4'] !== undefined)
            await boxIs(n, `the tab opened again ${how} shows every play (T-114)`);
          await openPanel();
          const says = await panelSays();
          const clashed = n > clashAt;
          note(
            `the tab opened again ${how} lists every visitor added${clashed ? ', both #8 marked' : ''}`,
            says.rows === visitorsBy(n) && says.clash === (clashed ? 2 : 0) && says.refused === 0,
            JSON.stringify(says),
          );
          await closePanel();
        }
        await later();
      },
    );

    await step('with the connection back, everything is sent and right', async () => {
      setAnswersLost(false);
      setSlow(false);
      await setOffline(false);
      // Until nothing waits: the add refused on purpose then says the one play not saved,
      // and any other refusal is named by its own check below. A limit, never a pass on a
      // timeout.
      await openPanel();
      const settled = await until(
        async () => ({
          waiting: await c.root.locator('[data-saved-banner][data-state="waiting"]').count(),
          banner: (await c.root.locator('[data-saved-banner]').allTextContents()).join(' | '),
          own: await panel.locator(`[data-players-refused-player="${refusedAdd.id}"]`).count(),
          refused: await refusedGroups().count(),
        }),
        (s) => s.waiting === 0 && s.own === 1,
        'with the signal back, still waiting, or the add to be refused not refused',
        90_000,
      );
      log('nothing waiting; the add refused');
      note(
        'with the signal back everything is saved but the add refused on purpose (step 2.242)',
        settled.refused === 1 && settled.banner.includes('1 play not saved'),
        JSON.stringify(settled),
      );
      // The add refused on purpose is listed as not applied, as any refusal is; nothing
      // else is listed, and no play is listed not saved because of it (step 2.242). The
      // one refusal the panel names by its id above is that add's.
      const kept = await page.locator('[data-kept-list]').count();
      const notApplied = await page.locator('[data-not-applied-play]').allTextContents();
      note(
        'nothing is listed not saved, and only the add refused on purpose is listed not applied',
        kept === 0 && notApplied.length === 1 && settled.own === 1 && settled.refused === 1,
        JSON.stringify({ kept, notApplied }),
      );
      const says = await until(
        panelSays,
        (s) => s.waiting === 0,
        'players still waiting with the signal back',
      );
      note(
        'with the signal back the twin was taken, not refused, both #8 still marked (S-44)',
        says.rows === visitorsBy(script.length) && says.clash === 2 && says.refused === 0,
        JSON.stringify(says),
      );
      await closePanel();
      const want = counted();
      await boxIs(
        script.length,
        'the score and box score on the screen are the ones counted (T-123)',
      );
      const { read, unknown } = await serverBox();
      note(
        'the box score the server reads back is the one counted, added players included (T-123)',
        unknown.length === 0 && JSON.stringify(read) === JSON.stringify(want.box),
        JSON.stringify({ read, want: want.box, unknown }),
      );
      const answer = await fetch(gameApi(origin, 'rosters'), {
        headers: asScorekeeper,
        signal: AbortSignal.timeout(10_000),
      });
      if (!answer.ok) throw new Error(`/rosters answered ${answer.status}`);
      const rosters = await answer.json();
      const atTable = rosters.players
        .filter((p) => p.addedAtGameId === liveGame && !p.left)
        .map((p) => ({
          line: [p.jerseyNumber, p.firstName, p.lastName].join('|'),
          away: p.teamId === rosters.awayTeamId,
          toReview: p.toReview,
          id: p.personId,
        }));
      const lines = atTable.map((p) => p.line).sort();
      const wanted = [...added, twin].map((p) => p.join('|')).sort();
      note(
        'the server holds each added player with the number and name typed',
        JSON.stringify(lines) === JSON.stringify(wanted),
        JSON.stringify({ lines, wanted }),
      );
      note(
        'every player added at the table is on the visiting team, marked for review (S-6, S-44)',
        atTable.length === 7 && atTable.every((p) => p.away && p.toReview),
        JSON.stringify(atTable),
      );
      const played = Object.entries(idOf).filter(([key]) => key.startsWith('away'));
      note(
        'the players who scored are the added ones, by the ids the device made',
        played.every(([key, id]) =>
          atTable.some((p) => p.id === id && p.line.startsWith(`${key.split(' ')[1]}|`)),
        ),
        JSON.stringify({ played, atTable }),
      );
      const roster = await ownersRoster(browser, origin, teamPage);
      note(
        "the league's roster screen marks the clash on both #8 for the admin, all seven to review (S-44)",
        roster.lines === 7 && roster.clash === 2 && roster.review === 7,
        JSON.stringify(roster),
      );
    });

    const happened = (what) => events.filter((e) => e.includes(what)).length;
    // The cuts are the script's own; whether the server took a batch whose answer was then
    // lost is not: it is counted only from a fetch the server answered with success.
    const cuts = {
      network: happened('network cut'),
      taken: happened('reached the server (200), its answer lost'),
    };
    note(
      'the server took batches whose answers were then lost (200 at the route)',
      cuts.taken > 0,
      JSON.stringify(cuts),
    );
    note('no script error on the page', errors.length === 0, errors.join(' | '));
  } finally {
    log('run over');
    await context?.close();
    server.child.kill();
  }
}

const browser = built ? await launch() : null;
if (browser) await step('the visitors added at the table on bad gym Wi-Fi', () => oneGame(browser));
await browser?.close();

for (const label of checked) console.log(`checked: ${label}`);
if (process.env.BAD_WIFI_EVENTS && failures.length === 0)
  for (const event of events) console.log(`  ${event}`);
if (failures.length > 0) {
  console.error(`bad-wifi-visitors: ${failures.length} failed (seed ${seed})`);
  for (const failure of failures) console.error(`- ${failure}`);
  printEvents();
  process.exit(1);
}
console.log(
  `bad-wifi-visitors: all ${checked.length} checks passed (seed ${seed}, ${events.at(-1)})`,
);
