// Step 2.45: a game's page, live, in a real browser against the web app on its made-up
// stand-in (APP_ENV=test). Nothing leaves this computer; every team and player is made up.
// Builds the app first unless given --no-build (npm run test:web:browser builds it once in
// web-exit-test.mjs, then runs this with --no-build).
//
// The made-up scorekeeper scores Hawks v Bears through the tracker's own endpoints while
// viewers watch /north-valley/games/{game} (T6 §6, §11):
// - a play appears on two screens within 2 seconds, and the clock counts down on the device;
// - messages dropped on purpose (the page's live messages are thrown away before the page
//   sees them): the next message shows a gap, and the page recovers by snapshot (T-118);
// - a blocked live connection: the page re-fetches the snapshot every 5 seconds and still
//   shows each play (T-119);
// - the Bears show their players' numbers to their staff only, so none of their names
//   reaches a viewer (S-22); accessibility checks (T-186) and no sideways scrolling at
//   phone width (A-2).
import { randomUUID } from 'node:crypto';
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
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
    failures.push(`${name}: ${String(error?.message ?? error).split('\n')[0]}`);
  }
};

// The made-up league, game and players (apps/web/src/server/stand-in-ports.ts and
// stand-in-games.ts): North Valley's live game, Hawks (team 3) at home to Bears (team 4).
const leagueId = '01900000-0000-7000-8000-000000000001';
const gameId = '01900000-0000-7000-8000-006a00000002';
const player = (team, n) =>
  `01900000-0000-7000-8000-${(0x70 + team).toString(16).padStart(4, '0')}${n
    .toString(16)
    .padStart(8, '0')}`;
const hawks = [1, 2, 3, 4, 5].map((n) => player(3, n));
const bears = [1, 2, 3, 4, 5].map((n) => player(4, n));
const bearsNames = ['Sol', 'Tam', 'Uma', 'Vic', 'Wes', 'Xan', 'Bearsley'];
const gamePage = `/north-valley/games/${gameId}`;
const api = `/api/v1/leagues/${leagueId}/games/${gameId}`;

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
    await waitFor(`${origin}/`, server);
    browser = await launch();
  });
}

