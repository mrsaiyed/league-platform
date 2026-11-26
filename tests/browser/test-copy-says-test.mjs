// Step 2.205: the test copy says it is made up, and takes only made-up addresses.
// The built web app is started as test-copy-test.mjs starts it: APP_ENV=staging on the
// made-up seed database served as a PostgreSQL server on 127.0.0.1, with a fake of Supabase
// Auth on 127.0.0.1 that the real sign-in adapter speaks to. Every key is made up; nothing
// leaves this computer (T-201). Builds the app first unless given --no-build.
//
// In a real browser at 390 wide: the one line from the message files stands on a league's
// home page, a team page, sign-in, sign-up, the account page and an admin page, and not on
// the scoring screen. A real-looking address (someone@gmail.com) is refused at sign-up and
// at the forgotten password in the message file's words, and the sign-in fake is never
// asked: it makes no code and is sent no request for one. A made-up address
// (owner@league.test) goes on to the code screen, and the fake is asked once. Pictures of
// the line are written to .local/test-copy-shots/ (git-ignored), for the design review.
// Production refuses to start before anything is drawn (test-copy-test.mjs proves it),
// and local work shows no line (made-up-world-test and the unit tests of SiteFooter).
// "Continue with Google" is not on the test copy's sign-in and sign-up (an account made
// with Google would hold a real address), even with Google set up (GOOGLE_SIGN_IN on, step
// 2.163), and is on them in local work with Google set up (APP_ENV test on the stand-in,
// started after the test copy is stopped). An admin adding a person on the test
// copy is refused a real contact email at that box, nothing saved; a made-up one is saved.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveMadeUpDatabase } from '../../packages/database/index.ts';
import { serveFakeSupabaseAuth } from '../../packages/providers/index.ts';
import { en } from '../../packages/site/index.ts';
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, '.local', 'test-copy-shots');
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
/** Made up, and the fake's only key. */
const secretKey = `made-up-supabase-secret-key-${run}`;
const seedOwner = 'owner@lakeside.example.test';
const madeUp = 'owner@league.test';
const stranger = 'someone@gmail.com';
const phone = { width: 390, height: 844 };

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}

const served = await serveMadeUpDatabase({ underWay: true });
const auth = await serveFakeSupabaseAuth({ secretKey });

const port = await freePort();
const origin = `http://localhost:${port}`;
const server = built
  ? startNext(['start', '--port', String(port), '--hostname', '127.0.0.1'], {
      APP_ENV: 'staging',
      // Set up, so its absence is the test copy's own rule (step 2.163, M27).
      GOOGLE_SIGN_IN: 'on',
      PUBLIC_BASE_URL: origin,
      LOG_LEVEL: 'info',
      TRUSTED_PROXY: 'none',
      PLATFORM_DATABASE_URL: served.url,
      PLATFORM_DATABASE_SSL: 'off',
      SUPABASE_URL: auth.url,
      SUPABASE_SECRET_KEY: secretKey,
      EMAIL_FROM: 'hello@example.test',
      // Never one of these from the shell this runs in ('' counts as not given).
      LOCAL_DATA: '',
      LOCAL_DESIGN: '',
      LOCAL_NOW: '',
      RESEND_API_KEY: '',
      TURNSTILE_SITE_KEY: '',
      TURNSTILE_SECRET_KEY: '',
      DATABASE_URL: '',
    })
  : null;
let browser = null;
if (server !== null) {
  await step('starting the test copy and the browser', async () => {
    await waitFor(`${origin}/`, server, [{ address: '/lakeside' }, { address: '/signup' }]);
    browser = await launch();
    mkdirSync(shots, { recursive: true });
  });
}

/** Every request the sign-in fake has had for a code (sign-up and reset alike). */
const codeRequests = () =>
  auth.callsTo('POST', '/admin/generate_link') +
  auth.callsTo('POST', '/auth/v1/admin/generate_link');

/** The line on `page`: shown once, in the message file's words, and photographed. */
async function lineOn(page, label, shot) {
  const lines = page.locator('[data-test-copy]');
  const count = await lines.count();
  const words = count === 1 ? (await lines.innerText()).trim() : '';
  note(`the line is on ${label}, once`, count === 1, String(count));
  note(`in the message file's words on ${label}`, words === en['footer.testCopy'], words);
  if (count === 1) {
    note(`it is seen on ${label} at 390 wide`, await lines.isVisible());
    const box = await lines.boundingBox();
    note(
      `it fits the width on ${label}`,
      box !== null && box.x >= 0 && box.x + box.width <= phone.width + 0.5,
      JSON.stringify(box),
    );
    await lines.scrollIntoViewIfNeeded();
  }
  await page.screenshot({ path: path.join(shots, `${shot}.png`) });
  const problems = await accessibilityProblems(page);
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
}

