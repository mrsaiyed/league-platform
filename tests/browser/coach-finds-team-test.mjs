// Step 2.168: a coach finds their team, in a real browser at phone width, on the web app's
// made-up stand-in (APP_ENV=test). Nothing leaves this computer; every person, league and
// password is made up (apps/web/src/server/stand-in-sign-ins.ts). The made-up coach is on
// the Herons of North Valley (which opens on its home) and the Rockets of Harbor City (which
// starts members on their team's page, U-5).
//
// Each journey types one address, where the person starts, and taps from there:
// - the coach taps "Sign in" on North Valley's home, signs in, is back on it, and is on
//   their team's page in two taps (the menu, "My team"), where the page says "This is your
//   team." and asks nothing of "making this my team"; the same with scripts off;
// - in Harbor City the coach lands on their team, which says "This is your team. The league
//   opens here for you." and offers no "Make this my team"; their team is marked on the
//   Teams list and on the league home;
// - a visitor makes a team "my team" on their device, then finds it marked on the Teams
//   list and the league home, and no other;
// - `/my` signed out leads to sign-in and back, on to the team's page;
// - a member of no team who opens `/my` is told so in a sentence, with a way on;
// - while the private read is out, nobody is shown "Make this my team", so a coach never
//   sees it flash on their own team; a visitor gets it once the read answers or fails;
// - the team page a coach is served holds no trace of them: the marks are read after it,
//   privately;
// - the "Make this my team" and "stop" buttons answer a hidden league exactly as one that is
//   not there, and still work for a draft league's own staff (audit finding D-H1).
// And the page-step checks: the accessibility checks (T-186) on each screen, no sideways
// scrolling at phone width, everything tapped at least 44 high, and the account button by
// keyboard on a laptop. `--no-build` serves the build already here.
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

const people = {
  coach: { email: 'coach@example.test', password: 'made-up coach password' },
  member: { email: 'member@example.test', password: 'made-up member password' },
};
const phone = { width: 390, height: 844 };
const laptop = { width: 1280, height: 800 };
const yours = 'This is your team.';
const opensHere = 'This is your team. The league opens here for you.';

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
  const context = await browser.newContext({ viewport: phone, hasTouch: true, ...options });
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
 * Every page step: the accessibility checks, nothing sideways, and everything tappable in
 * `within`: this step's own part of the page (the Teams list's cards and the home page's
 * standings are older pieces, their own steps' to check).
 */
async function pageSteps(page, label, within = 'main') {
  await accessible(page, label);
  await noSidewaysScroll(page, label);
  await tallEnough(page, within, label);
}
/** The phone menu's button, which also holds the account button's entries: one tap. */
const openMenu = (page) => page.locator('.site-header .site-menu > summary').tap();
const link = (page, name) => page.getByRole('link', { name, exact: true });
const pathOf = (page) => new URL(page.url()).pathname;
/** Signs in on the sign-in screen the page is on, and waits to leave it. */
async function signIn(page, who) {
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/signin'),
    page.getByRole('button', { name: 'Sign in', exact: true }).tap(),
  ]);
}
/** Waits for the page's private read of its marks to have answered. */
const markRead = (page) =>
  page.waitForResponse((answer) => answer.url().includes('/my-team'), { timeout: 15_000 });
/** What the "Make this my team" offer and its stopping form say on the page as drawn. */
const deviceChoiceShown = (page) =>
  page.getByRole('button', { name: /^(Make this my team|Stop using this as my team)$/ }).count();
/** The team cards marked "Your team" on the Teams list, by the team's name. */
const markedCards = (page) =>
  page.$$eval('.ui-team-card', (cards) =>
    cards
      .filter((card) => card.querySelector('[data-your-team]') !== null)
      .map((card) => card.querySelector('.ui-team-card-name')?.textContent?.trim()),
  );

