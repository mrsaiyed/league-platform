// Step 2.77 (A-6): the activity log's own screen. In a real browser at phone width (390), by
// taps, on the web app's made-up stand-in (APP_ENV=test): made-up leagues and people,
// nothing leaves this computer. Builds the app first unless given --no-build.
//
// The made-up owner starts at the admin's home (typed, as the other browser tests do); from
// there only taps, scripts off:
// - adds enough teams for the log to need a second page, then removes a team, hides the
//   current season from visitors and shows it again;
// - League settings → Admins → "See the whole activity log": all three with who and when;
//   the season's two entries say hidden, then shown; the removal leads to the bin while
//   the team is there, and once it is brought back the log says so first;
// - "Older" and "Newer" page through it; "What was changed" keeps the teams' entries only;
//   "Who" keeps one person's; a span of days with nothing in it says so.
// With scripts on: choosing a kind of thing applies it at once. A coach and a scorekeeper
// are refused the page. Each page passes the accessibility checks and nothing scrolls
// sideways at 390.
import {
  accessibilityProblems,
  binAnswer,
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

const phone = { width: 390, height: 844 };
const run = Date.now().toString(36).slice(-4);
const larks = `Larks ${run}`;
const owner = 'Robin Example';
const logAddress = '/north-valley/admin/settings/activity';

let built = true;
if (!process.argv.includes('--no-build')) {
  try {
    built = await buildNext();
  } catch (error) {
    failures.push(`building the web app: ${whatWentWrong(error)}`);
    built = false;
  }
}

const origin = `http://localhost:${await freePort()}`;
let server;
let browser;
let at = 'starting';
if (built) {
  server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  try {
    await waitFor(`${origin}/`, server, [
      { address: logAddress, cookie: 'srl_session=local-owner-token' },
    ]);
    browser = await launch();
    const open = async (scripts, token = 'local-owner-token') => {
      const context = await browser.newContext({ javaScriptEnabled: scripts, viewport: phone });
      await context.addCookies([{ name: 'srl_session', value: token, url: origin }]);
      const page = await context.newPage();
      page.setDefaultTimeout(60_000);
      return page;
    };
    const page = await open(false);
    /** Taps a link or button and waits until the address matches. */
    const tap = async (p, locator, url) => {
      await Promise.all([p.waitForURL(url), locator.click()]);
    };
    const checks = async (p, label) => {
      const problems = await accessibilityProblems(p);
      note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
      const wide = await p.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      );
      note(`no sideways scrolling at 390: ${label}`, wide);
    };
    const toArea = async (p, name, url) => {
      await openStaffMenu(p);
      await tap(p, p.locator('nav').getByRole('link', { name, exact: true }).first(), url);
    };
    const toLog = async (p) => {
      await toArea(p, 'League settings', /\/admin\/settings$/);
      await tap(p, p.getByRole('link', { name: 'Admins', exact: true }), /\/settings\/admins$/);
      await tap(p, p.getByRole('link', { name: 'See the whole activity log' }), /\/activity$/);
    };
    const entries = (p) => p.locator('li[data-entry]');
    const texts = async (p) => entries(p).allInnerTexts();
    const addTeam = async (p, name) => {
      await p.locator('input[name=name]').fill(name);
      await tap(
        p,
        p.getByRole('button', { name: 'Add team' }),
        /\/admin\/teams\/[0-9a-f-]{36}(#add-team)?$/,
      );
      // The save is proved by the page itself: the new team's page says so (2.155).
      await p
        .getByRole('status')
        .filter({ hasText: `Saved: ${name} was added to the season.` })
        .waitFor({ timeout: 10_000 });
    };

    at = 'enough teams are added for a second page of the log';
    await page.goto(`${origin}/north-valley/admin`);
    await toArea(page, 'Teams', /\/admin\/teams$/);
    for (let n = 1; n <= 18; n += 1) {
      await addTeam(page, `Filler ${run} ${n}`);
      await page.goBack();
    }

    at = 'a team is added and moved to the bin';
    await addTeam(page, larks);
    const panel = page.locator('section', {
      has: page.getByRole('heading', { name: 'Remove this team' }),
    });
    await panel.locator('input[name=confirm]').check();
    await tap(
      page,
      panel.getByRole('button', { name: 'Move the team to the bin' }),
      /done=removed/,
    );

    at = 'the current season is hidden from visitors, then shown again';
    await toArea(page, 'Season settings', /\/admin\/season/);
    const who = page.locator('#who-can-see');
    await tap(page, who.getByRole('button', { name: 'Hide it again' }), /ask=hide/);
    await tap(page, who.getByRole('button', { name: 'Yes, hide it' }), /done=hidden/);
    await tap(page, who.getByRole('button', { name: 'Show this season to visitors' }), /ask=show/);
    await tap(page, who.getByRole('button', { name: 'Yes, show it' }), /done=shown/);

    at = 'the log, from the admin menu';
    await toLog(page);
    const first = await texts(page);
    note('the log holds a page of 20', first.length === 20, `${first.length}`);
    note(
      'the newest entry says the season is shown to visitors, by whom',
      (first[0] ?? '').includes('It is now shown to visitors.') && (first[0] ?? '').includes(owner),
      first[0],
    );
    note(
      'the entry before says it was hidden from visitors',
      (first[1] ?? '').includes('It is now hidden from visitors.'),
      first[1],
    );
    note(
      "the removal names the team, by its name now (step 2.77's fix round)",
      (first[2] ?? '').includes(`Moved the team ${larks} to the bin`),
      first[2],
    );
    note(
      'the removal is there, by whom, with the way to the bin',
      (first[2] ?? '').includes('to the bin') &&
        (first[2] ?? '').includes(owner) &&
        (first[2] ?? '').includes('It is in the bin: bring it back'),
      first[2],
    );
    note(
      'every entry says when',
      (await page.locator('li[data-entry] time[datetime]').count()) === first.length,
    );
    await checks(page, 'the activity log');

    at = 'the removal leads to the bin, which brings the team back';
    await tap(
      page,
      entries(page).nth(2).getByRole('link', { name: 'It is in the bin: bring it back' }),
      /\/settings\/bin#bin-/,
    );
    const row = page.locator(`li[id="${new URL(page.url()).hash.slice(1)}"]`);
    note('the link lands on the team in the bin', (await row.innerText()).includes(larks));
    const back = await binAnswer(page, row.getByRole('button', { name: 'Bring it back' }));
    note('the bin says the team is back', back.said === 'back', back.text);
    await toLog(page);
    const after = await texts(page);
    note(
      'the log says first that the team was brought back',
      (after[0] ?? '').includes(`Restored the team ${larks} from the bin`),
      after[0],
    );
    note(
      'the removal no longer leads to the bin',
      (await page.getByRole('link', { name: 'It is in the bin: bring it back' }).count()) === 0,
    );

    at = 'Older and Newer';
    await tap(page, page.getByRole('link', { name: 'Older' }), /before=/);
    const older = await texts(page);
    note(
      'the older page goes on where the first stopped',
      older.length > 0 && older.length < 20 && !older.includes(after[0] ?? ''),
      `${older.length}`,
    );
    note(
      'the older page has no Older',
      (await page.getByRole('link', { name: 'Older' }).count()) === 0,
    );
    await checks(page, 'the older page of the log');
    await tap(page, page.getByRole('link', { name: 'Newer' }), /after=/);
    note('Newer comes back to the newest', (await texts(page))[0] === after[0]);

    at = 'filters, scripts off';
    const pickerForm = (name) =>
      page.locator('form', { has: page.locator(`select[name=${name}]`) });
    await pickerForm('kind').locator('select').selectOption('teams');
    await tap(page, pickerForm('kind').getByRole('button', { name: 'Show' }), /kind=teams/);
    const teams = await page
      .locator('li[data-entry]')
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-entry')));
    note(
      '"What was changed: Teams" keeps teams only',
      teams.length > 0 &&
        teams.every(
          (key) => key?.startsWith('activity.teams.') || key === 'activity.leagues.restore_team',
        ),
      teams.join(', '),
    );
    note(
      'the season entries are left out',
      !(await texts(page)).some((text) => /Changed (a|the) season/.test(text)),
    );
    // Each choice says the roles too, so no two read the same ("Robin Example, You (Owner)").
    const whoSelect = pickerForm('who').locator('select');
    const ownerChoice = whoSelect.locator('option', { hasText: owner }).first();
    note(
      'the owner\'s choice of "Who" says the role',
      /\(.+\)/.test(await ownerChoice.innerText()),
    );
    await whoSelect.selectOption((await ownerChoice.getAttribute('value')) ?? '');
    await tap(
      page,
      pickerForm('who').getByRole('button', { name: 'Show' }),
      /who=.*kind=teams|kind=teams.*who=/,
    );
    const mine = await texts(page);
    note(
      '"Who" keeps that person and the kind already chosen',
      mine.length > 0 && mine.every((text) => text.includes(owner)),
    );
    const days = page.locator('form[data-log-days]');
    await days.locator('input[name=to]').fill('2000-01-01');
    await tap(page, days.getByRole('button', { name: 'Show' }), /to=2000-01-01/);
    note(
      'a span with nothing in it says so',
      (await page.locator('main').innerText()).includes('Nothing matches these choices'),
    );
    await checks(page, 'the log with nothing to show');

    at = 'with scripts on, a kind applies at once';
    const live = await open(true);
    await live.goto(`${origin}/north-valley/admin`);
    await toLog(live);
    await live.locator('[data-applies]').first().waitFor();
    await Promise.all([
      live.waitForURL(/kind=schedule/),
      live.locator('select[name=kind]').selectOption('schedule'),
    ]);
    note(
      'scripts on: a kind of thing applies at once',
      new URL(live.url()).searchParams.get('kind') === 'schedule',
    );

    at = 'a coach and a scorekeeper are refused the log';
    for (const token of ['local-coach-token', 'local-scorekeeper-token']) {
      const other = await open(false, token);
      const refused = await other.goto(`${origin}${logAddress}`);
      const text = await other.locator('body').innerText();
      note(`${token} is refused the log`, refused?.status() === 403, `${refused?.status()}`);
      note(`${token} sees none of it`, !text.includes(larks));
    }
  } catch (error) {
    failures.push(`${at}: ${whatWentWrong(error)}`);
  } finally {
    await browser?.close();
    server?.child.kill();
  }
}

console.log(`activity log: ${checked.length} checks, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exitCode = failures.length === 0 ? 0 : 1;