/** Asks for a code for `address` on `screen` (/signup or /signin/forgot). */
async function askForCode(page, screen, address) {
  await page.goto(`${origin}${screen}`);
  await page.getByLabel('Email').fill(address);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== screen || url.search !== ''),
    page.getByRole('button', { name: en['signUp.sendCode'] }).click(),
  ]);
}

/** How many "Continue with Google" buttons `page` shows. */
const googleButtons = (page) => page.getByRole('button', { name: en['signIn.google'] }).count();

if (browser !== null) {
  await step('the line on the public pages and the sign-in screens', async () => {
    const context = await browser.newContext({ viewport: phone });
    const page = await context.newPage();
    try {
      await page.goto(`${origin}/lakeside`);
      await lineOn(page, 'the home page', 'home');
      const team = await page.goto(`${origin}/lakeside/teams`);
      note('the teams page answers', team?.status() === 200, String(team?.status()));
      const href = await page
        .locator('main a[href^="/lakeside/teams/"]')
        .first()
        .getAttribute('href');
      await page.goto(`${origin}${href ?? '/lakeside/teams'}`);
      await lineOn(page, `a team page (${href})`, 'team');
      await page.goto(`${origin}/signin`);
      await lineOn(page, 'sign-in', 'signin');
      const form = page.locator('main form').first();
      const [line, field] = await Promise.all([
        page.locator('[data-test-copy]').boundingBox(),
        form.boundingBox(),
      ]);
      note(
        'on sign-in, the line stands above the form',
        line !== null && field !== null && line.y + line.height <= field.y,
      );
      await page.goto(`${origin}/signup`);
      await lineOn(page, 'sign-up', 'signup');
      for (const screen of ['/signin', '/signup']) {
        await page.goto(`${origin}${screen}`);
        note(
          `${screen} on the test copy has no "${en['signIn.google']}"`,
          (await googleButtons(page)) === 0,
        );
      }
    } finally {
      await context.close();
    }
  });

  await step('a real address is refused at sign-up and reset, the fake never asked', async () => {
    const context = await browser.newContext({ viewport: phone });
    const page = await context.newPage();
    try {
      const before = codeRequests();
      for (const screen of ['/signup', '/signin/forgot']) {
        await askForCode(page, screen, stranger);
        const url = new URL(page.url());
        note(
          `${screen} goes back to itself with the refusal`,
          url.pathname === screen && url.searchParams.get('problem') === 'onlyMadeUpAddresses',
          page.url(),
        );
        const said = (await page.getByRole('alert').first().innerText()).trim();
        note(
          `${screen} says it in the message file's words`,
          said === en['problem.onlyMadeUpAddresses'],
          said,
        );
        note(`${screen}: the address is not in the address bar`, !page.url().includes('gmail'));
      }
      await page.screenshot({ path: path.join(shots, 'refused.png') });
      note('the sign-in fake made no code for the stranger', auth.codeFor(stranger) === undefined);
      note(
        'the sign-in fake was asked for no code',
        codeRequests() === before,
        `${before} then ${codeRequests()}`,
      );
      // The control: a made-up address goes through, and the fake is asked once.
      await askForCode(page, '/signup', madeUp);
      note(
        `${madeUp} goes on to the code screen`,
        new URL(page.url()).pathname === '/signup/code',
        page.url(),
      );
      note(`the fake made a code for ${madeUp}`, /^\d{6}$/.test(auth.codeFor(madeUp) ?? ''));
      note('the fake was asked once', codeRequests() === before + 1, String(codeRequests()));
    } finally {
      await context.close();
    }
  });

  await step(
    'the line on the account page and an admin page, not on the scoring screen',
    async () => {
      const context = await browser.newContext({ viewport: phone });
      const page = await context.newPage();
      try {
        await askForCode(page, '/signup', seedOwner);
        await page.getByLabel('Code').fill(auth.codeFor(seedOwner) ?? '');
        await Promise.all([
          page.waitForURL((url) => url.pathname === '/signup/password'),
          page.getByRole('button', { name: 'Continue' }).click(),
        ]);
        await page.getByLabel('Password').fill(`a made-up chosen password ${run}`);
        await Promise.all([
          page.waitForURL((url) => url.pathname !== '/signup/password'),
          page.getByRole('button', { name: 'Save and sign in' }).click(),
        ]);
        // The one name screen a new account meets (step 2.128).
        await answerNameScreen(page, 'Made-up', 'Signer');
        await page.goto(`${origin}/account`);
        await lineOn(page, 'the account page', 'account');
        const admin = await page.goto(`${origin}/lakeside/admin`);
        note('the seed owner opens the admin', admin?.status() === 200, String(admin?.status()));
        await lineOn(page, 'an admin page', 'admin');
        // People: a contact email an admin types must be made up too, at that box.
        await page.goto(`${origin}/lakeside/admin/people`);
        await page.getByRole('link', { name: 'Add a person' }).first().click();
        const add = page.locator('#add-person');
        await add.getByLabel('First name').fill('Nadia');
        await add.getByLabel('Last name').fill('Testcopy');
        await add.getByLabel('Email (optional)').fill(stranger);
        await add.getByRole('button', { name: 'Add to the league' }).click();
        const said = add.locator('[data-wrong="contactEmail"]');
        await said.waitFor();
        note(
          "People: a real contact email is refused at its box in the message file's words",
          (await said.innerText()).trim() === en['problem.onlyMadeUpAddresses'] &&
            (await add.getByLabel('Email (optional)').getAttribute('aria-invalid')) === 'true',
          await said.innerText(),
        );
        note(
          'People: nothing saved, and the other boxes keep what was typed',
          !/\/admin\/people\/[0-9a-f-]{36}/.test(page.url()) &&
            (await add.getByLabel('First name').inputValue()) === 'Nadia' &&
            (await add.getByLabel('Last name').inputValue()) === 'Testcopy' &&
            (await add.getByLabel('Email (optional)').inputValue()) === stranger,
          page.url(),
        );
        // The control: a made-up email is saved.
        await add.getByLabel('Email (optional)').fill('nadia@example.test');
        await Promise.all([
          page.waitForURL(/\/admin\/people\/[0-9a-f-]{36}/),
          add.getByRole('button', { name: 'Add to the league' }).click(),
        ]);
        // Read back from the list (the new record's own page is not checked here).
        await page.goto(`${origin}/lakeside/admin/people`);
        note(
          'People: a made-up contact email is saved',
          (await page.getByRole('link', { name: 'Nadia Testcopy', exact: true }).count()) === 1,
        );
        // A game's scoring address is drawn in the tracker's own frame, whatever it answers.
        await page.goto(`${origin}/lakeside/score/no-such-game`);
        note(
          'the scoring screen has no line and no footer (DESIGN.md section 7)',
          (await page.locator('[data-test-copy], .site-footer').count()) === 0,
        );
      } finally {
        await context.close();
      }
    },
  );
}

