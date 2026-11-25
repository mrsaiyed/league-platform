// Step 2.182 (A-18): a season visitors cannot see says so, and the owner can show it, in a
// real browser at phone width (390), on the web app's made-up stand-in (APP_ENV=test).
// Nothing leaves this computer; every league, team and season is made up. Scripts are off,
// so every form is a plain post or a plain address. Builds the app first unless given
// --no-build; --dev runs `next dev` instead.
//
// The made-up owner starts at the admin's home (/north-valley/admin, typed: no page links
// to it yet) and only taps from there: Schedule, the season not public yet (Winter 2027),
// a first round, Publish. The sentence says the schedule is published but visitors cannot
// see Winter 2027 yet, never "Visitors can see it now", with a link to Season settings.
// The owner taps it, taps "Show this season to visitors", is asked once, says yes; a
// visitor (a second browser with no sign-in) then picks Winter 2027 on the league's home
// and finds its game on its schedule. "Hide it again" asks first; after yes, the visitor's
// season address is "Page not found" again. A scheduler who publishes the hidden season is
// told to ask the league's owner or an admin, with no link and no button, and Season
// settings is not theirs to open.
import {
  accessibilityProblems,
  buildNext,
  freePort,
  leagueDay,
  launch,
  openStaffMenu,
  startNext,
  waitFor,
  whatWentWrong,
} from './web-browser-kit.mjs';

