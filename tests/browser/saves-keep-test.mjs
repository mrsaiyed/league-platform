// Step 2.155, part 1: a refused save keeps what was typed, and "Saved" is said where you
// are looking, on the games list and the box score grid, in a real browser at phone width
// (390), against the web app on its made-up stand-in (APP_ENV=test). Nothing leaves this
// computer; every team, game and person is made up. Builds the app first unless given
// --no-build (npm run test:web:browser builds it once in web-exit-test.mjs).
//
// Each person starts where they start (the admin's home, signed in as the other browser
// tests sign in) and reaches each screen by tapping; no screen's own address is typed.
//
// - Twelve players' points and a tied score are typed into the box score grid and saved:
//   the refusal is beside the scores, on the screen, naming the score; both scores are
//   marked; all twelve numbers and both scores are still in their boxes. The same with
//   scripts off.
// - The same for the two boxes on the games list: a tie, asked about, "Yes", refused
//   beside the boxes, which are still open with the tie in them and marked. The same with
//   scripts off.
// - "8o" in a points box and "1-2" in a score of the box score grid are refused in words,
//   naming the box, kept in the boxes, and the game is not made final. The same with
//   scripts off.
// - A save says "Saved", naming the game and its score, beside it, on the screen at 390
//   without scrolling; a reload does not say it again, and nothing of it is in the address.
// - A real double tap on a save button (the grid's, and "Yes, make it final") saves once
//   and is never answered "someone changed".
// - Accessibility checks (T-186) and no sideways scrolling, on each refusal; and, with
//   scripts off, the box score drawn again after the refusal has its title in its head, in
//   the raw HTML of the answer to the post (step 2.175).
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  openStaffMenu,
  showSheetTeamOf,
  startNext,
  titleInHeadProblem,
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
const step = async (name, run) => {
  try {
    await run();
  } catch (error) {
    failures.push(`${name}: ${whatWentWrong(error)}`);
  }
};

// The made-up games of the first league (apps/web/src/server/stand-in-games.ts). The Lions
// and the Tigers have six players each: twelve on the Tigers at Lions sheet.
const finalScoreGame = '01900000-0000-7000-8000-006a00000001'; // Tigers at Lions, today
const tomorrowGame = '01900000-0000-7000-8000-006a00000003'; // Lions at Hawks, tomorrow
const laterGame = '01900000-0000-7000-8000-006a00000004'; // Bears at Tigers, in two days
const finalGame = '01900000-0000-7000-8000-006a00000005'; // Lions at Bears, final this morning
const phone = { width: 390, height: 844 };
const someoneChanged = /Someone changed/;

// The made-up world's clock starts at noon of the league's day (LOCAL_NOW, step 2.179),
// so this test never depends on the hour, the day or a clock change it is run at: the
// day's final game is always this morning's, on the list, and already played (the kit's
// worldAtNoon; `--now=<UTC time>` starts it elsewhere).
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
    // The pages its first taps reach, as the made-up scheduler: the admin's home, Games
    // and the box score, each drawn once before the browser starts.
    const scheduler = 'srl_session=local-scheduler-token';
    await waitFor(`${origin}/`, server, [
      { address: '/north-valley/admin', cookie: scheduler },
      { address: '/north-valley/admin/games', cookie: scheduler },
      { address: `/north-valley/admin/games/${finalScoreGame}`, cookie: scheduler },
    ]);
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
const gameOn = (page, id) => page.locator(`li[id="game-${id}"]`);

/** From the admin's home to the games list, by tapping the admin's own "Games". */
async function openGames(page) {
  await page.goto(`${origin}/north-valley/admin`);
  // On a phone the admin's areas are behind its menu button (step 2.103).
  await openStaffMenu(page);
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/north-valley/admin/games'),
    page
      .getByRole('navigation', { name: 'Admin areas' })
      .locator('a[href="/north-valley/admin/games"]')
      .click(),
  ]);
  await page.getByRole('heading', { level: 1, name: 'Games' }).waitFor();
}

/** From the games list to a game's box score grid, by tapping its "Box score". */
async function openBoxScore(page, id, title) {
  await openGames(page);
  await Promise.all([
    page.waitForURL((url) => url.pathname === `/north-valley/admin/games/${id}`),
    gameOn(page, id).getByRole('link', { name: 'Box score' }).click(),
  ]);
  await page.getByRole('heading', { level: 1, name: title }).waitFor();
}

