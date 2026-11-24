// Step 2.159: a game's page tells the truth in every state, and the lists say the same.
// The made-up world (apps/web/src/server/stand-in-world-seed.ts), its clock started at the
// league's noon (LOCAL_NOW), read at 390 wide, signed out, as a parent reads it:
//
// - for each state (upcoming, awaiting score, live, final, forfeit, postponed, cancelled,
//   being corrected by an admin, being corrected after the scorekeeper's own reopen) the
//   game's own page, the home page, the schedule and its home team's page draw it with the
//   same state word and the same score, wherever it is listed;
// - "Waiting for a score" is a list of its own: no game in it is under the home page's
//   "The next matchups" or a team's "Schedule"; "Recent results" holds only games with a
//   result; an awaiting game's page says "Awaiting score" and never "has not started yet";
//   a forfeit's page has no "Played" and no "Box scores";
// - a game reopened shows the result as it stood, marked "Being corrected", and ended
//   again, the new result, on every page.
//
// The world's games are made and changed by taps in the admin's games area (owner and
// scorekeeper sessions), as corrected-mark-test.mjs and own-result-test.mjs do.
// `--no-build` uses the build already there.
import {
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
  worldAtNoon,
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

// The seed's games (stand-in-world-seed.ts): the tracked week's by number, the listed
// season's by place in its list.
const tracked = (n) => `01900000-0000-7000-8000-006a${n.toString(16).padStart(8, '0')}`;
const listed = (i) => `01900000-0000-7000-8000-0000${(0xb2000000 + 13_000 + i).toString(16)}`;
const games = {
  upcoming: { id: tracked(3), team: 'hawks' }, // Lions at Hawks, tomorrow
  awaiting: { id: listed(20), team: 'herons' }, // Badgers at Herons, three days ago, no score
  live: { id: tracked(2), team: 'hawks' }, // Bears at Hawks, under way
  final: { id: listed(6), team: 'owls' }, // Otters at Owls, finished two hours ago
  forfeit: { id: listed(1), team: 'badgers' }, // Otters at Badgers
  postponed: { id: listed(3), team: 'otters' }, // Herons at Otters
  cancelled: { id: tracked(4), team: 'tigers' }, // Bears at Tigers, cancelled here
  byAdmin: { id: tracked(5), team: 'bears' }, // Lions at Bears, 50 to 44, reopened here
  byScorekeeper: { id: tracked(1), team: 'lions' }, // Tigers at Lions, scored and reopened here
};
const phone = { width: 390, height: 844 };
const reasonLabel = 'Why it needs correcting (kept in the log, never shown publicly)';
const reason = 'The sheet says otherwise';
const nextTitle = 'The next matchups';
const resultsTitle = 'Recent results';
const awaitingWord = 'Awaiting score';
const correctedWord = 'Being corrected';

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
    LOCAL_NOW: worldAtNoon(),
  });
  await step('starting the server and the browser', async () => {
    await waitFor(`${origin}/`, server);
    browser = await launch();
  });
}

/** A public page read signed out at 390 wide: what `read` takes from it once it is drawn. */
async function readPublic(path, read) {
  const context = await browser.newContext({ viewport: phone });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const answer = await page.goto(`${origin}${path}`);
    if (answer?.status() !== 200) throw new Error(`${path} answered ${answer?.status()}`);
    await page.locator('main').waitFor();
    return await read(page);
  } finally {
    await context.close();
  }
}

/**
 * Every card of a game on a list page, by its link to the game's page: the list it is in
 * (its section's heading, or "awaiting" for the "Waiting for a score" list), its state word
 * and its score (away, then home).
 */
const cardsOf = (page, id) =>
  page.evaluate((gameId) => {
    const cards = new Set(
      [...document.querySelectorAll(`main a[href*="/games/${gameId}"]`)]
        .map((link) => link.closest('article.ui-game-card'))
        .filter((card) => card !== null),
    );
    return [...cards].map((card) => ({
      list:
        card.closest('[data-awaiting-list]') !== null
          ? 'awaiting'
          : (card.closest('section')?.querySelector('h2')?.textContent ?? '').trim(),
      word: (card.querySelector('.ui-live, .ui-game-state')?.textContent ?? '').trim(),
      score: [...card.querySelectorAll('.ui-game-side-score, .ui-game-team-score')]
        .map((s) => (s.textContent ?? '').trim())
        .filter((s) => s !== '')
        .join('-'),
    }));
  }, id);

