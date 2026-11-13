// End-to-end check of the GitHub Pages site: the built static pages, served under
// /league-platform/ as GitHub Pages serves them, saving straight to a stand-in for
// Supabase (real PostgreSQL behind Supabase's REST conventions, as the anon role).
// Signs in with the scorer passcode, enters both rosters, tracks a game (baskets,
// fouls, a turnover, a substitution), loses the connection mid-game, watches from a
// second signed-out browser, ends the game and checks the game logs and the demo.
// Saves screenshots under artifacts/screenshots/pages-*.png.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeSupabase } from '../tests/support/fake-supabase.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const site = path.join(root, 'dist/pages');
const shots = path.join(root, 'artifacts/screenshots');
fs.mkdirSync(shots, { recursive: true });
const shot = (page, name, fullPage = false) =>
  page.screenshot({ path: path.join(shots, `pages-${name}.png`), fullPage });

function buildSite(env) {
  const result = spawnSync(process.execPath, ['scripts/build-pages.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      SUPABASE_URL: '',
      SUPABASE_ANON_KEY: '',
      LIVE_STATS_IGNORE_SITE_JSON: '1',
      ...env,
    },
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

/** GitHub Pages, near enough: static files under /league-platform/, index.html for folders. */
async function pagesServer() {
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/league-platform/')) {
      res.writeHead(404);
      return res.end('Not found');
    }
    let file = path.join(site, decodeURIComponent(url.pathname.slice('/league-platform/'.length)));
    if (!file.startsWith(site)) {
      res.writeHead(403);
      return res.end();
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory())
      file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { base: `http://127.0.0.1:${server.address().port}/league-platform/`, server };
}

// Refuses to publish a secret key.
const secret = spawnSync(process.execPath, ['scripts/build-pages.mjs'], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'sb_secret_abc',
  },
});
assert.notEqual(secret.status, 0);
assert.match(secret.stderr, /secret \(service_role\) key/);

