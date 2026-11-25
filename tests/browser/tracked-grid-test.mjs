// A tracked game's box score corrected in its grid (step 2.65, T6 §8, T-405, T-406), in a
// real browser on a made-up world of its own:
// - A scorekeeper tracks a few plays on the scoring screen (a foul given to the wrong
//   player among them) and ends the game.
// - Before it is reopened, the game's page and its grid's address both say what to do
//   first, and offer no grid.
// - The owner reopens it with a reason and lands on the game's own page, which says it is
//   live again and offers "Edit the box score"; the page's sentence names both ways.
// - A scorekeeper's device then opens the game and holds it while the owner, in the grid,
//   moves the foul to the right player and saves: the page says the two plays in plain
//   sentences, and the game's list of plays (the server's `/state`) ends `unfoul`, `foul`.
// - The device's next tap is saved on top of the correction, which it never overwrites,
//   and the device then shows the server's numbers (or says in words why it cannot).
// - A lowered basket is refused beside its box, with everything typed kept and nothing
//   saved; a grid left open while the game changed in a second tab is refused at the top
//   with "Load it again", everything typed kept, and the second tab's change alone saved.
// - Ended again on a device, the public game page shows the same lines as the grid.
// Every wait has a time limit, and a wait that runs out is a failure, never a pass.
// Builds the app first unless given --no-build, so it never runs on an old build.
import {
  addPlayers,
  court,
  league,
  leagueId,
  liveGame,
  owner,
  scorekeeper,
  starters,
  trackerPath,
} from './tracker-driver.mjs';
import { buildNext, freePort, launch, startNext, waitFor } from './web-browser-kit.mjs';

/** How long a tap may take to show, a page to answer, or the game to be saved as ended. */
const tapLimit = 10_000;
const pageLimit = 20_000;
const endLimit = 20_000;

const words = {
  reason: 'Why it needs correcting (kept in the log, never shown publicly)',
  reopen: 'Reopen to correct',
  edit: 'Edit the box score',
  save: 'Save the changes',
  reload: 'Load it again',
  finalFirst: 'This game is final. To edit its box score, reopen it with a reason first.',
  bothWays:
    'This game was scored with the live tracker. Correct it with “Edit the box score”, or on the scoring screen to take points away; either way its list of plays still explains the numbers.',
  reopened:
    'The game is live again. Correct it with “Edit the box score” below, or on the scoring screen, then end it again there.',
  saved: 'Saved. These plays were added to the game’s list of plays:',
  lowered: (cell) =>
    `${cell} cannot go lower here. To take points away, reopen the game on the scoring screen and use Undo. Nothing was saved.`,
  stale:
    'Someone else changed this game since you opened this page, so nothing was saved. Load it again to see the new numbers; what you typed is still shown below.',
};

