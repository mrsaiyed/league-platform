// Step 2.56, part 1: when a game reads "Corrected" in public (S-81). At 390 wide, by taps
// from the admin's own menu: a scheduler makes a game final, reopens it with a reason and
// ends it again with the same score (a slip undone): the public game page shows no mark.
// Then, with scripts off, they reopen it again and end it with a different score: the
// public page now reads "Corrected on <date>", and never the reason. The made-up world
// (apps/web/src/server/stand-in-games.ts); `--no-build` uses the build already there.
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

const game = '01900000-0000-7000-8000-006a00000001'; // Tigers at Lions, final score only
const phone = { width: 390, height: 844 };
const reasonLabel = 'Why it needs correcting (kept in the log, never shown publicly)';
const reason = 'Typed 47 for the Tigers; the sheet says 49';

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

const row = (page) => page.locator(`li[id="game-${game}"]`);

async function openGames(page) {
  await page.goto(`${origin}/north-valley/admin`);
  await openStaffMenu(page);
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/north-valley/admin/games'),
    page
      .getByRole('navigation', { name: 'Admin areas' })
      .locator('a[href="/north-valley/admin/games"]')
      .click(),
  ]);
  await page.getByRole('heading', { level: 1, name: 'Games' }).waitFor();
}

async function makeFinal(page, tigers, lions) {
  // The boxes are shut on the list until tapped; a reopen lands with them open.
  if (!(await row(page).getByLabel('Score for Tigers').isVisible())) {
    await row(page).getByText('Enter the final score').click();
  }
  await row(page).getByLabel('Score for Tigers').fill(String(tigers));
  await row(page).getByLabel('Score for Lions').fill(String(lions));
  await row(page).getByRole('button', { name: 'Save final score' }).click();
  await row(page).getByRole('button', { name: 'Yes, make it final' }).click();
  // After a reopen the row already says so in its status; wait for the save's own answer.
  await row(page)
    .getByText(/^Saved: /)
    .or(row(page).getByRole('alert'))
    .waitFor();
  note(
    `"Saved" for ${tigers}-${lions}`,
    (await row(page).getByRole('status').textContent()) ===
      `Saved: Tigers ${tigers}, Lions ${lions} is final.`,
    (await row(page).textContent()) ?? '',
  );
}

async function reopen(page) {
  await Promise.all([
    page.waitForURL((url) => url.pathname === `/north-valley/admin/games/${game}`),
    row(page).getByRole('link', { name: 'Correct this result' }).click(),
  ]);
  await page.getByLabel(reasonLabel).fill(reason);
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/north-valley/admin/games'),
    page.getByRole('button', { name: 'Reopen to correct' }).click(),
  ]);
  await row(page).getByLabel('Score for Tigers').waitFor();
}

/** The public game page's text, read in a fresh signed-out page. */
async function publicText() {
  const context = await browser.newContext({ viewport: phone });
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/north-valley/games/${game}`);
    await page.locator('main').waitFor();
    return (await page.locator('main').textContent()) ?? '';
  } finally {
    await context.close();
  }
}

async function signedIn(javaScriptEnabled) {
  const context = await browser.newContext({ viewport: phone, javaScriptEnabled });
  await context.addCookies([{ name: 'srl_session', value: 'local-scheduler-token', url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { context, page };
}

if (browser) {
  await step('a slip undone leaves no mark (scripts on)', async () => {
    const { context, page } = await signedIn(true);
    try {
      await openGames(page);
      await makeFinal(page, 47, 51);
      note('a game never corrected reads no mark', !/Corrected on/.test(await publicText()));
      await reopen(page);
      await makeFinal(page, 47, 51);
      const text = await publicText();
      note(
        'reopened and ended again with the same score: no mark',
        !/Corrected on/.test(text),
        text,
      );
    } finally {
      await context.close();
    }
  });

  await step('a changed score reads "Corrected" (scripts off)', async () => {
    const { context, page } = await signedIn(false);
    try {
      await openGames(page);
      await reopen(page);
      const open = await publicText();
      note('while it is reopened: no "Corrected" yet', !/Corrected on/.test(open), open);
      await makeFinal(page, 49, 51);
      const text = await publicText();
      note(
        'ended with a different score: "Corrected on" a date',
        /Corrected on \w+/.test(text),
        text,
      );
      note('the reason is never public', !text.includes(reason));
    } finally {
      await context.close();
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Corrected mark browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Corrected mark browser test passed (${checked.length} checks).`);
