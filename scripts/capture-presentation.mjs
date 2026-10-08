import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'artifacts/principal-screenshots');
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE || undefined,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 885 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const url = pathToFileURL(path.join(root, 'dist/Al-Hadi League Demo.html')).href;
const open = async (route) => {
  await page.goto(`${url}#${route}`);
  await page.locator('#main').waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map(async (img) => {
        img.loading = 'eager';
        await img.decode();
      }),
    );
  });
};
const screenshot = async (name, locator) => {
  const target = locator ? page.locator(locator) : page;
  await target.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' });
};
try {
  await open('home');
  await screenshot('01-homepage');
  await screenshot('02-team-journey', '.school-story');
  await page.setViewportSize({ width: 1440, height: 1100 });
  await open('media');
  await screenshot('03-full-game-and-highlights', '.video-library');
  await screenshot('04-media-page');
  await open('schedule');
  await screenshot('05-schedule');
  await open('stats');
  await screenshot('06-player-statistics');
  await open('admin');
  await screenshot('07-commissioner');
  await page.setViewportSize({ width: 390, height: 844 });
  await open('home');
  await screenshot('08-mobile-homepage');
  assert.deepEqual(errors, []);
  console.log('Exported 8 high-resolution presentation screenshots with all images decoded.');
} finally {
  await context.close();
  await browser.close();
}
