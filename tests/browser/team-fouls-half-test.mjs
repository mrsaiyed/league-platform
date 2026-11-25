// Team fouls counted by the half in a quarters game (step 2.123), played in a browser: the
// owner sets the season to quarters with team fouls starting again each half and the bonus
// at 7; 4 fouls in Q1 and 3 in Q2 give 7 team fouls and the bonus in Q2, on the scoring
// screen and on the public game page; Q3 starts at 0; Undo of the period change goes back
// across the period line to the 7; overtime goes on with the second half's count (S-114).
import {
  addPlayers,
  court,
  league,
  liveGame,
  owner,
  scorekeeper,
  starters,
  trackerPath,
} from './tracker-driver.mjs';
import { buildNext, freePort, launch, startNext, waitFor } from './web-browser-kit.mjs';

/** How long a tap, a save or a page may take to show. */
const tapLimit = 10_000;
const pageLimit = 20_000;

const failures = [];
let checks = 0;
const note = (what, ok, detail = '') => {
  checks += 1;
  if (!ok) failures.push(`${what}${detail === '' ? '' : `: ${detail}`}`);
};
const step = async (what, work) => {
  try {
    await work();
  } catch (error) {
    failures.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

if (!process.argv.includes('--no-build') && !(await buildNext())) {
  console.error('Team fouls by the half browser test: next build failed or took over 10 minutes');
  process.exit(1);
}

const origin = `http://localhost:${await freePort()}`;
const server = startNext(['start', '--port', new URL(origin).port], {
  APP_ENV: 'test',
  PUBLIC_BASE_URL: origin,
});
let browser;

/** Season settings: quarters, team fouls starting again each half, bonus 7, double 10. */
async function byTheHalf() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    await context.addCookies([{ ...owner, url: origin }]);
    const page = await context.newPage();
    const address = `${origin}/${league}/admin/season?season=fall-2026&edit=game`;
    await page.goto(address, { timeout: pageLimit });
    await page.locator('input[name=periods][value="4"]').check({ timeout: tapLimit });
    await page.locator('input[name=teamFoulsReset][value=half]').check({ timeout: tapLimit });
    await page.locator('input[name=bonusFouls]').fill('7', { timeout: tapLimit });
    await page.locator('input[name=doubleBonusFouls]').fill('10', { timeout: tapLimit });
    await Promise.all([
      page.waitForEvent('load', { timeout: pageLimit }),
      page.getByRole('button', { name: 'Save the game rules' }).click({ timeout: tapLimit }),
    ]);
    await page.goto(`${origin}/${league}/admin/season?season=fall-2026`, { timeout: pageLimit });
    const said = (await page.locator('main').textContent({ timeout: tapLimit })) ?? '';
    note(
      'the settings page says fouls start again each half',
      said.includes('Team fouls start again each half.'),
      said.slice(0, 200),
    );
    await page.goto(address, { timeout: pageLimit });
    const kept = await page
      .locator('input[name=teamFoulsReset]:checked')
      .getAttribute('value', { timeout: tapLimit });
    note('the season keeps "each half" with quarters', kept === 'half', String(kept));
  } finally {
    await context.close();
  }
}

/** The words a team's scoreboard box says to a screen reader (its own name). */
const boardSays = (page, side) =>
  page
    .locator(`[data-scoring] [data-team-fouls="${side}"]`)
    .evaluate((count) => count.closest('[aria-label]')?.getAttribute('aria-label') ?? '');

/** What a team's box shows: its count and, when it shoots one, its bonus badge. */
async function box(c, page, side) {
  const badges = page.locator(`[data-scoring] [data-bonus="${side}"]`);
  return {
    count: ((await c.teamFouls(side).textContent({ timeout: tapLimit })) ?? '').trim(),
    bonus:
      (await badges.count()) === 0
        ? null
        : await badges.getAttribute('data-level', { timeout: tapLimit }),
    said: await boardSays(page, side),
  };
}

/** A team's count, once it reads `text` (as "6 fouls"), or a timeout. */
const counted = (c, side, text) =>
  c
    .teamFouls(side)
    .filter({ hasText: new RegExp(`^\\s*${text}\\s*$`) })
    .waitFor({ timeout: tapLimit });

