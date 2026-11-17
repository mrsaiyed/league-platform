// Step 2.195: the notes beside the standings say only what is true of the team they are
// beside, and the statistics say which games they count. In a real browser at a phone's
// width (390) and a laptop's (1280), on the web app's made-up stand-in (APP_ENV=test):
// nothing leaves this computer. Builds the app first unless given --no-build. A visitor
// starts at each league's home, the one address typed, and taps the menu from there.
//
// A note is read the way a parent reads it: every team its mark is beside is named in it,
// the number it says they are level on is the number in each of their rows, and for two
// teams the numbers it gives are the two rows' own, with the team it puts ahead above the
// other. No note anywhere says a team was "placed above". North Valley East (the numbers
// audit's case 45) is read word for word. Step 2.198: a note for three or more says what
// placed each (their records among them, then what separated those still level), and each
// of its sentences is read against the rows: North Valley West (case 46) word for word. On the statistics page the teams' table counts
// its games beside the team, and the sentence on which games count stands with it.
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
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

const countsSentence =
  'Statistics count the games that were scored live or entered as a box score. A game with only a final score counts in the standings, not here.';
const eastNote =
  'Owls and Falcons are level on win percentage (.667). The game between them puts Owls ahead.';
const westNote =
  'Lions, Tigers, Hawks, and Bears are level on win percentage (.500). In the games among these four: Lions 1–0, Tigers 1–1, Hawks 1–1, Bears 0–1. Point difference puts Tigers ahead of Hawks: +3 against -3.';
const stillTied =
  'Level with another team: nothing in the rules separates them yet, so they are shown in a fixed order.';

/** Every standings table of the page: its name, its columns, and each row with its notes. */
const readTables = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('table.ui-standings')].map((table) => {
      const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
      const rows = [...table.querySelectorAll('tbody tr')].map((tr, place) => {
        const cells = [...tr.children].map((cell) => cell.textContent.trim());
        const rawNotes = [...tr.querySelectorAll('.ui-note-mark a')].map(
          (a) => document.getElementById(a.getAttribute('href').slice(1))?.textContent.trim() ?? '',
        );
        return {
          place,
          team: tr.querySelector('.ui-team-name')?.textContent.trim() ?? '',
          cell: Object.fromEntries(heads.map((head, i) => [head, cells[i] ?? ''])),
          // As a person reads them: without the invisible joiners that hold a record's dash
          // to its numbers (step 2.198); rawNotes keeps them.
          notes: rawNotes.map((text) => text.replaceAll('⁠', '')),
          rawNotes,
        };
      });
      return { caption: table.querySelector('caption')?.textContent.trim() ?? '', heads, rows };
    }),
  );

const twoTeams =
  /^(.+) and (.+) are level on (win percentage|points) \(([^)]+)\)\. (?:(Point difference|Points scored|Fewer points allowed) puts (.+) ahead: (\S+) against (\S+)\.|A coin flip puts (.+) ahead\.|The games? between them puts? (.+) ahead\.)$/;
const severalTeams = /^(.+) are level on (win percentage|points) \(([^)]+)\)\. (.+)$/;
const columnOf = {
  'Point difference': 'DIFF',
  'Points scored': 'PF',
  'Fewer points allowed': 'PA',
  'point difference': 'DIFF',
  'points scored': 'PF',
  'fewest points allowed': 'PA',
  'points allowed': 'PA',
};

/** "Lions 1–0, Tigers 1–1" or "Birch +5, Ash +3": each team with its figure, in order. */
const entriesOf = (list) =>
  list.split(', ').map((entry) => {
    const [, team = entry, figure = ''] = /^(.+) (\S+)$/.exec(entry) ?? [];
    return { team, figure };
  });

/**
 * Step 2.198: the sentences after "level on…" for three or more, each read against the
 * rows the note is beside (`level`, in the table's order): every team named is one of
 * them, named in the table's order; every figure is the row's own where the table shows
 * that column; a team put "ahead of" another is above it.
 */
