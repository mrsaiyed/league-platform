// Step 2.93's last part: the test copy ("staging") as it starts online, on this computer.
// The built web app is started with APP_ENV=staging and nothing standing in but the world
// outside: the made-up seed database served as a PostgreSQL server on 127.0.0.1
// (serveMadeUpDatabase, reached through `pg` over a postgres:// address) and a fake of
// Supabase Auth served over HTTP on 127.0.0.1 (serveFakeSupabaseAuth), which the real
// sign-in adapter speaks to. Every key is made up; nothing leaves this computer (T-201).
// Builds the app first unless given --no-build.
//
// In a real browser: a new person signs up, confirms by the emailed code and chooses a
// password (the code is read from the fake, which made it: staging captures every email in
// the server's memory, T-140), sees their device on the account page, signs out, and signs
// in again with the password from a second browser; both devices are listed; "Sign out
// everywhere" ends both. The seed league's owner, whose account was made in advance,
// signs up with its address and is the league's admin. The health check answers from the
// database. Every answer says "do not index": a page, an API answer, an error page, a file
// and robots.txt, the header and the page's own mark. The local-only pages and the "be
// this person" action answer exactly as an address that does not exist (status, body and
// every header but the date and the page’s one-time script nonce). Then production mode with the same world: it stops after
// every check, in its sentence, and nothing answers. The server's output (at debug level)
// holds no code, key, password, token or address.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveMadeUpDatabase } from '../../packages/database/index.ts';
import { serveFakeSupabaseAuth } from '../../packages/providers/index.ts';
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
  whatWentWrong,
} from './web-browser-kit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
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
const newcomer = `newcomer-${run}@example.test`;
const seedOwner = 'owner@lakeside.example.test';
const chosenPassword = `a made-up chosen password ${run}`;
/** Every code the fake made, to look for in the server's output afterwards. */
const codesSeen = [];

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}

const served = await serveMadeUpDatabase({ underWay: true });
const auth = await serveFakeSupabaseAuth({ secretKey });

/** The test copy's settings: what an online one has, pointed at this computer's fakes. */
const deployed = (appEnv, origin) => ({
  APP_ENV: appEnv,
  PUBLIC_BASE_URL: origin,
  LOG_LEVEL: 'debug',
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
  RESEND_API_KEY: appEnv === 'production' ? `made-up-resend-key-${run}` : '',
  // Production refuses to start without the bot check's two keys (record 081); staging
  // without them switches the check off and says so in one line. Made up, never used.
  TURNSTILE_SITE_KEY: appEnv === 'production' ? 'made-up-site-key' : '',
  TURNSTILE_SECRET_KEY: appEnv === 'production' ? `made-up-turnstile-secret-${run}` : '',
  DATABASE_URL: '',
});

const port = await freePort();
const origin = `http://localhost:${port}`;
const server = built
  ? startNext(
      ['start', '--port', String(port), '--hostname', '127.0.0.1'],
      deployed('staging', origin),
    )
  : null;
let browser = null;
if (server !== null) {
  await step('starting the test copy on the served database and the browser', async () => {
    await waitFor(`${origin}/`, server, [{ address: '/lakeside' }, { address: '/signup' }]);
    browser = await launch();
  });
}

async function accessible(page, label) {
  const problems = await accessibilityProblems(page);
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
}

/** Signs `address` up through the screens, with the code the fake made for it. */
async function signUp(page, address) {
  await page.goto(`${origin}/signup`);
  await page.getByLabel('Email').fill(address);
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/signup/code'),
    page.getByRole('button', { name: 'Email me a code' }).click(),
  ]);
  const code = auth.codeFor(address) ?? '';
  codesSeen.push(code);
  note(`a 6-digit code was made for ${address} by the sign-in service`, /^\d{6}$/.test(code));
  await accessible(page, '/signup/code');
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
}

/** The devices the account page lists, and which one is this. */
async function devicesListed(page) {
  await page.goto(`${origin}/account`);
  await page.getByRole('heading', { name: 'Your account' }).waitFor();
  const items = page.locator('main.account > ul').last().locator('li');
  const texts = await items.allInnerTexts();
  return { count: texts.length, current: texts.filter((t) => t.includes('This device')).length };
}

