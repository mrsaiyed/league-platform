// Step 2.127: a signed-in person can find their way, in a real browser at phone width, on
// the web app's made-up stand-in (APP_ENV=test). Nothing leaves this computer; every
// person, league and password is made up (apps/web/src/server/stand-in-sign-ins.ts).
//
// Each journey types one address, where the person starts, and taps from there:
// - an invited scorekeeper taps "Sign in" on the league home, signs in, is back on the
//   league home, and reaches their games in two taps (the menu, "My games to score");
// - the owner, from the league home, signs in, is back on it, reaches the admin in two
//   taps, opens "View the site", gets back to the admin in two taps, and signs out from
//   the admin;
// - from the front page a signed-in person sees their league and opens it; a member of
//   two leagues sees both, and not the draft league they also play in; a visitor sees no
//   league at all;
// - the page a visitor is served holds no trace of a signed-in person, and the page a
//   signed-in person is served is never kept by a shared cache;
// - someone signed in with the wrong account who meets "You do not have access" is told
//   which account they are signed in as and switches to another. This one check types the
//   refused address: a refusal is only ever met by an address (U-6).
// And the page-step checks: the accessibility checks (T-186) on each screen, no sideways
// scrolling at phone width, everything tapped at least 44 high, the account button with
// scripts off and by keyboard, and a wrong password that keeps the way back.
// `--no-build` serves the build already here.
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  openStaffMenu,
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

const people = {
  owner: { email: 'owner@example.test', password: 'made-up owner password' },
  scheduler: { email: 'scheduler@example.test', password: 'made-up scheduler password' },
  scorekeeper: { email: 'scorekeeper@example.test', password: 'made-up scorekeeper password' },
  member: { email: 'member@example.test', password: 'made-up member password' },
};
const phone = { width: 390, height: 844 };
const laptop = { width: 1280, height: 800 };
const liveGame = '01900000-0000-7000-8000-006a00000002'; // Hawks v Bears, live, the scorekeeper's
// The game is open on the device: the format to check, or (once checked, step 2.35) the
// scoring screen itself.
const gameOpen = (page) =>
  page
    .getByText('This device is scoring the game.')
    .or(page.getByRole('heading', { level: 2, name: 'Check the game format' }))
    .or(page.locator('[data-scoring]'));
/** What the device keeps in its browser database: the opened games and the queue's rows. */
const keptOnDevice = (page) =>
  page.evaluate(async () => {
    const all = (name, store) =>
      new Promise((resolve) => {
        const request = indexedDB.open(name);
        request.onerror = () => resolve([]);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(store)) {
            db.close();
            resolve([]);
            return;
          }
          const read = db.transaction(store).objectStore(store).getAll();
          read.onsuccess = () => {
            db.close();
            resolve(read.result);
          };
          read.onerror = () => resolve([]);
        };
      });
    return {
      games: (await all('srleagues-tracker-games', 'games')).map((g) => g.gameId),
      queue: (await all('srleagues-tracker-queue', 'commands')).map((c) => [c.gameId, c.state]),
    };
  });
/**
 * Puts one play the server has not answered for into the device's queue for `game`, as
 * the queue stores it (indexeddb-queue-storage.ts): the scoring screens that make plays
 * are steps 2.35 to 2.37, so this is how a play is waiting today.
 */
