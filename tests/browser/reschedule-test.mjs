// Step 2.53 part 2 (S-49, A-21, T-326): a game postponed with "decide later" waits in Admin →
// Games under "Waiting for a new date", which Schedule links to; "Give it a new date" puts
// its new date in the schedule draft, the schedule is published, and the game is on the
// public schedule on its new date, no longer postponed. In a real browser at phone width
// (390), with scripts off (plain forms), on the web app's made-up stand-in (APP_ENV=test);
// nothing leaves this computer and every team and game is made up. Builds the app first
// unless given --no-build; --dev runs `next dev`. Things are found by their own `data-…`
// marks; the addresses typed are where an admin starts (Admin → Games, Admin → Schedule) and the public schedule.
import {
  buildNext,
  freePort,
  leagueDay,
  leagueDayWords,
  launch,
  startNext,
  waitFor,
  whatWentWrong,
} from './web-browser-kit.mjs';

// The new date: over a year after the made-up world's today (it reads this computer's clock),
// so always ahead, whatever day it is run (T-404); `newDay` is how the page writes it, "Mar 6".
const worldNow = new Date().toISOString();
const newDate = leagueDay(worldNow, 400);
const newDay = leagueDayWords(worldNow, 400).split(', ')[1] ?? newDate;
const failures = [];
const checked = [];
const note = (label, ok, detail = '') => {
  checked.push(label);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const dev = process.argv.includes('--dev');
let built = true;
if (!dev && !process.argv.includes('--no-build')) {
  built = await buildNext();
  if (!built) failures.push('next build failed or took over 10 minutes');
}
const screen = { width: 390, height: 844 };

if (built) {
  const origin = `http://localhost:${await freePort()}`;
  const port = new URL(origin).port;
  const server = startNext(dev ? ['dev', '--port', port] : ['start', '--port', port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  let browser;
  let at = 'starting';
  try {
    await waitFor(`${origin}/`, server);
    browser = await launch();
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: screen });
    await context.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(dev ? 120_000 : 60_000);
    const tap = async (locator) => {
      await Promise.all([page.waitForEvent('load'), locator.click()]);
    };

    at = 'postponing asks, offering a new date now or later';
    await page.goto(`${origin}/north-valley/admin/games`);
    const form = page.locator('form[data-call-off-act="postpone"]').first();
    note('a game can be postponed', (await form.count()) === 1);
    const gameId = await form.locator('input[name="gameId"]').getAttribute('value');
    await form.locator('xpath=ancestor::details[1]/summary').click();
    await tap(form.locator('button[type="submit"]'));
    const ask = page.locator('[data-call-off-ask="postpone"]');
    note('the question is asked', (await ask.count()) === 1);
    note(
      'it offers the new date at once (S-49)',
      (await ask.locator('[data-postpone-new-date]').count()) === 1,
    );
    // "Yes" takes a tap only after the question has been read for a moment.
    await page.waitForTimeout(1500);
    await tap(ask.locator('button[type="submit"]:not([data-postpone-new-date])'));
    note('the game is postponed', (await page.locator('[data-call-off-ask]').count()) === 0);

    at = 'Schedule leads to the waiting game';
    await page.goto(`${origin}/north-valley/admin/schedule`);
    const toWaiting = page.locator('[data-to-waiting]');
    note('Schedule links to the games waiting for a new date', (await toWaiting.count()) === 1);
    await tap(toWaiting);
    note('Games links to it too', (await page.locator('[data-to-waiting]').count()) === 1);
    const waiting = page.locator(`[data-waiting-game="${gameId}"]`);
    note('the postponed game waits for a new date', (await waiting.count()) === 1);
    const give = waiting.locator('[data-new-date-form]');
    note('it offers "Give it a new date"', (await give.count()) === 1);

    at = 'giving it a new date puts it in the draft';
    await give.locator('[data-new-date-date]').fill(newDate);
    await give.locator('[data-new-date-time]').fill('19:00');
    await tap(give.locator('[data-new-date-save]'));
    note(
      'the grid has a draft',
      (await page.locator('[data-draft-bar]').count()) === 1,
      page.url(),
    );
    const inGrid = page.locator(`[data-game="${gameId}"]`);
    note('the game is in the grid on its new date', (await inGrid.innerText()).includes(newDay));

    at = 'publishing puts it on the public schedule';
    await tap(page.locator('[data-publish-submit]'));
    note(
      'published: said once, the address holding no answer',
      (await page.locator('[role=status]', { hasText: 'The schedule is published' }).count()) ===
        1 && !/[?&](done|saved|problem)=/.test(page.url()),
      page.url(),
    );
    await tap(page.locator('[data-to-waiting]'));
    note(
      'it no longer waits for a new date',
      (await page.locator(`[data-waiting-game="${gameId}"]`).count()) === 0,
    );
    await page.goto(`${origin}/north-valley/schedule`);
    const link = page.locator(`main a[href*="${gameId}"]`);
    note('the game is on the public schedule', (await link.count()) > 0);
    if ((await link.count()) > 0) {
      await tap(link.first());
      const text = await page.locator('main').innerText();
      note('on its new date', text.includes(newDay), text.slice(0, 300));
      note('and no longer postponed', !/postponed/i.test(text), text.slice(0, 300));
    }
  } catch (error) {
    failures.push(`${at}: ${whatWentWrong(error)}`);
  } finally {
    await browser?.close();
    server.child.kill();
  }
}

if (failures.length > 0) {
  console.error(`reschedule: ${failures.length} problem(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`reschedule: ${checked.length} checks passed.`);
