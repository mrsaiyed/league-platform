// Step 2.118, part 3: the Players panel on the tracker, in a real browser against the web
// app on its made-up stand-in (APP_ENV=test). Nothing leaves this computer; every team,
// game and person is made up. Builds the app first unless given --no-build.
//
// The made-up league's game under way (Hawks v Bears), on a server of its own each time,
// with every visiting player marked as left by the owner first: a visiting team with no
// roster. At the phone upright (390 x 844):
// - With the signal: the panel opens by itself; "3 5 10 12 14" is typed for the visitors
//   (and several numbers with a name are refused with a sentence); seventeen a side are
//   measured at four sizes (no sideways scroll, targets 44 or more, the away team one tap
//   away on a phone) and, picking starters at 390 x 664, both teams are in reach; both
//   lineups are set; #12 scores and shows on the tile, the log and the public game page;
//   another device asking the game's rosters sees the added players; #14's number is
//   corrected after three plays and shows on the tile, the log and the public page; a
//   take-off is not offered for a league's own player, nor for one with plays, and the
//   reason is said.
// - The same with the network off, in a season whose numbers are unique: the adds and the
//   basket wait and the banner counts them; a reload with no signal keeps the players and
//   the half-typed line; a number typed twice is marked on both and still taken (S-44);
//   with the signal back everything is saved and nothing is listed as not saved.
// With PLAYERS_PANEL_PICTURES set to a folder, pictures of the panel with seventeen a side
// at 390 x 844, 844 x 390, 820 x 1180 and 1180 x 820 go there.
import path from 'node:path';
import {
  court,
  league,
  leagueId,
  liveGame,
  owner,
  scorekeeper,
  trackerPath,
} from './tracker-driver.mjs';
import {
  answered,
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
  whatWentWrong,
} from './web-browser-kit.mjs';

process.setMaxListeners(32);

const phone = { width: 390, height: 844 };
const pictureSizes = [
  phone,
  { width: 844, height: 390 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
];
const pictures = process.env.PLAYERS_PANEL_PICTURES;
const bench = '3 5 10 12 14';
const bears = ['Sol', 'Tam', 'Uma', 'Vic', 'Wes', 'Xan'].map((first) => `${first} Bearsley`);
const hawksStarters = [3, 5, 7, 9, 11];
const awayStarters = [3, 5, 10, 12, 14];

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

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}

async function until(page, what, test, label, ms = 20_000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await what();
    if (test(last)) return last;
    await page.waitForTimeout(250);
  }
  throw new Error(`${label}: ${JSON.stringify(last)}`);
}

const words = async (locator) => ((await locator.innerText()) ?? '').replace(/\s+/g, ' ').trim();

/** The owner marks every visiting player as left (yesterday), and may make numbers unique. */
async function setUp(browser, origin, { unique }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ ...owner, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  try {
    await page.goto(`${origin}/${league}/admin/teams`);
    await Promise.all([
      page.waitForURL(/\/admin\/teams\/.+/),
      page.locator('main').getByRole('link', { name: 'Bears', exact: true }).click(),
    ]);
    const teamPage = page.url();
    for (const name of bears) {
      const line = page
        .locator('main ol > li', { hasText: name })
        .filter({ has: page.getByRole('button', { name: 'Mark as left' }) });
      await line.locator('input[name=leftOn]').fill(yesterday);
      // The answer is a one-time notice on the same page (step 2.155 part 6): with scripts
      // on, the page is redrawn in place and fires no load, so wait for what it says.
      await line.getByRole('button', { name: 'Mark as left' }).click();
      await answered(page, `${name} was marked as having left`, 30_000);
      if (!page.url().startsWith(teamPage.split('?')[0])) throw new Error(`left for ${page.url()}`);
    }
    const stillOn = await page
      .locator('main ol > li')
      .filter({ has: page.getByRole('button', { name: 'Mark as left' }) })
      .count();
    note(
      `the owner marked every visiting player as left (${unique ? 'off' : 'on'}line run)`,
      stillOn === 0,
      `${stillOn}`,
    );
    if (unique) {
      await page.goto(`${origin}/${league}/admin/season?season=fall-2026&edit=rosters`);
      await page.locator('input[name=uniqueJerseys]').check();
      await Promise.all([
        page.waitForEvent('load'),
        page.getByRole('button', { name: /^Save the roster/ }).click(),
      ]);
      await page.goto(`${origin}/${league}/admin/season?season=fall-2026&edit=rosters`);
      note(
        'the season wears each number once (S-44 is tried in a unique-numbers season)',
        await page.locator('input[name=uniqueJerseys]').isChecked(),
      );
    }
  } finally {
    await context.close();
  }
}