/** Every card on a page under a list: a section by its heading, or "awaiting". */
const cardsUnder = (page, list) =>
  page.evaluate((wanted) => {
    const holders =
      wanted === 'awaiting'
        ? [...document.querySelectorAll('main [data-awaiting-list]')]
        : [...document.querySelectorAll('main section')].filter(
            (s) => (s.querySelector('h2')?.textContent ?? '').trim() === wanted,
          );
    return holders.flatMap((holder) =>
      [...holder.querySelectorAll('article.ui-game-card')].map((card) => ({
        href: card.querySelector('a.ui-game-link')?.getAttribute('href') ?? '',
        word: (card.querySelector('.ui-live, .ui-game-state')?.textContent ?? '').trim(),
        score: [...card.querySelectorAll('.ui-game-side-score, .ui-game-team-score')]
          .map((s) => (s.textContent ?? '').trim())
          .filter((s) => s !== '').length,
      })),
    );
  }, list);

/** The game's own page: its board's state word and score, and the page's words. */
const gamePage = (id) =>
  readPublic(`/north-valley/games/${id}`, async (page) => {
    await page.locator('main .ui-scoreboard').waitFor();
    return page.evaluate(() => {
      const board = document.querySelector('main .ui-scoreboard');
      const middle = board?.querySelector('.ui-scoreboard-middle');
      return {
        word: (middle?.querySelector('.ui-live, .ui-game-state')?.textContent ?? '').trim(),
        score: [...(board?.querySelectorAll('.ui-scoreboard-score') ?? [])]
          .map((s) => (s.textContent ?? '').trim())
          .join('-'),
        text: document.querySelector('main')?.textContent ?? '',
      };
    });
  });

const listPages = (team) => [
  { name: 'the home page', path: '/north-valley' },
  { name: 'the schedule', path: '/north-valley/schedule' },
  { name: `the ${team} page`, path: `/north-valley/teams/${team}` },
];

/**
 * One state on every page: the game's page says `word` with `score`, and every card of it
 * on the home page, the schedule and its team's page says the same. The schedule and the
 * team's page must list it.
 */
async function sameEverywhere(state, { id, team }, word, score) {
  const own = await gamePage(id);
  note(`${state}: the game's page says "${word}"`, own.word === word, JSON.stringify(own.word));
  note(
    `${state}: the game's page shows ${score === '' ? 'no score' : score}`,
    own.score === score,
    own.score,
  );
  for (const { name, path } of listPages(team)) {
    const cards = await readPublic(path, (page) => cardsOf(page, id));
    // The home page shows a few games of each list only; a team's page leaves out a
    // cancelled game (build-team.ts): wherever either shows the game, it must agree.
    const mustList = name === 'the schedule' || (name !== 'the home page' && word !== 'Cancelled');
    if (mustList) note(`${state}: ${name} lists the game`, cards.length > 0);
    for (const card of cards) {
      // A live game with no points yet: its page's board reads 0-0, a card reads "VS" (a
      // list's card draws a live score only once there is one). Any point must agree.
      const sameScore =
        card.score === own.score ||
        (own.word === 'Live' && own.score === '0-0' && card.score === '');
      note(
        `${state}: ${name} (${card.list || 'a list'}) says what the game's page says`,
        card.word === own.word && sameScore,
        `${JSON.stringify(card)} against "${own.word}" ${own.score}`,
      );
    }
  }
  return own;
}

// The admin's games area, by taps (the owner, or the game's scorekeeper).
const row = (page, id) => page.locator(`li[id="game-${id}"]`);

