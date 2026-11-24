// Step 2.61, part 1: the bad gym Wi-Fi test (T-123, T-114), in a real browser against the
// web app on its made-up stand-in (APP_ENV=test). Nothing leaves this computer; every
// team, game and person is made up. Builds the app first unless given --no-build.
//
// A scripted game (the fixed list `script` below) is tapped on the tracker at the phone
// upright while the connection is cut and restored at random moments: the whole network
// off (the browser offline), the answers lost (each batch reaches the server, which takes
// it, and the answer never comes back, so the device sends it again), or slow (each batch
// held up to 1.5 s on the way), each switched before a tap, the network also while one is
// being sent. Play 4 always goes slowly with its answer lost, whatever the seed. Mid-game
// the tab is closed and opened again, once with signal and once without, and the score
// shown must hold every tap (T-114).
// At the end, the connection back and everything sent, the box score on the screen and
// the one the server reads back must both equal the one counted from the list (T-123).
//
// Part 2: the scorer signs in through the form, so the sign-in's access token really runs
// out. One play is undone. Mid-game the page is reloaded with no signal, and later
// reloaded by itself while a batch is on its way (the server takes it, the page is gone).
// For three plays the device has no signal, and both clocks are moved on 61 minutes,
// longer than the access token (T-225): the browser's (Playwright's clock) and the
// server's (a preload that shifts its `Date`, below); the browser's cookie jar keeps real
// time, so its session cookie, which runs out before the token, is dropped as the browser
// would. Everything must then be sent under the same person once the proxy renews the
// sign-in, and nothing be listed not saved.
//
// The random moments come from a seed, printed first: BAD_WIFI_SEED=<n> replays a run's
// cuts exactly (the browser's own timing still varies). On a failure the order of events
// (every cut, restore, tap and reopening) is printed with it. Every wait has a limit: a
// tracker that stops sending makes the run fail with the seed and the order of events,
// never hang (and the whole run is stopped the same way after five minutes). Twice in the
// game, the signal on, the server must have every play tapped so far within ten seconds,
// so a tracker that sends late cannot pass.
//
// In the gate it runs once a push with a printed random seed; ten seeds in a row were run
// at landing (the lane note, docs/build/handover/lanes/2.61.md). The timing varies, so a
// browser run cannot show a given order of events happened: the fixed guard of the
// seed-66 fix (T-329) is the unit test in apps/web/src/features/tracker/
// tracker-controller.test.ts ("keeps the taps the server took on opening…").
import { randomInt } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  court,
  leagueId,
  liveGame,
  scorekeeper,
  sizes,
  starters,
  trackerPath,
} from './tracker-driver.mjs';
import {
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
console.log(`bad-wifi: seed ${seed} (BAD_WIFI_SEED=${seed} replays this run)`);

/** A small seeded generator (mulberry32): the same seed, the same cuts. */
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
/** The cuts; and apart, how long a slow batch takes, so their number moves no cut. */
const random = generator(seed);
const slowness = generator(seed ^ 0x9e3779b9);

/** The game: [side, jersey, what], among the starters only, none fouled out. */
const script = [
  ['home', 5, 'p2'],
  ['away', 3, 'p3'],
  ['home', 9, 'p1'],
  ['away', 7, 'foul'],
  ['home', 11, 'p2'],
  ['away', 5, 'p2'],
  ['home', 3, 'foul'],
  ['away', 9, 'p1'],
  ['home', 7, 'p3'],
  ['away', 11, 'p2'],
  ['undo'],
  ['home', 5, 'foul'],
  ['away', 3, 'p2'],
  ['home', 9, 'p2'],
  ['away', 7, 'p1'],
  ['home', 3, 'p3'],
  ['away', 5, 'foul'],
  ['home', 11, 'p1'],
  ['away', 9, 'p3'],
  ['home', 7, 'p2'],
  ['away', 11, 'foul'],
  ['home', 5, 'p2'],
  ['away', 3, 'p1'],
];
/** After which play (counted from 1) the tab is closed and opened again, or the page reloaded. */
const reopenAfter = {
  7: 'with signal',
  12: 'reloaded with no signal',
  17: 'with no signal',
  21: 'reloaded by itself while a batch is sent',
};
/** The plays tapped with no signal at all, and after which the clocks move on 61 minutes. */
const longOffline = { from: 14, moveAfter: 14, to: 17 };
const minutes61 = 61 * 60_000;
/** After which plays, the signal put back on, the server must have every play so far. */
const promptAfter = [9, 19];

/** The box score counted from the first `n` plays of the list, by hand; an undo takes the latest out. */
function counted(n = script.length) {
  const box = {};
  const score = { home: 0, away: 0 };
  for (const side of ['home', 'away'])
    for (const jersey of starters) box[`${side} ${jersey}`] = { points: 0, fouls: 0 };
  const kept = [];
  for (const entry of script.slice(0, n)) {
    if (entry[0] === 'undo') kept.pop();
    else kept.push(entry);
  }
  for (const [side, jersey, what] of kept) {
    const line = box[`${side} ${jersey}`];
    if (what === 'foul') line.fouls += 1;
    else {
      const points = Number(what.slice(1));
      line.points += points;
      score[side] += points;
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
/** Fails the run when `promise` has not settled within `ms`, naming what never came. */
const within = (ms, promise, what) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, fail) => {
      timer = setTimeout(() => fail(new Error(`${what}: not within ${ms / 1000} s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
};
/** The last resort: a run still going after five minutes fails with what it has. */
const wholeRunMs = 5 * 60_000;
setTimeout(() => {
  console.error(`bad-wifi: the run was still going after five minutes (seed ${seed})`);
  for (const failure of failures) console.error(`- ${failure}`);
  console.error('the order of events:');
  for (const event of events) console.error(`  ${event}`);
  process.exit(1);
}, wholeRunMs).unref();
const step = async (name, run) => {
  try {
    await run();
  } catch (error) {
    failures.push(`${name}: ${whatWentWrong(error)}`);
  }
};

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}

const toServer = (url) => url.pathname.endsWith('/commands');

/**
 * The server's clock, moved on by the test: a preload (`--import`) that shifts its `Date`
 * by the milliseconds in a file the test writes, read every 50 ms, so the sign-in's
 * tokens run out on the server as they would an hour later. Only this test's server.
 */
const clockFolder = mkdtempSync(join(tmpdir(), 'bad-wifi-clock-'));
const clockFile = join(clockFolder, 'offset');
const clockPreload = join(clockFolder, 'moved-clock.mjs');
writeFileSync(clockFile, '0');
writeFileSync(
  clockPreload,
  `import { readFileSync } from 'node:fs';
const Real = Date;
let offset = 0;
const read = () => {
  try { offset = Number(readFileSync(${JSON.stringify(clockFile)}, 'utf8')) || 0; } catch {}
};
read();
setInterval(read, 50).unref();
class Moved extends Real {
  constructor(...a) { if (a.length === 0) super(Real.now() + offset); else super(...a); }
  static now() { return Real.now() + offset; }
  static UTC(...a) { return Real.UTC(...a); }
  static parse(text) { return Real.parse(text); }
}
globalThis.Date = Moved;
`,
);
const scorer = { email: 'scorekeeper@example.test', password: 'made-up scorekeeper password' };

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
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${clockPreload}`.trim(),
  });
  let context;
  const started = Date.now();
  const log = (what) => events.push(`${((Date.now() - started) / 1000).toFixed(2)}s ${what}`);
  try {
    await waitFor(`${origin}/`, server);
    context = await browser.newContext({
      viewport: { width: phone.width, height: phone.height },
      hasTouch: true,
    });
    // The page's clock: runs as the real one does until the test moves it on.
    await context.clock.install();
    const errors = [];
    // Signed in through the form, so the access token is one that runs out (T-225).
    const signing = await context.newPage();
    await signing.goto(`${origin}/signin`);
    await signing.getByLabel('Email').fill(scorer.email);
    await signing.getByLabel('Password').fill(scorer.password);
    await Promise.all([
      signing.waitForURL((url) => url.pathname !== '/signin'),
      signing.getByRole('button', { name: 'Sign in', exact: true }).click(),
    ]);
    await signing.close();
    const sessionCookie = async () =>
      (await context.cookies(origin)).find((k) => k.name === scorekeeper.name)?.value;
    const firstToken = await sessionCookie();
    if (firstToken === undefined) throw new Error('the sign-in form set no session cookie');
    let page;
    let c;
    const openTab = async () => {
      page = await context.newPage();
      page.setDefaultTimeout(30_000);
      page.on('dialog', (dialog) => void dialog.accept());
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${origin}${trackerPath()}`);
      c = court(page);
      return c.open();
    };

    // The three ways the connection goes: the network off, the answers lost, or slow.
    let offline = false;
    let answersLost = false;
    let slow = false;
    // Every run loses at least one answer: the first lost one is waited for (play 4).
    let answerLost;
    const firstLost = new Promise((done) => (answerLost = done));
    const setOffline = async (to) => {
      if (to === offline) return;
      offline = to;
      await context.setOffline(to);
      log(to ? 'network cut' : 'network back');
    };
    // A batch held on its way until the page that sent it is reloaded, then taken.
    let holdNext = null;
    await context.route(toServer, async (route) => {
      if (holdNext !== null) {
        const held = holdNext;
        holdNext = null;
        log('a batch held on its way while its page is reloaded');
        held.reached();
        await within(30_000, held.reloaded, 'the page reloaded while its batch was held').catch(
          () => undefined,
        );
        const answer = await route.fetch().catch(() => null);
        log(`the held batch reached the server (${answer?.status() ?? 'no answer'}), page gone`);
        return route.abort('connectionreset').catch(() => undefined);
      }
      if (slow) {
        const wait = Math.floor(slowness() * 1500);
        log(`a batch held ${wait} ms on the way`);
        await new Promise((done) => setTimeout(done, wait));
      }
      if (!answersLost) return route.continue().catch(() => undefined);
      // The batch reaches the server and is taken; the device never hears so.
      const answer = await route.fetch().catch(() => null);
      log(`a batch reached the server (${answer?.status() ?? 'no answer'}), its answer lost`);
      answerLost();
      return route.abort('connectionreset').catch(() => undefined);
    });
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
    // A cut while a tap is being sent: switched a random moment after the tap, in order.
    let pending = Promise.resolve();
    const cutSoon = () => {
      const wait = Math.floor(random() * 400);
      const to = !offline;
      pending = pending.then(async () => {
        await new Promise((done) => setTimeout(done, wait));
        await setOffline(to);
      });
    };
    /** Waits for the cuts switched after a tap, within a limit. */
    const later = () => within(10_000, pending, 'a cut after a tap was switched');

    const play = async (side, jersey, act) => {
      if (side === 'undo') {
        await c.undo();
        await c.pad.locator('[data-rest]').waitFor();
        return;
      }
      const options = c.pad.locator(
        `[data-options="${await c.tile(side, jersey).getAttribute('data-player')}"]`,
      );
      if (!(await options.isVisible())) await c.tile(side, jersey).tap();
      await c.recorded(() => options.locator(`[data-act="${act}"]`).tap());
      await c.pad.locator('[data-rest]').waitFor();
    };
    /** The score and box score the screen shows, with each player's id. */
    const ids = {};
    const shownBox = async () => {
      const box = {};
      for (const side of ['home', 'away'])
        for (const jersey of starters) {
          ids[await c.tile(side, jersey).getAttribute('data-player')] = `${side} ${jersey}`;
          box[`${side} ${jersey}`] = {
            points: await c.points(side, jersey),
            fouls: await c.fouls(side, jersey),
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
      const answer = await fetch(`${origin}/api/v1/leagues/${leagueId}/games/${liveGame}/state`, {
        headers: { cookie: `${scorekeeper.name}=${scorekeeper.value}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!answer.ok) throw new Error(`/state answered ${answer.status}`);
      const { state } = await answer.json();
      const read = {};
      for (const line of Object.values(ids)) read[line] = { points: 0, fouls: 0 };
      const unknown = [];
      for (const p of state.plays) {
        if (!['score', 'foul', 'unfoul'].includes(p.type)) continue;
        const line = read[ids[p.playerId]];
        if (!line) unknown.push(p);
        else if (p.type === 'score') line.points += p.points;
        else line.fouls += p.type === 'foul' ? 1 : -1;
      }
      return { read, unknown };
    };
    /** With the signal on, the server has every play tapped so far within ten seconds. */
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
      log(`the server ${ok ? 'has' : 'lacks'} plays 1 to ${n}, signal on`);
      note(
        `with the signal on, the server has plays 1 to ${n} within ten seconds`,
        ok,
        JSON.stringify({ read: got.read, want: counted(n).box, unknown: got.unknown }),
      );
    };

    await step('the game is opened and its starters picked', async () => {
      const { tookOver } = await openTab();
      note('the game was free when the run began', !tookOver);
      for (const jersey of starters) await c.tile('home', jersey).tap();
      for (const jersey of starters) await c.tile('away', jersey).tap();
      await page.locator('[data-scoring][data-stage="play"]').waitFor();
      await c.saved();
      await shownBox(); // learns each player's id, for reading the server's plays
      // The page must be on the device before the tab can come back with no signal.
      const end = Date.now() + 20_000;
      while (!(await pageKept(page))) {
        if (Date.now() > end) throw new Error('the tracker page was never kept');
        await page.waitForTimeout(250);
      }
      log('starters picked, page kept');
    });

    await step('the scripted game, tapped while the connection comes and goes', async () => {
      for (const [index, [side, jersey, act]] of script.entries()) {
        const n = index + 1;
        const how = reopenAfter[n];
        const noSignal = n >= longOffline.from && n <= longOffline.to;
        const roll = random();
        if (noSignal) await setOffline(true);
        else if (roll < 0.3) await setOffline(!offline);
        else if (roll < 0.42) setAnswersLost(!answersLost);
        else if (roll < 0.54) setSlow(!slow);
        if (index === 3) {
          // Whatever the seed, one batch the server takes and whose answer is lost, slowly.
          await setOffline(false);
          setAnswersLost(true);
          setSlow(true);
        }
        let held = null;
        if (how === 'reloaded by itself while a batch is sent') {
          await later();
          setAnswersLost(false);
          setSlow(false);
          held = {};
          held.reachedYet = new Promise((done) => (held.reached = done));
          held.reloaded = new Promise((done) => (held.reload = done));
          holdNext = held;
          await setOffline(false);
        }
        if (random() < 0.3 && !noSignal && held === null) cutSoon();
        await play(side, jersey, act);
        if (index === 3)
          await within(20_000, firstLost, 'play 4 reached the server with its answer lost');
        log(`play ${n}: ${side} #${jersey ?? ''} ${act ?? ''}`.trim());
        if (n === longOffline.moveAfter) {
          // An hour and a minute with no signal, by moving both clocks on, not by waiting.
          await later();
          writeFileSync(clockFile, String(minutes61));
          await context.clock.fastForward(minutes61);
          await new Promise((done) => setTimeout(done, 300));
          const old = await fetch(`${origin}/api/v1/leagues/${leagueId}/games/${liveGame}/state`, {
            headers: { cookie: `${scorekeeper.name}=${firstToken}` },
          });
          note(
            'after 61 minutes the first access token is turned away by the server (T-225)',
            old.status === 401,
            `answered ${old.status}`,
          );
          // The cookie jar keeps real time: the session cookie, which runs out a little
          // before its token, is dropped as the browser would drop it an hour later.
          await context.clearCookies({ name: scorekeeper.name });
          log('both clocks moved on 61 minutes; the run-out session cookie dropped');
        }
        if (promptAfter.includes(n)) await sentPromptly(n);
        if (!how) continue;
        await later();
        if (held !== null) {
          await Promise.race([
            held.reachedYet,
            new Promise((_, fail) =>
              setTimeout(() => fail(new Error('no batch was sent to hold')), 20_000),
            ),
          ]);
          log('the page reloads by itself, mid-send');
          await page.evaluate(() => location.reload()).catch(() => undefined);
          held.reload();
          await page.waitForLoadState('domcontentloaded');
          c = court(page);
          const { tookOver } = await c.open();
          note(`the page ${how} found the game still this device's`, !tookOver);
        } else if (how.startsWith('reloaded')) {
          await setOffline(true);
          await page.reload();
          log(`page ${how}`);
          c = court(page);
          const { tookOver } = await c.open();
          note(`the page ${how} found the game still this device's`, !tookOver);
        } else {
          await setOffline(how === 'with no signal');
          await page.close({ runBeforeUnload: true });
          log(`tab closed; opened again ${how}`);
          const { tookOver } = await openTab();
          note(`the tab opened again ${how} found the game still this device's`, !tookOver);
        }
        await boxIs(n, `the page ${how} shows every play tapped (T-114)`);
      }
      await later();
    });

    await step(
      'with the connection back, everything is sent and the box score is right',
      async () => {
        setAnswersLost(false);
        setSlow(false);
        await setOffline(false);
        await c.saved();
        log('everything saved');
        const renewed = await sessionCookie();
        note(
          'the sign-in was renewed once the signal came back (T-225)',
          renewed !== undefined && renewed !== firstToken,
        );
        const listed = await page.locator('[data-kept-list], [data-not-applied-list]').count();
        note('nothing is listed not saved or not applied', listed === 0, `${listed} lists`);
        const want = counted();
        await boxIs(
          script.length,
          'the score and box score on the screen are the ones counted from the list (T-123)',
        );
        const { read, unknown } = await serverBox();
        note(
          'the box score the server reads back is the one counted from the list (T-123)',
          unknown.length === 0 && JSON.stringify(read) === JSON.stringify(want.box),
          JSON.stringify({ read, want: want.box, unknown }),
        );
      },
    );

    const happened = (what) => events.filter((e) => e.includes(what)).length;
    const cuts = { network: happened('network cut'), answers: happened('its answer lost') };
    note(
      'the run cut the network and lost answers of batches the server took',
      cuts.network > 0 && cuts.answers > 0,
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
if (browser) await step('a game on bad gym Wi-Fi', () => oneGame(browser));
await browser?.close();
rmSync(clockFolder, { recursive: true, force: true });

for (const label of checked) console.log(`checked: ${label}`);
// BAD_WIFI_EVENTS=1 prints the order of events of a run that passed too.
if (process.env.BAD_WIFI_EVENTS && failures.length === 0)
  for (const event of events) console.log(`  ${event}`);
if (failures.length > 0) {
  console.error(`bad-wifi: ${failures.length} failed (seed ${seed})`);
  for (const failure of failures) console.error(`- ${failure}`);
  console.error('the order of events:');
  for (const event of events) console.error(`  ${event}`);
  process.exit(1);
}
console.log(`bad-wifi: all ${checked.length} checks passed (seed ${seed}, ${events.at(-1)})`);