/** The scorekeeper's phone, the tracker open, and what the test does with it. */
async function scorekeeperPhone(browser, origin) {
  const context = await browser.newContext({ viewport: phone, hasTouch: true });
  await context.addCookies([{ ...scorekeeper, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on('dialog', (dialog) => void dialog.accept());
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}${trackerPath()}`);
  const c = court(page);
  await c.open();
  const panel = page.locator('[data-players-panel]');
  const team = (side) => panel.locator(`[data-players-team="${side}"]`);
  const rows = (side) => team(side).locator('[data-player-row]');
  const add = async (side, line, name = '', { double = false } = {}) => {
    await team(side).locator(`[data-players-line="${side}"]`).fill(line);
    await team(side).locator(`[data-players-name="${side}"]`).fill(name);
    const button = team(side).locator(`[data-players-add="${side}"]`);
    // A double tap: the second must be ignored, never a second copy of the line.
    if (double) await button.dblclick();
    else await button.click();
  };
  const openPanel = async () => {
    if (await panel.isVisible()) return;
    await c.more.click();
    await page.locator('[data-players-open="more"]').click();
    await panel.waitFor();
  };
  const closePanel = async () => {
    await panel.locator('[data-players-close]').click();
    await panel.waitFor({ state: 'detached' });
  };
  const logText = async () => {
    await c.openLog();
    const text = (await c.logRows.allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
    await c.closeLog();
    return text;
  };
  const rowOf = async (side, jersey) => c.tile(side, jersey).getAttribute('data-player');
  return {
    context,
    page,
    c,
    panel,
    team,
    rows,
    add,
    openPanel,
    closePanel,
    logText,
    rowOf,
    errors,
  };
}

let lastPublic = '';

/** The public game page's words, read by a visitor with no account. */
async function publicWords(browser, origin) {
  const context = await browser.newContext({ viewport: phone });
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/${league}/games/${liveGame}`);
    return await words(page.locator('main'));
  } finally {
    await context.close();
  }
}

/** Seventeen a side, measured at four sizes (and pictured when asked). */
async function measure(s) {
  const { page, panel } = s;
  for (const size of pictureSizes) {
    await page.setViewportSize(size);
    await page.waitForTimeout(300);
    const at = `${size.width} x ${size.height}`;
    const sizes = await page.evaluate(() => {
      const sheet = document.querySelector('[data-players-panel] [role="dialog"]');
      const small = [
        ...document.querySelectorAll('[data-players-panel] button, [data-players-panel] input'),
      ]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width < 44 || r.height < 44).length;
      return {
        sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        sheetSideways: sheet ? sheet.scrollWidth > sheet.clientWidth : true,
        small,
      };
    });
    note(
      `seventeen a side at ${at}: no sideways scroll, every target 44 or more`,
      !sizes.sideways && !sizes.sheetSideways && sizes.small === 0,
      JSON.stringify(sizes),
    );
    // The picture shows the panel from its top: the jump, the add lines, the first rows.
    await page.evaluate(() =>
      document.querySelector('[data-players-panel] [role="dialog"]')?.scrollTo(0, 0),
    );
    if (pictures)
      await page.screenshot({
        path: path.join(pictures, `players-panel-${size.width}x${size.height}.png`),
      });
  }
  await page.setViewportSize(phone);
  await page.waitForTimeout(300);
  // On the stacked phone the away team's add line is one tap away, at the top of its list.
  const jump = panel.locator('[data-players-jump="away"]');
  await jump.click();
  await page.waitForTimeout(400);
  const line = await panel.locator('[data-players-line="away"]').boundingBox();
  note(
    "on the phone the jump brings the away team's add line into view",
    line !== null && line.y >= 0 && line.y + line.height <= phone.height,
    JSON.stringify(line),
  );
}

