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
      await tap(game.getByRole('button', { name: 'Remove game' }), /saved=game-removed/);
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
      before.includes('remove 2'),
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