/** Lets every answer of a double tap arrive before the page is read. */
async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
}

/** Whether the element is on the screen without scrolling and not under the header. */
const seenWhole = (locator) =>
  locator.evaluate((el) => {
    const box = el.getBoundingClientRect();
    if (box.top < 0 || box.bottom > window.innerHeight || box.height === 0) return false;
    const atCentre = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return atCentre !== null && el.contains(atCentre);
  });

async function accessible(page, label) {
  const problems = await accessibilityProblems(page);
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
  const [width, inner] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  note(`no sideways scrolling at phone width: ${label}`, width <= inner, `${width} > ${inner}`);
}

/** Every points box of the grid, in the order on the screen (away team first). */
const pointsBoxes = (page) => page.locator('main input[name^="stat.points."]');

/**
 * Types twelve players' points that come to a tie, 30 to 30, and the tied score, then
 * taps the save button. Returns the numbers typed, in screen order.
 */
async function typeTiedSheet(page, away, home) {
  const points = [3, 4, 5, 6, 7, 5, 10, 4, 4, 4, 4, 4];
  const boxes = pointsBoxes(page);
  note(`the grid has twelve points boxes (${away} at ${home})`, (await boxes.count()) === 12);
  for (const [i, value] of points.entries()) {
    // At 390 wide one team's grid is shown at a time: the box's team is picked first.
    await showSheetTeamOf(page, boxes.nth(i));
    await boxes.nth(i).fill(String(value));
  }
  await page.getByLabel(`Score for ${away}`).fill('30');
  await page.getByLabel(`Score for ${home}`).fill('30');
  return points.map(String);
}

async function checkTiedSheetRefused(page, label, typed, away, home) {
  const refusal = page.locator('#box-score-scores').getByRole('alert');
  await refusal.waitFor();
  const text = ((await refusal.textContent()) ?? '').trim();
  note(
    `${label}: the refusal names the tied score`,
    text ===
      `${away} 30, ${home} 30 is a tie, and this season does not allow ties. Change a score so one team wins.`,
    text,
  );
  note(
    `${label}: the refusal is beside the scores, on the screen at 390 wide`,
    await seenWhole(refusal),
  );
  const kept = await pointsBoxes(page).evaluateAll((boxes) => boxes.map((b) => b.value));
  note(
    `${label}: all twelve points are still in their boxes`,
    JSON.stringify(kept) === JSON.stringify(typed),
    JSON.stringify(kept),
  );
  for (const team of [away, home]) {
    const box = page.getByLabel(`Score for ${team}`);
    note(
      `${label}: the score for ${team} still holds what was typed, and is marked`,
      (await box.inputValue()) === '30' && (await box.getAttribute('aria-invalid')) === 'true',
    );
    note(
      `${label}: the score for ${team} is described by the refusal`,
      (await box.getAttribute('aria-describedby')) === (await refusal.getAttribute('id')),
    );
  }
  note(
    `${label}: nothing says someone changed the game`,
    !someoneChanged.test(await page.textContent('main')),
  );
  await accessible(page, `${label}, refused`);
}

