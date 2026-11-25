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
//   and the device then shows the server's numbers (or says in words why it cannot). Its
//   Undo takes that tap back; the next Undo, on the correction's foul, asks first (T-408),
//   (once, for a fast double tap) and "Leave it" keeps the foul on the server.
// - A lowered basket is refused beside its box, with everything typed kept and nothing
//   saved; a grid left open while the game changed in a second tab is refused at the top
//   with "Load it again", everything typed kept, and the second tab's change alone saved.
// - The owner ends it again from the grid ("End the game again", T-407) while a device
//   still holds it: the game's page says it is final, the device is told in plain words at
//   its next tap, and the public page shows Final, Corrected and the grid's lines.
// - The standings count it again; reopened and ended again with no change they are as they
//   were; reopened, given an away basket that changes the winner and ended again from the
//   game's own page, they change. Each time the two teams' own rows are compared (wins,
//   losses, points for and against), never the whole page's text.
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
  undoCorrection: 'This was added by a correction after the game. Take it back?',
  leaveIt: 'Leave it',
  reason: 'Why it needs correcting (kept in the log, never shown publicly)',
  reopen: 'Reopen to correct',
  edit: 'Edit the box score',
  save: 'Save the changes',
  reload: 'Load it again',
  finalFirst: 'This game is final. To edit its box score, reopen it with a reason first.',
  bothWays:
    'This game was scored with the live tracker. Correct it with “Edit the box score”, or on the scoring screen to take points away; either way its list of plays still explains the numbers.',
  reopened:
    'The game is live again. Correct it with “Edit the box score” below, or on the scoring screen, then tap “End the game again”.',
  endAgain: 'End the game again',
  deviceTold: 'This game cannot be scored now: it is over, cancelled or postponed.',
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

/** The two teams' names, `[away, home]`, from the grid page's title "Edit box score: {away} at {home}". */
async function teamsOf(page) {
  const title = (await page.locator('h1').first().textContent()) ?? '';
  const found = /^Edit box score: (.+) at (.+)$/.exec(title.trim());
  if (found === null) throw new Error(`the grid's title is “${title}”`);
  return [found[1], found[2]];
}

/**
 * The two teams' own rows of the public standings, read signed out: by team name, its
 * wins, losses, points for and against as numbers (the columns W, L, PF and PA). A team
 * missing, or wins or losses not shown, throws, so the step fails. Points for and against
 * are null when the season's standings do not show them (the made-up season shows W and L
 * only), and are then compared as such.
 */
async function standingsRows(names) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(pageLimit);
    await open(page, `/${league}/standings`);
    const rows = await page.evaluate((teams) => {
      const found = {};
      for (const table of document.querySelectorAll('main table')) {
        const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
        for (const row of table.querySelectorAll('tbody tr')) {
          const name = row.querySelector('.ui-team-name')?.textContent.trim() ?? '';
          if (!teams.includes(name)) continue;
          const cells = [...row.children].map((cell) => cell.textContent.trim());
          const at = (label) =>
            heads.includes(label) ? Number(cells[heads.indexOf(label)]) : null;
          found[name] = { wins: at('W'), losses: at('L'), for: at('PF'), against: at('PA') };
        }
      }
      return found;
    }, names);
    for (const name of names) {
      const row = rows[name];
      const shown = (n) => n === null || Number.isFinite(n);
      const full = row !== undefined && Number.isFinite(row.wins) && Number.isFinite(row.losses);
      if (!full || !shown(row.for) || !shown(row.against)) {
        throw new Error(`the standings have no full row for ${name}: ${JSON.stringify(rows)}`);
      }
    }
    return rows;
  } finally {
    await context.close();
  }
}

/** How each of the two rows moved from `from` to `to`: wins, losses, points for and against. */
const moved = (names, from, to) =>
  names.map((name) => {
    const [a, b] = [from[name], to[name]];
    const by = (key) => (a[key] === null || b[key] === null ? null : b[key] - a[key]);
    return [by('wins'), by('losses'), by('for'), by('against')];
  });

