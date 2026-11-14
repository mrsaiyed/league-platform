// Step 1.22: the stage 1 exit test in a real browser, against the web app on its
// made-up stand-in (APP_ENV=test), started as scripts/check-web-shell.mjs starts it.
// Nothing leaves this computer; every person, league and password is made up.
//
// What it covers: two leagues at two addresses with different looks; a made-up member
// signing in with an email and password, the browser closing, and the person still being
// signed in when a new browser opens with the cookies a real browser keeps; an admin of
// the first league refused everywhere in the second; accessibility checks on every
// screen it visits (T-186).
// What it does not cover, because the stand-in cannot: an invitation email being
// captured and its link followed (the stand-in has no invitations: stand-in-ports.ts),
// and signing in as the made-up league people (they are given only by their cookie).
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

if (!process.argv.includes('--no-build')) {
  const build = start(['build'], { APP_ENV: 'test' });
  const code = await new Promise((r) => build.child.on('exit', r));
  if (code !== 0) throw new Error(`next build failed:\n${build.output()}`);
}

/**
 * Accessibility checks on the screen the page shows (T-186). axe is not a dependency,
 * so these are the checks that can be made from the page itself: language, title, one
 * main landmark and one level-one heading, names on every link, button and field,
 * descriptions on images, no repeated ids, and text contrast of at least 4.5 to 1
 * (3 to 1 for large text).
 */
async function accessibilityProblems(page) {
  return page.evaluate(() => {
    const problems = [];
    if (!document.documentElement.lang) problems.push('the page has no language');
    if (!document.title.trim()) problems.push('the page has no title');
    if (document.querySelectorAll('main, [role=main]').length !== 1)
      problems.push('the page does not have exactly one main area');
    if (document.querySelectorAll('h1').length !== 1)
      problems.push(`${document.querySelectorAll('h1').length} level-one headings, not 1`);
    const nameOf = (el) =>
      (
        el.getAttribute('aria-label') ||
        document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent ||
        el.labels?.[0]?.textContent ||
        el.textContent ||
        el.getAttribute('title') ||
        el.getAttribute('value') ||
        ''
      ).trim();
    for (const el of document.querySelectorAll('a[href], button, [role=button]'))
      if (!nameOf(el) && !el.querySelector('img[alt]:not([alt=""])'))
        problems.push(`a ${el.tagName.toLowerCase()} has no name`);
    for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea'))
      if (!nameOf(el)) problems.push(`a field "${el.getAttribute('name')}" has no label`);
    for (const el of document.querySelectorAll('img'))
      if (!el.hasAttribute('alt')) problems.push('an image has no alt text');
    const ids = new Map();
    for (const el of document.querySelectorAll('[id]')) ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
    for (const [id, n] of ids) if (n > 1) problems.push(`the id "${id}" is used ${n} times`);
    // Contrast.
    const parse = (value) => {
      const m = /rgba?\(([^)]+)\)/.exec(value);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1]
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);
      return { r, g, b, a };
    };
    const over = (top, under) => ({
      r: top.r * top.a + under.r * (1 - top.a),
      g: top.g * top.a + under.g * (1 - top.a),
      b: top.b * top.a + under.b * (1 - top.a),
      a: 1,
    });
    const backgroundOf = (el) => {
      const layers = [];
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && c.a > 0) {
          layers.push(c);
          if (c.a === 1) break;
        }
      }
      return layers.reduceRight((under, top) => over(top, under), {
        r: 255,
        g: 255,
        b: 255,
        a: 1,
      });
    };
    const light = ({ r, g, b }) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue;
      const el = node.parentElement;
      if (!el || seen.has(el) || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
      seen.add(el);
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const bg = backgroundOf(el);
      const fg = over(parse(style.color) ?? { r: 0, g: 0, b: 0, a: 1 }, bg);
      const [hi, lo] = [light(fg), light(bg)].sort((a, b) => b - a);
      const ratio = (hi + 0.05) / (lo + 0.05);
      const size = parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5))
        problems.push(
          `low contrast ${ratio.toFixed(2)}:1 in "${node.textContent.trim().slice(0, 30)}"`,
        );
    }
    return problems;
  });
}

