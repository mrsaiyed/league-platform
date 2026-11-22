// Step 2.158: postponing, cancelling and forfeiting ask first, and a game called off can be
// put back (the using-it audit's H9 and M32; S-51, S-75), in a real browser at phone width
// and at a laptop's, against the web app on its made-up stand-in (APP_ENV=test). Nothing
// leaves this computer; every team, game and person is made up. Builds the app first unless
// given --no-build (the browser chain builds it once in web-exit-test.mjs).
//
// A scheduler on game day starts at the admin's home and reaches the games by tapping, as
// the other browser tests do; a game's own page, which no link leads to for a postponed
// game (M32), is opened by its address, as the audit did.
//
// - A double tap never reaches "Yes" (the review's High finding): two taps on ONE spot,
//   150 and 600 ms apart, on "Postpone", "Cancel the game", "Record forfeit" (a team
//   chosen), "Put it back" (a postponed game, a reason chosen) and "Put it back on the
//   schedule" (a cancelled game), at 390 by touch and at 1280 by mouse, also on a game whose
//   line-ups a scorer's table set, and with scripts off: none changes the game but the one
//   change a put-back makes; the spot touched holds "No" (or nothing), never "Yes".
// - None of the three changes a game in one tap: each asks, naming the game; "No" leaves it
//   as it was; only "Yes" changes it.
// - "Team that forfeits" starts empty, away team first: the browser will not send it so,
//   and the server refuses it beside the choice when it is sent anyway; the question names
//   the team, the winner and the league's forfeit score; "Saved" says who forfeited.
// - A postponed game's card shows the way to its new date (the list of games waiting for
//   one, which holds it), and the schedule grid's sentence for it says where it waits,
//   never "It is left as it is here." alone. It may be forfeited, cancelled, or put back on
//   its date; a postponed game cancelled and put back is postponed again (S-75).
// - A score sent for a postponed game (boxes opened before it was postponed elsewhere) is
//   refused in a plain sentence; its own page offers no score entry and is not titled "Box
//   score", and offers the way to its new date and putting it back on its date.
// - A cancelled game is put back with a reason (not without one): a scheduled game again,
//   on the admin's list and on the public schedule.
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
  leagueDayWords,
  openStaffMenu,
  startNext,
  trackedPlayer,
  trackerTablet,
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
const laptop = { width: 1280, height: 800 };
/** Longer than the server takes a "Yes" to be read in (call-off-step.ts, askRestMs). */
const readTheQuestion = 1000;
/** When the made-up world's clock starts: noon on the league's today, or `--now=`. */
const worldNow = worldAtNoon();

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
    LOCAL_NOW: worldNow,
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

/** A game's panel by its button's words ("Forfeit, postpone or cancel", "Put it back on its date"). */
const panelOf = (game, summary) =>
  game.locator('details[data-call-off]').filter({
    has: game.page().locator('summary', { hasText: summary }),
  });

/** Opens a panel, if it is shut. */
async function openPanel(panel) {
  if ((await panel.getAttribute('open')) === null) await panel.locator('> summary').click();
}

/** Opens "Forfeit, postpone or cancel" (or "… instead") and taps one of its buttons: it asks. */
async function tapToCallOff(game, button) {
  const panel = game.locator('details[data-call-off]').last();
  await openPanel(panel);
  await game.getByRole('button', { name: button, exact: true }).click();
}
const questionOf = (game) => game.locator('[data-call-off-ask]');

/** The question's "Yes", once it has been read (the server takes a sooner one as a double tap). */
async function sayYes(game, name) {
  await questionOf(game).waitFor();
  await game.page().waitForTimeout(readTheQuestion);
  await game.getByRole('button', { name }).click();
}

async function accessible(page, label) {
  const problems = await accessibilityProblems(page);
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
  const [width, inner] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  note(`no sideways scrolling: ${label}`, width <= inner, `${width} > ${inner}`);
}

/** The question's two buttons are each at least 44 high. */
async function answersTallEnough(game, label) {
  const heights = await game
    .locator('[data-call-off-act] button:not([disabled]), [data-call-off-ask] button')
    .evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect().height));
  note(
    `the question's answers are at least 44 high: ${label}`,
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

/** The middle of `target`, on the screen, and a tap there by touch or by mouse. */
async function spotOf(page, target, touch) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (box === null) throw new Error('the button to tap is not on the screen');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  return {
    tap: () => (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y)),
    /** The words of the button, summary or link at that spot now ('' for none). */
    holds: () =>
      page.evaluate(
        ([px, py]) => {
          const at = document.elementFromPoint(px, py)?.closest('button, summary, a');
          return (at?.textContent ?? '').trim();
        },
        [x, y],
      ),
  };
}