/** Picking starters with seventeen a side on a short phone: both teams in reach. */
async function bothTeamsInReach(s) {
  const { page, c } = s;
  await page.setViewportSize({ width: 390, height: 664 });
  await page.waitForTimeout(300);
  const inView = async (side) =>
    page.evaluate(
      (sd) =>
        [...document.querySelectorAll(`[data-teams] [data-side="${sd}"][data-player]`)].filter(
          (el) => {
            const r = el.getBoundingClientRect();
            return r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight;
          },
        ).length,
      side,
    );
  const seen = { home: await inView('home'), away: await inView('away') };
  // The away team's last player is reached by scrolling its own list, never off the page.
  await c.tile('away', 31).scrollIntoViewIfNeeded();
  const last = await c.tile('away', 31).boundingBox();
  note(
    'picking starters at 390 x 664, both teams have tiles in view and the last away tile is reached',
    seen.home > 0 && seen.away > 0 && last !== null && last.y + last.height <= 664,
    JSON.stringify({ seen, last }),
  );
  await page.setViewportSize(phone);
  await page.waitForTimeout(300);
}

async function withSignal(browser) {
  const origin = `http://localhost:${await freePort()}`;
  const server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  let s;
  try {
    await waitFor(`${origin}/`, server);
    await setUp(browser, origin, { unique: false });
    s = await scorekeeperPhone(browser, origin);
    const { page, c, panel, team, rows, add } = s;

    await step('the panel opens by itself and takes a bench in one line', async () => {
      note('the visitors have nobody: the panel opens by itself', await panel.isVisible());
      await add('away', '20 21', 'Made Name');
      const said = await words(team('away').locator('[data-players-said="away"]'));
      note(
        'several numbers with a name are refused with what to do',
        /numbers alone for a bench/.test(said) && (await rows('away').count()) === 0,
        said,
      );
      await add('away', bench);
      await until(
        page,
        () => rows('away').count(),
        (n) => n === 5,
        'the bench was not added',
      );
      const numbers = await rows('away').locator('.court-players-who').allInnerTexts();
      note(
        '"3 5 10 12 14" adds five visiting players',
        awayStarters.every((n) => numbers.some((t) => t.includes(String(n)))),
        numbers.join(','),
      );
      note(
        'the line is cleared once the bench is added',
        (await team('away').locator('[data-players-line="away"]').inputValue()) === '',
      );
      const labelled = await page.evaluate(() =>
        [...document.querySelectorAll('[data-players-panel] input')].every(
          (el) => el.labels && el.labels.length > 0,
        ),
      );
      note('every box of the panel has its label', labelled);
    });

    await step('seventeen a side at four sizes', async () => {
      await add('away', '20 21 22 23 24 25 26 27 28 29 30 31', '', { double: true });
      await add('home', '60 61 62 63 64 65 66 67 68 69 70');
      await until(
        page,
        async () => [await rows('home').count(), await rows('away').count()],
        ([h, a]) => h === 17 && a >= 17,
        'not seventeen a side',
      );
      await page.waitForTimeout(1500);
      const twice = await rows('away').count();
      note('a double tap on Add stores the line once (one of each)', twice === 17, `${twice}`);
      await measure(s);
    });

    await step('both lineups, then #12 scores', async () => {
      // A walk-on added at the table to the home team, whose numbers are public, starts.
      await add('home', '44', 'Sam Walker');
      await until(
        page,
        () => rows('home').count(),
        (n) => n === 18,
        'the walk-on was not added',
      );
      await s.closePanel();
      await bothTeamsInReach(s);
      await c.pick('home', [...hawksStarters.slice(0, 4), 44]);
      await c.pick('away', awayStarters);
      await page.locator('[data-scoring][data-stage="play"]').waitFor();
      await c.play('away', 12, 'p2');
      await c.saved();
      note(
        "#12's basket is on his tile",
        (await c.points('away', 12)) === 2,
        `${await c.points('away', 12)}`,
      );
      const log = await s.logText();
      note("#12's basket is in the log", /#12\b/.test(log), log.slice(0, 300));
      const shown = await until(
        page,
        async () => (lastPublic = await publicWords(browser, origin)),
        (t) => /Bears 2\b/.test(t) && /numbers are not public/.test(t),
        'the public page never showed the Bears at 2',
      ).catch(() => null);
      note(
        "#12's basket reaches the public game page as the Bears' 2, their numbers kept private",
        shown !== null && !/#12\b/.test(shown),
        shown?.slice(0, 300) ?? `timed out: ${lastPublic.slice(0, 300)}`,
      );
    });

    await step('another device sees the added players', async () => {
      const answer = await fetch(`${origin}/api/v1/leagues/${leagueId}/games/${liveGame}/rosters`, {
        headers: { cookie: `${owner.name}=${owner.value}` },
      });
      const text = await answer.text();
      const worn = [...text.matchAll(/"jerseyNumber":"(\d+)"/g)].map((m) => m[1]);
      note(
        'another device asking the rosters gets the five added visitors',
        answer.ok && awayStarters.every((n) => worn.includes(String(n))),
        `${answer.status} ${text.slice(0, 200)}`,
      );
    });

    await step('a number corrected after three plays', async () => {
      await c.play('away', 14, 'p2');
      await c.play('away', 14, 'p2');
      await c.play('away', 14, 'p1');
      await c.saved();
      const id = await s.rowOf('away', 14);
      await s.openPanel();
      await panel.locator(`[data-player-fix="${id}"]`).click();
      await panel.locator(`[data-player-number="${id}"]`).fill('41');
      await panel.locator(`[data-player-save="${id}"]`).click();
      await until(
        page,
        () => words(panel.locator(`[data-player-row="${id}"] .court-players-who`)),
        (t) => t.includes('41'),
        'the number was not changed',
      );
      await s.closePanel();
      await c.saved();
      note(
        'the corrected number is on the tile, with its five points',
        (await c.points('away', 41)) === 5 && (await c.tile('away', 14).count()) === 0,
      );
      const log = await s.logText();
      note(
        'the corrected number is in the log',
        /#41\b/.test(log) && !/#14\b/.test(log),
        log.slice(0, 300),
      );
      const shown = await until(
        page,
        async () => (lastPublic = await publicWords(browser, origin)),
        (t) => /Bears 7\b/.test(t),
        'the public page never showed the Bears at 7',
      ).catch(() => null);
      note(
        'the three plays of the corrected player reach the public game page, no number shown',
        shown !== null && !/#41\b/.test(shown) && !/#14\b/.test(shown),
        shown?.slice(0, 300) ?? `timed out: ${lastPublic.slice(0, 300)}`,
      );
    });

    // The done test where numbers are public: a walk-on's number corrected after three
    // plays shows on the tile, the log and the public game page (the Bears' stay hidden).
    await step("a walk-on's number corrected after three plays, on a public team", async () => {
      await c.play('home', 44, 'p2');
      await c.play('home', 44, 'p2');
      await c.play('home', 44, 'p1');
      await c.saved();
      const id = await s.rowOf('home', 44);
      await s.openPanel();
      await panel.locator(`[data-player-fix="${id}"]`).click();
      await panel.locator(`[data-player-number="${id}"]`).fill('45');
      await panel.locator(`[data-player-save="${id}"]`).click();
      await until(
        page,
        () => words(panel.locator(`[data-player-row="${id}"] .court-players-who`)),
        (t) => t.includes('45'),
        'the number was not changed',
      );
      await s.closePanel();
      await c.saved();
      note(
        "the walk-on's corrected number is on the tile, with his five points",
        (await c.points('home', 45)) === 5 && (await c.tile('home', 44).count()) === 0,
      );
      const log = await s.logText();
      note(
        "the walk-on's corrected number is in the log",
        /#45\b/.test(log) && !/#44\b/.test(log),
        log.slice(0, 300),
      );
      const shown = await until(
        page,
        async () => (lastPublic = await publicWords(browser, origin)),
        (t) => /#45 Sam Walker/.test(t),
        'the public page never showed #45 Sam Walker',
      ).catch(() => null);
      note(
        "the walk-on's corrected number reaches the public game page, the old one gone",
        shown !== null && !/#44\b/.test(shown),
        shown?.slice(0, 300) ?? `timed out: ${lastPublic.slice(0, 300)}`,
      );
      note(
        "the Bears' numbers stay hidden on the public page",
        shown !== null &&
          /numbers are not public/.test(shown) &&
          !/#41\b/.test(shown) &&
          !/#12\b/.test(shown),
        shown?.slice(0, 300) ?? 'timed out',
      );
    });

    await step('a take-off refused with its reason', async () => {
      await s.openPanel();
      const inPanel = () =>
        page.evaluate(() =>
          Boolean(document.querySelector('[data-players-panel]')?.contains(document.activeElement)),
        );
      const movedIn = await inPanel();
      for (let i = 0; i < 25; i += 1) await page.keyboard.press('Tab');
      note(
        'focus moves into the panel on opening and stays inside it (what is behind is inert)',
        movedIn && (await inPanel()),
      );
      const own = await s.rowOf('home', 3);
      await panel.locator(`[data-player-fix="${own}"]`).click();
      const reason = await words(panel.locator(`[data-player-reason="${own}"]`));
      note(
        "a league's own player: no take-off, the name box read-only, the reason said (S-45)",
        (await panel.locator(`[data-player-takeoff="${own}"]`).count()) === 0 &&
          (await panel.locator(`[data-player-name-box="${own}"]`).getAttribute('readonly')) !==
            null &&
          reason.length > 10,
        reason,
      );
      const scorer = await s.rowOf('away', 12);
      await panel.locator(`[data-player-fix="${scorer}"]`).click();
      const why = await words(panel.locator(`[data-player-reason="${scorer}"]`));
      note(
        'a player added here with a basket: no take-off, and why',
        (await panel.locator(`[data-player-takeoff="${scorer}"]`).count()) === 0 && why.length > 10,
        why,
      );
      await page.keyboard.press('Escape');
      await panel.waitFor({ state: 'detached' });
      note(
        'Escape shuts the panel and focus goes back to More',
        await page.evaluate(
          () => document.activeElement?.classList.contains('court-more-button') === true,
        ),
      );
    });
    await step(
      'a second screen sees the players; the server refuses a take-off (S-45)',
      async () => {
        const home3 = await s.rowOf('home', 3);
        // The owner's own screen, in a browser of its own: it takes the game over.
        const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
        try {
          await context.addCookies([{ ...owner, url: origin }]);
          const other = await context.newPage();
          other.setDefaultTimeout(30_000);
          await other.goto(`${origin}${trackerPath()}`);
          const c2 = court(other);
          await c2.open();
          note(
            'a second screen shows the added players on its tiles (#12, #41)',
            (await c2.tile('away', 12).count()) > 0 && (await c2.tile('away', 41).count()) > 0,
          );
          await c2.more.click();
          await other.locator('[data-players-open="more"]').click();
          const away = other.locator(
            '[data-players-panel] [data-players-team="away"] [data-player-row]',
          );
          const listed = await until(
            other,
            () => away.count(),
            (n) => n === 17,
            'the second screen lists the added visitors',
          ).catch(() => null);
          note(
            'a second screen lists the seventeen visitors on its panel',
            listed === 17,
            `${listed}`,
          );
        } finally {
          await context.close();
        }
        // The take-off sent straight to the server, by a device that holds the game.
        const ask = async (body) => {
          const answer = await fetch(
            `${origin}/api/v1/leagues/${leagueId}/games/${liveGame}/session`,
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                cookie: `${owner.name}=${owner.value}`,
                origin,
              },
              body: JSON.stringify(body),
            },
          );
          return answer.json();
        };
        let held = await ask({ type: 'open', deviceId: 'made-up-check-device' });
        if (held.status === 'held-by-other') {
          held = await ask({
            type: 'take-over',
            deviceId: 'made-up-check-device',
            confirmed: true,
            expectedHolderSince: held.holder.since,
          });
        }
        const sent = await fetch(
          `${origin}/api/v1/leagues/${leagueId}/games/${liveGame}/commands`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              cookie: `${owner.name}=${owner.value}`,
              origin,
            },
            body: JSON.stringify({
              protocolVersion: 2,
              sessionId: held.sessionId,
              commands: [
                {
                  commandId: crypto.randomUUID(),
                  at: Date.now(),
                  input: { type: 'remove-player', side: 'home', playerId: home3 },
                },
              ],
            }),
          },
        );
        const text = await sent.text();
        const result = sent.ok ? JSON.parse(text).results?.[0] : null;
        note(
          "the server refuses a take-off of a league's own player sent straight to it (S-45)",
          result?.status === 'refused' && result.reason?.problem !== undefined,
          `${sent.status} ${text.slice(0, 300)}`,
        );
      },
    );
    note(
      'no script error on the page (with the signal)',
      s.errors.length === 0,
      s.errors.join(' | '),
    );
  } finally {
    await s?.context.close();
    server.child.kill();
  }
}

