// Step 2.154: one wrong tap in Games does no harm, in a real browser at phone width,
// against the web app on its made-up stand-in (APP_ENV=test). Nothing leaves this
// computer; every team, game and person is made up. Builds the app first unless given
// --no-build (npm run test:web:browser builds it once in web-exit-test.mjs).
//
// Each person starts where they start (the admin's home, signed in as the other browser
// tests sign in) and reaches the games by tapping; no other address is typed.
//
// - No game is made final with fewer than two deliberate taps: the score boxes are shut
//   until "Enter the final score" is tapped on that game; saving them asks, naming both
//   teams and the score, and says first when the game's time has not come; "No" keeps
//   what was typed; a double tap on the save button only asks; only "Yes" saves, and
//   "Saved" names the game and its score, beside it, on the screen without scrolling.
// - The live game, which the tracker has recorded plays of, has no score boxes and offers
//   "Score this game" (S-46).
// - A scheduler saves a wrong final score, taps "Correct this result", gives a reason and
//   saves the right one, with a real double tap on "Reopen to correct" and on "Yes, make it
//   final": each is done once and read as done. A scorekeeper reads who can reopen that
//   game, on their games and on the games list.
// - A game its tracker ended (played to its end through the tracker's own endpoints, as a
//   tablet would): the scorekeeper who ended it reads until when they may reopen it and
//   does, inside the league's minutes; ended again, an admin reopens it. Each time it is
//   live again, scored in the tracker, with no score boxes.
// - With scripts off, a game set to live tracking with no plays yet is finished by score
//   through the same two steps; by keyboard, the boxes open and the score is saved.
// - Every control on the games list is at least 44 high; accessibility checks (T-186) and
//   no sideways scrolling at phone width (A-2).
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

// The made-up games of the first league (apps/web/src/server/stand-in-games.ts).
const finalScoreGame = '01900000-0000-7000-8000-006a00000001'; // Tigers at Lions, final score only
const liveGame = '01900000-0000-7000-8000-006a00000002'; // Bears at Hawks, live, with plays
const tomorrowGame = '01900000-0000-7000-8000-006a00000003'; // Lions at Hawks, set to live, no plays
const laterGame = '01900000-0000-7000-8000-006a00000004'; // Bears at Tigers, in two days
const phone = { width: 390, height: 844 };

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

async function signedInAs(token, options = {}) {
  const context = await browser.newContext({ viewport: phone, ...options });
  await context.addCookies([{ name: 'srl_session', value: token, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { context, page };
}
const gameOn = (page, id) => page.locator(`li[id="game-${id}"]`);

/** From the admin's home to the games list, by tapping the admin's own "Games". */
async function openGames(page) {
  await page.goto(`${origin}/north-valley/admin`);
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/north-valley/admin/games'),
    page.locator('a[href="/north-valley/admin/games"]').first().click(),
  ]);
  await page.getByRole('heading', { level: 1, name: 'Games' }).waitFor();
}

/** Lets every answer of a double tap arrive before the page is read. */
async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
}

/**
 * A scorekeeper's tablet scoring the live game through the tracker's own endpoints (step
 * 2.32), as tests/browser and scripts/shots.mjs do: nothing typed in the browser.
 */
const leagueApi = '/api/v1/leagues/01900000-0000-7000-8000-000000000001';
const trackedPlayer = (team, n) =>
  `01900000-0000-7000-8000-${(0x70 + team).toString(16).padStart(4, '0')}${n.toString(16).padStart(8, '0')}`;
