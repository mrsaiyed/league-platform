// Step 2.160: rounds an owner can make, in a real browser at phone width (390), on the web
// app's made-up stand-in (APP_ENV=test). Nothing leaves this computer; every team and
// round is made up. Scripts are off, so every form is a plain post. Builds the app first
// unless given --no-build; --dev runs `next dev` instead.
//
// The made-up owner signs in as the other browser tests do (the stand-in's session
// cookie) and starts at the admin's home (/north-valley/admin, typed: no page links to it
// yet, as tests/browser/one-world-test.mjs says). From there only taps: Schedule, then the
// season not public yet, which has no rounds: a calm panel with the first round's form, on
// the first screen. The owner adds three rounds ("Saved" beside each, on the screen), adds
// a game to the first, moves it to the third and is offered the third's date beside the
// game, says yes and the date follows; a round with games cannot be removed and says why;
// an empty one is removed; a date the database would refuse is refused beside its field
// with what was typed kept; moved again and answered "No, keep", the game keeps its date
// and is flagged. Then, in the public season, a new round with a game is not on the public
// schedule until it is published, and is after.
import {
  accessibilityProblems,
  buildNext,
  freePort,
  leagueDay,
  leagueDayWords,
  launch,
  openStaffMenu,
  saysNothingOf,
  startNext,
  waitFor,
  whatWentWrong,
  answered,
} from './web-browser-kit.mjs';