const seedWaitingPlay = (page, game) =>
  page.evaluate(
    (gameId) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('srleagues-tracker-queue', 1);
        request.onupgradeneeded = () => {
          const commands = request.result.createObjectStore('commands', {
            keyPath: 'position',
            autoIncrement: true,
          });
          commands.createIndex('by-game', 'gameId');
          commands.createIndex('by-command', 'command.commandId', { unique: true });
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('commands', 'readwrite');
          tx.objectStore('commands').add({
            gameId,
            protocolVersion: 2,
            command: {
              commandId: crypto.randomUUID(),
              at: 1,
              input: { type: 'remove-player', side: 'home', playerId: crypto.randomUUID() },
            },
            state: 'waiting',
          });
          tx.oncomplete = () => {
            db.close();
            resolve(undefined);
          };
          tx.onerror = () => reject(tx.error);
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

async function fresh(options = {}) {
  const context = await browser.newContext({ viewport: phone, ...options });
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
/** Every link, button and field shown inside `within` is at least 44 high. */
async function tallEnough(page, within, label) {
  const short = await page.$$eval(
    `${within} :is(a, button, input:not([type=hidden]), select, summary)`,
    (els) =>
      els
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => [
          el.textContent?.trim() || el.getAttribute('name') || el.tagName,
          el.getBoundingClientRect().height,
        ])
        .filter(([, height]) => height < 43.5)
        .map(([name, height]) => `${name} ${Math.round(height)}`),
  );
  note(`everything tapped is at least 44 high: ${label}`, short.length === 0, short.join(', '));
}
/**
 * The phone menu's button, which also holds the account button's entries (one tap): the
 * league's own on a public page, the admin's own inside the admin (step 2.103).
 */
const openMenu = async (page) => {
  if ((await page.locator('.staff-bar').count()) > 0) return openStaffMenu(page);
  return page.locator('.site-header .site-menu > summary').click();
};
/**
 * The account button on the scoring page: the tracker has a frame of its own, with no
 * league header (step 2.35; DESIGN.md section 7, line 11), and the button is in its first
 * row, on the format check and on the scoring screen alike.
 */
const openAccountOnTracker = (page) =>
  page.locator('[data-tracker] [data-account] > summary').click();
const link = (page, name) => page.getByRole('link', { name, exact: true });
/** Signs in on the sign-in screen the page is on, and waits to leave it. */
async function signIn(page, who) {
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/signin'),
    page.getByRole('button', { name: 'Sign in', exact: true }).click(),
  ]);
}
const pathOf = (page) => new URL(page.url()).pathname;