const supabase = await fakeSupabase({ passcode: 'browser-check-passcode', setup: true });
buildSite({ SUPABASE_URL: supabase.url, SUPABASE_ANON_KEY: supabase.key });
const { base, server } = await pagesServer();
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE || undefined,
  });
  const errors = [];
  const watch = (page) => {
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      // On purpose below: the connection is cut, and a wrong passcode is tried.
      if (m.type() === 'error' && !/net::ERR_|Failed to fetch|status of 401/.test(m.text()))
        errors.push(m.text());
    });
    page.on('dialog', (d) => d.accept());
  };
  const scorer = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await scorer.newPage();
  watch(page);

  // Anyone can see the schedule; scoring needs the passcode.
  await page.goto(base);
  await page.locator('.game').first().waitFor();
  assert.equal(await page.locator('.game').count(), 10);
  assert.equal(await page.getByRole('link', { name: 'Track live stats' }).count(), 0);
  await page.getByRole('link', { name: 'Scorer sign-in' }).click();
  await page.locator('#passcode').fill('not it');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.locator('#error', { hasText: 'not right' }).waitFor();
  await page.locator('#passcode').fill('browser-check-passcode');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(base);
  await page.getByRole('link', { name: 'Track live stats' }).first().waitFor();
  await shot(page, 'schedule', true);

  // The first game: both rosters, then the game.
  await page.getByRole('link', { name: 'Track live stats' }).first().click();
  await page.waitForURL(/track\.html\?id=/);
  const gameId = new URL(page.url()).searchParams.get('id');
  await page.locator('#lt-drawer.lt-open').waitFor();
  const home = page.locator('[data-editor="home"]');
  for (const [jersey, name] of [
    ['4', 'Jordan Ellis'],
    ['11', 'Marcus Webb'],
    ['15', 'Devon Price'],
    ['22', 'Andre Cole'],
    ['30', 'Chris Lane'],
    ['33', 'Tyler Brooks'],
  ]) {
    await home.locator('.re-add .re-jersey').fill(jersey);
    await home.locator('.re-add .re-name').fill(name);
    await home.locator('.re-add .re-name').press('Enter');
    await home.locator(`.re-row[data-id] .re-name[value="${name}"]`).waitFor();
  }
  const away = page.locator('[data-editor="away"]');
  await away.locator('.re-quick-input').fill('3 5 10 12 14 21');
  await away.locator('.re-quick-btn').click();
  await away.locator('.re-msg', { hasText: 'Added #3, #5, #10, #12, #14, #21.' }).waitFor();
  await page.getByRole('button', { name: 'Done' }).click();

  const tile = (p, side, jersey) =>
    p
      .locator(`.lt-player[data-team="${side}"]`)
      .filter({ has: p.locator('.lt-player-num', { hasText: new RegExp(`^${jersey}$`) }) });
  const menu = (act) => page.locator(`.lt-menu .lt-opt[data-act="${act}"]`);
  const settled = () =>
    page.waitForFunction(
      (id) =>
        !localStorage.getItem(`live-stats:outbox:${id}`) &&
        document.getElementById('lt-sync').textContent.startsWith('Saved'),
      gameId,
      { timeout: 20_000 },
    );
  const saved = () =>
    supabase.db
      .query('SELECT * FROM live_stats.games WHERE id = $1', [gameId])
      .then((r) => r.rows[0]);

  for (const j of ['4', '11', '15', '22', '30']) await tile(page, 'home', j).click();
  for (const j of ['3', '5', '10', '12', '14']) await tile(page, 'away', j).click();
  await page.locator('#lt-startstop').click();
  await tile(page, 'away', '3').click();
  await menu('p3').click();
  await tile(page, 'home', '4').click();
  await menu('p2').click();
  await tile(page, 'home', '11').click();
  await menu('to').click();
  await page.locator('#lt-to-away').click();
  await page.locator('#lt-to-list-away .lt-opt-teamto').click();
  await tile(page, 'away', '5').click();
  await menu('foul').click();
  await tile(page, 'away', '21').click();
  await page.locator('.lt-menu .lt-opt-sub', { hasText: '#10' }).click();
  await settled();
  let row = await saved();
  assert.deepEqual(
    [row.home_score, row.away_score, row.status],
    [2, 3, 'live'],
    'saved in Supabase',
  );
  assert.equal(await page.locator('#lt-to-home').textContent(), '1 turnover ▾');
  assert.equal(await page.locator('#lt-to-away').textContent(), '1 turnover ▴', 'a team turnover');
  assert.ok(row.state.plays.some((p) => p.type === 'team-turnover' && p.side === 'away'));

  // A fan's phone, not signed in, follows along.
  const fan = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  watch(fan);
  await fan.goto(`${base}game.html?id=${gameId}`);
  await fan.locator('.sb-score').first().waitFor();
  assert.equal(
    await fan.getByRole('link', { name: /Track live stats|Open the tracker/ }).count(),
    0,
  );

  // The connection drops mid-game: taps wait on the device, then all save, once each.
  supabase.state.offline = true;
  await tile(page, 'home', '15').click();
  await menu('p3').click();
  await tile(page, 'away', '12').click();
  await menu('p2').click();
  await page
    .locator('#lt-sync', { hasText: 'Not connected — 2 actions kept on this device' })
    .waitFor({ timeout: 30_000 });
  assert.deepEqual(
    [
      await page.locator('#lt-score-home').textContent(),
      await page.locator('#lt-score-away').textContent(),
    ],
    ['5', '5'],
  );
  supabase.state.offline = false;
  await settled();
  row = await saved();
  assert.deepEqual([row.home_score, row.away_score], [5, 5], 'both saved after reconnecting');
  const events = await supabase.db.query(
    'SELECT count(*)::int AS n FROM live_stats.game_events WHERE game_id = $1',
    [gameId],
  );
  assert.equal(events.rows[0].n, row.revision, 'one saved action per tap');
  await fan.waitForFunction(
    () => [...document.querySelectorAll('.sb-score')].map((s) => s.textContent).join() === '5,5',
    null,
    { timeout: 15_000 },
  );
  assert.match(await fan.locator('#pbp li').first().textContent(), /#12 \+2/);
  await shot(fan, 'game-phone', true);

  // A refresh keeps everything; then the game ends.
  await page.reload();
  await page.locator('#lt-score-home', { hasText: '5' }).waitFor();
  await shot(page, 'tracker');
  await page.locator('#lt-end').click();
  await page.locator('#lt-final:not([hidden])').waitFor();
  await page.waitForFunction(
    () => !document.getElementById('lt-sync').textContent.startsWith('Saving'),
  );
  assert.equal((await saved()).status, 'final');

  // Schedule, game log and a player's game log, as anyone sees them.
  await fan.goto(base);
  await fan.locator('.game.is-final').first().waitFor();
  await fan.getByRole('link', { name: 'Roster & stats' }).click();
  await fan.locator('#game-log tbody tr').first().waitFor();
  assert.match(
    await fan.locator('#game-log tbody tr').first().textContent(),
    /KIPP Academy West.*T 5–5/,
  );
  await fan.locator('#stats tbody').getByRole('link', { name: '#3' }).click();
  await fan.locator('#log tbody tr').first().waitFor();
  assert.match(await fan.locator('#log tbody tr').first().textContent(), /KIPP Academy West/);
  assert.ok(await fan.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await shot(fan, 'player-phone', true);

  // The concept demo moved under demo/.
  const demo = await fetch(`${base}demo/`);
  assert.equal(demo.status, 200);
  assert.match(await demo.text(), /<html/i);

  // Signing out ends scoring on this device.
  await page.goto(base);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('link', { name: 'Scorer sign-in' }).waitFor();
  await fan.close();

  // Built without a Supabase project: says so instead of failing quietly.
  buildSite({});
  await page.goto(base);
  await page.locator('#games', { hasText: 'not connected to its database yet' }).waitFor();

  assert.deepEqual(errors, []);
  console.log('GitHub Pages site check passed. Screenshots: artifacts/screenshots/pages-*.png');
} finally {
  await browser?.close();
  server.close();
  await supabase.stop();
}
