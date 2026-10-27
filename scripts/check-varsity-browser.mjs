import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'varsity-browser-'));
const port = 4176;
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['apps/varsity-preview/server.ts'], {
  cwd: root,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, VARSITY_PORT: String(port), VARSITY_DATA_DIR: path.join(temporary, 'db') },
});
let output = '',
  browser;
server.stdout.on('data', (s) => {
  output += s;
});
server.stderr.on('data', (s) => {
  output += s;
});
const screenshots = path.join(root, 'artifacts/screenshots');
await mkdir(screenshots, { recursive: true });
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(output);
    if (output.includes(`Local: ${base}`)) break;
    if (attempt === 99) throw new Error(`Server timeout: ${output}`);
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  assert.equal((await fetch(`${base}/api/practice`, { method: 'POST' })).status, 403);
  assert.equal(
    (await fetch(`${base}/api/dashboard`, { headers: { Origin: 'https://untrusted.example' } }))
      .status,
    403,
  );
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.getByRole('heading', { name: 'Our season, one game at a time.' }).waitFor();
  await page.screenshot({ path: path.join(screenshots, 'varsity-overview.png'), fullPage: true });
  await page.locator('[data-action=practice]').click();
  await page.locator('[data-action=lineup][data-side=home]').waitFor();
  const setLineup = async (side) => {
    await page.locator(`[data-action=lineup][data-side=${side}]`).click();
    await page.getByRole('button', { name: 'Select first five' }).click();
    await page.getByRole('button', { name: 'Save lineup' }).click();
    await page.waitForFunction(() => !document.querySelector('#main').classList.contains('busy'));
  };
  await setLineup('home');
  await setLineup('away');
  await page.getByRole('button', { name: 'Start clock', exact: true }).click();
  await page.getByRole('button', { name: 'Pause clock', exact: true }).waitFor();
  await page.locator('[data-action=score][data-points="2"]').click();
  await page.waitForFunction(
    () => document.querySelector('.score-side .score-value').textContent === '2',
  );
  // The server commits, but the browser never sees the response. The same ID must replay once.
  await page.route(
    '**/commands',
    async (route) => {
      await route.fetch();
      await route.abort();
    },
    { times: 1 },
  );
  await page.locator('[data-action=score][data-points="3"]').click();
  await page.getByRole('button', { name: 'Retry saved action' }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Retry saved action' }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('.score-side .score-value').textContent === '5' &&
      !localStorage.getItem('league-platform:varsity-pending:v1'),
  );
  await page.getByRole('button', { name: 'Pause clock', exact: true }).click();
  await page.getByRole('button', { name: 'Start clock', exact: true }).waitFor();
  await page.screenshot({ path: path.join(screenshots, 'varsity-scorer.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'Scorer mobile overflow',
  );
  await page.screenshot({ path: path.join(screenshots, 'varsity-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Review & finalize', exact: true }).click();
  await page.getByRole('button', { name: 'Finalize record', exact: true }).click();
  await page.getByRole('button', { name: 'Reopen to correct' }).waitFor();
  await page.goto(`${base}/#stats`);
  await page.getByRole('heading', { name: 'The first box score starts the story' }).waitFor();
  await page.goto(`${base}/#roster`);
  await page.locator('#roster-form').waitFor();
  for (let i = 0; i < 6; i++) {
    if (i) await page.locator('[data-action=add-roster-row]').click();
    const row = page.locator('.roster-edit-row').nth(i);
    await row.locator('[name=jersey]').fill(String(i + 1));
    await row.locator('[name=name]').fill(`Test player ${i + 1}`);
  }
  await page.getByRole('button', { name: 'Save roster', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#roster-form').dataset.revision === '1');
  await page.reload();
  await page.locator('.roster-edit-row').nth(5).waitFor();
  await page.goto(`${base}/#games`);
  await page.locator('[data-action=new-game]').click();
  await page.locator('[name=opponent]').fill('Test opponent');
  await page.locator('[name=opponents]').fill('11\n12\n13\n14\n15\n16');
  await page.locator('[name=rulesConfirmed]').check();
  await page.getByRole('button', { name: 'Create game', exact: true }).click();
  await page.locator('[data-action=lineup][data-side=home]').waitFor();
  await setLineup('home');
  await setLineup('away');
  await page.getByRole('button', { name: 'Start clock', exact: true }).click();
  await page.getByRole('button', { name: 'Pause clock', exact: true }).waitFor();
  await page.locator('[data-action=score][data-points="3"]').click();
  await page.waitForFunction(
    () => document.querySelector('.score-side .score-value').textContent === '3',
  );
  await page.getByRole('button', { name: 'Pause clock', exact: true }).click();
  await page.getByRole('button', { name: 'Start clock', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Review & finalize', exact: true }).click();
  await page.getByRole('button', { name: 'Finalize record', exact: true }).click();
  await page.getByRole('button', { name: 'Reopen to correct' }).waitFor();
  await page.goto(`${base}/#stats`);
  await page.getByRole('heading', { name: 'Every game adds up.' }).waitFor();
  await page.locator('tbody tr').nth(4).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 5, 'DNP player excluded');
  assert.ok((await page.locator('tbody tr').first().innerText()).includes('3.0'));
  const data = await (await fetch(`${base}/api/dashboard`)).json();
  assert.equal(
    data.stats.reduce((sum, p) => sum + p.points, 0),
    3,
    'Practice points excluded',
  );
  for (const route of ['overview', 'roster', 'games', 'stats']) {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${base}/#${route}`);
    await page
      .getByRole('heading', {
        name: {
          overview: 'Our season, one game at a time.',
          roster: 'The varsity roster.',
          games: 'The schedule. The record.',
          stats: 'Every game adds up.',
        }[route],
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `${route} mobile overflow`,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    'Varsity browser checks passed: setup, scoring, acknowledgement-loss recovery, persistence, season totals, HTTP origin checks, desktop and mobile.',
  );
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    const stopped = once(server, 'exit');
    server.kill('SIGTERM');
    await stopped;
  }
  const resolved = path.resolve(temporary);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith('varsity-browser-'));
  await rm(resolved, { recursive: true, force: true });
}
