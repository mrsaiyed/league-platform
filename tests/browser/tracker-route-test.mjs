// Step 2.33: the tracker's address and the scorekeeper's games in a real browser, against
// the web app on its made-up stand-in (APP_ENV=test). Nothing leaves this computer; every
// team, game and person is made up. Builds the app first unless given --no-build (npm run
// test:web:browser builds it once in web-exit-test.mjs, then runs this with --no-build).
//
// - The made-up scorekeeper opens the admin and sees only their games, each with a button
//   to the tracker; opening one takes the scoring session, asks to confirm the game format,
//   and stores the rosters and the state on the device (IndexedDB, T-115). Once confirmed,
//   the same device opens straight to scoring; leaving goes back to the games.
// - The made-up owner, who runs the league, opens a game the scorekeeper is holding: told
//   who holds it, takes over after confirming, and confirms the format.
// - Another league's admin and a coach are refused: "you do not have access" (U-6).
// - Someone not signed in is sent to sign in, told why, and brought back to the game (the
//   made-up member, who scores nowhere, is then refused there); "Your games" does the same.
// - The games are in game-night order (live, today, days ahead, finished), the first
//   "Score this game" on a phone's first screen; a final-score game says so and links to
//   where its score is entered, as its tracker page does.
// - In the draft league, which scores assigned games only, the scorekeeper is told a game
//   assigned to its admin is not theirs, with the way back, and does not see it on their
//   games (P7 §5.1). An unknown game is refused with the way back too.
// - With no answer from the server the tracker mentions the connection after about ten
//   seconds and opens by itself once it answers; signed out while open, it offers to sign
//   in and come back.
// - Signing out on the account page clears the games the device kept (T-115).
// Accessibility checks on each screen (T-186), and no sideways scrolling at phone width (A-2).
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
const liveGame = '01900000-0000-7000-8000-006a00000002'; // Hawks v Bears, live
const otherGame = '01900000-0000-7000-8000-006a00000003'; // Hawks v Lions, assigned to nobody
const finalScoreGame = '01900000-0000-7000-8000-006a00000001'; // Lions v Tigers, final score only
const laterGame = '01900000-0000-7000-8000-006a00000004'; // Tigers v Bears, in two days
const finishedGame = '01900000-0000-7000-8000-006a00000005'; // Bears v Lions, final, this morning
const unknownGame = '01900000-0000-7000-8000-006a000000ff';
// The made-up member who signs in with a password (stand-in-ports.ts): scores nowhere.
const member = { email: 'member@example.test', password: 'made-up member password' };
const tracker = (game) => `/north-valley/score/${game}`;
// The draft league has the same games, scores assigned games only, and gives the live
// game to its admin (apps/web/src/server/stand-in-ports.ts, moreLeagues).
const assignedOnlyTracker = (game) => `/quiet-pines/score/${game}`;
const noAccess = /you do not have access/i;

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

async function signedInAs(token) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await context.addCookies([{ name: 'srl_session', value: token, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { context, page };
}
async function accessible(page, label) {
  await page
    .waitForFunction(() => document.title.trim() !== '', null, { timeout: 5000 })
    .catch(() => {});
  const problems = await accessibilityProblems(page);
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
}
async function noSidewaysScroll(page, label) {
  const [width, inner] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  note(`no sideways scrolling at phone width: ${label}`, width <= inner, `${width} > ${inner}`);
}
/** What the device keeps of a game in its browser database (indexeddb-opened-game-storage.ts). */
const keptOnDevice = (page, game) =>
  page.evaluate(
    (id) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('srleagues-tracker-games');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('games')) {
            db.close();
            resolve(null);
            return;
          }
          const read = db.transaction('games').objectStore('games').get(id);
          read.onsuccess = () => {
            db.close();
            resolve(read.result ?? null);
          };
          read.onerror = () => reject(read.error);
        };
      }),
    game,
  );
/** How many games the device keeps in its browser database, all accounts together. */
const gamesKeptOnDevice = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('srleagues-tracker-games');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('games')) {
            db.close();
            resolve(0);
            return;
          }
          const count = db.transaction('games').objectStore('games').count();
          count.onsuccess = () => {
            db.close();
            resolve(count.result);
          };
          count.onerror = () => reject(count.error);
        };
      }),
  );
const formatHeading = (page) =>
  page.getByRole('heading', { level: 2, name: 'Check the game format' });
