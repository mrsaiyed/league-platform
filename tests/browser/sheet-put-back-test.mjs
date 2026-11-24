// Step 2.229's done test in the browser (A-5, T-366, S-98): a box score typed for Tigers
// at Lions, reopened and saved again as a final score only, is put back as it was from
// the game's own page: every line, the standings and the season's totals are as before
// the reopen, the activity log has each act once and the public page reads no
// "Corrected" mark. The same after a forfeit. A put back from a page drawn before
// something newer was saved is refused in plain words (and its reason, typed as markup,
// stays text), and a scorekeeper, who may not correct games, is not offered it. The
// made-up world (apps/web/src/server/stand-in-games.ts); `--no-build` uses the build
// already there.
import {
  buildNext,
  freePort,
  launch,
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
    const lines = String(error?.message ?? error).split('\n');
    const waiting = lines.find((line) => line.includes('waiting for')) ?? '';
    failures.push(`${name}: ${lines[0]} ${waiting.trim()}`);
  }
};

const game = '01900000-0000-7000-8000-006a00000001'; // Tigers at Lions, no score yet
const wide = { width: 1280, height: 900 };
const sheetPath = `/north-valley/admin/games/${game}`;
const reopenLabel = 'Why it needs correcting (kept in the log, never shown publicly)';
const putBackLabel = 'Why the sheet goes back (kept in the log, never shown publicly)';
const putBackButton = 'Put the sheet back as it was';
const newerSaved =
  'Something newer was saved on this game, so the sheet can no longer be put back as it was.';
const attack = '<img src=x onerror="window.__putBackHarm=1">Wrong sheet';

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

