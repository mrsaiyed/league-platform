// Step 2.161: removing can be undone, and a team in the bin does not trap its players, in a
// real browser at phone width (390), on the web app's made-up stand-in (APP_ENV=test).
// Nothing leaves this computer; every team, player and game is made up. Scripts are off, so
// every form is a plain post. Builds the app first unless given --no-build; --dev runs
// `next dev` instead.
//
// The made-up owner signs in as the other browser tests do (the stand-in's session cookie)
// and starts at the admin's home (/north-valley/admin, typed: no page links to it yet, as
// tests/browser/one-world-test.mjs says). From there only taps. On the Falcons' page a
// leaving date of next year is refused in a sentence beside its field, with the date kept;
// the wrong player is marked as left and put back, with no "left" line remaining and every
// one of their game lines still on the public team page. A new team with two players says
// "2 people" before it is moved to the bin, and one of them is then taken off the league
// list. In the schedule, a game removed from the draft by mistake is back in one tap,
// exactly as it was, and the public schedule never changed. No page visited promises a way
// back that no screen offers.
import {
  answered,
  saysNothingOf,
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
const nextYear = `${new Date().getFullYear() + 1}-06-01`;
// Two days ago by this computer's clock: before the league's today in any time zone.
const lately = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
const player = 'Marcus Oyelaran';
const wrens = { team: 'Wrens', people: ['Robin Wrenly', 'Sparrow Wrenly'] };
/** Words that would promise a way back from the bin, which no screen offers yet. */
const promises = /can be brought back|can be restored|restore it|bring it back from/i;
// The one way back a screen does offer (step 2.77): a published game removed in the draft
// goes to the bin when the draft is published, and the bin's "Bring it back" restores it.
// This test checks that at its end: it publishes such a removal and finds the button.
const offered = ['After you publish, it is moved to the bin, and can be brought back from there.'];
let promisedFromBin = false;

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
    const visitor = await browser.newContext({ javaScriptEnabled: false, viewport: screen });
    const publicPage = await visitor.newPage();
    publicPage.setDefaultTimeout(dev ? 120_000 : 60_000);
    const publicText = async (path) => {
      await publicPage.goto(`${origin}/north-valley${path}`);
      return publicPage.locator('main').innerText();
    };
    const promisesNothing = async (label) => {
      let text = await page.locator('main').innerText();
      for (const sentence of offered) {
        if (text.includes(sentence)) promisedFromBin = true;
        text = text.split(sentence).join('');
      }
      const found = text.match(promises);
      note(`no way back promised that no screen offers: ${label}`, found === null, found?.[0]);
    };
    const accessible = async (label) => {
      const problems = await accessibilityProblems(page);
      note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
      const wide = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      );
      note(`no sideways scrolling at phone width: ${label}`, wide);
      await promisesNothing(label);
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
    const adminLink = (name) =>
      page.locator('nav').getByRole('link', { name, exact: true }).first();
    const openTeam = async (name) => {
      // On a phone the admin's areas are behind its own menu button (step 2.103).
      await openStaffMenu(page);
      await tap(adminLink('Teams'), /\/admin\/teams$/);
      await tap(page.locator('main').getByRole('link', { name, exact: true }), /\/admin\/teams\//);
    };
    const count = (text, words) => text.split(words).length - 1;

    at = 'the owner opens the admin and the Falcons';
    await page.goto(`${origin}/north-valley`);
    await page.goto(`${origin}/north-valley/admin`);
    const linesBefore = count(await publicText('/teams/falcons'), player);
    note('the player has game lines on the public team page', linesBefore >= 1, `${linesBefore}`);
    await openTeam('Falcons');
    const line = page.locator('main ol > li', { hasText: player });
    note('the player is on the roster', (await line.count()) === 1);

    at = 'a leaving date of next year is refused';
    await line.locator('input[name=leftOn]').fill(nextYear);
    await tap(line.getByRole('button', { name: 'Mark as left' }), { said: 'after today' });
    const refusal = line.locator('[data-left-on-problem]');
    const said = (await refusal.count()) === 1 ? ((await refusal.textContent()) ?? '') : '';
    note('the refusal is a sentence beside the field', said.includes('after today'), said);
    note('the refusal is on the screen where the phone is looking', await onScreen(refusal));
    note(
      'the date typed is kept in the field',
      (await line.locator('input[name=leftOn]').inputValue()) === nextYear,
    );
    note(
      'the refusal is not said again at the top',
      (await page.locator('main [role=alert]').count()) === 1,
    );
    note(
      'nobody was marked as left',
      (await page.locator('[data-left-entry]', { hasText: player }).count()) === 0,
    );
    await accessible('a leaving date refused');

    at = 'the wrong player is marked as left';
    await line.locator('input[name=leftOn]').fill(lately);
    await tap(line.getByRole('button', { name: 'Mark as left' }), {
      said: `${player} was marked as having left Falcons.`,
    });
    const leftLine = page.locator('[data-left-entry]', { hasText: player });
    note('a "left" line is shown for the player', (await leftLine.count()) === 1);
    const back = leftLine.getByRole('button', {
      name: 'Put back on the roster (marked by mistake)',
    });
    note('the "left" line has its put-back button', (await back.count()) === 1);
    const leftSaid = leftLine.locator('[data-said-on]');
    note(
      'the "left" line names who left and which team',
      (await leftSaid.count()) === 1 &&
        (await leftSaid.innerText()) === `${player} was marked as having left Falcons.`,
    );
    const whileLeft = count(await publicText('/teams/falcons'), player);
    note('their game lines stay while they are marked as left (R-17)', whileLeft >= 1);
    await accessible('a player marked as left');
    await page.reload();
    note('a reload does not say it again', await saysNothingOf(page, 'was marked as having left'));

    at = 'the player is put back';
    await tap(back, { said: `${player} is back on the roster.` });
    note(
      'no "left" line remains',
      (await page.locator('[data-left-entry]', { hasText: player }).count()) === 0,
    );
    note('the player is on the roster again', (await line.count()) === 1);
    const backSaid = line.locator('[data-said-on]');
    const note1 = (await backSaid.count()) === 1 ? await backSaid.innerText() : '';
    note(
      'the player’s own row says they are back, by name',
      note1.startsWith(`${player} is back on the roster.`),
      note1,
    );
    note('said where the phone lands', await onScreen(backSaid));
    note(
      'every game line of the player is kept',
      count(await publicText('/teams/falcons'), player) === linesBefore,
    );
    await accessible('a player put back');

    await page.reload();
    note(
      'a reload does not say they are back again',
      await saysNothingOf(page, 'is back on the roster'),
    );
    await page.goBack();
    note('nor does Back', await saysNothingOf(page, 'is back on the roster'));
    await page.goForward();
    // An address with the old answer's words in it says nothing (step 2.155 part 6).
    const entryId = ((await line.getAttribute('id')) ?? '').replace('entry-', '');
    const teamPath = new URL(page.url()).pathname;
    await page.goto(
      `${origin}${teamPath}?done=left&entry=${entryId}&problem=teams.mark_left.already-left`,
    );
    note(
      'an address with the old answer words in it says nothing',
      (await saysNothingOf(page, 'was marked as having left')) &&
        (await page.locator('main [role=alert]').count()) === 0,
    );

    at = 'a team with two players is made';
    await openStaffMenu(page);
    await tap(adminLink('Teams'), /\/admin\/teams$/);
    await page.locator('input[name=name]').fill(wrens.team);
    await tap(
      page.getByRole('button', { name: 'Add team' }),
      /\/admin\/teams\/[0-9a-f-]{36}(#add-team)?$/,
    );
    // The save is proved by the page itself: the new team's page says so (2.155).
    await page
      .getByRole('status')
      .filter({ hasText: `Saved: ${wrens.team} was added to the season.` })
      .waitFor({ timeout: 10_000 });
    for (const name of wrens.people) {
      const [first, last] = name.split(' ');
      const form = page.locator('form', { has: page.locator('input[name=firstName]') });
      await form.locator('input[name=firstName]').fill(first);
      await form.locator('input[name=lastName]').fill(last);
      await form.getByRole('button', { name: 'Add the person and put them on the roster' }).click();
      await page
        .locator('[data-said-on] [role=status]', {
          hasText: `Saved: ${first} ${last} was added to`,
        })
        .waitFor({ timeout: 10_000 });
    }
    const listed = (name) =>
      page
        .locator('section', { has: page.getByRole('heading', { name: 'The league list' }) })
        .locator('li', { hasText: name });
    const removeFromList = async (name, url) => {
      const item = listed(name);
      await item.locator('input[name=confirm]').check();
      await tap(item.getByRole('button', { name: 'Remove from the league list' }), url);
    };
    await removeFromList(wrens.people[0], { said: 'That person is still on a roster.' });
    note(
      'a player of a team still there is not taken off the list',
      (await listed(wrens.people[0]).count()) === 1,
    );

    at = 'the team is moved to the bin';
    const bin = page.locator('section', {
      has: page.getByRole('heading', { name: 'Remove this team' }),
    });
    const binText = await bin.innerText();
    note(
      'the bin says how many people are on the roster before it is confirmed',
      binText.includes('2 people are on its roster now.'),
      binText,
    );
    note(
      'the bin says it is kept for 30 days, and promises no screen to bring it back',
      binText.includes('It is kept for 30 days.') && !/not ready|bring it back/i.test(binText),
    );
    note(
      'moving to the bin is a destructive button',
      (await bin
        .getByRole('button', { name: 'Move the team to the bin' })
        .getAttribute('data-kind')) === 'danger',
    );
    await accessible('a team before it is moved to the bin');
    await bin.locator('input[name=confirm]').check();
    await tap(bin.getByRole('button', { name: 'Move the team to the bin' }), {
      said: 'Moved to the bin: the team is kept there for 30 days.',
    });
    const removed = await page.locator('main [role=status]').first().innerText();
    note(
      'removing the team says it is in the bin, with the way to bring it back (step 2.77)',
      removed.startsWith('Moved to the bin: the team is kept there for 30 days.') &&
        (await page
          .locator('main [role=status]')
          .first()
          .getByRole('link', { name: 'Bring it back' })
          .count()) === 1,
      removed,
    );
    note(
      'the team is gone from the list',
      (await page.locator('main').getByRole('link', { name: wrens.team, exact: true }).count()) ===
        0,
    );
    await accessible('the teams list after a team was removed');

    at = 'one of its players is taken off the league list';
    await tap(
      page.locator('main').getByRole('link', { name: 'Falcons', exact: true }),
      /\/admin\/teams\//,
    );
    await removeFromList(wrens.people[0], {
      said: 'Moved to the bin: taken off the league list',
    });
    note(
      'the player of the binned team is off the league list',
      (await listed(wrens.people[0]).count()) === 0,
    );
    note('the other one is still in it', (await listed(wrens.people[1]).count()) === 1);
    const gone = await page.locator('main [role=status]').first().innerText();
    note(
      'taking someone off the list promises only what is true',
      gone.includes('kept in the bin for 30 days.'),
      gone,
    );
    await accessible('a person taken off the league list');

    at = 'a game is removed from the draft by mistake';
    const publicBefore = await publicText('/schedule');
    await openStaffMenu(page);
    await tap(adminLink('Schedule'), /\/admin\/schedule$/);
    const summaryOf = async () => {
      const panel = page.locator('section', {
        has: page.getByRole('heading', { name: 'Publish' }),
      });
      return (await panel.count()) === 0 ? '' : panel.locator('p').first().innerText();
    };
    const summaryBefore = await summaryOf();
    const editable = page.locator('li[data-game]', {
      has: page.locator('summary', { hasText: 'Edit this game' }),
    });
    const game = editable.first();
    const gameId = await game.getAttribute('data-game');
    const gameText = (await game.locator('p').first().innerText()).trim();
    const name = (await game.locator('strong').first().innerText()).trim();
    await game.locator('summary', { hasText: 'Edit this game' }).click();
    const remove = game.getByRole('button', { name: 'Remove game' });
    note(
      '"Remove game" is the outlined destructive button, "Save game" the main one',
      (await remove.getAttribute('data-kind')) === 'danger' &&
        (await game.getByRole('button', { name: 'Save game' }).getAttribute('data-kind')) ===
          'main',
    );
    await tap(remove, /\/admin\/schedule(\?season=[\w-]+)?#(saved|game-[\w-]+)$/);
    const removedAddress = page.url();
    const answer = page.locator('#saved');
    const answerText = (await answer.count()) === 1 ? await answer.innerText() : '';
    note(
      'the answer names the game and its round',
      new RegExp(`^Removed: ${name}, (Round|Week|[A-Z])`).test(answerText),
      answerText,
    );
    note('the answer is where the phone is looking', await onScreen(answer));
    note(
      'the game is out of the draft',
      (await page.locator(`li[data-game="${gameId}"]`).count()) === 0,
    );
    note('nothing public changed', (await publicText('/schedule')) === publicBefore);
    const putBack = answer.getByRole('button', { name: 'Put it back' });
    note('"Put it back" is offered', (await putBack.count()) === 1);
    await accessible('a game removed from the draft');

    at = 'the game is put back in one tap';
    await tap(putBack, /\/admin\/schedule(\?season=[\w-]+)?#(saved|game-[\w-]+)$/);
    const again = page.locator(`li[data-game="${gameId}"]`);
    note('the game is back', (await again.count()) === 1);
    note(
      'exactly as it was: round, date, time and court',
      (await again.locator('p').first().innerText()).trim() === gameText,
      await again.locator('p').first().innerText(),
    );
    const summaryAfter = await summaryOf();
    note(
      'publishing would change nothing for it',
      summaryBefore === ''
        ? // Since step 2.185 the box says it in one sentence, not a row of zeros.
          summaryAfter ===
            'The draft is the same as the published schedule, so there is nothing to publish.'
        : summaryAfter === summaryBefore,
      summaryAfter,
    );
    const count1 = page.locator('[data-draft-count]');
    note(
      'the top line counts what publishing would change, as the publish box does',
      summaryBefore !== '' ||
        ((await count1.getAttribute('data-draft-count')) === '0' &&
          (await count1.innerText()).includes('The draft is the same as the published schedule.')),
      await count1.innerText(),
    );
    note(
      'nothing public changed after putting it back',
      (await publicText('/schedule')) === publicBefore,
    );
    await accessible('a game put back');

    at = 'the old address of the removal is opened again';
    // The answer never rode in the address (step 2.185): it says nothing old, the game is
    // in its place, and nothing offers to put it back. The address is the one the put back
    // answered at, so going to it is only a jump to its #saved: it is loaded again.
    await page.goto(removedAddress);
    await page.reload();
    const reloaded = page.locator('#saved');
    const reloadedText = (await reloaded.count()) === 1 ? await reloaded.innerText() : '';
    note(
      'an old address says nothing old, and offers nothing',
      reloadedText === '' &&
        (await page.locator(`li[data-game="${gameId}"]`).count()) === 1 &&
        (await page.getByRole('button', { name: 'Put it back' }).count()) === 0,
      reloadedText,
    );

    at = 'a player whose number is worn now is put back without it (R-32)';
    await page.goto(`${origin}/harbor-city`);
    await page.goto(`${origin}/harbor-city/admin`);
    await openTeam('Rockets');
    const wearer = page.locator('main ol > li', { hasText: 'Jay Whitaker' });
    await wearer.locator('input[name=jerseyNumber]').fill('1');
    await tap(wearer.getByRole('button', { name: 'Save number and role' }), /#entry-/);
    await wearer
      .locator('[role=status]', { hasText: 'Saved: the number and role of Jay Whitaker.' })
      .waitFor({ timeout: 10_000 });
    const formerly = page.locator('[data-left-entry]', { hasText: 'Tess Moreno' });
    await tap(
      formerly.getByRole('button', { name: 'Put back on the roster (marked by mistake)' }),
      { said: 'Tess Moreno is back on the roster with no number' },
    );
    const tess = page.locator('main ol > li', { hasText: 'Tess Moreno' });
    const noNumber = tess.locator('[data-said-on]');
    const noNumberText = (await noNumber.count()) === 1 ? await noNumber.innerText() : '';
    note(
      'back with no number, the row naming who wears it',
      noNumberText ===
        'Tess Moreno is back on the roster with no number: 1 is now worn by Jay Whitaker. Give them a number.',
      noNumberText,
    );
    note('said on her row where the phone lands', await onScreen(noNumber));
    note(
      'and not said a second time at the top',
      (await page.locator('main [role=status]').count()) === 1,
    );
    note(
      'her number field is empty, ready for a new one',
      (await tess.locator('input[name=jerseyNumber]').inputValue()) === '',
    );
    note(
      'no "left" line remains for her',
      (await page.locator('[data-left-entry]', { hasText: 'Tess Moreno' }).count()) === 0,
    );
    await accessible('a player put back without a number');

    at = 'the way back the removal promised is offered by the bin';
    note('the removal said a published game goes to the bin when published', promisedFromBin);
    await openStaffMenu(page);
    await tap(adminLink('Schedule'), /\/admin\/schedule$/);
    const toBin = page
      .locator('li[data-game]', { has: page.locator('summary', { hasText: 'Edit this game' }) })
      .first();
    const binnedId = await toBin.getAttribute('data-game');
    await toBin.locator('summary', { hasText: 'Edit this game' }).click();
    await tap(
      toBin.getByRole('button', { name: 'Remove game' }),
      /\/admin\/schedule(\?season=[\w-]+)?#(saved|game-[\w-]+)$/,
    );
    await tap(page.getByRole('button', { name: 'Publish this schedule' }), /done=published/);
    await tap(page.getByRole('link', { name: 'Removed games' }), /\/admin\/settings\/bin/);
    note(
      'the bin offers "Bring it back" for the published removal, as the schedule said',
      (await page
        .locator(`li[id="bin-${binnedId}"]`)
        .getByRole('button', { name: 'Bring it back' })
        .count()) === 1,
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
  console.error(`Undo-removing browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Undo-removing browser test passed: ${checked.length} checks in a real browser.`);
