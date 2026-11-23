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
      // 5000 wins is past what the command takes: said beside the box, naming the limits.
      await add(page).getByLabel('Wins').fill('5000');
      await add(page).getByRole('button', { name: 'Add the adjustment' }).click();
      await add(page)
        .getByText(/^That is too big a change/)
        .waitFor();
      note(
        'refused: 5000 wins is said beside the Wins box, with the limits',
        ((await problem.textContent()) ?? '').includes('from -1000 to 1000') &&
          (await add(page).getByLabel('Wins').getAttribute('aria-invalid')) === 'true' &&
          (await add(page).getByLabel('Wins').inputValue()) === '5000',
        (await problem.textContent()) ?? '',
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
      // Taking it off with no reason is refused; the tick stays as it was.
      const remove = page
        .locator('.admin-adjustment', { hasText: reason })
        .locator('form[data-form=remove-adjustment]');
      await remove.getByLabel('Yes, take this adjustment off').check();
      await remove.getByLabel('Why it comes off').fill(' ');
      await remove.getByRole('button', { name: 'Take it off' }).click();
      await remove.locator('[data-problem=remove-adjustment]').waitFor();
      note(
        'scripts on, refused: the tick is kept',
        await remove.getByLabel('Yes, take this adjustment off').isChecked(),
      );
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
      note(
        'scripts off, refused: the tick is kept',
        await again.getByLabel('Yes, take this adjustment off').isChecked(),
      );
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

/**
 * Every public row as { team: { GP, W, L, T } }, read in a fresh signed-out page, with the
 * page's whole text for the footnotes.
 */
async function publicRows() {
  const context = await browser.newContext({ viewport: phone });
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/north-valley/standings`);
    await page.locator('main table').first().waitFor();
    const rows = await page.evaluate(() => {
      const found = {};
      for (const table of document.querySelectorAll('main table')) {
        const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
        for (const tr of table.querySelectorAll('tbody tr')) {
          const team = tr.querySelector('.ui-team-name')?.textContent.trim() ?? '';
          const cells = [...tr.children].map((cell) => cell.textContent.trim());
          const row = {};
          heads.forEach((head, i) => {
            row[head] = Number(cells[i]);
          });
          found[team] = row;
        }
      }
      return found;
    });
    return { rows, text: (await page.locator('main').textContent()) ?? '' };
  } finally {
    await context.close();
  }
}

/** Games played is wins + losses (+ ties) for a team's public row. */
function addsUp(rows, team) {
  const row = rows[team];
  return row !== undefined && row.GP === row.W + row.L + (Number.isNaN(row.T) ? 0 : (row.T ?? 0));
}

const overturnWhy = 'Ineligible player found after the game';
const awardWhy = 'The other team did not come, by ruling of the league';

if (browser) {
  await step('a result overturned and a game awarded (scripts on)', async () => {
    const { context, page } = await signedIn(true);
    try {
      await openArea(page);
      const overturn = page.locator('form[data-form=overturn-result]');
      const award = page.locator('form[data-form=award-game]');
      // A picture to look at, only when asked for (SHOTS=<folder>).
      if (process.env.SHOTS) {
        await page.screenshot({
          path: `${process.env.SHOTS}/standings-pairs-390.png`,
          fullPage: true,
        });
      }
      await noSideScroll(page, 'the adjustments screen with the two new forms');
      // The game chosen first: "Falcons 61–55 Badgers" names both teams.
      const game = (
        await overturn.locator('select[name=game] option').first().textContent()
      )?.trim();
      const named = /^(.+?) \d+–\d+ (.+)$/.exec(game ?? '');
      note('the overturn form names a decided game by its score', named !== null, game ?? '');
      const [, home, away] = named ?? ['', '', ''];
      const before = await publicRows();
      await overturn.getByLabel('Reason').fill(overturnWhy);
      await overturn.getByRole('button', { name: 'Overturn the result' }).click();
      await page
        .locator('#adjustments')
        .getByText(/^Saved: the result of /)
        .waitFor();
      const after = await publicRows();
      for (const team of [home, away]) {
        note(`overturned: ${team}'s games played adds up`, addsUp(after.rows, team));
        note(
          `overturned: ${team}'s games played is unchanged`,
          after.rows[team]?.GP === before.rows[team]?.GP,
        );
      }
      note(
        'overturned: the footnote names the game',
        after.text.includes(`${game}: ${overturnWhy}`),
        after.text.slice(0, 300),
      );
      // Awarded: the first two teams listed, as the form offers them.
      const winner = (
        await award.locator('select[name=winner] option:checked').textContent()
      )?.trim();
      const loser = (
        await award.locator('select[name=loser] option:checked').textContent()
      )?.trim();
      await award.getByLabel('Reason').fill(awardWhy);
      await award.getByRole('button', { name: 'Award the game' }).click();
      await page.locator('.admin-adjustment', { hasText: awardWhy }).first().waitFor();
      const awarded = await publicRows();
      for (const team of [winner, loser]) {
        note(`awarded: ${team}'s games played adds up`, addsUp(awarded.rows, team));
        note(
          `awarded: ${team} has one game more`,
          awarded.rows[team]?.GP === (after.rows[team]?.GP ?? NaN) + 1,
          `${after.rows[team]?.GP} → ${awarded.rows[team]?.GP}`,
        );
      }
      note('awarded: the footnote gives the reason', awarded.text.includes(awardWhy));
      note(
        'each action is listed as two halves',
        (await page.locator('.admin-adjustment', { hasText: overturnWhy }).count()) === 2 &&
          (await page.locator('.admin-adjustment', { hasText: awardWhy }).count()) === 2,
      );
      await noSideScroll(page, 'the adjustments screen with two pairs listed');
      // One half taken off: both go.
      const half = page
        .locator('.admin-adjustment', { hasText: overturnWhy })
        .first()
        .locator('form[data-form=remove-adjustment]');
      await half.getByLabel('Why it comes off').fill('The ruling was withdrawn');
      await half.getByLabel('Yes, take this adjustment off').check();
      await half.getByRole('button', { name: 'Take it off' }).click();
      await page.getByText(/^Taken off: /).waitFor();
      note(
        'one half taken off takes both off',
        (await page.locator('.admin-adjustment', { hasText: overturnWhy }).count()) === 0,
      );
      const undone = await publicRows();
      note('the overturn footnote is gone', !undone.text.includes(overturnWhy));
      for (const team of [home, away]) {
        // Back as before the overturn, with only the award's change (if it touched them).
        const awardMoved = awarded.rows[team]?.W - after.rows[team]?.W;
        note(
          `taken off: ${team}'s wins are back as they were`,
          undone.rows[team]?.W === before.rows[team]?.W + awardMoved,
          `${before.rows[team]?.W} / ${undone.rows[team]?.W}`,
        );
      }
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
