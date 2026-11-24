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
// The random moments come from a seed, printed first: BAD_WIFI_SEED=<n> replays a run's
// cuts exactly (the browser's own timing still varies). On a failure the order of events
// (every cut, restore, tap and reopening) is printed with it.
import { randomInt } from 'node:crypto';
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
/** After which play (counted from 1) the tab is closed and opened again, and how. */
const reopenAfter = { 7: 'with signal', 15: 'with no signal' };

/** The box score counted from the first `n` plays of the list, by hand. */
function counted(n = script.length) {
  const box = {};
  const score = { home: 0, away: 0 };
  for (const side of ['home', 'away'])
    for (const jersey of starters) box[`${side} ${jersey}`] = { points: 0, fouls: 0 };
  for (const [side, jersey, what] of script.slice(0, n)) {
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
    context = await browser.newContext({
      viewport: { width: phone.width, height: phone.height },
      hasTouch: true,
    });
    await context.addCookies([{ ...scorekeeper, url: origin }]);
    const errors = [];
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
    await context.route(toServer, async (route) => {
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
    let later = Promise.resolve();
    const cutSoon = () => {
      const wait = Math.floor(random() * 400);
      const to = !offline;
      later = later.then(async () => {
        await new Promise((done) => setTimeout(done, wait));
        await setOffline(to);
      });
    };

    const play = async (side, jersey, act) => {
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

    await step('the game is opened and its starters picked', async () => {
      const { tookOver } = await openTab();
      note('the game was free when the run began', !tookOver);
      for (const jersey of starters) await c.tile('home', jersey).tap();
      for (const jersey of starters) await c.tile('away', jersey).tap();
      await page.locator('[data-scoring][data-stage="play"]').waitFor();
      await c.saved();
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
        const roll = random();
        if (roll < 0.3) await setOffline(!offline);
        else if (roll < 0.42) setAnswersLost(!answersLost);
        else if (roll < 0.54) setSlow(!slow);
        if (index === 3) {
          // Whatever the seed, one batch the server takes and whose answer is lost, slowly.
          await setOffline(false);
          setAnswersLost(true);
          setSlow(true);
        }
        if (random() < 0.3) cutSoon();
        await play(side, jersey, act);
        if (index === 3) await firstLost;
        log(`play ${index + 1}: ${side} #${jersey} ${act}`);
        const how = reopenAfter[index + 1];
        if (!how) continue;
        await later;
        await setOffline(how === 'with no signal');
        await page.close({ runBeforeUnload: true });
        log(`tab closed; opened again ${how}`);
        const { tookOver } = await openTab();
        note(`the tab opened again ${how} found the game still this device's`, !tookOver);
        await boxIs(index + 1, `the tab opened again ${how} shows every play tapped (T-114)`);
      }
      await later;
    });

    await step(
      'with the connection back, everything is sent and the box score is right',
      async () => {
        setAnswersLost(false);
        setSlow(false);
        await setOffline(false);
        await c.saved();
        log('everything saved');
        const want = counted();
        await boxIs(
          script.length,
          'the score and box score on the screen are the ones counted from the list (T-123)',
        );
        const answer = await fetch(`${origin}/api/v1/leagues/${leagueId}/games/${liveGame}/state`, {
          headers: { cookie: `${scorekeeper.name}=${scorekeeper.value}` },
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
