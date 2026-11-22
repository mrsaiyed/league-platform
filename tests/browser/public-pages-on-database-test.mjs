// Step 2.93 part 2 (record 069): the public home, schedule and standings pages read from
// the made-up database, in a real browser. The web app is started on its made-up
// database (APP_ENV=test, LOCAL_DATA=made-up-database): every migration and the two seed
// leagues in memory, each season under way (a game a week ago with its score and one a
// week on in each division). Nothing leaves this computer; every league and team is made
// up. Builds the app first unless given --no-build (npm run test:web:browser builds it
// once in web-exit-test.mjs, then runs this with --no-build). The same pages on the
// stand-in are checked by web-exit-test.mjs and one-world-test.mjs.
//
// For each seed league: the home page shows its season, its result and its standings;
// the schedule lists the season's four games, two with their final scores; the standings
// show both divisions' three teams, with one win and one loss in each; no team of the
// stand-in's made-up leagues appears; each page passes the accessibility checks.
// Part 3 (record 070): the statistics page lists the seed's players by the league's own
// name setting and audience (an adult league's child, a youth league's players, by first
// name and last initial) with the points their box scores gave, a points leaders card and
// none for fouls (S-48); the teams page lists every team; one team's page shows its record,
// its roster and its totals; the home page's leaders name the top scorers; the header
// shows the league's own name; and no page holds a withheld name or a private value.
// Step 2.187 (record 073): each league's home page is drawn in its own published design,
// its starting design's main color in the page's styles, not the neutral one (#1f5fbf),
// and the two leagues differ. A league with no design published is drawn in the neutral
// one: that fallback is proved in apps/web/src/server/database-league-sites.test.ts.
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

/**
 * The seed leagues as packages/database/src/seed/seed-data.ts makes them, and what their
 * seasons under way hold (seed-season-under-way.ts): in each division its first two teams
 * played (one final), and its second and third play next.
 */
const leagues = [
  {
    slug: 'lakeside',
    season: 'Winter Season',
    divisions: {
      North: ['Lakeside Herons', 'Lakeside Otters', 'Lakeside Pines'],
      South: ['Lakeside Gulls', 'Lakeside Foxes', 'Lakeside Owls'],
    },
    finals: 2,
    teamsPlaying: 6,
  },
  {
    slug: 'maple-street',
    season: 'Spring Season',
    divisions: { Open: ['Maple Comets', 'Maple Rockets', 'Maple Hawks', 'Maple Bears'] },
    finals: 1,
    teamsPlaying: 3,
  },
];
/**
 * The seed leagues' people as their pages show them on the leagues' starting name setting
 * (full names, no confirmation): Lakeside is an adult league with a child in it, Maple
 * Street a youth league. The season under way puts the league's people, in order, on the
 * teams that played, numbers 4 and on, and records their box scores: 10, 14, 18 points.
 * Then the first division's two teams play again, scored live through the tracker
 * (seed-tracked-games.ts, step 2.59): 9 more points for the home side's player, 7 for the
 * away side's, and a second win for the home team.
 */
