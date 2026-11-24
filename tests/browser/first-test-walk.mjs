// The first test's walk (step 2.194, docs/operations/first-test.md), steps 1 to 18, by touch
// at a phone's size, as one function both of its runs share: the walk browser test
// (first-test-walk-test.mjs, on the made-up stand-in, APP_ENV=test) and the test copy's
// rehearsal (scripts/rehearse-test-copy.mjs, staging mode on a real PostgreSQL, step 2.207).
// Made-up data only. Each check's name starts with the number of the step it checks there.
//
// What differs between the two runs is given, not guessed: the league (its short name, its
// name, its season's name, and whether it is still a draft) and how the owner signs in
// (`signIn`, by default the sign-in page with an email and a password). A draft league (a
// league made by `league:make`) is published by its owner after step 15, in League
// settings' Publishing part (step 2.240), once a visitor, signed out in a browser of its
// own, has been told its home is not found; steps 16 to 18 are then read by that visitor.
// Steps 5 and 6 check the product's own sentence that visitors cannot see the league until
// it is published.
import { leagueUrl } from '@srleagues/core';
import { court } from './tracker-driver.mjs';
import { openStaffMenu } from './web-browser-kit.mjs';

export const phone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
};
const firstNames = ['Ann', 'Ben', 'Cal', 'Dee', 'Eli'];
/** The form that follows a heading the person reads ("A new player, not in the league yet"). */
const formUnder = (on, heading) =>
  on.getByRole('heading', { name: heading, exact: true }).locator('xpath=following::form[1]');
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Signs in on the sign-in page with an email and a password, as the owner would. */
export const signInWithPassword =
  ({ email, password }) =>
  async (on, origin) => {
    await on.goto(`${origin}/signin`);
    await on.getByRole('heading', { level: 1, name: 'Sign in' }).waitFor();
    await on.getByLabel('Email').fill(email);
    await on.getByLabel('Password').fill(password);
    await Promise.all([
      on.waitForURL((url) => url.pathname !== '/signin'),
      on.getByRole('button', { name: 'Sign in', exact: true }).tap(),
    ]);
  };

/**
 * The walk, steps 1 to 18. `o`: { origin, browser, visitorBrowser (the signed-out visitor's
 * own browser; `browser` when not given), league: { slug, name, season, draft }, today and
 * yesterday (YYYY-MM-DD in the league's zone), signIn (on, origin), note (label, ok, detail),
 * say (step, words), shot (on, name), picture (on, step), watchErrors (on, where) }. A step
 * that cannot be done throws, the error's `at` naming the step.
 */