if (browser) {
  await step('a refused forfeit keeps the team that was picked', async () => {
    const { context, page } = await signedInAs('local-scheduler-token');
    try {
      await openGames(page);
      const game = gameOn(page, laterGame);
      await game.getByText('Forfeit, postpone or cancel').click();
      // The forfeit form by what it is (the page marks it), not as "the form with a choice":
      // since step 2.56 the typed final score has one too (its overtime choice).
      const forfeit = game.locator('form[data-call-off-act="forfeit"]');
      const team = forfeit.getByLabel('Team that forfeits');
      // Since step 2.158 the choice starts empty: a reset would empty it again.
      await team.selectOption({ label: 'Bears' });
      const bears = await team.inputValue();
      // A form whose game has changed since it was drawn: another version than the game's.
      await forfeit.locator('input[name="version"]').evaluate((input) => {
        input.value = '999';
      });
      await forfeit.getByRole('button', { name: 'Record forfeit' }).click();
      // Since step 2.158 the forfeit asks first; its "Yes", once read (a "Yes" within the
      // first moments is taken as a double tap and only asks again), sends what the form held.
      await game.locator('[data-call-off-ask]').waitFor();
      await page.waitForTimeout(1000);
      await game.getByRole('button', { name: 'Yes, record the forfeit' }).click();
      const refusal = forfeit.getByRole('alert');
      await refusal.waitFor();
      const text = ((await refusal.textContent()) ?? '').trim();
      note(
        'a refused forfeit names the game and says why',
        text.startsWith('Bears at Tigers: Someone changed this game'),
        text,
      );
      note(
        'a refused forfeit keeps the team that was picked',
        (await team.inputValue()) === bears,
        await team.inputValue(),
      );
      note(
        "the forfeit's button is described by the refusal",
        (await forfeit
          .getByRole('button', { name: 'Record forfeit' })
          .getAttribute('aria-describedby')) === (await refusal.getAttribute('id')),
      );
      note(
        'nothing was recorded',
        (await game.locator('.ui-game-card').getAttribute('data-status')) === 'scheduled',
      );
      await accessible(page, 'a refused forfeit');
    } finally {
      await context.close();
    }
  });

  await step('"No, change the score" gives back exactly what was typed', async () => {
    const { context, page } = await signedInAs('local-scheduler-token');
    try {
      await openGames(page);
      const game = gameOn(page, finalScoreGame);
      await game.getByText('Enter the final score').click();
      await game.getByLabel('Score for Tigers').fill('047');
      await game.getByLabel('Score for Lions').fill('51');
      await game.getByRole('button', { name: 'Save final score' }).click();
      await game.locator('[data-question]').waitFor();
      note(
        'the question names the score as numbers',
        /Tigers 47, Lions 51\./.test((await game.locator('[data-question]').textContent()) ?? ''),
      );
      await game.getByRole('button', { name: 'No, change the score' }).click();
      await game.getByLabel('Score for Tigers').waitFor();
      note(
        '"No" gives back the boxes exactly as typed',
        (await game.getByLabel('Score for Tigers').inputValue()) === '047' &&
          (await game.getByLabel('Score for Lions').inputValue()) === '51',
        await game.getByLabel('Score for Tigers').inputValue(),
      );
    } finally {
      await context.close();
    }
  });

  // Step 2.103: at 390 wide one team's grid is shown and the other is put away. A number
  // out of range typed in one team's grid, the other team picked, Save tapped: a browser's
  // own checking blocked the save on a box it could not show, and said nothing. The form
  // now leaves the telling to the server: the page says in words what is wrong, shows
  // that team with that box marked, and keeps what was typed in both grids.
  for (const scripts of [true, false]) {
    const label = `a wrong box in the team put away${scripts ? '' : ', with scripts off'}`;
    await step(`${label}, is said in words with that team shown`, async () => {
      const { context, page } = await signedInAs('local-scheduler-token', {
        javaScriptEnabled: scripts,
      });
      try {
        await openBoxScore(page, finalScoreGame, 'Box score: Tigers at Lions');
        const boxes = pointsBoxes(page);
        const grids = page.locator('.box-score-grid');
        const tabs = page.locator('.admin-sheet-tabs label');
        // The Tigers (away, shown first): a good number, then one over the box's limit.
        await boxes.nth(0).fill('7');
        await boxes.nth(1).fill('1000');
        // The Lions are picked, and a number typed there; the Tigers' grid is put away.
        await tabs.nth(1).click();
        await boxes.nth(6).fill('9');
        note(
          `${label}: the grid with the wrong box is put away when Save is tapped`,
          !(await grids.nth(0).isVisible()) && (await grids.nth(1).isVisible()),
        );
        const save = page.getByRole('button', { name: 'Save box score and make it final' });
        await (scripts ? save.click() : Promise.all([page.waitForEvent('load'), save.click()]));
        const refusal = page.locator('#box-score-scores').getByRole('alert');
        await refusal.waitFor();
        const text = ((await refusal.textContent()) ?? '').trim();
        const named = (await boxes.nth(1).getAttribute('aria-label')) ?? '';
        note(
          `${label}: the page says in words what is wrong`,
          text.endsWith(': enter a whole number from 0 to 999, or leave it empty.') &&
            text.includes('Points'),
          text,
        );
        note(
          `${label}: the team with the wrong box is the one shown`,
          (await grids.nth(0).isVisible()) && !(await grids.nth(1).isVisible()),
        );
        note(
          `${label}: that box is marked, on the screen, and described by the sentence`,
          (await boxes.nth(1).getAttribute('aria-invalid')) === 'true' &&
            (await boxes.nth(1).getAttribute('aria-describedby')) ===
              (await refusal.getAttribute('id')) &&
            (await boxes.nth(1).isVisible()),
          named,
        );
        note(
          `${label}: no other box is marked`,
          (await page.locator('main input[aria-invalid="true"]').count()) === 1,
        );
        const kept = await boxes.evaluateAll((all) => all.map((b) => b.value));
        note(
          `${label}: what was typed in both grids is kept`,
          kept[0] === '7' && kept[1] === '1000' && kept[6] === '9',
          JSON.stringify(kept),
        );
        await accessible(page, `${label}, refused`);
      } finally {
        await context.close();
      }
    });
  }

  // Step 2.103 (review): the grid's boxes are text boxes. A number box sent text it could
  // not read ("8o", "1-2") as an empty box, and with the browser's own checking off the
  // server took that as nothing typed and made the game final with a score nobody typed.
  // Now the text reaches the server as typed: refused in words, naming the box, kept in
  // the boxes, and the game is not final. With scripts on and with scripts off.
  for (const scripts of [true, false]) {
    const label = `text that is not a number${scripts ? '' : ', with scripts off'}`;
    await step(`${label}, in the box score, is refused by name and kept`, async () => {
      const { context, page } = await signedInAs('local-scheduler-token', {
        javaScriptEnabled: scripts,
      });
      try {
        await openBoxScore(page, finalScoreGame, 'Box score: Tigers at Lions');
        const stat = pointsBoxes(page).nth(0);
        const score = page.getByLabel('Score for Lions');
        const player = ((await stat.locator('xpath=ancestor::tr/th').textContent()) ?? '').trim();
        await stat.fill('8o');
        await score.fill('1-2');
        const save = page.getByRole('button', { name: 'Save box score and make it final' });
        await (scripts ? save.click() : Promise.all([page.waitForEvent('load'), save.click()]));
        const refusal = page.locator('#box-score-scores').getByRole('alert');
        await refusal.waitFor();
        const text = ((await refusal.textContent()) ?? '').trim();
        note(
          `${label}: the refusal names the box in words`,
          player !== '' &&
            text.includes('Points') &&
            text.includes(player) &&
            text.endsWith(': enter a whole number from 0 to 999, or leave it empty.'),
          `${player} | ${text}`,
        );
        note(
          `${label}: both boxes are marked, and only they`,
          (await stat.getAttribute('aria-invalid')) === 'true' &&
            (await score.getAttribute('aria-invalid')) === 'true' &&
            (await page.locator('main input[aria-invalid="true"]').count()) === 2,
        );
        const kept = [await stat.inputValue(), await score.inputValue()];
        note(
          `${label}: what was typed is still in the boxes`,
          kept[0] === '8o' && kept[1] === '1-2',
          JSON.stringify(kept),
        );
        await accessible(page, `${label}, refused`);
        await openGames(page);
        const status = await gameOn(page, finalScoreGame)
          .locator('.ui-game-card')
          .getAttribute('data-status');
        note(`${label}: the game is not made final`, status === 'scheduled', status ?? '');
      } finally {
        await context.close();
      }
    });
  }

  await step(
    'twelve players’ points and a tie in the box score are kept after the refusal',
    async () => {
      const { context, page } = await signedInAs('local-scheduler-token');
      try {
        await openBoxScore(page, finalScoreGame, 'Box score: Tigers at Lions');
        // Step 2.103, at 390 wide: one team's grid at a time; with the grid moved to its
        // last column every row still shows its player; and a tick box is a thumb high.
        const grids = page.locator('.box-score-grid');
        note(
          'the box score shows one team at a time at 390 wide',
          (await grids.nth(0).isVisible()) && !(await grids.nth(1).isVisible()),
        );
        const names = await grids.nth(0).evaluate((grid) => {
          grid.scrollLeft = grid.scrollWidth;
          const box = grid.getBoundingClientRect();
          const moved = grid.scrollLeft > 0;
          const rows = [...grid.querySelectorAll('tbody th[scope=row]')];
          const hidden = rows.filter((th) => {
            const at = th.getBoundingClientRect();
            return at.left < box.left - 1 || at.right > box.right + 1 || at.width < 40;
          });
          grid.scrollLeft = 0;
          return { moved, rows: rows.length, hidden: hidden.length };
        });
        // The grid must really have moved: a grid that never scrolled proves nothing here.
        note(
          'the box score: at 390 wide the grid is wider than its box and scrolls in it',
          names.moved === true,
          JSON.stringify(names),
        );
        note(
          'the box score: every row still shows its player with the last column in view',
          names.moved === true && names.rows === 6 && names.hidden === 0,
          JSON.stringify(names),
        );
        const tick = await grids.nth(0).locator('input[type=checkbox]').first().boundingBox();
        note(
          'the box score: a tick box is at least 44 high and wide',
          tick !== null && tick.height >= 43.5 && tick.width >= 43.5,
          JSON.stringify(tick),
        );
        const typed = await typeTiedSheet(page, 'Tigers', 'Lions');
        await page.getByRole('button', { name: 'Save box score and make it final' }).click();
        await checkTiedSheetRefused(page, 'the box score', typed, 'Tigers', 'Lions');

        // Put right and saved with a real double tap: saved once, "Saved" names the game and
        // its score under the title, on the screen, and nothing says someone changed it;
        // nothing of it is in the address, and a reload does not say it again.
        await showSheetTeamOf(page, pointsBoxes(page).nth(0));
        await pointsBoxes(page).nth(0).fill('4');
        await page.getByLabel('Score for Tigers').fill('31');
        await page.getByRole('button', { name: 'Save box score and make it final' }).dblclick();
        await settle(page);
        const saved = page.getByRole('status').filter({ hasText: 'Saved' });
        await saved.waitFor();
        note(
          'the box score: a double tap never says someone changed the game',
          !someoneChanged.test(await page.textContent('main')) &&
            (await page.locator('main').getByRole('alert').count()) === 0,
        );
        note(
          'the box score: "Saved" names the game and its score',
          ((await saved.textContent()) ?? '').trim() ===
            'Saved: Tigers 31, Lions 30 is final, with its box score.',
          (await saved.textContent()) ?? '',
        );
        note('the box score: "Saved" is on the screen at 390 wide', await seenWhole(saved));
        note(
          'the box score: nothing of the save is in the address',
          new URL(page.url()).search === '',
          page.url(),
        );
        await page.reload();
        await page.getByRole('heading', { level: 1 }).waitFor();
        note(
          'the box score: a reload does not say "Saved" again',
          (await page.getByText('Saved:').count()) === 0,
        );
      } finally {
        await context.close();
      }
    },
  );

  // Step 2.103: the admin's own menu on a phone is a plain disclosure, so it opens with
  // scripts switched off, and leads on.
  await step('with scripts off, the admin’s own menu opens on a phone and leads on', async () => {
    const { context, page } = await signedInAs('local-scheduler-token', {
      javaScriptEnabled: false,
    });
    try {
      await page.goto(`${origin}/north-valley/admin`);
      const menu = page.locator('.staff-bar .staff-menu');
      const areas = menu.getByRole('navigation', { name: 'Admin areas' });
      const games = areas.locator('a[href="/north-valley/admin/games"]');
      note(
        'with scripts off, the admin’s menu is shut behind its button to begin with',
        (await menu.locator('> summary').isVisible()) && !(await games.isVisible()),
      );
      await menu.locator('> summary').click();
      note(
        'with scripts off, the menu button opens the admin’s own areas, the site and signing out',
        (await menu.getAttribute('open')) !== null &&
          (await games.isVisible()) &&
          (await menu.getByRole('link', { name: 'View the site' }).isVisible()) &&
          (await menu.getByRole('button', { name: 'Sign out' }).isVisible()),
      );
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/north-valley/admin/games'),
        games.click(),
      ]);
      note(
        'with scripts off, an area tapped in the menu opens',
        (await page.getByRole('heading', { level: 1, name: 'Games' }).count()) === 1,
      );
    } finally {
      await context.close();
    }
  });

  // Step 2.103: tabbing past the menu's last entry moved the focus on to the page under
  // the open panel, out of sight. The menu shuts when the focus leaves it, and on Escape.
  await step('the admin’s open menu shuts when the keyboard’s focus leaves it', async () => {
    const { context, page } = await signedInAs('local-scheduler-token');
    try {
      await page.goto(`${origin}/north-valley/admin`);
      const menu = page.locator('.staff-bar .staff-menu');
      await openStaffMenu(page);
      await menu.getByRole('button', { name: 'Sign out' }).focus();
      await page.keyboard.press('Tab');
      await page.waitForFunction(() => !document.querySelector('.staff-bar .staff-menu')?.open);
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!(el instanceof HTMLElement) || el === document.body) return null;
        const box = el.getBoundingClientRect();
        const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return { inMenu: el.closest('.staff-menu') !== null, seen: el === top || el.contains(top) };
      });
      note(
        'tabbing past "Sign out" shuts the menu, and the focus is on something in sight',
        focused !== null && !focused.inMenu && focused.seen,
        JSON.stringify(focused),
      );
      await openStaffMenu(page);
      await menu.getByRole('link', { name: 'View the site' }).focus();
      await page.keyboard.press('Escape');
      note(
        'Escape shuts the menu and gives the focus back to its button',
        (await menu.getAttribute('open')) === null &&
          (await page.evaluate(() => document.activeElement?.tagName === 'SUMMARY')),
      );
    } finally {
      await context.close();
    }
  });

  await step('with scripts off, the box score keeps a refused sheet', async () => {
    const { context, page } = await signedInAs('local-scheduler-token', {
      javaScriptEnabled: false,
    });
    try {
      await openBoxScore(page, laterGame, 'Box score: Bears at Tigers');
      const typed = await typeTiedSheet(page, 'Bears', 'Tigers');
      const [answer] = await Promise.all([
        page.waitForResponse(
          (r) => r.request().method() === 'POST' && r.request().isNavigationRequest(),
        ),
        page.waitForEvent('load'),
        page.getByRole('button', { name: 'Save box score and make it final' }).click(),
      ]);
      // The page drawn again in the answer to the post has its title in its head (step 2.175).
      const titleProblem = titleInHeadProblem(await answer.text());
      note(
        'the box score with scripts off, refused: the title is in the head of the page drawn again',
        titleProblem === '',
        titleProblem,
      );
      await checkTiedSheetRefused(page, 'the box score with scripts off', typed, 'Bears', 'Tigers');
      await page.getByLabel('Score for Bears').fill('');
      await page.getByLabel('Score for Tigers').fill('');
      await showSheetTeamOf(page, pointsBoxes(page).nth(0));
      await pointsBoxes(page).nth(0).fill('4');
      await Promise.all([
        page.waitForEvent('load'),
        page.getByRole('button', { name: 'Save box score and make it final' }).click(),
      ]);
      const saved = page.getByRole('status').filter({ hasText: 'Saved' });
      note(
        'the box score with scripts off: "Saved" names the game and the score it came to',
        ((await saved.textContent()) ?? '').trim() ===
          'Saved: Bears 31, Tigers 30 is final, with its box score.' && (await seenWhole(saved)),
        (await saved.textContent().catch(() => '')) ?? '',
      );
      await page.reload();
      note(
        'the box score with scripts off: a reload does not say "Saved" again',
        (await page.getByText('Saved:').count()) === 0,
      );
    } finally {
      await context.close();
    }
  });

  await step('a tie in the two boxes on the games list is kept after the refusal', async () => {
    const { context, page } = await signedInAs('local-scheduler-token');
    try {
      await openGames(page);
      const game = gameOn(page, tomorrowGame);
      await game.getByText('Enter the final score').click();
      await game.getByLabel('Score for Lions').fill('40');
      await game.getByLabel('Score for Hawks').fill('40');
      await game.getByRole('button', { name: 'Save final score' }).click();
      await game.locator('[data-question]').waitFor();
      await game.getByRole('button', { name: 'Yes, make it final' }).click();
      await checkTiedBoxes(page, 'the games list');

      // Put right and saved with a real double tap on "Yes": saved once, and "Saved".
      await game.getByLabel('Score for Hawks').fill('44');
      await game.getByRole('button', { name: 'Save final score' }).click();
      await game.locator('[data-question]').waitFor();
      await game.getByRole('button', { name: 'Yes, make it final' }).dblclick();
      await settle(page);
      await checkSaved(page, 'the games list', tomorrowGame, 'Saved: Lions 40, Hawks 44 is final.');
    } finally {
      await context.close();
    }
  });

  await step('with scripts off, the games list keeps a refused tie', async () => {
    const { context, page } = await signedInAs('local-scheduler-token', {
      javaScriptEnabled: false,
    });
    try {
      // The day's final game is put right first (the open games are saved above): tapped
      // "Correct this result", a reason given, and the list is back with its boxes open.
      await openGames(page);
      await Promise.all([
        page.waitForURL((url) => url.pathname === `/north-valley/admin/games/${finalGame}`),
        gameOn(page, finalGame).getByRole('link', { name: 'Correct this result' }).click(),
      ]);
      await page
        .getByLabel('Why it needs correcting (kept in the log, never shown publicly)')
        .fill('The sheet was copied wrong');
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/north-valley/admin/games'),
        page.getByRole('button', { name: 'Reopen to correct' }).click(),
      ]);
      const game = gameOn(page, finalGame);
      await game.getByLabel('Score for Lions').fill('40');
      await game.getByLabel('Score for Bears').fill('40');
      await Promise.all([
        page.waitForEvent('load'),
        game.getByRole('button', { name: 'Save final score' }).click(),
      ]);
      await Promise.all([
        page.waitForEvent('load'),
        gameOn(page, finalGame).getByRole('button', { name: 'Yes, make it final' }).click(),
      ]);
      await checkTiedBoxes(page, 'the games list with scripts off', finalGame, 'Lions', 'Bears');
      await gameOn(page, finalGame).getByLabel('Score for Bears').fill('38');
      await Promise.all([
        page.waitForEvent('load'),
        gameOn(page, finalGame).getByRole('button', { name: 'Save final score' }).click(),
      ]);
      // Played this morning by the world's clock, which is the page's clock too (step
      // 2.179): the ordinary question, never "This game is set for …".
      const asked = (await gameOn(page, finalGame).locator('[data-question]').textContent()) ?? '';
      note(
        "the played game's question is the ordinary one, by the world's clock",
        /Lions 40, Bears 38\. Make this final\?/.test(asked) && !/set for/.test(asked),
        asked,
      );
      await Promise.all([
        page.waitForEvent('load'),
        gameOn(page, finalGame).getByRole('button', { name: 'Yes, make it final' }).click(),
      ]);
      await checkSaved(
        page,
        'the games list with scripts off',
        finalGame,
        'Saved: Lions 40, Bears 38 is final.',
      );
    } finally {
      await context.close();
    }
  });
}

