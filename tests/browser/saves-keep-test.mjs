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
// - A save says "Saved", naming the game and its score, beside it, on the screen at 390
//   without scrolling; a reload does not say it again, and nothing of it is in the address.
// - A real double tap on a save button (the grid's, and "Yes, make it final") saves once
//   and is never answered "someone changed".
// - Accessibility checks (T-186) and no sideways scrolling, on each refusal.
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
const step = async (name, run) => {
  try {
    await run();
  } catch (error) {
    failures.push(`${name}: ${String(error?.message ?? error).split('\n')[0]}`);
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
const gameOn = (page, id) => page.locator(`li[id="game-${id}"]`);

/** From the admin's home to the games list, by tapping the admin's own "Games". */
async function openGames(page) {
  await page.goto(`${origin}/north-valley/admin`);
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/north-valley/admin/games'),
    page.locator('a[href="/north-valley/admin/games"]').first().click(),
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
  for (const [i, value] of points.entries()) await boxes.nth(i).fill(String(value));
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
  await step(
    'twelve players’ points and a tie in the box score are kept after the refusal',
    async () => {
      const { context, page } = await signedInAs('local-scheduler-token');
      try {
        await openBoxScore(page, finalScoreGame, 'Box score: Tigers at Lions');
        const typed = await typeTiedSheet(page, 'Tigers', 'Lions');
        await page.getByRole('button', { name: 'Save box score and make it final' }).click();
        await checkTiedSheetRefused(page, 'the box score', typed, 'Tigers', 'Lions');

        // Put right and saved with a real double tap: saved once, "Saved" names the game and
        // its score under the title, on the screen, and nothing says someone changed it;
        // nothing of it is in the address, and a reload does not say it again.
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

  await step('with scripts off, the box score keeps a refused sheet', async () => {
    const { context, page } = await signedInAs('local-scheduler-token', {
      javaScriptEnabled: false,
    });
    try {
      await openBoxScore(page, laterGame, 'Box score: Bears at Tigers');
      const typed = await typeTiedSheet(page, 'Bears', 'Tigers');
      await Promise.all([
        page.waitForEvent('load'),
        page.getByRole('button', { name: 'Save box score and make it final' }).click(),
      ]);
      await checkTiedSheetRefused(page, 'the box score with scripts off', typed, 'Bears', 'Tigers');
      await page.getByLabel('Score for Bears').fill('');
      await page.getByLabel('Score for Tigers').fill('');
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