/** The bonus badge of `side`, once it shows `level`, or a timeout. */
const badge = (page, side, level) =>
  page
    .locator(`[data-scoring] [data-bonus="${side}"][data-level="${level}"]`)
    .waitFor({ timeout: tapLimit });
/** No bonus badge for `side`, once it is gone, or a timeout. */
const noBadge = (page, side) =>
  page.locator(`[data-scoring] [data-bonus="${side}"]`).waitFor({
    state: 'detached',
    timeout: tapLimit,
  });

/** The public game page's team-foul line, opened fresh. */
async function publicLine(context) {
  const page = await context.newPage();
  try {
    await page.goto(`${origin}/${league}/games/${liveGame}`, { timeout: pageLimit });
    const line = page.locator('main p', { hasText: 'Team fouls this' }).first();
    return ((await line.textContent({ timeout: pageLimit })) ?? '').trim();
  } finally {
    await page.close();
  }
}

try {
  await waitFor(`${origin}/`, server);
  browser = await launch();

  await step('the owner counts team fouls each half, with quarters', byTheHalf);
  await addPlayers(origin);

  await step('a quarters game counted by the half', async () => {
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
    try {
      await context.addCookies([{ ...scorekeeper, url: origin }]);
      const page = await context.newPage();
      await page.goto(`${origin}${trackerPath(liveGame)}`, { timeout: pageLimit });
      const c = court(page);
      await c.open();
      await c.pick('home', starters);
      await c.pick('away', starters);
      for (const jersey of [3, 5, 7, 9]) await c.play('home', jersey, 'foul');
      await c.pickPeriod(2);
      for (const jersey of [3, 5]) await c.play('home', jersey, 'foul');
      await counted(c, 'home', '6 fouls');
      note('six fouls of the half: no bonus yet', (await box(c, page, 'away')).bonus === null);
      await c.play('home', 7, 'foul');
      await badge(page, 'away', 1);
      const q2 = await box(c, page, 'home');
      note('Q2: 7 team fouls', q2.count === '7 fouls', q2.count);
      note('Q2: the box says the half', q2.said.includes('7 team fouls this half'), q2.said);
      const shooting = await box(c, page, 'away');
      note(
        'Q2: the visitors shoot the bonus',
        shooting.said.includes('shooting the Bonus'),
        shooting.said,
      );
      const line = await publicLine(context);
      note(
        'the public page: 7 this half and the bonus',
        /^Team fouls this half: .+ 0, .+ 7 .+ shoot the bonus\.$/.test(line),
        line,
      );

      await c.pickPeriod(3);
      await noBadge(page, 'away');
      const q3 = await box(c, page, 'home');
      note(
        'Q3 starts at 0',
        q3.count === '0 fouls' && q3.said.includes('0 team fouls this half'),
        q3.said,
      );
      await c.undo();
      await page
        .locator('[data-scoring] [data-clock] [data-period="2"]')
        .waitFor({ timeout: tapLimit });
      await badge(page, 'away', 1);
      note(
        'Undo back across the period line: 7 again',
        (await box(c, page, 'home')).count === '7 fouls',
      );

      await c.pickPeriod(3);
      for (const jersey of [3, 5, 7]) await c.play('home', jersey, 'foul');
      await c.pickPeriod(4);
      for (const jersey of [9, 11]) await c.play('home', jersey, 'foul');
      note('Q4: 5 of the second half', (await box(c, page, 'home')).count === '5 fouls');
      await c.pickPeriod(5);
      await c.clock.locator('[data-period="5"]').waitFor({ timeout: tapLimit });
      note('overtime goes on with 5', (await box(c, page, 'home')).count === '5 fouls');
      await c.play('home', 11, 'foul');
      await c.play('home', 9, 'foul');
      await badge(page, 'away', 1);
      note('overtime: 7 and the bonus', (await box(c, page, 'home')).count === '7 fouls');
    } finally {
      await context.close();
    }
  });
} finally {
  await browser?.close();
  server.child.kill();
}

if (failures.length > 0) {
  console.error(`Team fouls by the half browser test: ${failures.length} failed of ${checks}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Team fouls by the half browser test: ${checks} checks passed`);
