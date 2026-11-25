// Step 2.128, layer 2 (T-85, T4 line 47): "Your password" on the account page, in a real
// browser, on the made-up stand-in (APP_ENV=test). Codes are read on the kept emails' page;
// nothing leaves this computer and every person and address is made up. Builds the app first
// unless given --no-build.
//
// - Two browser contexts are signed in as one new person.
// - In the first, with scripts on: a wrong current password and then a too-short new one are
//   refused, each said beside its own box, and both boxes come back empty (a password is never
//   sent back to the page); then a good change is said without the page being loaded again,
//   and the devices list shows only this device.
// - The second's next page asks for sign-in; the old password no longer signs in, the new one
//   does; the first is still signed in.
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
  console.error(`Change password browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
};

const run = Date.now().toString(36);
const person = `changer-${run}@example.test`;
const first = 'a made-up first password';
const second = 'a made-up second password';

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

/** Signs in with `password`; true when the sign-in screen let them through. */
async function signIn(page, password) {
  await page.goto(`${origin}/signin`);
  await page.getByLabel('Email').fill(person);
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
pageOne.setDefaultTimeout(30_000);
pageTwo.setDefaultTimeout(30_000);

await step('one new person, signed in on two devices', async () => {
  await pageOne.goto(`${origin}/signup`);
  await pageOne.getByLabel('Email').fill(person);
  await tap(pageOne, button(pageOne, 'Email me a code'), (url) => url.pathname === '/signup/code');
  await pageOne.getByLabel('Code').fill(await keptCode(one, person));
  await tap(pageOne, button(pageOne, 'Continue'), (url) => url.pathname === '/signup/password');
  await pageOne.getByLabel('Password').fill(first);
  await tap(pageOne, button(pageOne, 'Save and sign in'), (url) => url.pathname === '/account');
  await answerNameScreen(pageOne, 'Pia', 'Changer');
  note('the second device signs in with the first password', await signIn(pageTwo, first));
});

await step('the first device changes the password', async () => {
  await pageOne.goto(`${origin}/account`);
  await pageOne.evaluate(() => {
    window.__samePage = true;
  });
  const form = pageOne.locator('form[data-change-password]');
  const oldBox = form.locator('input[name=oldPassword]');
  const newBox = form.locator('input[name=newPassword]');
  const send = async (oldPassword, newPassword, answer) => {
    await oldBox.fill(oldPassword);
    await newBox.fill(newPassword);
    await form.locator('button[type=submit]').click();
    await pageOne.locator(answer).waitFor();
  };
  const bothEmpty = async () =>
    (await oldBox.inputValue()) === '' && (await newBox.inputValue()) === '';

  await send('not the password', second, '[data-change-password-problem="wrongOld"]');
  note(
    'a wrong current password is said beside that box, and both boxes are empty',
    (await form.locator('[data-box="oldPassword"][data-change-password-problem]').count()) === 1 &&
      (await oldBox.getAttribute('aria-invalid')) === 'true' &&
      (await bothEmpty()),
  );
  const problems = await accessibilityProblems(pageOne);
  note(
    'accessibility: the account page with a refused change',
    problems.length === 0,
    problems.join('; '),
  );

  await send(first, 'short', '[data-change-password-problem="tooShort"]');
  note(
    'a too-short new password is said beside that box, and both boxes are empty',
    (await form.locator('[data-box="newPassword"][data-change-password-problem]').count()) === 1 &&
      (await newBox.getAttribute('aria-invalid')) === 'true' &&
      (await oldBox.getAttribute('aria-invalid')) === null &&
      (await bothEmpty()),
  );

  await send(first, second, '[data-change-password-saved]');
  note(
    'the change is said without a reload, with scripts on',
    (await pageOne.evaluate(() => window.__samePage === true)) && (await bothEmpty()),
  );
  await pageOne.locator('li[data-this-device]').waitFor();
  note(
    'the devices list now holds only this device',
    (await pageOne.locator('main li[data-this-device]').count()) === 1 &&
      (await pageOne.locator('main ul.ui-rows > li').count()) === 1,
  );
});

await step('the second device is signed out, and only the new password signs in', async () => {
  await pageTwo.goto(`${origin}/account`);
  note('the second device is asked to sign in', pathOf(pageTwo) === '/signin', pageTwo.url());
  note('the old password no longer signs in', !(await signIn(pageTwo, first)));
  note('the new password signs in', await signIn(pageTwo, second));
  await pageOne.goto(`${origin}/account`);
  note('the first device is still signed in', pathOf(pageOne) === '/account', pageOne.url());
});

await one.close();
await two.close();
await browser.close();
server.child.kill();
if (failures.length > 0) stop();
console.log(`Change password browser test passed: ${checked.length} checks.`);
