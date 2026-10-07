import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = pathToFileURL(path.join(root, 'dist/Al-Hadi League Demo.html')).href;
const screenshots = path.join(root, 'artifacts/screenshots');
fs.mkdirSync(screenshots, { recursive: true });
const options = { headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined };
let browser;
const context = process.env.BROWSER_PROFILE_DIR
  ? await chromium.launchPersistentContext(path.resolve(process.env.BROWSER_PROFILE_DIR), options)
  : await (async () => {
      browser = await chromium.launch(options);
      return browser.newContext();
    })();
for (const existing of context.pages()) await existing.close();
const page = await context.newPage();
const errors = [];
const external = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (req) => {
  if (/^https?:/.test(req.url())) external.push(req.url());
});
const go = async (route) => {
  await page.goto(url + '#' + route);
  await page.locator('#main').waitFor();
};
const capture = async (name) => {
  await page.waitForFunction(() => !document.querySelector('#toast').classList.contains('visible'));
  return page.screenshot({ path: path.join(screenshots, name + '.png'), fullPage: true });
};

try {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await go('home');
  await page.locator('[data-action=reset]').click();
  await page.locator('[data-action=confirm-reset]').click();
  await page.waitForFunction(() => !document.querySelector('#toast').classList.contains('visible'));
  const routes = [
    'home',
    'schedule',
    'teams',
    'team/falcons',
    'standings',
    'stats',
    'about',
    'awards',
    'register',
    'my-league',
    'admin',
    'admin/registrations',
    'admin/draft',
    'admin/schedule',
    'admin/scoring',
    'admin/settings',
    'game/g3',
  ];
  const views = {
    home: '01-public-home',
    register: '02-registration',
    'my-league': '03-my-league',
    admin: '04-commissioner',
    'admin/draft': '05-draft',
    'admin/scoring': '06-scoring',
    'admin/settings': '07-settings',
  };
  for (const route of routes) {
    await go(route);
    assert.ok(
      (await page.locator('#main h1').count()) > 0 || route.startsWith('game/'),
      'Page title missing: ' + route,
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      'Desktop overflow: ' + route,
    );
    if (views[route]) await capture(views[route]);
  }
  await go('register');
  await page.locator('select[name=grade]').selectOption('10');
  await page.locator('input[name=consent]').check();
  await page.locator('#registration-form button[type=submit]').click();
  await page.locator('[data-action=pay]').click();
  await page.getByRole('heading', { name: 'Application received, Demo.' }).waitFor();
  await go('my-league');
  assert.ok((await page.locator('#main').innerText()).includes('Application pending'));
  await go('admin/registrations');
  await page.locator('#app-search').fill('Demo Student');
  assert.equal(await page.locator('tr[data-app-name]:visible').count(), 1);
  await page.locator('#app-search').fill('');
  const row = page.locator('tr[data-app-name="arman shah"]');
  await row.locator('[data-action=review]').click();
  await page.locator('#eligibility-check').check();
  await page.locator('[data-action=approve]').click();
  assert.ok((await row.innerText()).includes('Confirmed'));
  await go('admin/draft');
  await page.locator('[data-action=pick][data-id=p1]').click();
  assert.equal(await page.locator('[data-action=pick][data-id=p1]').count(), 0);
  await page.reload();
  await page.locator('#main').waitFor();
  assert.equal(await page.locator('[data-action=pick][data-id=p1]').count(), 0);
  await page.locator('[data-action=undo-pick]').click();
  assert.equal(await page.locator('[data-action=pick][data-id=p1]').count(), 1);
  await go('admin/schedule');
  await page.locator('[data-action=generate-schedule]').first().click();
  assert.equal(await page.locator('.schedule-row').count(), 12);
  await page.locator('[data-action=publish-schedule]').click();
  await page.locator('[data-action=confirm-publish]').click();
  await page.getByRole('button', { name: 'Published in demo' }).waitFor();
  await go('admin/scoring');
  await page.locator('[data-action=points][data-points="2"]').click();
  assert.equal(await page.locator('#score-falcons').innerText(), '34');
  await page.locator('[data-action=undo-score]').click();
  assert.equal(await page.locator('#score-falcons').innerText(), '32');
  await page.locator('[data-action=clock]').click();
  await page.waitForFunction(() => document.querySelector('#live-clock').textContent !== '8:24');
  await page.locator('[data-action=clock]').click();
  assert.equal(await page.locator('[data-player-seconds=p5]').innerText(), '0:00');
  await page.locator('[data-action=substitution]').click();
  await page.locator('[data-action=confirm-sub]').click();
  assert.ok(
    (await page.locator('[data-action=select-player][data-id=p5]').innerText()).includes(
      'On court',
    ),
  );
  await go('admin/settings');
  await page.locator('[data-action=toggle][data-key=awards]').click();
  await go('home');
  assert.equal(await page.locator('.public-nav a[href="#awards"]').count(), 0);
  await page.locator('[data-action=reset]').click();
  await page.locator('[data-action=confirm-reset]').click();
  await go('my-league');
  await page.locator('[data-action=read-all]').click();
  assert.equal(await page.locator('.account-link i').innerText(), '0');
  await page.locator('[data-action=preferences]').click();
  await page.locator('#email-reminders').uncheck();
  await page.locator('[data-action=save-preferences]').click();
  await page.locator('[data-action=preferences]').click();
  assert.equal(await page.locator('#email-reminders').isChecked(), false);
  await page.locator('[data-action=close]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of routes) {
    await go(route);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      'Mobile overflow: ' + route,
    );
    if (route === 'home') await capture('08-mobile-home');
    if (route === 'my-league') await capture('09-mobile-account');
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    'Passed 17 desktop and 17 mobile route checks, critical demo interactions, reload recovery, and zero external requests.',
  );
} finally {
  await context.close();
  if (browser) await browser.close();
}
