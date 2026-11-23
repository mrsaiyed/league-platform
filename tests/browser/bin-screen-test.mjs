// Step 2.77 (A-5, H12): a team, a person and a published game removed by mistake are each
// brought back without typing an address. In a real browser at phone width (390), by taps,
// on the web app's made-up stand-in (APP_ENV=test): made-up leagues, teams and people,
// nothing leaves this computer. Builds the app first unless given --no-build.
//
// The made-up owner starts at the admin's home (typed, as the other browser tests do); from
// there only taps, scripts off:
// - adds a team with one player, moves the team to the bin, then takes the player off the
//   league list; the notice after each says "Moved to the bin" and leads to the bin;
// - the bin names the team's games and its player who is in the bin too; the team's own
//   admin address says "This team is in the bin" with "Bring it back"; the player and the
//   team are brought back, and the team's roster holds the player again;
// - removes a published game in Schedule's draft and publishes; Schedule's "Removed games"
//   leads to it in the bin, which brings it back.
// With scripts on: a team removed and brought back from the notice's way to the bin. A
// scheduler sees the bin's games and not its teams or people (T-308); a coach, who may
// bring back nothing, is refused it. Each bin page passes the accessibility checks and nothing
// scrolls sideways at 390.
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

const phone = { width: 390, height: 844 };
const run = Date.now().toString(36).slice(-4);
const kites = { team: `Kites ${run}`, first: 'Ava', last: `Kite${run}` };
const wrens = `Wrens ${run}`;

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
      { address: '/north-valley/admin/settings/bin', cookie: 'srl_session=local-owner-token' },
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
    const toTeams = async (p) => {
      await openStaffMenu(p);
      await tap(
        p,
        p.locator('nav').getByRole('link', { name: 'Teams', exact: true }).first(),
        /\/admin\/teams$/,
      );
    };
    const addTeam = async (p, name) => {
      await p.locator('input[name=name]').fill(name);
      await tap(p, p.getByRole('button', { name: 'Add team' }), /done=created/);
    };
    const removeTeamHere = async (p) => {
      const panel = p.locator('section', {
        has: p.getByRole('heading', { name: 'Remove this team' }),
      });
      await panel.locator('input[name=confirm]').check();
      await tap(p, panel.getByRole('button', { name: 'Move the team to the bin' }), /done=removed/);
    };
    const binRow = (p, text) => p.locator('li[data-bin]', { hasText: text });

    at = 'a team with one player is made, then moved to the bin';
    await page.goto(`${origin}/north-valley/admin`);
    await toTeams(page);
    await addTeam(page, kites.team);
    const teamAddress = page.url().replace(/\?.*$/, '');
    const form = page.locator('form', { has: page.locator('input[name=firstName]') });
    await form.locator('input[name=firstName]').fill(kites.first);
    await form.locator('input[name=lastName]').fill(kites.last);
    await tap(
      page,
      form.getByRole('button', { name: 'Add the person and put them on the roster' }),
      /done=added/,
    );
    await removeTeamHere(page);
    const said = page.locator('main [role=status]').first();
    note(
      'the notice after removing a team says it moved to the bin',
      (await said.innerText()).startsWith('Moved to the bin'),
    );
    note(
      'Teams leads to "Removed teams and people"',
      (await page.getByRole('link', { name: 'Removed teams and people' }).count()) === 1,
    );

    at = 'the player is taken off the league list';
    await tap(page, page.locator('main .staff-row-link').first(), /\/admin\/teams\//);
    const item = page
      .locator('section', { has: page.getByRole('heading', { name: 'The league list' }) })
      .locator('li', { hasText: kites.last });
    await item.locator('input[name=confirm]').check();
    await tap(
      page,
      item.getByRole('button', { name: 'Remove from the league list' }),
      /done=personRemoved/,
    );
    const gone = page.locator('main [role=status]').first();
    note(
      'the notice says the person moved to the bin',
      (await gone.innerText()).startsWith('Moved to the bin'),
    );
    await tap(page, gone.getByRole('link', { name: 'Bring it back' }), /\/admin\/settings\/bin/);

    at = 'the bin tells what comes back';
    const teamRow = binRow(page, kites.team);
    const teamText = (await teamRow.count()) === 1 ? await teamRow.innerText() : '';
    note('the bin lists the team', teamText !== '');
    note(
      'the team line says its games',
      teamText.includes('Games played: 0. Games still to play: 0.'),
      teamText,
    );
    note(
      'the team line names its player who is in the bin too (A-16)',
      teamText.includes(`On its roster and in the bin too: ${kites.first} ${kites.last}.`),
      teamText,
    );
    note('the bin lists the person', (await binRow(page, kites.last).count()) === 2);
    await checks(page, 'the bin with a team and a person');

    at = "the team's own admin address, while it is in the bin";
    const binAddress = page.url();
    await page.goto(teamAddress);
    note(
      'the team address says "This team is in the bin"',
      (await page.locator('main').innerText()).includes('This team is in the bin'),
    );
    await checks(page, 'a team in the bin, at its own address');
    await page.goto(binAddress);

    at = 'the person and the team are brought back';
    const personRow = page.locator('li[data-bin=person]', { hasText: kites.last });
    await tap(page, personRow.getByRole('button', { name: 'Bring it back' }), /back=person/);
    note(
      'the bin says the person is back',
      (await page.locator('main').innerText()).includes('They are on the league list again.'),
    );
    await tap(
      page,
      binRow(page, kites.team).getByRole('button', { name: 'Bring it back' }),
      /back=team/,
    );
    await tap(page, page.getByRole('link', { name: 'Open the team' }), /\/admin\/teams\//);
    note(
      'the team is back with its player on the roster',
      (await page.locator('main ol > li', { hasText: kites.last }).count()) === 1,
    );

    at = 'a published game is removed and published';
    await openStaffMenu(page);
    await tap(
      page,
      page.locator('nav').getByRole('link', { name: 'Schedule', exact: true }).first(),
      /\/admin\/schedule/,
    );
    const game = page
      .locator('li[data-game]', { has: page.locator('summary', { hasText: 'Edit this game' }) })
      .first();
    const gameId = await game.getAttribute('data-game');
    await game.locator('summary', { hasText: 'Edit this game' }).click();
    await Promise.all([
      page.waitForEvent('load'),
      game.getByRole('button', { name: 'Remove game' }).click(),
    ]);
    await tap(page, page.getByRole('button', { name: 'Publish this schedule' }), /done=published/);
    await tap(page, page.getByRole('link', { name: 'Removed games' }), /\/admin\/settings\/bin/);
    const gameRow = page.locator(`li[id="bin-${gameId}"]`);
    note('the bin lists the removed game', (await gameRow.count()) === 1);
    await checks(page, 'the bin with a game');
    await tap(page, gameRow.getByRole('button', { name: 'Bring it back' }), /back=game/);
    note(
      'the bin says the game is back',
      (await page.locator('main').innerText()).includes('The game is on the schedule again.'),
    );
    note('the game left the bin', (await page.locator(`li[id="bin-${gameId}"]`).count()) === 0);
    // A-19: bringing a published game back is a schedule change, with its revision and
    // the teams and people it reaches (A-7).
    const gameBack = page.locator('[data-bin-game-back]');
    const gameBackText = (await gameBack.count()) === 1 ? await gameBack.innerText() : '';
    note(
      'the bin says the game back is a schedule revision reaching its teams (A-19)',
      /revision \d+, reaching 2 teams and \d+ people/.test(gameBackText),
      gameBackText,
    );
    // The notice says only what the restore left on the server: a crafted address shows none.
    await page.goto(`${binAddress}?back=game&id=${gameId}&revision=99&teams=9&people=999`);
    note(
      'a crafted address cannot make the bin say a revision (A-19)',
      (await page.locator('[data-bin-game-back]').count()) === 0,
    );

    at = 'a second team of the same name while the first is in the bin';
    const larks = `Larks ${run}`;
    await toTeams(page);
    await addTeam(page, larks);
    await removeTeamHere(page);
    await toTeams(page);
    await addTeam(page, larks);
    await page.goto(binAddress);
    await tap(page, binRow(page, larks).getByRole('button', { name: 'Bring it back' }), /not=/);
    const refusedText = await binRow(page, larks).innerText();
    note(
      'bringing the first back is refused with one sentence naming the other (A-19)',
      refusedText.includes(`Another team of the same season, ${larks} (short name`) &&
        refusedText.includes('Rename one of them first'),
      refusedText,
    );

    at = 'with scripts on, a team removed and brought back';
    const live = await open(true);
    await live.goto(`${origin}/north-valley/admin`);
    await toTeams(live);
    await addTeam(live, wrens);
    await removeTeamHere(live);
    await tap(
      live,
      live.locator('main [role=status]').getByRole('link', { name: 'Bring it back' }),
      /\/admin\/settings\/bin/,
    );
    await tap(
      live,
      binRow(live, wrens).getByRole('button', { name: 'Bring it back' }),
      /back=team/,
    );
    note('scripts on: the team is back', (await binRow(live, wrens).count()) === 0);

    at = "a scheduler sees the bin's games only";
    const scheduler = await open(false, 'local-scheduler-token');
    const part = await scheduler.goto(`${origin}/north-valley/admin/settings/bin`);
    const headings = await scheduler.locator('main h2').allTextContents();
    note(
      "a scheduler sees the bin's games, not its teams or people",
      part?.status() === 200 &&
        headings.includes('Removed games') &&
        !headings.includes('Removed teams') &&
        !headings.includes('Removed people'),
      `${part?.status()} ${headings.join(', ')}`,
    );
    at = 'a coach is refused the bin';
    const coach = await open(false, 'local-coach-token');
    const refused = await coach.goto(`${origin}/north-valley/admin/settings/bin`);
    note('a coach is refused the bin', refused?.status() === 403, `${refused?.status()}`);

    // A registrar may bring back people's league records only (T-308): the people part.
    at = "a registrar sees the bin's people only";
    const registrar = await open(false, 'local-registrar-token');
    const theirs = await registrar.goto(`${origin}/quiet-pines/admin/settings/bin`);
    const parts = await registrar.locator('main h2').allTextContents();
    note(
      "a registrar sees the bin's people, not its teams, games or divisions",
      theirs?.status() === 200 &&
        parts.includes('Removed people') &&
        !parts.includes('Removed teams') &&
        !parts.includes('Removed games') &&
        !parts.includes('Removed divisions'),
      `${theirs?.status()} ${parts.join(', ')}`,
    );
  } catch (error) {
    failures.push(`${at}: ${whatWentWrong(error)}`);
  } finally {
    await browser?.close();
    server?.child.kill();
  }
}

console.log(`bin screen: ${checked.length} checks, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
process.exitCode = failures.length === 0 ? 0 : 1;
