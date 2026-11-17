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
// audit's case 45) is read word for word. On the statistics page the teams' table counts
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
  'Owls and Falcons are level on win percentage (0.667). The game between them puts Owls ahead.';
const stillTied =
  'Level with another team: nothing in the rules separates them yet, so they are shown in a fixed order.';

/** Every standings table of the page: its name, its columns, and each row with its notes. */
const readTables = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('table.ui-standings')].map((table) => {
      const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
      const rows = [...table.querySelectorAll('tbody tr')].map((tr, place) => {
        const cells = [...tr.children].map((cell) => cell.textContent.trim());
        const notes = [...tr.querySelectorAll('.ui-note-mark a')].map(
          (a) => document.getElementById(a.getAttribute('href').slice(1))?.textContent.trim() ?? '',
        );
        return {
          place,
          team: tr.querySelector('.ui-team-name')?.textContent.trim() ?? '',
          cell: Object.fromEntries(heads.map((head, i) => [head, cells[i] ?? ''])),
          notes,
        };
      });
      return { caption: table.querySelector('caption')?.textContent.trim() ?? '', heads, rows };
    }),
  );

const twoTeams =
  /^(.+) and (.+) are level on (win percentage|points) \(([^)]+)\)\. (?:(Point difference|Points scored|Fewer points allowed) puts (.+) ahead: (\S+) against (\S+)\.|A coin flip puts (.+) ahead\.|The games? between them puts? (.+) ahead\.)$/;
const severalTeams =
  /^(.+) are level on (win percentage|points) \(([^)]+)\)\. The season’s tiebreakers set their order/;
const columnOf = {
  'Point difference': 'DIFF',
  'Points scored': 'PF',
  'Fewer points allowed': 'PA',
};

/** Checks every note of a page's tables against the rows it is beside. */
function checkNotes(label, tables) {
  const all = tables.flatMap((table) => table.rows.map((row) => ({ ...row, table })));
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
      const two = twoTeams.exec(text);
      const several = severalTeams.exec(text);
      const on = two?.[3] ?? several?.[2];
      const value = two?.[4] ?? several?.[3];
      note(`${where} is a note this step writes`, two !== null || several !== null);
      // The number they are level on is each marked team's own (PCT, or PTS by points).
      const column = on === 'points' ? 'PTS' : 'PCT';
      note(
        `${where} gives each team's own ${column}`,
        level.every((other) => other.cell[column] === value),
        level.map((other) => `${other.team} ${other.cell[column]}`).join(', '),
      );
      if (two === null) continue;
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
    return {
      note: section?.querySelector('.ui-section-note')?.textContent.trim() ?? '',
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
    `the statistics say which games they count, with the teams' table, at ${width}`,
    teams.note.startsWith(countsSentence),
    teams.note,
  );
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