// The rounds' days: over a year after the made-up world's today (it reads this computer's
// clock), so always ahead, whatever day it is run (T-404).
const worldNow = new Date().toISOString();
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
const now = 'Visitors can see it now';

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
    // The pages its first taps reach, as the made-up owner: the admin's home, Schedule and
    // the hidden season's schedule, each drawn once before the browser starts.
    const owner = 'srl_session=local-owner-token';
    await waitFor(`${origin}/`, server, [
      { address: '/north-valley/admin', cookie: owner },
      { address: '/north-valley/admin/schedule', cookie: owner },
      { address: '/north-valley/admin/schedule?season=winter-2027', cookie: owner },
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
      const wide = await on.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      );
      note(`no sideways scrolling at phone width: ${label}`, wide);
    };
    /** Taps a link or button, waits for the page it leads to, and checks its address. */
    const tap = async (on, locator, url) => {
      await Promise.all([on.waitForEvent('load'), locator.click()]);
      if (!url.test(on.url())) throw new Error(`landed on ${on.url()}, not ${url}`);
    };
    const mainText = (on) => on.locator('main').innerText();
    /** Admin → Schedule, the hidden season, a first round, then Publish. */
    const publishHidden = async (on, label, date) => {
      // The admin's areas are behind its own menu button on a phone (step 2.103).
      await openStaffMenu(on);
      await tap(
        on,
        on.locator('nav').getByRole('link', { name: 'Schedule', exact: true }).first(),
        /\/admin\/schedule$/,
      );
      const picker = on.locator('form', { has: on.locator('select[name=season]') }).first();
      await picker
        .locator('select[name=season]')
        .selectOption({ label: 'Winter 2027 (not public yet)' });
      await tap(on, picker.locator('button'), /season=winter-2027/);
      const panel = on.locator('[data-no-rounds] form');
      const form = (await panel.count()) === 1 ? panel : on.locator('details[data-add-round] form');
      if ((await panel.count()) === 0) {
        await on.locator('details[data-add-round] summary').click();
      }
      await form.locator('input[name=label]').fill(label);
      await form.locator('input[name=date]').fill(date);
      await tap(on, form.getByRole('button', { name: 'Add round' }), /saved=round-added/);
      await tap(on, on.getByRole('button', { name: 'Publish this schedule' }), /done=published/);
      return on.locator('[data-published]');
    };

    at = 'the owner opens the admin and publishes the hidden season';
    await page.goto(`${origin}/north-valley/admin`);
    const said = await publishHidden(page, 'Week 1', leagueDay(worldNow, 400));
    const words = (await said.innerText()) ?? '';
    note(
      'publishing a hidden season says visitors cannot see it yet',
      words.includes('The schedule is published, but visitors cannot see Winter 2027 yet.'),
      words,
    );
    note('and never "Visitors can see it now"', !(await mainText(page)).includes(now));
    const link = said.getByRole('link', { name: 'Show it in Season settings.' });
    note('it links to Season settings', (await link.count()) === 1);
    await accessible(page, 'published, but hidden');

    at = 'the owner taps the link and shows the season';
    await tap(page, link, /\/admin\/season\?season=winter-2027#who-can-see$/);
    const panel = page.locator('#who-can-see');
    note(
      'Season settings says only the people who run the league can see it',
      (await panel.innerText()).includes('Only the people who run the league can see Winter 2027.'),
    );
    const show = panel.getByRole('button', { name: 'Show this season to visitors' });
    note('"Show" is the main button', (await show.getAttribute('data-kind')) === 'main');
    await accessible(page, 'Season settings, a hidden season');
    await tap(page, show, /ask=show/);
    const asked = await panel.innerText();
    note(
      'it asks once, saying what visitors will see',
      asked.includes(
        'Show Winter 2027 to visitors? Visitors will see its teams, schedule and results.',
      ),
      asked,
    );
    note('it has not changed yet', asked.includes('Only the people who run the league can see'));
    await accessible(page, 'the question before showing');
    await tap(page, panel.getByRole('button', { name: 'Yes, show it' }), /done=shown/);
    const shown = await page.locator('#who-can-see').innerText();
    note(
      'Season settings says everyone can see it now',
      shown.includes('Visitors can see Winter 2027 now.') &&
        shown.includes('Everyone can see Winter 2027.'),
      shown,
    );

    at = 'a visitor finds the season and its games from the league home';
    const visitor = await signedIn(undefined);
    await visitor.goto(`${origin}/north-valley`);
    // The header's season picker, in the phone's menu, with its own button: scripts are off.
    await visitor.locator('.site-header .site-menu summary').click();
    await visitor
      .locator('.site-header select[name=season]')
      .selectOption({ label: 'Winter 2027' });
    await tap(visitor, visitor.locator('.site-season button[type=submit]'), /season=winter-2027/);
    await tap(
      visitor,
      visitor.getByRole('link', { name: 'See the schedule' }).first(),
      /\/schedule\?season=winter-2027/,
    );
    const schedule = await mainText(visitor);
    note(
      "the visitor sees the season's schedule with its games",
      (await visitor.locator('main a[href*="/games/"]').count()) > 0,
      schedule.slice(0, 300),
    );
    const seasonAddress = visitor.url();
    await accessible(visitor, "a visitor's schedule of the shown season");

    at = 'the owner hides it again';
    const hide = page.locator('#who-can-see').getByRole('button', { name: 'Hide it again' });
    note(
      '"Hide it again" looks different: a danger button',
      (await hide.getAttribute('data-kind')) === 'danger',
    );
    await tap(page, hide, /ask=hide/);
    const hideAsk = await page.locator('#who-can-see').innerText();
    note(
      'hiding asks first and says what disappears',
      hideAsk.includes('Hide Winter 2027 from visitors?') && hideAsk.includes('Page not found'),
      hideAsk,
    );
    note(
      'the visitor still sees it while the question is open',
      (await visitor.goto(seasonAddress))?.status() === 200,
    );
    await tap(
      page,
      page.locator('#who-can-see').getByRole('button', { name: 'Yes, hide it' }),
      /done=hidden/,
    );
    note(
      'Season settings says it is hidden again',
      (await page.locator('#who-can-see').innerText()).includes(
        'Only the people who run the league can see Winter 2027.',
      ),
    );
    const gone = await visitor.goto(seasonAddress);
    note(
      "the visitor's season address answers 404 again",
      gone?.status() === 404,
      `${gone?.status()}`,
    );
    await visitor.context().close();
    // The words, read as a visitor with scripts on: with scripts off, the not-found screen
    // of a page that has begun to stream is in the page's text but not drawn (reported to
    // the lead; not this step's).
    const reader = await browser.newContext({ viewport: screen });
    const readerPage = await reader.newPage();
    const goneAgain = await readerPage.goto(seasonAddress);
    await readerPage.waitForLoadState('networkidle');
    note(
      'the visitor\'s season address says "Page not found" again',
      goneAgain?.status() === 404 &&
        // Whatever case the page's styles draw the title in.
        (await readerPage.locator('body').innerText()).toLowerCase().includes('page not found'),
      `${goneAgain?.status()}`,
    );
    await reader.close();

    at = 'a scheduler publishes the hidden season';
    const scheduler = await signedIn('local-scheduler-token');
    await scheduler.goto(`${origin}/north-valley/admin`);
    const theirs = await publishHidden(scheduler, 'Week 2', leagueDay(worldNow, 407));
    const theirWords = await theirs.innerText();
    note(
      'the scheduler is told whom to ask',
      theirWords.includes('visitors cannot see Winter 2027 yet.') &&
        theirWords.includes("Ask the league's owner or an admin to show it."),
      theirWords,
    );
    note(
      'with no link, no button and no "Visitors can see it now"',
      (await theirs.getByRole('link').count()) === 0 &&
        (await scheduler.getByRole('button', { name: 'Show this season to visitors' }).count()) ===
          0 &&
        !(await mainText(scheduler)).includes(now),
    );
    await accessible(scheduler, "the scheduler's published, but hidden");
    const refused = await scheduler.goto(`${origin}/north-valley/admin/season?season=winter-2027`);
    note(
      'Season settings is not the scheduler’s',
      refused?.status() === 403 &&
        (await scheduler.getByRole('button', { name: 'Show this season to visitors' }).count()) ===
          0,
      `${refused?.status()}`,
    );
  } catch (error) {
    failures.push(`${at}: ${whatWentWrong(error)}`);
  } finally {
    await browser?.close();
    server.child.kill();
  }
}

if (failures.length > 0) {
  console.error(`Season shown browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Season shown browser test passed: ${checked.length} checks in a real browser.`);