/** The scoring screen (step 2.35), where "This device is scoring the game." used to stand. */
const scoringScreen = (page) => page.locator('[data-scoring]');
const signOutHint = 'On a shared phone or tablet, sign out when you finish.';
const signOutLink = (page) => page.getByRole('link', { name: 'Sign out on your account page' });
/** The height of the main tap, in CSS pixels: at least 44 (A-2). */
const tapHeight = async (locator) => (await locator.boundingBox())?.height ?? 0;

if (browser) {
  await step('the scorekeeper opens their games and a game in the tracker', async () => {
    const { context, page } = await signedInAs('local-scorekeeper-token');
    try {
      await page.goto(`${origin}/north-valley/admin`);
      await page.getByRole('heading', { level: 1, name: 'Your games' }).waitFor();
      const buttons = page.getByRole('link', { name: 'Score this game' });
      note('each game to be played has a button to the tracker', (await buttons.count()) >= 2);
      note(
        'the admin shows nothing but the games',
        (await page.getByText('Nothing here yet.').count()) === 0,
      );
      note(
        'the games list tells a shared device to sign out, with a link to the account page',
        (await page.getByText(signOutHint).count()) === 1 &&
          (await signOutLink(page).getAttribute('href')) === '/account',
      );
      note(
        '"Score this game" is a tap at least 44px high',
        (await tapHeight(buttons.first())) >= 44,
        String(await tapHeight(buttons.first())),
      );
      note(
        'the games are cards with no bullets beside them',
        (await page
          .locator('[data-my-games]')
          .evaluate((list) => getComputedStyle(list).listStyleType)) === 'none',
      );
      await accessible(page, "the scorekeeper's games");
      await noSidewaysScroll(page, "the scorekeeper's games");

      await Promise.all([
        page.waitForURL((url) => url.pathname === tracker(liveGame)),
        page
          .locator(`li[data-game="${liveGame}"]`)
          .getByRole('link', { name: 'Score this game' })
          .click(),
      ]);
      // Since step 2.35 the tracker's title is the game itself (the two teams, the day and
      // the time), with "Score a game" as the small line above it.
      await page.getByRole('heading', { level: 1, name: /Bears at Hawks/ }).waitFor();
      note(
        'the tracker says what it is for, above the game',
        (await page.getByText('Score a game').count()) === 1,
      );
      note('the tracker names the game', (await page.getByText('Bears at Hawks').count()) > 0);
      await formatHeading(page).waitFor();
      note('the format is shown', (await page.getByText('Overtime periods of').count()) === 1);
      note(
        '"All saved" is not said before anything is entered',
        (await page.getByText('All saved').count()) === 0,
      );
      note(
        'the tracker tells a shared device to sign out',
        (await page.getByText(signOutHint).count()) === 1 &&
          (await signOutLink(page).count()) === 1,
      );
      note(
        '"Confirm and start scoring" is a tap at least 44px high',
        (await tapHeight(page.getByRole('button', { name: 'Confirm and start scoring' }))) >= 44,
      );
      await accessible(page, 'confirming the format');
      await noSidewaysScroll(page, 'confirming the format');

      const kept = await keptOnDevice(page, liveGame);
      note('the rosters are stored on the device', kept?.rosters?.home?.name === 'Hawks');
      note(
        'the players are stored with their names',
        kept?.rosters?.away?.players?.some((p) => p.firstName === 'Sol') === true,
      );
      note('the state is stored on the device', typeof kept?.state?.sequence === 'number');

      await page.getByRole('button', { name: 'Confirm and start scoring' }).click();
      await scoringScreen(page).waitFor();
      note('the banner says all is saved', (await page.getByText('All saved').count()) === 1);
      note(
        'the confirmed format is stored on the device',
        (await keptOnDevice(page, liveGame))?.confirmedFormat !== null,
      );
      await accessible(page, 'the scoring screen');

      // The same device opens straight to scoring: the format was confirmed here.
      await page.reload();
      await scoringScreen(page).waitFor();
      note(
        'the format is not asked again on this device',
        (await formatHeading(page).count()) === 0,
      );

      // On the scoring screen the one way out is behind More (step 2.35), where a stray
      // tap cannot leave the game.
      await page.getByRole('button', { name: 'More' }).click();
      note(
        'one way out of the game: "Back to your games", no "Leave the game" beside it',
        (await page.getByRole('button', { name: 'Leave the game' }).count()) === 0 &&
          (await page.getByRole('link', { name: 'Back to your games' }).count()) === 1,
      );
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/north-valley/admin'),
        page.getByRole('link', { name: 'Back to your games' }).click(),
      ]);
      note('leaving goes back to the games', true);
    } finally {
      await context.close();
    }
  });

  await step('the owner takes over a game the scorekeeper is holding', async () => {
    const keeper = await signedInAs('local-scorekeeper-token');
    const owner = await signedInAs('local-owner-token');
    try {
      await keeper.page.goto(origin + tracker(otherGame));
      await formatHeading(keeper.page).waitFor();
      const response = await owner.page.goto(origin + tracker(otherGame));
      note(
        'the owner may open the tracker',
        response?.status() === 200,
        String(response?.status()),
      );
      await owner.page
        .getByText('Sam Scorekeeper is scoring this game on another device.')
        .waitFor();
      await accessible(owner.page, 'held by another device');
      const takeOver = owner.page.getByRole('button', { name: 'Take over scoring' });
      note('"Take over scoring" is a tap at least 44px high', (await tapHeight(takeOver)) >= 44);
      await takeOver.click();
      // One tap only asks: the game is not taken until the owner says yes (T6 §5).
      await owner.page
        .getByText(
          'Take over scoring from Sam Scorekeeper? Their device stops scoring. Plays it has not sent yet will not be saved',
        )
        .waitFor();
      note(
        'the first tap asks before taking over',
        (await formatHeading(owner.page).count()) === 0 &&
          (await owner.page
            .getByText('Sam Scorekeeper is scoring this game on another device.')
            .count()) === 1,
      );
      await accessible(owner.page, 'asked to confirm the takeover');
      for (const name of ['Yes, take over', 'Not now']) {
        const height = await tapHeight(owner.page.getByRole('button', { name }));
        note(`"${name}" is a tap at least 44px high`, height >= 44, String(height));
      }
      const back = await tapHeight(owner.page.getByRole('link', { name: 'Back to your games' }));
      note('"Back to your games" is a tap at least 44px high', back >= 44, String(back));
      await owner.page.getByRole('button', { name: 'Not now' }).click();
      await owner.page.getByRole('button', { name: 'Take over scoring' }).click();
      await owner.page.getByRole('button', { name: 'Yes, take over' }).click();
      await formatHeading(owner.page).waitFor();
      note('after confirming the takeover the owner confirms the format', true);
    } finally {
      await keeper.context.close();
      await owner.context.close();
    }
  });

  for (const [who, token] of [
    ["another league's admin", 'local-other-admin-token'],
    ['a coach', 'local-coach-token'],
  ]) {
    await step(`${who} is refused`, async () => {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      try {
        await context.addCookies([{ name: 'srl_session', value: token, url: origin }]);
        const page = await context.newPage();
        const response = await page.goto(origin + tracker(liveGame));
        note(`${who}: 403`, response?.status() === 403, String(response?.status()));
        await page.getByRole('heading', { level: 1 }).filter({ hasText: noAccess }).waitFor();
        note(
          `${who}: nothing of the game shown`,
          (await page.getByText('Bears at Hawks').count()) === 0,
        );
        await accessible(page, `${who} refused`);
      } finally {
        await context.close();
      }
    });
  }
}

