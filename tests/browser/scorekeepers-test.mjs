// Step 2.56, part 2: Admin → Games → Scorekeepers. At 390 wide, by taps from the admin's own
// menu, in the made-up league that scores assigned games only (quiet-pines), the owner
// assigns the made-up scorekeeper to a game with scripts on: "Saved" is said in that game's
// block and they are listed; the same choice sent again from a page opened before is
// refused beside the box, keeping the choice. The scorekeeper then finds the game in "My
// games to score". With scripts off the owner takes them off; it is said, they are gone,
// and the game leaves the scorekeeper's list. The activity log is not checked here: the
// made-up world's Admins page lists no activity (the commands' own tests check the lines).
// `--no-build` uses the build already there.
import {
  buildNext,
  freePort,
  launch,
  openStaffMenu,
  startNext,
  waitFor,
  worldAtNoon,
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

const phone = { width: 390, height: 844 };
const league = '/quiet-pines';
const games = `${league}/admin/games`;
const area = `${games}/scorekeepers`;
const scorekeeperName = 'Sam Scorekeeper';

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
    LOCAL_NOW: worldAtNoon(),
  });
  await step('starting the server and the browser', async () => {
    await waitFor(`${origin}/`, server);
    browser = await launch();
  });
}

async function signedIn(token, javaScriptEnabled) {
  const context = await browser.newContext({ viewport: phone, javaScriptEnabled });
  await context.addCookies([{ name: 'srl_session', value: token, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { context, page };
}

/** Admin → Games → Scorekeepers by taps: the menu, then the link at the top of Games. */
async function openArea(page) {
  await page.goto(`${origin}${league}/admin`);
  await openStaffMenu(page);
  await Promise.all([
    page.waitForURL((url) => url.pathname === games),
    page.getByRole('navigation', { name: 'Admin areas' }).locator(`a[href="${games}"]`).click(),
  ]);
  await Promise.all([
    page.waitForURL((url) => url.pathname === area),
    page.locator(`main a[href="${area}"]`).click(),
  ]);
  await page.getByRole('heading', { level: 1, name: 'Scorekeepers' }).waitFor();
}

async function noSideScroll(page, label) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  note(`${label}: nothing wider than the phone`, wide <= phone.width, String(wide));
}

const block = (page, gameId) => page.locator(`[id="game-${gameId}"]`);
const assigned = (page, gameId) =>
  block(page, gameId).locator(`li[data-person="${scorekeeperName}"]`);

/** Whether the made-up scorekeeper's "My games to score" shows the game. */
async function onScorekeepersList(gameId) {
  const { context, page } = await signedIn('local-scorekeeper-token', true);
  try {
    await page.goto(`${origin}${games}`);
    await page.locator('main').waitFor();
    return (await page.locator(`main [id="game-${gameId}"]`).count()) > 0;
  } finally {
    await context.close();
  }
}

let gameId = '';
let gameText = '';

if (browser) {
  await step('the scorekeeper assigned, and refused a second time (scripts on)', async () => {
    const { context, page } = await signedIn('local-owner-token', true);
    try {
      await openArea(page);
      await noSideScroll(page, 'the scorekeepers screen');
      // The soonest game with a time the scorekeeper is not on, where they may be chosen.
      const free = page
        .locator('[id^="game-"]')
        .filter({ has: page.locator('option', { hasText: new RegExp(`^${scorekeeperName}$`) }) })
        // A game with no time is on no list of Games (P4), so one with a time.
        .filter({ hasNotText: 'No time set' })
        .first();
      gameId = ((await free.getAttribute('id')) ?? '').replace(/^game-/, '');
      gameText = ((await free.locator('h3, p').allTextContents()) ?? []).join(' / ');
      note('a game the scorekeeper may be assigned to', gameId !== '');
      note('not on their list before', !(await onScorekeepersList(gameId)));
      // A second page, opened now, still offers them for that game.
      const stale = await context.newPage();
      await stale.goto(`${origin}${area}`);
      const form = (p) => block(p, gameId).locator('form[data-form=assign-scorekeeper]');
      await form(page).getByLabel('Who').selectOption({ label: scorekeeperName });
      await form(page).getByRole('button', { name: 'Assign' }).click();
      const said = block(page, gameId).getByText(`${scorekeeperName} is assigned to`);
      await said.waitFor();
      note('"Saved" is said in the game’s block', (await said.count()) === 1);
      note(
        'the scorekeeper is listed under the game',
        (await assigned(page, gameId).count()) === 1,
      );
      // The same choice from the page opened before: refused beside the box, kept.
      await form(stale).getByLabel('Who').selectOption({ label: scorekeeperName });
      await form(stale).getByRole('button', { name: 'Assign' }).click();
      const problem = block(stale, gameId).locator('[data-problem=assign-scorekeeper]');
      await problem.waitFor();
      note(
        'refused: the sentence says why',
        ((await problem.textContent()) ?? '').includes('already assigned'),
      );
      const box = block(stale, gameId).getByLabel('Who');
      note('refused: the box is marked', (await box.getAttribute('aria-invalid')) === 'true');
      note(
        'refused: the choice is kept',
        ((await box.locator('option:checked').textContent()) ?? '').startsWith(scorekeeperName),
      );
      await noSideScroll(stale, 'the refusal');
    } finally {
      await context.close();
    }
  });

  await step('the assigned scorekeeper finds the game to score', async () => {
    note('on their list once assigned', await onScorekeepersList(gameId), gameText);
  });

  await step('the scorekeeper taken off (scripts off)', async () => {
    const { context, page } = await signedIn('local-owner-token', false);
    try {
      await openArea(page);
      await assigned(page, gameId).getByRole('button', { name: 'Take off' }).click();
      const said = block(page, gameId).getByText(`${scorekeeperName} is taken off`);
      await said.waitFor();
      note('scripts off: "taken off" is said in the game’s block', (await said.count()) === 1);
      note('the scorekeeper is no longer listed', (await assigned(page, gameId).count()) === 0);
      await noSideScroll(page, 'scripts off');
    } finally {
      await context.close();
    }
    note('gone from their list once taken off', !(await onScorekeepersList(gameId)));
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Scorekeepers browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Scorekeepers browser test passed (${checked.length} checks).`);