async function tablet(game, token) {
  const post = async (at, body) => {
    const answer = await fetch(`${origin}${leagueApi}/games/${game}${at}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `srl_session=${token}`, origin },
      body: JSON.stringify(body),
    });
    const text = await answer.text();
    if (!answer.ok) throw new Error(`${at} answered ${answer.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  };
  const { sessionId } = await post('/session', { type: 'open', deviceId: 'games-area-tablet' });
  return async (...inputs) => {
    const reply = await post('/commands', {
      protocolVersion: 1,
      sessionId,
      commands: inputs.map((input) => ({ commandId: crypto.randomUUID(), at: Date.now(), input })),
    });
    const refused = reply.results.filter((r) => r.status !== 'accepted');
    if (refused.length > 0) throw new Error(`refused: ${JSON.stringify(refused)}`);
  };
}

/** Whether the element is on the screen without scrolling and not under the header. */
const seenWhole = (locator) =>
  locator.evaluate((el) => {
    const box = el.getBoundingClientRect();
    if (box.top < 0 || box.bottom > window.innerHeight || box.height === 0) return false;
    const atCentre = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return atCentre !== null && el.contains(atCentre);
  });

async function accessible(page, label) {
  const problems = await accessibilityProblems(page);
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
  const [width, inner] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  note(`no sideways scrolling at phone width: ${label}`, width <= inner, `${width} > ${inner}`);
}

/** Every control a person taps on the list is at least 44 high. */
async function tallEnough(page, label) {
  const short = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        'main summary.ui-button, main .ui-button, main input:not([type=hidden])',
      ),
    ]
      .filter((el) => el.getBoundingClientRect().height > 0)
      .filter((el) => el.getBoundingClientRect().height < 44)
      .map(
        (el) =>
          `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('name') || '').trim()}"`,
      ),
  );
  note(`every control is at least 44 high: ${label}`, short.length === 0, short.join(', '));
}

/** Types a score into a game's open boxes and taps the save button: it only asks. */
async function typeAndSave(page, id, scores) {
  const game = gameOn(page, id);
  for (const [team, score] of Object.entries(scores)) {
    await game.getByLabel(`Score for ${team}`).fill(String(score));
  }
  await Promise.all([
    page.waitForURL((url) => url.searchParams.get('ask') === id),
    game.getByRole('button', { name: 'Save final score' }).click(),
  ]);
  await game.locator('[data-question]').waitFor();
}

async function sayYes(page, id) {
  const game = gameOn(page, id);
  await Promise.all([
    page.waitForURL(
      (url) => url.searchParams.get('done') === 'final' || url.searchParams.has('problem'),
    ),
    game.getByRole('button', { name: 'Yes, make it final' }).click(),
  ]);
}

