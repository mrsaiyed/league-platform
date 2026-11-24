// Step 2.62, part A: a game night in one walk, in a real browser against the web app on its
// made-up stand-in (APP_ENV=test). Nothing leaves this computer; every team and player is made
// up (apps/web/src/server/stand-in-games.ts). Builds the app first unless given --no-build.
//
// The made-up scorekeeper (signed in by their session, as the other browser tests sign in)
// opens North Valley's live game, Hawks at home to Bears, and scores it through the tracker's
// own endpoints, as a tablet would, while a visitor's phone shows the game's public page:
// each play, one by one, is on that second screen within 2 seconds, measured. Then the made-up
// owner takes the game over on a second tablet: the first one can score no more, the owner
// scores on, each play still on the second screen within 2 seconds, and ends the game. The
// standings (a game played for both, a win for the Hawks, a loss for the Bears) and the
// statistics move, and the Bears, whose players' numbers are for their staff only, are named
// on none of these pages. Accessibility checks (T-186) on every screen it opens.
//
// The same parts are proven one by one elsewhere: live-game-test.mjs (one play on two screens,
// the snapshot fallbacks), scoring-trouble-test.mjs (a takeover learnt on the scoring screen),
// first-test-walk-test.mjs (a game ended on the scoring screen, then the standings). The
// demo-shaped league on the made-up database cannot be scored live within 2 seconds yet: the
// database has no live service (database-ports.ts, `liveFeed: null`), so a watcher there asks
// for the snapshot every 5 seconds; this walk is on the stand-in, which has one.
import { randomUUID } from 'node:crypto';
import { leagueUrl } from '@srleagues/core';
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

// The made-up league, game and players (stand-in-ports.ts, stand-in-games.ts).
const league = { slug: 'north-valley' };
const leagueId = '01900000-0000-7000-8000-000000000001';
const gameId = '01900000-0000-7000-8000-006a00000002';
const player = (team, n) =>
  `01900000-0000-7000-8000-${(0x70 + team).toString(16).padStart(4, '0')}${n
    .toString(16)
    .padStart(8, '0')}`;
const hawks = [1, 2, 3, 4, 5].map((n) => player(3, n));
const bears = [1, 2, 3, 4, 5].map((n) => player(4, n));
/** The Bears' made-up players: their numbers are for the Bears' staff only (S-22). */
const bearsNames = ['Sol', 'Tam', 'Uma', 'Vic', 'Wes', 'Xan', 'Bearsley'];
const api = `/api/v1/leagues/${leagueId}/games/${gameId}`;
const tokens = { scorekeeper: 'local-scorekeeper-token', owner: 'local-owner-token' };
const pages = {
  game: leagueUrl(league, 'game', { game: gameId }),
  standings: leagueUrl(league, 'standings'),
  stats: leagueUrl(league, 'stats'),
};
/** The longest a play may take to reach the second screen (P9 §3, item 3; T6 §11). */
const withinMs = 2_000;

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