const failures = [];
const checked = [];
const note = (label, ok, detail = '') => {
  checked.push(label);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const port = await freePort();
const origin = `http://localhost:${port}`;
const server = start(['start', '--port', String(port)], {
  APP_ENV: 'test',
  PUBLIC_BASE_URL: origin,
});
let browser;
try {
  await waitFor(`${origin}/`, server);
  browser = await launch();

  /** Opens `address` and waits until the page has drawn its main area. */
  async function open(page, address) {
    const response = await page.goto(origin + address);
    await page.locator('main').first().waitFor();
    return response;
  }
  async function accessible(page, label) {
    const problems = await accessibilityProblems(page);
    note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
  }

  // 1. Two leagues, two addresses, two looks.
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const looks = {};
    for (const [league, name] of [
      ['north-valley', 'North Valley League'],
      ['harbor-city', 'Harbor City League'],
    ]) {
      await open(page, `/${league}`);
      await page.getByText(name).first().waitFor();
      await page.getByText('Powered by SR Leagues').first().waitFor();
      looks[league] = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim(),
      );
      note(`${league} shows its own name`, true);
      await accessible(page, `/${league}`);
      for (const sub of ['standings', 'stats', 'schedule', 'teams']) {
        await open(page, `/${league}/${sub}`);
        await accessible(page, `/${league}/${sub}`);
      }
    }
    note(
      'the two leagues have different looks',
      looks['north-valley'] === '#c8a84b' && looks['harbor-city'] === '#1f5fbf',
      JSON.stringify(looks),
    );
    await context.close();
  }

  // 2. Sign in, close the browser, come back, still signed in.
  {
    const first = await launch();
    const context = await first.newContext();
    const page = await context.newPage();
    await open(page, '/account');
    note('a visitor is sent to sign in', new URL(page.url()).pathname === '/signin');
    await page.getByRole('heading', { name: 'Sign in' }).waitFor();
    await accessible(page, '/signin');
    await page.getByLabel('Email').fill(member.email);
    await page.getByLabel('Password').fill(member.password);
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/account'),
      page.getByRole('button', { name: 'Sign in', exact: true }).click(),
    ]);
    await page.getByRole('heading', { name: 'Your account' }).waitFor();
    await accessible(page, '/account');
    const cookies = await context.cookies(origin);
    const session = cookies.find((c) => c.name === 'srl_session');
    note('signing in sets a session cookie', session !== undefined);
    note(
      'the session cookie is kept after the browser closes',
      session !== undefined && session.expires > Date.now() / 1000,
      `expires ${session?.expires}`,
    );
    note('the session cookie cannot be read by page scripts', session?.httpOnly === true);
    // What a real browser keeps when it closes: the cookies that have an end date.
    const kept = cookies.filter((c) => c.expires > Date.now() / 1000);
    await first.close();

    const second = await launch();
    try {
      const back = await second.newContext();
      await back.addCookies(kept);
      const again = await back.newPage();
      await open(again, '/account');
      await again.getByRole('heading', { name: 'Your account' }).waitFor();
      note('back in a new browser, still signed in', new URL(again.url()).pathname === '/account');
      await again.getByRole('button', { name: 'Sign out everywhere' }).click();
      await again.waitForURL((url) => url.pathname !== '/account');
      await open(again, '/account');
      note('after signing out, sent to sign in', new URL(again.url()).pathname === '/signin');
    } finally {
      await second.close();
    }
  }

  // 3. An admin of the first league is refused everywhere in the second.
  {
    const context = await browser.newContext();
    await context.addCookies([
      { name: 'srl_session', value: 'local-scheduler-token', url: origin },
    ]);
    const page = await context.newPage();
    await open(page, '/north-valley/admin');
    await page.getByRole('navigation', { name: 'Admin areas' }).waitFor();
    note('the scheduler can open their own league admin area', true);
    await accessible(page, '/north-valley/admin (as its admin)');
    const areas = [
      '',
      '/schedule',
      '/games',
      '/teams',
      '/people',
      '/season',
      '/registration',
      '/standings',
      '/messages',
      '/site',
      '/settings',
    ];
    for (const area of areas) {
      const response = await open(page, `/harbor-city/admin${area}`);
      await page.getByText(noAccess).first().waitFor();
      note(`refused at /harbor-city/admin${area}`, response?.status() === 403);
      note(
        `no admin words at /harbor-city/admin${area}`,
        (await page.getByRole('navigation', { name: 'Admin areas' }).count()) === 0,
      );
    }
    const response = await open(page, '/harbor-city/score/game-1');
    await page.getByText(noAccess).first().waitFor();
    note('refused at /harbor-city/score/game-1', response?.status() === 403);
    await accessible(page, '/harbor-city/admin (refused)');
    await context.close();
  }
} finally {
  await browser?.close();
  server.child.kill();
}

if (failures.length > 0) {
  console.error(`Browser exit-test check failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Browser exit-test check passed: ${checked.length} checks in a real browser.`);
