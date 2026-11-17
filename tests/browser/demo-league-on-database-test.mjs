// Step 2.59: the seed's demo-shaped league on the made-up database, in a real browser, page by
// page as P9 §3 lists what the demo shows a large association. The web app is started on its
// made-up database (APP_ENV=test, LOCAL_DATA=made-up-database): every migration, the seed
// leagues and the demo-shaped league in memory, its 120 games loaded through the fixture
// import and its tracked school's ten games through the transfer from a made-up tracker
// backup (packages/database/src/seed/seed-demo-league.ts). Nothing leaves this computer;
// every league, school and person is made up. Builds the app first unless given --no-build.
//
// 1. Their league as a site: the home page, every district's table with its six schools and
//    each school's ten games, the schedule, and the teams page with every school.
// 2. One team's whole season: the tracked school's page holds its ten results, its record as
//    the standings give it, its roster with every number, and its players' statistics; the
//    statistics page lists its players and their leaders. Each of its ten games' pages has
//    its box score: its players' points add up to its total and to its final score, and
//    the school it played shows its team's total only, none of its players named, in the
//    box scores or the plays. A game between two other schools shows its final score only.
// 3. The other teams' players' numbers hidden (S-22): the statistics page lists no other
//    school's player and says those schools show team totals only; another school's page
//    says its players' numbers are not public and shows none.
// And on every page: no real name (the live tracker's own fixtures are the real names we
// hold: none of them anywhere, counted and never printed), no student's surname in full (a
// school league shows children by first name and last initial, R-14), and the accessibility
// checks.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { demoLeague } from '../../packages/database/src/seed/demo-league-data.ts';
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
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

const repository = fileURLToPath(new URL('../../', import.meta.url));
const { slug } = demoLeague;
const schools = demoLeague.divisions.flatMap((division) => division.teams);
const tracked = schools.find((school) => school.shortName === demoLeague.trackedTeam);
/** The schools the tracked school played, whose players the transfer brought in. */
const opponents = schools.filter(
  (school) => school !== tracked && demoLeague.trackerPlayers[school.shortName] !== undefined,
);
/** A player as a school league shows a child: first name and last initial (R-14). */
const shownAs = (name) => {
  const [first, last] = name.split(' ');
  return `${first} ${last[0]}.`;
};
const trackedPlayers = demoLeague.trackerPlayers[tracked.shortName].map(([jersey, name]) => ({
  jersey,
  shown: shownAs(name),
}));
const opponentPlayers = opponents.flatMap((school) =>
  demoLeague.trackerPlayers[school.shortName].map(([, name]) => shownAs(name)),
);
const gamesInFile =
  readFileSync(`${repository}${demoLeague.fixturesFile}`, 'utf8').trim().split('\n').length - 1;

/** The real names we hold (the live tracker's fixtures): none may be on any page. */
const realNames = (() => {
  const folder = `${repository}apps/live-stats/data/`;
  const names = new Set();
  const collect = (value, key = '') => {
    if (typeof value === 'string') {
      const keep = ['name', 'school', 'venue', 'address', 'source', 'division'].includes(key);
      if (keep && value.trim().length > 3) names.add(value.trim().toLowerCase());
    } else if (Array.isArray(value)) for (const item of value) collect(item, key);
    else if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) collect(v, k);
    }
  };
  const files = existsSync(folder) ? readdirSync(folder).filter((f) => f.endsWith('.json')) : [];
  for (const file of files) collect(JSON.parse(readFileSync(`${folder}${file}`, 'utf8')));
  return [...names];
})();
note('the real names to look for are read from the tracker’s own fixtures', realNames.length > 0);

/** Whether a page's text holds some words, whatever case the page's styles draw them in. */
const has = (text, words) => text.toLowerCase().includes(words.toLowerCase());

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
    LOCAL_DATA: 'made-up-database',
    PUBLIC_BASE_URL: origin,
  });
  await step('starting the server on the made-up database and the browser', async () => {
    // The made-up database is made at the first request: the demo league's standings.
    await waitFor(`${origin}/`, server, [{ address: `/${slug}/standings` }]);
    browser = await launch();
  });
}

