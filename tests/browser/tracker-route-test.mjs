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
// - Another league's admin, a coach and a visitor are refused: "you do not have access" (U-6).
// - In the draft league, which scores assigned games only, the scorekeeper is refused a
//   game assigned to its admin, and does not see it on their games (P7 §5.1).
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
      await page.getByRole('heading', { level: 1, name: 'Score a game' }).waitFor();
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
      await page.getByText('This device is scoring the game.').waitFor();
      note('the banner says all is saved', (await page.getByText('All saved').count()) === 1);
      note(
        'the confirmed format is stored on the device',
        (await keptOnDevice(page, liveGame))?.confirmedFormat !== null,
      );
      await accessible(page, 'scoring placeholder');

      // The same device opens straight to scoring: the format was confirmed here.
      await page.reload();
      await page.getByText('This device is scoring the game.').waitFor();
      note(
        'the format is not asked again on this device',
        (await formatHeading(page).count()) === 0,
      );

      await Promise.all([
        page.waitForURL((url) => url.pathname === '/north-valley/admin'),
        page.getByRole('button', { name: 'Leave the game' }).click(),
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
        .getByText('Take over scoring from Sam Scorekeeper? Their device stops scoring at once')
        .waitFor();
      note(
        'the first tap asks before taking over',
        (await formatHeading(owner.page).count()) === 0 &&
          (await owner.page
            .getByText('Sam Scorekeeper is scoring this game on another device.')
            .count()) === 1,
      );
      await accessible(owner.page, 'asked to confirm the takeover');
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
    ['a visitor', null],
  ]) {
    await step(`${who} is refused`, async () => {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      try {
        if (token !== null) {
          await context.addCookies([{ name: 'srl_session', value: token, url: origin }]);
        }
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
  await step('a game not recorded live is not opened in the tracker', async () => {
    const { context, page } = await signedInAs('local-scorekeeper-token');
    try {
      await page.goto(`${origin}/north-valley/admin`);
      await page.getByRole('heading', { level: 1, name: 'Your games' }).waitFor();
      note(
        'a game recorded as a final score has no button to the tracker',
        (await page
          .locator(`li[data-game="${finalScoreGame}"]`)
          .getByRole('link', { name: 'Score this game' })
          .count()) === 0,
      );
      await page.goto(origin + tracker(finalScoreGame));
      await page.getByText('This game is not recorded live').waitFor();
      note(
        'its tracker page says so and keeps nothing on the device',
        (await keptOnDevice(page, finalScoreGame)) === null,
      );
      await accessible(page, 'a game not recorded live');
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
      const response = await page.goto(origin + assignedOnlyTracker(liveGame));
      note(
        'assigned games only: 403 for a game assigned to someone else',
        response?.status() === 403,
        String(response?.status()),
      );
      await page.getByRole('heading', { level: 1 }).filter({ hasText: noAccess }).waitFor();
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

  // Last, as it ends the made-up scorekeeper's session.
  await step('signing out clears the games kept on the device', async () => {
    const { context, page } = await signedInAs('local-scorekeeper-token');
    try {
      await page.goto(origin + tracker(liveGame));
      await page.getByText('This device is scoring the game.').or(formatHeading(page)).waitFor();
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
