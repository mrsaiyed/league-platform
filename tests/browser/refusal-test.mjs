// Step 2.157: a refusal that knows who is looking, in a real browser at phone width, on the
// web app's made-up stand-in (APP_ENV=test). Nothing leaves this computer; every person,
// league and password is made up (apps/web/src/server/stand-in-sign-ins.ts and
// stand-in-ports.ts). A refusal is only ever met at an address (U-6), so each journey
// types the refused address, and taps from there:
// - a scheduler at People reads that their role does not include it and is back in the
//   admin in one tap; a scorekeeper at People reads the same;
// - a coach at the admin reads that this account does not help run the league and is on
//   the league's home in one tap; a member at an admin area reads the same, and switches
//   to another account, which brings them back to the page that was refused;
// - a signed-in stranger at a draft league's admin, and at a suspended league's, gets
//   "Page not found" with status 404 and nothing of the league;
// - no refusal shown to a signed-in person has "Sign in";
// - after another account signs in on the same device (another tab), a form sent from the
//   old tab that ends on a refusal names the account signed in now (the area 3 lead's walk);
// - a game of another league opened under this league's address, on the scoring page and in
//   the admin, is "Page not found" with status 404 and nothing of the other league;
// - a club admin at a team's page is told that their role does not include the league's
//   list of people, not that it could not be read, and is offered no form that could only
//   be refused;
// - a long address breaks inside the card at 390 and 320;
// - a signed-out person at any admin address is sent to sign in and back (U-15), and a
//   form sent after signing out elsewhere ends on the sign-in screen.
// And the page-step checks on each refusal: the accessibility checks (T-186), no sideways
// scrolling at phone width, everything tapped at least 44 high, and the way on reached by
// keyboard. `--no-build` serves the build already here.
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
  coach: { email: 'coach@example.test', password: 'made-up coach password' },
  member: { email: 'member@example.test', password: 'made-up member password' },
};
const phone = { width: 390, height: 844 };
// A game of the first league (Hawks v Bears, live), asked for under the second league's address.
const northValleyGame = '01900000-0000-7000-8000-006a00000002';
// A team of the draft league, where the made-up club admin holds the club admin's role.
const draftTeam = '01900000-0000-7000-8000-007e00000004';
const title = 'You do not have access';
const staffWords =
  "Your role in this league does not include this page. If it should, ask the league's owner or an admin.";
const otherWords =
  "This page is for the people who run North Valley League. If you should be one of them, ask the league's owner or an admin.";

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
/** A browser already signed in as one of the made-up people known by a cookie alone. */
async function asToken(token) {
  const made = await fresh();
  await made.context.addCookies([{ name: 'srl_session', value: token, url: origin }]);
  return made;
}
/** A browser signed in through the sign-in form, as a person signs in. */
async function signedIn(who) {
  const made = await fresh();
  await made.page.goto(`${origin}/signin`);
  await signIn(made.page, who);
  return made;
}
async function signIn(page, who) {
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/signin'),
    page.getByRole('button', { name: 'Sign in', exact: true }).click(),
  ]);
}
const link = (page, name) => page.getByRole('link', { name, exact: true });
const pathOf = (page) => new URL(page.url()).pathname;
const refusalShown = (page) => page.getByRole('heading', { level: 1, name: title }).waitFor();
const mainText = async (page) => (await page.locator('main').innerText()).replace(/\s+/g, ' ');

