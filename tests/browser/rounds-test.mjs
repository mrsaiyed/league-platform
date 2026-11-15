// Step 2.160: rounds an owner can make, in a real browser at phone width (390), on the web
// app's made-up stand-in (APP_ENV=test). Nothing leaves this computer; every team and
// round is made up. Scripts are off, so every form is a plain post. Builds the app first
// unless given --no-build; --dev runs `next dev` instead.
//
// The made-up owner signs in as the other browser tests do (the stand-in's session
// cookie) and starts at the admin's home (/north-valley/admin, typed: no page links to it
// yet, as tests/browser/one-world-test.mjs says). From there only taps: Schedule, then the
// season not public yet, which has no rounds. The owner adds three rounds, adds a game to
// the first, moves it to the third and is offered the third's date, says yes and the date
// follows; a round with games cannot be removed and says why; an empty one is removed;
// moved again and answered "No, keep", the game keeps its date and is flagged. Then, in
// the public season, a new round with a game is not on the public schedule until it is
// published, and is after.
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
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

// Three Sundays a week apart, far from the seed's own dates.
const weeks = [
  { label: 'Week 1', date: '2027-01-10', words: 'Sun, Jan 10' },
  { label: 'Week 2', date: '2027-01-17', words: 'Sun, Jan 17' },
  { label: 'Week 3', date: '2027-01-24', words: 'Sun, Jan 24' },
];

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
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 390, height: 844 },
    });
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
      if (!url.test(page.url())) throw new Error(`landed on ${page.url()}, not ${url}`);
    };
    /** The "saved" words: there, naming what was saved, and on the screen without scrolling. */
    const saidAtTop = async (label, words) => {
      const notice = page.locator('[data-notice=done]');
      const text = (await notice.count()) === 1 ? ((await notice.textContent()) ?? '') : '';
      note(`${label}: the page says so`, text.includes(words), text || 'no notice');
      const box = await notice.first().boundingBox();
      note(`${label}: said on the screen at 390 without scrolling`, box !== null && box.y < 844);
    };
    const round = (label) =>
      page.locator('section[data-round]', { has: page.locator('h2', { hasText: label }) });
    const game = page.locator('li[data-game]').first();
    const editGame = async (roundLabel) => {
      await game.locator('summary', { hasText: 'Edit this game' }).click();
      await game.locator('select[name=roundId]').selectOption({ label: roundLabel });
      await tap(game.getByRole('button', { name: 'Save game' }), /done=saved/);
    };
    // The date in the game's own edit form (the flag's button carries the round's date).
    const gameDate = async () =>
      game.locator('details input[type=date][name=date]').first().getAttribute('value');

    at = 'the owner opens the admin and taps Schedule';
    await page.goto(`${origin}/north-valley`);
    await page.goto(`${origin}/north-valley/admin`);
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
      '"Add a round" is open in a season with no rounds',
      (await page.locator('details[data-add-round]').getAttribute('open')) !== null,
    );
    await accessible('a season with no rounds');

    at = 'the owner adds three rounds';
    for (const [i, week] of weeks.entries()) {
      const add = page.locator('details[data-add-round]');
      if ((await add.getAttribute('open')) === null) await add.locator('summary').click();
      if (i > 0) {
        note(
          `the date offered for ${week.label} is a week after the last round`,
          (await add.locator('input[name=date]').inputValue()) === week.date,
        );
      }
      await add.locator('input[name=label]').fill(week.label);
      await add.locator('input[name=date]').fill(week.date);
      await tap(add.getByRole('button', { name: 'Add round' }), /saved=round-added/);
      await saidAtTop(`${week.label} added`, `Round ${i + 1}: ${week.label} was added`);
    }
    note('three rounds are in the grid', (await page.locator('section[data-round]').count()) === 3);
    await accessible('three new rounds');

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
    await tap(add.getByRole('button', { name: 'Add game' }), /done=saved/);
    note(
      'the game is in the first round',
      (await round('Week 1').locator('li[data-game]').count()) === 1,
    );

    at = 'the owner moves the game to the third round';
    await editGame('Round 3: Week 3');
    await saidAtTop('the move', 'is now in Round 3: Week 3');
    const offer = page.locator('[data-follow-round-date]');
    note(
      "the owner is offered the third round's date",
      (await offer.count()) === 1 &&
        ((await offer.textContent()) ?? '').includes(`Move it to ${weeks[2].words} too?`),
      (await offer.count()) === 1 ? ((await offer.textContent()) ?? '') : 'no offer',
    );
    note(
      "the game is flagged while it is off its round's date",
      (await page.locator('[data-off-round-date]').count()) === 1,
    );
    await accessible("the offer of the round's date");
    await tap(
      offer.getByRole('button', { name: `Yes, move it to ${weeks[2].words}` }),
      /done=saved/,
    );
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

    at = 'the owner removes the empty second round';
    const second = round('Week 2');
    await second.locator('summary', { hasText: 'Change or remove this round' }).click();
    await tap(second.getByRole('button', { name: 'Remove this round' }), /saved=round-removed/);
    await saidAtTop('the removal', 'the round was removed');
    note('two rounds are left', (await page.locator('section[data-round]').count()) === 2);

    at = 'the owner moves the game again and keeps its date';
    await editGame('Round 1: Week 1');
    await tap(
      page
        .locator('[data-follow-round-date]')
        .getByRole('link', { name: `No, keep ${weeks[2].words}` }),
      /\/admin\/schedule\?season=winter-2027$/,
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
      "the game is flagged as off its round's date",
      flag.includes(`Outside its round: Round 1: Week 1 is on ${weeks[0].words}.`),
      flag,
    );
    await accessible("a game off its round's date");

    at = "the owner publishes the new season's schedule";
    const summary = await page
      .locator('section', { has: page.locator('#publish-heading') })
      .innerText();
    note(
      'the publish summary counts the rounds',
      summary.includes('Rounds added: 2. Rounds removed: 0.'),
      summary.slice(0, 300),
    );
    await tap(page.getByRole('button', { name: 'Publish this schedule' }), /done=published/);
    note(
      'the rounds stay after publishing',
      (await page.locator('section[data-round]').count()) === 2 &&
        (await page.locator('main').innerText()).includes('There is no draft yet.'),
    );

    // The public season: a new round is not public until it is published.
    at = 'the owner adds a round to the public season';
    await tap(
      page.locator('nav').getByRole('link', { name: 'Schedule', exact: true }).first(),
      /\/admin\/schedule$/,
    );
    const finals = 'Finals week';
    const addRound = page.locator('details[data-add-round]');
    await addRound.locator('summary').click();
    await addRound.locator('input[name=label]').fill(finals);
    // The date offered: a week after the season's last round.
    const finalsDate = await addRound.locator('input[name=date]').inputValue();
    await tap(addRound.getByRole('button', { name: 'Add round' }), /saved=round-added/);
    const added = round(finals).locator('details[data-add-game]');
    await added.locator('summary').click();
    const names = await added
      .locator('select[name=homeTeamId] option')
      .evaluateAll((o) => o.map((x) => x.textContent).filter((x) => x && !/Choose/.test(x)));
    await added.locator('select[name=homeTeamId]').selectOption({ label: names[0] });
    await added.locator('select[name=awayTeamId]').selectOption({ label: names[1] });
    await added.locator('input[name=time]').fill('20:00');
    await tap(added.getByRole('button', { name: 'Add game' }), /done=saved/);

    const visitor = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 390, height: 844 },
    });
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
    await tap(page.getByRole('button', { name: 'Publish this schedule' }), /done=published/);
    const after = await publicSchedule();
    note(
      'the new round is on the public schedule once published',
      after.includes(finals),
      `${finalsDate}: ${after.slice(0, 300)}`,
    );
    await visitor.close();
  } catch (error) {
    failures.push(`${at}: ${String(error?.message ?? error).split('\n')[0]}`);
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