if (browser !== null) {
  await step('the health check answers from the database', async () => {
    const answer = await fetch(`${origin}/api/v1/health`);
    const body = await answer.json();
    note('/api/v1/health is 200', answer.status === 200, String(answer.status));
    note(
      'its checks: started, and the database answers',
      body.checks?.startup === 'ok' && body.checks?.database === 'ok',
      JSON.stringify(body.checks),
    );
  });

  await step('a new person signs up by the code, and in again by the password', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await signUp(page, newcomer);
      const first = await devicesListed(page);
      await accessible(page, '/account');
      note(
        'after signing up, the account page lists this one device',
        first.count === 1 && first.current === 1,
        JSON.stringify(first),
      );
      note(
        'it says who is signed in',
        (await page.locator('.account-who').innerText()).includes(newcomer),
      );
      // Sign out: the account page then sends them to sign in.
      await Promise.all([
        page.waitForURL((url) => url.pathname !== '/account'),
        page.getByRole('button', { name: 'Sign out', exact: true }).click(),
      ]);
      await page.goto(`${origin}/account`);
      note(
        'after signing out, /account sends them to sign in',
        new URL(page.url()).pathname === '/signin',
      );
      // A wrong password, then the right one.
      await page.getByLabel('Email').fill(newcomer);
      await page.getByLabel('Password').fill('not the made-up password');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.getByRole('alert').first().waitFor();
      note(
        'a wrong password is refused on the sign-in page',
        new URL(page.url()).pathname === '/signin',
      );
      await page.getByLabel('Password').fill(chosenPassword);
      await Promise.all([
        page.waitForURL((url) => url.pathname !== '/signin'),
        page.getByRole('button', { name: 'Sign in', exact: true }).click(),
      ]);
      const again = await devicesListed(page);
      note(
        'signed in again: one device, this one',
        again.count === 1 && again.current === 1,
        JSON.stringify(again),
      );

      // A second browser signs in too: both are listed, each sees itself as this device.
      const other = await browser.newContext();
      try {
        const second = await other.newPage();
        await second.goto(`${origin}/signin`);
        await second.getByLabel('Email').fill(newcomer);
        await second.getByLabel('Password').fill(chosenPassword);
        await Promise.all([
          second.waitForURL((url) => url.pathname !== '/signin'),
          second.getByRole('button', { name: 'Sign in', exact: true }).click(),
        ]);
        const both = await devicesListed(second);
        note(
          'a second browser: two devices listed, one of them this',
          both.count === 2 && both.current === 1,
          JSON.stringify(both),
        );
        await second.getByRole('button', { name: 'Sign out everywhere' }).click();
        await second.waitForFunction(
          () =>
            location.pathname !== '/account' || !document.body.innerText.includes('Your account'),
        );
        await second.goto(`${origin}/account`);
        note(
          'after "Sign out everywhere", the second browser is signed out',
          new URL(second.url()).pathname === '/signin',
        );
      } finally {
        await other.close();
      }
      await page.goto(`${origin}/account`);
      note('and so is the first', new URL(page.url()).pathname === '/signin');
    } finally {
      await context.close();
    }
  });

  await step(
    'an account made in advance becomes its owner’s when they sign up with its address',
    async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await signUp(page, seedOwner);
        await page.goto(`${origin}/account`);
        await page.getByRole('heading', { name: 'Your leagues' }).waitFor();
        const text = await page.locator('main').innerText();
        note(
          'the seed owner’s account page lists their league',
          text.includes('Lakeside'),
          text.slice(0, 200),
        );
        const admin = await page.goto(`${origin}/lakeside/admin`);
        note(
          'the seed owner opens their league’s admin area',
          admin?.status() === 200,
          String(admin?.status()),
        );
        // A form whose action ends in a redirect (step 2.239): Next.js fetches the new page
        // from the server's own address, not the site's, and that page was "Page not found"
        // here though the person was saved. Added in People, their own record opens.
        await page.goto(`${origin}/lakeside/admin/people`);
        const add = page.locator('#add-person');
        await add.getByLabel('First name').fill('Jon');
        await add.getByLabel('Last name').fill('Smiht');
        await Promise.all([
          page.waitForURL(/\/admin\/people\/[0-9a-f-]{36}/),
          add.getByRole('button', { name: 'Add to the league' }).click(),
        ]);
        const said = await page
          .getByText('Added to the league: Jon Smiht.')
          .waitFor({ timeout: 20_000 })
          .then(() => true)
          .catch(() => false);
        note(
          'a person the owner adds on the database opens on their own record, saying so',
          said && (await page.locator('h1').first().innerText()) === 'Jon Smiht',
          (await page.locator('h1').first().innerText()).slice(0, 80),
        );
      } finally {
        await context.close();
      }
    },
  );

  await step('every answer says "do not index": the header and the page’s own mark', async () => {
    const page = await fetch(`${origin}/lakeside`);
    const html = await page.text();
    const mark = '<meta name="robots" content="noindex, nofollow"/>';
    note(
      'a page: the header',
      page.headers.get('x-robots-tag') === 'noindex',
      String(page.headers.get('x-robots-tag')),
    );
    note('a page: its own mark in its head', html.slice(0, html.indexOf('</head>')).includes(mark));
    for (const [label, address, status] of [
      ['an address no league has', '/no-such-league-anywhere', 404],
      ['a page no league has', '/lakeside/no-such-page/at-all', 404],
    ]) {
      const answer = await fetch(`${origin}${address}`);
      const text = await answer.text();
      note(`an error page (${label}): ${status}`, answer.status === status, String(answer.status));
      note(
        `an error page (${label}): the header`,
        answer.headers.get('x-robots-tag') === 'noindex',
      );
      note(`an error page (${label}): its own mark`, text.includes(mark));
    }
    for (const [label, address] of [
      ['the health check', '/api/v1/health'],
      ['a league API answer', '/api/v1/leagues/not-a-league-id/scoring'],
    ]) {
      const answer = await fetch(`${origin}${address}`);
      note(
        `an API answer (${label}): the header`,
        answer.headers.get('x-robots-tag') === 'noindex',
        `${answer.status} ${answer.headers.get('x-robots-tag')}`,
      );
    }
    const script = /<script src="(\/_next\/static\/[^"]+)"/.exec(html)?.[1];
    note('the page loads a script of its own', script !== undefined);
    for (const file of [script ?? '/_next/static/none.js', '/display.css', '/standalone.css']) {
      const answer = await fetch(`${origin}${file}`);
      note(
        `a file (${file.split('/').at(-1)}): the header`,
        answer.headers.get('x-robots-tag') === 'noindex',
        `${answer.status}`,
      );
    }
    const robots = await fetch(`${origin}/robots.txt`);
    note(
      'robots.txt: every robot, nowhere',
      robots.status === 200 && (await robots.text()) === 'User-agent: *\nDisallow: /\n',
    );
  });

  await step('the local-only pages and "be this person" answer as an unknown address', async () => {
    const unknown = '/signin/no-such-page';
    for (const address of ['/signin/kept-emails', '/signin/made-up-people']) {
      note(`GET ${address} is exactly GET ${unknown}`, ...(await sameAnswer(address, unknown, {})));
    }
    const manifest = JSON.parse(
      readFileSync(path.join(root, 'apps/web/.next/server/server-reference-manifest.json'), 'utf8'),
    );
    const actionId = Object.entries(manifest.node ?? {}).find(
      ([, entry]) => entry.exportedName === 'beMadeUpPersonAction',
    )?.[0];
    note('the built app has the "be this person" action', actionId !== undefined);
    // As the page's own form posts it with no script: the action's id as a field, and the
    // person to be (the control run below shows this very post signs someone in where the
    // tools exist).
    const post = () => actionPost(actionId ?? '', origin);
    note(
      `the posted action at /signin/made-up-people is exactly the same post at ${unknown}`,
      ...(await sameAnswer('/signin/made-up-people', unknown, post)),
    );
  });
}