async function withoutSignal(browser) {
  const origin = `http://localhost:${await freePort()}`;
  const server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  let s;
  try {
    await waitFor(`${origin}/`, server);
    await setUp(browser, origin, { unique: true });
    s = await scorekeeperPhone(browser, origin);
    const { context, page, c, panel, team, rows, add } = s;

    await step('with no signal, the bench waits and survives a reload', async () => {
      note('offline run: the panel opens by itself', await panel.isVisible());
      await context.setOffline(true);
      await add('away', bench);
      await until(
        page,
        () =>
          team('away')
            .locator('[data-player-row][data-waiting]')
            .count()
            .catch(() => 0),
        (n) => n === 5,
        'the bench was not kept waiting',
      );
      const banner = await words(panel.locator('[data-players-banner]')).catch(() => '');
      note('with no signal the panel says the adds are waiting', banner.length > 0, banner);
      await team('away').locator('[data-players-line="away"]').fill('2');
      await page.waitForTimeout(500);
      await page.reload();
      await c.open();
      await s.openPanel();
      note(
        'reloaded with no signal, the five waiting players are still listed',
        (await rows('away').count()) === 5,
      );
      note(
        'and the half-typed line is kept',
        (await team('away').locator('[data-players-line="away"]').inputValue()) === '2',
      );
    });

    await step('a number typed twice with no signal is marked on both and taken', async () => {
      await team('away').locator('[data-players-line="away"]').fill('3');
      note(
        'the clash is marked while typing',
        (await team('away').locator('[data-players-typed-clash]').count()) === 1,
      );
      await add('away', '3', 'Made Twin');
      await until(
        page,
        () => rows('away').count(),
        (n) => n === 6,
        'the twin was not added',
      );
      note(
        'both #3 are marked as a clash',
        (await rows('away')
          .filter({ has: page.locator('[data-player-clash]') })
          .count()) === 2,
      );
    });

    await step("lineups and #12's basket with no signal, then the signal back", async () => {
      await s.closePanel();
      await c.pick('home', hawksStarters);
      // Two wear 3 now: the first listed starts.
      await c.tile('away', 3).first().click();
      await c.pick('away', awayStarters.slice(1));
      await page.locator('[data-scoring][data-stage="play"]').waitFor();
      await c.play('away', 12, 'p2');
      const banner = await words(c.banner);
      note(
        'the banner counts what waits on this device',
        (await c.banner.getAttribute('data-state')) !== 'saved' && /\d/.test(banner),
        banner,
      );
      note("#12's basket is on his tile with no signal", (await c.points('away', 12)) === 2);
      await context.setOffline(false);
      await c.root.locator('[data-saved-banner][data-state="saved"]').waitFor({ timeout: 90_000 });
      await s.openPanel();
      await until(
        page,
        () => team('away').locator('[data-player-row][data-waiting]').count(),
        (n) => n === 0,
        'adds still waiting',
      );
      note(
        'with the signal back nothing waits and nothing is refused',
        (await panel.locator('[data-players-refused]').count()) === 0 &&
          (await rows('away').count()) === 6,
      );
      note(
        'both #3 are still marked as a clash, never refused (S-44)',
        (await rows('away')
          .filter({ has: page.locator('[data-player-clash]') })
          .count()) === 2,
      );
      await s.closePanel();
      note('nothing is listed as not saved', !/not saved/i.test(await words(c.root)));
      note("#12's basket is in the log", /#12\b/.test(await s.logText()));
      const shown = await until(
        page,
        async () => (lastPublic = await publicWords(browser, origin)),
        (t) => /Bears 2\b/.test(t) && /numbers are not public/.test(t),
        'the public page never showed the Bears at 2',
      ).catch(() => null);
      note(
        "#12's basket reached the public game page as the Bears' 2",
        shown !== null && !/#12\b/.test(shown),
        shown?.slice(0, 300) ?? `timed out: ${lastPublic.slice(0, 300)}`,
      );
    });
    note('no script error on the page (no signal)', s.errors.length === 0, s.errors.join(' | '));
  } finally {
    await s?.context.close();
    server.child.kill();
  }
}

const browser = built ? await launch() : null;
if (browser) {
  await step('the Players panel with the signal', () => withSignal(browser));
  await step('the Players panel with no signal', () => withoutSignal(browser));
}
await browser?.close();

for (const label of checked) console.log(`checked: ${label}`);
if (failures.length > 0) {
  console.error(`players-panel: ${failures.length} failed`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`players-panel: all ${checked.length} checks passed`);
