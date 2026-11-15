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
/** The phone menu's button, which also holds the account button's entries (one tap). */
const openMenu = (page) => page.locator('.site-header .site-menu > summary').click();
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
        await Promise.all([
          page.waitForURL((url) => url.pathname === '/north-valley'),
          link(page, 'View the site').click(),
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
        !/quiet-pines|North Valley|Harbor City|still-waters/.test(visitorText),
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
        note('the draft league they play in is not listed', !text.includes('quiet-pines'), text);
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
        /private|no-store/.test(cacheControl),
        cacheControl,
      );
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
      // The one address typed after the first: a refusal is only met at an address (U-6).
      await page.goto(`${origin}/north-valley/admin/people`);
      await page.getByRole('heading', { level: 1, name: 'You do not have access' }).waitFor();
      note(
        'the refusal says which account is signed in',
        (await page.getByText('You are signed in as scheduler@example.test.').count()) === 1,
      );
      await accessible(page, 'no access, signed in');
      await noSidewaysScroll(page, 'no access, signed in');
      await link(page, 'Use another account').click();
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
