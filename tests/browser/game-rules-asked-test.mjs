// Step 2.245: the game rules asked when a season is started (S-106, S-118), in a real
// browser on a made-up world of its own:
// - The owner starts Rules 2027 from Fall 2026 with a stop clock and a mercy lead of 12
//   (the plan's "mercy rule and a running clock": a stop clock that runs once the lead is
//   reached), with its teams and rosters, and makes it current.
// - Its settings ("Game rules") show the stop clock and 12, and change the lead to 10.
// - A game added to its schedule, tracked on the scoring screen, starts on a stop clock;
//   a 9-point lead says nothing, the basket that makes it 11 brings step 2.69's mercy
//   notice and the clock runs.
// - The start form, now copying Rules 2027, offers a stop clock and 10; a season started
//   leaving them keeps them.
// - After step 2.123, the third question: Fall 2026 is given quarters (its team fouls
//   left alone, so each quarter), and Rules 2027 is started with team fouls that start
//   again each half; its settings show it, and its tracked game carries the home team's
//   four first-quarter fouls into the second (step 2.123's own mark, data-team-fouls).
//   The form offers "each half" again, and Next 2028 keeps it; Fall 2026 counts each
//   quarter in its settings, its question never answered.
// - A refused start (a mercy lead beside a running clock), with scripts on and off, keeps
//   every box as typed, marks the mercy box, and the sentence beside it names it.
// Found by their own marks; every wait has a limit; no check passes on a timeout.
import { leagueDay } from '../../scripts/league-clock.mjs';
import { addPlayers, court, league, owner, scorekeeper, trackerPath } from './tracker-driver.mjs';
import {
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
  whatWentWrong,
  worldAtNoon,
} from './web-browser-kit.mjs';

const limit = 10_000;
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
  console.error('Game rules asked browser test: next build failed or took over 10 minutes');
  process.exit(1);
}

const worldNow = worldAtNoon();
const origin = `http://localhost:${await freePort()}`;
const server = startNext(['start', '--port', new URL(origin).port], {
  APP_ENV: 'test',
  PUBLIC_BASE_URL: origin,
  LOCAL_NOW: worldNow,
});
const seasonPage = `${origin}/${league}/admin/season`;
let browser;