/** The scorekeeper's tracker, as plain requests to its endpoints (step 2.32). */
function scorekeeper() {
  let sessionId;
  let sequence = 0;
  const post = async (path, body) => {
    const answer = await fetch(origin + api + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'srl_session=local-scorekeeper-token',
        origin,
      },
      body: JSON.stringify(body),
    });
    const text = await answer.text();
    if (!answer.ok) throw new Error(`${path} answered ${answer.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  };
  return {
    open: async () => {
      const reply = await post('/session', { type: 'open', deviceId: 'browser-test-tablet' });
      sessionId = reply.sessionId;
      if (typeof sessionId !== 'string') throw new Error(`no session: ${JSON.stringify(reply)}`);
    },
    /** Sends taps in one batch; resolves with the game's sequence after them. */
    tap: async (...inputs) => {
      const reply = await post('/commands', {
        protocolVersion: 1,
        sessionId,
        commands: inputs.map((input) => ({ commandId: randomUUID(), at: Date.now(), input })),
      });
      const refused = reply.results.filter((r) => r.status !== 'accepted');
      if (refused.length > 0) throw new Error(`refused: ${JSON.stringify(refused)}`);
      sequence = reply.sequence;
      return sequence;
    },
    sequence: () => sequence,
  };
}

const sequenceOf = (page) =>
  page.locator('[data-live-sequence]').getAttribute('data-live-sequence').then(Number);
const connectionOf = (page) =>
  page.locator('[data-live-connection]').getAttribute('data-live-connection');
const showsSequence = (page, sequence, timeout) =>
  page.waitForFunction(
    (n) => Number(document.querySelector('[data-live-sequence]')?.dataset.liveSequence) >= n,
    sequence,
    { timeout },
  );
const homeScore = (page) =>
  page.locator('.ui-scoreboard-side').last().locator('.ui-scoreboard-score').textContent();

/** A viewer's screen, at phone width, opened on the game and waiting for its live part. */
async function viewer({ dropMessages = false, blockLive = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  if (blockLive) await context.route('**/api/v1/live**', (route) => route.abort());
  if (dropMessages) {
    // Lets the test throw live messages away before the page sees them.
    await context.addInitScript(() => {
      window.__dropLive = 0;
      window.__droppedLive = 0;
      const Native = window.EventSource;
      window.EventSource = class extends Native {
        addEventListener(type, listener, options) {
          if (type !== 'update') return super.addEventListener(type, listener, options);
          return super.addEventListener(
            type,
            (event) => {
              if (window.__dropLive > 0) {
                window.__dropLive -= 1;
                window.__droppedLive += 1;
                return;
              }
              listener(event);
            },
            options,
          );
        }
      };
    });
  }
  const page = await context.newPage();
  const snapshots = [];
  page.on('request', (request) => {
    if (request.url().includes(`${api}/snapshot`)) snapshots.push(Date.now());
  });
  await page.goto(origin + gamePage);
  await page.locator('main').first().waitFor();
  return { context, page, snapshots };
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (browser) {
  const keeper = scorekeeper();
  await step('the scorekeeper opens the game and tips off', async () => {
    await keeper.open();
    await keeper.tap(
      { type: 'lineup', side: 'home', playerIds: hawks },
      { type: 'lineup', side: 'away', playerIds: bears },
      { type: 'start' },
    );
  });

  await step('a play appears on a second screen within 2 seconds', async () => {
    const first = await viewer();
    const second = await viewer();
    try {
      for (const screen of [first, second]) {
        await screen.page.locator('[data-live-connection="open"]').waitFor({ timeout: 10_000 });
      }
      note('the page arrives drawn with the game', (await sequenceOf(first.page)) >= 3);
      // Let the catch-up snapshot of opening settle before timing a play.
      await showsSequence(second.page, keeper.sequence(), 5_000);
      const before = Date.now();
      const sequence = await keeper.tap({
        type: 'score',
        side: 'home',
        playerId: hawks[0],
        points: 3,
      });
      await Promise.all(
        [first, second].map((screen) => showsSequence(screen.page, sequence, 5_000)),
      );
      const took = Date.now() - before;
      note('the play reached both screens within 2 seconds', took <= 2_000, `${took} ms`);
      note('the score moved', (await homeScore(second.page))?.trim() === '3');
      // One channel carries the latest play to everyone, so while the Bears hide their
      // players it names nobody (record 039).
      note(
        'the latest play is worded, naming nobody',
        (await second.page.getByText('Latest play: Hawks scored 3', { exact: true }).count()) > 0,
      );
      const clock = () => second.page.locator('.ui-scoreboard-period').textContent();
      const earlier = await clock();
      await pause(1_600);
      const later = await clock();
      note('the clock counts down on the device', earlier !== later, `${earlier} then ${later}`);
      const problems = await accessibilityProblems(second.page);
      note('accessibility: the live game', problems.length === 0, problems.join('; '));
      const [width, inner] = await second.page.evaluate(() => [
        document.documentElement.scrollWidth,
        window.innerWidth,
      ]);
      note('no sideways scrolling at phone width', width <= inner, `${width} > ${inner}`);
    } finally {
      await first.context.close();
      await second.context.close();
    }
  });

  await step('messages dropped on purpose: the page recovers by snapshot', async () => {
    const screen = await viewer({ dropMessages: true });
    try {
      await screen.page.locator('[data-live-connection="open"]').waitFor({ timeout: 10_000 });
      await showsSequence(screen.page, keeper.sequence(), 5_000);
      const shown = await sequenceOf(screen.page);
      await screen.page.evaluate(() => (window.__dropLive = 2));
      await keeper.tap({ type: 'score', side: 'away', playerId: bears[0], points: 2 });
      await keeper.tap({ type: 'foul', side: 'away', playerId: bears[1] });
      await screen.page.waitForFunction(() => window.__droppedLive === 2, null, {
        timeout: 5_000,
      });
      note('two messages were dropped', true);
      note('the page did not guess past them', (await sequenceOf(screen.page)) === shown);
      const asked = screen.snapshots.length;
      const sequence = await keeper.tap({
        type: 'score',
        side: 'home',
        playerId: hawks[1],
        points: 2,
      });
      await showsSequence(screen.page, sequence, 5_000);
      note('the gap was answered by a snapshot', screen.snapshots.length > asked);
      note('the page shows the game as it stands', (await homeScore(screen.page))?.trim() === '5');
      note(
        "the Bears' points from the dropped messages are there",
        (await screen.page.locator('.ui-scoreboard-side').first().textContent())?.includes('2'),
      );
      const html = await screen.page.content();
      note(
        "no staff-only player's name reaches a viewer",
        bearsNames.every((name) => !html.includes(name)),
      );
    } finally {
      await screen.context.close();
    }
  });

  await step('a blocked live connection falls back to polling every 5 seconds', async () => {
    const screen = await viewer({ blockLive: true });
    try {
      await screen.page
        .locator('[data-live-connection="unavailable"]')
        .waitFor({ timeout: 10_000 });
      note('the page knows the live connection cannot be made', true);
      const sequence = await keeper.tap({ type: 'timeout', side: 'home', seconds: 60 });
      await showsSequence(screen.page, sequence, 8_000);
      note(
        'a play still appears, by snapshot',
        (await connectionOf(screen.page)) === 'unavailable',
      );
      await pause(5_500);
      const times = screen.snapshots;
      const gaps = times.slice(1).map((t, i) => t - (times[i] ?? t));
      note(
        'the snapshot is fetched again every 5 seconds',
        times.length >= 2 && gaps.every((g) => g >= 4_000 && g <= 7_000),
        `${times.length} fetches, gaps ${gaps.join(', ')} ms`,
      );
    } finally {
      await screen.context.close();
    }
  });

  await step('a finished game is drawn and not followed', async () => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      let listened = false;
      page.on('request', (r) => {
        if (r.url().includes('/api/v1/live')) listened = true;
      });
      await page.goto(`${origin}/north-valley/games/01900000-0000-7000-8000-006a00000005`);
      await page.locator('main').first().waitFor();
      note(
        'the finished game shows its result',
        (await page.getByText('Only the final score was recorded for this game.').count()) > 0,
      );
      await pause(1_000);
      note('a finished game opens no live connection', !listened);
      const problems = await accessibilityProblems(page);
      note('accessibility: a finished game', problems.length === 0, problems.join('; '));
    } finally {
      await context.close();
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Live game browser check failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Live game browser check passed: ${checked.length} checks in a real browser.`);
