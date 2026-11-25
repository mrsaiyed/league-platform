// Step 2.96: the emails kept on this computer, read on their local page, and "be this made-up
// person", in a real browser on the web app's made-up data (APP_ENV=test). Nothing leaves
// this computer; every address is made up and ends in .test.
//
// On the made-up stand-in (the world in memory):
// - a NEW address signs up by reading its code on /signin/kept-emails and lands signed in;
// - an invitation link in a kept email is followed. No screen or command sends an
//   invitation on the stand-in (its invitations are not built there), so the test's own
//   set-up writes one kept email holding an invitation link to the kept emails' folder,
//   as the capture writes them, and the page shows the link and it is followed;
// - "be this made-up person" as North Valley's owner opens North Valley's admin;
// - the server's output holds no code, no new address and no invitation token (T4 §10).
// On the made-up database (LOCAL_DATA=made-up-database):
// - a seed league's owner, who has no password, signs up by asking for a code, reads it on
//   the kept emails' page and opens their league's admin; "be this made-up person" lists
//   the seed's people.
// The accessibility checks (T-186) run on both pages. `--no-build` serves the build here.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
// Where the server keeps its emails: the working folder's .local/captured-email.
const keptFolder = path.join(root, '.local', 'captured-email');

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
const newAddress = `new-person-${run}@example.test`;
const chosenPassword = 'a made-up chosen password';
const invitationToken = `made-up-invitation-${run}`;

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}

/** Starts the built app on made-up data, and a browser; null when either did not start. */
async function serve(label, env) {
  const origin = `http://localhost:${await freePort()}`;
  // LOG_LEVEL debug: every line the server would ever log, so the check of its output
  // below looks at the most it can say.
  const server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
    LOG_LEVEL: 'debug',
    ...env,
  });
  let browser = null;
  await step(`starting the server ${label} and the browser`, async () => {
    await waitFor(`${origin}/`, server, [
      { address: '/signin/kept-emails' },
      { address: '/signin/made-up-people' },
    ]);
    browser = await launch();
  });
  return { origin, server, browser };
}

async function fresh(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  return { context, page };
}

async function accessible(page, label) {
  const problems = await accessibilityProblems(page);
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
}

/** The code in the newest kept email to `address`, read on the kept emails' page. */
async function codeOnThePage(page, origin, address) {
  await page.goto(`${origin}/signin/kept-emails`);
  const email = page.locator(`li[data-kept-email="${address}"]`).first();
  await email.waitFor();
  return (await email.locator('code[data-code]').innerText()).trim();
}

/** Signs `address` up through the screens, with its code read on the kept emails' page. */
async function signUpByTheKeptCode(page, origin, address) {
  await page.goto(`${origin}/signup`);
  await page.getByLabel('Email').fill(address);
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/signup/code'),
    page.getByRole('button', { name: 'Email me a code' }).click(),
  ]);
  // The code email is handed over without waiting: the page is read once it is there.
  let code = '';
  for (let tries = 0; tries < 10 && !/^\d{6}$/.test(code); tries += 1) {
    code = await codeOnThePage(page, origin, address).catch(() => '');
  }
  note(`a 6-digit code for ${address} is on the kept emails' page`, /^\d{6}$/.test(code), code);
  await page.goto(`${origin}/signup/code`);
  await page.getByLabel('Code').fill(code);
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/signup/password'),
    page.getByRole('button', { name: 'Continue' }).click(),
  ]);
  await page.getByLabel('Password').fill(chosenPassword);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/signup/password'),
    page.getByRole('button', { name: 'Save and sign in' }).click(),
  ]);
  // The one name screen a new account meets (step 2.128).
  await answerNameScreen(page, 'Made-up', 'Signer');
  return code;
}

// ---- On the made-up stand-in -------------------------------------------------------------

const world = built ? await serve('on the made-up stand-in', {}) : null;
let worldCode = '';

