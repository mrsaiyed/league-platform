// End-to-end check of live stat tracking in a real browser, against its own throwaway
// database: enter rosters, pick lineups, score through the player menus, sub by tap
// and by drag, survive a lost response, watch the live page update, end the game and
// see the season stats. Saves screenshots under artifacts/screenshots/live-stats-*.png.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'live-stats-browser-'));
const port = 4191;
const base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['--disable-warning=ExperimentalWarning', 'apps/live-stats/server.ts'],
  {
    cwd: root,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      LIVE_STATS_PORT: String(port),
      LIVE_STATS_DATA_DIR: path.join(temporary, 'db'),
    },
  },
);
let output = '';
server.stdout.on('data', (s) => (output += s));
server.stderr.on('data', (s) => (output += s));
const shots = path.join(root, 'artifacts/screenshots');
await mkdir(shots, { recursive: true });
const shot = (page, name, fullPage = false) =>
  page.screenshot({ path: path.join(shots, `live-stats-${name}.png`), fullPage });

let browser;
try {
  for (let i = 0; ; i++) {
    if (server.exitCode !== null) throw new Error(output);
    if (output.includes(`Live stats: ${base}`)) break;
    if (i === 150) throw new Error(`Server timeout: ${output}`);
    await new Promise((r) => setTimeout(r, 200));
  }
  // Changes need a same-origin browser request.
  const schedule = await (await fetch(`${base}/api/schedule`)).json();
  assert.equal(schedule.games.length, 10);
  const [first, second] = schedule.games;
  const hostile = await fetch(`${base}/api/games/${first.id}/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' },
    body: '{}',
  });
  assert.equal(hostile.status, 403);

  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE || undefined,
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const watch = (page) => {
    page.on('pageerror', (e) => errors.push(e.message));
    // net::ERR_FAILED is the response this check throws away on purpose.
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('net::ERR_FAILED')) errors.push(m.text());
    });
    page.on('dialog', (d) => (d.type() === 'prompt' ? d.accept('6:30') : d.accept()));
  };
  const page = await context.newPage();
  watch(page);

  await page.goto(base);
  await page.locator('.game').first().waitFor();
  assert.equal(await page.locator('.game').count(), 10);
  await shot(page, 'schedule', true);

  // Into the first game's tracker; with no players yet the Players panel opens itself.
  await page.locator('.game').first().getByRole('link', { name: 'Track live stats' }).click();
  await page.locator('#lt-drawer.lt-open').waitFor();
  const addPlayers = async (side, players) => {
    const editor = page.locator(`[data-editor="${side}"]`);
    for (const [jersey, name] of players) {
      await editor.locator('.re-add .re-jersey').fill(jersey);
      await editor.locator('.re-add .re-name').fill(name);
      await editor.locator('.re-add .re-name').press('Enter');
      await editor.locator(`.re-row[data-id] .re-name[value="${name}"]`).waitFor();
    }
  };
  await addPlayers('home', [
    ['4', 'Jordan Ellis'],
    ['11', 'Marcus Webb'],
    ['15', 'Devon Price'],
    ['22', 'Andre Cole'],
    ['30', 'Chris Lane'],
    ['33', 'Tyler Brooks'],
  ]);
  await addPlayers('away', [
    ['3', 'Player Three'],
    ['5', 'Player Five'],
    ['10', 'Player Ten'],
    ['12', 'Player Twelve'],
    ['14', 'Player Fourteen'],
    ['21', 'Player TwentyOne'],
    ['00', 'Player DoubleZero'],
  ]);
  await shot(page, 'players');
  await page.getByRole('button', { name: 'Done' }).click();

  const tileOn = (p, side, jersey) =>
    p
      .locator(`.lt-player[data-team="${side}"]`)
      .filter({ has: p.locator('.lt-player-num', { hasText: new RegExp(`^${jersey}$`) }) });
  const tile = (side, jersey) => tileOn(page, side, jersey);
  const menu = (act) => page.locator(`.lt-menu .lt-opt[data-act="${act}"]`);
  const score = async () => [
    await page.locator('#lt-score-home').textContent(),
    await page.locator('#lt-score-away').textContent(),
  ];
  const gameId = page.url().split('/')[4];
  const settled = () =>
    page.waitForFunction(
      (id) =>
        !localStorage.getItem(`live-stats:outbox:${id}`) &&
        document.getElementById('lt-sync').textContent.startsWith('Saved'),
      gameId,
    );

  for (const j of ['4', '11', '15', '22', '30']) await tile('home', j).click();
  for (const j of ['3', '5', '10', '12']) await tile('away', j).click();
  await page.getByRole('button', { name: 'Start with 4' }).waitFor();
  await tile('away', '14').click();
  await page.locator('#lt-startstop').click();
  await page.locator('#lt-startstop', { hasText: 'Pause' }).waitFor();

  await tile('away', '3').click();
  await menu('p3').click();
  await tile('home', '4').click();
  await menu('p2').click();
  await tile('away', '5').click();
  await menu('foul').click();
  await tile('away', '21').click();
  await page.locator('.lt-menu .lt-opt-sub', { hasText: '#10' }).click();
  await settled();
  assert.deepEqual(await score(), ['2', '3']);
  assert.ok(await tile('away', '21').evaluate((el) => el.dataset.oncourt === '1'));

  // Drag a bench player onto whoever comes off.
  const from = await tile('home', '33').boundingBox();
  const to = await tile('home', '30').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await settled();
  assert.ok(await tile('home', '33').evaluate((el) => el.dataset.oncourt === '1'));

  // The server saves a basket but the answer is lost: the retry must not count it twice.
  await page.route(
    '**/commands',
    async (route) => {
      await route.fetch();
      await route.abort();
    },
    { times: 1 },
  );
  await tile('away', '12').click();
  await menu('p2').click();
  await settled();
  assert.deepEqual(await score(), ['2', '5']);
  const saved = await page.evaluate(
    (id) => fetch(`/api/games/${id}`).then((r) => r.json()),
    gameId,
  );
  assert.equal(saved.awayScore, 5, 'saved once on the server');
  assert.equal(saved.state.plays.filter((p) => p.type === 'score').length, 3);

  // A viewer's live page follows along without reloading.
  const viewer = await context.newPage();
  watch(viewer);
  await viewer.goto(`${base}/game/${gameId}`);
  await viewer.locator('.sb-score').first().waitFor();
  await tile('home', '11').click();
  await menu('p3').click();
  await settled();
  await viewer.waitForFunction(
    () => [...document.querySelectorAll('.sb-score')].map((s) => s.textContent).join() === '5,5',
  );
  assert.match(await viewer.locator('#pbp li').first().textContent(), /#11 Marcus Webb \+3/);

  // Undo, redo, and a reload loses nothing.
  await page.locator('#lt-undo').click();
  await settled();
  assert.deepEqual(await score(), ['2', '5']);
  await page.locator('#lt-redo').click();
  await settled();
  await page.reload();
  await page.locator('#lt-score-home', { hasText: '5' }).waitFor();
  assert.deepEqual(await score(), ['5', '5']);
  await page.locator('#lt-clock').click(); // prompt answers 6:30
  await page.locator('#lt-clock', { hasText: '6:30' }).waitFor();
  await settled();

  await tile('away', '3').click();
  await menu('p1').waitFor();
  await shot(page, 'tracker');
  await shot(viewer, 'game', true);
  await page.keyboard.press('Escape');

  // End it: final on the schedule, totals on the team page.
  await page.locator('#lt-end').click();
  await page.locator('#lt-final:not([hidden])').waitFor();
  await settled();
  await page.goto(base);
  await page.locator('.game.is-final').first().waitFor();
  assert.match(await page.locator('.game').first().textContent(), /W5–5|T5–5/);
  await page.getByRole('link', { name: 'Roster & stats' }).click();
  await page.locator('#stats tbody tr').first().waitFor();
  assert.match(await page.locator('#stats tbody tr').first().textContent(), /Player Three/);
  await shot(page, 'team', true);

  // Phone: the second game, lying down and upright, with no sideways scrolling.
  await page.evaluate(async (teamId) => {
    for (const [jersey, name] of [
      ['1', 'Eli Grant'],
      ['2', 'Noah Reed'],
      ['7', 'Liam Ford'],
      ['8', 'Owen Hale'],
      ['9', 'Caleb Stone'],
      ['13', 'Ryan Moss'],
    ])
      await fetch(`/api/teams/${teamId}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jersey, name }),
      });
  }, second.home.id);
  for (const [name, viewport] of [
    ['phone-landscape', { width: 844, height: 390 }],
    ['phone-portrait', { width: 390, height: 844 }],
  ]) {
    const phone = await browser.newPage({ viewport, isMobile: true, hasTouch: true });
    watch(phone);
    await phone.goto(`${base}/game/${second.id}/track`);
    await phone.locator('.lt-player').first().waitFor();
    if (name === 'phone-landscape') {
      for (const j of ['1', '2', '7', '8', '9']) await tileOn(phone, 'home', j).click();
      for (const j of ['3', '5', '10', '12', '14']) await tileOn(phone, 'away', j).click();
      await phone.locator('#lt-startstop').click();
      await tileOn(phone, 'away', '5').click();
      await phone.locator('.lt-menu .lt-opt[data-act="p2"]').click();
    }
    await tileOn(phone, 'home', '7').click();
    await phone.locator('.lt-menu').waitFor();
    assert.ok(
      await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${name}: page scrolls sideways`,
    );
    await shot(phone, name);
    await phone.close();
  }
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  watch(phone);
  await phone.goto(base);
  await phone.locator('.game').first().waitFor();
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await shot(phone, 'schedule-phone', true);
  await phone.goto(`${base}/game/${gameId}`);
  await phone.locator('.sb-score').first().waitFor();
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await shot(phone, 'game-phone', true);

  assert.deepEqual(errors, []);
  console.log(
    'Live stats browser check passed. Screenshots: artifacts/screenshots/live-stats-*.png',
  );
} finally {
  await browser?.close();
  server.kill();
  await new Promise((r) => setTimeout(r, 500));
  await rm(temporary, { recursive: true, force: true }).catch(() => {});
}
