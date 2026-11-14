// Step 2.52: Admin → Schedule in a real browser, on the web app's made-up stand-in
// (APP_ENV=test). Nothing leaves this computer. Scripts are switched OFF in the page, to
// show the grid works as plain forms on a phone-sized screen: the made-up owner builds ten
// games by hand across two rounds; a game booked on top of another is flagged at once and
// fixed by moving it to the other court; nothing is on the public schedule until it is
// published; the grid works by keyboard; every field has a name. `--dev` runs `next dev`
// instead of building.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = path.join(root, 'apps/web');
const nextBin = createRequire(path.join(app, 'package.json')).resolve('next/dist/bin/next');
const madeUp = {
  LOG_LEVEL: 'warn',
  DATABASE_URL: 'postgres://made-up:made-up-password@127.0.0.1:1/nowhere',
  SESSION_SECRET: 'made-up-session-secret-0123456789abcdef',
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SECRET_KEY: 'made-up-supabase-key',
  RESEND_API_KEY: 'made-up-resend-key',
  EMAIL_FROM: 'hello@example.test',
  STRIPE_SECRET_KEY: 'made-up-stripe-key',
  STRIPE_WEBHOOK_SECRET: 'made-up-webhook-key',
};
const member = { email: 'member@example.test', password: 'made-up member password' };
const noAccess = /you do not have access/i;

/** On GitHub the Chromium ci.yml installs; here the Edge Windows already has. */
const launch = () => (process.env.CI ? chromium.launch() : chromium.launch({ channel: 'msedge' }));

function start(args, env) {
  let output = '';
  const child = spawn(process.execPath, [nextBin, ...args], {
    cwd: app,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ...madeUp, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (c) => (output += c));
  child.stderr.on('data', (c) => (output += c));
  return { child, output: () => output };
}
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}
async function waitFor(url, server) {
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    if (server.child.exitCode !== null) throw new Error(`the server stopped:\n${server.output()}`);
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`the server did not answer within 90 seconds:\n${server.output()}`);
}

const dev = process.argv.includes('--dev');
const failures = [];
const note = (ok, label) => {
  if (!ok) failures.push(label);
};
let built = true;
if (!dev && !process.argv.includes('--no-build')) {
  const build = start(['build'], { APP_ENV: 'test' });
  built = (await new Promise((r) => build.child.on('exit', r))) === 0;
  if (!built) failures.push('next build failed');
}

if (built) {
  const port = await freePort();
  const origin = `http://localhost:${port}`;
  const server = start(dev ? ['dev', '--port', String(port)] : ['start', '--port', String(port)], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  let browser;
  try {
    await waitFor(`${origin}/`, server);
    browser = await launch();
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 375, height: 812 },
    });
    await context.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    const address = `${origin}/north-valley/admin/schedule`;
    await page.goto(address);
    note((await page.locator('h1').count()) === 1, 'one level-one heading');
    note((await page.locator('section[data-round]').count()) === 6, 'six rounds are shown');
    const unnamed = await page.$$eval(
      'input:not([type=hidden]), select',
      (els) => els.filter((el) => !el.labels?.[0]?.textContent?.trim()).length,
    );
    note(unnamed === 0, `${unnamed} fields without a label`);
    const narrow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    note(narrow, 'the page scrolls sideways on a phone');

    const round = (n) => page.locator('section[data-round]').nth(n - 1);
    /** Adds a game in a round with the form the grid offers. */
    async function addGame(n, home, away, time, court) {
      const add = round(n).locator('details[data-add-game]');
      await add.locator('summary').click();
      await add.locator('select[name=homeTeamId]').selectOption({ label: home });
      await add.locator('select[name=awayTeamId]').selectOption({ label: away });
      await add.locator('input[name=time]').fill(time);
      await add.locator('select[name=place]').selectOption({ label: `Central Gym: ${court}` });
      await Promise.all([
        page.waitForURL(/done=saved/),
        add.locator('button[type=submit]').click(),
      ]);
    }
    const teams = await page.$$eval(
      'section[data-round] details[data-add-game] select[name=homeTeamId] option',
      (o) => [...new Set(o.map((x) => x.textContent).filter((x) => x && !/Choose/.test(x)))],
    );
    note(teams.length >= 4, `only ${teams.length} teams to choose from`);
    const hour = (i) => `${String(9 + i).padStart(2, '0')}:00`;
    for (let i = 0; i < 6; i += 1) {
      await addGame(
        1,
        teams[(2 * i) % teams.length],
        teams[(2 * i + 1) % teams.length],
        hour(i),
        'Court 1',
      );
    }
    for (let i = 0; i < 4; i += 1) {
      await addGame(
        2,
        teams[(2 * i) % teams.length],
        teams[(2 * i + 1) % teams.length],
        hour(i),
        'Court 1',
      );
    }
    note((await page.locator('li[data-game]').count()) === 10, 'ten games are in the grid');
    note((await page.locator('[data-clashes] li').count()) === 0, 'no clash yet');

    // A game on top of the 09:00 game of round 1: flagged at once.
    await addGame(1, teams[2], teams[3], '09:00', 'Court 1');
    note((await page.locator('[data-clashes] li').count()) > 0, 'the clash is listed');
    note((await page.locator('li[data-clash=yes]').count()) >= 2, 'the clashing games are marked');
    // Fix it: move one of the two games to Court 2.
    const flagged = page.locator('li[data-clash=yes]').last();
    await flagged.locator('summary').first().click();
    await flagged.locator('select[name=place]').selectOption({ label: 'Central Gym: Court 2' });
    await Promise.all([
      page.waitForURL(/done=saved/),
      flagged.locator('form').first().locator('button[type=submit]').first().click(),
    ]);
    note((await page.locator('[data-clashes] li').count()) === 0, 'the clash is gone once fixed');
    note((await page.locator('li[data-clash=yes]').count()) === 0, 'a game is still marked');

    // Rename a round and see it.
    await round(1).locator('summary').first().click();
    await round(1).locator('input[name=label]').fill('Week 5, Rivalry Week');
    await Promise.all([
      page.waitForURL(/done=saved/),
      round(1).locator('form').first().locator('button[type=submit]').click(),
    ]);
    note(
      (await page.locator('h2', { hasText: 'Rivalry Week' }).count()) === 1,
      'the round was not renamed',
    );

    // Nothing is public yet.
    const publicPage = await context.newPage();
    await publicPage.goto(`${origin}/north-valley/schedule`);
    const before = await publicPage.locator('main').innerText();
    note(!before.includes('Rivalry Week'), 'the draft shows on the public schedule');

    // The keyboard opens a section and moves into its fields.
    await page.goto(address);
    await round(2).locator('details[data-add-game] summary').focus();
    await page.keyboard.press('Enter');
    note(
      (await round(2).locator('details[data-add-game]').getAttribute('open')) !== null,
      'Enter does not open a section',
    );
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    note(focused === 'SELECT', `Tab after the section opens lands on ${focused}, not a field`);

    // Publish it: the page then says so.
    await page.goto(address);
    await Promise.all([
      page.waitForURL(/done=published/),
      page.locator('button', { hasText: 'Publish this schedule' }).click(),
    ]);
    note((await page.locator('[data-notice=done]').count()) === 1, 'no word that it was published');
  } catch (error) {
    failures.push(String(error?.message ?? error).split('\n')[0]);
  } finally {
    await browser?.close();
    server.child.kill();
  }
}

if (failures.length > 0) {
  console.error(`Schedule grid browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Schedule grid browser test passed.');