/** Two taps on ONE spot, `gap` ms apart; then a moment for any answer to arrive. */
async function doubleTap(page, target, gap, touch) {
  const spot = await spotOf(page, target, touch);
  await spot.tap();
  await page.waitForTimeout(gap);
  await spot.tap();
  await page.waitForTimeout(1500);
  await page.waitForLoadState('load');
  return spot.holds();
}

/** Where the finger was, and where "No" and "Yes" stand once the question is drawn. */
const places = [];

/** One tap: once the question is drawn, what stands where the finger was. */
async function spotAfterOneTap(page, game, target, touch, label) {
  const before = await target.boundingBox();
  const spot = await spotOf(page, target, touch);
  await spot.tap();
  await questionOf(game).waitFor();
  const held = await spot.holds();
  const no = await game.getByRole('button', { name: /^No, / }).boundingBox();
  const yes = await questionOf(game).getByRole('button').boundingBox();
  const at = (box) => (box === null ? '-' : `${Math.round(box.x)},${Math.round(box.y)}`);
  places.push(`${label}: touched ${at(before)}; No ${at(no)}; Yes ${at(yes)}`);
  return held;
}

if (browser) {
  // The game whose line-ups a scorer's table has set, still scheduled (step 2.158).
  await step('a scorekeeper’s tablet sets the line-ups of Lions at Hawks', async () => {
    const send = await trackerTablet(
      origin,
      lionsAtHawks,
      'local-scorekeeper-token',
      'ask-first-tablet',
    );
    const five = (team) => [1, 2, 3, 4, 5].map((n) => trackedPlayer(team, n));
    await send(
      { type: 'lineup', side: 'home', playerIds: five(3) },
      { type: 'lineup', side: 'away', playerIds: five(1) },
    );
  });

  for (const [width, viewport, touch] of [
    ['390', phone, true],
    ['1280', laptop, false],
  ]) {
    await step(`at ${width}, a double tap on one spot never reaches "Yes"`, async () => {
      const { context, page } = await signedInAs('local-scheduler-token', {
        viewport,
        hasTouch: touch,
      });
      try {
        for (const [away, home, button, lineups] of [
          ['Owls', 'Badgers', 'Postpone', false],
          ['Owls', 'Badgers', 'Cancel the game', false],
          ['Owls', 'Badgers', 'Record forfeit', false],
          ['Lions', 'Hawks', 'Postpone', true],
          ['Lions', 'Hawks', 'Cancel the game', true],
        ]) {
          const what = `"${button}" (${away} at ${home}${lineups ? ', line-ups set' : ''})`;
          const ready = async () => {
            await openGames(page);
            const game = gameNamed(page, away, home);
            await openPanel(game.locator('details[data-call-off]').last());
            if (button === 'Record forfeit') {
              await game.getByLabel('Team that forfeits').selectOption({ label: home });
            }
            return game;
          };
          // One tap: the question is drawn, and the spot just touched holds its "No".
          const game = await ready();
          const button1 = game.getByRole('button', { name: button, exact: true });
          const held = await spotAfterOneTap(page, game, button1, touch, `${width} ${what}`);
          note(
            `${width}: after one tap on ${what}, the spot touched holds "No", not "Yes"`,
            held.startsWith('No'),
            held,
          );
          if (lineups) {
            note(
              `${width}: the question says the line-ups set are kept`,
              ((await questionOf(game).textContent()) ?? '').includes(
                'The players already set for it at the scorer’s table are kept.',
              ),
            );
          }
          if (button === 'Postpone' && !lineups) {
            await answersTallEnough(game, `postponing, ${width}`);
            await accessible(page, `the question before postponing, ${width}`);
          }
          // Two taps on that one spot, 150 and 600 ms apart: the game is as it was.
          for (const gap of [150, 600]) {
            const again = await ready();
            const under = await doubleTap(
              page,
              again.getByRole('button', { name: button, exact: true }),
              gap,
              touch,
            );
            note(
              `${width}, ${gap} ms: two taps on one spot of ${what} change nothing`,
              (await statusOf(gameNamed(page, away, home))) === 'scheduled' &&
                !under.startsWith('Yes'),
              `${await statusOf(gameNamed(page, away, home))}, the spot holds: ${under}`,
            );
          }
        }
      } finally {
        await context.close();
      }
    });
  }

  await step('with scripts off, a double tap on one spot only asks', async () => {
    const { context, page } = await signedInAs('local-scheduler-token', {
      javaScriptEnabled: false,
    });
    try {
      for (const gap of [150, 600]) {
        for (const button of ['Postpone', 'Cancel the game']) {
          await openGames(page);
          const game = gameNamed(page, 'Owls', 'Badgers');
          await openPanel(game.locator('details[data-call-off]').last());
          const under = await doubleTap(
            page,
            game.getByRole('button', { name: button, exact: true }),
            gap,
            false,
          );
          const now = gameNamed(page, 'Owls', 'Badgers');
          note(
            `scripts off, ${gap} ms: two taps on "${button}" change nothing`,
            (await statusOf(now)) === 'scheduled',
            `${await statusOf(now)} (under the spot: ${under})`,
          );
        }
      }
      // And a "Yes" sent straight after the question is drawn only asks again.
      await openGames(page);
      const game = gameNamed(page, 'Owls', 'Badgers');
      await tapToCallOff(game, 'Postpone');
      await questionOf(gameNamed(page, 'Owls', 'Badgers')).waitFor();
      await gameNamed(page, 'Owls', 'Badgers')
        .getByRole('button', { name: 'Yes, postpone it' })
        .click();
      await page.waitForLoadState('load');
      note(
        'scripts off: a "Yes" sent at once is taken as a second tap, and asks again',
        (await statusOf(gameNamed(page, 'Owls', 'Badgers'))) === 'scheduled' &&
          (await questionOf(gameNamed(page, 'Owls', 'Badgers')).count()) === 1,
      );
    } finally {
      await context.close();
    }
  });

  await step(
    'postponing asks first, and a postponed game shows the way to its new date',
    async () => {
      const { context, page } = await signedInAs('local-scheduler-token');
      try {
        await openGames(page);
        const game = gameNamed(page, 'Owls', 'Badgers');
        await tapToCallOff(game, 'Postpone');
        await questionOf(game).waitFor();
        const asked = ((await questionOf(game).textContent()) ?? '').trim();
        note(
          'one tap on "Postpone" only asks, naming the game',
          asked.startsWith('Postpone Owls at Badgers? Everyone will see it as postponed.') &&
            (await statusOf(game)) === 'scheduled',
          asked,
        );
        await game.getByRole('button', { name: 'No, keep it on its date' }).click();
        await questionOf(game).waitFor({ state: 'detached' });
        note('"No" leaves the game as it was', (await statusOf(game)) === 'scheduled');
        await tapToCallOff(game, 'Postpone');
        await sayYes(game, 'Yes, postpone it');
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
        note(
          'a postponed game offers a forfeit or cancelling instead, and putting it back on its date',
          (await game.locator('summary', { hasText: 'Forfeit or cancel instead' }).count()) === 1 &&
            (await game.locator('summary', { hasText: 'Put it back on its date' }).count()) === 1,
        );
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

        // Its own page, which no link leads to (M32): no score entry, not "Box score".
        await page.goto(`${origin}/north-valley/admin/games/${id}`);
        await page.locator('main h1').waitFor();
        note(
          "a postponed game's own page offers no score entry, says why, and is not titled Box score",
          (await page.locator('main input[name$="Score"], main [data-sheet-team]').count()) === 0 &&
            (await page.getByText('This game is postponed, so it has no score yet.').count()) ===
              1 &&
            ((await page.locator('main h1').textContent()) ?? '').trim() === 'Owls at Badgers',
          (await page.locator('main h1').textContent()) ?? '',
        );
        note(
          'its own page leads to the games waiting for a new date and puts it back on its date',
          (await page
            .getByRole('link', { name: 'See the games waiting for a new date' })
            .count()) === 1 &&
            (await page.locator('summary', { hasText: 'Put it back on its date' }).count()) === 1,
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
      await sayYes(there, 'Yes, postpone it');
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
      await openPanel(game.locator('details[data-call-off]').last());
      const team = game.getByLabel('Team that forfeits');
      note('"Team that forfeits" starts empty', (await team.inputValue()) === '');
      const offered = await team.locator('option').allTextContents();
      note(
        '"Team that forfeits" lists the away team first, as everything else does',
        offered.join('|') === 'Choose a team|Bears|Tigers',
        offered.join('|'),
      );
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
      // A team no longer in the list (a form tampered with): its own plain sentence.
      await game.getByLabel('Team that forfeits').evaluate((select) => {
        select.options[1].value = '01900000-0000-7000-8000-0000000a0999';
        select.selectedIndex = 1;
      });
      await game.getByRole('button', { name: 'Record forfeit', exact: true }).click();
      await sayYes(game, 'Yes, record the forfeit');
      await game.getByRole('alert').waitFor();
      note(
        'a team that is not in the game is refused in a plain sentence',
        ((await game.getByRole('alert').textContent()) ?? '').trim() ===
          'Bears at Tigers: That team is not in this game.',
        (await game.getByRole('alert').textContent()) ?? '',
      );
      await openGames(page);
      await openPanel(gameOn(page, bearsAtTigers).locator('details[data-call-off]').last());
      await gameOn(page, bearsAtTigers)
        .getByLabel('Team that forfeits')
        .selectOption({ label: 'Bears' });
      await gameOn(page, bearsAtTigers)
        .getByRole('button', { name: 'Record forfeit', exact: true })
        .click();
      await questionOf(gameOn(page, bearsAtTigers)).waitFor();
      const asked = ((await questionOf(gameOn(page, bearsAtTigers)).textContent()) ?? '').trim();
      note(
        'a team chosen, one tap only asks, naming who forfeits, who wins and the forfeit score',
        asked.startsWith(
          'Record a forfeit by Bears in Bears at Tigers? Tigers win 20–0, the league’s forfeit score',
        ) && (await statusOf(gameOn(page, bearsAtTigers))) === 'scheduled',
        asked,
      );
      await gameOn(page, bearsAtTigers)
        .getByRole('button', { name: 'No, keep the game as it is' })
        .click();
      await questionOf(gameOn(page, bearsAtTigers)).waitFor({ state: 'detached' });
      note(
        '"No" records no forfeit',
        (await statusOf(gameOn(page, bearsAtTigers))) === 'scheduled',
      );
    } finally {
      await context.close();
    }
  });

  await step(
    'a postponed game: cancelled and put back, it is postponed again; then back on its date',
    async () => {
      const { context, page } = await signedInAs('local-scheduler-token', { hasTouch: true });
      try {
        await openGames(page);
        const game = () => gameOn(page, bearsAtTigers);
        const savedSaying = (words) =>
          game().getByRole('status').filter({ hasText: words }).waitFor();
        await tapToCallOff(game(), 'Postpone');
        await sayYes(game(), 'Yes, postpone it');
        await savedSaying('is postponed');
        const instead = panelOf(game(), 'Forfeit or cancel instead');
        await openPanel(instead);
        note(
          'a postponed game offers a forfeit (S-75): "Forfeit or cancel instead"',
          (await instead.getByRole('button', { name: 'Record forfeit', exact: true }).count()) ===
            1,
        );
        await tapToCallOff(game(), 'Cancel the game');
        await sayYes(game(), 'Yes, cancel it');
        await savedSaying('is cancelled');
        note('the postponed game is cancelled', (await statusOf(game())) === 'cancelled');
        const putBack = game().locator('details[data-action-form]');
        await openPanel(putBack);
        await putBack.getByLabel(/Why are you putting it back/).selectOption({
          label: 'Cancelled by mistake',
        });
        await putBack.getByRole('button', { name: 'Put it back on the schedule' }).click();
        await savedSaying('back as it was');
        const saved = game().getByRole('status');
        note(
          'put back, it is what it was when it was cancelled: postponed, and "Saved" says so',
          (await statusOf(game())) === 'postponed' &&
            ((await saved.textContent()) ?? '').includes(
              'back as it was before it was cancelled: postponed',
            ),
          (await saved.textContent()) ?? '',
        );

        // "Put it back on its date": a reason, a question, and a double tap that only asks.
        for (const [width, viewport, touch] of [
          ['390', phone, true],
          ['1280', laptop, false],
        ]) {
          await page.setViewportSize(viewport);
          const ready = async () => {
            await openGames(page);
            const restore = panelOf(game(), 'Put it back on its date');
            await openPanel(restore);
            await restore.getByLabel(/Why are you putting it back/).selectOption({
              label: 'Postponed by mistake',
            });
            return restore.getByRole('button', { name: 'Put it back', exact: true });
          };
          const held = await spotAfterOneTap(
            page,
            game(),
            await ready(),
            touch,
            `${width} "Put it back" (Bears at Tigers, postponed)`,
          );
          note(
            `${width}: after one tap on "Put it back", the spot touched holds "No", not "Yes"`,
            held.startsWith('No'),
            held,
          );
          for (const gap of [150, 600]) {
            const under = await doubleTap(page, await ready(), gap, touch);
            note(
              `${width}, ${gap} ms: two taps on one spot of "Put it back" change nothing`,
              (await statusOf(game())) === 'postponed' && !under.startsWith('Yes'),
              `${await statusOf(game())}, the spot holds: ${under}`,
            );
          }
        }
        await page.setViewportSize(phone);
        await openGames(page);
        const restore = panelOf(game(), 'Put it back on its date');
        await openPanel(restore);
        await restore.getByLabel(/Why are you putting it back/).selectOption({
          label: 'Postponed by mistake',
        });
        await restore.getByRole('button', { name: 'Put it back', exact: true }).click();
        await questionOf(game()).waitFor();
        const asked = ((await questionOf(game()).textContent()) ?? '').trim();
        note(
          'its question names the game and its old date',
          // Bears at Tigers is two days after the league's today at 18:00 (`day: 2` in
          // stand-in-world-seed.ts), whatever day of the week the test is run on.
          asked.startsWith(
            `Put Bears at Tigers back on its date, ${leagueDayWords(worldNow, 2)}, 6:00`,
          ),
          asked,
        );
        await sayYes(game(), 'Yes, put it back on its date');
        await savedSaying('back on its date');
        note(
          '"Yes" puts it back on its date, scheduled, and "Saved" says so',
          (await statusOf(game())) === 'scheduled' &&
            ((await game().getByRole('status').textContent()) ?? '').includes(
              'Bears at Tigers is back on its date',
            ),
          (await game().getByRole('status').textContent()) ?? '',
        );
      } finally {
        await context.close();
      }
    },
  );

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
      await answersTallEnough(game, 'cancelling');
      await sayYes(game, 'Yes, cancel it');
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
      await openPanel(putBack);
      const why = putBack.getByLabel(/Why are you putting it back/);
      note('its reason starts empty', (await why.inputValue()) === '');
      await putBack.getByRole('button', { name: 'Put it back on the schedule' }).click();
      await page.waitForTimeout(500);
      note('with no reason it is not put back', (await statusOf(game)) === 'cancelled');
      await why.selectOption({ label: 'Cancelled by mistake' });
      // A double tap on one spot puts it back once, and the second tap changes nothing more.
      const under = await doubleTap(
        page,
        putBack.getByRole('button', { name: 'Put it back on the schedule' }),
        150,
        false,
      );
      const saved = game.getByRole('status');
      await saved.waitFor();
      note(
        'put back with a reason (a double tap on one spot), it is a scheduled game again, once',
        (await statusOf(game)) === 'scheduled' &&
          (await questionOf(game).count()) === 0 &&
          ((await saved.textContent()) ?? '').includes('Herons at Falcons is back on the schedule'),
        `${(await saved.textContent()) ?? ''} (under: ${under})`,
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
        await tapToCallOff(gameOn(page, lionsAtHawks), 'Cancel the game');
        await questionOf(gameOn(page, lionsAtHawks)).waitFor();
        note(
          'with scripts off, the question is its own step and nothing is cancelled',
          (await statusOf(gameOn(page, lionsAtHawks))) === 'scheduled' &&
            ((await questionOf(gameOn(page, lionsAtHawks)).textContent()) ?? '').includes(
              'Cancel Lions at Hawks?',
            ),
        );
        await accessible(page, 'the question before cancelling, scripts off');
        await sayYes(gameOn(page, lionsAtHawks), 'Yes, cancel it');
        await gameOn(page, lionsAtHawks).getByRole('status').waitFor();
        note(
          'with scripts off, "Yes" cancels it',
          (await statusOf(gameOn(page, lionsAtHawks))) === 'cancelled',
        );
        const putBack = gameOn(page, lionsAtHawks).locator('details[data-action-form]');
        await openPanel(putBack);
        await putBack
          .getByLabel(/Why are you putting it back/)
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

console.log(`Where the answers stand (x,y of each box's top left):\n  ${places.join('\n  ')}`);

if (failures.length > 0) {
  console.error(`Ask-first browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Ask-first browser test passed (${checked.length} checks).`);
