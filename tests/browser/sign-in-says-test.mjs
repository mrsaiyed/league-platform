// Step 2.163: sign-up, sign-in and the device list say what is happening (the using-it
// audit, M24, M26 to M30, L9, L10), in a real browser at phone width (390 × 844), by taps,
// with scripts on and off, on the made-up stand-in (APP_ENV=test). Codes are read on the
// local kept emails' page (step 2.96). Nothing leaves this computer; every address is made
// up and ends in .test.
//
// - An address typed with a slip is seen on the code screen and corrected through "Wrong
//   address? Change it"; "Send a new code" stays on the code screen, says so, and a second
//   code is in the kept emails; the newest code works (M24). Scripts on and off.
// - Every password field has "Show" with scripts on (L9), and none is drawn with them off.
// - Ten wrong passwords show "15 minutes" and the hint, with the address kept in its box
//   after every wrong try, and "Forgot your password?" gets the person in, on a screen
//   titled "Choose a new password" (M28). Walked at the same time for an address with an
//   account and one without, whose screens must read the same, word for word, but for the
//   address (T-68).
// - Before the code, an address with an account and one without see the same screens:
//   the code screen and "Send a new code" too (T-68).
// - With Google not set up, neither screen shows "Continue with Google" (M27).
// - A person who starts on a league's schedule, forgets the password and chooses a new one
//   is back on the schedule; the forgotten-password screen has a way back to sign in (L10).
// - Signing out from a league page leaves them on it with "You are signed out." (R-30),
//   scripts on and off; from the admin it is the sign-in screen, saying so (U-15).
// - The device list says which device is this one and gives times in the phone's own time
//   ("today at 8:41 PM" with the phone's clock in Chicago); "Sign out everywhere" asks
//   first, "No" keeps everyone signed in, "Yes" says what it did (M26, M30).
// - `/signin` and `/signup` tell a signed-in person that they are; `/account/confirm` and
//   `/account/inbox` send a signed-out person to sign in; Back after the account is made
//   does not show "Choose your password" again (L10).
// - No page's address ever holds an address, a code or a password, and the server prints
//   none of them.
// The accessibility checks (T-186) run on every screen, and nothing scrolls sideways.
// `--no-build` serves the build here; `--pictures` also saves each screen at 390 and 1280 in
// .local/shots (390/ and 1280/, names starting `signin-says-`).
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  openStaffMenu,
  startNext,
  waitFor,
  whatWentWrong,
} from './web-browser-kit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pictures = process.argv.includes('--pictures');

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
const address = (who) => `${who}-${run}@example.test`;
const chosen = 'a made-up chosen password';
const renewed = 'a made-up new password';
/** Everything a page's address must never hold. */
const secrets = new Set([chosen, renewed]);
const addresses = new Set();
const visited = [];

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}
if (!built) {
  console.error(`Sign-in says browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

const origin = `http://localhost:${await freePort()}`;
// LOG_LEVEL debug: every line the server would ever log, so the check of its output below
// looks at the most it can say. GOOGLE_SIGN_IN is left out: Google is not set up here.
const server = startNext(['start', '--port', new URL(origin).port], {
  APP_ENV: 'test',
  PUBLIC_BASE_URL: origin,
  LOG_LEVEL: 'debug',
});
let browser = null;
await step('starting the server and the browser', async () => {
  await waitFor(`${origin}/`, server, [{ address: '/signin/kept-emails' }]);
  browser = await launch();
});
if (browser === null) {
  server.child.kill();
  console.error(`Sign-in says browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

/** A phone: 390 wide, its clock in Chicago, scripts on or off. */
async function phone({ scripts = true } = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    timezoneId: 'America/Chicago',
    javaScriptEnabled: scripts,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) visited.push(frame.url());
  });
  return { context, page };
}

const pathOf = (page) => {
  const url = new URL(page.url());
  return url.pathname + url.search;
};
const mainText = async (page) => (await page.locator('main').first().innerText()).trim();
const said = (page, words) => page.locator('main').getByText(words, { exact: true });

async function screenChecks(page, label) {
  const problems = await accessibilityProblems(page);
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  note(`nothing scrolls sideways at 390: ${label}`, !wide);
  if (pictures) {
    const name = `signin-says-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
    for (const width of [390, 1280]) {
      mkdirSync(path.join(root, '.local', 'shots', String(width)), { recursive: true });
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await page.screenshot({
        path: path.join(root, '.local', 'shots', String(width), `${name}.jpg`),
        fullPage: true,
        quality: 80,
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
  }
}

/** Taps `target` and waits for the page it leads to, scripts on or off. */
async function tap(page, target, landed) {
  await Promise.all([page.waitForURL(landed), target.tap()]);
  await page.locator('main').first().waitFor();
}
const button = (page, name) => page.getByRole('button', { name, exact: true });
const link = (page, name) => page.getByRole('link', { name, exact: true });
const atPath = (wanted) => (url) => url.pathname === wanted;
/** The code screen after "Send a new code": its address differs from the one before. */
const sentAgain = (url) =>
  url.pathname === '/signup/code' && url.searchParams.get('notice') === 'codeSentAgain';

/** The newest code to `to`, and how many codes it was sent, read on the kept emails' page. */
async function keptCodes(context, to) {
  const reader = await context.newPage();
  try {
    for (let tries = 0; tries < 10; tries += 1) {
      await reader.goto(`${origin}/signin/kept-emails`);
      const emails = reader.locator(`li[data-kept-email="${to}"]`);
      const count = await emails.count();
      if (count > 0) {
        const code = (await emails.first().locator('code[data-code]').innerText()).trim();
        if (/^\d{6}$/.test(code)) return { code, count };
      }
    }
    return { code: '', count: 0 };
  } finally {
    await reader.close();
  }
}

/** Waits for the kept emails to `to` to number at least `count`, then reads them. */
async function keptCodesAtLeast(context, to, count) {
  let kept = { code: '', count: 0 };
  for (let tries = 0; tries < 10 && kept.count < count; tries += 1) {
    kept = await keptCodes(context, to);
  }
  return kept;
}

/** Types `email` on the first screen of sign-up (or forgotten password) and asks for a code. */
async function askForCode(page, email) {
  await page.getByLabel('Email').fill(email);
  await tap(page, button(page, 'Email me a code'), atPath('/signup/code'));
}

async function enterCode(page, code) {
  await page.getByLabel('Code').fill(code);
  await tap(page, button(page, 'Continue'), atPath('/signup/password'));
}

/** Signs `email` up the whole way through; leaves the page on the account page. */
async function signUp(context, page, email) {
  addresses.add(email);
  await page.goto(`${origin}/signup`);
  await askForCode(page, email);
  const { code } = await keptCodes(context, email);
  secrets.add(code);
  await enterCode(page, code);
  await page.getByLabel('Password').fill(chosen);
  await tap(page, button(page, 'Save and sign in'), atPath('/account'));
}

async function signIn(page, email, password) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await tap(page, button(page, 'Sign in'), (url) => url.pathname !== '/signin');
}

/** The slip, "Change it" and "Send a new code" walk, with scripts on or off (M24). */
async function slipWalk(scripts) {
  const label = scripts ? 'scripts on' : 'scripts off';
  const { context, page } = await phone({ scripts });
  try {
    const right = address(`pat-${scripts ? 'on' : 'off'}`);
    const slip = right.replace('example.test', 'exmaple.test');
    addresses.add(right);
    addresses.add(slip);
    await page.goto(`${origin}/signup`);
    await askForCode(page, slip);
    note(
      `the code screen names the address typed, slip and all (${label})`,
      (await said(page, `We sent a 6-digit code to ${slip}. It works for 10 minutes.`).count()) ===
        1,
      await mainText(page),
    );
    if (scripts) await screenChecks(page, 'code screen');
    await tap(page, link(page, 'Change it'), atPath('/signup'));
    note(
      `"Change it" goes back with the address in its box, to be corrected (${label})`,
      (await page.getByLabel('Email').inputValue()) === slip,
    );
    await askForCode(page, right);
    note(
      `the corrected address is the one on the code screen (${label})`,
      (await said(page, `We sent a 6-digit code to ${right}. It works for 10 minutes.`).count()) ===
        1,
    );
    const first = await keptCodes(context, right);
    await tap(page, button(page, 'Send a new code'), sentAgain);
    note(
      `"Send a new code" stays on the code screen and says so (${label})`,
      (await page.locator('main [role=status]').innerText()).trim() ===
        `We sent a new code to ${right}. Use the newest one.`,
      await mainText(page),
    );
    if (scripts) await screenChecks(page, 'code screen new code sent');
    const second = await keptCodesAtLeast(context, right, 2);
    note(
      `a second code is in the kept emails (${label})`,
      second.count === 2 && first.count === 1,
      `${first.count} then ${second.count}`,
    );
    secrets.add(first.code);
    secrets.add(second.code);
    await enterCode(page, second.code);
    note(
      `a new address is not told it already has an account (${label})`,
      (await page.getByText('You already have an account.').count()) === 0,
    );
    const show = page.locator('[data-show-password]');
    if (scripts) {
      await screenChecks(page, 'choose your password');
      await page.getByLabel('Password').fill(chosen);
      await show.tap();
      note(
        '"Show" shows the password typed, and then reads "Hide" (L9)',
        (await page.getByLabel('Password').getAttribute('type')) === 'text' &&
          (await show.innerText()).trim() === 'Hide',
      );
      await show.tap();
      note(
        '"Hide" hides it again',
        (await page.getByLabel('Password').getAttribute('type')) === 'password',
      );
    } else {
      note(
        'with scripts off no "Show" is drawn, since it could do nothing',
        (await show.count()) === 0,
      );
      await page.getByLabel('Password').fill(chosen);
    }
    await tap(page, button(page, 'Save and sign in'), atPath('/account'));
    note(
      `signed up, on the account page (${label})`,
      (await page.getByText(`Signed in as ${right}`).count()) === 1,
    );
    // L10: Back after the account is made does not offer "Choose your password" again.
    await page.goBack();
    await page.locator('main').first().waitFor();
    note(
      `Back after the account is made does not show "Choose your password" again (${label})`,
      (await page.getByRole('heading', { name: 'Choose your password' }).count()) === 0,
      pathOf(page),
    );
    return right;
  } finally {
    await context.close();
  }
}

/**
 * Ten wrong passwords for `email`, then "Forgot your password?" all the way in when
 * `getsIn`. With scripts off, so that each answer is a page of its own. Returns the words
 * of each screen, the address put as "<address>", to compare (T-68).
 */
async function lockOutWalk(email, getsIn) {
  const { context, page } = await phone({ scripts: false });
  const screens = [];
  const keep = async () =>
    screens.push(
      (await mainText(page)).replaceAll(email, '<address>').replace(/\d+ seconds/, 'N seconds'),
    );
  const alertText = async () => (await page.locator('main [role=alert]').innerText()).trim();
  /** One try: the page it answers with is a new page (scripts off). */
  const tryPassword = async (password) => {
    await page.getByLabel('Password').fill(password);
    await Promise.all([page.waitForEvent('load'), button(page, 'Sign in').tap()]);
    return alertText();
  };
  try {
    // From the league's schedule, as a person who means to come back to it.
    await page.goto(`${origin}/north-valley/schedule`);
    await page.locator('.site-header .site-menu > summary').tap();
    await tap(page, link(page, 'Sign in or create an account'), atPath('/signin'));
    await page.getByLabel('Email').fill(email);
    let wrong = 0;
    let kept = true;
    let slowed = '';
    while (wrong < 10) {
      const answer = await tryPassword(`wrong password ${wrong + 1}`);
      kept &&= (await page.getByLabel('Email').inputValue()) === email;
      if (answer === 'Wrong email or password.') wrong += 1;
      else if (slowed === '') {
        slowed = answer;
        await keep();
      } else throw new Error(`try ${wrong + 1} answered "${answer}"`);
      // From the fifth wrong try, each try waits 30 seconds (T-225). Straight after the
      // fifth, one try is made at once to see that wait said.
      if (wrong >= 5 && wrong < 10 && !(wrong === 5 && slowed === '')) {
        await page.waitForTimeout(30_500);
      }
    }
    // Locked now: even the right password waits.
    const alert = await tryPassword(getsIn ? chosen : 'any password at all');
    await keep();
    if (getsIn) {
      note('after every wrong try the address is still in its box (M28)', kept);
      note(
        'from the fifth wrong try, the wait is said in seconds with the way in that does not wait',
        /^Too many tries\. Please wait \d+ seconds, or tap "Forgot your password\?" to choose a new one now\.$/.test(
          slowed,
        ),
        slowed,
      );
      note(
        'ten wrong passwords show "15 minutes" and the hint (M28)',
        alert ===
          'Too many tries. Please wait 15 minutes, or tap "Forgot your password?" to choose a new one now.',
        alert,
      );
      await screenChecks(page, 'locked out');
    }
    await tap(page, link(page, 'Forgot your password?'), atPath('/signin/forgot'));
    await keep();
    if (getsIn) {
      note(
        'the forgotten-password screen is titled "Choose a new password", with the address filled in',
        (await page.getByRole('heading', { level: 1, name: 'Choose a new password' }).count()) ===
          1 && (await page.getByLabel('Email').inputValue()) === email,
      );
      note(
        'the forgotten-password screen has a way back to sign in, to the same page (L10)',
        (await link(page, 'Back to sign in').getAttribute('href')) ===
          '/signin?next=%2Fnorth-valley%2Fschedule',
      );
      await screenChecks(page, 'forgotten password');
    }
    await tap(page, button(page, 'Email me a code'), atPath('/signup/code'));
    await keep();
    if (getsIn) {
      note(
        'the code screen says where the code went, as "If … has an account"',
        (await said(
          page,
          `If ${email} has an account, we sent it a code. It works for 10 minutes.`,
        ).count()) === 1,
        await mainText(page),
      );
      await screenChecks(page, 'code screen forgotten password');
    }
    await tap(page, button(page, 'Send a new code'), sentAgain);
    await keep();
    if (!getsIn) return screens;
    const { code } = await keptCodesAtLeast(context, email, 3);
    secrets.add(code);
    await enterCode(page, code);
    note(
      'after the code, the password screen is "Choose a new password"',
      (await page.getByRole('heading', { level: 1, name: 'Choose a new password' }).count()) === 1,
    );
    await screenChecks(page, 'choose a new password');
    await page.getByLabel('Password').fill(renewed);
    await tap(page, button(page, 'Save and sign in'), (url) => url.pathname !== '/signup/password');
    note(
      '"Forgot your password?" gets a locked-out person in, back on the schedule they started on',
      pathOf(page) === '/north-valley/schedule',
      pathOf(page),
    );
    return screens;
  } finally {
    await context.close();
  }
}

// ---- The walks -------------------------------------------------------------------------------

// The lock-out takes two and a half minutes of waiting (T-225), so it is walked beside the rest.
const locked = address('locked');
const nobody = address('nobody');
addresses.add(nobody);
const lockOut = (async () => {
  await step('setting up an account to lock out', async () => {
    const { context, page } = await phone();
    try {
      await signUp(context, page, locked);
    } finally {
      await context.close();
    }
  });
  let withAccount = [];
  let without = [];
  await step('ten wrong passwords, then "Forgot your password?"', async () => {
    [withAccount, without] = await Promise.all([
      lockOutWalk(locked, true),
      lockOutWalk(nobody, false),
    ]);
  });
  note(
    'locked out, an address with an account and one without read the same screens (T-68)',
    withAccount.length > 0 && JSON.stringify(withAccount) === JSON.stringify(without),
    JSON.stringify({ withAccount, without }),
  );
})();

let signedUp = '';
await step(
  'a slip in the address is seen and changed; a new code is sent (scripts on)',
  async () => {
    signedUp = await slipWalk(true);
  },
);
await step(
  'a slip in the address is seen and changed; a new code is sent (scripts off)',
  async () => {
    await slipWalk(false);
  },
);

await step(
  'before the code, an address with an account and one without see the same screens (T-68)',
  async () => {
    const texts = [];
    for (const email of [signedUp, address('new')]) {
      addresses.add(email);
      const { page } = await phone();
      const seen = [];
      await page.goto(`${origin}/signup`);
      seen.push(await mainText(page));
      await askForCode(page, email);
      seen.push((await mainText(page)).replaceAll(email, '<address>'));
      await tap(page, button(page, 'Send a new code'), sentAgain);
      seen.push((await mainText(page)).replaceAll(email, '<address>'));
      texts.push(seen);
      await page.context().close();
    }
    note(
      'sign-up, the code screen and "Send a new code" read the same for both',
      JSON.stringify(texts[0]) === JSON.stringify(texts[1]),
      JSON.stringify(texts),
    );
  },
);

await step('with Google not set up, neither screen shows its button (M27)', async () => {
  const { context, page } = await phone();
  try {
    for (const screen of ['/signin', '/signup']) {
      await page.goto(`${origin}${screen}`);
      note(
        `${screen} shows no "Continue with Google"`,
        (await page.getByText('Continue with Google').count()) === 0,
      );
    }
    await screenChecks(page, 'create your account');
    await page.goto(`${origin}/signin`);
    await screenChecks(page, 'sign in');
  } finally {
    await context.close();
  }
});

await step('signing out from a league page leaves the person on it, saying so (R-30)', async () => {
  for (const scripts of [true, false]) {
    const label = scripts ? 'scripts on' : 'scripts off';
    const { context, page } = await phone({ scripts });
    try {
      await page.goto(`${origin}/north-valley/standings`);
      await page.locator('.site-header .site-menu > summary').tap();
      await tap(page, link(page, 'Sign in or create an account'), atPath('/signin'));
      // One wrong try first: the address stays in its box (M28).
      await page.getByLabel('Email').fill(signedUp);
      await page.getByLabel('Password').fill('not the password');
      await tap(page, button(page, 'Sign in'), (url) => url.searchParams.has('problem'));
      note(
        `after a wrong password the address typed is still in its box (${label})`,
        (await page.getByLabel('Email').inputValue()) === signedUp &&
          (await page.locator('main [role=alert]').innerText()).trim() ===
            'Wrong email or password.',
      );
      await signIn(page, signedUp, chosen);
      note(
        `signed in, back on the standings (${label})`,
        pathOf(page) === '/north-valley/standings',
      );
      await page.locator('.site-header .site-menu > summary').tap();
      await tap(
        page,
        page.locator('.site-menu-panel').getByRole('button', { name: 'Sign out', exact: true }),
        (url) => url.searchParams.get('notice') === 'signedOut',
      );
      const session = (await context.cookies()).find((c) => c.name === 'srl_session');
      note(
        `signed out, still on the standings, told "You are signed out." (${label})`,
        new URL(page.url()).pathname === '/north-valley/standings' &&
          (await page.getByText('You are signed out.', { exact: true }).count()) === 1 &&
          !session?.value,
        page.url(),
      );
      if (scripts) await screenChecks(page, 'signed out on a league page');
      // Signed in again, the same address does not say it.
      await page.goto(`${origin}/signin?next=${encodeURIComponent(pathOf(page))}`);
      await signIn(page, signedUp, chosen);
      note(
        `signed in again at the same address, nobody is told they are signed out (${label})`,
        (await page.getByText('You are signed out.', { exact: true }).count()) === 0,
        page.url(),
      );
    } finally {
      await context.close();
    }
  }
});

await step(
  "the device list says which is this device and the time in the phone's own time (M26)",
  async () => {
    const { context, page } = await phone();
    try {
      await page.goto(`${origin}/signin`);
      await signIn(page, signedUp, chosen);
      await page.goto(`${origin}/account`);
      const mine = page.locator('li[data-this-device]');
      await mine.locator('time[data-local-time]').first().waitFor();
      const first = page
        .locator('main li')
        .filter({ has: page.locator('time') })
        .first();
      const hour = new Intl.DateTimeFormat('en', {
        timeZone: 'America/Chicago',
        hour: 'numeric',
      })
        .formatToParts(new Date())
        .find((p) => p.type === 'hour')?.value;
      // The page fills the local time in as its script runs.
      await page.waitForFunction(() =>
        [...document.querySelectorAll('li[data-this-device] time')].every((t) =>
          t.textContent.startsWith('today at'),
        ),
      );
      const signedInLine = (await mine.innerText())
        .split('\n')
        .find((l) => l.startsWith('Signed in '));
      note(
        'this device is listed first and said to be this device',
        (await first.getAttribute('data-this-device')) === '' &&
          (await mine.innerText()).includes('This device'),
      );
      note(
        "its time is in the phone's own time, today, at the hour of the phone's clock",
        new RegExp(`^Signed in today at ${hour}:\\d\\d [AP]M$`).test(signedInLine ?? ''),
        signedInLine,
      );
      await screenChecks(page, 'account');
      // "Sign out everywhere" asks first; "No" keeps the person signed in.
      await tap(
        page,
        link(page, 'Sign out everywhere'),
        (url) => url.searchParams.get('ask') === 'signOutEverywhere',
      );
      note(
        '"Sign out everywhere" asks first',
        (await page
          .getByText('Sign out every device that uses your account, this one too?')
          .count()) === 1,
      );
      await screenChecks(page, 'sign out everywhere asked');
      await tap(
        page,
        link(page, 'No, keep them signed in'),
        (url) => url.pathname === '/account' && url.search === '',
      );
      note(
        '"No, keep them signed in" keeps the person signed in',
        !!(await context.cookies()).find((c) => c.name === 'srl_session')?.value &&
          (await page.getByText(`Signed in as ${signedUp}`).count()) === 1,
      );
      await tap(page, link(page, 'Sign out everywhere'), (url) => url.searchParams.has('ask'));
      await tap(page, button(page, 'Yes, sign out everywhere'), atPath('/'));
      note(
        '"Yes" signs out everywhere and says so on the front page',
        (await page
          .getByText('You are signed out on every device that used your account.')
          .count()) === 1 &&
          !(await context.cookies()).find((c) => c.name === 'srl_session')?.value,
        await mainText(page),
      );
    } finally {
      await context.close();
    }
  },
);

await step(
  '/signin and /signup tell a signed-in person; /account/confirm and /inbox ask a visitor to sign in (L10)',
  async () => {
    const { context, page } = await phone();
    try {
      for (const [at, next] of [
        ['/account/confirm?next=%2Faccount', '/account/confirm?next=%2Faccount'],
        ['/account/inbox', '/account/inbox'],
      ]) {
        await page.goto(`${origin}${at}`);
        const url = new URL(page.url());
        note(
          `a signed-out person at ${at} is sent to sign in, to come back`,
          url.pathname === '/signin' && url.searchParams.get('next') === next,
          page.url(),
        );
      }
      await signIn(page, signedUp, chosen);
      note('signed in from /account/inbox, back on it', pathOf(page) === '/account/inbox');
      for (const at of ['/signin', '/signup']) {
        await page.goto(`${origin}${at}?next=%2Fnorth-valley`);
        note(
          `${at} tells a signed-in person they are, with the way on`,
          (await page
            .getByRole('heading', { level: 1, name: 'You are already signed in' })
            .count()) === 1 &&
            (await page.getByText(`You are signed in as ${signedUp}.`).count()) === 1 &&
            (await link(page, 'Carry on').getAttribute('href')) === '/north-valley' &&
            (await page.getByLabel('Password').count()) === 0,
        );
      }
      await screenChecks(page, 'already signed in');
      await tap(
        page,
        button(page, 'Sign out and use another account'),
        (url) => url.searchParams.get('notice') === 'signedOut',
      );
      note(
        '"Sign out and use another account" is the sign-in screen, saying so',
        new URL(page.url()).pathname === '/signin' &&
          (await page.getByText('You are signed out.', { exact: true }).count()) === 1 &&
          (await page.getByLabel('Password').count()) === 1,
        page.url(),
      );
    } finally {
      await context.close();
    }
  },
);

await step('signing out from the admin is the sign-in screen, saying so (U-15)', async () => {
  const { context, page } = await phone();
  try {
    await page.goto(`${origin}/signin/made-up-people`);
    await tap(
      page,
      button(page, 'Open North Valley League as Olive Owner'),
      atPath('/north-valley/admin'),
    );
    await openStaffMenu(page);
    await tap(
      page,
      page.getByRole('button', { name: 'Sign out', exact: true }).first(),
      atPath('/signin'),
    );
    const url = new URL(page.url());
    note(
      '"Back to North Valley League" there leads to the league\'s home, not the admin again',
      (await link(page, 'Back to North Valley League').getAttribute('href')) === '/north-valley',
    );
    note(
      'signed out from the admin: the sign-in screen says so and comes back to the admin',
      url.searchParams.get('next') === '/north-valley/admin' &&
        (await page.getByText('You are signed out.', { exact: true }).count()) === 1,
      page.url(),
    );
  } finally {
    await context.close();
  }
});

await lockOut;
await browser.close();
server.child.kill();

const output = server.output();
for (const value of [...secrets, ...addresses]) {
  if (value && output.includes(value)) failures.push(`the server printed "${value}"`);
}
note('the server printed no code, password or address', true);
const leaked = visited.filter((url) => {
  const plain = decodeURIComponent(url);
  return plain.includes('@') || [...secrets].some((secret) => secret && plain.includes(secret));
});
note(
  "no page's address held an email address, a code or a password",
  leaked.length === 0,
  leaked.join(', '),
);

if (failures.length > 0) {
  console.error(`Sign-in says browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Sign-in says browser test passed (${checked.length} checks).`);