if (browser) {
  await step(
    'an invited scorekeeper signs in from the league home and reaches their games',
    async () => {
      const { context, page } = await fresh();
      try {
        await page.goto(`${origin}/north-valley`);
        await openMenu(page);
        await tallEnough(page, '.site-header .site-menu-panel', 'the phone menu of a visitor');
        await link(page, 'Sign in or create an account').click();
        await page.getByRole('heading', { level: 1, name: 'Sign in' }).waitFor();
        const url = new URL(page.url());
        note(
          'the sign-in screen comes back to the league home',
          url.pathname === '/signin' && url.searchParams.get('next') === '/north-valley',
          page.url(),
        );
        note(
          'the sign-in screen names the league the person came from',
          (await page.getByText('Sign in to carry on at North Valley League.').count()) === 1,
        );
        note(
          'the sign-in screen has "Back to North Valley League"',
          (await link(page, 'Back to North Valley League').getAttribute('href')) ===
            '/north-valley',
        );
        const forgot = new URL(
          (await link(page, 'Forgot your password?').getAttribute('href')) ?? '/',
          origin,
        );
        note(
          '"Forgot your password?" keeps the page to come back to',
          forgot.pathname === '/signin/forgot' &&
            forgot.searchParams.get('next') === '/north-valley',
          forgot.href,
        );
        await accessible(page, 'sign-in from a league');
        await noSidewaysScroll(page, 'sign-in from a league');
        await tallEnough(page, 'main', 'the sign-in screen');
        // Step 2.102: the sign-in family's other screens, in the same look and width.
        const other = await page.context().newPage();
        await other.setViewportSize(page.viewportSize() ?? { width: 390, height: 844 });
        for (const [at, name] of [
          ['/signin?problem=backToYourGame', 'sign-in after a mid-game sign-out'],
          ['/signin/forgot', 'the forgotten-password screen'],
          ['/signup/code', 'the code screen'],
        ]) {
          await other.goto(`${origin}${at}`);
          await accessible(other, name);
          await noSidewaysScroll(other, name);
          await tallEnough(other, 'main', name);
        }
        await other.goto(`${origin}/signin?problem=backToYourGame`);
        const kept = await other.locator('[data-sign-in-problem=backToYourGame]').innerText();
        note(
          'after a mid-game sign-out, sign-in says the game is kept on this device',
          kept.trim() ===
            'Sign in again to go back to your game. What you entered is kept on this device.',
          kept,
        );
        await other.close();
        await signIn(page, people.scorekeeper);
        note(
          'signed in, the scorekeeper is back on the league home',
          pathOf(page) === '/north-valley',
          page.url(),
        );
        // Two taps: the menu, then "My games to score".
        await openMenu(page);
        note(
          'the menu says who is signed in',
          (await page.getByText('Signed in as scorekeeper@example.test').count()) >= 1,
        );
        note(
          'a scorekeeper has no second "Admin" beside their games',
          (await link(page, 'Admin').count()) === 0,
        );
        await tallEnough(
          page,
          '.site-header .site-menu-panel',
          'the phone menu of a signed-in person',
        );
        await accessible(page, 'the league home, signed in, menu open');
        await link(page, 'My games to score').click();
        await page.getByRole('heading', { level: 1, name: 'Your games' }).waitFor();
        note(
          'two taps from the league home to their games',
          pathOf(page) === '/north-valley/admin',
          page.url(),
        );
        // The account button is on the admin's pages too.
        await openMenu(page);
        note(
          "the account button is on the scorekeeper's games page",
          (await page.getByRole('button', { name: 'Sign out', exact: true }).count()) === 1,
        );
      } finally {
        await context.close();
      }
    },
  );

  await step(
    'the owner signs in from the league home, goes to the admin and back, and signs out',
    async () => {
      const { context, page } = await fresh();
      try {
        await page.goto(`${origin}/north-valley`);
        await openMenu(page);
        await link(page, 'Sign in or create an account').click();
        // A wrong password first: the screen says so and keeps the way back to the league.
        await page.getByLabel('Email').fill(people.owner.email);
        await page.getByLabel('Password').fill('not the password');
        await Promise.all([
          page.waitForURL((url) => url.searchParams.get('problem') === 'wrongEmailOrPassword'),
          page.getByRole('button', { name: 'Sign in', exact: true }).click(),
        ]);
        note(
          'a wrong password says so and keeps the league and the way back',
          (await page
            .locator('main [role=alert]', { hasText: 'Wrong email or password.' })
            .count()) === 1 && (await link(page, 'Back to North Valley League').count()) === 1,
        );
        await signIn(page, people.owner);
        note(
          'signed in, the owner is back on the league home',
          pathOf(page) === '/north-valley',
          page.url(),
        );
        await openMenu(page);
        await link(page, 'Admin').click();
        await page.waitForURL((url) => url.pathname === '/north-valley/admin');
        note('two taps from the league home to the admin', true);
        await accessible(page, 'the admin home, signed in');
        await noSidewaysScroll(page, 'the admin home');
        // "View the site" is apart at the foot of the admin's own menu (step 2.103).
        await openMenu(page);
        await tallEnough(page, '.staff-bar .staff-menu-panel', "the admin's menu on a phone");
        await Promise.all([
          page.waitForURL((url) => url.pathname === '/north-valley'),
          page.locator('.staff-bar').getByRole('link', { name: 'View the site' }).click(),
        ]);
        await openMenu(page);
        await Promise.all([
          page.waitForURL((url) => url.pathname === '/north-valley/admin'),
          link(page, 'Admin').click(),
        ]);
        note('two taps from "View the site" back to the admin', true);
        await openMenu(page);
        await Promise.all([
          page.waitForURL((url) => url.pathname !== '/north-valley/admin'),
          page.getByRole('button', { name: 'Sign out', exact: true }).click(),
        ]);
        const session = (await context.cookies()).find((c) => c.name === 'srl_session');
        note(
          'signed out from the admin: no session left on the device',
          !session?.value,
          session?.value,
        );
      } finally {
        await context.close();
      }
    },
  );

  await step('from the front page, a signed-in person sees their league and opens it', async () => {
    const { context, page } = await fresh();
    try {
      await page.goto(`${origin}/`);
      note(
        'a visitor reads what SR Leagues is',
        (await page.getByText('SR Leagues runs the websites of sports leagues').count()) === 1,
      );
      const visitorText = await page.locator('main').innerText();
      note(
        'a visitor sees no league at all, none in draft',
        !/Quiet Pines|quiet-pines|North Valley|Harbor City|Still Waters|still-waters|Reed Marsh|reed-marsh/.test(
          visitorText,
        ),
        visitorText,
      );
      await accessible(page, 'the front page, a visitor');
      await tallEnough(page, 'main', 'the front page, a visitor');
      await link(page, 'Sign in').click();
      await signIn(page, people.scorekeeper);
      note('signed in from the front page, back on it', pathOf(page) === '/', page.url());
      await link(page, 'North Valley League').waitFor();
      note(
        'their league is listed with their role',
        (await page.locator('main li', { hasText: 'North Valley League' }).innerText()).includes(
          'Scorekeeper',
        ),
      );
      await accessible(page, 'the front page, signed in');
      await noSidewaysScroll(page, 'the front page, signed in');
      await tallEnough(page, 'main', 'the front page, signed in');
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/north-valley'),
        link(page, 'North Valley League').click(),
      ]);
      note('one tap from the front page to their league', true);
      await openMenu(page);
      await link(page, 'Your account').click();
      await page.waitForURL((url) => url.pathname === '/account');
      const first = await page.locator('main > *').first().innerText();
      note(
        'the account page says who is signed in above everything else',
        first === 'Signed in as scorekeeper@example.test',
        first,
      );
      note(
        'the account page lists their leagues, each a link',
        (await link(page, 'North Valley League').getAttribute('href')) === '/north-valley',
      );
      await accessible(page, 'the account page');
      await noSidewaysScroll(page, 'the account page');
      await tallEnough(page, 'main', 'the account page');
    } finally {
      await context.close();
    }
  });

  await step(
    'a member of two leagues sees both, and not the draft league they play in',
    async () => {
      const { context, page } = await fresh();
      try {
        await page.goto(`${origin}/`);
        await link(page, 'Sign in').click();
        await signIn(page, people.member);
        await link(page, 'North Valley League').waitFor();
        const text = await page.locator('main').innerText();
        note(
          'both leagues are listed, "On a team" in each',
          text.includes('North Valley League') &&
            text.includes('Harbor City League') &&
            (text.match(/On a team/g) ?? []).length === 2,
          text,
        );
        note(
          'the draft league they play in is not listed',
          !/Quiet Pines|quiet-pines/.test(text),
          text,
        );
      } finally {
        await context.close();
      }
    },
  );

  await step('the page a visitor is served holds no trace of a signed-in person', async () => {
    const owner = await fresh();
    const visitor = await fresh();
    try {
      await owner.page.goto(`${origin}/north-valley`);
      await openMenu(owner.page);
      await link(owner.page, 'Sign in or create an account').click();
      await signIn(owner.page, people.owner);
      const signedIn = await owner.context.request.get(`${origin}/north-valley`);
      const cacheControl = signedIn.headers()['cache-control'] ?? '';
      note(
        'the page drawn for a signed-in person is never kept by a shared cache',
        /private/.test(cacheControl) && /no-store/.test(cacheControl),
        cacheControl,
      );
      // Record 066: until the signed-in parts are read after the page, no page is kept by
      // a shared cache, signed in or not.
      for (const path of ['/north-valley', '/north-valley/schedule', '/', '/account', '/signin']) {
        for (const [who, context] of [
          ['signed in', owner.context],
          ['a visitor', visitor.context],
        ]) {
          const answer = await context.request.get(`${origin}${path}`, { maxRedirects: 0 });
          const kept = answer.headers()['cache-control'] ?? '';
          note(
            `${path} for ${who} answers private, no-store`,
            /private/.test(kept) && /no-store/.test(kept),
            `${answer.status()} ${kept}`,
          );
        }
      }
      note(
        'the signed-in page does hold the account button',
        (await signedIn.text()).includes('Signed in as owner@example.test'),
      );
      for (const path of ['/north-valley', '/north-valley/schedule', '/']) {
        const html = await (await visitor.context.request.get(`${origin}${path}`)).text();
        const traces = [
          'owner@example.test',
          'Signed in as',
          'site-account',
          'My games to score',
          'Your account menu',
        ].filter((trace) => html.includes(trace));
        note(
          `a visitor's ${path} holds no trace of anyone signed in`,
          traces.length === 0,
          traces.join(', '),
        );
      }
    } finally {
      await owner.context.close();
      await visitor.context.close();
    }
  });

  await step('the wrong account at "You do not have access" is named, and switched', async () => {
    const { context, page } = await fresh();
    try {
      await page.goto(`${origin}/north-valley`);
      await openMenu(page);
      await link(page, 'Sign in or create an account').click();
      await signIn(page, people.scheduler);
      // The refusal's screen brings the admin's stylesheet with it (step 2.103), and
      // Next.js sends that screen inside every page: a public page must not load it.
      const staffRules = () =>
        page.evaluate(() =>
          [...document.styleSheets].some((sheet) => {
            try {
              return [...sheet.cssRules].some((rule) => rule.cssText.includes('.staff-bar'));
            } catch {
              return false;
            }
          }),
        );
      note('a public page loads none of the admin’s styles', !(await staffRules()));
      // The one address typed after the first: a refusal is only met at an address (U-6).
      await page.goto(`${origin}/north-valley/admin/people`);
      await page.getByRole('heading', { level: 1, name: 'You do not have access' }).waitFor();
      note(
        'the refusal says which account is signed in',
        (await page.getByText('You are signed in as scheduler@example.test.').count()) === 1,
      );
      // Step 2.103: the scheduler has part of this admin, so the refusal is drawn inside
      // the admin's own frame (its row on top, its menu with their areas), in the
      // league's workspace, and leads back to the admin's home.
      const bar = page.locator('.staff-bar');
      const barLook = await bar.evaluate((el) => {
        const style = getComputedStyle(el);
        return { position: style.position, ground: style.backgroundColor };
      });
      note(
        'a refusal inside an admin that is open to the person keeps the admin’s frame',
        (await bar.isVisible()) &&
          (await staffRules()) &&
          barLook.position === 'sticky' &&
          barLook.ground !== 'rgba(0, 0, 0, 0)',
        JSON.stringify(barLook),
      );
      await openStaffMenu(page);
      const areas = page.locator('.staff-menu-panel').getByRole('navigation', {
        name: 'Admin areas',
      });
      note(
        'the frame of the refusal lists the person’s own areas, and not the one refused',
        (await areas.locator('a[href="/north-valley/admin/schedule"]').count()) === 1 &&
          (await areas.locator('a[href="/north-valley/admin/people"]').count()) === 0,
      );
      await page.locator('.staff-bar .staff-menu > summary').click();
      note(
        'the refusal’s one clear way on is back to the admin',
        (await page
          .locator('main')
          .getByRole('link', { name: 'Back to the admin' })
          .getAttribute('href')) === '/north-valley/admin',
      );
      await accessible(page, 'no access, signed in');
      await noSidewaysScroll(page, 'no access, signed in');
      await link(page, 'Use another account').click();
      // Since step 2.163 (L10) /signin tells a signed-in person so, with "Sign out and use
      // another account", which signs out and comes back to the form with the same `next`.
      await Promise.all([
        page.getByLabel('Email').waitFor(),
        page.getByRole('button', { name: 'Sign out and use another account' }).click(),
      ]);
      await signIn(page, people.owner);
      note(
        'after switching, the owner is on the page that was refused',
        pathOf(page) === '/north-valley/admin/people',
        page.url(),
      );
    } finally {
      await context.close();
    }
  });

  await step('signing out on the scoring page leaves the game for the next person', async () => {
    const { context, page } = await fresh();
    try {
      await page.goto(`${origin}/north-valley`);
      await openMenu(page);
      await link(page, 'Sign in or create an account').click();
      await signIn(page, people.scorekeeper);
      await openMenu(page);
      await link(page, 'My games to score').click();
      await page.locator(`li[data-game="${liveGame}"] a[href*="/score/"]`).click();
      await gameOpen(page).waitFor();
      await openAccountOnTracker(page);
      const signOut = page.getByRole('link', { name: 'Sign out', exact: true });
      note(
        'on the scoring page "Sign out" is a link to the account page with scripts off',
        (await signOut.getAttribute('href')) === '/account',
      );
      await Promise.all([page.waitForURL((url) => url.pathname === '/signin'), signOut.click()]);
      const session = (await context.cookies()).find((c) => c.name === 'srl_session');
      note('signed out from the scoring page', !session?.value);
      // The next person on the same device opens the same game: it is free, not held.
      // (The game's address is typed here: "Score this game" on the league's pages is 2.153.)
      await signIn(page, people.owner);
      await page.goto(`${origin}/north-valley/score/${liveGame}`);
      await gameOpen(page).or(page.getByText('is scoring this game on another device')).waitFor();
      note(
        'the scoring session was released: the next person is not told it is held elsewhere',
        (await page.getByText('is scoring this game on another device').count()) === 0,
      );
      // The owner leaves the game as a person does, so the next check finds it free.
      // Closing the browser context is no way out: the page's release on "pagehide" is
      // all that would free the game then, and whether it is sent, or reaches the
      // server, as the context is torn down depends on the browser (it did on this
      // computer's Edge; on GitHub's Chromium the next check met the owner still holding
      // the game, "Olive Owner is scoring this game on another device", and waited out).
      // On the scoring screen (the format already checked) the way out is behind More.
      const scoring = page.locator('[data-scoring]');
      if (await scoring.isVisible())
        await scoring.getByRole('button', { name: 'More', exact: true }).click();
      await Promise.all([
        page.waitForURL((url) => !url.pathname.includes('/score/')),
        page.getByRole('link', { name: 'Back to your games', exact: true }).click(),
      ]);
    } finally {
      await context.close();
    }
  });

  await step('with plays waiting, signing out asks first and loses nothing', async () => {
    const { context, page } = await fresh();
    try {
      await page.goto(`${origin}/north-valley`);
      await openMenu(page);
      await link(page, 'Sign in or create an account').click();
      await signIn(page, people.scorekeeper);
      // A play made while the connection to the server is down stays waiting.
      await seedWaitingPlay(page, liveGame);
      await context.route('**/commands', (route) => route.abort());
      await openMenu(page);
      await link(page, 'My games to score').click();
      await page.locator(`li[data-game="${liveGame}"] a[href*="/score/"]`).click();
      await gameOpen(page).waitFor();
      const asked = [];
      let answer = false;
      page.on('dialog', (dialog) => {
        asked.push(dialog.message());
        void (answer ? dialog.accept() : dialog.dismiss());
      });
      await openAccountOnTracker(page);
      await page.getByRole('link', { name: 'Sign out', exact: true }).click();
      await page.waitForTimeout(1500);
      note(
        'with a play waiting, signing out asks first, with the number of plays',
        asked[0] ===
          '1 play is not sent yet. It stays on this device and is sent when you sign in again. Sign out?',
        String(asked[0]),
      );
      note(
        'answering no keeps the person signed in on the game',
        pathOf(page) === `/north-valley/score/${liveGame}` &&
          !!(await context.cookies()).find((c) => c.name === 'srl_session')?.value,
      );
      answer = true;
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/signin'),
        page.getByRole('link', { name: 'Sign out', exact: true }).click(),
      ]);
      const kept = await keptOnDevice(page);
      note(
        'signed out with a play waiting: the play and the game stay on the device',
        kept.queue.some(([game, state]) => game === liveGame && state === 'waiting') &&
          kept.games.includes(liveGame),
        JSON.stringify(kept),
      );
    } finally {
      await context.close();
    }
  });

  await step('the account button works with scripts off and by keyboard', async () => {
    const off = await fresh({ javaScriptEnabled: false });
    const wide = await fresh({ viewport: laptop });
    try {
      for (const { page, at } of [
        { page: off.page, at: 'phone, scripts off' },
        { page: wide.page, at: 'laptop' },
      ]) {
        await page.goto(`${origin}/north-valley`);
        if (at === 'laptop') {
          await page.locator('.site-header .site-sign-in').click();
        } else {
          await openMenu(page);
          await link(page, 'Sign in or create an account').click();
        }
        await signIn(page, people.owner);
      }
      // With scripts off, on a phone: the menu opens and "Admin" leads to the admin.
      await openMenu(off.page);
      await Promise.all([
        off.page.waitForURL((url) => url.pathname === '/north-valley/admin'),
        link(off.page, 'Admin').click(),
      ]);
      note('with scripts off the account entries open and lead on', true);
      // By keyboard, on a laptop: the account button opens with Enter, and Tab goes into it.
      const button = wide.page.locator('.site-account > summary');
      await button.focus();
      await wide.page.keyboard.press('Enter');
      await wide.page.locator('.site-account-panel').waitFor({ state: 'visible' });
      await wide.page.keyboard.press('Tab');
      const focused = await wide.page.evaluate(() => document.activeElement?.textContent?.trim());
      note(
        'by keyboard the account button opens and its first entry takes the focus',
        focused === 'Admin',
        String(focused),
      );
      await tallEnough(wide.page, '.site-account', 'the account button on a laptop');
      await accessible(wide.page, 'the league home on a laptop, account menu open');
    } finally {
      await off.context.close();
      await wide.context.close();
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Find-their-way browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Find-their-way browser test passed (${checked.length} checks).`);
