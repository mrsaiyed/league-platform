// Step 2.128, layer 3 (T-73, T-457, S-129): "Your email" on the account page, in a real
// browser, on the made-up stand-in (APP_ENV=test). Codes are read on the kept emails' page;
// nothing leaves this computer and every person and address is made up. Builds the app first
// unless given --no-build.
//
// - Two browser contexts are signed in as one new person.
// - In the first, with scripts on: the new address and the password ask for a code, said
//   without a reload; the code goes to the NEW address only. A wrong code is refused beside
//   its box, the box empty; nothing changed: the old address still signs in, the new one not.
// - Then the right code: the change is said without a reload, "Signed in as" shows the new
//   address, the devices list only this device; the new address signs in, the old one not;
//   the second device is asked to sign in.
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
const stop = () => {
  console.error(`Change email browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
};

const run = Date.now().toString(36);
const person = `mover-${run}@example.test`;
const moved = `moved-${run}@example.test`;
const password = 'a made-up mover password';

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}
if (!built) stop();

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
  stop();
}

const pathOf = (page) => new URL(page.url()).pathname;
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

/** Signs in with `email`; true when the sign-in screen let them through. */
async function signIn(page, email) {
  await page.goto(`${origin}/signin`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await tap(
    page,
    button(page, 'Sign in'),
    (url) => url.pathname !== '/signin' || url.searchParams.has('problem'),
  );
  return pathOf(page) !== '/signin';
}

const one = await browser.newContext({ viewport: { width: 390, height: 844 } });
const two = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const pageOne = await one.newPage();
const pageTwo = await two.newPage();
for (const page of [pageOne, pageTwo]) page.setDefaultTimeout(30_000);

/** Whether `email` signs in, on a device of its own that is closed after. */
async function signsInElsewhere(email) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    return await signIn(page, email);
  } finally {
    await context.close();
  }
}

await step('one new person, signed in on two devices', async () => {
  await pageOne.goto(`${origin}/signup`);
  await pageOne.getByLabel('Email').fill(person);
  await tap(pageOne, button(pageOne, 'Email me a code'), (url) => url.pathname === '/signup/code');
  await pageOne.getByLabel('Code').fill(await keptCode(one, person));
  await tap(pageOne, button(pageOne, 'Continue'), (url) => url.pathname === '/signup/password');
  await pageOne.getByLabel('Password').fill(password);
  await tap(pageOne, button(pageOne, 'Save and sign in'), (url) => url.pathname === '/account');
  await answerNameScreen(pageOne, 'Mo', 'Mover');
  note('the second device signs in with the old address', await signIn(pageTwo, person));
});

const root = pageOne.locator('[data-change-email]');
const codeBox = root.locator('form[data-change-email-code] input[name=code]');
let code = '';

await step('the first device asks for a code, then types a wrong one', async () => {
  await pageOne.goto(`${origin}/account`);
  await pageOne.evaluate(() => {
    window.__samePage = true;
  });
  const ask = root.locator('form[data-change-email-ask]');
  await ask.locator('input[name=newEmail]').fill(moved);
  await ask.locator('input[name=password]').fill(password);
  await ask.locator('button[type=submit]').click();
  await root.locator('[data-change-email-sent]').waitFor();
  note(
    'the code is said sent to the new address, without a reload, the password box empty',
    (await pageOne.evaluate(() => window.__samePage === true)) &&
      (await root.locator('[data-change-email-sent]').innerText()).includes(moved) &&
      (await ask.locator('input[name=password]').inputValue()) === '',
  );
  code = await keptCode(one, moved);
  note('a code went to the new address', /^\d{6}$/.test(code));
  const wrong = code === '000000' ? '111111' : '000000';
  await codeBox.fill(wrong);
  await root.locator('form[data-change-email-code] button[type=submit]').click();
  await root.locator('[data-box="code"][data-change-email-problem="codeWrong"]').waitFor();
  note(
    'a wrong code is said beside its box, the box empty, without a reload',
    (await codeBox.inputValue()) === '' &&
      (await codeBox.getAttribute('aria-invalid')) === 'true' &&
      (await pageOne.evaluate(() => window.__samePage === true)),
  );
  const problems = await accessibilityProblems(pageOne);
  note(
    'accessibility: the account page with a refused code',
    problems.length === 0,
    problems.join('; '),
  );
});

await step('a wrong code changed nothing', async () => {
  note('the old address still signs in', await signsInElsewhere(person));
  note('the new address does not sign in', !(await signsInElsewhere(moved)));
});

await step('the right code changes the email', async () => {
  await codeBox.fill(code);
  await root.locator('form[data-change-email-code] button[type=submit]').click();
  await root.locator('[data-change-email-changed]').waitFor();
  note(
    'the change is said without a reload, with scripts on',
    (await pageOne.evaluate(() => window.__samePage === true)) &&
      (await root.locator('[data-change-email-changed]').innerText()).includes(moved),
  );
  await pageOne.locator('.account-who', { hasText: moved }).waitFor();
  note(
    '"Signed in as" shows the new address',
    (await pageOne.locator('.account-who').innerText()).includes(moved),
  );
  note(
    'the devices list now holds only this device',
    (await pageOne.locator('main li[data-this-device]').count()) === 1 &&
      (await pageOne.locator('main ul.ui-rows > li').count()) === 1,
  );
});

await step(
  'the new address signs in, the old one does not, the other device is asked to sign in',
  async () => {
    await pageTwo.goto(`${origin}/account`);
    note('the second device is asked to sign in', pathOf(pageTwo) === '/signin', pageTwo.url());
    note('the old address no longer signs in', !(await signIn(pageTwo, person)));
    note('the new address signs in', await signIn(pageTwo, moved));
    await pageOne.goto(`${origin}/account`);
    note('the first device is still signed in', pathOf(pageOne) === '/account', pageOne.url());
  },
);

await one.close();
await two.close();
await browser.close();
server.child.kill();
if (failures.length > 0) stop();
console.log(`Change email browser test passed: ${checked.length} checks.`);