/** Stops a started server and waits for it, its connections with it. */
async function stop(started) {
  if (started !== null && started.child.exitCode === null && started.child.signalCode === null) {
    await new Promise((resolve) => {
      started.child.once('exit', resolve);
      started.child.kill();
    });
  }
}
// Before the fakes close.
await stop(server);

if (browser !== null) {
  await step('local work still offers Google on sign-in and sign-up', async () => {
    const localPort = await freePort();
    const local = `http://localhost:${localPort}`;
    const localServer = startNext(['start', '--port', String(localPort)], {
      APP_ENV: 'test',
      // Google is drawn only where it is set up (step 2.163, M27).
      GOOGLE_SIGN_IN: 'on',
      PUBLIC_BASE_URL: local,
    });
    const context = await browser.newContext({ viewport: phone });
    try {
      await waitFor(`${local}/signin`, localServer, [{ address: '/signup' }]);
      const page = await context.newPage();
      for (const screen of ['/signin', '/signup']) {
        await page.goto(`${local}${screen}`);
        note(
          `${screen} in local work has "${en['signIn.google']}"`,
          (await googleButtons(page)) === 1,
        );
        note(
          `${screen} in local work has no test copy line`,
          (await page.locator('[data-test-copy]').count()) === 0,
        );
      }
    } finally {
      await context.close();
      await stop(localServer);
    }
  });
}

await browser?.close();
await auth.close();
await served.close();

if (failures.length > 0) {
  console.error(`Test copy line browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Test copy line browser test passed (${checked.length} checks).`);
