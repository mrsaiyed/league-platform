// Step 2.130: "Start a new season" in Season settings. The owner starts Spring 2027 with
// teams and rosters, hidden: it offers no Archive (T-388), and made current while hidden
// the public pages still open on Fall 2026 (S-103); a carried team has its players. Summer
// 2027 starts with the teams only (its team has no players), Autumn 2027 starts fresh (no
// teams). Shown, the public season picker has them. Spring 2027 is archived after its
// question. A coach and a scorekeeper are offered none of the three actions. In the
// archived Spring 2026, made current: Teams, a team, Divisions and Schedule say it is
// read-only and offer no change; a result cannot be entered, the scorekeeper is offered
// no reopen, is refused through the owner's open correction, and the owner's correction
// with a reason saves, after which the game is read-only again.
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
    const signedIn = async (token, javaScriptEnabled = false) => {
      const context = await browser.newContext({ javaScriptEnabled, viewport: screen });
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

    /** Makes the season current by its own question; gives the question's words. */
    const makeCurrent = async (slug) => {
      await page.goto(`${origin}/north-valley/admin/season?season=${slug}`);
      await tap(page, page.locator('[data-season-change=current]'), /ask=current/);
      const asked = await page.locator('[data-season-ask=current]').innerText();
      await tap(page, page.getByRole('button', { name: 'Yes, make it current' }), /done=current/);
      note(
        `${slug}: it says the season is current now`,
        // An archived season is marked archived first; its words still say it is current.
        (await page
          .locator('[data-season-state=current], [data-season-state=archived]')
          .count()) === 1 &&
          (await page.locator('[data-season-state] > p').allInnerTexts()).some((p) =>
            /is the current season:/.test(p),
          ),
      );
      return asked;
    };
    /** Opens Teams (the current season's) and its first team; gives the team's players. */
    const firstTeamPlayers = async (label) => {
      await page.goto(`${origin}/north-valley/admin/teams`);
      const rows = page.locator('main [data-team-row] a.staff-row-link');
      note(`${label}: Teams lists the teams`, (await rows.count()) > 0);
      await tap(page, rows.first(), /\/north-valley\/admin\/teams\/[0-9a-f-]{36}$/);
      return page.locator('main ol.admin-roster > li').count();
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

    at = 'Spring 2027: teams and rosters, hidden, made current';
    await start('Spring 2027', 'spring-2027', 'teams-and-rosters');
    const before = await pickerSeasons();
    note(
      'a hidden new season is not in the public season picker',
      !before.includes('Spring 2027'),
      before.join(', '),
    );
    note(
      'a hidden season offers no Archive and says to show it first',
      (await page.locator('[data-season-change=archive]').count()) === 0 &&
        (await page.locator('[data-season-archive-hidden]').innerText()).includes(
          'Show it to visitors first',
        ),
    );
    const hiddenAsk = await makeCurrent('spring-2027');
    note(
      'making a hidden season current says visitors go on seeing the shown one',
      hiddenAsk.includes('Your own admin screens open on it') &&
        hiddenAsk.includes('visitors go on seeing the newest season that is shown'),
      hiddenAsk,
    );
    {
      const visitor = await signedIn(undefined);
      await visitor.goto(`${origin}/north-valley`);
      const picker = visitor.locator('.site-header select[name=season]');
      const fall = await picker.locator('option', { hasText: 'Fall 2026' }).getAttribute('value');
      note(
        'while the hidden season is current, the public pages still open on Fall 2026',
        fall !== null && (await picker.inputValue()) === fall,
      );
      await visitor.context().close();
    }
    const carried = await firstTeamPlayers('Spring 2027');
    note('Spring 2027: a carried team has its players', carried > 0, String(carried));

    at = 'Summer 2027: the teams only';
    await page.goto(`${origin}/north-valley/admin/season?season=spring-2027`);
    await show('spring-2027');
    await start('Summer 2027', 'summer-2027', 'teams');
    await show('summer-2027');
    await makeCurrent('summer-2027');
    const leftBehind = await firstTeamPlayers('Summer 2027');
    note('Summer 2027: the team came without its players', leftBehind === 0, String(leftBehind));
    const after = await pickerSeasons();
    note(
      'once shown, the public season picker has both',
      after.includes('Spring 2027') && after.includes('Summer 2027'),
      after.join(', '),
    );

    at = 'Autumn 2027: start fresh';
    await start('Autumn 2027', 'autumn-2027', 'nothing');
    await makeCurrent('autumn-2027');
    await page.goto(`${origin}/north-valley/admin/teams`);
    note(
      'a fresh season has no teams, and Teams offers to add one',
      (await page.locator('main [data-team-row]').count()) === 0 &&
        (await page.locator('form[data-form=create-team]').count()) === 1,
    );
    await makeCurrent('summer-2027');

    at = 'the owner archives Spring 2027';
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

    at = 'a coach and a scorekeeper';
    for (const role of ['coach', 'scorekeeper']) {
      const other = await signedIn(`local-${role}-token`);
      // The page has loaded (goto waits for it): the admin area turns them away, or shows
      // no action; its status is said if the check fails.
      const reply = await other.goto(`${origin}/north-valley/admin/season?season=summer-2027`);
      note(
        `a ${role} is offered none of the three actions`,
        reply !== null &&
          (await other.locator('[data-start-season-form], [data-season-change]').count()) === 0,
        String(reply?.status()),
      );
      await other.context().close();
    }

    at = 'the archived Spring 2026, made current';
    await makeCurrent('spring-2026');
    await page.goto(`${origin}/north-valley/admin/teams`);
    const readOnly = 'Spring 2026 is archived. It can be read but not changed';
    note(
      'Teams says the season is read-only and offers no new team',
      (await page.locator('[data-season-read-only]').innerText()).includes(readOnly) &&
        (await page.locator('form[data-form=create-team]').count()) === 0,
    );
    const archivedPlayers = await firstTeamPlayers('Spring 2026');
    note(
      'an archived team shows its players and offers no change',
      archivedPlayers > 0 &&
        (await page.locator('[data-season-read-only]').count()) === 1 &&
        (await page.locator('main form').count()) === 0,
    );
    await page.goto(`${origin}/north-valley/admin/season/divisions?season=spring-2026`);
    note(
      'Divisions says it is read-only and offers no new division',
      (await page.locator('[data-season-read-only]').count()) === 1 &&
        (await page.locator('#add-division').count()) === 0,
    );
    await page.goto(`${origin}/north-valley/admin/schedule?season=spring-2026`);
    note(
      'Schedule says it is read-only',
      (await page.locator('[data-season-read-only]').count()) === 1,
    );

    at = 'a game of the archived season';
    const owner2 = await signedIn('local-owner-token', true);
    const keeper = await signedIn('local-scorekeeper-token', true);
    const games = `${origin}/north-valley/admin/games`;
    await owner2.goto(games);
    const correctable = owner2
      .locator('li[id^="game-"]')
      .filter({ has: owner2.getByRole('link', { name: 'Correct this result' }) });
    note('the owner finds a decided game to correct', (await correctable.count()) > 0);
    const rowId = await correctable.first().getAttribute('id');
    const rowOf = (on) => on.locator(`li[id="${rowId}"]`);
    note(
      'a result cannot be entered in an archived game',
      (await rowOf(owner2).getByRole('button', { name: 'Save final score' }).count()) === 0,
    );
    await keeper.goto(games);
    note(
      "the scorekeeper is offered no reopen and no 'not started' in an archived game",
      (await rowOf(keeper).count()) === 1 &&
        (await rowOf(keeper).getByRole('link', { name: 'Correct this result' }).count()) === 0 &&
        (await rowOf(keeper)
          .getByRole('button', { name: /not started/i })
          .count()) === 0,
    );
    await Promise.all([
      owner2.waitForURL((url) => url.pathname.startsWith('/north-valley/admin/games/')),
      rowOf(owner2).getByRole('link', { name: 'Correct this result' }).click(),
    ]);
    await owner2
      .getByLabel('Why it needs correcting (kept in the log, never shown publicly)')
      .fill('The scores were swapped on the sheet.');
    await Promise.all([
      owner2.waitForURL((url) => url.pathname === '/north-valley/admin/games'),
      owner2.getByRole('button', { name: 'Reopen to correct' }).click(),
    ]);
    const boxes = rowOf(owner2).getByLabel(/^Score for /);
    await boxes.first().waitFor();
    await keeper.goto(games);
    const keeperSave = rowOf(keeper).getByRole('button', { name: 'Save final score' });
    if ((await keeperSave.count()) > 0) {
      if (
        !(await rowOf(keeper)
          .getByLabel(/^Score for /)
          .first()
          .isVisible())
      ) {
        await rowOf(keeper).getByText('Enter the final score').click();
      }
      for (const box of await rowOf(keeper)
        .getByLabel(/^Score for /)
        .all())
        await box.fill('1');
      await keeperSave.click();
      await rowOf(keeper).getByRole('button', { name: 'Yes, make it final' }).click();
      const refused = await rowOf(keeper).getByRole('alert').innerText();
      note(
        "the scorekeeper is refused through the owner's open correction",
        refused.includes('archived'),
        refused,
      );
    } else {
      note("the scorekeeper is offered no entry through the owner's open correction", true);
    }
    const all = await boxes.all();
    for (const [i, box] of all.entries()) await box.fill(String(40 + i));
    await rowOf(owner2).getByRole('button', { name: 'Save final score' }).click();
    await rowOf(owner2).getByRole('button', { name: 'Yes, make it final' }).click();
    await rowOf(owner2)
      .getByText(/^Saved: /)
      .or(rowOf(owner2).getByRole('alert'))
      .waitFor();
    note(
      "the owner's correction with a reason is saved",
      (await rowOf(owner2)
        .getByText(/^Saved: /)
        .count()) === 1,
      (await rowOf(owner2).innerText()).slice(0, 300),
    );
    await owner2.goto(games);
    note(
      'after the correction the game is read-only again',
      (await rowOf(owner2).count()) === 1 &&
        (await rowOf(owner2).getByRole('button', { name: 'Save final score' }).count()) === 0,
    );
    await owner2.context().close();
    await keeper.context().close();
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