async function signedIn(token) {
  const context = await browser.newContext({ viewport: wide });
  await context.addCookies([{ name: 'srl_session', value: token, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { context, page };
}

/** Every box of the game's grid, in screen order: a tick as true or false, a number as typed. */
const gridOf = (page) =>
  page
    .locator('main [data-sheet-team] input:not([type=hidden])')
    .evaluateAll((boxes) => boxes.map((b) => (b.type === 'checkbox' ? b.checked : b.value)));

async function openSheet(page) {
  await page.goto(`${origin}${sheetPath}`);
  await page.locator('main [data-sheet-team]').first().waitFor();
}

/** A public page's text, read signed out. */
async function publicText(path) {
  const context = await browser.newContext({ viewport: wide });
  try {
    const page = await context.newPage();
    await page.goto(`${origin}${path}`);
    await page.locator('main').waitFor();
    return (await page.locator('main').textContent()) ?? '';
  } finally {
    await context.close();
  }
}

const everything = async (page) => ({
  grid: JSON.stringify(await gridOf(page)),
  standings: await publicText('/north-valley/standings'),
  stats: await publicText('/north-valley/stats'),
});

/** How many entries of the owner's activity log match each act. */
async function actCounts(page) {
  await page.goto(`${origin}/north-valley/admin/settings/activity`);
  await page.locator('[data-activity-log]').waitFor();
  const all = await page.locator('[data-activity-log] li[data-entry]').allTextContents();
  const count = (pattern) => all.filter((e) => pattern.test(e)).length;
  return {
    boxScore: count(/Recorded a box score/),
    reopen: count(/Reopened (a|the) final game/),
    finalScore: count(/Recorded a final score/),
    forfeit: count(/Recorded a forfeit/),
    putBack: count(/back as it was before it was reopened/),
  };
}

async function reopen(page) {
  await openSheet(page);
  await page.getByLabel(reopenLabel).fill('Saved the wrong thing');
  await page.getByRole('button', { name: 'Reopen to correct' }).click();
  await page.getByText('The game is reopened. Fix the grid and save it again.').waitFor();
}

const row = (page) => page.locator(`li[id="game-${game}"]`);

async function saveFinalScoreOnly(page) {
  await page.goto(`${origin}/north-valley/admin/games`);
  if (!(await row(page).getByLabel('Score for Tigers').isVisible())) {
    await row(page).getByText('Enter the final score').click();
  }
  await row(page).getByLabel('Score for Tigers').fill('60');
  await row(page).getByLabel('Score for Lions').fill('50');
  await row(page).getByRole('button', { name: 'Save final score' }).click();
  await row(page).getByRole('button', { name: 'Yes, make it final' }).click();
  await row(page).getByText('Saved: Tigers 60, Lions 50 is final.').waitFor();
}

async function saveForfeit(page) {
  await page.goto(`${origin}/north-valley/admin/games`);
  await row(page).getByText('Forfeit, postpone or cancel').click();
  const forfeit = row(page).locator('form[data-call-off-act="forfeit"]');
  await forfeit.getByLabel('Team that forfeits').selectOption({ label: 'Tigers' });
  await forfeit.getByRole('button', { name: 'Record forfeit' }).click();
  await row(page).locator('[data-call-off-ask]').waitFor();
  // A "Yes" within the first moments is taken as a double tap and only asks again.
  await page.waitForTimeout(1000);
  await row(page).getByRole('button', { name: 'Yes, record the forfeit' }).click();
  await row(page)
    .getByText(/^Saved: /)
    .waitFor();
}

async function putBack(page, reason) {
  const form = page.locator('[data-put-back-form]');
  await form.getByLabel(putBackLabel).fill(reason);
  await form.getByRole('button', { name: putBackButton }).click();
}

/** Saved again some other way, then put back: everything as before the reopen. */
async function roundTrip(page, label, saveAgain, act) {
  await openSheet(page);
  const before = await everything(page);
  const actsBefore = await actCounts(page);
  await reopen(page);
  await saveAgain(page);
  await openSheet(page);
  const lost = await everything(page);
  note(`${label}: the lines are gone once saved again (S-27)`, lost.grid !== before.grid);
  note(`${label}: the totals changed once saved again`, lost.stats !== before.stats);
  const form = page.locator('[data-put-back-form]');
  note(`${label}: "${putBackButton}" is offered`, (await form.count()) === 1);
  // A second drawing of the page, kept for later: it holds the version seen now.
  const old = await page.context().newPage();
  await openSheet(old);
  await putBack(page, 'The sheet was right');
  await page
    .getByText(
      'The box score is back as it was before the game was reopened, and the game is final again.',
    )
    .waitFor();
  // Read afresh: a box keeps what the browser drew in it until the page is opened again.
  await openSheet(page);
  const after = await everything(page);
  note(
    `${label}: every line is as before the reopen`,
    after.grid === before.grid,
    `${after.grid} against ${before.grid}`,
  );
  note(`${label}: the standings are as before the reopen`, after.standings === before.standings);
  note(`${label}: the totals are as before the reopen`, after.stats === before.stats);
  note(`${label}: no offer once put back`, (await form.count()) === 0);
  const text = await publicText(`/north-valley/games/${game}`);
  note(`${label}: the public page reads no "Corrected" mark (S-98)`, !/Corrected/.test(text), text);
  note(`${label}: the reasons are never public`, !text.includes('The sheet was right'));
  const actsAfter = await actCounts(page);
  const delta = Object.fromEntries(
    Object.entries(actsAfter).map(([key, n]) => [key, n - actsBefore[key]]),
  );
  note(
    `${label}: the activity log has each act once`,
    JSON.stringify(delta) ===
      JSON.stringify({
        boxScore: 0,
        reopen: 1,
        finalScore: act === 'finalScore' ? 1 : 0,
        forfeit: act === 'forfeit' ? 1 : 0,
        putBack: 1,
      }),
    JSON.stringify(delta),
  );
  // The old page, after the put back (something newer): refused in plain words, the
  // reason kept as typed and only as text.
  await putBack(old, attack);
  const refusal = old.locator('[data-put-back-form]').getByRole('alert');
  await refusal.waitFor();
  const said = ((await refusal.textContent()) ?? '').trim();
  note(
    `${label}: a put back after a newer save is refused in plain words`,
    said === newerSaved,
    said,
  );
  note(
    `${label}: the refused reason is kept as text, never as markup`,
    (await old.getByLabel(putBackLabel).inputValue()) === attack &&
      (await old.locator('main img[src="x"]').count()) === 0 &&
      (await old.evaluate(() => window.__putBackHarm)) === undefined,
  );
  await old.close();
  note(
    `${label}: the refused put back changed nothing`,
    (await actCounts(page)).putBack === actsAfter.putBack,
  );
}

if (browser) {
  await step('a box score typed and saved', async () => {
    const { context, page } = await signedIn('local-owner-token');
    try {
      await openSheet(page);
      const points = page.locator('main input[name^="stat.points."]');
      const count = await points.count();
      note('the grid has points boxes', count >= 4, String(count));
      for (let i = 0; i < count; i += 1) await points.nth(i).fill(String(3 + (i % 5)));
      await page.getByRole('button', { name: 'Save box score and make it final' }).click();
      await page.getByText(/^Saved: .* is final, with its box score\.$/).waitFor();
    } finally {
      await context.close();
    }
  });

  await step('saved again as a final score only, then put back', async () => {
    const { context, page } = await signedIn('local-owner-token');
    try {
      await roundTrip(page, 'final score only', saveFinalScoreOnly, 'finalScore');
    } finally {
      await context.close();
    }
  });

  await step(
    'saved again as a forfeit, then put back; a scorekeeper is not offered it',
    async () => {
      const { context, page } = await signedIn('local-owner-token');
      try {
        await roundTrip(page, 'forfeit', saveForfeit, 'forfeit');
        // Saved the wrong thing once more, so the put back is offered to whoever may correct.
        await reopen(page);
        await saveFinalScoreOnly(page);
        await openSheet(page);
        note(
          'offered again to the owner',
          (await page.locator('[data-put-back-form]').count()) === 1,
        );
      } finally {
        await context.close();
      }
      const keeper = await signedIn('local-scorekeeper-token');
      try {
        await keeper.page.goto(`${origin}${sheetPath}`);
        await keeper.page.locator('main h1').waitFor();
        const heading = (await keeper.page.locator('main h1').textContent()) ?? '';
        note('the scorekeeper sees the game’s own page', /Tigers/.test(heading), heading);
        note(
          'a scorekeeper, who may not correct games, is not offered the put back',
          (await keeper.page.locator('[data-put-back-form]').count()) === 0 &&
            (await keeper.page.getByRole('button', { name: putBackButton }).count()) === 0,
        );
      } finally {
        await keeper.context.close();
      }
    },
  );
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Sheet put back browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Sheet put back browser test passed (${checked.length} checks).`);