function checkSteps(where, rest, level) {
  const placeOf = (team) => level.findIndex((row) => row.team === team);
  const rowOf = (team) => level.find((row) => row.team === team);
  const inOrder = (teams) =>
    teams.every((team) => placeOf(team) >= 0) &&
    teams.every((team, i) => i === 0 || placeOf(team) > placeOf(teams[i - 1]));
  const figuresMatch = (entries, column) =>
    entries.every(
      ({ team, figure }) =>
        rowOf(team)?.cell[column] === undefined || rowOf(team)?.cell[column] === figure,
    );
  const sentences = rest.replace(/\.$/, '').split(/\. (?=[A-Z])/);
  for (const sentence of sentences) {
    const said = `${where}, "${sentence}"`;
    let m;
    if (
      /^The season’s tiebreakers set their order|are still level after all of them/.test(sentence)
    ) {
      continue;
    }
    if ((m = /^In the games among these (\w+): (.+)$/.exec(sentence))) {
      const entries = entriesOf(m[2]);
      note(
        `${said} gives every team's record, in the table's order`,
        entries.length === level.length && inOrder(entries.map((e) => e.team)),
      );
      note(
        `${said} gives records`,
        entries.every((e) => /^\d+–\d+(–\d+)?$/.test(e.figure)),
      );
    } else if ((m = /^In the games (?:between|among) (.+?): (.+)$/.exec(sentence))) {
      const entries = entriesOf(m[2]);
      note(
        `${said} names teams of the note, in the table's order`,
        inOrder(entries.map((e) => e.team)),
      );
    } else if (/^Head-to-head does not count here: /.test(sentence)) {
      continue;
    } else if (
      (m =
        /^(Point difference|Points scored|Fewer points allowed) puts (.+) ahead of (.+): (\S+) against (\S+)$/.exec(
          sentence,
        ))
    ) {
      const column = columnOf[m[1]];
      note(`${said} puts the higher team ahead`, inOrder([m[2], m[3]]));
      note(
        `${said} quotes the two rows' ${column}`,
        figuresMatch(
          [
            { team: m[2], figure: m[4] },
            { team: m[3], figure: m[5] },
          ],
          column,
        ),
      );
    } else if ((m = /^A coin flip puts (.+) ahead of (.+)$/.exec(sentence))) {
      note(`${said} puts the higher team ahead`, inOrder([m[1], m[2]]));
    } else if (
      (m = /^By (point difference|points scored|fewest points allowed): (.+)$/.exec(sentence))
    ) {
      const entries = entriesOf(m[2]);
      note(`${said} lists them in the table's order`, inOrder(entries.map((e) => e.team)));
      note(`${said} quotes each row's ${columnOf[m[1]]}`, figuresMatch(entries, columnOf[m[1]]));
    } else if ((m = /^A coin flip puts them in this order: (.+)$/.exec(sentence))) {
      note(`${said} lists them in the table's order`, inOrder(m[1].split(', ')));
    } else if (
      (m =
        /^(.+) are also level on (point difference|points scored|points allowed) \((\S+)\)$/.exec(
          sentence,
        ))
    ) {
      const teams = m[1].split(/, and |, | and /);
      note(
        `${said} gives the figure each of them has`,
        figuresMatch(
          teams.map((team) => ({ team, figure: m[3] })),
          columnOf[m[2]],
        ) && inOrder(teams),
      );
    } else if (
      /^Nothing in the season’s tiebreakers separates (.+) yet, so they are shown in a fixed order$/.test(
        sentence,
      )
    ) {
      continue;
    } else {
      note(`${said} is a sentence step 2.198 writes`, false);
    }
  }
}