const people = [
  {
    slug: 'lakeside',
    name: 'Lakeside Hoops League',
    // Its seed design, crest (packages/database/src/seed/seed-data.ts): its main color.
    primary: '#96062d',
    players: [
      { shown: 'Morgan Example', points: 19 },
      { shown: 'Quinn S.', points: 21 },
      { shown: 'Robin Placeholder', points: 18 },
    ],
    team: {
      slug: 'herons',
      name: 'Lakeside Herons',
      player: 'Morgan Example',
      number: '4',
      points: 19,
      record: '2-0',
      // Its final scores in its two games with a box score (52, and 9 in the tracked game): a
      // team's points are its final scores (S-26 as changed by step 2.196), where its
      // players' add to less.
      totalPoints: 61,
    },
    homeLeaders: ['Robin Placeholder', 'Quinn S.'],
    // The adult league's child, on their own team: by first name and last initial (R-14).
    child: {
      team: { slug: 'otters', name: 'Lakeside Otters' },
      shown: 'Quinn S.',
      lastName: 'Sample',
    },
    // The child's surname, and the made-up private values the seed holds.
    neverShown: ['Sample', 'morgan@lakeside', 'robin@lakeside', '1990-04-12', '2012-09-03'],
  },
  {
    slug: 'maple-street',
    name: 'Maple Street Rec League',
    // Its seed design, midnight-gold: its main color.
    primary: '#c8a84b',
    players: [
      { shown: 'Jordan I.', points: 19 },
      { shown: 'Casey F.', points: 21 },
    ],
    team: {
      slug: 'comets',
      name: 'Maple Comets',
      player: 'Jordan I.',
      number: '4',
      points: 19,
      record: '2-0',
      totalPoints: 61,
    },
    homeLeaders: ['Casey F.', 'Jordan I.'],
    neverShown: ['Imaginary', 'Fictional', 'jordan.parent@maple', '2013-06-02'],
  },
];
/** Whether a page's text holds some words, whatever case the page's styles draw them in. */
const has = (text, words) => text.toLowerCase().includes(words.toLowerCase());
/** What only the stand-in's made-up leagues hold, which must never show on the database. */
const standInOnly = /Falcons|Badgers|Lions|Tigers|Meteors|Fall 2026|North Valley|Harbor City/i;

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
    // The page its first visit reaches, the first league's standings, drawn once before
    // the browser starts.
    await waitFor(`${origin}/`, server, [{ address: `/${leagues[0].slug}/standings` }]);
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
  const accessible = async (label) => {
    const problems = await accessibilityProblems(page);
    note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
  };

  for (const league of leagues) {
    await step(`${league.slug}: the seed league's teams, read from the database`, async () => {
      const standings = await open(`/${league.slug}/standings`);
      note(`${league.slug}: the standings page is served`, standings.status === 200);
      const tables = await page.evaluate(() =>
        [...document.querySelectorAll('table.ui-standings')].map((table) =>
          [...table.querySelectorAll('tbody tr')].map((row) => ({
            // The name's own element: a row with a note also carries the note's mark
            // ("Note 1") in the same cell, which is no part of the team's name.
            team: row.querySelector('.ui-team-cell .ui-team-name')?.textContent?.trim() ?? '',
            cells: [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim()),
          })),
        ),
      );
      const divisions = Object.entries(league.divisions);
      note(
        `${league.slug}: the standings show a table per division, each with its teams`,
        JSON.stringify(tables.map((rows) => rows.length)) ===
          JSON.stringify(divisions.map(([, teams]) => teams.length)),
        JSON.stringify(tables.map((rows) => rows.map((r) => r.team))),
      );
      const teams = tables.flat().map((row) => row.team);
      const expected = divisions.flatMap(([, names]) => names).sort();
      note(
        `${league.slug}: the standings list the seed's teams`,
        JSON.stringify([...teams].sort()) === JSON.stringify(expected),
        teams.join(', '),
      );
      for (const [division] of divisions) {
        note(
          `${league.slug}: the standings name the ${division} division`,
          has(standings.text, division),
        );
      }
      note(
        `${league.slug}: each table holds its played game (a 1 for a win)`,
        tables.every((rows) => rows.some((row) => row.cells.includes('1'))),
        JSON.stringify(tables),
      );
      note(
        `${league.slug}: nothing of the stand-in in the standings`,
        !standInOnly.test(standings.text),
      );
      await accessible(`/${league.slug}/standings on the database`);

      const schedule = await open(`/${league.slug}/schedule`);
      note(`${league.slug}: the schedule page is served`, schedule.status === 200);
      note(`${league.slug}: the schedule names its season`, has(schedule.text, league.season));
      const named = expected.filter((team) => has(schedule.text, team));
      note(
        `${league.slug}: the schedule shows the season's games, teams by name`,
        named.length === league.teamsPlaying,
        named.join(', '),
      );
      note(
        `${league.slug}: the schedule shows the played games as final`,
        (schedule.text.match(/\bFinal\b/gi) ?? []).length >= league.finals,
        schedule.text.slice(0, 400),
      );
      note(
        `${league.slug}: nothing of the stand-in on the schedule`,
        !standInOnly.test(schedule.text),
      );
      await accessible(`/${league.slug}/schedule on the database`);

      const home = await open(`/${league.slug}`);
      note(`${league.slug}: the home page is served`, home.status === 200);
      note(`${league.slug}: the home page names the season`, has(home.text, league.season));
      note(
        `${league.slug}: the home page shows the standings' teams`,
        expected.every((team) => has(home.text, team)),
      );
      note(
        `${league.slug}: nothing of the stand-in on the home page`,
        !standInOnly.test(home.text),
      );
      await accessible(`/${league.slug} on the database`);
    });
  }

  // Part 3 (record 070): the pages that show people, and each league's name and look.
  /** Each league's main color as its home page drew it (step 2.187). */
  const drawnIn = new Map();
  for (const league of people) {
    const { slug } = league;
    /** Nothing a visitor may not see: a withheld name or a private value, anywhere. */
    const nothingPrivate = async (label) => {
      const html = await page.content();
      const found = league.neverShown.filter((value) => has(html, value));
      note(
        `${slug}: ${label} holds no withheld name or private value`,
        found.length === 0,
        found.join(', '),
      );
    };
    /**
     * No person's or roster place's database id in the page's HTML, the data sent with it
     * included. The server's made-up database makes its ids as it starts, so this test
     * cannot know the seed's person ids by value; instead every id-shaped value in the HTML
     * must be one the page links to openly (a game's address) or the league's own id. A
     * person's id, a roster place's, a team's or any other would be left over and fail.
     */
    const noPersonIds = async (label) => {
      const idShape = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
      const html = (await page.content()).toLowerCase();
      const linked = new Set(
        (
          await page.evaluate(() =>
            [...document.querySelectorAll('[href]')].map((el) => el.getAttribute('href') ?? ''),
          )
        ).flatMap((href) => href.toLowerCase().match(idShape) ?? []),
      );
      // The league's own id, which every page of the league carries for its own requests.
      for (const [, id] of html.matchAll(/leagueid\\?":\\?"([0-9a-f-]{36})/g)) linked.add(id);
      const others = [...new Set(html.match(idShape) ?? [])]
        .filter((id) => !linked.has(id))
        .map((id) => {
          const at = html.indexOf(id);
          return `${id} in "…${html.slice(Math.max(0, at - 60), at + 40)}…"`;
        });
      note(
        `${slug}: ${label} holds no person's or roster place's id`,
        others.length === 0,
        others.join(', '),
      );
    };
    await step(`${slug}: the pages that show people, read from the database`, async () => {
      const stats = await open(`/${slug}/stats?by=total`);
      note(`${slug}: the statistics page is served`, stats.status === 200);
      const players = await page.evaluate(() =>
        [...document.querySelectorAll('table')]
          .filter((table) =>
            (table.querySelector('caption')?.textContent ?? '').includes('All players'),
          )
          .flatMap((table) =>
            [...table.querySelectorAll('tbody tr')].map((row) => row.textContent ?? ''),
          ),
      );
      for (const player of league.players) {
        note(
          `${slug}: the statistics list ${player.shown} with ${player.points} points`,
          players.some((row) => has(row, player.shown) && row.includes(String(player.points))),
          players.join(' | '),
        );
      }
      note(
        `${slug}: the statistics list the seed's players only`,
        players.length === league.players.length,
        String(players.length),
      );
      const leaders = await page.evaluate(
        () => document.querySelector('.stats-leaders')?.textContent ?? '',
      );
      note(
        `${slug}: the statistics have a points leaders card`,
        has(leaders, 'Points'),
        leaders.slice(0, 300),
      );
      note(
        `${slug}: fouls get no leaders card (S-48)`,
        !has(leaders, 'Fouls'),
        leaders.slice(0, 300),
      );
      note(
        `${slug}: fouls are still in the players' table`,
        has(stats.text, 'Fouls') || has(stats.text, 'PF'),
      );
      note(`${slug}: nothing of the stand-in in the statistics`, !standInOnly.test(stats.text));
      await nothingPrivate('the statistics page');
      await accessible(`/${slug}/stats on the database`);

      const teams = await open(`/${slug}/teams`);
      note(`${slug}: the teams page is served`, teams.status === 200);
      const allTeams = Object.values(leagues.find((l) => l.slug === slug)?.divisions ?? {}).flat();
      note(
        `${slug}: the teams page lists every team of the season`,
        allTeams.every((team) => has(teams.text, team)),
        teams.text.slice(0, 300),
      );
      note(
        `${slug}: the teams page shows a winner's record`,
        new RegExp(`\\b${league.team.record}\\b`).test(teams.text),
        teams.text.slice(0, 300),
      );
      note(`${slug}: nothing of the stand-in on the teams page`, !standInOnly.test(teams.text));
      await accessible(`/${slug}/teams on the database`);

      const team = await open(`/${slug}/teams/${league.team.slug}`);
      note(`${slug}: ${league.team.name}'s page is served`, team.status === 200);
      note(`${slug}: ${league.team.name}'s page names the team`, has(team.text, league.team.name));
      // The page's tables, cell by cell: a number is checked in its own row and column,
      // never anywhere in the page's text, where a "4" or a "10" nearly always is.
      const tablesOnPage = () =>
        page.evaluate(() =>
          [...document.querySelectorAll('main table')].map((table) => ({
            headers: [...table.querySelectorAll('thead th')].map((th) =>
              th.textContent.replace(/\s+/g, ' ').trim(),
            ),
            rows: [...table.querySelectorAll('tbody tr')].map((tr) =>
              [...tr.children].map((cell) => cell.textContent.replace(/\s+/g, ' ').trim()),
            ),
          })),
        );
      const tables = await tablesOnPage();
      const rowOf = (name, inTables = tables) =>
        inTables.flatMap((table) => {
          const points = table.headers.findIndex((h) => /\bPoints\b/.test(h));
          return (
            table.rows
              // A team's cell may start with its shield's letter: the name ends the cell.
              .filter((cells) => cells.some((cell) => cell.endsWith(name)))
              .map((cells) => ({ cells, points: points < 0 ? undefined : cells[points] }))
          );
        });
      const inRoster = rowOf(league.team.player).find((row) => row.points === undefined);
      note(
        `${slug}: ${league.team.name}'s roster shows ${league.team.player} with number ${league.team.number}`,
        inRoster?.cells[0] === league.team.number,
        JSON.stringify(inRoster?.cells ?? tables),
      );
      note(
        `${slug}: ${league.team.name}'s record is ${league.team.record}`,
        new RegExp(`\\b${league.team.record}\\b`).test(team.text),
      );
      const inStats = rowOf(league.team.player).find((row) => row.points !== undefined);
      note(
        `${slug}: ${league.team.name}'s player statistics give ${league.team.player} ${league.team.points} points`,
        inStats?.points === String(league.team.points),
        JSON.stringify(inStats?.cells ?? tables),
      );
      // The team's totals are a strip of numbers under "Team totals" since step 2.147 part
      // 3, not a table row under the team's name: its Points number is read from the strip,
      // label by label, never from anywhere in the page's text.
      const totals = await page.evaluate(() =>
        [
          ...document.querySelectorAll('main [role="group"][aria-label="Team totals"] .ui-stat'),
        ].map((stat) => ({
          label: stat.querySelector('dt')?.textContent?.trim() ?? '',
          value: stat.querySelector('dd')?.textContent?.trim() ?? '',
        })),
      );
      note(
        `${slug}: ${league.team.name}'s totals show its ${league.team.totalPoints} points, its final score`,
        totals.find((stat) => /^Points$/.test(stat.label))?.value ===
          String(league.team.totalPoints),
        JSON.stringify(totals.length > 0 ? totals : tables),
      );
      // Its player's 10 beside the team's 52: the page says why (step 2.196).
      note(
        `${slug}: ${league.team.name}'s page says its totals can differ from its players' numbers`,
        has(
          await page.locator('main').innerText(),
          "A team's totals count what was charged to the team and the final scores as entered",
        ),
      );
      await nothingPrivate(`${league.team.name}'s page`);
      await noPersonIds(`${league.team.name}'s page`);
      await accessible(`/${slug}/teams/${league.team.slug} on the database`);

      // A child's own team page: their roster line by first name and last initial (R-14).
      if (league.child !== undefined) {
        const { child } = league;
        const theirs = await open(`/${slug}/teams/${child.team.slug}`);
        note(`${slug}: ${child.team.name}'s page is served`, theirs.status === 200);
        const line = rowOf(child.shown, await tablesOnPage()).find(
          (row) => row.points === undefined,
        );
        note(
          `${slug}: ${child.team.name}'s roster shows the child as ${child.shown}`,
          line !== undefined,
          theirs.text.slice(0, 600),
        );
        note(
          `${slug}: ${child.team.name}'s page never shows the child's family name`,
          !has(theirs.text, child.lastName),
        );
        await nothingPrivate(`${child.team.name}'s page`);
        await noPersonIds(`${child.team.name}'s page`);
      }

      const home = await open(`/${slug}`);
      for (const leader of league.homeLeaders) {
        note(
          `${slug}: the home page's leaders show ${leader}`,
          has(home.text, leader),
          home.text.slice(0, 600),
        );
      }
      await nothingPrivate('the home page');
      const look = await page.evaluate(() => ({
        name: document.querySelector('.site-name')?.textContent?.trim() ?? '',
        primary: getComputedStyle(document.documentElement)
          .getPropertyValue('--color-primary')
          .trim(),
        styles: [...document.querySelectorAll('style')].map((s) => s.textContent ?? '').join(' '),
      }));
      note(`${slug}: the header shows the league's own name`, look.name === league.name, look.name);
      // Its own published design (step 2.187), not the neutral one.
      note(
        `${slug}: drawn in its own design's main color ${league.primary}`,
        look.primary === league.primary,
        look.primary,
      );
      note(
        `${slug}: its design's main color is in the page's styles`,
        look.styles.includes(`--color-primary: ${league.primary};`),
      );
      note(`${slug}: not the neutral design`, look.primary !== '#1f5fbf', look.primary);
      drawnIn.set(slug, look.primary);
    });
  }
  note(
    'the two seed leagues are drawn in different designs',
    drawnIn.size === people.length && new Set(drawnIn.values()).size === people.length,
    JSON.stringify([...drawnIn]),
  );
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Public pages on the database browser check failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `Public pages on the database browser check passed: ${checked.length} checks in a real browser.`,
);
