// Pictures of every screen, so that whoever designs or reviews a screen has seen it
// (docs/build/DESIGN.md, section 2). The web app runs on its made-up stand-in (APP_ENV=test):
// made-up leagues and people, no database, nothing leaves this computer.
//
//   node scripts/shots.mjs                      builds the web app in this folder, then takes them
//   node scripts/shots.mjs --dev                `next dev` instead of a build (quicker to start)
//   node scripts/shots.mjs --no-build           serves the build that is already here
//   node scripts/shots.mjs --only=home,admin    only pictures whose name contains one of these
//
// Each screen is taken whole, at two widths: 390 (a phone) and 1280 (a laptop). The files go
// to .local/shots/<width>/<name>.jpg, which git ignores. Open them with the Read tool. A
// lane runs this in its own folder, so the pictures show that lane's work.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(root, 'apps/web');
const out = path.join(root, '.local/shots');
const nextBin = createRequire(path.join(app, 'package.json')).resolve('next/dist/bin/next');
const madeUp = {
  NEXT_TELEMETRY_DISABLED: '1',
  APP_ENV: 'test',
  LOG_LEVEL: 'warn',
  EMAIL_FROM: 'hello@example.test',
};
// The stand-in's two live leagues, and its made-up owner, who is known by this cookie alone
// (apps/web/src/server/stand-in-ports.ts).
const leagues = ['north-valley', 'harbor-city'];
const owner = { name: 'srl_session', value: 'local-owner-token' };
const widths = [
  { name: '390', viewport: { width: 390, height: 844 } },
  { name: '1280', viewport: { width: 1280, height: 800 } },
];
// What a visitor sees. `first` follows the first link on the page whose address contains it.
const publicPages = [
  { name: 'home', at: '' },
  { name: 'schedule', at: '/schedule' },
  { name: 'standings', at: '/standings' },
  { name: 'stats', at: '/stats' },
  { name: 'teams', at: '/teams' },
  { name: 'team', at: '/teams', first: '/teams/' },
  { name: 'game', at: '', first: '/games/' },
];
// What the league's owner sees.
const adminPages = [
  { name: 'admin-home', at: '/admin' },
  { name: 'admin-games', at: '/admin/games' },
  { name: 'admin-teams', at: '/admin/teams' },
  { name: 'admin-team', at: '/admin/teams', first: '/admin/teams/' },
  { name: 'admin-schedule', at: '/admin/schedule' },
  { name: 'admin-import', at: '/admin/schedule/import' },
  { name: 'admin-season', at: '/admin/season' },
  { name: 'admin-settings', at: '/admin/settings' },
  { name: 'admin-people', at: '/admin/people' },
  { name: 'admin-standings', at: '/admin/standings' },
];
// SR Leagues' own pages, which belong to no league.
const platformPages = [
  { name: 'platform-home', at: '/' },
  { name: 'platform-signin', at: '/signin' },
  { name: 'platform-signup', at: '/signup' },
  { name: 'platform-find', at: '/find' },
  { name: 'platform-start', at: '/start' },
  { name: 'platform-help', at: '/help' },
];

const flag = (name) => process.argv.includes(name);
const only = (process.argv.find((arg) => arg.startsWith('--only=')) ?? '')
  .slice('--only='.length)
  .split(',')
  .filter(Boolean);
const wanted = (name) => !only.length || only.some((part) => name.includes(part));

/** On GitHub the Chromium ci.yml installs; here the Edge Windows already has. */
const launch = () => (process.env.CI ? chromium.launch() : chromium.launch({ channel: 'msedge' }));

function start(args, env = {}) {
  let output = '';
  const child = spawn(process.execPath, [nextBin, ...args], {
    cwd: app,
    env: { ...process.env, ...madeUp, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
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
  const until = Date.now() + 120_000;
  while (Date.now() < until) {
    if (server.child.exitCode !== null) throw new Error(`the server stopped:\n${server.output()}`);
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`the server did not answer within two minutes:\n${server.output()}`);
}

const dev = flag('--dev');
if (!dev && !flag('--no-build')) {
  console.log('Building the web app (a few minutes when the computer is busy).');
  const build = start(['build']);
  const status = await new Promise((resolve) => build.child.on('exit', resolve));
  if (status !== 0) {
    console.error(`next build failed:\n${build.output()}`);
    process.exit(1);
  }
}

const port = await freePort();
const origin = `http://localhost:${port}`;
const server = start(dev ? ['dev', '--port', String(port)] : ['start', '--port', String(port)], {
  PUBLIC_BASE_URL: origin,
});
const taken = [];
const missed = [];
let browser;
try {
  await waitFor(`${origin}/`, server);
  browser = await launch();
  for (const width of widths) {
    fs.mkdirSync(path.join(out, width.name), { recursive: true });
    const visitor = await browser.newContext({ viewport: width.viewport });
    const staff = await browser.newContext({ viewport: width.viewport });
    await staff.addCookies([{ ...owner, url: origin }]);
    const jobs = [
      ...platformPages.map((page) => ({ ...page, context: visitor, base: '' })),
      ...leagues.flatMap((league) => [
        ...publicPages.map((page) => ({
          ...page,
          name: `${league}-${page.name}`,
          context: visitor,
          base: `/${league}`,
        })),
        ...adminPages.map((page) => ({
          ...page,
          name: `${league}-${page.name}`,
          context: staff,
          base: `/${league}`,
        })),
      ]),
    ].filter((job) => wanted(job.name));
    for (const job of jobs) {
      const label = `${width.name}/${job.name}`;
      const page = await job.context.newPage();
      page.setDefaultTimeout(90_000);
      try {
        let answer = await page.goto(`${origin}${job.base}${job.at}`, { waitUntil: 'networkidle' });
        if (job.first) {
          const link = await page
            .locator(`main a[href*="${job.first}"]`)
            .first()
            .getAttribute('href', { timeout: 5_000 })
            .catch(() => null);
          if (!link) {
            missed.push(`${label}: no link containing ${job.first} on ${job.base}${job.at}`);
            continue;
          }
          answer = await page.goto(new URL(link, origin).href, { waitUntil: 'networkidle' });
        }
        const file = path.join(out, width.name, `${job.name}.jpg`);
        await page.screenshot({ path: file, fullPage: true, type: 'jpeg', quality: 80 });
        taken.push(
          `${label}.jpg${(answer?.status() ?? 200) >= 400 ? ` (the page answered ${answer.status()})` : ''}`,
        );
      } catch (error) {
        missed.push(`${label}: ${String(error.message ?? error).split('\n')[0]}`);
      } finally {
        await page.close();
      }
    }
    await visitor.close();
    await staff.close();
  }
} finally {
  await browser?.close();
  server.child.kill();
}

console.log(`${taken.length} pictures in ${path.relative(root, out)}:`);
for (const line of taken) console.log(`  ${line}`);
if (missed.length) {
  console.log(`${missed.length} not taken:`);
  for (const line of missed) console.log(`  ${line}`);
  process.exit(1);
}