const failures = [];
let checks = 0;
const note = (what, ok, detail = '') => {
  checks += 1;
  if (!ok) failures.push(`${what}${detail === '' ? '' : `: ${detail}`}`);
};
const step = async (what, work) => {
  try {
    await work();
  } catch (error) {
    failures.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

if (!process.argv.includes('--no-build') && !(await buildNext())) {
  console.error('Tracked grid browser test: next build failed or took over 10 minutes');
  process.exit(1);
}

const origin = `http://localhost:${await freePort()}`;
const server = startNext(['start', '--port', new URL(origin).port], {
  APP_ENV: 'test',
  PUBLIC_BASE_URL: origin,
});
const gamePage = `/${league}/admin/games/${liveGame}`;
const gridPage = `${gamePage}/edit`;
let browser;

/** The game's plays as the server keeps them (its `/state`), oldest first. */
async function serverPlays() {
  const answer = await fetch(`${origin}/api/v1/leagues/${leagueId}/games/${liveGame}/state`, {
    headers: { cookie: `${scorekeeper.name}=${scorekeeper.value}` },
    signal: AbortSignal.timeout(pageLimit),
  });
  if (!answer.ok) throw new Error(`/state answered ${answer.status}`);
  const { state } = await answer.json();
  return state.plays;
}

/** A browser signed in as `who`, at a laptop's width; every wait in it has a limit. */
async function signedIn(who) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ ...who, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(pageLimit);
  page.setDefaultNavigationTimeout(pageLimit);
  return { context, page };
}

/** Opens `address` and throws unless it answers 200. */
async function open(page, address) {
  const answer = await page.goto(`${origin}${address}`);
  if (answer?.status() !== 200) throw new Error(`${address} answered ${answer?.status()}`);
}

/** The grid's form on `page`. */
const gridOf = (page) => page.locator('form[data-tracked-grid]');

/** The home team's name, from the grid page's title "Edit box score: {away} at {home}". */
async function homeName(page) {
  const title = (await page.locator('h1').first().textContent()) ?? '';
  const found = /^Edit box score: .+ at (.+)$/.exec(title.trim());
  if (found === null) throw new Error(`the grid's title is “${title}”`);
  return found[1];
}

/**
 * The home team's rows of the grid: each with its heading, its jersey (the heading's first
 * number), its points, and its boxes by column ("Fouls", "3-pointers made"...) as
 * `{ name, label, value }`.
 */
async function homeRows(page) {
  const home = await homeName(page);
  const section = gridOf(page).locator('section', {
    has: page.getByRole('heading', { name: home, exact: true }),
  });
  if ((await section.count()) !== 1) throw new Error(`no one grid of ${home}`);
  return section.evaluate((element) => {
    const columns = [...element.querySelectorAll('thead abbr')].map((a) => a.title);
    return [...element.querySelectorAll('tbody tr')].map((row) => {
      const heading = row.querySelector('th')?.textContent ?? '';
      const cells = [...row.querySelectorAll('td')];
      const boxes = {};
      cells.forEach((cell, index) => {
        const input = cell.querySelector('input');
        if (input !== null) {
          boxes[columns[index]] = { name: input.name, label: input.ariaLabel, value: input.value };
        }
      });
      return {
        heading,
        jersey: /\d+/.exec(heading)?.[0] ?? '',
        points: cells[1]?.textContent ?? '',
        boxes,
      };
    });
  });
}

/** The box of home's number `jersey` under the column whose full name is `column`. */
async function boxOf(page, jersey, column) {
  const rows = await homeRows(page);
  const row = rows.find((r) => r.jersey === String(jersey));
  const box = row?.boxes[column];
  if (box === undefined) {
    throw new Error(
      `no ${column} box for #${jersey}: ${JSON.stringify(rows.map((r) => r.heading))}`,
    );
  }
  return { ...box, heading: row.heading, input: page.locator(`input[name="${box.name}"]`) };
}

/** The public game page's box scores: each team's played lines with points or fouls, by jersey. */
async function publicLines() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(pageLimit);
    await open(page, `/${league}/games/${liveGame}`);
    return await page.locator('table.ui-box-score').evaluateAll((tables) =>
      tables.map((table) => {
        const heads = [...table.querySelectorAll('thead tr > *')].map(
          (cell) => cell.getAttribute('title') ?? cell.textContent ?? '',
        );
        const at = (name) => heads.indexOf(name);
        return (
          [...table.querySelectorAll('tbody tr')]
            .map((row) => ({
              jersey: row.children[0]?.textContent?.trim() ?? '',
              points: row.children[at('Points')]?.textContent?.trim() ?? '?',
              fouls: row.children[at('Fouls')]?.textContent?.trim() ?? '?',
            }))
            // A player who did not play has one cell saying so, and no line in the grid.
            .filter((line) => /^\d+$/.test(line.points))
            .filter((line) => line.points !== '0' || line.fouls !== '0')
        );
      }),
    );
  } finally {
    await context.close();
  }
}

/** Sorted, so two lists of lines compare whole. */
const linesText = (lines) =>
  JSON.stringify([...lines].sort((a, b) => Number(a.jersey) - Number(b.jersey)));