/** Checks every note of a page's tables against the rows it is beside. */
function checkNotes(label, tables) {
  const all = tables.flatMap((table) => table.rows.map((row) => ({ ...row, table })));
  // One number, one way: a win percentage reads .500, .667, 1.000 or .000, never 0.500.
  const pct = all.map((row) => row.cell['PCT']).filter((cell) => cell !== undefined);
  note(
    `${label}: every PCT is written as a basketball table writes it`,
    pct.length > 0 && pct.every((cell) => /^(\.\d{3}|1\.000)$/.test(cell)),
    pct.join(' '),
  );
  note(
    `${label}: some team carries a note`,
    all.some((row) => row.notes.length > 0),
  );
  for (const row of all) {
    for (const text of row.notes) {
      const where = `${label}, ${row.team}: "${text}"`;
      note(`${where} never says "placed above"`, !/placed above|level on record/i.test(text));
      if (text.startsWith('Adjusted by') || text === stillTied) continue;
      const level = row.table.rows.filter((other) => other.notes.includes(text));
      const named = level.every((other) => text.includes(other.team));
      note(`${where} names every team it is beside`, named);
      if (/ have not played yet\.$/.test(text)) {
        // Only beside a team with no games (the GP column, where the table shows it).
        note(
          `${where} is beside teams with no games only`,
          level.every((other) => other.cell['GP'] === undefined || other.cell['GP'] === '0'),
        );
        continue;
      }
      const two = twoTeams.exec(text);
      const several = severalTeams.exec(text);
      const on = two?.[3] ?? several?.[2];
      const value = two?.[4] ?? several?.[3];
      note(`${where} is a note this step writes`, two !== null || several !== null);
      // The number they are level on is each marked team's own (PCT, or PTS by points),
      // written the same way in the note and in the column (.500, never 0.500).
      const column = on === 'points' ? 'PTS' : 'PCT';
      note(
        `${where} gives each team's own ${column}, written as the column writes it`,
        value !== undefined && level.every((other) => other.cell[column] === value),
        level.map((other) => `${other.team} ${other.cell[column]}`).join(', '),
      );
      note(
        `${where} is beside teams that have played`,
        level.every((other) => other.cell['GP'] === undefined || other.cell['GP'] !== '0'),
      );
      if (two === null) {
        if (several !== null) checkSteps(where, several[4], level);
        continue;
      }
      note(`${where} is beside two teams`, level.length === 2);
      const [first, second] = level;
      const ahead = two[6] ?? two[9] ?? two[10];
      note(`${where} puts the higher team ahead`, ahead === first?.team && two[1] === first?.team);
      const shown = columnOf[two[5]];
      // The home page's small table has no such column: the note carries the numbers, and
      // they are checked where the full table shows them.
      if (shown !== undefined && first?.cell[shown] !== undefined) {
        note(
          `${where} quotes the two rows' ${shown}`,
          two[7] === first.cell[shown] && two[8] === second?.cell[shown],
          `${first.cell[shown]} and ${second?.cell[shown]}`,
        );
      }
    }
  }
}

let built = true;
if (!process.argv.includes('--no-build')) {
  built = await buildNext();
  if (!built) failures.push('next build failed or took over 10 minutes');
}

if (built) {
  const origin = `http://localhost:${await freePort()}`;
  const server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
    LOCAL_NOW: worldAtNoon(),
  });
  let browser;
  let at = 'starting';
  try {
    // The pages the visitor taps to are drawn once first, so a cold page never meets a tap.
    await waitFor(
      `${origin}/north-valley`,
      server,
      [
        '/north-valley/standings',
        '/north-valley/stats',
        '/harbor-city',
        '/harbor-city/standings',
      ].map((address) => ({ address })),
    );
    browser = await launch();
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await context.newPage();
      page.setDefaultTimeout(60_000);
      const looked = async (label) => {
        const problems = await accessibilityProblems(page);
        note(`accessibility: ${label} at ${width}`, problems.length === 0, problems.join('; '));
        const wide = await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        );
        note(`no sideways scrolling: ${label} at ${width}`, wide);
      };
      /** A league's home: where a visitor starts, the one address typed. */
      const start = async (league) => {
        at = `${league}'s home at ${width}`;
        await page.goto(`${origin}/${league}`);
        await looked(`${league}'s home`);
      };
      /** Taps a page of the site's menu (behind the menu button on a phone), as a visitor does. */
      const tapMenu = async (name, url) => {
        at = `tapping ${name} at ${width}`;
        const menu = page.locator('header summary', { hasText: 'Menu' }).first();
        if ((await menu.count()) > 0 && (await menu.isVisible())) {
          const opened = await menu.evaluate((el) => el.parentElement?.hasAttribute('open'));
          if (!opened) await menu.click();
        }
        const link = page.locator('header').getByRole('link', { name, exact: true }).first();
        await Promise.all([page.waitForURL(url), link.click()]);
        await looked(name);
      };

      await start('north-valley');
      const home = await readTables(page);
      checkNotes(`North Valley's home at ${width}`, home);
      note(
        `the home page's small table at ${width} shows no difference column and its notes cite none`,
        home.length > 0 &&
          home.every((table) => !table.heads.includes('DIFF')) &&
          home
            .flatMap((table) => table.rows.flatMap((row) => row.notes))
            .every((text) => !/difference between points/i.test(text)),
      );

      await tapMenu('Standings', /\/north-valley\/standings$/);
      const standings = await readTables(page);
      checkNotes(`North Valley's standings at ${width}`, standings);
      const east = standings.find((table) => table.caption === 'East');
      const beside = (team) => east?.rows.find((row) => row.team === team)?.notes ?? [];
      note(
        `case 45 at ${width}: the Falcons, second, read what put the Owls ahead`,
        beside('Falcons').length === 1 && beside('Falcons')[0] === eastNote,
        JSON.stringify(beside('Falcons')),
      );
      note(
        `case 45 at ${width}: the Owls carry the same note, the Herons none`,
        beside('Owls')[0] === eastNote && beside('Herons').length === 0,
      );
      // Step 2.198, case 46: the four level teams of the West, word for word beside each,
      // and each record held whole on the page (no "0–" at a line's end).
      const west = standings.find((table) => table.caption === 'West');
      for (const team of ['Lions', 'Tigers', 'Hawks', 'Bears']) {
        const row = west?.rows.find((r) => r.team === team);
        note(
          `case 46 at ${width}: ${team} read what placed each of the four`,
          row?.notes.includes(westNote) === true,
          JSON.stringify(row?.notes),
        );
      }
      note(
        `case 46 at ${width}: each record's dash is held to its numbers`,
        west?.rows.some((r) => r.rawNotes.some((t) => t.includes('Bears 0⁠–⁠1'))) === true,
      );

      await tapMenu('Stats', /\/north-valley\/stats$/);
      await checkStats(page, width);

      await start('harbor-city');
      checkNotes(`Harbor City's home at ${width}`, await readTables(page));
      await tapMenu('Standings', /\/harbor-city\/standings$/);
      const harbor = await readTables(page);
      checkNotes(`Harbor City's standings at ${width}`, harbor);
      const stillBeside = harbor
        .flatMap((table) => table.rows)
        .filter((row) => row.notes.includes(stillTied))
        .map((row) => row.team);
      note(
        `teams nothing separates keep today's sentence at ${width}`,
        stillBeside.length >= 2,
        JSON.stringify(stillBeside),
      );
      await context.close();
    }
  } catch (error) {
    failures.push(`${at}: ${String(error?.message ?? error).split('\n')[0]}`);
  } finally {
    await browser?.close();
    server.child.kill();
  }
}

