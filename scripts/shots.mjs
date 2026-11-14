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
//
// A game's page is taken in each state it has (`--only=game`): `game-live` and `game-final`
// are the two made-up games a tracker scores (this script taps a short game into each
// first, through the tracker's own endpoints), with their play-by-play and players;
// `game-result`, `game-forfeit`, `game-postponed`, `game-scheduled` and `game-undated` are
// games of the made-up schedules. Only the first made-up league has tracked games, so
// `game-live-light` and `game-final-light` are those two pages drawn with the second
// league's design values, which is all that differs between two leagues' looks (T-90).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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
  DATABASE_URL: 'postgres://made-up:made-up-password@127.0.0.1:1/nowhere',
  SESSION_SECRET: 'made-up-session-secret-0123456789abcdef',
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SECRET_KEY: 'made-up-supabase-key',
  RESEND_API_KEY: 'made-up-resend-key',
  EMAIL_FROM: 'hello@example.test',
  STRIPE_SECRET_KEY: 'made-up-stripe-key',
  STRIPE_WEBHOOK_SECRET: 'made-up-webhook-key',
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
];
// A game's page in each of its states. The ids are the stand-in's own
// (apps/web/src/server/stand-in-games.ts and stand-in-public-schedule.ts): a tracked game
// is number n of the games area, a listed one is game `index` of a season of `count` games.
const hexId = (head, n) => `01900000-0000-7000-8000-${head}${n.toString(16).padStart(8, '0')}`;
const trackedGame = (n) => hexId('006a', n);
const trackedPlayer = (team, n) => hexId((0x70 + team).toString(16).padStart(4, '0'), n);
const listedGame = (count, index) => hexId('0000', 0xb2000000 + index + count * 1000);
const trackedLeagueId = hexId('0000', 1);
const liveGame = trackedGame(2);
const finalGame = trackedGame(3);
const gamePages = {
  'north-valley': [
    { name: 'game-live', at: `/games/${liveGame}` },
    { name: 'game-live-light', at: `/games/${liveGame}`, lookOf: 'harbor-city' },
    { name: 'game-final', at: `/games/${finalGame}` },
    { name: 'game-final-light', at: `/games/${finalGame}`, lookOf: 'harbor-city' },
    { name: 'game-result', at: `/games/${listedGame(13, 0)}` },
    { name: 'game-forfeit', at: `/games/${listedGame(13, 1)}` },
    { name: 'game-postponed', at: `/games/${listedGame(13, 3)}` },
    { name: 'game-scheduled', at: `/games/${listedGame(13, 8)}` },
  ],
  'harbor-city': [
    { name: 'game-result', at: `/games/${listedGame(5, 0)}` },
    { name: 'game-scheduled', at: `/games/${listedGame(5, 3)}` },
    { name: 'game-undated', at: `/games/${listedGame(5, 4)}` },
  ],
};
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

/**
 * Taps a short made-up game into each of the two tracked games, as a scorekeeper's tablet
 * would (the tracker's endpoints, step 2.32), so their pages have plays and players to
 * show. The Hawks (team 3) are at home in both: to the Bears (team 4), left under way, and
 * to the Lions (team 1), played to the end.
 */
