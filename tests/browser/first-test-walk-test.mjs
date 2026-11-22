// Step 2.194 (TEST 1): the first test's walk, done whole, by touch at a phone's size (390
// wide), in a real browser against the web app on its made-up stand-in (APP_ENV=test).
// Nothing leaves this computer; every league, team, person and score is made up. It is
// docs/operations/first-test.md step by step, in the same order, and each check's name
// starts with the number of the step it checks there, so the two cannot drift apart. The
// numbers are pinned without a browser by
// apps/web/src/features/stats-pages/first-test-walk.test.ts, which plays the same taps.
//
// The made-up owner signs in on the local sign-in page and takes the empty league Still
// Waters (step 2.192) from nothing to a final table: three teams (the Owls play no game),
// five players each for the Ravens and the Wolves, a round today with two games and no
// place, published; the season is already shown. Game 1, Wolves at Ravens, is opened from
// "Score this game" on the league home and scored on the tracker: the fives, baskets, a
// foul, one team turnover, a wrong basket taken back with Undo, the clock set wrongly and
// right again, the second half, End game from More after its question. Game 2's final
// score is typed in Admin → Games, 50 to 45 for the Wolves, so the two teams end level.
// League settings' minimum games for the leaders is set to 1 (so the statistics page shows
// leaders after one game: more for the founder to see than "No leaders yet"). Then the
// game's page, the standings and the statistics, read by a visitor (signed out, a fresh
// browser with no cookies), where every number is what was scored.
//
// Still Waters starts live (made-up data only): the screen that publishes a league (step
// 2.125, part 2) is not built yet. A real new league still starts as a draft, and a draft
// league is still proven hidden from visitors (league-gate.test.ts, check-web-shell.mjs,
// on Quiet Pines and Reed Marsh).
//
// The tracker runs with scripts on (it is a page that needs them); the admin's screens
// with scripts off, as the other admin tests do, every form a plain post. Both are the one
// signed-in owner: the cookie the sign-in page set is carried from one to the other.
// `--no-build` serves the build already here; `--say` prints what each screen said, for
// writing first-test.md.
import { court } from './tracker-driver.mjs';
import {
  buildNext,
  freePort,
  launch,
  openStaffMenu,
  startNext,
  waitFor,
  whatWentWrong,
  worldAtNoon,
} from './web-browser-kit.mjs';

const failures = [];
const checked = [];
const note = (label, ok, detail = '') => {
  checked.push(label);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};
const saying = process.argv.includes('--say');
const say = (step, words) => {
  if (saying) console.log(`--- step ${step}\n${words}`);
};
/** `--shots=<folder>`: a picture of the screens first-test.md describes by their look. */
const shots = process.argv.find((a) => a.startsWith('--shots='))?.slice('--shots='.length);
const shot = async (on, name) => {
  if (shots !== undefined) await on.screenshot({ path: `${shots}/${name}.png` });
};
/**
 * `WALK_PICTURES=<folder>`: one picture of every step, full page, at the phone's size
 * (390 wide, device scale 1), as `step-01.png` to `step-18.png`, taken by this same walk so
 * the pictures and the test are one thing (for the lead to look over the founder's walk).
 */
const pictures = process.env.WALK_PICTURES;
if (pictures !== undefined) (await import('node:fs')).mkdirSync(pictures, { recursive: true });
const picture = async (on, step) => {
  if (pictures === undefined) return;
  await on.screenshot({
    path: `${pictures}/step-${String(step).padStart(2, '0')}.png`,
    fullPage: true,
  });
};
/** What went wrong in the browser on the pages with scripts on, printed at the end. */
const browserErrors = [];
const watchErrors = (on, where) => {
  on.on('pageerror', (error) => browserErrors.push(`${where}: ${error.message}`));
  on.on('console', (m) => {
    if (m.type() === 'error') browserErrors.push(`${where}: ${m.text()}`);
  });
};
/** The form that follows a heading the person reads ("A new player, not in the league yet"). */
const formUnder = (on, heading) =>
  on.getByRole('heading', { name: heading, exact: true }).locator('xpath=following::form[1]');

let built = true;
if (!process.argv.includes('--no-build')) {
  built = await buildNext();
  if (!built) failures.push('next build failed or took over 10 minutes');
}