if (browser) {
  await step('no game is made final with fewer than two deliberate taps', async () => {
    const { context, page } = await signedInAs('local-scheduler-token');
    try {
      await openGames(page);
      note(
        'the games list opens with every score box shut',
        (await page.locator('main input[type=number]:visible').count()) === 0,
      );
      await tallEnough(page, 'the games list');
      await accessible(page, 'the games list');

      // The live game has plays: no score boxes at all, and "Score this game" (S-46).
      const live = gameOn(page, liveGame);
      note(
        'a game with recorded plays shows no score boxes and no "Enter the final score"',
        (await live.locator('input[type=number]').count()) === 0 &&
          (await live.getByText('Enter the final score').count()) === 0,
      );
      note(
        'a game with recorded plays offers "Score this game"',
        (await live.getByRole('link', { name: 'Score this game' }).getAttribute('href')) ===
          `/north-valley/score/${liveGame}`,
      );
      note(
        'a game with recorded plays offers no forfeit',
        (await live.getByText('Forfeit, postpone or cancel').count()) === 0,
      );

      // The boxes open on the one game tapped.
      const game = gameOn(page, finalScoreGame);
      await game.getByText('Enter the final score').click();
      note(
        'tapping "Enter the final score" opens that game\'s boxes and no other',
        (await page.locator('main input[type=number]:visible').count()) === 2 &&
          (await game.locator('input[type=number]:visible').count()) === 2,
      );
      await tallEnough(page, 'the boxes open');
      await typeAndSave(page, finalScoreGame, { Tigers: 47, Lions: 51 });
      const question = game.locator('[data-question]');
      note(
        'saving asks, naming both teams and the score',
        /Tigers 47, Lions 51\. (Make this final\?|This game is set for .+\. Make it final now\?)/.test(
          (await question.textContent()) ?? '',
        ),
        (await question.textContent()) ?? '',
      );
      note('the question is on the screen beside the game', await seenWhole(question));
      note(
        'asking saved nothing',
        (await game.getByText('Final', { exact: true }).count()) === 0 &&
          (await game.getByText('No, change the score').count()) === 1,
      );
      await tallEnough(page, 'the question');
      await accessible(page, 'the question');

      // "No" keeps what was typed.
      await Promise.all([
        page.waitForURL((url) => url.searchParams.get('enter') === finalScoreGame),
        game.getByRole('link', { name: 'No, change the score' }).click(),
      ]);
      note(
        '"No, change the score" opens the boxes again with what was typed',
        (await game.getByLabel('Score for Tigers').inputValue()) === '47' &&
          (await game.getByLabel('Score for Lions').inputValue()) === '51',
      );
      await typeAndSave(page, finalScoreGame, { Tigers: 47, Lions: 51 });
      await sayYes(page, finalScoreGame);
      const saved = game.getByRole('status');
      note(
        '"Saved" names the game and its score',
        (await saved.textContent()) === 'Saved: Tigers 47, Lions 51 is final.',
        (await saved.textContent()) ?? '',
      );
      note('"Saved" is on the screen at 390 wide without scrolling', await seenWhole(saved));
      note(
        'the game is final with the score saved',
        (await game.getByText('Final', { exact: true }).count()) === 1,
      );

      // A game days ahead: the question says so first; a double tap on save only asks.
      const later = gameOn(page, laterGame);
      await later.getByText('Enter the final score').click();
      await later.getByLabel('Score for Bears').fill('30');
      await later.getByLabel('Score for Tigers').fill('28');
      await Promise.all([
        page.waitForURL((url) => url.searchParams.get('ask') === laterGame),
        later.getByRole('button', { name: 'Save final score' }).dblclick(),
      ]);
      await page.waitForTimeout(1500);
      await later.locator('[data-question]').waitFor();
      note(
        'a game whose time has not come says so in the question',
        /^Bears 30, Tigers 28\. This game is set for .+\. Make it final now\?$/.test(
          ((await later.locator('[data-question] p').first().textContent()) ?? '').trim(),
        ),
        (await later.locator('[data-question] p').first().textContent()) ?? '',
      );
      note(
        'a double tap on the save button only asks',
        (await later.getByText('Final', { exact: true }).count()) === 0,
      );
      // Going back to the boxes and sending them again only asks again.
      await page.goBack();
      await page.goForward();
      note(
        'going back and forward saves nothing',
        (await gameOn(page, laterGame).getByText('Final', { exact: true }).count()) === 0,
      );
    } finally {
      await context.close();
    }
  });

  await step('a scheduler corrects a wrong final score with no address typed', async () => {
    const { context, page } = await signedInAs('local-scheduler-token');
    try {
      await openGames(page);
      const game = gameOn(page, finalScoreGame);
      await Promise.all([
        page.waitForURL((url) => url.pathname === `/north-valley/admin/games/${finalScoreGame}`),
        game.getByRole('link', { name: 'Correct this result' }).click(),
      ]);
      await accessible(page, 'the reopen form');
      await page
        .getByLabel('Why it needs correcting (kept in the log, never shown publicly)')
        .fill('Typed 47 for the Tigers; the sheet says 49');
      // A real double tap on "Reopen to correct": reopened once, and the person lands on
      // the list with the boxes open, not on a notice that someone changed the game.
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/north-valley/admin/games'),
        page.getByRole('button', { name: 'Reopen to correct' }).dblclick(),
      ]);
      await settle(page);
      const reopened = gameOn(page, finalScoreGame);
      note(
        'after reopening (with a double tap), the game says so beside it with its boxes open',
        new URL(page.url()).pathname === '/north-valley/admin/games' &&
          (await reopened.getByRole('status').textContent()) ===
            'The game is reopened. Enter the right result.' &&
          (await reopened.locator('input[type=number]:visible').count()) === 2,
        `${page.url()} ${await reopened
          .getByRole('status')
          .textContent()
          .catch(() => '')}`,
      );
      await typeAndSave(page, finalScoreGame, { Tigers: 49, Lions: 51 });
      // A real double tap on "Yes, make it final": saved once, and "Saved" is what is read.
      await Promise.all([
        page.waitForURL((url) => url.searchParams.get('done') === 'final'),
        gameOn(page, finalScoreGame).getByRole('button', { name: 'Yes, make it final' }).dblclick(),
      ]);
      await settle(page);
      note(
        'the right score is saved and named, after a double tap on "Yes"',
        (await gameOn(page, finalScoreGame).getByRole('status').textContent()) ===
          'Saved: Tigers 49, Lions 51 is final.',
        (await gameOn(page, finalScoreGame).getByRole('status').textContent()) ?? '',
      );
    } finally {
      await context.close();
    }
  });

  await step('a scorekeeper reads who can reopen the game', async () => {
    const { context, page } = await signedInAs('local-scorekeeper-token');
    try {
      await page.goto(`${origin}/north-valley/admin`);
      await page.getByRole('heading', { level: 1, name: 'Your games' }).waitFor();
      const card = page.locator(`li[data-game="${finalScoreGame}"]`);
      const who = 'Only a league admin or a scheduler can reopen this game.';
      note(
        "the scorekeeper's games say who can reopen a final game",
        (await card.getByText(who).count()) === 1 &&
          (await card.getByRole('link', { name: 'Correct this result' }).count()) === 0,
      );
      await openGames(page);
      const game = gameOn(page, finalScoreGame);
      note(
        'the games list says the same to the scorekeeper, with no way to reopen',
        (await game.getByText(who).count()) === 1 &&
          (await game.getByRole('link', { name: 'Correct this result' }).count()) === 0,
      );
      await accessible(page, "the scorekeeper's games list");
    } finally {
      await context.close();
    }
  });

  await step(
    'a game its tracker ended is corrected by its scorekeeper, then by an admin',
    async () => {
      // The scorekeeper's tablet plays the live game (Bears at Hawks) to its end.
      const send = await tablet(liveGame, 'local-scorekeeper-token');
      const five = (team) => [1, 2, 3, 4, 5].map((n) => trackedPlayer(team, n));
      await send(
        { type: 'lineup', side: 'home', playerIds: five(3) },
        { type: 'lineup', side: 'away', playerIds: five(4) },
        { type: 'start' },
        { type: 'score', side: 'home', playerId: trackedPlayer(3, 1), points: 2 },
        { type: 'end' },
      );
      const keeper = await signedInAs('local-scorekeeper-token');
      try {
        const { page } = keeper;
        await openGames(page);
        const game = gameOn(page, liveGame);
        note(
          'the scorekeeper who ended it reads until when they may reopen it, with the way to',
          /^You ended this game in the tracker, so you can reopen it until .+\. Correct this result$/.test(
            ((await game.locator('[data-reopen]').textContent()) ?? '').trim(),
          ),
          (await game.locator('[data-reopen]').textContent()) ?? '',
        );
        await Promise.all([
          page.waitForURL((url) => url.pathname === `/north-valley/admin/games/${liveGame}`),
          game.getByRole('link', { name: 'Correct this result' }).click(),
        ]);
        await accessible(page, "the scorekeeper's reopen form");
        await page
          .getByLabel('Why it needs correcting (kept in the log, never shown publicly)')
          .fill('End game tapped by mistake');
        await Promise.all([
          page.waitForURL((url) => url.pathname === '/north-valley/admin/games'),
          page.getByRole('button', { name: 'Reopen to correct' }).dblclick(),
        ]);
        await settle(page);
        const live = gameOn(page, liveGame);
        note(
          'the scorekeeper reopens it inside the league’s minutes: live again, scored in the tracker',
          (await live.getByRole('status').textContent()) ===
            'The game is live again. Correct it in the tracker, then end it again.' &&
            (await live.getByRole('link', { name: 'Score this game' }).count()) === 1 &&
            (await live.locator('input[type=number]').count()) === 0,
          (await live
            .getByRole('status')
            .textContent()
            .catch(() => '')) ?? '',
        );
      } finally {
        await keeper.context.close();
      }

      // Ended again; an admin corrects it at any time, through the tracker's door.
      await send({ type: 'end' });
      const admin = await signedInAs('local-owner-token');
      try {
        const { page } = admin;
        await openGames(page);
        await Promise.all([
          page.waitForURL((url) => url.pathname === `/north-valley/admin/games/${liveGame}`),
          gameOn(page, liveGame).getByRole('link', { name: 'Correct this result' }).click(),
        ]);
        await page
          .getByLabel('Why it needs correcting (kept in the log, never shown publicly)')
          .fill('A basket went to the wrong player');
        await Promise.all([
          page.waitForURL((url) => url.pathname === '/north-valley/admin/games'),
          page.getByRole('button', { name: 'Reopen to correct' }).click(),
        ]);
        note(
          'an admin reopens a game its tracker ended, and it goes back to the tracker',
          (await gameOn(page, liveGame).getByRole('status').textContent()) ===
            'The game is live again. Correct it in the tracker, then end it again.',
        );
      } finally {
        await admin.context.close();
      }
    },
  );

  await step('with scripts off, a live-set game with no plays is finished by score', async () => {
    const { context, page } = await signedInAs('local-scheduler-token', {
      javaScriptEnabled: false,
    });
    try {
      await openGames(page);
      const game = gameOn(page, tomorrowGame);
      await game.getByText('Enter the final score').click();
      await typeAndSave(page, tomorrowGame, { Lions: 40, Hawks: 44 });
      note(
        'with scripts off the question is its own step',
        (await gameOn(page, tomorrowGame).getByText('Final', { exact: true }).count()) === 0,
      );
      await sayYes(page, tomorrowGame);
      note(
        'with scripts off, "Saved" names the game, on the screen',
        (await gameOn(page, tomorrowGame).getByRole('status').textContent()) ===
          'Saved: Lions 40, Hawks 44 is final.' &&
          (await seenWhole(gameOn(page, tomorrowGame).getByRole('status'))),
      );
    } finally {
      await context.close();
    }
  });

  await step('by keyboard, the boxes open and the score is saved', async () => {
    const { context, page } = await signedInAs('local-scheduler-token');
    try {
      await openGames(page);
      const game = gameOn(page, laterGame);
      await game.locator('[data-score-boxes] > summary').focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      await page.keyboard.type('30');
      await page.keyboard.press('Tab');
      await page.keyboard.type('28');
      await page.keyboard.press('Tab');
      await Promise.all([
        page.waitForURL((url) => url.searchParams.get('ask') === laterGame),
        page.keyboard.press('Enter'),
      ]);
      await gameOn(page, laterGame).getByRole('button', { name: 'Yes, make it final' }).focus();
      await Promise.all([
        page.waitForURL((url) => url.searchParams.get('done') === 'final'),
        page.keyboard.press('Enter'),
      ]);
      note(
        'by keyboard the score is asked about and then saved',
        (await gameOn(page, laterGame).getByRole('status').textContent()) ===
          'Saved: Bears 30, Tigers 28 is final.',
      );
    } finally {
      await context.close();
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Games area browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Games area browser test passed (${checked.length} checks).`);