/** The page-step checks on a refusal, and that it offers a signed-in person no "Sign in". */
async function pageChecks(page, label) {
  await page
    .waitForFunction(() => document.title.trim() !== '', null, { timeout: 5000 })
    .catch(() => {});
  const problems = await accessibilityProblems(page);
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
  const [width, inner] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  note(`no sideways scrolling at phone width: ${label}`, width <= inner, `${width} > ${inner}`);
  const short = await page.$$eval('main :is(a, button)', (els) =>
    els
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => [el.textContent?.trim(), el.getBoundingClientRect().height])
      .filter(([, height]) => height < 43.5)
      .map(([name, height]) => `${name} ${Math.round(height)}`),
  );
  note(`everything tapped is at least 44 high: ${label}`, short.length === 0, short.join(', '));
  const signIns = await page
    .getByRole('link', { name: /^sign in/i })
    .or(page.getByRole('button', { name: /^sign in/i }))
    .count();
  note(`no "Sign in" on a signed-in person's refusal: ${label}`, signIns === 0, `${signIns}`);
  // By keyboard: the first stop inside the message is its one clear way on.
  await page
    .locator('main h1')
    .focus()
    .catch(() => {});
  await page.evaluate(() => {
    const heading = document.querySelector('main h1');
    if (heading instanceof HTMLElement) {
      heading.tabIndex = -1;
      heading.focus();
    }
  });
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => ({
    kind: document.activeElement?.getAttribute('data-kind'),
    visible: document.activeElement ? getComputedStyle(document.activeElement).outlineStyle : '',
  }));
  note(
    `by keyboard the one clear way on comes first, with its focus drawn: ${label}`,
    focused.kind === 'main' && focused.visible !== 'none',
    JSON.stringify(focused),
  );
}

