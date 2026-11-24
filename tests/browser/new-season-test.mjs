// Step 2.130: "Start a new season" in Season settings. The owner starts Spring 2027 with
// the teams (rosters left behind) and Summer 2027 with teams and rosters; each says it is
// ready and hidden, and the public season picker leaves it out until it is shown, then has
// both. Summer 2027 is made current; Spring 2027 is archived after a question that says it
// becomes read-only and cannot be un-archived, and it stays under the season picker.
// Pages are found by their own marks; no check passes on a timeout.
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  openStaffMenu,
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
    const owner = 'srl_session=local-owner-token';
    await waitFor(`${origin}/`, server, [
      { address: '/north-valley/admin/season', cookie: owner },
      { address: '/north-valley/admin/teams', cookie: owner },
    ]);
    browser = await launch();
    const signedIn = async (token) => {
      const context = await browser.newContext({ javaScriptEnabled: false, viewport: screen });
      if (token !== undefined) {
        await context.addCookies([{ name: 'srl_session', value: token, url: origin }]);
      }
      const page = await context.newPage();
      page.setDefaultTimeout(dev ? 120_000 : 60_000);
      return page;
    };
    const page = await signedIn('local-owner-token');
    const accessible = async (on, label) => {
      const problems = await accessibilityProblems(on);
      note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
    };
    /** Taps a link or button, waits for the page it leads to, and checks its address. */
    const tap = async (on, locator, url) => {
      await Promise.all([on.waitForEvent('load'), locator.click()]);
      if (!url.test(on.url())) throw new Error(`landed on ${on.url()}, not ${url}`);
    };
    /** The public season picker's choices, as a visitor sees them. */
    const pickerSeasons = async () => {
      const visitor = await signedIn(undefined);
      await visitor.goto(`${origin}/north-valley`);
      const names = await visitor
        .locator('.site-header select[name=season] option')
        .allInnerTexts();
      await visitor.context().close();
      return names.map((n) => n.trim());
    };
    /** "Start a new season" in Season settings, with one choice of what teams come. */
    const start = async (name, slug, carry) => {
      await page.goto(`${origin}/north-valley/admin/season`);
      const form = page.locator('form[data-start-season-form]');
      await form.locator('input[name=name]').fill(name);
      await form.locator('input[name=slug]').fill(slug);
      await form.locator(`input[name=carry][value=${carry}]`).check();
      await tap(
        page,
        form.getByRole('button', { name: 'Start the season', exact: true }),
        new RegExp(`season=${slug}&done=started`),
      );
      const said = await page.locator('[data-notice=done]').innerText();
      note(
        `${name}: the screen says it is ready and hidden`,
        said.includes(`${name} is ready. Visitors cannot see it until you show it.`),
        said,
      );
      note(
        `${name}: it is hidden`,
        (await page.locator('[data-season-visibility=hidden]').count()) === 1,
      );
    };
    /** Shows the season on the page, by step 2.182's own question. */
    const show = async (slug) => {
      const panel = page.locator('#who-can-see');
      await tap(
        page,
        panel.getByRole('button', { name: 'Show this season to visitors' }),
        /ask=show/,
      );
      await tap(
        page,
        page.getByRole('button', { name: 'Yes, show it' }),
        new RegExp(`season=${slug}&done=shown`),
      );
    };

    at = 'the owner reads what a new season copies';
    await page.goto(`${origin}/north-valley/admin/season`);
    const copies = await page.locator('[data-start-copies]').innerText();
    note(
      'the form says what is copied and what is not',
      copies.includes('game rules') &&
        copies.includes('divisions') &&
        copies.includes('Not copied'),
      copies,
    );
    await accessible(page, 'Season settings with "Start a new season"');

    at = 'the owner starts two seasons';
    await start('Spring 2027', 'spring-2027', 'teams');
    const before = await pickerSeasons();
    note(
      'a hidden new season is not in the public season picker',
      !before.includes('Spring 2027'),
      before.join(', '),
    );
    await show('spring-2027');
    await start('Summer 2027', 'summer-2027', 'teams-and-rosters');
    await show('summer-2027');
    const after = await pickerSeasons();
    note(
      'once shown, the public season picker has both',
      after.includes('Spring 2027') && after.includes('Summer 2027'),
      after.join(', '),
    );

    at = 'the teams came along';
    for (const slug of ['spring-2027', 'summer-2027']) {
      await page.goto(`${origin}/north-valley/admin/teams?season=${slug}`);
      note(
        `${slug}: its teams were brought`,
        (await page.locator('main a[href*="/admin/teams/"]').count()) > 0,
      );
    }

    at = 'the owner makes Summer 2027 current and archives the old one';
    await page.goto(`${origin}/north-valley/admin/season?season=summer-2027`);
    await tap(page, page.locator('[data-season-change=current]'), /ask=current/);
    await tap(page, page.getByRole('button', { name: 'Yes, make it current' }), /done=current/);
    note(
      'it says the season is current now',
      (await page.locator('[data-season-state=current]').count()) === 1,
    );
    await page.goto(`${origin}/north-valley/admin/season?season=spring-2027`);
    await tap(page, page.locator('[data-season-change=archive]'), /ask=archive/);
    const ask = await page.locator('[data-season-ask=archive]').innerText();
    note(
      'before archiving it says it is read-only and cannot be un-archived',
      ask.includes('read-only') && ask.includes('cannot be un-archived'),
      ask,
    );
    await accessible(page, 'the archive question');
    await tap(page, page.getByRole('button', { name: 'Yes, archive it' }), /done=archived/);
    note('it says it is archived', (await page.locator('[data-season-archived]').count()) === 1);
    note(
      'an archived season offers no archive button',
      (await page.locator('[data-season-change=archive]').count()) === 0,
    );
    const kept = await pickerSeasons();
    note(
      'the archived season stays under the season picker',
      kept.includes('Spring 2027'),
      kept.join(', '),
    );
  } catch (error) {
    failures.push(`${at}: ${whatWentWrong(error)}`);
  } finally {
    await browser?.close();
    server.child.kill();
  }
}

if (failures.length > 0) {
  console.error(`New season browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`New season browser test passed: ${checked.length} checks in a real browser.`);
