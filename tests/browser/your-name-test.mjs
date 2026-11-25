// Step 2.128, layer 1 (R-21): the one name screen, in a real browser, on the made-up stand-in
// (APP_ENV=test). Codes are read on the kept emails' page; nothing leaves this computer and
// every person and address is made up. Builds the app first unless given --no-build.
//
// - A new sign-up meets the name screen right after choosing a password, and cannot open a
//   league page before answering: the page sends them to the screen, which then goes on to
//   that page. A refused name keeps what was typed.
// - Signed out and in again, they are not asked again; the account page holds their name.
// - The one made-up person with no name (local-unnamed-token, T-446) meets the same screen
//   at the empty league's admin page, answers, and League settings → Admins shows the name.
//   Before that, the league's owner sees them there as "No name yet" (A-14), and once they
//   answer, the same line carries their name.
// - "Your name" on the account page, with scripts on: a refused change keeps what was typed,
//   and a saved one appears without the page being loaded again; Admins then shows it.
import {
  accessibilityProblems,
  answerNameScreen,
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

const run = Date.now().toString(36);
const newcomer = `newcomer-${run}@example.test`;
const chosen = 'a made-up chosen password';

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}
if (!built) {
  console.error(`Your name browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

const origin = `http://localhost:${await freePort()}`;
const server = startNext(['start', '--port', new URL(origin).port], {
  APP_ENV: 'test',
  PUBLIC_BASE_URL: origin,
});
let browser = null;
await step('starting the server and the browser', async () => {
  await waitFor(`${origin}/`, server, [{ address: '/signin/kept-emails' }]);
  browser = await launch();
});
if (browser === null) {
  server.child.kill();
  console.error(`Your name browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

const pathOf = (page) => new URL(page.url()).pathname;
const nameScreen = (page) => page.locator('[data-name-screen]');
const button = (page, name) => page.getByRole('button', { name, exact: true });

async function tap(page, target, landed) {
  await Promise.all([page.waitForURL(landed), target.click()]);
  await page.locator('main').first().waitFor();
}

/** The newest code sent to `to`, read on the kept emails' page. */
async function keptCode(context, to) {
  const reader = await context.newPage();
  try {
    for (let tries = 0; tries < 10; tries += 1) {
      await reader.goto(`${origin}/signin/kept-emails`);
      const email = reader.locator(`li[data-kept-email="${to}"]`).first();
      if ((await email.count()) > 0) {
        const code = (await email.locator('code[data-code]').innerText()).trim();
        if (/^\d{6}$/.test(code)) return code;
      }
    }
    return '';
  } finally {
    await reader.close();
  }
}

/** The name screen's form: `first` and `last` typed and sent, for a refusal. */
async function sendName(form, first, last) {
  await form.locator('input[name=firstName]').fill(first);
  await form.locator('input[name=lastName]').fill(last);
  await form.locator('button[type=submit]').click();
}

await step('a new sign-up is asked its name once', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  try {
    await page.goto(`${origin}/signup`);
    await page.getByLabel('Email').fill(newcomer);
    await tap(page, button(page, 'Email me a code'), (url) => url.pathname === '/signup/code');
    const code = await keptCode(context, newcomer);
    note('a code for the new address is on the kept emails page', /^\d{6}$/.test(code));
    await page.getByLabel('Code').fill(code);
    await tap(page, button(page, 'Continue'), (url) => url.pathname === '/signup/password');
    await page.getByLabel('Password').fill(chosen);
    await tap(page, button(page, 'Save and sign in'), (url) => url.pathname === '/account');
    note(
      'right after the password, the name screen',
      (await nameScreen(page).count()) === 1,
      pathOf(page),
    );
    const problems = await accessibilityProblems(page);
    note('accessibility: the name screen', problems.length === 0, problems.join('; '));

    // Before answering, a league page sends them to the screen, holding where they were going.
    await page.goto(`${origin}/north-valley/schedule`);
    await nameScreen(page).waitFor();
    const sent = new URL(page.url());
    note(
      'a league page, before the name, is the name screen on /account',
      sent.pathname === '/account' && sent.searchParams.get('next') === '/north-valley/schedule',
      page.url(),
    );

    // A refused name keeps what was typed and says why.
    const form = nameScreen(page).locator('form[data-own-name="give"]');
    await sendName(form, '   ', 'Kept-as-typed');
    await page.locator('[data-own-name-problem="invalid"]').waitFor();
    note(
      'a refused name keeps what was typed, on the name screen',
      (await form.locator('input[name=lastName]').inputValue()) === 'Kept-as-typed' &&
        (await nameScreen(page).count()) === 1,
    );

    await answerNameScreen(page, 'Nadia', 'Newcomer');
    note(
      'answered, the screen goes on to the league page that sent them',
      pathOf(page) === '/north-valley/schedule',
      page.url(),
    );

    // Signed out and in again: not asked again.
    await page.goto(`${origin}/account`);
    await tap(page, button(page, 'Sign out'), (url) => url.pathname !== '/account');
    await page.goto(`${origin}/signin`);
    await page.getByLabel('Email').fill(newcomer);
    await page.getByLabel('Password').fill(chosen);
    await tap(page, button(page, 'Sign in'), (url) => url.pathname !== '/signin');
    await page.goto(`${origin}/north-valley/schedule`);
    note(
      'signed in again, a league page opens with no name screen',
      pathOf(page) === '/north-valley/schedule' && (await nameScreen(page).count()) === 0,
      page.url(),
    );
    await page.goto(`${origin}/account`);
    const change = page.locator('form[data-own-name="change"]');
    note(
      'the account page holds the name given, and asks nothing',
      (await nameScreen(page).count()) === 0 &&
        (await change.locator('input[name=firstName]').inputValue()) === 'Nadia' &&
        (await change.locator('input[name=lastName]').inputValue()) === 'Newcomer',
    );
  } finally {
    await context.close();
  }
});

await step('the made-up person with no name, and the Admins page', async () => {
  // The league's owner looks at the empty league's Admins page first (A-14).
  const ownerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ownerContext.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
  const ownerPage = await ownerContext.newPage();
  ownerPage.setDefaultTimeout(30_000);
  const unnamedLines = (page) =>
    page.locator('li[data-person=""]').filter({ hasText: 'No name yet' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ name: 'srl_session', value: 'local-unnamed-token', url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  try {
    await ownerPage.goto(`${origin}/still-waters/admin/settings/admins`);
    const unnamedBefore = await unnamedLines(ownerPage).count();
    note(
      'the owner sees the person who has not answered as "No name yet", with their role',
      unnamedBefore >= 1 &&
        (await unnamedLines(ownerPage).filter({ hasText: 'Admin' }).count()) >= 1,
      (await ownerPage.locator('li[data-person]').allInnerTexts()).join(' | '),
    );
    note(
      'and not by an email address',
      !(await ownerPage.locator('li[data-person]').allInnerTexts()).join(' ').includes('@'),
    );
    await page.goto(`${origin}/still-waters/admin`);
    note(
      'the made-up person with no name meets the name screen at an admin page',
      pathOf(page) === '/account' && (await nameScreen(page).count()) === 1,
      page.url(),
    );
    await answerNameScreen(page, 'Una', 'Named');
    note('answered, back on the admin page', pathOf(page) === '/still-waters/admin', page.url());
    await page.goto(`${origin}/still-waters/admin/settings/admins`);
    note(
      'League settings → Admins shows the name given',
      (await page.locator('main').getByText('Una Named').count()) > 0,
    );
    await ownerPage.goto(`${origin}/still-waters/admin/settings/admins`);
    note(
      'the owner now sees that line by the name given, one "No name yet" fewer',
      (await ownerPage
        .locator('li[data-person="Una Named"]')
        .filter({ hasText: 'Admin' })
        .count()) === 1 && (await unnamedLines(ownerPage).count()) === unnamedBefore - 1,
      (await ownerPage.locator('li[data-person]').allInnerTexts()).join(' | '),
    );

    // "Your name" with scripts on: nothing loads the page again (the mark stays).
    await page.goto(`${origin}/account`);
    await page.evaluate(() => {
      window.__samePage = true;
    });
    const change = page.locator('form[data-own-name="change"]');
    await sendName(change, 'Una', '  ');
    await page.locator('[data-own-name-problem="invalid"]').waitFor();
    note(
      'a refused change keeps what was typed',
      (await change.locator('input[name=firstName]').inputValue()) === 'Una' &&
        (await change.locator('input[name=lastName]').inputValue()) === '  ',
    );
    await sendName(change, 'Una', 'Renamed');
    await page.locator('[data-own-name-saved]').waitFor();
    note(
      'a saved change appears without a reload, with scripts on',
      (await page.evaluate(() => window.__samePage === true)) &&
        (await change.locator('input[name=lastName]').inputValue()) === 'Renamed',
    );
    await page.goto(`${origin}/still-waters/admin/settings/admins`);
    note(
      'Admins shows the changed name',
      (await page.locator('main').getByText('Una Renamed').count()) > 0 &&
        (await page.locator('main').getByText('Una Named').count()) === 0,
    );
  } finally {
    await context.close();
    await ownerContext.close();
  }
});

await browser.close();
server.child.kill();
if (failures.length > 0) {
  console.error(`Your name browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Your name browser test passed: ${checked.length} checks.`);