if (browser) {
  await step('a coach signs in on the league home and is on their team in two taps', async () => {
    const { context, page } = await fresh();
    try {
      await page.goto(`${origin}/north-valley`);
      await openMenu(page);
      await link(page, 'Sign in or create an account').tap();
      await page.getByRole('heading', { level: 1, name: 'Sign in' }).waitFor();
      await signIn(page, people.coach);
      note('signed in, the coach is back on the league home', pathOf(page) === '/north-valley');
      // Two taps: the menu, then "My team".
      await openMenu(page);
      await tallEnough(page, '.site-header .site-menu-panel', "the coach's phone menu");
      const entries = await page
        .locator('.site-header .site-menu-panel .site-menu-account li a')
        .allTextContents();
      note(
        '"My team" is the first of the coach\'s entries',
        entries[0] === 'My team',
        entries.join(', '),
      );
      await accessible(page, "the league home, the coach's menu open");
      const read = markRead(page);
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/north-valley/teams/herons'),
        link(page, 'My team').tap(),
      ]);
      await read;
      note(
        'two taps from the league home to their team',
        pathOf(page) === '/north-valley/teams/herons',
      );
      await page.getByRole('heading', { level: 1, name: 'Herons' }).waitFor();
      await page.getByText(yours, { exact: true }).waitFor();
      note(
        'their team page says it is theirs',
        (await page.getByText(yours, { exact: true }).count()) === 1,
      );
      note(
        'a league that opens on its home does not say it opens here',
        (await page.getByText(opensHere).count()) === 0,
      );
      note(
        'nothing on their team page asks to "make this my team"',
        (await deviceChoiceShown(page)) === 0,
      );
      await pageSteps(page, "the coach's team page");
      // Another team's page is not theirs, and says nothing of it.
      await page.goto(`${origin}/north-valley/teams/falcons`);
      await markRead(page).catch(() => undefined);
      note(
        "another team's page does not say it is theirs",
        (await page.getByText(yours).count()) === 0,
      );
    } finally {
      await context.close();
    }
  });

  await step(
    'in a league that starts on teams, the coach lands on theirs, marked everywhere',
    async () => {
      const { context, page } = await fresh();
      try {
        await page.goto(`${origin}/signin?next=%2Fharbor-city`);
        const read = markRead(page);
        await signIn(page, people.coach);
        note(
          'the league opens on their team',
          pathOf(page) === '/harbor-city/teams/rockets',
          page.url(),
        );
        await read;
        await page.getByText(opensHere, { exact: true }).waitFor();
        note(
          'their team page says the league opens here for them',
          (await page.getByText(opensHere).count()) === 1,
        );
        note(
          'nothing on it offers to "make this my team", which it already is',
          (await deviceChoiceShown(page)) === 0,
        );
        await pageSteps(page, 'the coach lands on their team');
        // The Teams list marks theirs, and only theirs.
        const listRead = markRead(page);
        await link(page, 'All teams').tap();
        await page.getByRole('heading', { level: 1, name: 'The teams.' }).waitFor();
        await listRead;
        await page.locator('[data-your-team]').first().waitFor();
        const marked = await markedCards(page);
        note(
          'the Teams list marks their team, and no other',
          marked.join() === 'Rockets',
          marked.join(),
        );
        await pageSteps(page, 'the Teams list, their team marked', 'main [data-your-team]');
        // The league home, by its "League home" link, marks it with the way to it.
        await page.goto(`${origin}/harbor-city/teams/rockets`);
        const homeRead = markRead(page);
        await link(page, 'League home').tap();
        await homeRead;
        const line = page.locator('main [data-your-team]');
        await line.waitFor();
        note('the league home marks their team', (await line.innerText()).includes('Rockets'));
        await pageSteps(page, 'the league home, their team marked', 'main [data-your-team]');
        await Promise.all([
          page.waitForURL((url) => url.pathname === '/harbor-city/teams/rockets'),
          line.getByRole('link').tap(),
        ]);
        note('one tap from the mark on the home page to their team', true);
      } finally {
        await context.close();
      }
    },
  );

  await step(
    'a visitor who chose a team sees it marked on the Teams list and the home page',
    async () => {
      const { context, page } = await fresh();
      try {
        await page.goto(`${origin}/harbor-city/teams/comets`);
        await Promise.all([
          page.waitForEvent('load'),
          page.getByRole('button', { name: 'Make this my team' }).tap(),
        ]);
        await page.getByText('This is your team on this device.').waitFor();
        note('the device remembers the visitor’s team', true);
        note(
          'a visitor is not told it is "your team" as a member is',
          (await page.getByText(yours, { exact: true }).count()) === 0,
        );
        const read = markRead(page);
        await link(page, 'All teams').tap();
        await read;
        await page.locator('[data-your-team]').first().waitFor();
        const marked = await markedCards(page);
        note(
          'the Teams list marks the chosen team, and no other',
          marked.join() === 'Comets',
          marked.join(),
        );
        await pageSteps(page, "the Teams list, a visitor's team marked", 'main [data-your-team]');
        // The home: the league home's own link, as the start page now opens on the team.
        await page.goto(`${origin}/harbor-city`);
        note(
          'the league now opens on the chosen team',
          pathOf(page) === '/harbor-city/teams/comets',
        );
        const homeRead = markRead(page);
        await link(page, 'League home').tap();
        await homeRead;
        const line = page.locator('main [data-your-team]');
        await line.waitFor();
        note('the league home marks the chosen team', (await line.innerText()).includes('Comets'));
        await pageSteps(page, "the league home, a visitor's team marked", 'main [data-your-team]');
      } finally {
        await context.close();
      }
    },
  );

  await step('/my signed out leads to sign-in and back, on to the team', async () => {
    const { context, page } = await fresh();
    try {
      await page.goto(`${origin}/north-valley/my`);
      await page.getByRole('heading', { level: 1, name: 'Sign in' }).waitFor();
      const url = new URL(page.url());
      note(
        '/my signed out is the sign-in screen, coming back to /my',
        url.pathname === '/signin' && url.searchParams.get('next') === '/north-valley/my',
        page.url(),
      );
      await signIn(page, people.coach);
      note(
        'signed in, /my goes on to their team',
        pathOf(page) === '/north-valley/teams/herons',
        page.url(),
      );
    } finally {
      await context.close();
    }
  });

  await step('a member of no team is told so on /my, with a way on', async () => {
    const { context, page } = await fresh();
    try {
      await page.goto(`${origin}/signin?next=%2Fnorth-valley`);
      await signIn(page, people.member);
      await openMenu(page);
      note('a member of no team has no "My team"', (await link(page, 'My team').count()) === 0);
      await page.goto(`${origin}/north-valley/my`);
      await page.getByRole('heading', { level: 1, name: 'My team' }).waitFor();
      note(
        'they are told in a sentence that they are on no team here',
        (await page
          .getByText('You are not on a team in this league this season.', { exact: false })
          .count()) === 1,
      );
      note(
        'a way on to the teams',
        (await link(page, 'See the teams').getAttribute('href')) === '/north-valley/teams',
      );
      await pageSteps(page, '/my for a member of no team');
    } finally {
      await context.close();
    }
  });

  await step('with scripts off the coach still reaches their team by the menu', async () => {
    const { context, page } = await fresh({ javaScriptEnabled: false });
    try {
      await page.goto(`${origin}/signin?next=%2Fnorth-valley`);
      await signIn(page, people.coach);
      await openMenu(page);
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/north-valley/teams/herons'),
        link(page, 'My team').tap(),
      ]);
      note('with scripts off two taps still lead to their team', true);
      note(
        'with scripts off a league that does not offer the choice asks nothing of it',
        (await deviceChoiceShown(page)) === 0,
      );
      await pageSteps(page, "the coach's team page, scripts off");
    } finally {
      await context.close();
    }
  });

  // From the lane's review: until the private read has answered, a coach's own team page
  // never shows "Make this my team" for a moment. The read is held back here until the page
  // has drawn, and the offer is looked for meanwhile; then, for a signed-out visitor, it
  // comes once the read has answered, and once it has failed.
  await step('the device choice waits for the read, so a coach never sees it flash', async () => {
    const { context, page } = await fresh();
    try {
      /** Holds every read of the marks back until the returned `release` is called. */
      const holdReads = async (answer) => {
        let release = () => {};
        const held = new Promise((resolve) => {
          release = resolve;
        });
        await page.route('**/my-team', async (route) => {
          await held;
          await (answer === 'fail' ? route.abort() : route.continue());
        });
        return release;
      };
      const rockets = `${origin}/harbor-city/teams/rockets`;
      await page.goto(`${origin}/signin?next=%2Fnorth-valley`);
      await signIn(page, people.coach);
      let release = await holdReads('continue');
      await page.goto(rockets, { waitUntil: 'load' });
      await page.getByRole('heading', { level: 1, name: 'Rockets' }).waitFor();
      await page.waitForTimeout(500);
      note(
        'while the read is out, the coach is not offered "make this my team"',
        (await deviceChoiceShown(page)) === 0,
      );
      const read = markRead(page);
      release();
      await read;
      await page.getByText(opensHere, { exact: true }).waitFor();
      note(
        'once it has answered, still not',
        (await deviceChoiceShown(page)) === 0 && (await page.getByText(opensHere).count()) === 1,
      );
      await page.unrouteAll();
      // A signed-out visitor: not while the read is out, then the offer once it answers.
      await context.clearCookies();
      release = await holdReads('continue');
      await page.goto(rockets, { waitUntil: 'load' });
      await page.waitForTimeout(500);
      note(
        'while the read is out, a visitor is not shown the offer yet',
        (await deviceChoiceShown(page)) === 0,
      );
      release();
      await page.getByRole('button', { name: 'Make this my team' }).waitFor();
      note('once the read has answered, a visitor is offered it', true);
      await page.unrouteAll();
      // A read that fails leaves the page as it came: the offer is there.
      release = await holdReads('fail');
      await page.goto(rockets, { waitUntil: 'load' });
      release();
      await page.getByRole('button', { name: 'Make this my team' }).waitFor();
      note('once the read has failed, a visitor is offered it', true);
      await page.unrouteAll();
    } finally {
      await context.close();
    }
  });

  await step('the page a coach is served holds no trace of them; the read is private', async () => {
    const { context, page } = await fresh();
    try {
      await page.goto(`${origin}/signin?next=%2Fharbor-city%2Fteams%2Frockets`);
      await signIn(page, people.coach);
      const served = await page.request.get(`${origin}/harbor-city/teams/rockets`);
      const html = await served.text();
      for (const trace of [yours, opensHere, 'data-yours', 'data-your-team', 'Your team<']) {
        note(`the served team page holds no "${trace}"`, !html.includes(trace));
      }
      const answer = await page.request.get(
        `${origin}/api/v1/leagues/01900000-0000-7000-8000-000000000002/my-team`,
      );
      note('the read answers', answer.status() === 200, String(answer.status()));
      note(
        'the read is never kept by a cache',
        (answer.headers()['cache-control'] ?? '') === 'private, no-store',
        answer.headers()['cache-control'],
      );
      note('the read names their team', (await answer.text()).includes('"teams":["rockets"]'));
    } finally {
      await context.close();
    }
  });

  // From the audit of each league's data (finding D-H1): the "Make this my team" and "stop"
  // buttons go through the league's gate. Posted as a page with no script posts them, with a
  // draft, a suspended, a binned and a missing league's short name, each answers exactly as
  // the others (status, where it forwards to, and no cookie) for a visitor, a signed-in
  // stranger and another league's admin; the draft league's own staff still set and clear
  // their team.
  await step(
    'the my-team buttons answer a hidden league exactly as one that is not there',
    async () => {
      const tokens = {
        visitor: null,
        stranger: 'local-stranger-token',
        otherAdmin: 'local-other-admin-token',
        owner: 'local-owner-token',
      };
      /** The hidden fields of the form that holds the button `label`, on the page at `path`. */
      const formOf = async (path, label, cookie) => {
        const html = await (
          await fetch(`${origin}${path}`, { headers: cookie ? { cookie } : {} })
        ).text();
        const form = html.split('<form').find((part) => part.includes(`>${label}</button>`));
        if (form === undefined) throw new Error(`no "${label}" form on ${path}`);
        return [...form.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)].map(
          ([, name, value]) => [name, value ?? ''],
        );
      };
      /** The button's form posted to `path`, with the form's league and team changed. */
      const post = async (fields, path, league, team, token) => {
        const body = new FormData();
        for (const [name, value] of fields) {
          body.append(name, name === 'league' ? league : name === 'team' ? team : value);
        }
        const answer = await fetch(`${origin}${path}`, {
          method: 'POST',
          body,
          headers: { origin, ...(token === null ? {} : { cookie: `srl_session=${token}` }) },
          redirect: 'manual',
        });
        await answer.arrayBuffer();
        return {
          status: answer.status,
          location: answer.headers.get('location'),
          setCookie: answer.headers.get('set-cookie'),
        };
      };
      const choose = await formOf('/harbor-city/teams/comets', 'Make this my team');
      const stop = await formOf(
        '/harbor-city/teams/comets',
        'Stop using this as my team',
        'srl_my_team_01900000-0000-7000-8000-000000000002=comets',
      );
      const hidden = {
        draft: ['quiet-pines', 'lions'],
        suspended: ['closed-gate', 'lions'],
        binned: ['binned-league', 'lions'],
        missing: ['no-such-league', 'lions'],
      };
      for (const [button, fields] of [
        ['make', choose],
        ['stop', stop],
      ]) {
        for (const who of ['visitor', 'stranger', 'otherAdmin']) {
          const answers = [];
          for (const [kind, [league, team]] of Object.entries(hidden)) {
            const path = `/${league}/teams/${team}`;
            answers.push([kind, await post(fields, path, league, team, tokens[who])]);
          }
          const [, first] = answers[0];
          note(
            `"${button}" sets no cookie for ${who} in a hidden league`,
            first.setCookie === null,
            String(first.setCookie),
          );
          note(
            `"${button}" is "not found" for ${who} in a hidden league`,
            first.status === 404,
            String(first.status),
          );
          for (const [kind, answer] of answers.slice(1)) {
            note(
              `"${button}" answers ${who} for a ${kind} league as for a draft one`,
              JSON.stringify(answer) === JSON.stringify(first),
              `${JSON.stringify(answer)} / ${JSON.stringify(first)}`,
            );
          }
        }
        // A league named in the form that is not the address's: "not found" too.
        const elsewhere = await post(
          fields,
          '/harbor-city/teams/comets',
          'quiet-pines',
          'lions',
          null,
        );
        note(
          `"${button}" believes no league but the address's`,
          elsewhere.status === 404 && elsewhere.setCookie === null,
          JSON.stringify(elsewhere),
        );
      }
      // The draft league's own owner may open it: the buttons work there as anywhere.
      const set = await post(
        choose,
        '/quiet-pines/teams/lions',
        'quiet-pines',
        'lions',
        tokens.owner,
      );
      note(
        "a draft league's own staff set their team",
        set.status === 303 &&
          set.location === '/quiet-pines/teams/lions' &&
          (set.setCookie ?? '').startsWith(
            'srl_my_team_01900000-0000-7000-8000-000000000003=lions;',
          ),
        JSON.stringify(set),
      );
      const cleared = await post(
        stop,
        '/quiet-pines/teams/lions',
        'quiet-pines',
        'lions',
        tokens.owner,
      );
      note(
        "a draft league's own staff clear their team",
        cleared.status === 303 &&
          (cleared.setCookie ?? '').startsWith(
            'srl_my_team_01900000-0000-7000-8000-000000000003=;',
          ),
        JSON.stringify(cleared),
      );
    },
  );

  await step(
    'on a laptop, by keyboard, "My team" is the first entry of the account button',
    async () => {
      const { context, page } = await fresh({ viewport: laptop });
      try {
        await page.goto(`${origin}/signin?next=%2Fnorth-valley`);
        await signIn(page, people.coach);
        const button = page.locator('.site-account > summary');
        await button.focus();
        await page.keyboard.press('Enter');
        await page.locator('.site-account-panel').waitFor({ state: 'visible' });
        await page.keyboard.press('Tab');
        const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
        note('by keyboard the first entry is "My team"', focused === 'My team', String(focused));
        await Promise.all([
          page.waitForURL((url) => url.pathname === '/north-valley/teams/herons'),
          page.keyboard.press('Enter'),
        ]);
        await tallEnough(page, 'main', "the coach's team page on a laptop");
        await accessible(page, "the coach's team page on a laptop");
      } finally {
        await context.close();
      }
    },
  );
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Coach-finds-team browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Coach-finds-team browser test passed (${checked.length} checks).`);