try {
  await waitFor(`${origin}/`, server);
  await addPlayers(origin);
  browser = await launch();
  /** The players' ids on the scoring screen, by home jersey. */
  const ids = {};

  await step('a scorekeeper tracks a few plays and ends the game', async () => {
    const { context, page } = await signedIn(scorekeeper);
    try {
      await open(page, trackerPath());
      const c = court(page);
      await c.open();
      await c.pick('home', starters);
      await c.pick('away', starters);
      for (const jersey of starters)
        ids[jersey] = await c.tile('home', jersey).getAttribute('data-player');
      await c.play('home', 5, 'p2');
      // The foul was number 9's; it is tapped on number 7.
      await c.play('home', 7, 'foul');
      await c.play('home', 9, 'p3');
      await c.play('home', 3, 'p1');
      await c.saved();
      await c.endGame();
      await c.pad.locator('[data-final="saved"]').waitFor({ timeout: endLimit });
    } finally {
      await context.close();
    }
  });

  const admin = await signedIn(owner);
  const { page } = admin;
  const playsBefore = await serverPlays();

  await step('before it is reopened, its pages say what to do first', async () => {
    await open(page, gamePage);
    note(
      'the game’s page says the game is final and to reopen it first',
      (await page.locator('[data-grid-closed="game-final"]').textContent()) === words.finalFirst,
    );
    note(
      'the game’s page offers the reopen form',
      (await page.locator('[data-reopen-form]').count()) === 1,
    );
    note(
      'the game’s page offers no grid yet',
      (await page.getByRole('link', { name: words.edit }).count()) === 0,
    );
    note(
      'the game’s page names both ways to correct it',
      (await page.getByText(words.bothWays, { exact: true }).count()) === 1,
    );
    await open(page, gridPage);
    note(
      'the grid’s own address says the same and draws no grid',
      (await page.locator('[data-grid-closed="game-final"]').textContent()) === words.finalFirst &&
        (await gridOf(page).count()) === 0,
    );
  });

  await step('the owner reopens it with a reason and lands on the game’s page', async () => {
    await open(page, gamePage);
    await page.getByLabel(words.reason).fill('A foul went to the wrong player');
    await Promise.all([
      page.waitForURL((url) => url.pathname === gamePage, { timeout: pageLimit }),
      page.getByRole('button', { name: words.reopen }).click(),
    ]);
    const said = page.getByText(words.reopened, { exact: true });
    await said.waitFor({ timeout: pageLimit });
    note('the game’s page says it is live again and how to correct it', (await said.count()) === 1);
    const edit = page.getByRole('link', { name: words.edit });
    note('the game’s page offers “Edit the box score”', (await edit.count()) === 1);
    await Promise.all([
      page.waitForURL((url) => url.pathname === gridPage, { timeout: pageLimit }),
      edit.click(),
    ]);
    await gridOf(page).waitFor({ timeout: pageLimit });
  });

  // A scorekeeper's device opens the reopened game and holds it through the correction.
  const device = await signedIn(scorekeeper);
  const c = court(device.page);
  await step('a scorekeeper’s device opens the reopened game', async () => {
    await open(device.page, trackerPath());
    await c.open();
  });

  let seven = '';
  let nine = '';
  await step('the foul is moved to the right player in the grid and saved', async () => {
    const from = await boxOf(page, 7, 'Fouls');
    const to = await boxOf(page, 9, 'Fouls');
    seven = from.heading;
    nine = to.heading;
    note(
      'the grid shows the foul on number 7',
      from.value === '1' && to.value === '0',
      JSON.stringify([from, to]),
    );
    await from.input.fill('0');
    await to.input.fill('1');
    await page.getByRole('button', { name: words.save }).click();
    const saved = page.locator('[data-grid-saved]');
    await saved.waitFor({ timeout: pageLimit });
    note('the page says it saved', ((await saved.textContent()) ?? '').startsWith(words.saved));
    const sentences = await saved.locator('li').allTextContents();
    note(
      'the page says the two plays in plain sentences, the take-back first',
      JSON.stringify(sentences) ===
        JSON.stringify([`Took a foul away from ${seven}.`, `Added a foul for ${nine}.`]),
      JSON.stringify(sentences),
    );
    const after = [await boxOf(page, 7, 'Fouls'), await boxOf(page, 9, 'Fouls')].map(
      (b) => b.value,
    );
    note(
      'the grid now shows the foul on number 9',
      JSON.stringify(after) === '["0","1"]',
      JSON.stringify(after),
    );
  });

  await step('the game’s list of plays ends with unfoul, then foul', async () => {
    const plays = await serverPlays();
    const added = plays.slice(playsBefore.length);
    note(
      'two plays were added: unfoul for number 7, then foul for number 9',
      added.length === 2 &&
        added[0].type === 'unfoul' &&
        added[0].playerId === ids[7] &&
        added[1].type === 'foul' &&
        added[1].playerId === ids[9],
      JSON.stringify({ added, ids }),
    );
  });

  await step('the device’s next tap keeps the correction and loses nothing', async () => {
    const before = (await serverPlays()).length;
    await c.play('home', 11, 'p2');
    await c.saved();
    const plays = await serverPlays();
    note(
      'the device’s tap is saved',
      plays.length === before + 1 &&
        plays.at(-1)?.type === 'score' &&
        plays.at(-1)?.playerId === ids[11],
      JSON.stringify(plays.slice(before)),
    );
    const fouls = (id) =>
      plays.filter((p) => p.playerId === id && p.type === 'foul').length -
      plays.filter((p) => p.playerId === id && p.type === 'unfoul').length;
    note(
      'the correction stands on the server: no foul on 7, one on 9',
      fouls(ids[7]) === 0 && fouls(ids[9]) === 1,
      JSON.stringify(plays),
    );
    // The device shows the server's numbers once it has heard of the correction.
    const shown = async () => [await c.fouls('home', 7), await c.fouls('home', 9)];
    const limit = Date.now() + tapLimit;
    let seen = await shown();
    while (JSON.stringify(seen) !== '[0,1]' && Date.now() < limit) {
      await device.page.waitForTimeout(250);
      seen = await shown();
    }
    note(
      'the device shows the corrected fouls',
      JSON.stringify(seen) === '[0,1]',
      JSON.stringify(seen),
    );
    note('the device shows its own basket', (await c.points('home', 11)) === 2);
  });
  await device.context.close();

  await step('a lowered basket is refused beside its box, everything typed kept', async () => {
    await open(page, gridPage);
    const before = (await serverPlays()).length;
    const three = await boxOf(page, 9, '3-pointers made');
    const foul = await boxOf(page, 11, 'Fouls');
    note('number 9 has one 3-point basket', three.value === '1', three.value);
    await three.input.fill('0');
    await foul.input.fill('2');
    await page.getByRole('button', { name: words.save }).click();
    const beside = page.locator(
      `td:has(input[name="${three.name}"]) [data-grid-problem="basket-taken-back"]`,
    );
    await beside.waitFor({ timeout: pageLimit });
    note(
      'the sentence is beside the lowered box',
      (await beside.textContent()) === words.lowered(three.label),
      (await beside.textContent()) ?? '',
    );
    note('the lowered box is marked', (await three.input.getAttribute('aria-invalid')) === 'true');
    note(
      'every box still holds what was typed',
      (await three.input.inputValue()) === '0' && (await foul.input.inputValue()) === '2',
    );
    note('nothing was saved', (await serverPlays()).length === before);
  });

  await step('a grid left open while the game changed is refused, everything kept', async () => {
    await open(page, gridPage);
    const mine = await boxOf(page, 11, 'Fouls');
    await mine.input.fill('1');
    // A second tab of the same admin changes the game meanwhile.
    const other = await admin.context.newPage();
    other.setDefaultTimeout(pageLimit);
    await open(other, gridPage);
    const theirs = await boxOf(other, 3, 'Fouls');
    await theirs.input.fill('1');
    await other.getByRole('button', { name: words.save }).click();
    await other.locator('[data-grid-saved]').waitFor({ timeout: pageLimit });
    await other.close();
    const before = (await serverPlays()).length;
    await page.getByRole('button', { name: words.save }).click();
    const top = gridOf(page).locator('[data-grid-problem="changed-since-read"]');
    await top.waitFor({ timeout: pageLimit });
    note(
      'the page says why in plain words',
      ((await top.textContent()) ?? '').startsWith(words.stale),
      (await top.textContent()) ?? '',
    );
    note(
      'it offers “Load it again”',
      (await top.getByRole('link', { name: words.reload }).count()) === 1,
    );
    note('the box still holds what was typed', (await mine.input.inputValue()) === '1');
    note('nothing of this grid was saved', (await serverPlays()).length === before);
    await Promise.all([
      page.waitForURL((url) => url.pathname === gridPage, { timeout: pageLimit }),
      top.getByRole('link', { name: words.reload }).click(),
    ]);
    await gridOf(page).waitFor({ timeout: pageLimit });
    const fresh = [await boxOf(page, 3, 'Fouls'), await boxOf(page, 11, 'Fouls')].map(
      (b) => b.value,
    );
    note(
      'loaded again, it shows the other tab’s change alone',
      JSON.stringify(fresh) === '["1","0"]',
      JSON.stringify(fresh),
    );
  });
  await step('the public game page shows the same lines as the grid', async () => {
    // The public box score is a final game's: the game is ended again on a device.
    await open(page, gridPage);
    const grid = (await homeRows(page))
      .map((row) => ({
        jersey: row.jersey,
        points: row.points,
        fouls: row.boxes['Fouls']?.value ?? '?',
      }))
      .filter((line) => line.points !== '0' || line.fouls !== '0');
    const ender = await signedIn(scorekeeper);
    try {
      await open(ender.page, trackerPath());
      const e = court(ender.page);
      await e.open();
      await e.endGame();
      await e.pad.locator('[data-final="saved"]').waitFor({ timeout: endLimit });
    } finally {
      await ender.context.close();
    }
    const tables = await publicLines();
    note(
      'one public box score has exactly the grid’s home lines',
      tables.filter((lines) => linesText(lines) === linesText(grid)).length === 1,
      JSON.stringify({ grid, tables }),
    );
  });

  await admin.context.close();
} finally {
  await browser?.close();
  server.child.kill();
}

if (failures.length > 0) {
  console.error(`Tracked grid browser test: ${failures.length} problem(s)`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`Tracked grid browser test passed: ${checks} checks.`);