/** The "be this person" form, posted as the page's form posts it without a script. */
function actionPost(actionId, from) {
  const form = new FormData();
  form.set(`$ACTION_ID_${actionId}`, '');
  form.set('person', seedOwner);
  form.set('next', '/');
  return { method: 'POST', headers: { Origin: from }, body: form };
}

/**
 * Whether two addresses answer alike: the same status, every header but the date, and the
 * same body once each address's last name is put in the same place (and the page's data
 * put in order, settle()). `init` is a request's options, or a function making a fresh one.
 */
async function sameAnswer(address, unknown, init) {
  const ask = async (where) => {
    const response = await fetch(`${origin}${where}`, {
      redirect: 'manual',
      ...(typeof init === 'function' ? init() : init),
    });
    const name = where.split('/').at(-1);
    // Each answer's own script nonce (step 2.98: new for every page, in its policy, its
    // preload links and its scripts) is put in one place too: only it may differ.
    const policy = response.headers.get('content-security-policy') ?? '';
    const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
    const sameNonce = (text) => (nonce === undefined ? text : text.replaceAll(nonce, '<nonce>'));
    const body = sameNonce(await response.text()).replaceAll(name, '<name>');
    const headers = [...response.headers.entries()]
      .filter(([key]) => key !== 'date')
      .map(([key, value]) => [key, sameNonce(value)]);
    return { status: response.status, headers, ...settle(body) };
  };
  const [one, other] = [await ask(address), await ask(unknown)];
  if (one.status !== other.status) return [false, `status ${one.status} / ${other.status}`];
  if (JSON.stringify(one.headers) !== JSON.stringify(other.headers)) {
    return [false, `headers ${JSON.stringify(one.headers)} / ${JSON.stringify(other.headers)}`];
  }
  if (one.markup !== other.markup)
    return [false, `markup ${firstDifference(one.markup, other.markup)}`];
  if (one.rows !== other.rows) return [false, `page data ${firstDifference(one.rows, other.rows)}`];
  return [true, `${one.status}`];
}