/** A page signed in as the owner, scripts on or off. */
async function ownerPage(javaScriptEnabled = true) {
  const context = await browser.newContext({
    javaScriptEnabled,
    viewport: { width: 1280, height: 900 },
  });
  await context.addCookies([{ ...owner, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return page;
}

/** Taps, waits for the page it leads to, and checks its address. */
async function tap(page, locator, url) {
  await Promise.all([page.waitForEvent('load', { timeout: 30_000 }), locator.click()]);
  if (!url.test(page.url())) throw new Error(`landed on ${page.url()}, not ${url}`);
}

const startForm = (page) => page.locator('form[data-form=start-season]');

/** What the season's "Game rules" show: the clock chosen and the mercy lead. */
async function gameRulesOf(page, slug) {
  await page.goto(`${seasonPage}?season=${slug}&edit=game`);
  return {
    mode: await page.locator('input[name=clockMode]:checked').getAttribute('value'),
    mercyLead: await page.locator('input[name=mercyLead]').inputValue(),
    teamFoulsReset: await page.locator('input[name=teamFoulsReset]:checked').getAttribute('value'),
  };
}

/** Starts a season from the form: `more` fills boxes by name, `clock` picks the clock. */
async function startSeason(page, { name, slug, clock, mercyLead, teamFoulsReset, carry }) {
  await page.goto(seasonPage);
  const form = startForm(page);
  await form.locator('input[name=name]').fill(name);
  await form.locator('input[name=slug]').fill(slug);
  if (clock !== undefined) await form.locator(`input[name=clockMode][value=${clock}]`).check();
  if (mercyLead !== undefined) await form.locator('input[name=mercyLead]').fill(mercyLead);
  if (teamFoulsReset !== undefined) {
    await form.locator(`input[name=teamFoulsReset][value=${teamFoulsReset}]`).check();
  }
  if (carry !== undefined) await form.locator(`input[name=carry][value=${carry}]`).check();
  await tap(
    page,
    form.getByRole('button', { name: 'Start the season', exact: true }),
    new RegExp(`season=${slug}&done=started`),
  );
}

try {
  await waitFor(`${origin}/`, server, [
    { address: `/${league}/admin/season`, cookie: `${owner.name}=${owner.value}` },
  ]);
  browser = await launch();
  const page = await ownerPage();
  let game;

  await step(
    'a copied last-minutes stop clock is named under the clock question (review M1)',
    async () => {
      await page.goto(`${seasonPage}?season=fall-2026&edit=game`);
      await page.locator('input[name=clockMode][value=running]').check();
      await page.locator('input[name=lastMinutes]').fill('2');
      // Quarters, the team-foul question left as it was: each quarter (T-422).
      await page.locator('input[name=periods][value="4"]').check();
      await tap(
        page,
        page.getByRole('button', { name: 'Save the game rules' }),
        /season=fall-2026/,
      );
      await page.goto(seasonPage);
      const dropped = startForm(page).locator('[data-stop-clock-dropped]');
      note(
        'the start form says a stop clock for the whole game replaces it',
        (await dropped.count()) === 1 &&
          (await dropped.innerText()).trim() ===
            'Fall 2026 also stops the clock in the last 2 minutes. A stop clock for the whole game replaces that.',
        (await dropped.count()) === 1 ? await dropped.innerText() : 'no sentence',
      );
      const fouls = startForm(page).locator('input[name=teamFoulsReset]:checked');
      const said = startForm(page).locator('[data-team-fouls-said]');
      note(
        'the start form offers Fall 2026’s team fouls, each half or quarter, and says it',
        (await fouls.getAttribute('value')) === 'period' &&
          (await said.innerText()).trim() === 'Team fouls start again each quarter.',
        `${await fouls.getAttribute('value')} ${await said.innerText()}`,
      );
    },
  );

  await step(
    'the owner starts Rules 2027 with a stop clock, a mercy lead of 12 and team fouls by the half',
    async () => {
      await startSeason(page, {
        name: 'Rules 2027',
        slug: 'rules-2027',
        clock: 'stop',
        mercyLead: '12',
        teamFoulsReset: 'half',
        carry: 'teams-and-rosters',
      });
      await page.goto(`${seasonPage}?season=rules-2027`);
      await tap(page, page.locator('[data-season-change=current]'), /ask=current/);
      await tap(page, page.getByRole('button', { name: 'Yes, make it current' }), /done=current/);
      note(
        'Rules 2027 is the current season',
        (await page.locator('[data-season-state=current]').count()) === 1,
      );
    },
  );

  await step("the season's settings show both and change the lead", async () => {
    const shown = await gameRulesOf(page, 'rules-2027');
    note(
      "the season's settings show a stop clock, a mercy lead of 12 and fouls by the half",
      shown.mode === 'stop' && shown.mercyLead === '12' && shown.teamFoulsReset === 'half',
      JSON.stringify(shown),
    );
    await page.locator('input[name=mercyLead]').fill('10');
    await tap(page, page.getByRole('button', { name: 'Save the game rules' }), /season=rules-2027/);
    const changed = await gameRulesOf(page, 'rules-2027');
    note(
      "the season's settings changed the lead to 10, the clock and the fouls kept",
      changed.mode === 'stop' && changed.mercyLead === '10' && changed.teamFoulsReset === 'half',
      JSON.stringify(changed),
    );
  });

  await step('a game is added to the schedule of Rules 2027', async () => {
    await page.goto(`${origin}/${league}/admin/schedule?season=rules-2027`);
    const round = page.locator('[data-no-rounds] form');
    await round.locator('input[name=label]').fill('Week 1');
    await round.locator('input[name=date]').fill(leagueDay(worldNow, 0));
    await tap(page, round.getByRole('button', { name: 'Add round' }), /saved=round-added/);
    const add = page.locator('section[data-round] details[data-add-game]').first();
    await add.locator('summary').click();
    await add.locator('select[name=homeTeamId]').selectOption({ index: 1 });
    await add.locator('select[name=awayTeamId]').selectOption({ index: 2 });
    await add.locator('input[name=time]').fill('13:00');
    await add.locator('select[name=place]').selectOption({ index: 1 });
    await tap(page, add.locator('button[type=submit]'), /done=saved/);
    const games = await page
      .locator('li[data-game]')
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-game')));
    note('the schedule of Rules 2027 holds one game', games.length === 1, String(games.length));
    game = games[0];
    // A game added is a draft until the schedule is published: the tracker finds no other.
    await tap(page, page.getByRole('button', { name: 'Publish this schedule' }), /done=published/);
  });

  await step('the tracked game follows the stop clock and the mercy lead of 10', async () => {
    if (game === undefined || game === null) throw new Error('no game to track');
    const home = [
      ['50', 'Ada Rules'],
      ['51', 'Ben Rules'],
      ['52', 'Cy Rules'],
      ['53', 'Di Rules'],
      ['54', 'Ed Rules'],
    ];
    const away = home.map(([jersey, name]) => [jersey, name.replace('Rules', 'Away')]);
    await addPlayers(origin, { home, away }, game);
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
    try {
      await context.addCookies([{ ...scorekeeper, url: origin }]);
      const screen = await context.newPage();
      await screen.goto(`${origin}${trackerPath(game)}`);
      const c = court(screen);
      await c.open();
      const jerseys = home.map(([jersey]) => Number(jersey));
      await c.pick('home', jerseys);
      await c.pick('away', jerseys);
      const clock = (mode) =>
        screen.locator(`[data-scoring] [data-clock][data-clock-mode="${mode}"]`);
      const notice = screen.locator('[data-scoring] [data-mercy-notice]');
      await clock('stop').waitFor({ timeout: limit });
      note('the game starts on a stop clock', (await clock('stop').count()) === 1);
      for (const jersey of [50, 51, 52]) await c.play('home', jersey, 'p3');
      // Review L3: the play is shown saved (the score says 9) before the clock is read;
      // the stop clock is drawn only while the mercy rule is not on, so it is the proof.
      const nine = await c.score();
      note('the 9-point lead is shown', nine.home === 9 && nine.away === 0, JSON.stringify(nine));
      note(
        'a 9-point lead (one under 10) keeps the stop clock and brings no notice',
        (await clock('stop').count()) === 1 && (await notice.count()) === 0,
      );
      await c.play('home', 53, 'p1');
      await notice.waitFor({ timeout: limit });
      await clock('running').waitFor({ timeout: limit });
      const ten = await c.score();
      note('the 10-point lead is shown', ten.home === 10 && ten.away === 0, JSON.stringify(ten));
      note('a lead of exactly 10 brings the mercy notice', (await notice.count()) === 1);
      note('and the clock runs', (await clock('running').count()) === 1);
      // Team fouls by the half, with quarters: four in the first quarter, one in the
      // second, and the home team's count is five, carried (step 2.123's mark).
      for (const jersey of [50, 51, 52, 53]) await c.play('home', jersey, 'foul');
      const homeFouls = (text) =>
        screen
          .locator('[data-scoring] [data-team-fouls="home"]', { hasText: text })
          .waitFor({ timeout: limit });
      await homeFouls(/^\s*4 fouls\s*$/);
      await c.pickPeriod(2);
      await c.play('home', 54, 'foul');
      await homeFouls(/^\s*5 fouls\s*$/);
      note(
        'the second quarter carries the first quarter’s four team fouls: five',
        (await c.teamFouls('home').innerText()).trim() === '5 fouls',
        await c.teamFouls('home').innerText(),
      );
    } finally {
      await context.close();
    }
  });

  await step('a new season started from Rules 2027 offers its answers', async () => {
    await page.goto(seasonPage);
    const form = startForm(page);
    const offered = {
      mode: await form.locator('input[name=clockMode]:checked').getAttribute('value'),
      mercyLead: await form.locator('input[name=mercyLead]').inputValue(),
      dropped: await form.locator('[data-stop-clock-dropped]').count(),
      teamFoulsReset: await form
        .locator('input[name=teamFoulsReset]:checked')
        .getAttribute('value'),
    };
    note(
      'the start form offers a stop clock, 10, fouls by the half, and no last-minutes sentence',
      offered.mode === 'stop' &&
        offered.mercyLead === '10' &&
        offered.dropped === 0 &&
        offered.teamFoulsReset === 'half',
      JSON.stringify(offered),
    );
    await startSeason(page, { name: 'Next 2028', slug: 'next-2028', carry: 'nothing' });
    const kept = await gameRulesOf(page, 'next-2028');
    note(
      'a season started leaving them keeps a stop clock, 10 and fouls by the half',
      kept.mode === 'stop' && kept.mercyLead === '10' && kept.teamFoulsReset === 'half',
      JSON.stringify(kept),
    );
    // Fall 2026's question was never answered: its settings count each quarter.
    const plain = await gameRulesOf(page, 'fall-2026');
    note(
      'Fall 2026, its team fouls left alone, counts each half or quarter',
      plain.teamFoulsReset === 'period',
      JSON.stringify(plain),
    );
  });

  for (const scripts of [true, false]) {
    const named = scripts ? 'scripts on' : 'scripts off';
    await step(`${named}: a refused start keeps what was typed`, async () => {
      const on = scripts ? page : await ownerPage(false);
      try {
        await on.goto(seasonPage);
        const form = startForm(on);
        const typed = {
          name: `Kept ${named}`,
          slug: scripts ? 'kept-on' : 'kept-off',
          startsOn: '2028-01-05',
          endsOn: '2028-03-01',
          mercyLead: '15',
        };
        for (const [box, value] of Object.entries(typed)) {
          await form.locator(`input[name=${box}]`).fill(value);
        }
        await form.locator('input[name=clockMode][value=running]').check();
        await form.locator('input[name=carry][value=teams-and-rosters]').check();
        const button = form.getByRole('button', { name: 'Start the season', exact: true });
        if (scripts) await button.click();
        else await tap(on, button, /\/admin\/season/);
        const problem = form.locator('[data-problem=start-season]');
        await problem.waitFor({ timeout: limit });
        note(`${named}: no season was started`, !on.url().includes('done=started'), on.url());
        const kept = {};
        for (const box of Object.keys(typed)) {
          kept[box] = await form.locator(`input[name=${box}]`).inputValue();
        }
        note(
          `${named}: the name, short name, dates and mercy lead are as typed`,
          JSON.stringify(kept) === JSON.stringify(typed),
          JSON.stringify(kept),
        );
        note(
          `${named}: the running clock and the teams chosen are kept`,
          (await form.locator('input[name=clockMode]:checked').getAttribute('value')) ===
            'running' &&
            (await form.locator('input[name=carry]:checked').getAttribute('value')) ===
              'teams-and-rosters',
        );
        const mercy = form.locator('input[name=mercyLead]');
        note(
          `${named}: the mercy box is marked, and no other`,
          (await mercy.getAttribute('aria-invalid')) === 'true' &&
            (await form.locator('[aria-invalid=true]').count()) === 1,
        );
        const beside = form
          .locator('.admin-field-group', { has: on.locator('input[name=mercyLead]') })
          .locator('[data-problem=start-season]');
        const said = (await problem.innerText()).trim();
        note(
          `${named}: the sentence stands beside the mercy box and names it`,
          (await beside.count()) === 1 && said.startsWith('Mercy rule: '),
          said,
        );
        note(
          `${named}: the mercy box is described by the sentence`,
          (await mercy.getAttribute('aria-describedby')) === (await problem.getAttribute('id')),
        );
      } finally {
        if (!scripts) await on.context().close();
      }
    });
  }
} catch (error) {
  failures.push(whatWentWrong(error));
} finally {
  await browser?.close();
  server.child.kill();
}

if (failures.length > 0) {
  console.error(
    `Game rules asked browser test: ${failures.length} problem(s), ${checks} checks made`,
  );
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Game rules asked browser test: all ${checks} checks passed`);