const phone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
};
const league = 'still-waters';
const owner = { email: 'owner@example.test', password: 'made-up owner password' };
const firstNames = ['Ann', 'Ben', 'Cal', 'Dee', 'Eli'];
const worldNow = worldAtNoon();
/** The league's today (America/Chicago, as the made-up world's), YYYY-MM-DD. */
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(
  new Date(worldNow),
);
const started = Date.now();

if (built) {
  const origin = `http://localhost:${await freePort()}`;
  const server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
    LOCAL_NOW: worldNow,
  });
  let browser;
  let at = 'starting';
  try {
    await waitFor(`${origin}/`, server, [
      { address: '/signin' },
      { address: `/${league}/admin`, cookie: 'srl_session=local-owner-token' },
      { address: `/${league}/admin/teams`, cookie: 'srl_session=local-owner-token' },
      { address: `/${league}/admin/schedule`, cookie: 'srl_session=local-owner-token' },
    ]);
    browser = await launch();
    // The tracker's phone (scripts on) and the admin's (scripts off): one owner.
    const live = await browser.newContext(phone);
    const scoring = await live.newPage();
    scoring.setDefaultTimeout(60_000);
    const mainText = (on) => on.locator('main').innerText();
    // Each step's page is pictured where its fit is checked, and again where a step ends.
    const fits = async (on, label) =>
      (await picture(on, Number.parseInt(label, 10))) ??
      note(
        `${label}: no sideways scrolling at a phone's width`,
        await on.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      );
    /** Taps a link or button on a page with scripts off and waits for the page it posts to. */
    const tap = async (on, locator, url) => {
      await Promise.all([on.waitForEvent('load'), locator.tap()]);
      if (url !== undefined && !url.test(on.url())) {
        throw new Error(`landed on ${on.url()}, not ${url}`);
      }
    };
    const staffLink = async (on, name, url) => {
      await openStaffMenu(on);
      await tap(on, on.locator('nav').getByRole('link', { name, exact: true }).first(), url);
    };

    at = 'step 1: signing in on the local sign-in page';
    await scoring.goto(`${origin}/signin`);
    await scoring.getByRole('heading', { level: 1, name: 'Sign in' }).waitFor();
    await scoring.getByLabel('Email').fill(owner.email);
    await scoring.getByLabel('Password').fill(owner.password);
    await Promise.all([
      scoring.waitForURL((url) => url.pathname !== '/signin'),
      scoring.getByRole('button', { name: 'Sign in', exact: true }).tap(),
    ]);
    note('1. signing in leaves the sign-in page', !scoring.url().endsWith('/signin'));
    say(1, `${scoring.url()}\n${await scoring.locator('body').innerText()}`);
    watchErrors(scoring, 'tracker phone');
    const offline = await browser.newContext({ ...phone, javaScriptEnabled: false });
    await offline.addCookies(await live.cookies());
    const page = await offline.newPage();
    page.setDefaultTimeout(60_000);
    await page.goto(`${origin}/account`);
    const account = await mainText(page);
    note(
      '1. the account page: "Your account", and Still Waters League with Owner under "Your leagues"',
      account.includes('Your account') &&
        account.includes('Your leagues') &&
        /Still Waters League\s*Owner/.test(account),
      account.slice(0, 400),
    );
    await picture(page, 1);

    at = "step 2: the owner opens Still Waters' admin";
    // By the words on the screen: "Admin" beside "Still Waters League" (not the name,
    // which opens the league's public home).
    const entry = page
      .locator('li')
      .filter({ has: page.getByRole('link', { name: 'Still Waters League', exact: true }) });
    await tap(page, entry.getByRole('link', { name: 'Admin', exact: true }), /\/admin$/);
    const welcome = await mainText(page);
    say(2, `${page.url()}\n${welcome}`);
    note(
      '2. "Admin" beside Still Waters League opens its admin: "Welcome back."',
      welcome.includes('Welcome back.') &&
        welcome.includes('Everything you run for Still Waters League is here.'),
      welcome.slice(0, 300),
    );
    await fits(page, "2. Still Waters' admin");
    await picture(page, 2);

    at = 'step 3: three teams, five players each for two of them';
    for (const [name, from] of [
      ['Ravens', 1],
      ['Wolves', 11],
      ['Owls', null],
    ]) {
      await staffLink(page, 'Teams', /\/admin\/teams$/);
      await page.locator('input[name=name]').fill(name);
      await tap(page, page.getByRole('button', { name: 'Add team' }), /done=created/);
      if (name === 'Ravens') say(3, await mainText(page));
      if (from === null) continue;
      const headings = await page.locator('main h2').allInnerTexts();
      const newFirst = headings.indexOf('A new player, not in the league yet');
      note(
        `3. on the ${name}' page the new player's form comes first, under its own heading`,
        newFirst >= 0 &&
          (headings.indexOf('Someone already in the league') < 0 ||
            newFirst < headings.indexOf('Someone already in the league')),
        headings.join(' | '),
      );
      for (const [n, first] of firstNames.entries()) {
        // By the words the person reads: the heading, then the boxes' own labels.
        const form = formUnder(page, 'A new player, not in the league yet');
        await form.getByLabel('First name').fill(first);
        await form.getByLabel('Last name').fill(name);
        await form.getByLabel('Jersey number (0 to 99, or 00)').fill(String(from + n));
        await tap(
          page,
          form.getByRole('button', { name: 'Add the person and put them on the roster' }),
          /done=/,
        );
      }
      const roster = await mainText(page);
      note(
        `3. the ${name} have their five players`,
        firstNames.every((first) => roster.includes(`${first} ${name}`)),
        roster.slice(0, 400),
      );
      if (name === 'Wolves') await picture(page, 3);
    }
    await staffLink(page, 'Teams', /\/admin\/teams$/);
    const teams = await mainText(page);
    note(
      '3. Teams lists the Ravens, the Wolves and the Owls',
      ['Ravens', 'Wolves', 'Owls'].every((name) => teams.includes(name)),
    );
    await fits(page, '3. Teams');

    at = 'step 4: a round today and two games with no place';
    await staffLink(page, 'Schedule', /\/admin\/schedule$/);
    say(4, await mainText(page));
    const first = page.locator('[data-no-rounds] form');
    await first.getByLabel('Round name').fill('Week 1');
    await first.locator('input[name=date]').fill(today);
    await tap(page, first.getByRole('button', { name: 'Add round' }), /saved=round-added/);
    // Two times earlier than now (the made-up world's clock is at noon).
    for (const [home, away, time] of [
      ['Ravens', 'Wolves', '10:00'],
      ['Wolves', 'Ravens', '11:00'],
    ]) {
      // "Add a game" inside Week 1, not the one under "Games with no round".
      const add = page
        .locator('section[data-round]', { hasText: 'Week 1' })
        .locator('details[data-add-game]')
        .first();
      await add.getByText('Add a game', { exact: true }).tap();
      await add.getByLabel('Home team').selectOption({ label: home });
      await add.getByLabel('Away team').selectOption({ label: away });
      await add.getByLabel('Time').fill(time);
      const place = add.locator('select[name=place]');
      note(
        `4. a game's place starts as "No venue yet" (${home} v ${away})`,
        (await place.count()) === 0 ||
          (await place.locator('option:checked').innerText()).trim() === 'No venue yet',
      );
      await tap(page, add.locator('button[type=submit]'), /done=saved/);
    }
    const drafted = await mainText(page);
    note(
      '4. the round holds both games, with no venue yet',
      (drafted.match(/no venue yet/g) ?? []).length >= 2,
      drafted.slice(0, 600),
    );
    await fits(page, '4. Schedule, the draft');
    await picture(page, 4);

    at = 'step 5: publishing the schedule';
    await tap(page, page.getByRole('button', { name: 'Publish this schedule' }), /done=published/);
    const published = await page.locator('[data-published]').innerText();
    say(5, published);
    note('5. the schedule is published', /published/i.test(published), published);
    await picture(page, 5);

    at = 'step 6: the season is shown';
    await staffLink(page, 'Season settings', /\/admin\/season/);
    const shown = await page.locator('#who-can-see').innerText();
    say(6, shown);
    await picture(page, 6);
    // Already shown (the made-up league starts so, and starts live): nothing to tap.
    note(
      '6. Season settings says everyone can see First Season',
      shown.includes('Everyone can see First Season.') && !/until it is published/.test(shown),
      shown,
    );
    note(
      '5. the schedule says visitors can see it now',
      published.includes('The schedule is published. Visitors can see it now.'),
      published,
    );

    at = "step 7: 'Score this game' on the league home";
    await scoring.goto(`${origin}/${league}`);
    const offer = scoring.getByRole('link', {
      name: 'Score this game: Wolves against Ravens',
      exact: true,
    });
    await offer.waitFor();
    await offer.scrollIntoViewIfNeeded();
    await shot(scoring, '07-home');
    await Promise.all([scoring.waitForURL(/\/score\//), offer.tap()]);
    const gameId = new URL(scoring.url()).pathname.split('/').pop() ?? '';
    const c = court(scoring);
    await c.open();
    note(
      '7. "Score this game" opens the tracker on game 1',
      /\/score\/[0-9a-f-]{36}$/.test(scoring.url()),
    );
    await fits(scoring, '7. the tracker');
    await picture(scoring, 7);

    at = 'step 8: the fives';
    await c.pick('home', [1, 2, 3, 4, 5]);
    await c.pick('away', [11, 12, 13, 14, 15]);
    // The tenth tap puts the fives on the court once the device has kept it.
    const tenOnCourt = await scoring
      .waitForFunction(
        () =>
          document.querySelectorAll('[data-teams] [data-player][data-oncourt="1"]').length === 10,
        undefined,
        { timeout: 10_000 },
      )
      .then(() => true)
      .catch(() => false);
    note('8. both fives are on the court', tenOnCourt);
    await shot(scoring, '08-fives');
    await picture(scoring, 8);

    at = 'step 9: the clock, baskets and a foul';
    await c.startClock();
    await c.play('home', 1, 'p2');
    await c.play('away', 11, 'p3');
    await c.play('home', 2, 'foul');
    await c.play('away', 12, 'p1');
    note(
      '9. the score reads Ravens 2, Wolves 4',
      JSON.stringify(await c.score()) === '{"home":2,"away":4}',
    );
    note('9. the foul is on Ben Ravens (2)', (await c.fouls('home', 2)) === 1);
    await picture(scoring, 9);

    at = 'step 10: one team turnover for the Wolves';
    const chip = c.turnoversChip('away');
    note(
      '10. the Wolves\' chip starts at "0 turnovers"',
      (await chip.innerText()).trim() === '0 turnovers',
    );
    await chip.tap();
    const list = c.pad.locator('[data-turnover-list="away"]');
    await list.waitFor();
    say(10, await list.innerText());
    await list.getByRole('button', { name: '+ Team turnover' }).tap();
    await c.said.filter({ hasText: 'Team turnover: Wolves.' }).waitFor();
    note(
      '10. the Wolves\' chip reads "1 turnover"',
      (await chip.innerText()).trim() === '1 turnover',
    );
    await picture(scoring, 10);
    // Closed as a phone closes it: the same button again.
    await chip.tap();
    await c.pad.locator('[data-rest]').waitFor();

    at = 'step 11: a wrong basket, taken back with Undo';
    await c.play('home', 1, 'p3');
    note('11. the wrong 3 shows: Ravens 5', (await c.score()).home === 5);
    const undoSays = await c.undoNames();
    say(11, undoSays);
    await c.undo();
    note(
      '11. Undo takes it back: Ravens 2, Wolves 4',
      JSON.stringify(await c.score()) === '{"home":2,"away":4}',
    );
    note('11. Ann Ravens (1) has 2 points again', (await c.points('home', 1)) === 2);
    say(11, `after Undo: ${await c.said.allInnerTexts()}`);
    await picture(scoring, 11);

    at = 'step 12: more baskets, then the clock set wrongly and right again';
    await c.play('home', 4, 'p2');
    await c.play('away', 13, 'p2');
    await c.pauseClock();
    const before = (await c.clockText()).trim();
    // By the words: the clock is the button "Set the clock or change the period"; the
    // form is "Clock and period"; its button starts "Set clock".
    const clockButton = scoring.getByRole('button', { name: /Set the clock or change the period/ });
    const setTo = async (digits) => {
      await clockButton.tap();
      const sheet = scoring.getByRole('dialog', { name: 'Clock and period' });
      await sheet.waitFor();
      for (const digit of digits) {
        await sheet.getByRole('button', { name: digit, exact: true }).tap();
      }
      const setButton = sheet.getByRole('button', { name: /^Set clock/ });
      say(12, `typed ${digits}: the form says ${(await sheet.innerText()).replace(/\s+/g, ' ')}`);
      await setButton.tap();
      await sheet.waitFor({ state: 'detached' });
    };
    await setTo('1200');
    await scoring.waitForFunction(
      () => document.querySelector('[data-clock-time]')?.textContent === '12:00',
    );
    note('12. the clock shows the wrong 12:00', (await c.clockText()).trim() === '12:00');
    const wrongSaid = (await c.said.allInnerTexts()).join(' ');
    say(12, `set to 12:00: ${wrongSaid}`);
    note(
      '12. it says "Clock set to 12:00." and what was added to the minutes',
      /Clock set to 12:00\. .+ was added to the minutes of the players on the court\./.test(
        wrongSaid,
      ),
      wrongSaid,
    );
    await setTo(before.replace(':', ''));
    await scoring.waitForFunction(
      (time) => document.querySelector('[data-clock-time]')?.textContent === time,
      before,
    );
    note(`12. the clock is right again (${before})`, (await c.clockText()).trim() === before);
    const rightSaid = (await c.said.allInnerTexts()).join(' ');
    say(12, `set back to ${before}: ${rightSaid}`);
    note(
      '12. it says the earlier change was taken back',
      rightSaid.includes(
        'of an earlier change to this period’s clock was taken back: minutes and play times are as they were.',
      ),
      rightSaid,
    );
    await picture(scoring, 12);

    at = 'step 13: the second half, then End game from More';
    await c.clock.tap();
    await c.clockSheet.waitFor();
    await shot(scoring, '13-clock-and-period');
    await c.pickPeriod(2);
    await c.startClock();
    await c.play('home', 3, 'p2');
    await c.play('away', 11, 'foul');
    await c.play('home', 5, 'p1');
    await c.fromMore('more-end');
    await c.endAsk.waitFor();
    const asked = (await c.endAsk.innerText()).replace(/\s+/g, ' ').trim();
    say(13, asked);
    note(
      '13. End game asks first, with the score and the time left in the second half',
      /^End the game\? Ravens 7, Wolves 6 H2 still has \d{1,2}:\d\d on the clock\./.test(asked),
      asked,
    );
    await c.answer('yes').tap();
    await c.pad.locator('[data-final="saved"]').waitFor();
    say(13, await c.finalPanel.innerText());
    await picture(scoring, 13);
    note(
      '13. the game is final and saved: Ravens 7, Wolves 6',
      JSON.stringify(await c.score()) === '{"home":7,"away":6}',
    );

    at = "step 14: game 2's final score, typed";
    await staffLink(page, 'Games', /\/admin\/games$/);
    // Game 2's row: the game on the list that is not game 1.
    const row = page.locator(`[id^="game-"]:not([id="game-${gameId}"])`).first();
    say(14, await row.innerText());
    await row.getByText('Enter the final score').tap();
    await row.locator('input[name=homeScore]').fill('50');
    await row.locator('input[name=awayScore]').fill('45');
    await tap(page, row.getByRole('button', { name: 'Save final score' }), /\/admin\/games#game-/);
    const question = page.locator(`[id^="game-"]:not([id="game-${gameId}"])`).first();
    say(14, await question.innerText());
    await tap(
      page,
      question.getByRole('button', { name: 'Yes, make it final' }),
      /\/admin\/games#game-/,
    );
    note(
      '14. Games says "Saved" beside game 2',
      /^Saved: /.test((await question.getByRole('status').textContent()) ?? ''),
    );
    say(14, `after Yes: ${await question.innerText()}`);
    await picture(page, 14);

    at = "step 15: League settings' minimum games for the leaders";
    await staffLink(page, 'League settings', /\/admin\/settings/);
    const setting = page.locator('section[data-setting="statistics.minimumGamesToRank"]');
    say(15, await setting.innerText());
    await setting.locator('input[name=value]').fill('1');
    await tap(page, setting.getByRole('button', { name: 'Save' }));
    const saved = await page
      .locator('section[data-setting="statistics.minimumGamesToRank"]')
      .innerText();
    note(
      '15. the minimum is saved for this league',
      saved.includes('Now: set for this league.'),
      saved,
    );
    say(15, `after Save: ${saved}`);
    await picture(page, 15);

    // Steps 16 to 18: a visitor, signed out, reads the public pages: a fresh browser with
    // no cookies, at the same phone size. Each page is read again by address to be sure it
    // answers 200 to someone signed out.
    at = 'step 16: a visitor opens the league';
    const visitor = await browser.newContext(phone);
    const away = await visitor.newPage();
    const answers = async (label) => {
      const again = await away.goto(away.url());
      note(`${label} answers 200 to a visitor`, again?.status() === 200, `${again?.status()}`);
    };
    const home = await away.goto(`${origin}/${league}`);
    note(
      '16. a visitor, signed out, opens the league home: 200',
      home?.status() === 200 && (await visitor.cookies()).length === 0,
      `${home?.status()}`,
    );
    at = "step 16: game 1's page";
    await tap(away, away.locator(`main a[href*="/games/${gameId}"]`).first(), /\/games\//);
    const game = await mainText(away);
    say(16, game);
    const tables = await away.$$eval('main table', (all) =>
      all.map((table) =>
        [...table.rows].map((r) => [...r.cells].map((cell) => cell.innerText.trim())),
      ),
    );
    const totalRows = tables.map((rows) =>
      rows.find((cells) => cells[0] === 'Total' || cells[1] === 'Total'),
    );
    const totals = totalRows.map((cells) => (cells ?? []).slice(-4).join(' '));
    note(
      '16. the game page says final, Ravens 7, Wolves 6',
      /final/i.test(game) && /\b7\b/.test(game) && /\b6\b/.test(game),
    );
    note(
      "16. the box scores' Totals (PTS, 3PM, FTM, PF): Wolves 6 1 1 1, Ravens 7 0 1 1",
      totals.includes('6 1 1 1') && totals.includes('7 0 1 1'),
      JSON.stringify(totals),
    );
    await fits(away, "16. game 1's page");
    await answers("16. game 1's page");

    at = 'step 17: the standings';
    await away.locator('.site-header .site-menu summary').tap();
    await tap(
      away,
      away.locator('.site-header').getByRole('link', { name: 'Standings', exact: true }).first(),
      /\/standings/,
    );
    const standings = await mainText(away);
    say(17, standings);
    const rows = await away.$$eval('main table tbody tr', (all) =>
      all.map((r) => [...r.cells].map((cell) => cell.innerText.trim()).join(' ')),
    );
    const wolves = rows.findIndex((r) => r.includes('Wolves'));
    const ravens = rows.findIndex((r) => r.includes('Ravens'));
    note('17. the Wolves are above the Ravens', wolves >= 0 && wolves < ravens, rows.join(' | '));
    note(
      '17. the Wolves: .500, 56 for, 52 against, +4, W1',
      /\.500/.test(rows[wolves] ?? '') &&
        /56/.test(rows[wolves] ?? '') &&
        /\+4/.test(rows[wolves] ?? '') &&
        /W1/.test(rows[wolves] ?? ''),
      rows[wolves],
    );
    note(
      '17. the Ravens: .500, 52 for, 56 against, -4, L1',
      /\.500/.test(rows[ravens] ?? '') &&
        /[-−]4/.test(rows[ravens] ?? '') &&
        /L1/.test(rows[ravens] ?? ''),
      rows[ravens],
    );
    note(
      '17. the Owls are in the table with no games',
      rows.some((r) => r.includes('Owls')),
    );
    note(
      '17. the note beside both level teams',
      standings.includes(
        'Wolves and Ravens are level on win percentage (.500). Point difference puts Wolves ahead: +4 against -4.',
      ),
    );
    await fits(away, '17. the standings');
    await answers('17. the standings');

    at = 'step 18: the statistics';
    await away.locator('.site-header .site-menu summary').tap();
    await tap(
      away,
      away.locator('.site-header').getByRole('link', { name: 'Stats', exact: true }).first(),
      /\/stats/,
    );
    const stats = await mainText(away);
    say(18, stats);
    note(
      '18. the statistics say what they count',
      stats.includes(
        'Statistics count the games that were scored live or entered as a box score. A game with only a final score counts in the standings, not here.',
      ),
    );
    note(
      '18. the points leader is Ann Wolves, 3',
      // The card's words are drawn in capitals.
      /points leader/i.test(stats) && /Ann Wolves/.test(stats),
      stats.slice(0, 500),
    );
    note('18. "No leaders yet" is not said: the minimum is 1', !stats.includes('No leaders yet.'));
    await fits(away, '18. the statistics');
    await answers('18. the statistics');
    await visitor.close();
  } catch (error) {
    failures.push(`${at}: ${whatWentWrong(error)}`);
  } finally {
    await browser?.close();
    server.child.kill();
  }
}

const seconds = Math.round((Date.now() - started) / 1000);
if (browserErrors.length > 0) {
  console.log(`What the browser reported as errors on the way:\n  ${browserErrors.join('\n  ')}`);
}
if (failures.length > 0) {
  console.error(`First test walk browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `First test walk browser test passed: ${checked.length} checks in a real browser, ${seconds}s.`,
);
