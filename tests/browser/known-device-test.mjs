// Step 2.234's done test (T-225, T-504, S-133): a stranger's ten wrong passwords for a
// person's address do not stop that person signing in on a phone they have signed in on
// before; on a new phone the same right password reads a pause said in minutes, without
// blame, naming the ways in ("Continue with Google", drawn here, and the link "Reset your
// password"), and the reset gets them in. In a real browser at phone width (390 × 844), by
// taps, WITH SCRIPTS ON, on the made-up stand-in (APP_ENV=test) with Google set up. Every
// context is one network here (this computer), so what is proved is the count against the
// address; the network's own count is proved in the server's tests. Codes are read on the
// local kept emails' page (step 2.96). Nothing leaves this computer; every address is made
// up and ends in .test. No page's address holds an address, a code or a password, and the
// server prints none of them. `--no-build` serves the build here.
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

const email = `known-${Date.now().toString(36)}@example.test`;
const chosen = 'a made-up chosen password';
const renewed = 'a made-up new password';
const secrets = new Set([chosen, renewed]);
const visited = [];

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}
if (!built) {
  console.error(`Known device browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

const origin = `http://localhost:${await freePort()}`;
const server = startNext(['start', '--port', new URL(origin).port], {
  APP_ENV: 'test',
  // Google set up, so the pause names "Continue with Google" (M27).
  GOOGLE_SIGN_IN: 'on',
  PUBLIC_BASE_URL: origin,
});
let browser = null;
await step('starting the server and the browser', async () => {
  await waitFor(`${origin}/`, server, [{ address: '/signin/kept-emails' }]);
  browser = await launch();
});
if (browser === null) {
  server.child.kill();
  console.error(`Known device browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

/** A phone of its own (a new device): 390 wide, scripts on. */
async function phone() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    javaScriptEnabled: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) visited.push(frame.url());
  });
  return { context, page };
}

const button = (page, name) => page.getByRole('button', { name, exact: true });
const link = (page, name) => page.getByRole('link', { name, exact: true });
const atPath = (wanted) => (url) => url.pathname === wanted;
async function tap(page, target, landed) {
  await Promise.all([page.waitForURL(landed), target.tap()]);
  await page.locator('main').first().waitFor();
}
const alert = (page) => page.locator('main [role=alert]');

/** The newest code to `email` once it was sent at least `count` codes. */
async function keptCode(context, count) {
  const reader = await context.newPage();
  try {
    for (let tries = 0; tries < 10; tries += 1) {
      await reader.goto(`${origin}/signin/kept-emails`);
      const emails = reader.locator(`li[data-kept-email="${email}"]`);
      if ((await emails.count()) >= count) {
        const code = (await emails.first().locator('code[data-code]').innerText()).trim();
        if (/^\d{6}$/.test(code)) {
          secrets.add(code);
          return code;
        }
      }
    }
    throw new Error(`no ${count} codes for the address in the kept emails`);
  } finally {
    await reader.close();
  }
}

/** One try on the sign-in screen, from a fresh screen: the problem it answers with. */
async function tryPassword(page, password) {
  await page.goto(`${origin}/signin`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await tap(
    page,
    button(page, 'Sign in'),
    (url) => url.pathname !== '/signin' || url.search !== '',
  );
  if (new URL(page.url()).pathname !== '/signin') return 'signed in';
  return (await alert(page).getAttribute('data-sign-in-problem')) ?? 'no problem shown';
}

async function signedInAsEmail(page) {
  await page.goto(`${origin}/account`);
  await page.locator('main').first().waitFor();
  return (await page.getByText(`Signed in as ${email}`).count()) === 1;
}

const owner = await phone();
const stranger = await phone();
const fresh = await phone();
try {
  await step('the owner signs up on their phone, then signs out', async () => {
    const { context, page } = owner;
    await page.goto(`${origin}/signup`);
    await page.getByLabel('Email').fill(email);
    await tap(page, button(page, 'Email me a code'), atPath('/signup/code'));
    await page.getByLabel('Code').fill(await keptCode(context, 1));
    await tap(page, button(page, 'Continue'), atPath('/signup/password'));
    await page.getByLabel('Password').fill(chosen);
    await tap(page, button(page, 'Save and sign in'), atPath('/account'));
    await answerNameScreen(page, 'Made-up', 'Owner');
    note('the owner is signed in on their phone', await signedInAsEmail(page));
    await tap(page, button(page, 'Sign out').first(), (url) => url.pathname !== '/account');
    note('the owner is signed out', !(await signedInAsEmail(page)));
  });

  await step("a stranger's ten wrong passwords for the address", async () => {
    const { page } = stranger;
    let wrong = 0;
    let paused = 0;
    while (wrong < 10) {
      // From the fifth wrong try each try waits 30 seconds (T-225): the stranger waits too.
      if (wrong >= 5) await page.waitForTimeout(30_500);
      const answer = await tryPassword(page, `a wrong password ${wrong + 1}`);
      if (answer === 'wrongEmailOrPassword') wrong += 1;
      else if (answer === 'tooManyAttempts' && paused < 3) paused += 1;
      else throw new Error(`wrong try ${wrong + 1} answered ${answer}`);
    }
    const locked = await tryPassword(page, 'any password at all');
    note('after ten wrong passwords the stranger is paused', locked === 'tooManyAttempts', locked);
  });

  await step('the owner signs in on the phone used before', async () => {
    const { page } = owner;
    const answer = await tryPassword(page, chosen);
    note(
      "a stranger's ten wrong passwords do not stop the owner on a phone used before (T-504)",
      answer === 'signed in' && (await signedInAsEmail(page)),
      answer,
    );
  });

  await step('on a new phone: minutes, the ways in, and the reset that works', async () => {
    const { context, page } = fresh;
    const answer = await tryPassword(page, chosen);
    note('the right password on a new phone is paused', answer === 'tooManyAttempts', answer);
    const words = (await alert(page).innerText()).trim();
    note(
      'the pause is said in minutes, without blame, naming "Continue with Google" and "Reset your password"',
      /^For safety, signing in with a password is paused for 1[45] minutes\. To get in now, use "Continue with Google" below, or choose a new password:\s+Reset your password$/.test(
        words,
      ),
      words,
    );
    note(
      'no "seconds" and no "Too many tries" on the screen',
      !/seconds|too many tries/i.test(await page.locator('main').innerText()),
    );
    note(
      '"Continue with Google", which the words name, is on the screen',
      (await button(page, 'Continue with Google').count()) === 1,
    );
    const problems = await accessibilityProblems(page);
    note('accessibility: the pause on a new phone', problems.length === 0, problems.join('; '));
    const wide = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    note('nothing scrolls sideways at 390: the pause on a new phone', !wide);
    await tap(page, link(page, 'Reset your password'), atPath('/signin/forgot'));
    await page.getByLabel('Email').fill(email);
    await tap(page, button(page, 'Email me a code'), atPath('/signup/code'));
    await page.getByLabel('Code').fill(await keptCode(context, 2));
    await tap(page, button(page, 'Continue'), atPath('/signup/password'));
    await page.getByLabel('Password').fill(renewed);
    await tap(page, button(page, 'Save and sign in'), (url) => url.pathname !== '/signup/password');
    note('"Reset your password" gets the person in on the new phone', await signedInAsEmail(page));
  });
} finally {
  await owner.context.close();
  await stranger.context.close();
  await fresh.context.close();
  await browser.close();
  server.child.kill();
}

const output = server.output();
for (const value of [...secrets, email]) {
  if (output.includes(value)) failures.push(`the server printed "${value}"`);
}
const leaked = visited.filter((url) => {
  const plain = decodeURIComponent(url);
  return plain.includes('@') || [...secrets].some((secret) => plain.includes(secret));
});
note(
  "no page's address held an email address, a code or a password",
  leaked.length === 0,
  leaked.join(', '),
);

if (failures.length > 0) {
  console.error(`Known device browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Known device browser test passed (${checked.length} checks).`);