if (browser) {
  // Signed out at the tracker: sent to sign in, told why, and brought back to the game.
  // Only the made-up member signs in with a password, and scores nowhere, so back on the
  // game they get the league's own "no access" (U-6): the way back is what is checked.
  await step('a visitor is sent to sign in and brought back to the game', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      await page.goto(origin + tracker(liveGame));
      const at = new URL(page.url());
      note(
        'signed out: the tracker sends to sign in, coming back to this game',
        at.pathname === '/signin' && at.searchParams.get('next') === tracker(liveGame),
        page.url(),
      );
      await page.getByText('Sign in to score this game.').waitFor();
      note('the sign-in screen says why', true);
      note(
        'signed out: nothing of the game shown',
        (await page.getByText('Bears at Hawks').count()) === 0,
      );
      await accessible(page, 'sent to sign in from the tracker');
      await page.getByLabel('Email').fill(member.email);
      await page.getByLabel('Password').fill(member.password);
      await Promise.all([
        page.waitForURL((url) => url.pathname === tracker(liveGame)),
        page.getByRole('button', { name: 'Sign in', exact: true }).click(),
      ]);
      note('after signing in the browser is back on the game', true);
      await page.getByRole('heading', { level: 1 }).filter({ hasText: noAccess }).waitFor();
      note('someone signed in who scores nowhere here is refused there (U-6)', true);

      // "Your games", reached signed out, does the same.
      await context.clearCookies();
      await page.goto(`${origin}/north-valley/admin`);
      const games = new URL(page.url());
      note(
        'signed out: "Your games" sends to sign in, coming back to it',
        games.pathname === '/signin' && games.searchParams.get('next') === '/north-valley/admin',
        page.url(),
      );
    } finally {
      await context.close();
    }
  });

  await step('a game not recorded live is not opened in the tracker', async () => {
    const { context, page } = await signedInAs('local-scorekeeper-token');
    try {
      await page.goto(`${origin}/north-valley/admin`);
      await page.getByRole('heading', { level: 1, name: 'Your games' }).waitFor();
      const card = page.locator(`li[data-game="${finalScoreGame}"]`);
      note(
        'a game recorded as a final score has no button to the tracker',
        (await card.getByRole('link', { name: 'Score this game' }).count()) === 0,
      );
      note(
        'its card says how it is recorded, with a link to enter the score',
        (await card.getByText('Final score only').count()) === 1 &&
          (await card.getByRole('link', { name: 'Enter the score' }).getAttribute('href')) ===
            '/north-valley/admin/games',
      );
      await page.goto(origin + tracker(finalScoreGame));
      await page
        .getByText('This game is set to final score only, so there is no live scoring.')
        .waitFor();
      note(
        'its tracker page says where its score is entered',
        (await page.getByRole('link', { name: 'Enter the score' }).getAttribute('href')) ===
          '/north-valley/admin/games' &&
          (await page.getByRole('link', { name: 'Back to your games' }).count()) === 1,
      );
      note(
        'its tracker page keeps nothing on the device',
        (await keptOnDevice(page, finalScoreGame)) === null,
      );
      await accessible(page, 'a game not recorded live');
      await noSidewaysScroll(page, 'a game not recorded live');
    } finally {
      await context.close();
    }
  });

  await step("the scorekeeper's games are in game-night order", async () => {
    const { context, page } = await signedInAs('local-scorekeeper-token');
    try {
      await page.goto(`${origin}/north-valley/admin`);
      await page.getByRole('heading', { level: 1, name: 'Your games' }).waitFor();
      const order = await page
        .locator('[data-my-games] > li')
        .evaluateAll((items) => items.map((li) => li.getAttribute('data-game')));
      // Live now, today still to play, the days ahead (by day), and the finished game.
      note(
        'live first, then today, then the days ahead, finished last',
        JSON.stringify(order) ===
          JSON.stringify([liveGame, finalScoreGame, otherGame, laterGame, finishedGame]),
        JSON.stringify(order),
      );
      const first = page.getByRole('link', { name: 'Score this game' }).first();
      const box = await first.boundingBox();
      note(
        'on a phone the first "Score this game" is on the first screen',
        box !== null && box.y + box.height <= 812,
        JSON.stringify(box),
      );
      note(
        'the first "Score this game" is the game being played now',
        (await page
          .locator(`li[data-game="${liveGame}"]`)
          .getByRole('link', { name: 'Score this game' })
          .count()) === 1 && order[0] === liveGame,
      );
    } finally {
      await context.close();
    }
  });

  await step('in an archived league the scorekeeper is told so, with the way back', async () => {
    const { context, page } = await signedInAs('local-scorekeeper-token');
    try {
      const archived = 'This league is archived, so its games cannot be scored or changed.';
      await page.goto(`${origin}/old-meadow/score/${liveGame}`);
      await page.getByText(archived).waitFor();
      note(
        'archived league, tracker: says so, nothing of the game, "Back to your games"',
        (await page.getByText('Bears at Hawks').count()) === 0 &&
          (await page.getByRole('link', { name: 'Back to your games' }).getAttribute('href')) ===
            '/old-meadow/admin' &&
          (await page.getByRole('heading', { level: 1 }).filter({ hasText: noAccess }).count()) ===
            0,
      );
      await accessible(page, 'archived league, tracker');
      await page.goto(`${origin}/old-meadow/admin`);
      await page.getByRole('heading', { level: 1, name: 'Your games' }).waitFor();
      note(
        'archived league, "Your games": says so',
        (await page.getByText(archived).count()) === 1,
      );
    } finally {
      await context.close();
    }
  });

  await step('an unknown game is refused with the way back', async () => {
    const { context, page } = await signedInAs('local-scorekeeper-token');
    try {
      for (const game of [unknownGame, 'tonight']) {
        await page.goto(`${origin}/north-valley/score/${game}`);
        await page.getByText('We could not find that game.').waitFor();
        note(
          `an unknown game (${game}): "Back to your games" goes to the games`,
          (await page.getByRole('link', { name: 'Back to your games' }).getAttribute('href')) ===
            '/north-valley/admin',
        );
      }
      await accessible(page, 'an unknown game');
    } finally {
      await context.close();
    }
  });

  await step('a scorekeeper is refused a game assigned to someone else', async () => {
    const { context, page } = await signedInAs('local-scorekeeper-token');
    try {
      await page.goto(`${origin}/quiet-pines/admin`);
      await page.getByRole('heading', { level: 1, name: 'Your games' }).waitFor();
      note(
        "a game assigned to someone else is not on the scorekeeper's games",
        (await page.locator(`li[data-game="${liveGame}"]`).count()) === 0,
      );
      await page.goto(origin + assignedOnlyTracker(liveGame));
      // The tracker's own refusal, not the league's "no access": they do score here.
      await page
        .getByText(
          'You are not assigned to score this game. Ask a league admin to assign it to you.',
        )
        .waitFor();
      note(
        'assigned games only: told the game is not theirs, with the way back to their games',
        (await page.getByRole('link', { name: 'Back to your games' }).getAttribute('href')) ===
          '/quiet-pines/admin' &&
          (await page.getByRole('link', { name: 'Sign in' }).count()) === 0 &&
          (await page.getByRole('heading', { level: 1 }).filter({ hasText: noAccess }).count()) ===
            0,
      );
      note(
        'assigned games only: nothing of the game shown',
        (await page.getByText('Bears at Hawks').count()) === 0,
      );
      note(
        'assigned games only: nothing of the game kept on the device',
        (await keptOnDevice(page, liveGame)) === null,
      );
      await accessible(page, 'a game assigned to someone else refused');
    } finally {
      await context.close();
    }
  });

  await step('with no answer from the server, the tracker says so and keeps trying', async () => {
    const { context, page } = await signedInAs('local-scorekeeper-token');
    try {
      await context.route('**/api/**', (route) => route.abort());
      const started = Date.now();
      await page.goto(origin + tracker(liveGame));
      await page.getByText('Opening the game…').waitFor();
      await page
        .getByText('No answer yet. Check the connection; this keeps trying.')
        .waitFor({ timeout: 30_000 });
      const waited = Date.now() - started;
      note('after about ten seconds the connection is mentioned', waited >= 9_000, `${waited} ms`);
      await accessible(page, 'no answer from the server');
      await context.unroute('**/api/**');
      await scoringScreen(page).or(formatHeading(page)).waitFor({ timeout: 60_000 });
      note(
        'once the server answers the game opens by itself, and the words go',
        (await page.getByText('No answer yet.').count()) === 0,
      );
      // Leave by the one way out, so the next device finds the game free.
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/north-valley/admin'),
        page.getByRole('link', { name: 'Back to your games' }).click(),
      ]);
    } finally {
      await context.close();
    }
  });

  await step('signed out while the game is open, the tracker offers to sign in', async () => {
    const { context, page } = await signedInAs('local-scorekeeper-token');
    try {
      await page.goto(origin + tracker(liveGame));
      await scoringScreen(page).or(formatHeading(page)).waitFor();
      // The session cookie goes; the device finds out at its next renewal (30 s).
      await context.clearCookies();
      await page.getByText('You are signed out.').waitFor({ timeout: 60_000 });
      const href = await page.getByRole('link', { name: 'Sign in' }).getAttribute('href');
      const to = new URL(href ?? '/nowhere', origin);
      note(
        'signed out while open: a "Sign in" link coming back to this game',
        to.pathname === '/signin' && to.searchParams.get('next') === tracker(liveGame),
        String(href),
      );
      await accessible(page, 'signed out while the game is open');
    } finally {
      await context.close();
    }
  });

  // Last, as it ends the made-up scorekeeper's session.
  await step('signing out clears the games kept on the device', async () => {
    const { context, page } = await signedInAs('local-scorekeeper-token');
    try {
      await page.goto(origin + tracker(liveGame));
      // The device signed out above may still hold the game: then this one is told so.
      await scoringScreen(page)
        .or(formatHeading(page))
        .or(page.getByText('is scoring this game on another device.'))
        .waitFor();
      note('a game is kept on the device before signing out', (await gamesKeptOnDevice(page)) > 0);
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/account'),
        signOutLink(page).click(),
      ]);
      await Promise.all([
        page.waitForURL((url) => url.pathname !== '/account'),
        page.getByRole('button', { name: 'Sign out', exact: true }).click(),
      ]);
      note(
        'signing out leaves no game kept on the device',
        (await gamesKeptOnDevice(page)) === 0,
        String(await gamesKeptOnDevice(page)),
      );
    } finally {
      await context.close();
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Tracker route browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Tracker route browser test passed (${checked.length} checks).`);