async function scoreTrackedGames(origin) {
  const five = (team) => [1, 2, 3, 4, 5].map((n) => trackedPlayer(team, n));
  const [hawks, bears, lions] = [five(3), five(4), five(1)];
  const tablet = async (game, token) => {
    const post = async (at, body) => {
      const answer = await fetch(`${origin}/api/v1/leagues/${trackedLeagueId}/games/${game}${at}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `srl_session=${token}`, origin },
        body: JSON.stringify(body),
      });
      const text = await answer.text();
      if (!answer.ok) throw new Error(`${at} answered ${answer.status}: ${text.slice(0, 200)}`);
      return JSON.parse(text);
    };
    const { sessionId } = await post('/session', { type: 'open', deviceId: 'pictures-tablet' });
    return async (...inputs) => {
      // A tablet sends at most 50 taps at once (maxCommandsPerBatch); 25 keeps well inside it.
      for (let from = 0; from < inputs.length; from += 25) {
        const reply = await post('/commands', {
          protocolVersion: 1,
          sessionId,
          commands: inputs
            .slice(from, from + 25)
            .map((input) => ({ commandId: randomUUID(), at: Date.now(), input })),
        });
        const refused = reply.results.filter((r) => r.status !== 'accepted');
        if (refused.length > 0) throw new Error(`refused: ${JSON.stringify(refused)}`);
      }
    };
  };
  const score = (side, playerId, points) => ({ type: 'score', side, playerId, points });
  const clock = (minutes, seconds) => [
    { type: 'pause' },
    { type: 'set-clock', ms: (minutes * 60 + seconds) * 1000 },
    { type: 'start' },
  ];
  /** A first half, the break, and the opening of the second. */
  const plays = (away) => [
    { type: 'lineup', side: 'home', playerIds: hawks },
    { type: 'lineup', side: 'away', playerIds: away },
    { type: 'start' },
    ...clock(18, 42),
    score('home', hawks[0], 3),
    ...clock(17, 5),
    score('away', away[0], 2),
    { type: 'foul', side: 'away', playerId: away[1] },
    ...clock(15, 30),
    score('home', hawks[1], 2),
    score('home', hawks[1], 1),
    ...clock(12, 8),
    { type: 'turnover', side: 'home', playerId: hawks[2] },
    score('away', away[2], 3),
    ...clock(9, 51),
    { type: 'timeout', side: 'home', seconds: 60 },
    { type: 'sub', side: 'home', inId: trackedPlayer(3, 6), outId: hawks[4] },
    ...clock(6, 14),
    score('home', hawks[3], 2),
    { type: 'foul', side: 'home', playerId: hawks[3] },
    score('away', away[3], 1),
    ...clock(2, 40),
    score('away', away[0], 2),
    score('home', hawks[0], 2),
    { type: 'pause' },
    { type: 'period', period: 2 },
    { type: 'start' },
    ...clock(19, 12),
    score('away', away[4], 2),
    { type: 'team-turnover', side: 'away' },
    ...clock(16, 3),
    score('home', hawks[1], 3),
    { type: 'foul', side: 'away', playerId: away[2] },
  ];
  const live = await tablet(liveGame, 'local-scorekeeper-token');
  await live(...plays(bears));
  const done = await tablet(finalGame, 'local-owner-token');
  await done(...plays(lions), ...clock(0, 4), score('home', hawks[2], 2), { type: 'end' });
}

/** A league's design values as its pages carry them: the one `:root` block (T-90). */
async function designValuesOf(origin, league) {
  const html = await (await fetch(`${origin}/${league}`)).text();
  const found = /:root \{[^}]*\}/.exec(html);
  if (!found) throw new Error(`no design values on /${league}`);
  return found[0];
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
  const looks = {};
  const tracked = gamePages['north-valley'].filter((page) => /game-(live|final)/.test(page.name));
  if (tracked.some((page) => wanted(`north-valley-${page.name}`))) {
    try {
      await scoreTrackedGames(origin);
    } catch (error) {
      missed.push(`the tracked games were not scored: ${String(error.message ?? error)}`);
    }
  }
  for (const width of widths) {
    fs.mkdirSync(path.join(out, width.name), { recursive: true });
    const visitor = await browser.newContext({ viewport: width.viewport });
    const staff = await browser.newContext({ viewport: width.viewport });
    await staff.addCookies([{ ...owner, url: origin }]);
    const jobs = [
      ...platformPages.map((page) => ({ ...page, context: visitor, base: '' })),
      ...leagues.flatMap((league) => [
        ...[...publicPages, ...(gamePages[league] ?? [])].map((page) => ({
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
        if (job.lookOf) {
          // The same page under another league's design values: only the `:root` block changes.
          looks[job.lookOf] ??= await designValuesOf(origin, job.lookOf);
          await page.evaluate((values) => {
            for (const style of document.querySelectorAll('style')) {
              if (/:root \{[^}]*--color-background/.test(style.textContent ?? '')) {
                style.textContent = style.textContent.replace(/:root \{[^}]*\}/, values);
              }
            }
            return document.fonts.ready.then(() => undefined);
          }, looks[job.lookOf]);
          await page.waitForTimeout(500);
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
