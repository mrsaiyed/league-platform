// Step 2.181: a game in the bin does not hold its round (S-60), in a real browser at phone
// width (390), on the web app's made-up stand-in (APP_ENV=test). Nothing leaves this
// computer; every team, round and game is made up. Scripts are off, so every form is a
// plain post. Builds the app first unless given --no-build; --dev runs `next dev` instead.
//
// The walk of 2026-11-16 (Job 2) found the current season's last round stuck: both its
// games removed and published, it read "0 games" and "It has no games, so it can be
// removed", and "Remove this round" refused, for the 30 days its games sat in the bin.
// Here the made-up owner starts at the admin's home (typed: no page links to it yet, as
// tests/browser/one-world-test.mjs says) and from there only taps: Schedule; both games of
// the last round removed and the draft published; the round then shows no game and offers
// "Remove this round", which is tapped and is saved beside the round; the next publish
// removes it. The public schedule shows the round before and never once it is removed.
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

const dev = process.argv.includes('--dev');
let built = true;
if (!dev && !process.argv.includes('--no-build')) {
  built = await buildNext();
  if (!built) failures.push('next build failed or took over 10 minutes');
}

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
      if (!url.test(page.url())) throw new Error(`landed on ${page.url()}, not ${url}`);
    };
    /** On the screen as the page shows it now, without scrolling. */
    const onScreen = async (locator) => {
      const box = await locator.first().boundingBox();
      return box !== null && box.y >= 0 && box.y + Math.min(box.height, 40) <= screen.height;
    };
    const kindOf = (locator) => locator.getAttribute('data-kind');

    const visitor = await browser.newContext({ javaScriptEnabled: false, viewport: screen });
    const publicPage = await visitor.newPage();
    publicPage.setDefaultTimeout(dev ? 120_000 : 60_000);
    /** The public schedule's words and its round choices, as a visitor gets them. */
    const publicSchedule = async (query = '') => {
      await publicPage.goto(`${origin}/north-valley/schedule${query}`);
      const words = await publicPage.locator('main').innerText();
      const choices = await publicPage
        .locator('select[name=round] option')
        .evaluateAll((o) => o.map((x) => x.textContent ?? ''));
      return `${words}\n${choices.join('\n')}`;
    };

    at = 'the owner opens the admin and taps Schedule';
    await page.goto(`${origin}/north-valley`);
    await page.goto(`${origin}/north-valley/admin`);
    await openStaffMenu(page);
    await tap(
      page.locator('nav').getByRole('link', { name: 'Schedule', exact: true }).first(),
      /\/admin\/schedule$/,
    );

    at = "the owner finds the current season's last round";
    const last = page.locator('section[data-round]').last();
    const roundId = await last.getAttribute('data-round');
    const heading = ((await last.locator('h2').textContent()) ?? '').trim();
    const number = /^Round (\d+)/.exec(heading)?.[1];
    if (roundId === null || number === undefined) throw new Error(`no last round: ${heading}`);
    const round = page.locator(`section[data-round="${roundId}"]`);
    const publicName = `Round ${number}`;
    note(
      `the public schedule shows ${publicName} to begin with`,
      (await publicSchedule()).includes(publicName),
    );

    at = 'the owner removes both games of the round';
    const games = round.locator('li[data-game]', {
      has: page.locator('summary', { hasText: 'Edit this game' }),
    });
    const gameCount = await games.count();
    note('the round has two games to remove', gameCount === 2, `${gameCount}`);
    for (let i = 0; i < gameCount; i += 1) {
      const game = games.first();
      await game.locator('summary', { hasText: 'Edit this game' }).click();
      await tap(
        game.getByRole('button', { name: 'Remove game' }),
        /\/admin\/schedule(\?season=[\w-]+)?#(saved|game-[\w-]+)$/,
      );
      const said = (await page.locator('#saved').textContent()) ?? '';
      note(`removed game ${i + 1}: said beside the round`, said.includes('Removed:'), said);
    }
    note('the round shows no game', (await games.count()) === 0);
    await accessible('both games of the round removed');

    at = 'the owner publishes the removal';
    const before = await page
      .locator('section', { has: page.locator('#publish-heading') })
      .innerText();
    note(
      'the publish summary removes the two games',
      // The summary since step 2.53: the count, then one "Removed:" line a game.
      before.includes('Publishing makes 2 changes.') && before.split('Removed: ').length - 1 === 2,
      before.slice(0, 300),
    );
    await tap(page.getByRole('button', { name: 'Publish this schedule' }), /done=published/);

    at = 'the round now says it can be removed';
    const facts = (await round.locator('.admin-round-facts').textContent()) ?? '';
    note('the round reads "0 games"', facts.includes('0 games'), facts);
    note('and no game with no date', !facts.includes('no date yet'), facts);
    await round.locator('summary', { hasText: 'Change or remove this round' }).click();
    const opened = await round.innerText();
    note(
      'it says it can be removed',
      opened.includes('It has no games, so it can be removed from the draft.'),
      opened.slice(0, 400),
    );
    const remove = round.getByRole('button', { name: 'Remove this round' });
    note('"Remove this round" is offered', (await remove.count()) === 1);
    note('"Remove this round" is drawn as a danger button', (await kindOf(remove)) === 'danger');
    await accessible('the emptied round, opened');

    at = 'the owner taps "Remove this round"';
    await tap(remove, /saved=round-removed/);
    const saved = page.locator('#saved');
    const said = (await saved.count()) === 1 ? ((await saved.textContent()) ?? '') : '';
    note(
      'the removal is saved, and said',
      said.includes('the round was removed'),
      said || ((await page.locator('[data-notice=problem]').allTextContents()).join(' ') ?? ''),
    );
    note('and said where the phone is looking', await onScreen(saved));
    note('the round is gone from the grid', (await round.count()) === 0);
    note(
      'nobody else sees it yet: the public schedule still shows the round until publishing',
      (await publicSchedule()).includes(publicName),
    );
    await accessible('the round removed from the draft');

    at = 'the owner publishes the removed round';
    const publishing = await page
      .locator('section', { has: page.locator('#publish-heading') })
      .innerText();
    note(
      'the publish summary counts the round',
      publishing.includes('Rounds removed: 1.'),
      publishing.slice(0, 300),
    );
    await tap(page.getByRole('button', { name: 'Publish this schedule' }), /done=published/);
    note('the round is gone after publishing', (await round.count()) === 0);
    const words = await page.locator('main').innerText();
    note('and nothing on the page refuses', !words.includes('cannot be removed'), '');

    at = 'a visitor reads the public schedule';
    const after = await publicSchedule();
    note(
      `the public schedule does not show ${publicName}`,
      !after.includes(publicName),
      after.slice(0, 300),
    );
    const asked = await publicSchedule(`?round=${number}`);
    note(
      `nor does asking for ${publicName} by its address`,
      !asked.includes(publicName),
      asked.slice(0, 300),
    );

    // In one draft: the next round's games and the round itself removed, then a game put
    // back from its "Removed" answer, reached again by a reload: it comes back with no
    // round, and says so before and after the tap (S-60).
    at = 'the owner removes the games of the round that is now last, and the round';
    const next = page.locator('section[data-round]').last();
    const nextId = await next.getAttribute('data-round');
    const nextHeading = ((await next.locator('h2').textContent()) ?? '').trim();
    const nextLabel = nextHeading.replace(/^Round \d+: /, '');
    if (nextId === null) throw new Error('no round left');
    const nextRound = page.locator(`section[data-round="${nextId}"]`);
    const nextGames = nextRound.locator('li[data-game]', {
      has: page.locator('summary', { hasText: 'Edit this game' }),
    });
    let answer = '';
    let putBackName = '';
    while ((await nextGames.count()) > 0) {
      const game = nextGames.first();
      putBackName = ((await game.locator('.admin-slot-line strong').textContent()) ?? '').trim();
      await game.locator('summary', { hasText: 'Edit this game' }).click();
      await tap(
        game.getByRole('button', { name: 'Remove game' }),
        /\/admin\/schedule(\?season=[\w-]+)?#(saved|game-[\w-]+)$/,
      );
      answer = page.url();
    }
    await nextRound.locator('summary', { hasText: 'Change or remove this round' }).click();
    await tap(nextRound.getByRole('button', { name: 'Remove this round' }), /saved=round-removed/);

    at = 'the owner finds the removed game under "Games with no round" and puts it back';
    // The old answer's address says nothing old (step 2.185); the game itself stays in sight,
    // struck through, where "Put it back" will bring it, and says so before the tap (S-60).
    await page.goto(answer);
    note(
      'the old "Removed" address says nothing old',
      (await page.locator('#saved').count()) === 0,
    );
    const looseSection = page.locator('section', {
      has: page.getByRole('heading', { name: 'Games with no round' }),
    });
    const struck = looseSection.locator('li[data-removed-game]', { hasText: putBackName });
    const removedSaid = (await struck.count()) === 1 ? ((await struck.textContent()) ?? '') : '';
    note(
      'the removed game stays under "Games with no round", struck through, naming its round',
      removedSaid.includes(
        `Removed in this draft, from ${nextLabel}, which the draft removes too.`,
      ) && (await struck.locator('del').count()) === 2,
      removedSaid,
    );
    note(
      'and says the game comes back there, with no round',
      removedSaid.includes('comes back here, with no round') &&
        !removedSaid.includes('exactly as it was'),
      removedSaid,
    );
    await accessible('a removed game whose round was removed since');
    await tap(
      struck.getByRole('button', { name: 'Put it back' }),
      /\/admin\/schedule(\?season=[\w-]+)?#(saved|game-[\w-]+)$/,
    );
    const backSaid = (await page.locator('#saved').textContent()) ?? '';
    note(
      'the game is put back, and said to be under "Games with no round"',
      backSaid.includes('under "Games with no round"') &&
        backSaid.includes(`${nextLabel} was removed from the draft`),
      backSaid,
    );
    const loose = page.locator('section', {
      has: page.getByRole('heading', { name: 'Games with no round' }),
    });
    const looseText = await loose.innerText();
    note(
      'the game is under "Games with no round"',
      putBackName !== '' && looseText.includes(putBackName),
      `${putBackName} / ${looseText.slice(0, 200)}`,
    );
    note('the round stays removed', (await nextRound.count()) === 0);

    at = 'the owner publishes, and a visitor reads the public schedule';
    await tap(page.getByRole('button', { name: 'Publish this schedule' }), /done=published/);
    const publicAfter = await publicSchedule();
    const otherGames = publicAfter.slice(publicAfter.indexOf('Other games'));
    note(
      'the public schedule lists the game under "Other games"',
      publicAfter.includes('Other games') &&
        putBackName.split(' at ').every((team) => otherGames.includes(team)),
      publicAfter.slice(-400),
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
  console.error(`Round bin browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Round bin browser test passed: ${checked.length} checks in a real browser.`);
