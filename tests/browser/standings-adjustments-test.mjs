// Step 2.56, part 2: Admin → Standings and stats, the season's adjustments. At 390 wide, by
// taps from the admin's own menu, the owner adds an adjustment with its reason (scripts
// on): a refused save keeps what was typed, marks the wrong box and says why beside it;
// "Saved" is said at the top of the list; the public table shows the footnote. Then, with
// scripts off, the same: a refusal for a missing reason, the adjustment taken off with its
// reason after the tick, and the footnote gone. The made-up world; `--no-build` uses the
// build already there.
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
const reason = 'Forfeit penalty for round 3, by ruling of the league';
const area = '/north-valley/admin/standings';

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

async function signedIn(javaScriptEnabled) {
  const context = await browser.newContext({ viewport: phone, javaScriptEnabled });
  await context.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { context, page };
}

async function openArea(page) {
  await page.goto(`${origin}/north-valley/admin`);
  await openStaffMenu(page);
  await Promise.all([
    page.waitForURL((url) => url.pathname === area),
    page.getByRole('navigation', { name: 'Admin areas' }).locator(`a[href="${area}"]`).click(),
  ]);
  await page.getByRole('heading', { level: 1, name: 'Standings and stats' }).waitFor();
}

/** The public table's text, read in a fresh signed-out page. */
async function publicTable() {
  const context = await browser.newContext({ viewport: phone });
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/north-valley/standings`);
    await page.locator('main').waitFor();
    return (await page.locator('main').textContent()) ?? '';
  } finally {
    await context.close();
  }
}

async function noSideScroll(page, label) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  note(`${label}: nothing wider than the phone`, wide <= phone.width, String(wide));
}

const add = (page) => page.locator('form[data-form=add-adjustment]');

if (browser) {
  await step('an adjustment added, refused once (scripts on)', async () => {
    const { context, page } = await signedIn(true);
    try {
      await openArea(page);
      await noSideScroll(page, 'the adjustments screen');
      const team = await add(page).getByLabel('Team').inputValue();
      const teamName = (
        await add(page).locator(`select[name=team] option[value="${team}"]`).textContent()
      )?.trim();
      // "two" is not a number: refused beside the Wins box, with everything kept.
      await add(page).getByLabel('Wins').fill('two');
      await add(page).getByLabel('Reason').fill(reason);
      await add(page).getByRole('button', { name: 'Add the adjustment' }).click();
      const problem = add(page).locator('[data-problem=add-adjustment]');
      await problem.waitFor();
      note(
        'refused: the sentence says why',
        ((await problem.textContent()) ?? '').startsWith('Type a whole number'),
      );
      note(
        'refused: the Wins box is marked',
        (await add(page).getByLabel('Wins').getAttribute('aria-invalid')) === 'true',
      );
      note(
        'refused: what was typed is kept',
        (await add(page).getByLabel('Reason').inputValue()) === reason &&
          (await add(page).getByLabel('Wins').inputValue()) === 'two',
      );
      await add(page).getByLabel('Wins').fill('1');
      await add(page).getByRole('button', { name: 'Add the adjustment' }).click();
      const said = page.locator('#adjustments').getByText(/^Saved: /);
      await said.waitFor();
      note(
        '"Saved" at the top of the list, naming the team and the change',
        (await said.textContent()) === `Saved: ${teamName}, +1 win. The table is worked out again.`,
        (await said.textContent()) ?? '',
      );
      note(
        'the adjustment is listed with its reason',
        (await page.locator('.admin-adjustment', { hasText: reason }).count()) === 1,
      );
      const table = await publicTable();
      note(
        'the public table shows the footnote',
        table.includes(`Adjusted by +1 win. ${reason}`),
        table.slice(0, 400),
      );
      await noSideScroll(page, 'the adjustments screen with one listed');
    } finally {
      await context.close();
    }
  });

  await step('the adjustment taken off with its reason (scripts off)', async () => {
    const { context, page } = await signedIn(false);
    try {
      await openArea(page);
      const listed = page.locator('.admin-adjustment', { hasText: reason });
      const remove = listed.locator('form[data-form=remove-adjustment]');
      // No reason: refused beside the reason box, the tick kept as it was asked for again.
      await remove.getByLabel('Yes, take this adjustment off').check();
      await remove.getByLabel('Why it comes off').fill(' ');
      await remove.getByRole('button', { name: 'Take it off' }).click();
      const problem = page
        .locator('.admin-adjustment', { hasText: reason })
        .locator('[data-problem=remove-adjustment]');
      await problem.waitFor();
      note(
        'scripts off, refused: the sentence asks why',
        ((await problem.textContent()) ?? '').startsWith('Say why'),
      );
      // Said beside the one form sent, not beside every adjustment's (the made-up season
      // holds one of its own).
      note(
        'scripts off, refused: said beside that adjustment only',
        (await page.locator('[data-problem=remove-adjustment]').count()) === 1,
        String(await page.locator('[data-problem=remove-adjustment]').count()),
      );
      const again = page
        .locator('.admin-adjustment', { hasText: reason })
        .locator('form[data-form=remove-adjustment]');
      await again.getByLabel('Why it comes off').fill('Ruling withdrawn');
      await again.getByLabel('Yes, take this adjustment off').check();
      await again.getByRole('button', { name: 'Take it off' }).click();
      const said = page.getByText(/^Taken off: /);
      await said.waitFor();
      note('scripts off: "Taken off" is said', (await said.count()) === 1);
      note(
        'the adjustment is no longer listed',
        (await page.locator('.admin-adjustment', { hasText: reason }).count()) === 0,
      );
      const table = await publicTable();
      note('the public footnote is gone', !table.includes(reason), table.slice(0, 400));
    } finally {
      await context.close();
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Standings adjustments browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Standings adjustments browser test passed (${checked.length} checks).`);
