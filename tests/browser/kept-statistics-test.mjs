// The scoring screen offers only the statistics the season keeps (step 2.241, S-93,
// S-107), in a real browser on a made-up world of its own:
// - The made-up season keeps the standard set: a turnover sent anyway, as a forged
//   batch, is refused, with its own code to a tracker that names it and as a game rule
//   to an older one, in the server's own sentence; the scoring screen draws no turnover
//   button and no turnovers count, and a basket is counted as ever.
// - The owner picks "the standard set with turnovers" in "Statistics kept": the screen
//   draws the turnover button, a tapped turnover is saved, and once the game is ended the
//   public box score (drawn only for a final game; a live game's page shows points and
//   fouls) has a turnovers column counting it, on the player's line and in the Total.
import { randomUUID } from 'node:crypto';
import {
  addPlayers,
  court,
  keepStatistics,
  league,
  leagueId,
  liveGame,
  scorekeeper,
  starters,
  trackerPath,
} from './tracker-driver.mjs';
import { freePort, launch, startNext, waitFor } from './web-browser-kit.mjs';

/** How long a tap may take to show on the screen, or the game to be saved as ended. */
const tapLimit = 10_000;
const endLimit = 20_000;

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

const origin = `http://localhost:${await freePort()}`;
const server = startNext(['start', '--port', new URL(origin).port], {
  APP_ENV: 'test',
  PUBLIC_BASE_URL: origin,
});
let browser;

/** A batch as a device sends it, from a tablet that is not the browser's. */
async function forge(body) {
  const post = async (at, payload) => {
    const answer = await fetch(`${origin}/api/v1/leagues/${leagueId}/games/${liveGame}${at}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `${scorekeeper.name}=${scorekeeper.value}`,
        origin,
      },
      body: JSON.stringify(payload),
    });
    const text = await answer.text();
    if (!answer.ok) throw new Error(`${at} answered ${answer.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  };
  const { sessionId } = await post('/session', { type: 'open', deviceId: 'forging-tablet' });
  try {
    const commands = [
      { commandId: randomUUID(), at: Date.now(), input: { type: 'team-turnover', side: 'home' } },
    ];
    return (await post('/commands', { ...body, sessionId, commands })).results[0];
  } finally {
    await post('/session', { type: 'release', sessionId });
  }
}

/**
 * The public game page's box scores (`table.ui-box-score`, one a team), each with the
 * place of its turnovers column (its heading's full name, "Turnovers"; -1 without one),
 * the Total under it and each player's line under it, by jersey.
 */
async function publicBoxScores() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    const answer = await page.goto(`${origin}/${league}/games/${liveGame}`);
    if (answer?.status() !== 200) throw new Error(`the game's page answered ${answer?.status()}`);
    return await page.locator('table.ui-box-score').evaluateAll((tables) =>
      tables.map((table) => {
        const heads = [...table.querySelectorAll('thead tr > *')];
        const at = heads.findIndex((cell) => cell.getAttribute('title') === 'Turnovers');
        const under = (row) => (at < 0 ? null : (row?.children[at]?.textContent ?? null));
        return {
          heads: heads.map((cell) => cell.getAttribute('title') ?? cell.textContent ?? ''),
          at,
          total: under(table.querySelector('tfoot tr')),
          lines: [...table.querySelectorAll('tbody tr')].map((row) => ({
            jersey: row.children[0]?.textContent ?? '',
            turnovers: under(row),
          })),
        };
      }),
    );
  } finally {
    await context.close();
  }
}

/** The scoring screen as a new device opens it; `work` then gets the court. */
async function onTheScreen(work) {
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  try {
    await context.addCookies([{ ...scorekeeper, url: origin }]);
    const page = await context.newPage();
    await page.goto(`${origin}${trackerPath()}`);
    const c = court(page);
    await c.open();
    await work(c);
  } finally {
    await context.close();
  }
}

try {
  await waitFor(`${origin}/`, server);
  await addPlayers(origin);
  browser = await launch();

  await step('the standard set: a forged turnover', async () => {
    const sentence = 'This season does not keep turnovers.';
    const knows = await forge({ protocolVersion: 2, knownRefusals: ['statistic-not-kept'] });
    note(
      'a tracker that names the code is refused statistic-not-kept, in the server’s words',
      knows?.status === 'refused' &&
        knows.reason.code === 'statistic-not-kept' &&
        knows.reason.message === sentence,
      JSON.stringify(knows),
    );
    const older = await forge({ protocolVersion: 1 });
    note(
      'an older tracker is refused as a game rule, in the same words',
      older?.status === 'refused' &&
        older.reason.code === 'rule' &&
        older.reason.message === sentence,
      JSON.stringify(older),
    );
  });

  await step('the standard set: the scoring screen', () =>
    onTheScreen(async (c) => {
      await c.pick('home', starters);
      await c.pick('away', starters);
      await c.tile('home', 5).click();
      await c.option('p2').waitFor();
      note('the pad offers no turnover', (await c.option('turnover').count()) === 0);
      note('no turnovers count is drawn', (await c.turnoversChip('home').count()) === 0);
      await c.option('p2').click();
      // The tile's own count, once it says 2; a time limit, and a failure if it never does.
      await c.tile('home', 5).locator('[data-points="2"]').waitFor({ timeout: tapLimit });
      note('the basket is counted', (await c.points('home', 5)) === 2);
      await c.saved();
    }),
  );

  await step('the owner keeps turnovers in “Statistics kept”', () =>
    keepStatistics(browser, origin, 'standard-turnovers'),
  );

  await step('the standard set with turnovers: the scoring screen', () =>
    onTheScreen(async (c) => {
      await c.tile('home', 7).click();
      await c.option('p2').waitFor();
      note('the pad offers the turnover', (await c.option('turnover').count()) === 1);
      await c.option('turnover').click();
      await c.turnoversChip('home').waitFor({ timeout: tapLimit });
      note('the turnovers count is drawn', (await c.turnoversChip('home').count()) === 1);
      await c.saved();
      // Home leads 2–0, so the game can end (number 7 is home's: the made-up away team's lines are not shown); the public box score is a final game's.
      await c.endGame();
      await c.pad.locator('[data-final="saved"]').waitFor({ timeout: endLimit });
    }),
  );

  await step('the standard set with turnovers: the public box score', async () => {
    const boxes = await publicBoxScores();
    note('the final game has both teams’ box scores', boxes.length === 2, JSON.stringify(boxes));
    note(
      'each box score has a turnovers column',
      boxes.length === 2 && boxes.every((box) => box.at >= 0),
      JSON.stringify(boxes),
    );
    const totals = boxes.map((box) => Number(box.total) || 0);
    note(
      'the Totals count the one turnover',
      totals.reduce((a, b) => a + b, 0) === 1,
      JSON.stringify(boxes),
    );
    const counted = boxes.find((box) => box.total === '1');
    note(
      'it is on number 7’s line',
      counted?.lines.find((line) => line.jersey === '7')?.turnovers === '1',
      JSON.stringify(counted),
    );
  });
} finally {
  await browser?.close();
  server.child.kill();
}

if (failures.length > 0) {
  console.error(`Kept statistics browser test: ${failures.length} problem(s)`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`Kept statistics browser test passed: ${checks} checks.`);