export async function walkFirstTest(o) {
  const { origin, browser, today, yesterday, note, say, shot, picture, watchErrors } = o;
  const { slug: league, name: leagueName, season: seasonName, draft = false } = o.league;
  const full = (address) => `${origin}${address}`;
  let at = 'starting';
  try {
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

    at = 'step 1: signing in on the sign-in page';
    await o.signIn(scoring, origin);
    note('1. signing in leaves the sign-in page', !scoring.url().endsWith('/signin'));
    say(1, `${scoring.url()}\n${await scoring.locator('body').innerText()}`);
    watchErrors(scoring, 'tracker phone');
    const offline = await browser.newContext({ ...phone, javaScriptEnabled: false });
    await offline.addCookies(await live.cookies());
    const page = await offline.newPage();
    page.setDefaultTimeout(60_000);
    await page.goto(full('/account'));
    const account = await mainText(page);
    note(
      `1. the account page: "Your account", and ${leagueName} with Owner under "Your leagues"`,
      account.includes('Your account') &&
        account.includes('Your leagues') &&
        new RegExp(`${escaped(leagueName)}\\s*Owner`).test(account),
      account.slice(0, 400),
    );
    await picture(page, 1);

    at = `step 2: the owner opens ${leagueName}'s admin`;
    // By the words on the screen: "Admin" beside the league's name (not the name, which
    // opens the league's public home).
    const entry = page
      .locator('li')
      .filter({ has: page.getByRole('link', { name: leagueName, exact: true }) });
    await tap(page, entry.getByRole('link', { name: 'Admin', exact: true }), /\/admin$/);
    const welcome = await mainText(page);
    say(2, `${page.url()}\n${welcome}`);
    note(
      `2. "Admin" beside ${leagueName} opens its admin: "Welcome back."`,
      welcome.includes('Welcome back.') &&
        welcome.includes(`Everything you run for ${leagueName} is here.`),
      welcome.slice(0, 300),
    );
    await fits(page, `2. ${leagueName}'s admin`);
    await picture(page, 2);

    at = 'step 3: three teams, five players each for two of them';
    for (const [name, from] of [
      ['Ravens', 1],
      ['Wolves', 11],
      ['Owls', null],
    ]) {
      await staffLink(page, 'Teams', /\/admin\/teams$/);
      await page.locator('input[name=name]').fill(name);
      await tap(
        page,
        page.getByRole('button', { name: 'Add team' }),
        /\/admin\/teams\/[0-9a-f-]{36}(#add-team)?$/,
      );
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
    // As the document says, at any hour: game 1 today (the "Date" box is already filled with
    // the round's day) at a time still to come at both clocks, since "Score this game" is
    // offered for any game today; game 2 yesterday, so its time has come and its result can
    // be typed. "How it is recorded" is left as it is.
    for (const [home, away, date, time] of [
      ['Ravens', 'Wolves', today, '20:00'],
      ['Wolves', 'Ravens', yesterday, '20:00'],
    ]) {
      // "Add a game" inside Week 1, not the one under "Games with no round".
      const add = page
        .locator('section[data-round]', { hasText: 'Week 1' })
        .locator('details[data-add-game]')
        .first();
      await add.getByText('Add a game', { exact: true }).tap();
      await add.getByLabel('Home team').selectOption({ label: home });
      await add.getByLabel('Away team').selectOption({ label: away });
      const dateBox = add.getByLabel('Date', { exact: true });
      note(
        `4. the game's "Date" is already filled with today (${home} v ${away})`,
        (await dateBox.inputValue()) === today,
      );
      if (date !== today) await dateBox.fill(date);
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
    let shown = await page.locator('#who-can-see').innerText();
    // A league made by `league:make` starts with its season hidden: shown here, as its
    // owner would, by "Show this season to visitors" and "Yes" to its question.
    if (
      !new RegExp(
        `Everyone can see ${escaped(seasonName)}\\.|${escaped(seasonName)} is shown`,
      ).test(shown)
    ) {
      await tap(page, page.getByRole('button', { name: /^Show this season/ }));
      await tap(page, page.getByRole('button', { name: /^Yes/ }));
      shown = await page.locator('#who-can-see').innerText();
      note(
        `6. "Show this season to visitors", then "Yes": ${seasonName} is shown`,
        shown.includes(`${seasonName} is shown`) ||
          shown.includes(`Everyone can see ${seasonName}.`),
        shown,
      );
    }
    say(6, shown);
    await picture(page, 6);
    // Nothing to tap: the stand-in's league starts live with its season shown; a draft
    // league's page says, in the product's words, that visitors cannot see it yet.
    const notYet = /visitors cannot see this league until it is published/i;
    if (draft) {
      note(
        '6. Season settings says visitors cannot see the league until it is published',
        notYet.test(shown),
        shown,
      );
      note(
        '5. the schedule says it is published and visitors cannot see the league yet',
        published.startsWith('The schedule is published') && notYet.test(published),
        published,
      );
    } else {
      note(
        `6. Season settings says everyone can see ${seasonName}`,
        shown.includes(`Everyone can see ${seasonName}.`) && !/until it is published/.test(shown),
        shown,
      );
      note(
        '5. the schedule says visitors can see it now',
        published.includes('The schedule is published. Visitors can see it now.'),
        published,
      );
    }

    at = "step 7: 'Score this game' on the league home";
    const leagueHome = full(leagueUrl({ slug: league }, 'home'));
    await scoring.goto(leagueHome);
    const offer = scoring.getByRole('link', {
      name: 'Score this game: Wolves against Ravens',
      exact: true,
    });
    await offer.waitFor().catch(async (error) => {
      const said = (await mainText(scoring).catch(() => '')).replace(/\s+/g, ' ').slice(0, 700);
      const why = error.message.split('\n')[0];
      throw new Error(`no "Score this game" link (${why}); the home says: ${said}`);
    });
    say(7, await mainText(scoring));
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
    // Game 2, yesterday's, made final, leaves the list of games still to settle: its "Saved"
    // line is then at the top of the page rather than beside it (step 2.156).
    const savedLine = page.locator('main [role=status]', { hasText: /^Saved: / }).first();
    note(
      '14. Games says "Saved" for game 2',
      /^Saved: /.test((await savedLine.textContent()) ?? ''),
    );
    say(14, `after Yes: ${await mainText(page)}`);
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

    // A draft league (a league made by `league:make`, the rehearsal's): a visitor, signed
    // out in a browser of its own, is first told its home is not found, the proof that a
    // draft is hidden. Then the owner publishes it where the procedure says
    // (docs/operations/new-test-copy.md, step 8.1.4): League settings, its Publishing part,
    // each must-fix item met first (for a league with under-18s, "Names on public pages"
    // saved, even unchanged, as the list says), then Publish, asked once. The stand-in's
    // league starts live, so its run has nothing to publish.
    if (draft) {
      at = 'before publishing: the visitor, signed out, cannot see the draft league';
      const watcher = await (o.visitorBrowser ?? browser).newContext(phone);
      const look = await watcher.newPage();
      const hiddenPages = [
        ['the league home', leagueHome],
        ["game 1's page", full(leagueUrl({ slug: league }, 'game', { game: gameId }))],
        ['the standings', full(leagueUrl({ slug: league }, 'standings'))],
        ['the statistics', full(leagueUrl({ slug: league }, 'stats'))],
      ];
      for (const [label, address] of hiddenPages) {
        const hidden = await look.goto(address);
        note(
          `15. before publishing, ${label} is hidden from a visitor, signed out (404)`,
          hidden?.status() === 404 && (await watcher.cookies()).length === 0,
          `${hidden?.status()} at ${address}`,
        );
      }
      await watcher.close();
      at = "publishing: League settings' Publishing part";
      await staffLink(page, 'League settings', /\/admin\/settings/);
      const panel = page.locator('section#publish');
      say(15, `the Publishing part: ${await panel.innerText()}`);
      if ((await panel.locator('li[data-check="privacyChosen"][data-met="no"]').count()) > 0) {
        at = 'publishing: saving "Names on public pages" as it starts, as the list asks';
        const names = page.locator('section[data-setting="privacy.publicNames"]');
        await tap(page, names.locator('button[type=submit]').first(), /done=/);
        await staffLink(page, 'League settings', /\/admin\/settings/);
      }
      note(
        '15. the Publishing part: every must-fix item is met',
        (await panel.locator('li[data-met="no"]').count()) === 0,
        await panel.innerText(),
      );
      at = 'publishing: Publish, asked once';
      await tap(page, panel.getByRole('link', { name: 'Publish' }), /publish=ask/);
      note(
        '15. Publish asks once',
        (await panel.innerText()).includes(
          'Publish this league? Anyone will then be able to see its public pages, and you cannot turn it back into a draft afterwards.',
        ),
        await panel.innerText(),
      );
      await tap(page, panel.getByRole('button', { name: 'Publish' }), /done=/);
      const publishedSaid = await page.locator('[role=status], [role=alert]').first().innerText();
      note(
        '15. the owner publishes: "The league is published."',
        publishedSaid.includes('The league is published.'),
        publishedSaid,
      );
      say(15, `after Publish: ${publishedSaid}`);
      await picture(page, 15);
    }

    // Steps 16 to 18: a visitor, signed out, reads the public pages: a fresh browser with
    // no cookies, at the same phone size (a draft league now published). Each page is read
    // again by address to be sure it answers 200 to someone signed out.
    const who = 'a visitor';
    at = `step 16: ${who} opens the league`;
    const visitor = await (o.visitorBrowser ?? browser).newContext(phone);
    const away = await visitor.newPage();
    const answers = async (label) => {
      const again = await away.goto(away.url());
      note(`${label} answers 200 to ${who}`, again?.status() === 200, `${again?.status()}`);
    };
    const home = await away.goto(leagueHome);
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
    // The streak is of the last game played, game 1 (today; game 2 was yesterday), which the
    // Ravens won.
    note(
      '17. the Wolves: .500, 56 for, 52 against, +4, L1',
      /\.500/.test(rows[wolves] ?? '') &&
        /56/.test(rows[wolves] ?? '') &&
        /\+4/.test(rows[wolves] ?? '') &&
        /L1/.test(rows[wolves] ?? ''),
      rows[wolves],
    );
    note(
      '17. the Ravens: .500, 52 for, 56 against, -4, W1',
      /\.500/.test(rows[ravens] ?? '') &&
        /[-−]4/.test(rows[ravens] ?? '') &&
        /W1/.test(rows[ravens] ?? ''),
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
    // Step 2.199: nobody is listed under a leader card for a statistic they have none of
    // (the founder read "2. Ann Ravens 0" there). The free throws list is the two level at 1.
    const listed = await away.locator('.ui-leader-list .ui-leader-value').allInnerTexts();
    note(
      '18. the leaders lists name nobody at 0',
      listed.length > 0 && listed.every((value) => Number(value.trim()) > 0),
      listed.join(', '),
    );
    await fits(away, '18. the statistics');
    await answers('18. the statistics');
    await visitor.close();
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { at });
  }
}
