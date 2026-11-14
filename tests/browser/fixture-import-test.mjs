// Step 2.54: the fixture import screen in a real browser, against the web app on its made-up
// stand-in (APP_ENV=test). Nothing leaves this computer; every team, venue and person is
// made up. Builds the app first unless given --no-build (npm run test:web:browser builds it
// once in web-exit-test.mjs, then runs this with --no-build).
//
// As the made-up scheduler of the first league: open the screen, upload a made-up file with
// two bad rows, read the report (each bad row named in plain words, the good games listed),
// add the games to the schedule draft, and undo that, with the draft's count of changes
// going 0, 3, 0. Accessibility checks on each screen (T-186), and no sideways scrolling of
// the page at phone width (A-2). A coach of the same league and the scheduler in another
// league are refused (U-6).
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
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

/** Three good games, a team the season does not have (row 4) and a date that does not exist (row 5). */
const madeUpFile = [
  'Date,Time,Home,Away,Venue,Court,Home score,Away score',
  '2027-01-09,18:00,Lions,Tigers,Central Gym,Court 1,,',
  '2027-01-09,19:30,Hawks,Bears,Central Gym,Court 2,,',
  '2027-01-16,18:00,Lions,Comets,Central Gym,Court 1,,',
  '2027-02-30,18:00,Tigers,Hawks,Central Gym,Court 1,,',
  '2027-01-16,19:30,Bears,Lions,Central Gym,Court 2,52,47',
].join('\n');

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
const screen = '/north-valley/admin/schedule/import';

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

async function open(page, address) {
  const response = await page.goto(origin + address);
  await page.locator('main').first().waitFor();
  return response;
}
async function accessible(page, label) {
  // After a form's step the page is drawn in place and its title follows a moment later
  // (Next.js streams it); give it a few seconds, and the check below still fails if none comes.
  await page
    .waitForFunction(() => document.title.trim() !== '', null, { timeout: 5000 })
    .catch(() => {});
  const problems = await accessibilityProblems(page);
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
}
async function noSidewaysScroll(page, label) {
  const [width, inner] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  note(`no sideways scrolling at phone width: ${label}`, width <= inner, `${width} > ${inner}`);
}
const shows = async (page, text) => (await page.getByText(text).count()) > 0;

if (browser) {
  await step('import, apply and undo a file with two bad rows', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    try {
      await context.addCookies([
        { name: 'srl_session', value: 'local-scheduler-token', url: origin },
      ]);
      const page = await context.newPage();
      await open(page, screen);
      await page.getByRole('heading', { level: 1, name: 'Import fixtures' }).waitFor();
      note('the draft starts empty', await shows(page, 'The schedule draft is empty'));
      await accessible(page, 'the import screen');
      await noSidewaysScroll(page, 'the import screen');

      await page.getByLabel('Spreadsheet file (CSV)').setInputFiles({
        name: 'made-up-fixtures.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(madeUpFile),
      });
      await Promise.all([
        page.waitForURL((url) => url.searchParams.get('done') === 'upload'),
        page.getByRole('button', { name: 'Upload and check' }).click(),
      ]);
      await page.getByText('2 rows will be left out').waitFor();
      note('the report names the file', await shows(page, 'File: made-up-fixtures.csv'));
      note('the report counts the good games', await shows(page, '3 games can be added.'));
      const problems = await page
        .getByRole('region', { name: '2 rows will be left out' })
        .getByRole('listitem')
        .allTextContents();
      note(
        'each bad row is named with its problem in words',
        problems.length === 2 &&
          problems[0].startsWith('Row 4: ') &&
          problems[1].startsWith('Row 5: ') &&
          problems.every((p) => p.length > 'Row 4: '.length + 5),
        JSON.stringify(problems),
      );
      note(
        'the unknown team is named in its row',
        problems.some((p) => p.includes('Comets')),
        JSON.stringify(problems),
      );
      const rows = await page
        .getByRole('region', { name: 'Games in the file' })
        .locator('tbody tr');
      note('the good games are listed with their teams', (await rows.count()) === 3);
      note('a final score is shown', await shows(page, '52–47'));
      await accessible(page, 'the report');
      await noSidewaysScroll(page, 'the report');

      await Promise.all([
        page.waitForURL((url) => url.searchParams.get('done') === 'apply'),
        page.getByRole('button', { name: 'Add 3 games to the schedule draft' }).click(),
      ]);
      await page.getByText('The games were added to the schedule draft.').waitFor();
      note(
        'the draft now holds the three games',
        await shows(page, 'The schedule draft has 3 changes that are not published yet.'),
      );
      note(
        'the waiting score is explained',
        await shows(page, '1 final score will be recorded once its game is published.'),
      );
      await accessible(page, 'after adding the games');

      await Promise.all([
        page.waitForURL((url) => url.searchParams.get('done') === 'undo'),
        page.getByRole('button', { name: 'Undo this import' }).click(),
      ]);
      await page.getByText('The import was undone.', { exact: false }).first().waitFor();
      note('undo empties the draft again', await shows(page, 'The schedule draft is empty'));
      note(
        'the import says it was undone',
        await shows(page, 'This import was undone: its games were taken out of the draft.'),
      );
      note(
        'an undone import offers neither add nor undo',
        (await page
          .getByRole('button', { name: /Add .* to the schedule draft|Undo this import/ })
          .count()) === 0,
      );
      await accessible(page, 'after undoing');
    } finally {
      await context.close();
    }
  });

  await step('people without the schedule are refused', async () => {
    for (const [token, address, label] of [
      ['local-coach-token', screen, 'a coach of the league'],
      ['local-scheduler-token', '/harbor-city/admin/schedule/import', "another league's scheduler"],
    ]) {
      const context = await browser.newContext();
      try {
        await context.addCookies([{ name: 'srl_session', value: token, url: origin }]);
        const page = await context.newPage();
        const response = await open(page, address);
        await page
          .getByText(/you do not have access/i)
          .first()
          .waitFor();
        note(`${label} is refused`, response?.status() === 403);
        note(
          `${label} sees no upload form`,
          (await page.getByLabel('Spreadsheet file (CSV)').count()) === 0,
        );
      } finally {
        await context.close();
      }
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Fixture import browser check failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Fixture import browser check passed: ${checked.length} checks in a real browser.`);
