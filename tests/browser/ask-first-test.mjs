// Step 2.158: postponing, cancelling and forfeiting ask first, and a cancelled game can be
// put back (the using-it audit's H9 and M32), in a real browser at phone width, against
// the web app on its made-up stand-in (APP_ENV=test). Nothing leaves this computer; every
// team, game and person is made up. Builds the app first unless given --no-build (the
// browser chain builds it once in web-exit-test.mjs).
//
// A scheduler on game day starts at the admin's home and reaches the games by tapping, as
// the other browser tests do; a game's own page, which no link leads to for a postponed
// game (M32), is opened by its address, as the audit did.
//
// - None of "Postpone", "Cancel the game" and "Record forfeit" changes a game in one tap:
//   each asks, naming the game; "No" leaves it as it was; only "Yes" changes it.
// - "Team that forfeits" starts empty: the browser will not send it so, and the server
//   refuses it beside the choice when it is sent anyway; the question names the team.
// - A postponed game's card shows the way to its new date (the list of games waiting for
//   one, which holds it), and the schedule grid's sentence for it says where it waits,
//   never "It is left as it is here." alone.
// - A score sent for a postponed game (boxes opened before it was postponed elsewhere) is
//   refused in a plain sentence; its own page offers no score entry.
// - A cancelled game is put back with a reason (not without one): a scheduled game again,
//   on the admin's list and on the public schedule.
// - With scripts off the question is a step of its own, and cancelling and putting back
//   work the same.
// - Accessibility checks (T-186), no sideways scrolling at phone width (A-2), and the
//   question's buttons at least 44 high.
//
// The activity log's line for a game put back (who and why) has no screen yet: it is
// proved by apps/web/src/features/games-area/run-game-action.test.ts on the same world.
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  openStaffMenu,
  startNext,
  waitFor,
  worldAtNoon,
} from './web-browser-kit.mjs';

const failures = [];
const checked = [];
const note = (label, ok, detail = '') => {
  checked.push(label);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};
const step = async (name, run) => {
  try {
    await run();
  } catch (error) {
    failures.push(`${name}: ${String(error?.message ?? error).split('\n')[0]}`);
  }
};

// Games of the first made-up league's day and week (apps/web/src/server/stand-in-games.ts).
const tigersAtLions = '01900000-0000-7000-8000-006a00000001'; // final score only, today
const lionsAtHawks = '01900000-0000-7000-8000-006a00000003'; // tomorrow, no plays
const bearsAtTigers = '01900000-0000-7000-8000-006a00000004'; // in two days
const phone = { width: 390, height: 844 };

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}

let server;
let browser;
const origin = `http://localhost:${await freePort()}`;

if (built) {
  server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
    LOCAL_NOW: worldAtNoon(),
  });
  await step('starting the server and the browser', async () => {
    await waitFor(`${origin}/`, server);
    browser = await launch();
  });
}

