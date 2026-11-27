// Step 2.253 (T-519): in an archived league the admin's box score page is still viewable
// (U-9: "read-only, still viewable"), in a real browser at phone width, against the web app
// on its made-up stand-in (APP_ENV=test). Nothing leaves this computer; every team, game
// and person is made up. Builds the app first unless given --no-build.
//
// - The owner of the archived league (Old Meadow, 300 games all final) opens Games, an
//   earlier round, and one of its games: the box score page shows the game, not "Page not
//   found", with the one line saying why nothing can be changed, and no way to change it:
//   no save, no reopen, every score box disabled.
// - Accessibility checks (T-186) and no sideways scrolling at phone width (A-2).
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  openStaffMenu,
  startNext,
  waitFor,
} from './web-browser-kit.mjs';

const failures = [];
const checked = [];
const note = (label, ok, detail = '') => {
  checked.push(label);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};
const step = async (name, run) => {
  try {
    await run();
  } catch (error) {
    failures.push(`${name}: ${String(error?.message ?? error).split('\n')[0]}`);
  }
};

const league = 'old-meadow';
const roundTen = 'r-01900000-0000-7000-8000-0000b600000a';
const readOnlyLine = 'This league is archived, so its games can be viewed but not changed.';
const phone = { width: 390, height: 844 };

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}

let server;
let browser;
const origin = `http://localhost:${await freePort()}`;

if (built) {
  server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  await step('starting the server and the browser', async () => {
    await waitFor(`${origin}/`, server);
    browser = await launch();
  });
}

const part = (page, title) =>
  page.locator('section.ui-section').filter({
    has: page.getByRole('heading', { level: 2, name: title, exact: true }),
  });

if (browser) {
  await step(
    "the owner opens an archived league's final game: the sheet, unchangeable",
    async () => {
      const context = await browser.newContext({ viewport: phone });
      await context.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      try {
        await page.goto(`${origin}/${league}/admin`);
        await openStaffMenu(page);
        await Promise.all([
          page.waitForURL((url) => url.pathname === `/${league}/admin/games`),
          page
            .getByRole('navigation', { name: 'Admin areas' })
            .locator(`a[href="/${league}/admin/games"]`)
            .click(),
        ]);
        await page.getByRole('link', { name: 'Earlier games', exact: true }).first().click();
        await Promise.all([
          page.waitForURL((url) => url.searchParams.get('round') === roundTen),
          part(page, 'Earlier games').getByLabel('Round').selectOption(roundTen),
        ]);
        const first = part(page, 'Earlier games').locator('li[id^="game-"]').first();
        await first.waitFor();
        const gameId = (await first.getAttribute('id'))?.slice(5) ?? '';
        const response = await page.goto(`${origin}/${league}/admin/games/${gameId}`);
        note(
          'the box score page answers 200',
          response?.status() === 200,
          String(response?.status()),
        );
        const title = await page.getByRole('heading', { level: 1 }).first().textContent();
        note(
          'its heading is the box score, not "Page not found"',
          (title ?? '').startsWith('Box score:'),
          String(title),
        );
        note(
          'one line says why nothing can be changed',
          (await page.getByText(readOnlyLine, { exact: true }).count()) === 1,
        );
        note(
          'no save is offered',
          (await page.getByRole('button', { name: 'Save box score and make it final' }).count()) ===
            0,
        );
        note(
          'no reopen is offered',
          (await page.getByRole('button', { name: 'Reopen to correct' }).count()) === 0,
        );
        const boxes = page.locator('main input[type="number"], main input[inputmode="numeric"]');
        const count = await boxes.count();
        const enabled = await boxes.evaluateAll((all) => all.filter((b) => !b.disabled).length);
        note(
          'the scores are shown in boxes, every one disabled',
          count > 0 && enabled === 0,
          `${count} boxes, ${enabled} enabled`,
        );
        const problems = await accessibilityProblems(page);
        note('accessibility: archived box score', problems.length === 0, problems.join('; '));
        const [width, inner] = await page.evaluate(() => [
          document.documentElement.scrollWidth,
          window.innerWidth,
        ]);
        note('no sideways scrolling at phone width', width <= inner, `${width} > ${inner}`);
      } finally {
        await context.close();
      }
    },
  );
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Archived box score browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Archived box score browser test passed (${checked.length} checks).`);
