// Step 2.223 (T-453): a scorer in a DRAFT league keeps every waiting tap when signed out
// in another tab. A draft league is hidden from a visitor, so once the sign-in is gone the
// league's endpoints answer "not found" (404), exactly as for a league that does not
// exist. The tracker must read that 404 as "sign in again", never as "the game is gone":
// it holds the taps, asks for sign-in, and sends them once signed in. In a real browser
// against the web app on its made-up stand-in (APP_ENV=test); nothing leaves this computer.
// Builds the app first unless given --no-build.
//
// - The draft league's scorer opens the game assigned to them and scores (a draft
//   league's scorer still scores, the plan's done test).
// - With no signal, two more plays wait on the device; the sign-in ends (the cookie gone,
//   as a sign-out in another tab leaves it); signal returns and the endpoints answer 404.
// - The screen asks for sign-in and says the two plays are kept on this device; the device
//   still lists them as waiting; it never says the game is gone.
// - Signed in again from the notice's link, the plays are saved once, and the game's box
//   score (the server's snapshot) is right.
// - T-456: two more plays wait, and the account on this browser can no longer open the
//   league (signed in, but as an account with no place in the draft league: the server
//   answers it exactly as a scorer removed from the league, "not found" at every league
//   endpoint, and "signed in" at the address about no league). The screen says so in
//   plain words, never asks for sign-in, keeps the two plays, and "Save a copy" gives them.
import { readFileSync } from 'node:fs';
import {
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
  whatWentWrong,
} from './web-browser-kit.mjs';
import { court, sizes, starters } from './tracker-driver.mjs';

const draftLeague = 'quiet-pines';
const draftLeagueId = '01900000-0000-7000-8000-000000000003';
// Hawks v Bears, live today. The draft league scores assigned games only and gives its
// live games to its admin (stand-in-world-seed.ts): the admin is this game's scorer. The
// league's scorekeeper is assigned only games entered by final score, not scored live.
const game = '01900000-0000-7000-8000-006a00000002';
const scorer = { name: 'srl_session', value: 'local-admin-token' };
const scorePath = `/${draftLeague}/score/${game}`;
// Signed in, with no place in the draft league (stand-in-cast.ts).
const noPlaceHere = { name: 'srl_session', value: 'local-stranger-token' };

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

/** The taps this device still keeps for the game, with their state, from its own storage. */
const keptTaps = (page) =>
  page.evaluate(
    (gameId) =>
      new Promise((resolve, reject) => {
        // The queue's own database and store (indexeddb-queue-storage.ts).
        const opened = indexedDB.open('srleagues-tracker-queue');
        opened.onerror = () => reject(opened.error);
        opened.onsuccess = () => {
          const db = opened.result;
          if (!db.objectStoreNames.contains('commands')) {
            db.close();
            resolve([]);
            return;
          }
          const all = db.transaction('commands').objectStore('commands').getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = () => {
            db.close();
            resolve(all.result.filter((row) => row.gameId === gameId).map((row) => row.state));
          };
        };
      }),
    game,
  );

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}