if (browser) {
  const visitor = await browser.newContext();
  const page = await visitor.newPage();
  page.setDefaultTimeout(60_000);
  const open = async (address) => {
    const response = await page.goto(origin + address);
    await page.locator('main').first().waitFor();
    return { status: response?.status() ?? 0, text: await page.locator('main').innerText() };
  };
  /** What every page of the demo league is checked for, besides its own checks. */
  const everyPage = async (label) => {
    const problems = await accessibilityProblems(page);
    note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
    const html = (await page.content()).toLowerCase();
    // Counted, never listed: a failure must not print the real names.
    const real = realNames.filter((name) => html.includes(name)).length;
    note(`${label}: no real name on the page`, real === 0, `${real} found`);
    const surnames = demoLeague.madeUpSurnames.filter((name) => has(html, name));
    note(`${label}: no student's surname in full`, surnames.length === 0, surnames.join(', '));
  };
  /** The page's tables, cell by cell, with their captions and column headers. */
  const tablesOnPage = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('main table')].map((table) => ({
        caption: table.querySelector('caption')?.textContent?.trim() ?? '',
        headers: [...table.querySelectorAll('thead th')].map((th) =>
          th.textContent.replace(/\s+/g, ' ').trim(),
        ),
        rows: [...table.querySelectorAll('tbody tr')].map((tr) =>
          [...tr.children].map((cell) => cell.textContent.replace(/\s+/g, ' ').trim()),
        ),
      })),
    );
  /** The column of a table whose header holds a word (GP, W, PTS …), or -1. */
  const column = (table, word) =>
    table.headers.findIndex((h) => new RegExp(`\\b${word}\\b`).test(h));

  /** The tracked school's record, as its district's table gives it: "W-L". */
  let trackedRecord = '';

  // 1. Their league as a site.
  await step('the league as a site: home, standings, schedule, teams', async () => {
    const standings = await open(`/${slug}/standings`);
    note('the standings page is served', standings.status === 200);
    note('the standings name the season', has(standings.text, demoLeague.season.name));
    const tables = await page.evaluate(() =>
      [...document.querySelectorAll('table.ui-standings')].map((table) => ({
        headers: [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim()),
        rows: [...table.querySelectorAll('tbody tr')].map((row) => ({
          team: row.querySelector('.ui-team-cell .ui-team-name')?.textContent?.trim() ?? '',
          // Every cell, the team's own header cell included, so they line up with the headers.
          cells: [...row.children].map((cell) => cell.textContent.trim()),
        })),
      })),
    );
    note(
      "every district's table, six schools each",
      JSON.stringify(tables.map((t) => t.rows.length)) ===
        JSON.stringify(demoLeague.divisions.map((d) => d.teams.length)),
      JSON.stringify(tables.map((t) => t.rows.map((r) => r.team))),
    );
    for (const [n, division] of demoLeague.divisions.entries()) {
      note(`the standings name ${division.name}`, has(standings.text, division.name));
      const listed = (tables[n]?.rows ?? []).map((row) => row.team).sort();
      note(
        `${division.name}'s table holds its own schools`,
        JSON.stringify(listed) === JSON.stringify(division.teams.map((t) => t.name).sort()),
        listed.join(', '),
      );
    }
    let wins = 0;
    for (const table of tables) {
      const at = (word) => table.headers.findIndex((h) => h.toUpperCase() === word);
      for (const row of table.rows) {
        const [gp, w, l] = ['GP', 'W', 'L'].map((word) => Number(row.cells[at(word)]));
        note(
          `${row.team} has played its ten games`,
          gp === 10 && w + l === 10,
          row.cells.join(' '),
        );
        wins += w;
        if (row.team === tracked.name) trackedRecord = `${w}-${l}`;
      }
    }
    note('one win for every game in the file', wins === gamesInFile, String(wins));
    await everyPage(`/${slug}/standings`);

    const home = await open(`/${slug}`);
    note('the home page is served', home.status === 200);
    note('the home page names the league', has(home.text, demoLeague.name.split(' ')[0]));
    note('the home page names the season', has(home.text, demoLeague.season.name));
    note(
      'the home page counts every school and every game played',
      /TEAMS\s+24\b/i.test(home.text) &&
        new RegExp(`GAMES PLAYED\\s+${gamesInFile}\\b`, 'i').test(home.text),
      home.text.slice(0, 400),
    );
    await everyPage(`/${slug}`);

    const schedule = await open(`/${slug}/schedule`);
    note('the schedule page is served', schedule.status === 200);
    note('the schedule names its season', has(schedule.text, demoLeague.season.name));
    note(
      'the schedule shows played games as final, with their gyms',
      (schedule.text.match(/\bFinal\b/gi) ?? []).length > 0 && /\bGym\b/.test(schedule.text),
      schedule.text.slice(0, 400),
    );
    await everyPage(`/${slug}/schedule`);

    const teams = await open(`/${slug}/teams`);
    note('the teams page is served', teams.status === 200);
    const missing = schools.filter((school) => !has(teams.text, school.name));
    note(
      'the teams page lists every school',
      missing.length === 0,
      missing.map((s) => s.name).join(', '),
    );
    await everyPage(`/${slug}/teams`);
  });

  // 2. One team's whole season.
  await step("one school's whole season, scored live", async () => {
    const team = await open(`/${slug}/teams/${tracked.shortName}`);
    note(`${tracked.name}'s page is served`, team.status === 200);
    note(`${tracked.name}'s page names the school`, has(team.text, tracked.name));
    note(
      `${tracked.name}'s record is the one its district's table gives (${trackedRecord})`,
      trackedRecord !== '' && new RegExp(`RECORD\\s+${trackedRecord}\\b`, 'i').test(team.text),
      team.text.slice(0, 300),
    );
    const results = await page
      .locator('main article, main li')
      .filter({ hasText: /\bFinal\b/i })
      .filter({ hasText: tracked.name })
      .count();
    const said = (team.text.match(/, final, \d+ to \d+/g) ?? []).length;
    note(`${tracked.name}'s page holds its ten results`, said === 10, `${said} (${results} cards)`);
    const tables = await tablesOnPage();
    const roster = tables.find((t) => column(t, 'NUMBER') >= 0 || /roster/i.test(t.caption));
    const numbers = new Map((roster?.rows ?? []).map((cells) => [cells[1], cells[0]]));
    for (const player of trackedPlayers) {
      note(
        `the roster shows ${player.shown} with number ${player.jersey}`,
        numbers.get(player.shown) === player.jersey,
        JSON.stringify(roster?.rows ?? tables.map((t) => t.headers)),
      );
    }
    const stats = tables.find((t) => column(t, 'PTS') >= 0);
    note(
      `${tracked.name}'s players' statistics are shown, every player with games`,
      stats !== undefined &&
        stats.rows.length === trackedPlayers.length &&
        stats.rows.every((cells) => Number(cells[column(stats, 'GP')]) > 0),
      JSON.stringify(stats?.rows ?? []),
    );
    await everyPage(`/${slug}/teams/${tracked.shortName}`);

    const statistics = await open(`/${slug}/stats?by=total`);
    note('the statistics page is served', statistics.status === 200);
    const all = (await tablesOnPage()).find((t) => /All players/i.test(t.caption));
    // A row's player cell also carries the team for narrow screens: rows are read whole.
    const rows = (all?.rows ?? []).map((cells) => cells.join(' '));
    const found = trackedPlayers.filter((p) => rows.some((row) => row.includes(p.shown)));
    note(
      `the statistics list ${tracked.name}'s players, and only them`,
      rows.length === trackedPlayers.length &&
        found.length === trackedPlayers.length &&
        rows.every((row) => row.includes(tracked.name)),
      rows.join(' | '),
    );
    const leaders = await page.evaluate(
      () => document.querySelector('.stats-leaders')?.textContent ?? '',
    );
    note(
      `the points leaders are ${tracked.name}'s`,
      has(leaders, 'Points') && trackedPlayers.some((p) => leaders.includes(p.shown)),
      leaders.slice(0, 300),
    );
    // 3. Every other school's players' numbers hidden, here and on their own pages.
    note(
      "no other school's player is in the statistics",
      opponentPlayers.every((shown) => !statistics.text.includes(shown)),
    );
    const totalsOnly = statistics.text.match(/Only team totals are shown for ([^\n]*)/);
    note(
      'the statistics say the schools it played show team totals only',
      opponents.every((school) => (totalsOnly?.[1] ?? '').includes(school.name)),
      totalsOnly?.[0] ?? '',
    );
    await everyPage(`/${slug}/stats`);
  });

  await step("the other schools' players' numbers hidden", async () => {
    // Every school the tracked one played has players' lines from those games; one it never
    // played has none to hide.
    const neverPlayed = schools.find((s) => !opponents.includes(s) && s !== tracked);
    for (const school of [...opponents, neverPlayed]) {
      if (school === undefined) continue;
      const team = await open(`/${slug}/teams/${school.shortName}`);
      note(`${school.name}'s page is served`, team.status === 200);
      if (school !== neverPlayed) {
        note(
          `${school.name}'s page says its players' numbers are not public`,
          has(team.text, "players' numbers are not public") ||
            has(team.text, 'players’ numbers are not public'),
          team.text.slice(-400),
        );
      }
      const tables = await tablesOnPage();
      note(
        `${school.name}'s page shows no player's statistics`,
        tables.every((t) => column(t, 'PTS') < 0),
        JSON.stringify(tables.map((t) => t.headers)),
      );
      await everyPage(`/${slug}/teams/${school.shortName}`);
    }
  });

  // P9 §3, item 2: every game of the tracked school's season with its box score.
  await step("the tracked school's box scores", async () => {
    /** The games a team's page links to, each once. */
    const gamesOf = async (school) => {
      await open(`/${slug}/teams/${school.shortName}`);
      return [
        ...new Set(
          await page.evaluate(() =>
            [...document.querySelectorAll('main a[href*="/games/"]')].map(
              (a) => a.getAttribute('href') ?? '',
            ),
          ),
        ),
      ];
    };
    /** A number in a box score's cell; "–" (nothing recorded) is none. */
    const number = (cell) => (/^\d+$/.test(cell ?? '') ? Number(cell) : 0);
    const games = await gamesOf(tracked);
    note(`${tracked.name}'s page links to its ten games`, games.length === 10, games.join(' '));
    for (const [n, address] of games.entries()) {
      const label = `${tracked.name}'s game ${n + 1}`;
      const game = await open(address);
      note(`${label}: its page is served`, game.status === 200);
      const boxes = await page.evaluate(() =>
        [...document.querySelectorAll('main table.ui-box-score')].map((table) => ({
          caption: table.querySelector('caption')?.textContent?.trim() ?? '',
          hidden: table.getAttribute('data-players') === 'hidden',
          headers: [...table.querySelectorAll('thead th')].map((th) =>
            th.textContent.replace(/\s+/g, ' ').trim(),
          ),
          rows: [...table.querySelectorAll('tbody tr, tfoot tr')].map((tr) =>
            [...tr.children].map((cell) => cell.textContent.replace(/\s+/g, ' ').trim()),
          ),
        })),
      );
      const ours = boxes.find((box) => has(box.caption, tracked.name));
      const theirs = boxes.find((box) => box !== ours);
      const opponent = opponents.find((school) => has(theirs?.caption ?? '', school.name));
      // The game's own sentence: "Away 55, Home 64."
      const scoreOf = (name) =>
        Number(game.text.match(new RegExp(`${name} (\\d+)[,.]`))?.[1] ?? Number.NaN);
      note(
        `${label}: two box scores, its own and the school it played`,
        boxes.length === 2 && ours !== undefined && opponent !== undefined,
        JSON.stringify(boxes.map((box) => box.caption)),
      );
      if (ours === undefined || theirs === undefined || opponent === undefined) continue;
      const points = column(ours, 'PTS');
      const isTotal = (cells) => cells.some((cell) => cell === 'Total');
      const lines = ours.rows.filter((cells) => !isTotal(cells));
      const total = number(ours.rows.find(isTotal)?.[points]);
      const added = lines.reduce((sum, cells) => sum + number(cells[points]), 0);
      note(
        `${label}: its players' points add up to its total and its final score`,
        points >= 0 && added === total && total === scoreOf(tracked.name) && total > 0,
        `${added} / ${total} / ${scoreOf(tracked.name)}`,
      );
      note(
        `${label}: its box score lists its players by number`,
        lines.length > 0 && lines.every((cells) => /^\d+$/.test(cells[0] ?? '')),
        JSON.stringify(lines.map((cells) => cells.slice(0, 2))),
      );
      const theirTotal = number(theirs.rows.find(isTotal)?.[column(theirs, 'PTS')]);
      note(
        `${label}: ${opponent.name} shows its team's total only, its final score`,
        theirs.hidden &&
          theirs.rows.length === 1 &&
          theirTotal === scoreOf(opponent.name) &&
          (has(game.text, "players' numbers are not public") ||
            has(game.text, 'players’ numbers are not public')),
        JSON.stringify(theirs.rows),
      );
      const html = await page.content();
      const named = demoLeague.trackerPlayers[opponent.shortName]
        .map(([, name]) => shownAs(name))
        .filter((shown) => html.includes(shown));
      note(
        `${label}: no player of ${opponent.name} is named, in the box scores or the plays`,
        named.length === 0,
        named.join(', '),
      );
      await everyPage(`${label}'s page`);
    }
    // A game between two other schools: its final score, and no box score to show.
    const other = schools.find((s) => !opponents.includes(s) && s !== tracked);
    const [elsewhere] = other === undefined ? [] : await gamesOf(other);
    if (elsewhere !== undefined) {
      const game = await open(elsewhere);
      note(
        "another school's game shows its final score only",
        game.status === 200 &&
          has(game.text, 'Only the final score was recorded') &&
          (await page.locator('main table.ui-box-score').count()) === 0,
        game.text.slice(0, 400),
      );
      await everyPage(`${other.name}'s game page`);
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Demo-shaped league browser check failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Demo-shaped league browser check passed: ${checked.length} checks in a real browser.`);