/** The two boxes refused for a tie: still open, holding the tie, marked, the sentence beside. */
async function checkTiedBoxes(page, label, id = tomorrowGame, away = 'Lions', home = 'Hawks') {
  const game = gameOn(page, id);
  const refusal = game.locator('[data-score-boxes] form').getByRole('alert');
  await refusal.waitFor();
  const text = ((await refusal.textContent()) ?? '').trim();
  note(
    `${label}: the refusal names the tied score`,
    text ===
      `${away} 40, ${home} 40 is a tie, and this season does not allow ties. Change a score so one team wins.`,
    text,
  );
  note(
    `${label}: the refusal is beside the boxes, on the screen at 390 wide`,
    await seenWhole(refusal),
  );
  for (const team of [away, home]) {
    const box = game.getByLabel(`Score for ${team}`);
    note(
      `${label}: the box for ${team} is still open with what was typed, and marked`,
      (await box.isVisible()) &&
        (await box.inputValue()) === '40' &&
        (await box.getAttribute('aria-invalid')) === 'true' &&
        (await box.getAttribute('aria-describedby')) === (await refusal.getAttribute('id')),
    );
  }
  note(
    `${label}: nothing says someone changed the game`,
    !someoneChanged.test(await page.textContent('main')),
  );
  note(
    `${label}: nothing of the answer is in the address`,
    new URL(page.url()).search === '',
    page.url(),
  );
  await accessible(page, `${label}, refused`);
}

/** "Saved" beside the game, naming it and its score, on the screen; not again on a reload. */
async function checkSaved(page, label, id, words) {
  const saved = gameOn(page, id).getByRole('status');
  await saved.waitFor();
  note(
    `${label}: "Saved" names the game and its score`,
    (await saved.textContent()) === words,
    (await saved.textContent()) ?? '',
  );
  note(`${label}: "Saved" is beside the game, on the screen at 390 wide`, await seenWhole(saved));
  note(
    `${label}: nothing of the save is in the address`,
    new URL(page.url()).search === '',
    page.url(),
  );
  note(
    `${label}: nothing says someone changed the game`,
    !someoneChanged.test(await page.textContent('main')),
  );
  await page.reload();
  await page.getByRole('heading', { level: 1, name: 'Games' }).waitFor();
  note(
    `${label}: a reload does not say "Saved" again`,
    (await page.getByText('Saved:').count()) === 0,
  );
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Saves-keep browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Saves-keep browser test passed (${checked.length} checks).`);