if (built) {
  const [phone] = sizes;
  const origin = `http://localhost:${await freePort()}`;
  const server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  let browser;
  try {
    await waitFor(`${origin}/`, server);
    browser = await launch();
    const context = await browser.newContext({ viewport: phone, hasTouch: true });
    await context.addCookies([{ ...scorer, url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const c = court(page);
    const play = async (side, jersey, act) => {
      const options = c.pad.locator(
        `[data-options="${await c.tile(side, jersey).getAttribute('data-player')}"]`,
      );
      if (!(await options.isVisible())) await c.tile(side, jersey).tap();
      await c.recorded(() => options.locator(`[data-act="${act}"]`).tap());
      await c.pad.locator('[data-rest]').waitFor();
    };
    /** What a 404 from a league endpoint the tracker met said. */
    const notFound = [];
    page.on('response', async (response) => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/api/v1/leagues/') && response.status() === 404) {
        notFound.push(`${url.pathname.split('/').pop()} ${await response.text()}`);
      }
    });

    await step("the draft league's scorer opens their game and scores", async () => {
      await page.goto(`${origin}${scorePath}`);
      await c.open();
      for (const jersey of starters) await c.tile('home', jersey).tap();
      for (const jersey of starters) await c.tile('away', jersey).tap();
      await page.locator('[data-scoring][data-stage="play"]').waitFor();
      await play('home', 5, 'p2');
      await c.saved();
      note(
        "a draft league's scorer scores a game: the first basket is saved",
        JSON.stringify(await c.score()) === '{"home":2,"away":0}',
        JSON.stringify(await c.score()),
      );
    });

    await step('no signal, two plays wait, signed out in another tab, signal back', async () => {
      await context.setOffline(true);
      await play('home', 9, 'p2');
      await play('away', 3, 'p2');
      // Signed out in another tab: the browser holds no sign-in any more.
      const other = await context.newPage();
      await context.clearCookies();
      await other.close();
      await context.setOffline(false);
      await page
        .getByText(
          'You are signed out. 2 plays are being kept on this device and are sent once you sign in again.',
        )
        .waitFor({ timeout: 90_000 });
      note(
        'signed out in a draft league: the endpoints answered "not found", not "no such game"',
        notFound.length > 0 && notFound.every((said) => said.endsWith('{"error":"not-found"}')),
        JSON.stringify(notFound),
      );
      const says = (await c.banner.textContent()) ?? '';
      note(
        'signed out: the banner says the two plays are kept, the game still on the screen',
        says.includes('2 plays kept on this device') &&
          (await page.locator('[data-scoring][data-stage="play"]').count()) === 1,
        says,
      );
      note(
        'signed out: the game is never said to be gone',
        (await page.getByText('This game could not be found.').count()) === 0,
      );
      const kept = await keptTaps(page);
      note(
        'signed out: the device still keeps the two plays as waiting',
        kept.filter((state) => state === 'waiting').length === 2,
        JSON.stringify(kept),
      );
      note(
        'signed out: the score on the screen keeps the two plays',
        JSON.stringify(await c.score()) === '{"home":4,"away":2}',
        JSON.stringify(await c.score()),
      );
    });

    await step(
      'signed in again from the link: the plays are saved, the box score is right',
      async () => {
        const link = page.getByRole('link', { name: 'Sign in', exact: true });
        const href = new URL((await link.getAttribute('href')) ?? '', origin);
        note(
          'the sign-in link comes back to this game',
          href.pathname === '/signin' && href.searchParams.get('next') === scorePath,
          href.toString(),
        );
        await Promise.all([page.waitForURL((url) => url.pathname === '/signin'), link.tap()]);
        // Signing in is made up here: the stand-in's admin has no password, so the
        // browser is given its cookie back, as a real sign-in would.
        await context.addCookies([{ ...scorer, url: origin }]);
        await page.goto(`${origin}${href.searchParams.get('next')}`);
        await c.open();
        await c.saved();
        await page.reload();
        await c.open();
        const points = {
          home5: await c.points('home', 5),
          home9: await c.points('home', 9),
          away3: await c.points('away', 3),
        };
        note(
          'signed in again: the two kept plays are saved once, the screen shows the server’s game',
          JSON.stringify(await c.score()) === '{"home":4,"away":2}' &&
            JSON.stringify(points) === '{"home5":2,"home9":2,"away3":2}',
          `${JSON.stringify(await c.score())} ${JSON.stringify(points)}`,
        );
        const answer = await fetch(
          `${origin}/api/v1/leagues/${draftLeagueId}/games/${game}/snapshot`,
          { headers: { cookie: `${scorer.name}=${scorer.value}` } },
        );
        const snapshot = await answer.json();
        const pointsOf = (jersey) =>
          snapshot.players.find((p) => p.side === 'home' && p.jersey === String(jersey))?.points;
        const homeTotal = snapshot.players
          .filter((p) => p.side === 'home')
          .reduce((sum, p) => sum + (p.points ?? 0), 0);
        // The Bears keep their players' statistics private (S-22), so the snapshot gives
        // their score only; the tracker's tiles above showed whose basket it was.
        note(
          'the box score is right: 4 to 2, each basket once, by its scorer',
          answer.status === 200 &&
            JSON.stringify(snapshot.score) === '{"home":4,"away":2}' &&
            homeTotal === 4 &&
            pointsOf(5) === 2 &&
            pointsOf(9) === 2 &&
            snapshot.teams.away.statsVisible === false,
          `${answer.status} ${JSON.stringify(snapshot.score)} ${homeTotal} ${JSON.stringify(snapshot.teams)}`,
        );
        const kept = await keptTaps(page);
        note(
          'signed in again: nothing waits on the device any more',
          !kept.includes('waiting'),
          JSON.stringify(kept),
        );
      },
    );
    await step(
      'T-456: this account can no longer open the league, with two plays waiting',
      async () => {
        await context.setOffline(true);
        await play('home', 5, 'p2');
        await play('away', 3, 'p2');
        await context.clearCookies();
        await context.addCookies([{ ...noPlaceHere, url: origin }]);
        notFound.length = 0;
        await context.setOffline(false);
        await page
          .getByText(
            'This account can no longer open this game. 2 plays not yet saved are kept on this device.',
            { exact: false },
          )
          .waitFor({ timeout: 90_000 });
        note(
          'refused while signed in: the league answered "not found", never "no such game"',
          notFound.length > 0 && notFound.every((said) => said.endsWith('{"error":"not-found"}')),
          JSON.stringify(notFound),
        );
        note(
          'refused while signed in: never told to sign in, never "signed out", never "gone"',
          (await page.getByRole('link', { name: 'Sign in', exact: true }).count()) === 0 &&
            (await page.getByText('You are signed out', { exact: false }).count()) === 0 &&
            (await page.getByText('This game could not be found.').count()) === 0,
        );
        const kept = await keptTaps(page);
        note(
          'refused while signed in: the device still keeps the two plays as waiting',
          kept.filter((state) => state === 'waiting').length === 2,
          JSON.stringify(kept),
        );
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          page.locator('[data-save-copy] [data-save-copy-button]').tap(),
        ]);
        const copy = JSON.parse(readFileSync((await download.path()) ?? '', 'utf8'));
        note(
          'refused while signed in: "Save a copy" gives the two plays, for this game',
          copy.commands?.length === 2 && copy.gameId === game && copy.leagueId === draftLeagueId,
          `${copy.commands?.length} ${copy.gameId}`,
        );
      },
    );
    note('no page error', errors.length === 0, errors.join(' | '));
  } catch (error) {
    failures.push(whatWentWrong(error));
  } finally {
    await browser?.close();
    server.child.kill();
  }
}

console.log(`${checked.length} checks`);
if (failures.length > 0) {
  console.error(`draft scorer taps: ${failures.length} problem(s)\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('draft scorer taps: every waiting tap held through a 404, then saved');
