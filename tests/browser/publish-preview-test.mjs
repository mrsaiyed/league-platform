// Step 2.53: the publish summary names each game it changes and asks about a standing clash
// by name, without refusing; "Review and publish" and the draft's count stay in view down
// the grid; publishing is one tap from the summary; a game added to a published schedule
// gets its game number when it is published. In a real browser at phone width (390), with
// scripts off (plain forms), on the web app's made-up stand-in (APP_ENV=test); nothing
// leaves this computer and every team and game is made up. Builds the app first unless
// given --no-build; --dev runs `next dev`. Things are found by their own `data-…` marks.
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
  whatWentWrong,
} from './web-browser-kit.mjs';

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
    const address = `${origin}/north-valley/admin/schedule`;
    const tap = async (locator) => {
      await Promise.all([page.waitForEvent('load'), locator.click()]);
    };
    const onScreen = async (locator) => {
      const box = await locator.first().boundingBox();
      return box !== null && box.y >= 0 && box.y + Math.min(box.height, 40) <= screen.height;
    };
    const round = (n) => page.locator('section[data-round]').nth(n - 1);
    const lastRound = async () => round(await page.locator('section[data-round]').count());
    async function addGame(where, home, away, time, court) {
      const add = where.locator('details[data-add-game]');
      await add.locator('summary').click();
      await add.locator('select[name=homeTeamId]').selectOption({ label: home });
      await add.locator('select[name=awayTeamId]').selectOption({ label: away });
      await add.locator('input[name=time]').fill(time);
      await add.locator('select[name=place]').selectOption({ label: `Central Gym: ${court}` });
      await tap(add.locator('button[type=submit]'));
    }

    at = 'the owner opens the schedule';
    await page.goto(address);
    note('no draft at first', (await page.locator('[data-draft-bar]').count()) === 0);
    const teams = await page.$$eval(
      'section[data-round] details[data-add-game] select[name=homeTeamId] option',
      (o) => [...new Set(o.map((x) => x.textContent).filter((x) => x && !/Choose/.test(x)))],
    );
    note('four teams to choose from', teams.length >= 4, `${teams.length}`);
    const [a, b, c] = teams;

    at = 'two games are added far down the grid, one team in both at the same time';
    await addGame(await lastRound(), a, b, '07:00', 'Court 1');
    await addGame(await lastRound(), a, c, '07:00', 'Court 2');
    const bar = page.locator('[data-draft-bar]');
    note('the draft bar counts two changes', (await bar.getAttribute('data-draft-count')) === '2');
    // After the action, wherever the page has put the person, the bar is in view.
    await (await lastRound()).locator('details[data-add-game] summary').scrollIntoViewIfNeeded();
    note('the draft bar stays in view down the grid', await onScreen(bar));
    const review = bar.locator('[data-review-publish]');
    note('"Review and publish" is beside "Draft in progress"', (await review.count()) === 1);
    const wide = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    note('no sideways scrolling at phone width', wide);
    const problems = await accessibilityProblems(page);
    note('accessibility', problems.length === 0, problems.join('; '));

    at = 'the summary names the games and asks about the clash';
    await review.click();
    note('the link leads to the publish box', page.url().endsWith('#publish-heading'));
    const box = page.locator('section:has(#publish-heading)');
    const added = box.locator('[data-publish-game][data-change=added]');
    const addedText = (await added.allInnerTexts()).join(' | ');
    note(
      'the summary names each added game with its day and time',
      (await added.count()) === 2 &&
        addedText.includes(`${b} at ${a}`) &&
        addedText.includes(`${c} at ${a}`) &&
        addedText.includes('7:00 AM'),
      addedText,
    );
    const reach = (await box.locator('[data-publish-reach]').innerText()).trim();
    note('the summary counts teams and people', /\d+ teams and \d+ people/.test(reach), reach);
    const ask = box.locator('[data-publish-ask]');
    const askText = (await ask.count()) === 1 ? await ask.innerText() : '';
    note(
      'the question names the clash and asks "Publish anyway?"',
      askText.includes(`${a}: booked twice on`) &&
        askText.includes('at 7:00 AM') &&
        askText.includes('Publish anyway?'),
      askText,
    );
    note('the clash is no blocker', (await box.locator('[data-kind="error"]').count()) === 0);
    const ids = await added.evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-publish-game')),
    );

    at = 'one tap publishes';
    const submit = box.getByRole('button', { name: 'Publish this schedule' });
    note('the publish button is in view from the summary', await onScreen(submit));
    await tap(submit);
    note('published', page.url().includes('done=published'), page.url());
    note('no draft is left', (await page.locator('[data-draft-bar]').count()) === 0);

    at = 'the new games are on the public schedule, each with its game number';
    for (const id of ids) {
      await page.goto(`${origin}/north-valley/schedule`);
      const link = page.locator(`main a[href*="${id}"]`);
      note(`the added game ${id} is on the public schedule`, (await link.count()) > 0);
      if ((await link.count()) === 0) continue;
      await page.goto(new URL((await link.first().getAttribute('href')) ?? '', origin).href);
      const text = await page.locator('main').innerText();
      note(`the added game ${id} has its game number`, /game \d+/i.test(text), text.slice(0, 200));
    }
  } catch (error) {
    failures.push(`${at}: ${whatWentWrong(error)}`);
  } finally {
    await browser?.close();
    server.child.kill();
  }
}

if (failures.length > 0) {
  console.error(`publish-preview: ${failures.length} problem(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`publish-preview: ${checked.length} checks passed.`);