if (world?.browser) {
  const { origin, browser } = world;

  await step('a new address signs up by reading its code on the local page', async () => {
    const { context, page } = await fresh(browser);
    try {
      worldCode = await signUpByTheKeptCode(page, origin, newAddress);
      note(
        'the new address lands on its account page, signed in',
        new URL(page.url()).pathname === '/account' &&
          (await page.getByText(`Signed in as ${newAddress}`).count()) === 1,
        page.url(),
      );
      await page.goto(`${origin}/signin/kept-emails`);
      await page.getByRole('heading', { level: 1, name: 'Emails kept on this computer' }).waitFor();
      await accessible(page, "the kept emails' page");
    } finally {
      await context.close();
    }
  });

  await step('an invitation link in a kept email is followed from the page', async () => {
    // The test's own set-up: one kept email, written as the capture writes them.
    const at = new Date().toISOString();
    const id = `captured-${run}-invitation`;
    const link = `${origin}/north-valley/invitation/${invitationToken}`;
    mkdirSync(keptFolder, { recursive: true });
    writeFileSync(
      path.join(keptFolder, `${at.replace(/[:.]/g, '-')}-${id}.json`),
      `${JSON.stringify(
        {
          from: 'SR Leagues <hello@example.test>',
          to: `invited-${run}@example.test`,
          subject: 'You are invited to help run North Valley League',
          html: '<p>made up</p>',
          text: `You have been invited to help run North Valley League as Scorekeeper.\n\nAccept the invitation: ${link}\n`,
          idempotencyKey: id,
          id,
          capturedAt: at,
        },
        null,
        2,
      )}\n`,
    );
    const { context, page } = await fresh(browser);
    try {
      await page.goto(`${origin}/signin/kept-emails`);
      const email = page.locator(`li[data-kept-email="invited-${run}@example.test"]`).first();
      await email.waitFor();
      const shown = email.locator('a[data-kept-link]').first();
      note('the page shows the invitation link', (await shown.getAttribute('href')) === link);
      const [response] = await Promise.all([
        page.waitForResponse((r) => new URL(r.url()).pathname.includes('/invitation/')),
        shown.click(),
      ]);
      // Since step 2.97 the link holds its token in a cookie and forwards to the accept
      // page, whose address holds no secret (record 086).
      await page.waitForURL((url) => url.pathname === '/north-valley/invitation');
      await page.locator('main').first().waitFor();
      note(
        'following it opens the invitation page, which answers',
        response.status() < 500 && (await page.locator('h1').count()) === 1,
        String(response.status()),
      );
    } finally {
      await context.close();
    }
  });

  await step('"be this made-up person" as the owner opens the league\'s admin', async () => {
    const { context, page } = await fresh(browser);
    try {
      await page.goto(`${origin}/signin/made-up-people`);
      await page.getByRole('heading', { level: 1, name: 'Be a made-up person' }).waitFor();
      await accessible(page, '"be this made-up person"');
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/north-valley/admin'),
        page.getByRole('button', { name: 'Open North Valley League as Olive Owner' }).click(),
      ]);
      await page.locator('main').first().waitFor();
      note(
        "the owner is on North Valley's admin, with its areas",
        (await page.locator('a[href="/north-valley/admin/teams"]').count()) > 0,
        page.url(),
      );
      await page.goto(`${origin}/account`);
      note(
        'signed in as the made-up owner, by an ordinary session',
        (await page.getByText('Signed in as owner@example.test').count()) === 1,
      );
    } finally {
      await context.close();
    }
  });

  await browser.close();
  world.server.child.kill();
  const output = world.server.output();
  note('the server printed no code', worldCode === '' || !output.includes(worldCode));
  note('the server printed no new address', !output.includes(newAddress));
  note('the server printed no invitation token', !output.includes(invitationToken));
} else {
  world?.server.child.kill();
}

// ---- On the made-up database -------------------------------------------------------------

const seedOwner = 'owner@lakeside.example.test';
const database = built
  ? await serve('on the made-up database', { LOCAL_DATA: 'made-up-database' })
  : null;

if (database?.browser) {
  const { origin, browser } = database;
  let code = '';

  await step(
    "a seed league's owner signs in by the code on the page and opens the admin",
    async () => {
      const { context, page } = await fresh(browser);
      try {
        code = await signUpByTheKeptCode(page, origin, seedOwner);
        await page.goto(`${origin}/account`);
        note(
          "signed in as the seed league's owner",
          (await page.getByText(`Signed in as ${seedOwner}`).count()) === 1,
        );
        const response = await page.goto(`${origin}/lakeside/admin`);
        await page.locator('main').first().waitFor();
        note(
          "the owner opens Lakeside's admin",
          response?.status() === 200 &&
            (await page.locator('a[href^="/lakeside/admin/"]').count()) > 0,
          `${response?.status()} ${page.url()}`,
        );
      } finally {
        await context.close();
      }
    },
  );

  await step('"be this made-up person" lists the seed\'s people', async () => {
    const { context, page } = await fresh(browser);
    try {
      await page.goto(`${origin}/signin/made-up-people`);
      await page.getByRole('heading', { level: 1, name: 'Be a made-up person' }).waitFor();
      note(
        "the seed's owner and admin are listed",
        (await page.locator(`li[data-made-up-person="${seedOwner}"]`).count()) === 1 &&
          (await page.locator('li[data-made-up-person="admin@lakeside.example.test"]').count()) ===
            1,
      );
      await accessible(page, '"be this made-up person" on the made-up database');
    } finally {
      await context.close();
    }
  });

  await browser.close();
  database.server.child.kill();
  note(
    'the made-up database server printed no code',
    code === '' || !database.server.output().includes(code),
  );
} else {
  database?.server.child.kill();
}

if (failures.length > 0) {
  console.error(`Kept emails browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Kept emails browser test passed (${checked.length} checks).`);