/** One tablet scoring the game through the tracker's endpoints (step 2.32, record 058). */
function tablet(token, deviceId) {
  let sessionId;
  const post = async (path, body) => {
    const answer = await fetch(origin + api + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `srl_session=${token}`, origin },
      body: JSON.stringify(body),
    });
    const text = await answer.text();
    if (!answer.ok) throw new Error(`${path} answered ${answer.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  };
  return {
    /** Opens the game on this tablet: its session, or who holds the game already. */
    open: async () => {
      const reply = await post('/session', { type: 'open', deviceId });
      if (typeof reply.sessionId === 'string') sessionId = reply.sessionId;
      return reply;
    },
    /** Takes a game another device holds, after saying yes to the question. */
    takeOver: async (since) => {
      const reply = await post('/session', {
        type: 'take-over',
        deviceId,
        confirmed: true,
        expectedHolderSince: since,
      });
      if (typeof reply.sessionId !== 'string') throw new Error(JSON.stringify(reply));
      sessionId = reply.sessionId;
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
      return reply.sequence;
    },
  };
}

async function accessible(page, label) {
  const problems = await accessibilityProblems(page);
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
}

/** Every standings table on the page: its column headings and each team's cells. */
const standingsOf = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('table.ui-standings')].map((table) => ({
      headers: [...table.querySelectorAll('thead th[scope="col"]')].map((th) =>
        th.textContent.trim(),
      ),
      rows: [...table.querySelectorAll('tbody tr')].map((tr) => ({
        team: tr.querySelector('th[scope="row"]')?.textContent.trim() ?? '',
        cells: [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()),
      })),
    })),
  );
/** A team's row in the first table that has it: its numbers by column heading. */
function rowOf(tables, team) {
  for (const table of tables) {
    const row = table.rows.find((r) => r.team.includes(team));
    if (!row) continue;
    const headers = table.headers.slice(table.headers.length - row.cells.length);
    return Object.fromEntries(headers.map((h, i) => [h, Number.parseFloat(row.cells[i])]));
  }
  return null;
}
/** Whether a Bears player is named, word by word, in a page's words. */
const namesABear = (text) => bearsNames.some((name) => new RegExp(`\\b${name}\\b`).test(text));
const rose = (before, after, column) => (after?.[column] ?? NaN) - (before?.[column] ?? NaN);

/** A visitor's page, opened fresh, waited for. */
async function visit(context, address) {
  const page = await context.newPage();
  await page.goto(origin + address);
  await page.locator('main').first().waitFor();
  return page;
}

if (browser) {
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let standingsBefore = [];
  let statsBefore = '';
  await step('the standings and statistics before the game', async () => {
    const standings = await visit(visitor, pages.standings);
    standingsBefore = await standingsOf(standings);
    note(
      'the standings list the Hawks and the Bears',
      !!rowOf(standingsBefore, 'Hawks') && !!rowOf(standingsBefore, 'Bears'),
      JSON.stringify(standingsBefore).slice(0, 400),
    );
    await standings.close();
    const stats = await visit(visitor, pages.stats);
    statsBefore = await stats.locator('main').innerText();
    await stats.close();
  });

  const keeper = tablet(tokens.scorekeeper, 'game-night-tablet');
  const owner = tablet(tokens.owner, 'game-night-owner-tablet');
  const took = [];
  let screen;
  /** One play from `from`, timed until the second screen shows it. */
  const play = async (from, input) => {
    const before = Date.now();
    const sequence = await from.tap(input);
    await screen.waitForFunction(
      (n) => Number(document.querySelector('[data-live-sequence]')?.dataset.liveSequence) >= n,
      sequence,
      { timeout: 10_000 },
    );
    took.push(Date.now() - before);
  };
  const score = (side, playerId, points) => ({ type: 'score', side, playerId, points });

  await step('the scorekeeper opens the game and tips off, a visitor watching', async () => {
    const opened = await keeper.open();
    note(
      'the scorekeeper’s tablet holds the game',
      typeof opened.sessionId === 'string',
      JSON.stringify(opened),
    );
    await keeper.tap(
      { type: 'lineup', side: 'home', playerIds: hawks },
      { type: 'lineup', side: 'away', playerIds: bears },
      { type: 'start' },
    );
    screen = await visit(visitor, pages.game);
    await screen.locator('[data-live-connection="open"]').waitFor({ timeout: 10_000 });
    await accessible(screen, 'the live game on the second screen');
  });

  await step(
    'each of the scorekeeper’s plays is on the second screen within 2 seconds',
    async () => {
      await play(keeper, score('home', hawks[0], 3));
      await play(keeper, score('away', bears[0], 2));
      await play(keeper, { type: 'foul', side: 'away', playerId: bears[1] });
      await play(keeper, score('home', hawks[1], 2));
      await play(keeper, score('home', hawks[2], 2));
      await play(keeper, score('away', bears[2], 2));
    },
  );

  await step('a second scorekeeper takes the game over', async () => {
    const asked = await owner.open();
    note(
      'the second tablet is told who holds the game',
      asked.status === 'held-by-other',
      JSON.stringify(asked),
    );
    await owner.takeOver(asked.holder?.since);
    const stillScores = await keeper.tap(score('home', hawks[3], 2)).then(
      () => true,
      () => false,
    );
    note('the first tablet can score no more once the game is taken over', !stillScores);
  });

  await step(
    'each of the second scorekeeper’s plays is on the second screen within 2 seconds',
    async () => {
      await play(owner, score('home', hawks[3], 2));
      await play(owner, score('away', bears[3], 3));
      await play(owner, score('home', hawks[4], 1));
    },
  );
  console.log(`game night: each play reached the second screen in ${took.join(', ')} ms`);
  note('every play was timed', took.length === 9, `${took.length} timed`);
  note(
    `every play reached the second screen within ${withinMs} ms`,
    took.length > 0 && Math.max(...took) <= withinMs,
    `${took.join(', ')} ms`,
  );

  await step('the second scorekeeper ends the game', async () => {
    // The format's last period: End is refused before it, so the next period is tried.
    let ended = false;
    for (let period = 2; period <= 4 && !ended; period += 1) {
      ended = await owner.tap({ type: 'end' }).then(
        () => true,
        () => false,
      );
      if (!ended) await owner.tap({ type: 'pause' }, { type: 'period', period }, { type: 'start' });
    }
    if (!ended)
      ended = await owner.tap({ type: 'end' }).then(
        () => true,
        () => false,
      );
    note('the game is ended', ended);
    await screen.reload();
    await screen.locator('main').first().waitFor();
    const main = await screen.locator('main').innerText();
    note(
      'the game’s page reads Final, 10 to 7',
      /final/i.test(main) && main.includes('10') && main.includes('7'),
      main.slice(0, 300),
    );
    note('the game’s page names no Bears player', !namesABear(main));
    await accessible(screen, 'the ended game');
  });

  await step('the standings move', async () => {
    const page = await visit(visitor, pages.standings);
    const after = await standingsOf(page);
    const [hb, bb, ha, ba] = [
      rowOf(standingsBefore, 'Hawks'),
      rowOf(standingsBefore, 'Bears'),
      rowOf(after, 'Hawks'),
      rowOf(after, 'Bears'),
    ];
    const columns = Object.keys(ha ?? {});
    const played = columns.filter((c) => rose(hb, ha, c) === 1 && rose(bb, ba, c) === 1);
    const won = columns.filter((c) => rose(hb, ha, c) === 1 && rose(bb, ba, c) === 0);
    const lost = columns.filter((c) => rose(bb, ba, c) === 1 && rose(hb, ha, c) === 0);
    const seen = JSON.stringify({ hb, ha, bb, ba });
    note('the standings count one more game for both teams', played.length > 0, seen);
    note('the standings count a win for the Hawks', won.length > 0, seen);
    note('the standings count a loss for the Bears', lost.length > 0, seen);
    const words = await page.locator('main').innerText();
    note('the standings name no Bears player', !namesABear(words));
    await accessible(page, 'the standings after the game');
    await page.close();
  });

  await step('the statistics move', async () => {
    const page = await visit(visitor, pages.stats);
    const text = await page.locator('main').innerText();
    note(
      'the statistics are not what they were before the game',
      text !== statsBefore,
      text.slice(0, 300),
    );
    const words = await page.locator('main').innerText();
    note('the statistics name no Bears player', !namesABear(words));
    await accessible(page, 'the statistics after the game');
    await page.close();
  });
  await visitor.close();
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Game night browser check failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Game night browser check passed: ${checked.length} checks in a real browser.`);
