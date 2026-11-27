// Step 2.146: "Show as" on a person's record, proved in a real browser with scripts on,
// against the web app on its made-up stand-in (APP_ENV=test). Nothing leaves this computer;
// every league, team and person is made up. Builds the app first unless given --no-build.
//
// In the youth league (harbor-city) the owner sets a child to "Removed from public pages"
// in Admin → People: the panel says so without the page being loaded again. A visitor then
// sees, on the team page and the statistics, a nameless line whose numbers are the child's
// own, so the totals still add up (R-17). Under Hidden the statistics show the other
// children as "#10" with the team, and the removed child still with no number; the
// parents' confirmation is not offered there. Back on full names the confirmation is
// offered again and the team page changes; ticked, the others are in full and the removed
// child still is not. In the adult league (north-valley) the child playing there is
// removed the same way and her team's roster keeps her line, nameless; then (the fix
// round) the scorekeeper scores a basket by her, #9, in the live game while a visitor
// watches its page: the page as served and as the live message redraws it, and the game's
// snapshot, never name her. A scorekeeper never reaches the panel.
import {
  court,
  leagueId as adultLeagueId,
  liveGame,
  starters,
  trackerPath,
} from './tracker-driver.mjs';
import {
  accessibilityProblems,
  answered,
  buildNext,
  freePort,
  launch,
  settingAnswer,
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
const step = async (name, run) => {
  try {
    await run();
  } catch (error) {
    failures.push(`${name}: ${whatWentWrong(error)}`);
  }
};

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
const names = 'section[data-setting="privacy.publicNames"]';
const confirmation = 'section[data-setting="privacy.childrenInFullConfirmed"]';
const removedLine = 'A player (name not shown)';
const removedOnRoster = 'Name not shown';

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

if (browser) {
  const signedIn = async (token) => {
    const context = await browser.newContext();
    await context.addCookies([{ name: 'srl_session', value: token, url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    return page;
  };
  const admin = await signedIn('local-owner-token');
  const scorekeeper = await signedIn('local-scorekeeper-token');
  const page = await (await browser.newContext()).newPage();
  page.setDefaultTimeout(60_000);

  /** Every table row of the page's main part, each as its cells' words. */
  const rowsOf = async (address) => {
    await page.goto(`${origin}${address}`);
    return page.locator('main tr').evaluateAll((rows) =>
      rows.map((row) =>
        // A statistics cell's words are its own span; the team's emblem beside them is not.
        [...row.querySelectorAll('th, td')].map((cell) =>
          (
            cell.querySelector(':scope > span[dir="auto"]')?.textContent ??
            cell.textContent ??
            ''
          ).trim(),
        ),
      ),
    );
  };
  const textOf = async (address) => {
    await page.goto(`${origin}${address}`);
    return page.locator('main').innerText();
  };
  /** The row whose cell is exactly `name`, and the other cells of it. */
  const lineOf = (rows, name) => {
    const row = rows.find((cells) => cells.includes(name));
    return row === undefined ? undefined : row.filter((cell) => cell !== name);
  };
  const same = (a, b) => a !== undefined && b !== undefined && a.join('|') === b.join('|');

  /** Opens a person's record from the People list, found by a name of theirs. */
  const openRecord = async (league, search) => {
    await admin.goto(`${origin}/${league}/admin/people?q=${search}`);
    const link = admin.locator(`main a[href*="/admin/people/"]`, { hasText: search }).first();
    const href = await link.getAttribute('href');
    await link.click();
    await admin.waitForURL((url) => url.pathname === href);
    await admin.locator('section[data-show-as="true"] form[data-show-as-form="true"]').waitFor();
    return href;
  };
  /** Chooses "Removed from public pages" for the open record and saves it, scripts on. */
  const remove = async (label, name) => {
    const panel = admin.locator('section[data-show-as="true"]');
    // A mark on the window: gone if the save loaded the page again.
    await admin.evaluate(() => {
      window.showAsKept = true;
    });
    await panel.locator('select[name="showAs"]').selectOption('removed');
    await panel.locator('select[name="reason"]').selectOption('guardianAsked');
    await panel.locator('button[type="submit"]').click();
    await answered(admin, `Saved: how ${name} is shown on public pages.`);
    note(
      `${label}: the panel says it, with no new page load`,
      (await admin.evaluate(() => window.showAsKept === true)) &&
        (await panel.locator('[role="status"]').innerText()).includes(name),
    );
    note(
      `${label}: the panel now starts on "Removed"`,
      (await panel.locator('select[name="showAs"]').inputValue()) === 'removed',
    );
    note(
      `${label}: the record says they are not shown`,
      (await admin.locator('main').innerText()).includes('Shown to the public as: not at all'),
    );
    note(
      `${label}: the record passes the checks`,
      (await accessibilityProblems(admin)).length === 0,
      (await accessibilityProblems(admin)).join('; '),
    );
  };
  const choose = async (league, value) => {
    await admin.goto(`${origin}/${league}/admin/settings`);
    await admin.locator(`${names} input[type=radio][value="${value}"]`).check();
    const answer = await settingAnswer(
      admin,
      names,
      admin.locator(`${names} button[type=submit]`).first(),
    );
    note(`${league} saves ${value}`, answer.saved, answer.text);
  };
  const confirmationOffered = async (league) => {
    await admin.goto(`${origin}/${league}/admin/settings`);
    return (await admin.locator(`${confirmation} input[type=checkbox]`).count()) === 1;
  };

  let samRecord;
  await step('the youth league', async () => {
    const team = '/harbor-city/teams/comets';
    const stats = '/harbor-city/stats';
    const rosterBefore = await rowsOf(team);
    const statsBefore = await rowsOf(stats);
    const samStats = lineOf(statsBefore, 'Sam R.');
    note("youth start: the statistics have Sam's line", samStats !== undefined);

    samRecord = await openRecord('harbor-city', 'Rivera');
    await remove('youth', 'Sam Rivera');

    const rosterAfter = await rowsOf(team);
    const roster = await textOf(team);
    note('removed: the team page shows no name of his', !/Sam R|Rivera/.test(roster), roster);
    note(
      'removed: the team page keeps every line, his nameless',
      rosterAfter.length === rosterBefore.length && roster.includes(removedOnRoster),
      `${rosterBefore.length} rows before, ${rosterAfter.length} after`,
    );
    const statsAfter = await rowsOf(stats);
    const statsText = await textOf(stats);
    note('removed: the statistics show no name of his', !/Sam R|Rivera/.test(statsText));
    note(
      'removed: his statistics line is nameless, its numbers his own (R-17)',
      same(lineOf(statsAfter, removedLine), samStats),
      JSON.stringify(lineOf(statsAfter, removedLine)),
    );
    note(
      'removed: the statistics keep every line',
      statsAfter.length === statsBefore.length,
      `${statsBefore.length} rows before, ${statsAfter.length} after`,
    );

    await choose('harbor-city', 'hidden');
    const hidden = await rowsOf(stats);
    const maya = hidden.find((cells) => cells.includes('#10'));
    note(
      'hidden: the statistics show "#10" with the team',
      maya !== undefined && maya.includes('Comets'),
      JSON.stringify(hidden),
    );
    note(
      'hidden: the removed child is still nameless, with no number',
      same(lineOf(hidden, removedLine), samStats) && !hidden.some((cells) => cells.includes('#2')),
    );
    const hiddenRoster = await textOf(team);
    note('hidden: the team page shows no name', !/Maya|Cho\b|Sam|Rivera/.test(hiddenRoster));
    note('hidden: the confirmation is not offered', !(await confirmationOffered('harbor-city')));

    await choose('harbor-city', 'fullName');
    note('full names: the confirmation is offered', await confirmationOffered('harbor-city'));
    const fullRoster = await textOf(team);
    note(
      'full names: the team page changes',
      fullRoster !== hiddenRoster && fullRoster.includes('Maya C.'),
    );
    await admin.locator(`${confirmation} input[type=checkbox]`).check();
    const ticked = await settingAnswer(
      admin,
      confirmation,
      admin.locator(`${confirmation} button[type=submit]`).first(),
    );
    note('the confirmation is saved', ticked.saved, ticked.text);
    await admin.goto(`${origin}/harbor-city/admin/settings`);
    const privacy = await admin.locator('section[data-area="privacy"]').innerText();
    note(
      'confirmed: the screen says the day and who gave it, from the activity log',
      /Confirmed on [A-Z][a-z]+ \d{1,2}, \d{4} by [^.\n]+\./.test(privacy),
      privacy,
    );
    const confirmed = await textOf(team);
    note(
      'confirmed: the others in full, the removed child still nameless',
      confirmed.includes('Maya Cho') && !/Sam|Rivera/.test(confirmed),
    );
  });

  await step('the adult league', async () => {
    // Pia, the child playing in the adult league, has scores only, no statistics line, so
    // here the proof is her team's roster; the youth league proves the statistics.
    const team = '/north-valley/teams/hawks';
    const rosterBefore = await rowsOf(team);
    note('adult start: the team page has Pia', (await textOf(team)).includes('Pia'));
    await openRecord('north-valley', 'Pia');
    const record = (await admin.locator('main h1').innerText()).trim();
    note("adult: the record opened is Pia's", record.includes('Pia'), record);
    await remove('adult', record);
    const roster = await textOf(team);
    note('adult removed: the team page shows no Pia', !roster.includes('Pia'), roster);
    note(
      'adult removed: the team page keeps every line, hers nameless',
      (await rowsOf(team)).length === rosterBefore.length && roster.includes(removedOnRoster),
    );
    note(
      'adult removed: the statistics show no Pia',
      !(await textOf('/north-valley/stats')).includes('Pia'),
    );
  });

  // Plan row 29's last part (the review's Medium 3): the game page, its snapshot and the
  // live message, with a play by the removed child. This server's world only: no seed and
  // no other test changes.
  await step('the adult league: a live play by the removed child', async () => {
    const gamePath = `/north-valley/games/${liveGame}`;
    const snapshotOf = async () => {
      const answer = await fetch(
        `${origin}/api/v1/leagues/${adultLeagueId}/games/${liveGame}/snapshot`,
      );
      return { status: answer.status, text: await answer.text() };
    };
    const before = await snapshotOf();
    const homeBefore = JSON.parse(before.text).score?.home;
    note(
      'live game: the snapshot answers, without Pia',
      before.status === 200 && typeof homeBefore === 'number' && !before.text.includes('Pia'),
      `${before.status} ${before.text.slice(0, 200)}`,
    );
    await page.goto(`${origin}${gamePath}`);
    const pageBefore = await page.locator('main').innerText();
    note(
      'live game: the page as served has no Pia',
      !pageBefore.includes('Pia') && !(await page.content()).includes('Pia'),
    );
    const scorer = await (
      await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
    ).newPage();
    scorer.setDefaultTimeout(60_000);
    await scorer
      .context()
      .addCookies([{ name: 'srl_session', value: 'local-scorekeeper-token', url: origin }]);
    const c = court(scorer);
    await scorer.goto(`${origin}${trackerPath()}`);
    await c.open();
    const playing = scorer.locator('[data-scoring][data-stage="play"]');
    if (!(await playing.isVisible())) {
      for (const jersey of starters) await c.tile('home', jersey).tap();
      for (const jersey of starters) await c.tile('away', jersey).tap();
      await playing.waitFor();
    }
    // Her tile is her number alone (R-33); a basket by #9 is hers.
    const options = c.pad.locator(
      `[data-options="${await c.tile('home', 9).getAttribute('data-player')}"]`,
    );
    if (!(await options.isVisible())) await c.tile('home', 9).tap();
    await c.recorded(() => options.locator('[data-act="p2"]').tap());
    await c.saved();
    // The visitor's page is redrawn by the live message, not loaded again: wait (at most a
    // minute) for the new score in it, then read it.
    await page.waitForFunction(
      (old) => document.querySelector('main')?.innerText !== old,
      pageBefore,
      { timeout: 60_000 },
    );
    const pageAfter = await page.locator('main').innerText();
    note('live game: the redrawn page has no Pia', !pageAfter.includes('Pia'), pageAfter);
    const after = await snapshotOf();
    note(
      'live game: the snapshot after her basket counts it and has no Pia',
      JSON.parse(after.text).score?.home === homeBefore + 2 && !after.text.includes('Pia'),
      after.text.slice(0, 300),
    );
    await page.reload();
    note(
      'live game: the page served again after her basket has no Pia',
      !(await page.content()).includes('Pia'),
    );
    await scorer.context().close();
  });

  await step('a scorekeeper', async () => {
    const response = await scorekeeper.goto(`${origin}${samRecord ?? '/harbor-city/admin/people'}`);
    note(
      'a scorekeeper does not reach the record or its panel',
      samRecord !== undefined &&
        (await scorekeeper.locator('[data-show-as="true"], [data-show-as-form="true"]').count()) ===
          0 &&
        !(await scorekeeper.content()).includes('Save Show as'),
      `answered ${response?.status()}`,
    );
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Show as browser check failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Show as browser check passed: ${checked.length} checks in a real browser.`);
