// Step 2.56 (last part): the Games list's points of the 2.180/2.158 reviews, in a real
// browser at phone width, against the web app on its made-up stand-in (APP_ENV=test).
// Nothing leaves this computer; every team, game and person is made up. Builds the app
// first unless given --no-build.
//
// The world is made with the Otters in the bin, games and results kept (LOCAL_BINNED_TEAM),
// as a team could be before A-17. The made-up owner starts at the admin's home, as the
// other browser tests do, and reaches everything by tapping; no other address is typed.
// - "Later games": every scheduled game after this week, for all teams or one, each with
//   the same forfeit, postpone and cancel as this week's games.
// - A team in the bin is named "Otters (removed)" on the list.
// - A scheduled game whose line-ups the tracker holds (sent through the tracker's own
//   endpoints, as a tablet would) does not say "Plays are being recorded", says its
//   line-ups are set, and is forfeited from the list; a visitor then reads the forfeit on
//   the public game page and in the standings (a loss for the Lions, a win for the Hawks).
// - S-87: the admin marks the Hawks as having left the league on their page; public
//   standings and Teams mark them, the new-game form leaves them out; undone, offered again.
// - Accessibility checks (T-186) and no sideways scrolling at phone width (A-2).
import { leagueUrl } from '@srleagues/core';
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  openStaffMenu,
  startNext,
  trackedPlayer,
  trackerTablet,
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
    failures.push(
      `${name}: ${String(error?.message ?? error)
        .split('\n')
        .slice(0, 8)
        .join(' / ')}`,
    );
  }
};

// The made-up games of the first league (apps/web/src/server/stand-in-games.ts).
const tomorrowGame = '01900000-0000-7000-8000-006a00000003'; // Lions at Hawks, set to live, no plays
// The Hawks, a team of the first league's season (stand-in-world-seed.ts).
const hawksTeam = '01900000-0000-7000-8000-007e00000003';
const phone = { width: 390, height: 844 };

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
    LOCAL_BINNED_TEAM: 'otters',
  });
  await step('starting the server and the browser', async () => {
    await waitFor(`${origin}/`, server);
    browser = await launch();
  });
}

const gameOn = (page, id) => page.locator(`li[id="game-${id}"]`);

/** Each team's standings row, by team name: its numbers by column heading. */
const standingsRows = (page) =>
  page.evaluate(() => {
    const rows = {};
    for (const table of document.querySelectorAll('table.ui-standings')) {
      const headers = [...table.querySelectorAll('thead th[scope="col"]')].map((th) =>
        th.textContent.trim(),
      );
      for (const tr of table.querySelectorAll('tbody tr')) {
        const team = tr.querySelector('th[scope="row"]')?.textContent.trim() ?? '';
        const cells = [...tr.querySelectorAll('td')].map((td) => td.textContent.trim());
        const heads = headers.slice(headers.length - cells.length);
        rows[team] ??= Object.fromEntries(heads.map((h, i) => [h, Number.parseFloat(cells[i])]));
      }
    }
    return rows;
  });
const rowNamed = (rows, team) => Object.entries(rows).find(([name]) => name.includes(team))?.[1];

/** From the admin's home to the games list, by tapping the admin's own "Games". */
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

/** From the admin's home to one of its areas, by tapping the admin's own menu. */
async function openArea(page, area) {
  await page.goto(`${origin}/north-valley/admin`);
  await openStaffMenu(page);
  await Promise.all([
    page.waitForURL((url) => url.pathname === `/north-valley/admin/${area}`),
    page
      .getByRole('navigation', { name: 'Admin areas' })
      .locator(`a[href="/north-valley/admin/${area}"]`)
      .click(),
  ]);
}

/** From a public page to another of the league's, by its own menu. */
async function openSite(page, where) {
  await page.locator('.site-header .site-menu > summary').click();
  await Promise.all([
    page.waitForURL((url) => url.pathname === `/north-valley/${where}`),
    page.locator(`.site-header a[href="/north-valley/${where}"]`).first().click(),
  ]);
}

/**
 * Chooses `label` in Later games' team picker: the page goes to it on the choice (the
 * picker's script), or on Show where scripts are off.
 */