/** A page as the browser ends up with it, whatever the timing of the stream (check-web-shell.mjs). */
function settle(body) {
  const pieces = [];
  const markup = body.replace(
    /<script>self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)<\/script>/g,
    (_, piece) => {
      pieces.push(JSON.parse(piece));
      return '';
    },
  );
  const rows = pieces.join('').split('\n').filter(Boolean).sort().join('\n');
  return { markup, rows };
}

function firstDifference(a, b) {
  let at = 0;
  while (at < a.length && a[at] === b[at]) at += 1;
  return `at ${at}: "${a.slice(at, at + 80)}" / "${b.slice(at, at + 80)}"`;
}

/** Stops a web app and waits until it has ended, its connections with it. */
function stopped(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill();
  });
}

await browser?.close();
if (server) await stopped(server.child);

if (server !== null) {
  const output = server.output();
  const secrets = [
    secretKey,
    chosenPassword,
    'made-up-resend-key',
    served.url,
    ...codesSeen.filter(Boolean),
  ];
  for (const secret of secrets) {
    note(
      'the server’s output holds no code, key, password or database address',
      !output.includes(secret),
      secret.slice(0, 12),
    );
  }
  for (const address of [newcomer, seedOwner]) {
    note('the server’s output holds no email address', !output.includes(address));
  }
}

if (built) {
  // The control: the same post, where the tools exist (APP_ENV=test on the made-up
  // database), is the action's and signs the person in, so the "not found" above is the
  // gate's answer and not a post the action never saw.
  await step('the control: the same post signs the person in where the tools exist', async () => {
    const localPort = await freePort();
    const local = `http://localhost:${localPort}`;
    const manifest = JSON.parse(
      readFileSync(path.join(root, 'apps/web/.next/server/server-reference-manifest.json'), 'utf8'),
    );
    const actionId = Object.entries(manifest.node ?? {}).find(
      ([, entry]) => entry.exportedName === 'beMadeUpPersonAction',
    )?.[0];
    const made = startNext(['start', '--port', String(localPort)], {
      APP_ENV: 'test',
      PUBLIC_BASE_URL: local,
      LOCAL_DATA: 'made-up-database',
    });
    try {
      await waitFor(`${local}/`, made);
      const answer = await fetch(`${local}/signin/made-up-people`, {
        ...actionPost(actionId ?? '', local),
        redirect: 'manual',
      });
      note(
        'in test mode the same post signs the seed owner in (on to choose a password)',
        answer.status === 303 && answer.headers.get('location') === '/signup/password',
        `${answer.status} ${answer.headers.get('location')}`,
      );
    } finally {
      await stopped(made.child);
    }
  });

  await step(
    'production with the same world stops after every check, and nothing answers',
    async () => {
      const productionPort = await freePort();
      const production = startNext(
        ['start', '--port', String(productionPort), '--hostname', '127.0.0.1'],
        deployed('production', 'https://leagues.example.test'),
      );
      const code = await new Promise((resolve) => {
        const timer = setTimeout(() => {
          production.child.kill();
          resolve('still running');
        }, 90_000);
        production.child.on('exit', (exitCode) => {
          clearTimeout(timer);
          resolve(exitCode);
        });
      });
      note('production refuses to start', code !== 0 && code !== 'still running', String(code));
      const output = production.output();
      note(
        'with its sentence',
        output.includes('every check passed, but "production" does not serve anyone yet'),
        output.slice(-400),
      );
      note(
        'production’s refusal holds no key',
        !output.includes(secretKey) && !output.includes('made-up-resend-key'),
      );
      const answered = await fetch(`http://127.0.0.1:${productionPort}/`).then(
        () => true,
        () => false,
      );
      note('nothing answers on production’s port', !answered);
    },
  );
}

// Every web app has ended by now; the fakes close last.
await auth.close();
await served.close();

if (failures.length > 0) {
  console.error(`Test copy browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Test copy browser test passed (${checked.length} checks).`);