if (browser) {
  await step('a scheduler at People is told their role does not include it', async () => {
    const { context, page } = await signedIn(people.scheduler);
    try {
      const answer = await page.goto(`${origin}/north-valley/admin/people`);
      await refusalShown(page);
      note('a refusal answers 403', answer?.status() === 403, String(answer?.status()));
      const text = await mainText(page);
      note(
        'the scheduler reads that their role does not include the page',
        text.includes(staffWords),
        text,
      );
      note(
        'the refusal says which account is signed in',
        text.includes('You are signed in as scheduler@example.test.'),
      );
      note('nothing says "ask the league to invite you" to staff', !text.includes('invite you'));
      note(
        'the scheduler is told their own role, and no other',
        text.includes('You are a scheduler in this league.') &&
          !/an admin in|a registrar|a scorekeeper|an editor|a club admin/.test(text),
        text,
      );
      note(
        'the refusal is drawn inside the admin’s own frame',
        (await page.locator('.staff-bar').count()) === 1,
      );
      note(
        'the quieter ways on are the league’s home and another account',
        (await link(page, 'Back to North Valley League').getAttribute('href')) ===
          '/north-valley?start=league' && (await link(page, 'Use another account').count()) === 1,
      );
      await pageChecks(page, 'a scheduler at People');
      await page.locator('main').getByRole('link', { name: 'Back to the admin' }).click();
      await page.waitForURL((url) => url.pathname === '/north-valley/admin');
      note(
        'one tap and the scheduler is back in the admin',
        pathOf(page) === '/north-valley/admin',
      );
      note(
        'the admin’s home is drawn for them',
        (await page.getByRole('heading', { level: 1 }).count()) === 1 &&
          (await page.getByRole('heading', { level: 1, name: title }).count()) === 0,
      );
    } finally {
      await context.close();
    }
  });

  await step(
    'a scorekeeper at People is told the same, and their admin is their games',
    async () => {
      const { context, page } = await signedIn(people.scorekeeper);
      try {
        await page.goto(`${origin}/north-valley/admin/people`);
        await refusalShown(page);
        const text = await mainText(page);
        note('the scorekeeper reads the staff words', text.includes(staffWords));
        note(
          'the scorekeeper is told their own role',
          text.includes('You are a scorekeeper in this league.'),
          text,
        );
        await pageChecks(page, 'a scorekeeper at People');
        await page.locator('main').getByRole('link', { name: 'Back to the admin' }).click();
        await page.getByRole('heading', { level: 1, name: 'Your games' }).waitFor();
        note(
          'one tap and the scorekeeper is at their games',
          pathOf(page) === '/north-valley/admin',
        );
      } finally {
        await context.close();
      }
    },
  );

  await step('a coach at the admin is on the league’s home in one tap', async () => {
    const { context, page } = await signedIn(people.coach);
    try {
      const answer = await page.goto(`${origin}/north-valley/admin`);
      await refusalShown(page);
      note('the coach’s refusal answers 403', answer?.status() === 403, String(answer?.status()));
      const text = await mainText(page);
      note(
        'the coach reads that the page is for the people who run the league',
        text.includes(otherWords),
        text,
      );
      note(
        'the coach is told who is signed in',
        text.includes('You are signed in as coach@example.test.'),
      );
      note(
        'the coach is offered no way into the admin and nothing of it',
        (await page.getByRole('link', { name: 'Back to the admin' }).count()) === 0 &&
          (await page.locator('.staff-bar').count()) === 0 &&
          !text.includes(staffWords) &&
          !text.includes('a coach'),
      );
      await pageChecks(page, 'a coach at the admin');
      await page.locator('main').getByRole('link', { name: 'Back to North Valley League' }).click();
      await page.waitForURL((url) => url.pathname === '/north-valley');
      note('one tap and the coach is on the league’s home', pathOf(page) === '/north-valley');
      note(
        'the league’s home is drawn, with its own header',
        (await page.locator('.site-header').count()) === 1 &&
          (await page.getByRole('heading', { level: 1, name: title }).count()) === 0,
      );
    } finally {
      await context.close();
    }
  });

  await step(
    'a member at an admin area switches to another account and is brought back',
    async () => {
      const { context, page } = await signedIn(people.member);
      try {
        await page.goto(`${origin}/north-valley/admin/teams`);
        await refusalShown(page);
        note(
          'the member reads the words for someone outside the league’s staff',
          (await mainText(page)).includes(otherWords),
        );
        await pageChecks(page, 'a member at Teams');
        await link(page, 'Use another account').click();
        // Since step 2.163 (L10) /signin tells a signed-in person so, with "Sign out and use
        // another account", which signs out and comes back to the form with the same `next`.
        await page.getByRole('heading', { level: 1, name: 'You are already signed in' }).waitFor();
        await page.getByRole('button', { name: 'Sign out and use another account' }).click();
        await page.getByRole('heading', { level: 1, name: 'Sign in' }).waitFor();
        await signIn(page, people.owner);
        note(
          'after switching, the owner is on the page that was refused',
          pathOf(page) === '/north-valley/admin/teams',
          page.url(),
        );
      } finally {
        await context.close();
      }
    },
  );

  await step(
    'a signed-in stranger at a hidden league gets "Page not found" and nothing of it',
    async () => {
      const { context, page } = await asToken('local-stranger-token');
      try {
        for (const [slug, name] of [
          ['quiet-pines', 'Quiet Pines'],
          ['closed-gate', 'Closed Gate'],
        ]) {
          const answer = await page.goto(`${origin}/${slug}/admin`);
          await page.getByRole('heading', { level: 1, name: 'Page not found' }).waitFor();
          note(
            `${slug}: a hidden league answers 404`,
            answer?.status() === 404,
            String(answer?.status()),
          );
          const html = await page.content();
          const body = await page.locator('body').innerText();
          note(
            `${slug}: nothing on the page names the league or shows its look`,
            !body.includes(name) &&
              !html.includes(name) &&
              (await page.locator('.league-site, .staff-bar, .site-header').count()) === 0,
          );
          note(
            `${slug}: no refusal and no "Sign in"`,
            !body.includes(title) &&
              (await page.getByRole('link', { name: /^sign in/i }).count()) === 0,
          );
        }
      } finally {
        await context.close();
      }
    },
  );

  await step('a refusal names the account signed in now, after another signed in', async () => {
    const { context, page } = await asToken('local-scheduler-token');
    try {
      await page.goto(`${origin}/north-valley/admin/schedule`);
      await page.locator('main form').first().waitFor();
      // Another tab on the same device: the coach is signed in now.
      await context.clearCookies();
      await context.addCookies([{ name: 'srl_session', value: 'local-coach-token', url: origin }]);
      // On a weak signal: the page's second ask for itself (the refusal drawn afresh) takes
      // a second and a half, and meanwhile nothing of the scheduler may be drawn.
      await page.route('**/*', async (route) => {
        const asked = route.request().headers();
        if (asked['rsc'] === '1' && route.request().method() === 'GET') {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        await route.continue();
      });
      // The old page may stay while the answer comes; a refusal kept from the scheduler's
      // load (their name, or the admin's frame around it) may never be drawn.
      const staleRefusal = (text) =>
        text.includes(title) && (text.includes('local-scheduler-token') || text.includes('ADMIN'));
      const seen = [];
      const watching = setInterval(() => {
        page
          .evaluate(() => document.body.innerText)
          .then((text) => seen.push(text))
          .catch(() => {});
      }, 50);
      // A form sent from the old tab, which the app answers without loading a whole page.
      const form = page
        .locator('main form')
        .filter({ has: page.locator('input[name^="$ACTION"]') })
        .first();
      await form.evaluate((el) => {
        for (const field of el.querySelectorAll('[required]')) field.removeAttribute('required');
        el.noValidate = true;
        el.requestSubmit();
      });
      await page.getByText('You are signed in as local-coach-token@example.test.').waitFor();
      clearInterval(watching);
      note(
        'on a weak signal the scheduler’s name and admin are never drawn while the fresh refusal comes',
        seen.length > 5 && !seen.some(staleRefusal),
        `${seen.length} looks; ${seen.find(staleRefusal) ?? ''}`,
      );
      await page.unroute('**/*');
      const text = await mainText(page);
      note(
        'the refusal names the coach, who is signed in now',
        !text.includes('local-scheduler-token'),
        text,
      );
      note(
        'the refusal is the coach’s, not the scheduler’s admin',
        text.includes(otherWords) && (await page.locator('.staff-bar').count()) === 0,
        text,
      );
    } finally {
      await context.close();
    }
  });

  await step('another league’s game under this league’s address is "Page not found"', async () => {
    const { context, page } = await asToken('local-owner-token');
    try {
      for (const at of [
        `/harbor-city/score/${northValleyGame}`,
        `/harbor-city/admin/games/${northValleyGame}`,
      ]) {
        const answer = await page.goto(`${origin}${at}`);
        await page.getByRole('heading', { level: 1, name: 'Page not found' }).waitFor();
        note(`${at}: answers 404`, answer?.status() === 404, String(answer?.status()));
        const html = await page.content();
        note(
          `${at}: nothing of the other league or its game`,
          !['North Valley', 'Hawks', 'Bears'].some((word) => html.includes(word)),
        );
        note(
          `${at}: one way on, back to this league’s games`,
          (await page.locator('main a[data-kind="main"]').count()) === 1,
        );
      }
    } finally {
      await context.close();
    }
  });

  await step('a club admin is told their role does not include the league’s people', async () => {
    const { context, page } = await asToken('local-club-admin-token');
    try {
      await page.goto(`${origin}/quiet-pines/admin/teams/${draftTeam}`);
      await page.getByRole('heading', { level: 2, name: 'The league list' }).waitFor();
      const text = await mainText(page);
      note(
        'the club admin reads that their role does not include the list of people',
        text.includes('Your role in this league does not include its list of people'),
        text.slice(0, 200),
      );
      note('nothing tells them to reload the page', !text.includes('could not be read just now'));
      // No form that could only be refused (the lead's rule since step 2.180).
      note(
        'the club admin is not offered "A new player, not in the league yet"',
        (await page
          .getByRole('heading', { name: 'A new player, not in the league yet' })
          .count()) === 0,
      );
      note(
        'the club admin is not offered the head’s "Add a player", which could lead nowhere',
        (await page.locator('main a[href="#add-player"]').count()) === 0,
      );
    } finally {
      await context.close();
    }
  });

  await step(
    'an admin is offered "A new player, not in the league yet"; a post by hand is refused plainly',
    async () => {
      const { context, page } = await asToken('local-admin-token');
      try {
        await page.goto(`${origin}/quiet-pines/admin/teams/${draftTeam}`);
        const heading = page.getByRole('heading', { name: 'A new player, not in the league yet' });
        await heading.waitFor();
        note('the draft league’s admin is offered "A new player, not in the league yet"', true);
        note(
          'the admin has the head’s "Add a player"',
          (await page.locator('main a[href="#add-player"]').count()) === 1,
        );
        // The form, sent by a club admin who never had it: the command still refuses, in
        // plain words (signed in as the club admin before the form is sent).
        await context.clearCookies();
        await context.addCookies([
          { name: 'srl_session', value: 'local-club-admin-token', url: origin },
        ]);
        const form = page.locator('section', { has: heading }).locator('form');
        await form.locator('input[name="firstName"]').fill('Made');
        await form.locator('input[name="lastName"]').fill('Up');
        await form
          .getByRole('button', { name: 'Add the person and put them on the roster' })
          .click();
        await page
          .getByText('Your role in this league does not include adding people to its list.')
          .first()
          .waitFor();
        note('a post by hand from a club admin is refused in plain words', true);
      } finally {
        await context.close();
      }
    },
  );
  await step('a long address breaks inside the refusal’s card, at 390 and 320', async () => {
    // A made-up scheduler of the first league signed in with a 52-letter address: refused
    // at People inside the admin's frame, and at the second league's admin on the plain screen.
    const longEmail = 'local-scheduler-with-long-address-token@example.test';
    for (const width of [390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      await context.addCookies([
        { name: 'srl_session', value: 'local-scheduler-with-long-address-token', url: origin },
      ]);
      const page = await context.newPage();
      try {
        for (const at of ['/north-valley/admin/people', '/harbor-city/admin']) {
          await page.goto(`${origin}${at}`);
          await refusalShown(page);
          const line = page.locator('main p', { hasText: longEmail });
          const fits = await line.evaluate((el) => {
            const card = el.closest('main').getBoundingClientRect();
            const box = el.getBoundingClientRect();
            return {
              inside: box.left >= card.left - 0.5 && box.right <= card.right + 0.5,
              page: document.documentElement.scrollWidth <= window.innerWidth,
            };
          });
          note(
            `${width}: at ${at} the long address breaks inside the card, and nothing scrolls sideways`,
            fits.inside && fits.page,
            JSON.stringify(fits),
          );
        }
      } finally {
        await context.close();
      }
    }
  });

  await step(
    'a signed-out person at an admin area is sent to sign in and back (U-15)',
    async () => {
      const { context, page } = await fresh();
      try {
        const answer = await page.goto(`${origin}/north-valley/admin/games`);
        await page.getByRole('heading', { level: 1, name: 'Sign in' }).waitFor();
        note(
          'a signed-out scorekeeper at their games is sent to sign in, not refused',
          pathOf(page) === '/signin' &&
            new URL(page.url()).searchParams.get('next') === '/north-valley/admin/games' &&
            (await page.getByText(title).count()) === 0,
          `${answer?.status()} ${page.url()}`,
        );
        await signIn(page, people.scorekeeper);
        note(
          'signed in, they are back where they were going',
          pathOf(page) === '/north-valley/admin/games',
          page.url(),
        );
        // A league hidden from them is still "not found", as no league at all.
        await context.clearCookies();
        const hidden = await page.goto(`${origin}/quiet-pines/admin/games`);
        await page.getByRole('heading', { level: 1, name: 'Page not found' }).waitFor();
        note(
          'a signed-out person at a draft league’s admin area gets 404',
          hidden?.status() === 404,
        );
      } finally {
        await context.close();
      }
    },
  );

  await step('an owner signed out in another tab who sends a form is sent to sign in', async () => {
    const { context, page } = await asToken('local-owner-token');
    try {
      await page.goto(`${origin}/north-valley/admin/schedule`);
      await page.locator('main form').first().waitFor();
      await context.clearCookies();
      const form = page
        .locator('main form')
        .filter({ has: page.locator('input[name^="$ACTION"]') })
        .first();
      await form.evaluate((el) => {
        for (const field of el.querySelectorAll('[required]')) field.removeAttribute('required');
        el.noValidate = true;
        el.requestSubmit();
      });
      await page.waitForURL((url) => url.pathname === '/signin');
      note(
        'the form is answered by the sign-in screen, which comes back to the schedule',
        new URL(page.url()).searchParams.get('next') === '/north-valley/admin/schedule',
        page.url(),
      );
    } finally {
      await context.close();
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Refusal browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Refusal browser test passed (${checked.length} checks).`);