/** North Valley's statistics page, open in `page`: the teams' table and what stands with it. */
async function checkStats(page, width) {
  const teams = await page.evaluate(() => {
    const section = [...document.querySelectorAll('section.ui-section')].find(
      (s) => s.querySelector('h2')?.textContent.trim() === 'Teams',
    );
    const table = section?.querySelector('table');
    // Said once, above both tables: the line just before them.
    const both = document.querySelector('.stats-tables');
    const players = [...document.querySelectorAll('section.ui-section')].find(
      (s) => s.querySelector('h2')?.textContent.trim() === 'All players',
    );
    return {
      note: both?.previousElementSibling?.textContent.trim() ?? '',
      said: (document.querySelector('main')?.textContent.match(/Statistics count the games/g) ?? [])
        .length,
      // On a laptop the two tables stand side by side and start level.
      tops: [players, section].map((s) =>
        Math.round(s?.querySelector('table')?.getBoundingClientRect().top ?? -1),
      ),
      heads: [...(table?.querySelectorAll('thead th') ?? [])].map((th) => th.innerText.trim()),
      full: [...(table?.querySelectorAll('thead th') ?? [])].map((th) => th.textContent.trim()),
      rows: [...(table?.querySelectorAll('tbody tr') ?? [])].map((tr) =>
        [...tr.children].map((cell) => cell.textContent.trim()),
      ),
      // The table's own box: whether its last column is in view without scrolling.
      fits: table
        ? table.closest('.ui-table-wrap').scrollWidth <=
          table.closest('.ui-table-wrap').clientWidth + 1
        : false,
    };
  });
  note(
    `the statistics say which games they count, once, above both tables, at ${width}`,
    teams.note.startsWith(countsSentence) && teams.said === 1,
    teams.note,
  );
  if (width >= 1024) {
    note(
      `the two tables start level at ${width}`,
      teams.tops[0] > 0 && teams.tops[0] === teams.tops[1],
      JSON.stringify(teams.tops),
    );
  }
  note(
    `the teams' table counts its games right after the team at ${width}`,
    /\bGP\b/.test(teams.heads[1] ?? '') && /Games with statistics/.test(teams.full[1] ?? ''),
    JSON.stringify(teams.full),
  );
  const owls = teams.rows.find((cells) => cells[0]?.includes('Owls'));
  note(`the Owls' numbers come from 3 games at ${width}`, owls?.[1] === '3', JSON.stringify(owls));
  note(`the teams' table fits without scrolling at ${width}`, teams.fits);
}

if (failures.length > 0) {
  console.error(`The true notes browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`The true notes browser test passed: ${checked.length} checks in a real browser.`);
