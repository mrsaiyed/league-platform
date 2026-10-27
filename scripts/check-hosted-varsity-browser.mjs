import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.HOSTED_TEST_URL ?? 'http://127.0.0.1:4175';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE || undefined,
});
try {
  const context = await browser.newContext(),
    page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page
    .getByRole('heading', { name: 'Our season, one game at a time.', exact: true })
    .waitFor();
  assert.ok((await page.locator('.storage-bar').innerText()).includes('shared SQL'));
  await page.locator('[data-action=practice]').click();
  for (const side of ['home', 'away']) {
    await page.locator(`[data-action=lineup][data-side=${side}]`).click();
    await page.getByRole('button', { name: 'Select first five', exact: true }).click();
    await page.getByRole('button', { name: 'Save lineup', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#main').classList.contains('busy'));
  }
  await page.getByRole('button', { name: 'Start clock', exact: true }).click();
  await page.getByRole('button', { name: 'Pause clock', exact: true }).waitFor();
  await page.locator('[data-action=score][data-points="2"]').click();
  await page.waitForFunction(
    () => document.querySelector('.score-side .score-value').textContent === '2',
  );
  await page.getByRole('button', { name: 'Pause clock', exact: true }).click();
  await page.getByRole('button', { name: 'Start clock', exact: true }).waitFor();
  const address = page.url();
  const other = await browser.newContext(),
    second = await other.newPage();
  await second.goto(address);
  await second.waitForFunction(
    () => document.querySelector('.score-side .score-value')?.textContent === '2',
  );
  assert.equal(
    await second.evaluate(() => localStorage.length),
    0,
    'Shared record must load without original browser storage',
  );
  await second.screenshot({
    path: 'artifacts/screenshots/varsity-hosted-scorer.png',
    fullPage: true,
  });
  await second.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await second.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    'Hosted adapter browser checks passed: actual D1 writes, saved player stats and a fresh browser reading the same game.',
  );
} finally {
  await browser.close();
}