/** The public game page's main text, read signed out. */
async function publicText() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(pageLimit);
    await open(page, `/${league}/games/${liveGame}`);
    return (await page.locator('main').textContent()) ?? '';
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
  let teams = [];
  await step('the foul is moved to the right player in the grid and saved', async () => {
    teams = await teamsOf(page);
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

  // T-408: the scorekeeper's Undo takes its own tap back, then asks before the admin's foul.
  await step(
    'Undo takes the device’s tap back, then asks before the correction’s foul',
    async () => {
      const before = await serverPlays();
      await c.undo();
      await c.saved();
      const undone = await serverPlays();
      const isTheFoul = (play) => play?.type === 'foul' && play?.playerId === ids[9];
      note(
        'the first Undo took the device’s basket back, leaving the correction’s foul last',
        undone.length === before.length - 1 && isTheFoul(undone.at(-1)),
        JSON.stringify(undone.slice(-2)),
      );
      // A fast double tap: the first asks, the second lands on the question as it comes
      // up and is not an answer, so the question is asked once and stays.
      await device.page.locator('[data-undo]:not([data-resting])').click({ clickCount: 2 });
      const ask = device.page.locator('[data-undo-correction]');
      await ask.waitFor({ timeout: tapLimit });
      note(
        'the next Undo asks first, in plain words',
        (await ask.textContent())?.includes(words.undoCorrection),
      );
      note('Undo tapped twice fast asks once, and the question stays', (await ask.count()) === 1);
      await ask.locator('.court-sheet-head:not([data-resting])').waitFor({ timeout: tapLimit });
      await ask.getByRole('button', { name: words.leaveIt, exact: true }).click();
      await ask.waitFor({ state: 'detached', timeout: tapLimit });
      await c.saved();
      const kept = await serverPlays();
      note(
        '“Leave it” keeps the admin’s foul on the server',
        JSON.stringify(kept) === JSON.stringify(undone) && isTheFoul(kept.at(-1)),
        JSON.stringify(kept.slice(-2)),
      );
      note('the device still shows the foul on number 9', (await c.fouls('home', 9)) === 1);
    },
  );
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
  /** Taps "End the game again" in `where` and waits for the game's page to say it is final. */
  const endAgainIn = async (where) => {
    await Promise.all([
      page.waitForURL((url) => url.pathname === gamePage, { timeout: endLimit }),
      page.locator(where).getByRole('button', { name: words.endAgain }).click(),
    ]);
    await page.locator('[data-grid-closed="game-final"]').waitFor({ timeout: pageLimit });
  };
  /** Reopened with a reason from the game's page, which then offers the grid again. */
  const reopenAgain = async (why) => {
    await open(page, gamePage);
    await page.getByLabel(words.reason).fill(why);
    await Promise.all([
      page.waitForURL((url) => url.pathname === gamePage, { timeout: pageLimit }),
      page.getByRole('button', { name: words.reopen }).click(),
    ]);
    await page.getByText(words.reopened, { exact: true }).waitFor({ timeout: pageLimit });
  };

  let counted = {};
  await step('the owner ends it again from the grid while a device holds it', async () => {
    const whileLive = await standingsRows(teams);
    const holder = await signedIn(scorekeeper);
    try {
      await open(holder.page, trackerPath());
      const h = court(holder.page);
      await h.open();
      await open(page, gridPage);
      const grid = (await homeRows(page))
        .map((row) => ({
          jersey: row.jersey,
          points: row.points,
          fouls: row.boxes['Fouls']?.value ?? '?',
        }))
        .filter((line) => line.points !== '0' || line.fouls !== '0');
      const before = await serverPlays();
      await endAgainIn('[data-end-again]');
      note(
        'the game’s page no longer offers to end it',
        (await page.getByRole('button', { name: words.endAgain }).count()) === 0,
      );
      const after = await serverPlays();
      // The end is no play of the list (`/state` lists plays); every play is still there.
      note(
        'the server kept every play, and added none',
        JSON.stringify(after) === JSON.stringify(before),
        JSON.stringify(after.slice(before.length)),
      );
      // The device that held the game is told in plain words at its next tap. The words are
      // shown only until the device has loaded the game as the server has it; then its final
      // panel takes their place (`showsFinalPanel`), so they are watched for as they are drawn
      // (T-409), not looked for twice, and the panel is waited for after them.
      await holder.page.evaluate((text) => {
        globalThis.toldSeen = false;
        const look = () => {
          const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let node = walk.nextNode(); node !== null; node = walk.nextNode()) {
            if (node.data.trim() === text) globalThis.toldSeen = true;
          }
        };
        new MutationObserver(look).observe(document.body, {
          subtree: true,
          childList: true,
          characterData: true,
        });
        look();
      }, words.deviceTold);
      await h.play('home', 3, 'foul');
      const told = await holder.page.waitForFunction(() => globalThis.toldSeen === true, null, {
        timeout: tapLimit,
      });
      note('the device is told the game cannot be scored now', (await told.jsonValue()) === true);
      await h.root.locator('[data-final]').waitFor({ timeout: tapLimit });
      note(
        'the device then shows the game final',
        (await h.root.locator('[data-final]').count()) === 1,
      );
      note('the device’s tap changed nothing', (await serverPlays()).length === after.length);
      const tables = await publicLines();
      note(
        'one public box score has exactly the grid’s home lines',
        tables.filter((lines) => linesText(lines) === linesText(grid)).length === 1,
        JSON.stringify({ grid, tables }),
      );
      const shown = await publicText();
      note(
        // The device's basket was taken back by its own Undo (T-408), so the result is the one
        // the game first ended with: no "Corrected" (S-81, a correction that changed it).
        'the public page says Final, and not Corrected while the result is unchanged',
        shown.includes('Final') && !shown.includes('Corrected on'),
        shown.slice(0, 300),
      );
      counted = await standingsRows(teams);
      // [away, home]: the game counts again, home the winner.
      const [away, home] = moved(teams, whileLive, counted);
      note(
        'the standings count the game again in the two teams’ own rows',
        away[0] === 0 &&
          away[1] === 1 &&
          home[0] === 1 &&
          home[1] === 0 &&
          (home[2] === null || (home[2] > 0 && away[3] === home[2])),
        JSON.stringify({ teams, whileLive, counted }),
      );
    } finally {
      await holder.context.close();
    }
  });

  await step('ended again with no change, the standings are as they were', async () => {
    await reopenAgain('Checked the score again');
    await endAgainIn('[data-end-again]');
    const again = await standingsRows(teams);
    note(
      'the two teams’ rows are unchanged',
      JSON.stringify(again) === JSON.stringify(counted),
      JSON.stringify({ counted, again }),
    );
  });

  await step('a basket that changes the winner changes the standings', async () => {
    await reopenAgain('An away 3-pointer was missed');
    await open(page, gridPage);
    const home = await homeName(page);
    // The away team's first row, its 3-pointers box: three of them make away the winner.
    const name = await gridOf(page)
      .locator('section', { hasNot: page.getByRole('heading', { name: home, exact: true }) })
      .locator('tbody tr')
      .first()
      .evaluate((row, column) => {
        const columns = [...row.closest('table').querySelectorAll('thead abbr')].map(
          (a) => a.title,
        );
        const cell = [...row.querySelectorAll('td')].find((_, index) => columns[index] === column);
        return cell?.querySelector('input')?.name ?? '';
      }, '3-pointers made');
    await page.locator(`input[name="${name}"]`).fill('3');
    await page.getByRole('button', { name: words.save }).click();
    await page.locator('[data-grid-saved]').waitFor({ timeout: pageLimit });
    await endAgainIn('[data-end-again]');
    const after = await standingsRows(teams);
    // Away won instead: a win and nine points more for away, a loss more for home.
    const [awayMoved, homeMoved] = moved(teams, counted, after);
    note(
      'the two teams’ rows follow the new winner',
      JSON.stringify(awayMoved) ===
        JSON.stringify([1, -1, ...(after[teams[0]].for === null ? [null, null] : [9, 0])]) &&
        JSON.stringify(homeMoved) ===
          JSON.stringify([-1, 1, ...(after[teams[1]].for === null ? [null, null] : [0, 9])]),
      JSON.stringify({ teams, counted, after }),
    );
    const shown = await publicText();
    note(
      // The winner changed, so this correction changed the result: it is marked (S-81).
      'the public page says Final and Corrected on, as the result changed',
      shown.includes('Final') && shown.includes('Corrected on'),
      shown.slice(0, 300),
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