async function showLater(page, label) {
  const select = page.locator('[data-later-games] select[name="later"]');
  const value = await select.evaluate(
    (el, wanted) => [...el.options].find((o) => o.text === wanted)?.value ?? '',
    label,
  );
  await Promise.all([
    page.waitForURL((url) => url.searchParams.get('later') === value),
    (async () => {
      await select.selectOption(value);
      const show = page.locator('[data-later-games]').getByRole('button', { name: 'Show' });
      if (await show.isVisible().catch(() => false)) await show.click().catch(() => {});
    })(),
  ]);
  await page.locator('[data-later-games] h3').waitFor();
  return page.locator('[data-later-games]');
}

async function phoneProblems(page, label) {
  const problems = await accessibilityProblems(page);
  note(`${label}: no accessibility problems`, problems.length === 0, problems.join('; '));
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  note(`${label}: nothing wider than the phone`, !wide);
}

if (browser) {
  const context = await browser.newContext({ viewport: phone });
  await context.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  await step('later games, all teams and one team, with their changes', async () => {
    await openGames(page);
    await page.getByRole('link', { name: 'Later games', exact: true }).first().click();
    const later = await showLater(page, 'All teams');
    const cards = later.locator('li[id^="game-"]');
    const count = await cards.count();
    note('later games lists the games after this week', count > 0, `${count} games`);
    const first = cards.first();
    for (const act of ['forfeit', 'postpone', 'cancel']) {
      note(
        `a later game offers ${act}`,
        (await first.locator(`form[data-call-off-act="${act}"]`).count()) === 1,
      );
    }
    const text = (await later.textContent()) ?? '';
    note('a team in the bin is named "(removed)" on Games', text.includes('Otters (removed)'));
    await phoneProblems(page, 'later games, all teams');
    // One team: only its games.
    const options = await later.locator('select[name="later"] option').allTextContents();
    const team = options.find((o) => !['Choose a team', 'All teams'].includes(o)) ?? '';
    const theirs = await showLater(page, team);
    const shown = await theirs.locator('li[id^="game-"]').allTextContents();
    note(
      `one team's later games are its own (${team})`,
      shown.length > 0 && shown.every((card) => card.includes(team)),
      `${shown.length} cards`,
    );
  });

  // A visitor's browser, signed in as no one: the forfeit as the public site shows it.
  const visitor = await browser.newContext({ viewport: phone });
  const visit = async (address) => {
    const page = await visitor.newPage();
    await page.goto(origin + address);
    await page.locator('main').first().waitFor();
    return page;
  };
  const standingsAddress = leagueUrl({ slug: 'north-valley' }, 'standings');
  let standingsBefore = {};
  await step('the standings a visitor sees before the forfeit', async () => {
    const page = await visit(standingsAddress);
    standingsBefore = await standingsRows(page);
    await page.close();
  });

  await step('a game with only its line-ups set is forfeited from the list', async () => {
    const send = await trackerTablet(origin, tomorrowGame, 'local-owner-token', 'later-tablet');
    await send({
      type: 'lineup',
      side: 'home',
      playerIds: [1, 2, 3, 4, 5].map((n) => trackedPlayer(3, n)),
    });
    await openGames(page);
    const game = gameOn(page, tomorrowGame);
    const words = (await game.textContent()) ?? '';
    note(
      'a game with line-ups only does not say plays are being recorded',
      !words.includes('Plays are being recorded'),
    );
    note('it says its line-ups are set', words.includes('Line-ups are set in the tracker'));
    await game.getByText('Forfeit, postpone or cancel').click();
    const forfeit = game.locator('form[data-call-off-act="forfeit"]');
    await forfeit.getByLabel('Team that forfeits').selectOption({ label: 'Lions' });
    await forfeit.getByRole('button', { name: 'Record forfeit' }).click();
    await game.locator('[data-call-off-ask]').waitFor();
    await page.waitForTimeout(1000);
    await game.getByRole('button', { name: 'Yes, record the forfeit' }).click();
    await page.getByText('Lions forfeited').first().waitFor();
    note('the forfeit after line-ups is saved', true);
    await phoneProblems(page, 'a forfeit after line-ups');
  });

  await step('a visitor reads the forfeit on the game page and in the standings', async () => {
    const game = await visit(leagueUrl({ slug: 'north-valley' }, 'game', { game: tomorrowGame }));
    const words = await game.locator('main').innerText();
    note(
      'the public game page says the Lions forfeited',
      /forfeit/i.test(words) && words.includes('Lions'),
      words.slice(0, 300),
    );
    const problems = await accessibilityProblems(game);
    note(
      'accessibility: the forfeited game’s public page',
      problems.length === 0,
      problems.join('; '),
    );
    await game.close();
    const page = await visit(standingsAddress);
    const after = await standingsRows(page);
    await page.close();
    const [lb, la, hb, ha] = [
      rowNamed(standingsBefore, 'Lions'),
      rowNamed(after, 'Lions'),
      rowNamed(standingsBefore, 'Hawks'),
      rowNamed(after, 'Hawks'),
    ];
    const rose = (before, now, column) => (now?.[column] ?? NaN) - (before?.[column] ?? NaN);
    const columns = Object.keys(la ?? {});
    const seen = JSON.stringify({ lb, la, hb, ha });
    note(
      'the standings count the forfeit as a game for both teams',
      columns.some((c) => rose(lb, la, c) === 1 && rose(hb, ha, c) === 1),
      seen,
    );
    note(
      'the standings count a loss for the Lions, who forfeited',
      columns.some((c) => rose(lb, la, c) === 1 && rose(hb, ha, c) === 0),
      seen,
    );
    note(
      'the standings count a win for the Hawks',
      columns.some((c) => rose(hb, ha, c) === 1 && rose(lb, la, c) === 0),
      seen,
    );
  });
  await visitor.close();
  await step('a team that has left the league (S-87), marked and undone', async () => {
    await openArea(page, 'teams');
    const openHawks = async () => {
      await Promise.all([
        page.waitForURL((url) => url.pathname.endsWith(hawksTeam)),
        page.locator(`li[data-team-row="${hawksTeam}"] a`).click(),
      ]);
    };
    await openHawks();
    await page.locator('[data-team-left-panel="playing"]').waitFor();
    await phoneProblems(page, "the team page's leaving panel");
    await page.locator('[data-team-left-button="mark"]').click();
    await page.locator('[data-team-left-panel="left"]').waitFor();
    note('the admin marks the team as having left', true);
    const later = (await page.locator('[data-team-later-games]').getAttribute('href')) ?? '';
    note("the panel leads to the team's later games", later.includes(`later=${hawksTeam}`), later);
    await phoneProblems(page, 'a team marked as having left');
    // In public: the standings' row and the Teams card are marked.
    await openStaffMenu(page);
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/north-valley'),
      page.locator('.staff-bar a.staff-foot-link[href^="/north-valley"]').click(),
    ]);
    await openSite(page, 'standings');
    note(
      'public standings mark the team as having left',
      ((await page.locator('main').textContent()) ?? '').includes('Left the league.'),
    );
    await openSite(page, 'teams');
    note(
      'public Teams marks the team, and only it',
      (await page.locator('[data-team-left="hawks"]').count()) === 1 &&
        (await page.locator('[data-team-left]').count()) === 1,
    );
    await phoneProblems(page, 'public Teams with a team that has left');
    // Not offered for a new game.
    const offered = async () =>
      page
        .locator(`[data-add-game] select[name="homeTeamId"] option[value="${hawksTeam}"]`)
        .count();
    await openArea(page, 'schedule');
    note('the new-game form leaves the team out', (await offered()) === 0);
    note(
      'the new-game form still offers the others',
      (await page.locator('[data-add-game] select[name="homeTeamId"] option').count()) > 1,
    );
    // Undone: playing again, offered again.
    await openArea(page, 'teams');
    await openHawks();
    await page.locator('[data-team-left-button="undo"]').click();
    await page.locator('[data-team-left-panel="playing"]').waitFor();
    await openArea(page, 'schedule');
    note('undone, the team is offered for a new game again', (await offered()) > 0);
  });
  await context.close();
}

await browser?.close();
server?.child.kill();
if (failures.length > 0) {
  console.error(`later-games: ${failures.length} problem(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`later-games: ${checked.length} checks passed.`);