async function signedIn(token) {
  const context = await browser.newContext({ viewport: phone });
  await context.addCookies([{ name: 'srl_session', value: token, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  await page.goto(`${origin}/north-valley/admin/games`);
  await page.getByRole('heading', { level: 1, name: 'Games' }).waitFor();
  return { context, page };
}

async function makeFinal(page, id, away, home) {
  const game = row(page, id);
  if (!(await game.getByLabel(`Score for ${away.name}`).isVisible())) {
    await game.getByText('Enter the final score').click();
  }
  await game.getByLabel(`Score for ${away.name}`).fill(String(away.score));
  await game.getByLabel(`Score for ${home.name}`).fill(String(home.score));
  await game.getByRole('button', { name: 'Save final score' }).click();
  await game.getByRole('button', { name: 'Yes, make it final' }).click();
  await game
    .getByText(/^Saved: /)
    .or(game.getByRole('alert'))
    .waitFor();
  const said = (await game.getByRole('status').textContent()) ?? '';
  const expected = `Saved: ${away.name} ${away.score}, ${home.name} ${home.score} is final.`;
  if (said !== expected) throw new Error(`the save said "${said}", not "${expected}"`);
}

async function reopen(page, id, away) {
  await Promise.all([
    page.waitForURL((url) => url.pathname === `/north-valley/admin/games/${id}`),
    row(page, id).getByRole('link', { name: 'Correct this result' }).click(),
  ]);
  await page.getByLabel(reasonLabel).fill(reason);
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/north-valley/admin/games'),
    page.getByRole('button', { name: 'Reopen to correct' }).click(),
  ]);
  await row(page, id).getByLabel(`Score for ${away.name}`).waitFor();
}

async function cancel(page, id) {
  const game = row(page, id);
  const panel = game.locator('details[data-call-off]').last();
  if ((await panel.getAttribute('open')) === null) await panel.locator('> summary').click();
  await game.getByRole('button', { name: 'Cancel the game', exact: true }).click();
  const yes = game.locator('[data-call-off-ask] [data-call-off-yes]');
  await yes.waitFor();
  // The question is read first: the server takes a sooner "Yes" as a double tap.
  await page.waitForTimeout(1000);
  const said = ((await yes.textContent()) ?? '').trim();
  if (said !== 'Yes, cancel it') throw new Error(`the question's "Yes" says "${said}"`);
  await yes.click();
  await game.getByRole('status').filter({ hasText: 'is cancelled' }).waitFor();
}

if (browser) {
  await step('the lists keep "Waiting for a score" apart, and results have a result', async () => {
    const home = await readPublic('/north-valley', async (page) => ({
      awaiting: await cardsUnder(page, 'awaiting'),
      next: await cardsUnder(page, nextTitle),
      results: await cardsUnder(page, resultsTitle),
    }));
    note(
      'the home page has a "Waiting for a score" list, of two at most',
      home.awaiting.length > 0 && home.awaiting.length <= 2,
      JSON.stringify(home.awaiting),
    );
    note(
      'every game in it says "Awaiting score"',
      home.awaiting.every((c) => c.word === awaitingWord),
      JSON.stringify(home.awaiting),
    );
    note(
      `no game under "${nextTitle}" is awaiting its score`,
      home.next.length > 0 && home.next.every((c) => c.word !== awaitingWord),
      JSON.stringify(home.next),
    );
    const waiting = new Set(home.awaiting.map((c) => c.href));
    note(
      `no game of "Waiting for a score" is also under "${nextTitle}"`,
      home.next.every((c) => !waiting.has(c.href)),
    );
    note(
      '"Recent results" holds only games with a result',
      home.results.length > 0 &&
        home.results.every((c) => c.score === 2 && c.word !== awaitingWord && c.word !== ''),
      JSON.stringify(home.results),
    );
    const schedule = await readPublic('/north-valley/schedule', (page) =>
      cardsUnder(page, 'awaiting'),
    );
    note(
      'the schedule has its "Waiting for a score" list, with the game three days ago',
      schedule.some((c) => c.href.includes(`/games/${games.awaiting.id}`)) &&
        schedule.every((c) => c.word === awaitingWord),
      JSON.stringify(schedule),
    );
    const team = await readPublic(`/north-valley/teams/${games.awaiting.team}`, async (page) => ({
      awaiting: await cardsUnder(page, 'awaiting'),
      schedule: await cardsUnder(page, 'Schedule'),
      results: await cardsUnder(page, 'Results'),
    }));
    note(
      "the team's page lists the awaiting game under its own list, not under Schedule",
      team.awaiting.some((c) => c.href.includes(`/games/${games.awaiting.id}`)) &&
        team.schedule.every((c) => c.word !== awaitingWord),
      JSON.stringify(team),
    );
    note(
      "the team's results all have a result",
      team.results.every((c) => c.score === 2 && c.word !== awaitingWord),
      JSON.stringify(team.results),
    );
  });

  await step('upcoming', () => sameEverywhere('upcoming', games.upcoming, '', ''));
  await step('awaiting score', async () => {
    const own = await sameEverywhere('awaiting score', games.awaiting, awaitingWord, '');
    note(
      'an awaiting game\'s page says "No score has been entered yet." and never "has not started yet"',
      own.text.includes('No score has been entered yet.') &&
        own.text.includes('Was set for') &&
        !own.text.includes('has not started yet'),
      own.text.slice(0, 400),
    );
  });
  await step('live', async () => {
    const own = await gamePage(games.live.id);
    await sameEverywhere('live', games.live, 'Live', own.score);
    const live = await readPublic('/north-valley', (page) => cardsOf(page, games.live.id));
    note('the home page shows the live game', live.length > 0);
  });
  await step('final', async () => {
    const own = await gamePage(games.final.id);
    await sameEverywhere('final', games.final, 'Final', own.score);
    note('a final game shows a score', /^\d+-\d+$/.test(own.score), own.score);
    note("a final game's page says the day it ended", own.text.includes('Ended '));
  });
  await step('forfeit', async () => {
    const own = await gamePage(games.forfeit.id);
    await sameEverywhere('forfeit', games.forfeit, 'Forfeit', own.score);
    note('a forfeit shows a score', /^\d+-\d+$/.test(own.score), own.score);
    note(
      'a forfeit\'s page has no "Box scores" and no "Played"',
      !own.text.includes('Box scores') && !/\bPlayed\b/.test(own.text),
      own.text.slice(0, 400),
    );
  });
  await step('postponed', () => sameEverywhere('postponed', games.postponed, 'Postponed', ''));

  await step('cancelled', async () => {
    const { context, page } = await signedIn('local-owner-token');
    try {
      await cancel(page, games.cancelled.id);
    } finally {
      await context.close();
    }
    await sameEverywhere('cancelled', games.cancelled, 'Cancelled', '');
  });

  const lions = (score) => ({ name: 'Lions', score });
  const bears = (score) => ({ name: 'Bears', score });
  const tigers = (score) => ({ name: 'Tigers', score });

  await step('being corrected by an admin, then ended again', async () => {
    const { context, page } = await signedIn('local-owner-token');
    try {
      await sameEverywhere('final before the admin reopens it', games.byAdmin, 'Final', '50-44');
      await reopen(page, games.byAdmin.id, lions());
      await sameEverywhere(
        'reopened by an admin: the result as it stood',
        games.byAdmin,
        correctedWord,
        '50-44',
      );
      await makeFinal(page, games.byAdmin.id, lions(52), bears(44));
      await sameEverywhere(
        'ended again by the admin: the new result',
        games.byAdmin,
        'Final',
        '52-44',
      );
    } finally {
      await context.close();
    }
  });

  await step("being corrected after the scorekeeper's own reopen, then ended again", async () => {
    const { context, page } = await signedIn('local-scorekeeper-token');
    try {
      await makeFinal(page, games.byScorekeeper.id, tigers(47), lions(51));
      await sameEverywhere('scored by the scorekeeper', games.byScorekeeper, 'Final', '47-51');
      await reopen(page, games.byScorekeeper.id, tigers());
      await sameEverywhere(
        'reopened by its scorekeeper: the result as it stood',
        games.byScorekeeper,
        correctedWord,
        '47-51',
      );
      await makeFinal(page, games.byScorekeeper.id, tigers(49), lions(51));
      await sameEverywhere(
        'ended again by the scorekeeper: the new result',
        games.byScorekeeper,
        'Final',
        '49-51',
      );
    } finally {
      await context.close();
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Game states browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Game states browser test passed (${checked.length} checks).`);