const failures = [];
const checked = [];
const note = (label, ok, detail = '') => {
  checked.push(label);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const dev = process.argv.includes('--dev');
let built = true;
if (!dev && !process.argv.includes('--no-build')) {
  built = await buildNext();
  if (!built) failures.push('next build failed or took over 10 minutes');
}

// Three Sundays a week apart, far from the seed's own dates: over a year after the made-up
// world's today (it reads this computer's clock), so always ahead, whatever day it is run (T-404).
const worldNow = new Date().toISOString();
const firstSunday = [400, 401, 402, 403, 404, 405, 406].find(
  (d) => new Date(`${leagueDay(worldNow, d)}T12:00:00Z`).getUTCDay() === 0,
);
const weeks = [0, 7, 14].map((d, i) => ({
  label: `Week ${i + 1}`,
  date: leagueDay(worldNow, (firstSunday ?? 400) + d),
  words: leagueDayWords(worldNow, (firstSunday ?? 400) + d),
}));
const screen = { width: 390, height: 844 };

if (built) {
  const origin = `http://localhost:${await freePort()}`;
  const port = new URL(origin).port;
  const server = startNext(dev ? ['dev', '--port', port] : ['start', '--port', port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  let browser;
  let at = 'starting';
  try {
    await waitFor(`${origin}/`, server);
    browser = await launch();
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: screen });
    await context.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(dev ? 120_000 : 60_000);
    const accessible = async (label) => {
      const problems = await accessibilityProblems(page);
      note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
      const wide = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      );
      note(`no sideways scrolling at phone width: ${label}`, wide);
    };
    /** Taps a link or button, waits for the page it leads to, and checks its address. */
    const tap = async (locator, url) => {
      await Promise.all([page.waitForEvent('load'), locator.click()]);
      // An answer is the server's one-time notice (step 2.155 part 6): what the page says.
      if (!(url instanceof RegExp)) return answered(page, url.said);
      if (!url.test(page.url())) throw new Error(`landed on ${page.url()}, not ${url}`);
    };
    /** On the screen as the page shows it now, without scrolling. */
    const onScreen = async (locator) => {
      const box = await locator.first().boundingBox();
      return box !== null && box.y >= 0 && box.y + Math.min(box.height, 40) <= screen.height;
    };
    /** "Saved", beside what was saved: naming it, and on the screen the page opened at. */
    const saidBeside = async (label, words) => {
      const saved = page.locator('#saved');
      const text = (await saved.count()) === 1 ? ((await saved.textContent()) ?? '') : '';
      note(`${label}: "Saved" names it`, text.includes(words), text || 'no "Saved"');
      note(`${label}: said where the phone is looking`, await onScreen(saved));
    };
    const round = (label) =>
      page.locator('section[data-round]', { has: page.locator('h2', { hasText: label }) });
    const game = page.locator('li[data-game]').first();
    const editGame = async (roundLabel) => {
      await game.locator('summary', { hasText: 'Edit this game' }).click();
      await game.locator('select[name=roundId]').selectOption({ label: roundLabel });
      await tap(game.getByRole('button', { name: 'Save game' }), { said: /Saved to the draft/ });
    };
    // The date in the game's own edit form (the flag's button carries the round's date).
    const gameDate = async () =>
      game.locator('details input[type=date][name=date]').first().getAttribute('value');
    /** The "Add a round" form: in the empty season's panel, else opened at the foot. */
    const addRoundForm = async () => {
      const panel = page.locator('[data-no-rounds] form');
      if ((await panel.count()) === 1) return panel;
      const foot = page.locator('details[data-add-round]');
      if ((await foot.getAttribute('open')) === null) await foot.locator('summary').click();
      return foot.locator('form');
    };
    const kindOf = (locator) => locator.getAttribute('data-kind');

    at = 'the owner opens the admin and taps Schedule';
    await page.goto(`${origin}/north-valley`);
    await page.goto(`${origin}/north-valley/admin`);
    // The admin's areas are behind its own menu button on a phone (step 2.103).
    await openStaffMenu(page);
    await tap(
      page.locator('nav').getByRole('link', { name: 'Schedule', exact: true }).first(),
      /\/admin\/schedule$/,
    );

    at = 'the owner picks the season that is not public yet';
    const picker = page.locator('form', { has: page.locator('select[name=season]') }).first();
    await picker
      .locator('select[name=season]')
      .selectOption({ label: 'Winter 2027 (not public yet)' });
    await tap(picker.locator('button'), /season=winter-2027/);
    const empty = await page.locator('main').innerText();
    note('the season has no rounds yet', empty.includes('This season has no rounds yet.'));
    note(
      'the season not public yet is not called "the published schedule"',
      !empty.includes('You are looking at the published schedule') &&
        empty.includes('This season is not public yet'),
    );
    note('no "Clashes to fix" while there are no rounds', !empty.includes('Clashes to fix'));
    note(
      "the first round's form is on the first screen, in a panel under the intro",
      (await page.locator('[data-no-rounds] form').count()) === 1 &&
        (await onScreen(page.locator('[data-no-rounds] input[name=label]'))),
    );
    await accessible('a season with no rounds');

    at = 'the owner adds three rounds';
    for (const [i, week] of weeks.entries()) {
      const form = await addRoundForm();
      if (i > 0) {
        note(
          `the date offered for ${week.label} is a week after the last round`,
          (await form.locator('input[name=date]').inputValue()) === week.date,
        );
      }
      const submit = form.getByRole('button', { name: 'Add round' });
      if (i === 0) note('"Add round" is the main button', (await kindOf(submit)) === 'main');
      await form.locator('input[name=label]').fill(week.label);
      await form.locator('input[name=date]').fill(week.date);
      await tap(submit, { said: /Saved to the draft: .+ was added/ });
      await saidBeside(`${week.label} added`, `Round ${i + 1}: ${week.label} was added`);
    }
    note('three rounds are in the grid', (await page.locator('section[data-round]').count()) === 3);

    at = 'a "Saved" is said once: Back, a reload or a typed address says nothing (step 2.155)';
    const plainGrid = page.url().replace(/#.*$/, '');
    note('the address holds only the season', /\?season=winter-2027$/.test(plainGrid), plainGrid);
    await page.goto(new URL('/', plainGrid).href);
    await page.goBack();
    await page.locator('section[data-round]').first().waitFor();
    note('Back to the grid says nothing of the round added', await saysNothingOf(page, /added/));
    await page.reload();
    await page.locator('section[data-round]').first().waitFor();
    note('a reload says nothing of the round added', await saysNothingOf(page, /added/));
    const firstRound = await page.locator('section[data-round]').first().getAttribute('data-round');
    for (const typed of [
      `done=saved&saved=round-added&round=${firstRound}`,
      'done=published&removed=3',
      'problem=invalid-input&at=add-round&label=Typed+week&date=2027-02-02',
    ]) {
      await page.goto(`${plainGrid}&${typed}#saved`);
      await page.locator('section[data-round]').first().waitFor();
      note(
        `a typed address says nothing: ${typed}`,
        (await saysNothingOf(page, /added|published|bin|not saved|Choose/)) &&
          (await page.locator('details[data-add-round] input[name=label]').inputValue()) !==
            'Typed week',
      );
    }
    const summary = page.locator('details[data-add-round] > summary');
    const tall = (await summary.boundingBox())?.height ?? 0;
    note('"Add a round" at the foot is at least 44 high', tall >= 44, `${tall}`);
    await accessible('three new rounds');

    at = 'a date the database would not take is refused beside its field';
    const refusedForm = await addRoundForm();
    await refusedForm.locator('input[name=label]').fill('Far week');
    await refusedForm.locator('input[name=date]').fill('3027-01-31');
    await tap(refusedForm.getByRole('button', { name: 'Add round' }), {
      said: 'Choose a date between the years 1900 and 2999.',
    });
    const kept = page.locator('details[data-add-round] form');
    note(
      'the refused round keeps its name',
      (await kept.locator('input[name=label]').inputValue()) === 'Far week',
    );
    const error = (await kept.locator('.ui-field-error').textContent()) ?? '';
    note(
      'and says why beside the date, in one sentence',
      error === 'Choose a date between the years 1900 and 2999.',
      error,
    );
    note('the refusal is on the screen', await onScreen(kept.locator('.ui-field-error')));

    at = 'the owner adds a game to the first round';
    const add = round('Week 1').locator('details[data-add-game]');
    await add.locator('summary').click();
    const teams = await add
      .locator('select[name=homeTeamId] option')
      .evaluateAll((o) => o.map((x) => x.textContent).filter((x) => x && !/Choose/.test(x)));
    if (teams.length < 2) throw new Error(`only ${teams.length} teams in the season`);
    await add.locator('select[name=homeTeamId]').selectOption({ label: teams[0] });
    await add.locator('select[name=awayTeamId]').selectOption({ label: teams[1] });
    note(
      "the new game's date is its round's",
      (await add.locator('input[name=date]').inputValue()) === weeks[0].date,
    );
    await add.locator('input[name=time]').fill('18:00');
    await tap(add.getByRole('button', { name: 'Add game' }), { said: /Saved to the draft/ });
    await saidBeside('the new game', `${teams[1]} at ${teams[0]}`);
    note(
      'the game is in the first round',
      (await round('Week 1').locator('li[data-game]').count()) === 1,
    );

    at = 'the owner moves the game to the third round';
    await editGame('Round 3: Week 3');
    await saidBeside('the move', 'is now in Round 3: Week 3');
    const offer = page.locator('#saved [data-follow-round-date]');
    note(
      "the owner is offered the third round's date beside the game",
      (await offer.count()) === 1 &&
        ((await offer.textContent()) ?? '').includes(`Move it to ${weeks[2].words} too?`),
      (await offer.count()) === 1 ? ((await offer.textContent()) ?? '') : 'no offer',
    );
    const yes = offer.getByRole('button', { name: `Yes, move it to ${weeks[2].words}` });
    const no = offer.getByRole('link', { name: `No, keep ${weeks[0].words}` });
    note('"Yes" is the main button', (await kindOf(yes)) === 'main');
    note('"No, keep" is drawn as a button', (await no.getAttribute('class')) === 'ui-button');
    note(
      // The question is the one offer while it is asked; the flag comes back after "No".
      "the round's date is offered once, by the question alone",
      (await page.locator('[data-off-round-date]').count()) === 0,
    );
    await accessible("the offer of the round's date");
    await tap(yes, { said: /Saved to the draft/ });
    note(
      'the game is in the third round',
      (await round('Week 3').locator('li[data-game]').count()) === 1,
    );
    note(
      "the game's date followed its round",
      (await gameDate()) === weeks[2].date,
      `${await gameDate()}`,
    );
    note('the flag is gone', (await page.locator('[data-off-round-date]').count()) === 0);

    at = 'the owner tries to remove the round with the game';
    const third = round('Week 3');
    await third.locator('summary', { hasText: 'Change or remove this round' }).click();
    note(
      'a round with games offers no Remove button',
      (await third.getByRole('button', { name: 'Remove this round' }).count()) === 0,
    );
    const why = (await third.locator('[data-remove-round-blocked]').textContent()) ?? '';
    note(
      'and says why',
      why.includes(
        'This round has 1 game, so it cannot be removed. Move or remove its game first.',
      ),
      why,
    );

    at = 'a round date the database would not take is refused beside the round';
    const dateForm = third.locator('form', {
      has: page.locator('button', { hasText: 'Change round date' }),
    });
    await dateForm.locator('input[name=date]').fill('1899-01-01');
    await tap(dateForm.getByRole('button', { name: 'Change round date' }), {
      said: 'Round date: Choose a date between the years 1900 and 2999.',
    });
    const roundError = round('Week 3').locator('[data-notice=problem]');
    note(
      'the round says why, in one sentence naming the date box',
      ((await roundError.textContent()) ?? '') ===
        'Round date: Choose a date between the years 1900 and 2999.',
      (await roundError.textContent()) ?? 'nothing said',
    );
    note('beside the round, on the screen', await onScreen(roundError));

    at = 'with scripts on, a round refused far down the page comes into view (T-437)';
    // With scripts the grid is drawn again in place after a button: no new page, so the
    // browser does not move. A refusal of the round as a whole is said in its head, above its
    // forms; with "Remove this round" at the top of the screen that head is off it, and the
    // refusal must bring itself into view (IntoView). (A refused box is said beside the box,
    // on the screen already.)
    const live = await browser.newContext({ viewport: screen });
    await live.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
    const livePage = await live.newPage();
    livePage.setDefaultTimeout(dev ? 120_000 : 60_000);
    try {
      await livePage.goto(plainGrid);
      const far = livePage.locator('section[data-round]', {
        has: livePage.locator('h2', { hasText: 'Week 2' }),
      });
      await far.locator('summary', { hasText: 'Change or remove this round' }).click();
      const removeForm = far.locator('form', {
        has: livePage.locator('button', { hasText: 'Remove this round' }),
      });
      // As if someone else had changed the draft since this page was drawn.
      await removeForm.locator('input[name=version]').evaluate((input) => {
        input.value = String(Number(input.value) - 1);
      });
      const press = removeForm.getByRole('button', { name: 'Remove this round' });
      await press.evaluate((button) => {
        window.scrollBy(0, button.getBoundingClientRect().top - 150);
      });
      const head = await far.locator('h2').evaluate((h2) => h2.getBoundingClientRect().bottom);
      note("before the press the round's head is above the screen", head < 0, String(head));
      await press.click();
      const liveError = far.locator('.ui-notice[data-into-view][data-notice=problem]');
      await liveError.waitFor({ timeout: 10_000 });
      note(
        'scripts on: the refused round is said on the screen without scrolling',
        await onScreen(liveError),
        JSON.stringify(await liveError.boundingBox()),
      );
      note('scripts on: the round is still there', (await far.count()) === 1);
      note('scripts on: the address holds no answer', !/[?&](problem|at)=/.test(livePage.url()));
    } finally {
      await live.close();
    }

    at = 'the owner removes the empty second round';
    const removedWords = 'Saved to the draft: the round was removed.';
    const gridAddress = page.url();
    /** How many "Removed a round" rows the activity log holds; back to the grid after. */
    const roundsRemoved = async () => {
      await page.goto(`${origin}/north-valley/admin/settings/activity`);
      const rows = await page.locator('[data-activity-log] > li').allInnerTexts();
      await page.goto(gridAddress);
      return rows.filter((text) => text.includes('Removed a round in the schedule draft')).length;
    };
    const removedBefore = await roundsRemoved();
    const second = round('Week 2');
    await second.locator('summary', { hasText: 'Change or remove this round' }).click();
    const remove = second.getByRole('button', { name: 'Remove this round' });
    note('"Remove this round" is drawn as a danger button', (await kindOf(remove)) === 'danger');
    // Its form as drawn, its one-time token among them, to send again after the first is done.
    const removeFields = await remove
      .locator('xpath=ancestor::form[1]')
      .evaluate((element) =>
        Object.fromEntries([...new FormData(element).entries()].map(([k, v]) => [k, String(v)])),
      );
    note(
      '"Remove this round" carries a one-time token',
      (removeFields['requestToken'] ?? '') !== '',
    );
    await tap(remove, { said: removedWords });
    await saidBeside('the removal', 'the round was removed');
    note('two rounds are left', (await page.locator('section[data-round]').count()) === 2);
    // A double tap that got through after the first finished: the same form sent again.
    const again = await page.request.post(gridAddress, {
      multipart: removeFields,
      headers: { origin },
      maxRedirects: 0,
      timeout: 30_000,
    });
    const againTo = again.headers()['location'] ?? '';
    note('the second "Remove this round" is sent back to the grid', again.status() === 303);
    // As the first: to its "Saved", not to the round's form as a refusal is (#round-…).
    note(
      'the second "Remove this round" lands where the first did',
      againTo.endsWith('#saved'),
      againTo,
    );
    await page.goto(new URL(againTo, gridAddress).href);
    await answered(page, removedWords);
    note(
      'the second "Remove this round" is answered as the first, not as someone else\'s change',
      await saysNothingOf(page, 'That was not saved'),
    );
    note('still two rounds', (await page.locator('section[data-round]').count()) === 2);
    // The same form from another tab drawn before the removal (a new token): refused, and its
    // round is no longer drawn, so it is said at the top, by the round's name, once, in view.
    const late = await page.request.post(gridAddress, {
      multipart: { ...removeFields, requestToken: crypto.randomUUID() },
      headers: { origin },
      maxRedirects: 0,
      timeout: 30_000,
    });
    const lateTo = late.headers()['location'] ?? '';
    note('a late "Remove this round" is refused at its round', /#round-/.test(lateTo), lateTo);
    // Off the grid first: the same address with only a new anchor would not load it again.
    await page.goto('about:blank');
    await page.goto(new URL(lateTo, gridAddress).href);
    const goneSaid = page.locator('[data-round-gone][data-notice="problem"]');
    await goneSaid.waitFor({ timeout: 15_000 });
    note(
      'the refusal of a round no longer drawn is said at the top, by its name',
      /Week 2: that was not saved\./.test(await goneSaid.innerText()),
      await goneSaid.innerText(),
    );
    note(
      'and said once',
      (await page.getByText('that was not saved', { exact: false }).count()) === 1,
    );
    note(
      'and brought into view',
      await goneSaid.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return box.top >= 0 && box.bottom <= window.innerHeight;
      }),
    );
    const removedAfter = await roundsRemoved();
    note(
      'removed twice, one row in the activity log',
      removedAfter === removedBefore + 1,
      `${removedBefore} then ${removedAfter}`,
    );

    at = 'the owner moves the game again and keeps its date';
    await editGame('Round 1: Week 1');
    await tap(
      page
        .locator('[data-follow-round-date]')
        .getByRole('link', { name: `No, keep ${weeks[2].words}` }),
      /\/admin\/schedule\?season=winter-2027/,
    );
    note(
      'the game is in the first round',
      (await round('Week 1').locator('li[data-game]').count()) === 1,
    );
    note(
      'its date stayed as the owner said',
      (await gameDate()) === weeks[2].date,
      `${await gameDate()}`,
    );
    const flag = (await page.locator('[data-off-round-date]').textContent()) ?? '';
    note(
      "the game is flagged as outside its round's days, in one plain sentence",
      // The round's day in words, as the page writes every other day (step 2.103).
      flag.includes(`This game falls outside Week 1, which is on ${weeks[0].words}.`),
      flag,
    );
    await accessible("a game outside its round's days");

    at = "the owner publishes the new season's schedule";
    const publishing = await page
      .locator('section', { has: page.locator('#publish-heading') })
      .innerText();
    note(
      'the publish summary counts the rounds',
      publishing.includes('Rounds added: 2. Rounds removed: 0.'),
      publishing.slice(0, 300),
    );
    await tap(page.getByRole('button', { name: 'Publish this schedule' }), {
      said: 'The schedule is published',
    });
    note(
      'the rounds stay after publishing',
      (await page.locator('section[data-round]').count()) === 2 &&
        (await page.locator('main').innerText()).includes('This season is not public yet'),
    );

    // The public season: a new round is not public until it is published.
    at = 'the owner adds a round to the public season';
    await openStaffMenu(page);
    await tap(
      page.locator('nav').getByRole('link', { name: 'Schedule', exact: true }).first(),
      /\/admin\/schedule$/,
    );
    const finals = 'Finals week';
    const finalsForm = await addRoundForm();
    await finalsForm.locator('input[name=label]').fill(finals);
    await tap(finalsForm.getByRole('button', { name: 'Add round' }), {
      said: /Saved to the draft: .+ was added/,
    });
    const added = round(finals).locator('details[data-add-game]');
    await added.locator('summary').click();
    const names = await added
      .locator('select[name=homeTeamId] option')
      .evaluateAll((o) => o.map((x) => x.textContent).filter((x) => x && !/Choose/.test(x)));
    await added.locator('select[name=homeTeamId]').selectOption({ label: names[0] });
    await added.locator('select[name=awayTeamId]').selectOption({ label: names[1] });
    await added.locator('input[name=time]').fill('20:00');
    await tap(added.getByRole('button', { name: 'Add game' }), { said: /Saved to the draft/ });

    const visitor = await browser.newContext({ javaScriptEnabled: false, viewport: screen });
    const publicPage = await visitor.newPage();
    publicPage.setDefaultTimeout(dev ? 120_000 : 60_000);
    const publicSchedule = async () => {
      await publicPage.goto(`${origin}/north-valley/schedule`);
      return publicPage.locator('main').innerText();
    };
    note(
      'the new round is not on the public schedule before publishing',
      !(await publicSchedule()).includes(finals),
    );
    await tap(page.getByRole('button', { name: 'Publish this schedule' }), {
      said: 'The schedule is published',
    });
    const after = await publicSchedule();
    note(
      'the new round is on the public schedule once published',
      after.includes(finals),
      after.slice(0, 300),
    );
    await visitor.close();
  } catch (error) {
    failures.push(`${at}: ${whatWentWrong(error)}`);
  } finally {
    await browser?.close();
    server.child.kill();
  }
}

if (failures.length > 0) {
  console.error(`Rounds browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Rounds browser test passed: ${checked.length} checks in a real browser.`);