async function signedInAs(token, options = {}) {
  const context = await browser.newContext({ viewport: phone, ...options });
  await context.addCookies([{ name: 'srl_session', value: token, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { context, page };
}

/** A game on the games list (never its card in "Waiting for a new date"). */
const gameOn = (page, id) => page.locator(`li[id="game-${id}"]`);
/** A game on the games list by its two teams, away team first. */
const gameNamed = (page, away, home) =>
  page.locator('li.admin-game[id^="game-"]').filter({ hasText: away }).filter({ hasText: home });
const statusOf = (game) => game.locator('.ui-game-card').first().getAttribute('data-status');
const idOf = async (game) => ((await game.getAttribute('id')) ?? '').slice('game-'.length);

/** From the admin's home to an admin area, by tapping the admin's own menu. */
async function openArea(page, area, heading) {
  await page.goto(`${origin}/north-valley/admin`);
  await openStaffMenu(page);
  await Promise.all([
    page.waitForURL((url) => url.pathname === `/north-valley/admin/${area}`),
    page
      .getByRole('navigation', { name: 'Admin areas' })
      .locator(`a[href="/north-valley/admin/${area}"]`)
      .click(),
  ]);
  await page.getByRole('heading', { level: 1, name: heading }).waitFor();
}
const openGames = (page) => openArea(page, 'games', 'Games');

/** Opens "Forfeit, postpone or cancel" on a game and taps one of its buttons: it asks. */
async function tapToCallOff(game, button) {
  const panel = game.locator('details.admin-game-other');
  if ((await panel.getAttribute('open')) === null) await panel.locator('> summary').click();
  await game.getByRole('button', { name: button, exact: true }).click();
}
const questionOf = (game) => game.locator('[data-call-off-ask]');

async function accessible(page, label) {
  const problems = await accessibilityProblems(page);
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
  const [width, inner] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  note(`no sideways scrolling at phone width: ${label}`, width <= inner, `${width} > ${inner}`);
}

/** The question's two buttons are each at least 44 high. */
async function answersTallEnough(question, label) {
  const heights = await question
    .locator('button')
    .evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect().height));
  note(
    `the question's two answers are at least 44 high: ${label}`,
    heights.length === 2 && heights.every((h) => h >= 44),
    heights.join(', '),
  );
}

/** The words of a game's link on the public schedule, or '' when it is not there. */
async function publicLinkOf(page, id) {
  await page.goto(`${origin}/north-valley/schedule`);
  // The card's one link, whose words (hidden, for screen readers) say the game's state.
  const link = page.locator(`main a.ui-game-link[href*="/games/${id}"]`).first();
  if ((await link.count()) === 0) return '';
  return ((await link.getAttribute('aria-label')) ?? (await link.textContent()) ?? '').trim();
}

if (browser) {
  await step(
    'postponing asks first, and a postponed game shows the way to its new date',
    async () => {
      const { context, page } = await signedInAs('local-scheduler-token');
      try {
        await openGames(page);
        const game = gameNamed(page, 'Owls', 'Badgers');
        note('Owls at Badgers is scheduled to start with', (await statusOf(game)) === 'scheduled');
        await tapToCallOff(game, 'Postpone');
        await questionOf(game).waitFor();
        const asked = ((await questionOf(game).textContent()) ?? '').trim();
        note(
          'one tap on "Postpone" only asks, naming the game',
          asked.startsWith('Postpone Owls at Badgers? Everyone will see it as postponed.') &&
            (await statusOf(game)) === 'scheduled',
          asked,
        );
        await accessible(page, 'the question before postponing');
        await answersTallEnough(questionOf(game), 'postponing');
        await game.getByRole('button', { name: 'No, keep it on its date' }).click();
        await questionOf(game).waitFor({ state: 'detached' });
        note('"No" leaves the game as it was', (await statusOf(game)) === 'scheduled');
        await tapToCallOff(game, 'Postpone');
        await game.getByRole('button', { name: 'Yes, postpone it' }).click();
        const saved = game.getByRole('status');
        await saved.waitFor();
        note(
          '"Yes" postpones it, and "Saved" says where it waits',
          (await statusOf(game)) === 'postponed' &&
            ((await saved.textContent()) ?? '').includes(
              'Owls at Badgers is postponed. It waits for a new date under “Waiting for a new date”.',
            ),
          (await saved.textContent()) ?? '',
        );
        const id = await idOf(game);
        const way = game.getByRole('link', { name: 'See the games waiting for a new date' });
        note('its card shows the way to its new date', (await way.count()) === 1);
        await way.click();
        await page.waitForURL((url) => url.hash === '#to-reschedule');
        const waiting = page.locator(`#to-reschedule [data-waiting-game="${id}"]`);
        note(
          'the list of games waiting for a new date holds it, said as postponed',
          (await waiting.count()) === 1 &&
            (await waiting.locator('.ui-game-card').getAttribute('data-status')) === 'postponed',
        );
        note(
          'its card offers no score boxes and no box score',
          (await game.locator('[data-score-boxes]').count()) === 0 &&
            (await game.getByRole('link', { name: 'Box score' }).count()) === 0,
        );
        await accessible(page, 'a postponed game on the games list');

        // The schedule grid's sentence for it says where it gets its new date.
        await openArea(page, 'schedule', 'Schedule');
        const sentence = page.locator('[data-called-off="postponed"]').filter({
          has: page.locator('a[href$="#to-reschedule"]'),
        });
        const words = ((await sentence.first().textContent()) ?? '').trim();
        note(
          "the grid's sentence for a postponed game says where it waits for its new date",
          (await sentence.count()) >= 1 &&
            words.includes('It waits in Games, under “Waiting for a new date”') &&
            !words.includes('It is left as it is here.'),
          words,
        );
        note(
          'no sentence in the grid says only "It is left as it is here."',
          (await page.getByText('It is left as it is here.').count()) === 0,
        );

        // Its own page, which no link leads to (M32): no score entry.
        await page.goto(`${origin}/north-valley/admin/games/${id}`);
        await page.locator('main h1').waitFor();
        note(
          "a postponed game's own page offers no score entry, and says why",
          (await page.locator('main input, main button[type="submit"]').count()) === 0 &&
            (await page.getByText('This game is postponed, so it has no score yet.').count()) === 1,
        );
        await accessible(page, "a postponed game's own page");
      } finally {
        await context.close();
      }
    },
  );

  await step('a score sent for a game postponed since is refused in a plain sentence', async () => {
    const one = await signedInAs('local-scheduler-token');
    const two = await signedInAs('local-owner-token');
    try {
      // The scheduler types a score and is asked; meanwhile the owner postpones the game.
      await openGames(one.page);
      const game = gameOn(one.page, tigersAtLions);
      await game.locator('[data-score-boxes] > summary').click();
      await game.getByLabel('Score for Tigers').fill('50');
      await game.getByLabel('Score for Lions').fill('40');
      await game.getByRole('button', { name: 'Save final score' }).click();
      await game.locator('[data-question]').waitFor();
      await openGames(two.page);
      const there = gameOn(two.page, tigersAtLions);
      await tapToCallOff(there, 'Postpone');
      await there.getByRole('button', { name: 'Yes, postpone it' }).click();
      await there.getByRole('status').waitFor();
      await game.getByRole('button', { name: 'Yes, make it final' }).click();
      const refusal = game.getByRole('alert');
      await refusal.waitFor();
      const text = ((await refusal.textContent()) ?? '').trim();
      note(
        'a score for a postponed game is refused in a plain sentence',
        text ===
          'That game is postponed, so it cannot have a score yet. Enter its score once it is played on its new date.',
        text,
      );
      await openGames(two.page);
      note(
        'the postponed game has no score',
        (await statusOf(gameOn(two.page, tigersAtLions))) === 'postponed',
      );
    } finally {
      await one.context.close();
      await two.context.close();
    }
  });

  await step('a forfeit cannot be recorded without choosing the team, and asks first', async () => {
    const { context, page } = await signedInAs('local-scheduler-token');
    try {
      await openGames(page);
      const game = gameOn(page, bearsAtTigers);
      const panel = game.locator('details.admin-game-other');
      await panel.locator('> summary').click();
      const team = game.getByLabel('Team that forfeits');
      note('"Team that forfeits" starts empty', (await team.inputValue()) === '');
      // The browser will not send it so (the choice is required)...
      await game.getByRole('button', { name: 'Record forfeit', exact: true }).click();
      await page.waitForTimeout(500);
      note(
        'with no team chosen, "Record forfeit" asks nothing and records nothing',
        (await questionOf(game).count()) === 0 && (await statusOf(game)) === 'scheduled',
      );
      // ...and the server refuses it beside the choice when it is sent anyway.
      await team.evaluate((select) => select.removeAttribute('required'));
      await game.getByRole('button', { name: 'Record forfeit', exact: true }).click();
      const refusal = game.getByRole('alert');
      await refusal.waitFor();
      note(
        'sent with no team, it is refused beside the choice, which is marked',
        ((await refusal.textContent()) ?? '').trim() ===
          'Bears at Tigers: Choose the team that forfeits.' &&
          (await game.getByLabel('Team that forfeits').getAttribute('aria-invalid')) === 'true',
        (await refusal.textContent()) ?? '',
      );
      await accessible(page, 'a forfeit refused for want of a team');
      await game.getByLabel('Team that forfeits').selectOption({ label: 'Bears' });
      await game.getByRole('button', { name: 'Record forfeit', exact: true }).click();
      await questionOf(game).waitFor();
      const asked = ((await questionOf(game).textContent()) ?? '').trim();
      note(
        'a team chosen, one tap only asks, naming the team that forfeits and the winner',
        asked.startsWith('Record a forfeit by Bears? Tigers win Bears at Tigers by forfeit') &&
          (await statusOf(game)) === 'scheduled',
        asked,
      );
      await answersTallEnough(questionOf(game), 'forfeiting');
      await game.getByRole('button', { name: 'No, keep the game as it is' }).click();
      await questionOf(game).waitFor({ state: 'detached' });
      note('"No" records no forfeit', (await statusOf(game)) === 'scheduled');
    } finally {
      await context.close();
    }
  });

  await step('cancelling asks first, and a cancelled game is put back with a reason', async () => {
    const { context, page } = await signedInAs('local-scheduler-token');
    try {
      await openGames(page);
      const game = gameNamed(page, 'Herons', 'Falcons');
      const id = await idOf(game);
      const before = await publicLinkOf(page, id);
      await openGames(page);
      await tapToCallOff(game, 'Cancel the game');
      await questionOf(game).waitFor();
      const asked = ((await questionOf(game).textContent()) ?? '').trim();
      note(
        'one tap on "Cancel the game" only asks, naming the game',
        asked.startsWith('Cancel Herons at Falcons? Everyone will see it as cancelled') &&
          (await statusOf(game)) === 'scheduled',
        asked,
      );
      await accessible(page, 'the question before cancelling');
      await answersTallEnough(questionOf(game), 'cancelling');
      await game.getByRole('button', { name: 'Yes, cancel it' }).click();
      await game.getByRole('status').waitFor();
      note('"Yes" cancels it', (await statusOf(game)) === 'cancelled');
      const cancelled = await publicLinkOf(page, id);
      note(
        'the public schedule says it is cancelled',
        cancelled.endsWith(', cancelled'),
        `${before} / ${cancelled}`,
      );

      await openGames(page);
      const putBack = game.locator('details[data-action-form]');
      await putBack.locator('> summary').click();
      const why = putBack.getByLabel(/Why it is put back/);
      note('its reason starts empty', (await why.inputValue()) === '');
      await putBack.getByRole('button', { name: 'Put it back on the schedule' }).click();
      await page.waitForTimeout(500);
      note('with no reason it is not put back', (await statusOf(game)) === 'cancelled');
      await why.selectOption({ label: 'Cancelled by mistake' });
      await putBack.getByRole('button', { name: 'Put it back on the schedule' }).click();
      const saved = game.getByRole('status');
      await saved.waitFor();
      note(
        'put back with a reason, it is a scheduled game again, and "Saved" says so',
        (await statusOf(game)) === 'scheduled' &&
          ((await saved.textContent()) ?? '').includes('Herons at Falcons is back on the schedule'),
        (await saved.textContent()) ?? '',
      );
      await accessible(page, 'a cancelled game put back');
      const after = await publicLinkOf(page, id);
      note(
        'the public schedule shows it scheduled again, as before it was cancelled',
        after !== '' && after === before && !after.includes('cancelled'),
        `${before} / ${after}`,
      );
    } finally {
      await context.close();
    }
  });

  await step(
    'with scripts off, cancelling asks on a step of its own, and putting back works',
    async () => {
      const { context, page } = await signedInAs('local-scheduler-token', {
        javaScriptEnabled: false,
      });
      try {
        await openGames(page);
        const game = gameOn(page, lionsAtHawks);
        await tapToCallOff(game, 'Cancel the game');
        await questionOf(gameOn(page, lionsAtHawks)).waitFor();
        note(
          'with scripts off, the question is its own step and nothing is cancelled',
          (await statusOf(gameOn(page, lionsAtHawks))) === 'scheduled' &&
            ((await questionOf(gameOn(page, lionsAtHawks)).textContent()) ?? '').includes(
              'Cancel Lions at Hawks?',
            ),
        );
        await accessible(page, 'the question before cancelling, scripts off');
        await gameOn(page, lionsAtHawks).getByRole('button', { name: 'Yes, cancel it' }).click();
        await gameOn(page, lionsAtHawks).getByRole('status').waitFor();
        note(
          'with scripts off, "Yes" cancels it',
          (await statusOf(gameOn(page, lionsAtHawks))) === 'cancelled',
        );
        const putBack = gameOn(page, lionsAtHawks).locator('details[data-action-form]');
        await putBack.locator('> summary').click();
        await putBack
          .getByLabel(/Why it is put back/)
          .selectOption({ label: 'The wrong game was cancelled' });
        await putBack.getByRole('button', { name: 'Put it back on the schedule' }).click();
        await gameOn(page, lionsAtHawks).getByRole('status').waitFor();
        note(
          'with scripts off, it is put back',
          (await statusOf(gameOn(page, lionsAtHawks))) === 'scheduled',
        );
      } finally {
        await context.close();
      }
    },
  );
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Ask-first browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Ask-first browser test passed (${checked.length} checks).`);
