// Drives the scoring screen in a real browser, for the pictures (scripts/tracker-shots.mjs,
// finding L4 of the 2.107 audit) and the browser tests (scoring-screen-test.mjs): made-up
// players put on the two teams through the tracker's own endpoints, and the taps a
// scorekeeper makes, found by what each thing is (a team's side, a jersey number, an
// option), never by where it sits, so the same script plays at every size. Steps 2.36 and
// 2.37 add their own taps here. Nothing leaves this computer; everyone is made up.
import { randomUUID } from 'node:crypto';

// The first made-up league and its game being played (apps/web/src/server/stand-in-games.ts):
// Hawks (home) v Bears (away), each with six players numbered 3, 5, 7, 9, 11, 13.
export const league = 'north-valley';
export const leagueId = '01900000-0000-7000-8000-000000000001';
export const liveGame = '01900000-0000-7000-8000-006a00000002';
export const scorekeeper = { name: 'srl_session', value: 'local-scorekeeper-token' };
export const trackerPath = (game = liveGame) => `/${league}/score/${game}`;

/** The five sizes every scoring screen is designed and photographed at (DESIGN.md section 7, line 8). */
export const sizes = [
  { name: 'phone-upright', width: 390, height: 844 },
  { name: 'phone-lying', width: 844, height: 390 },
  { name: 'tablet-upright', width: 820, height: 1180 },
  { name: 'tablet-lying', width: 1180, height: 820 },
  // The phone a scorekeeper really holds: a 390 x 844 phone's browser, with its bars,
  // shows about this much, and the page never scrolls them away (the fifth size).
  { name: 'phone-in-browser', width: 390, height: 664 },
];

/** Three more a side on top of `morePlayers`: fifteen a side, a bench of ten. */
export const evenMorePlayers = {
  home: [
    ['40', 'Xev Hawkins'],
    ['41', 'Yul Hawkins'],
    ['42', ''],
  ],
  away: [
    ['40', 'Dov Bearsley'],
    ['41', 'Eve Bearsley'],
    ['44', 'Fin Bearsley'],
  ],
};

/** Six more made-up players a side, so each team has twelve, as on a real game night. */
export const morePlayers = {
  home: [
    ['20', 'Sam Hawkins'],
    ['21', 'Tess Hawkins'],
    ['22', 'Uri Hawkins'],
    ['23', 'Val Hawkins'],
    ['30', 'Wim Hawkins'],
    ['33', ''],
  ],
  away: [
    ['20', 'Yan Bearsley'],
    ['21', 'Zoe Bearsley'],
    ['22', ''],
    ['24', 'Abe Bearsley'],
    ['30', 'Bo Bearsley'],
    ['34', 'Cal Bearsley'],
  ],
};

/**
 * Adds players to the game's two teams as a scorekeeper's device would (record 058), then
 * lets go of the game so the browser can take it. `players` is `{ home, away }`, each a
 * list of `[jersey, name]`; a name may be empty (S-34).
 */
export async function addPlayers(origin, players = morePlayers, game = liveGame) {
  const commands = ['home', 'away'].flatMap((side) =>
    (players[side] ?? []).map(([jersey, name]) => ({
      type: 'add-player',
      side,
      playerId: randomUUID(),
      jersey,
      name,
    })),
  );
  await fromAnotherTablet(origin, commands, game);
}

/**
 * Makes the game a stop-clock game, where a foul or a timeout stops a running clock
 * (step 2.36): the made-up league's own format is a running clock, under which neither
 * does. It is the engine's own switch (`clock-mode`, T-128), sent before tip-off from
 * another tablet, as the players are; the scorekeeper's switch on the screen is step 2.69.
 */
export async function stopClockGame(origin, game = liveGame) {
  await fromAnotherTablet(origin, [{ type: 'clock-mode', mode: 'stop' }], game);
}

/**
 * Sends taps to a game as a scorekeeper's device would (record 058), from a tablet that
 * is not the browser's, then lets go of the game so the browser can take it.
 */
async function fromAnotherTablet(origin, inputs, game = liveGame) {
  const post = async (at, body) => {
    const answer = await fetch(`${origin}/api/v1/leagues/${leagueId}/games/${game}${at}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `${scorekeeper.name}=${scorekeeper.value}`,
        origin,
      },
      body: JSON.stringify(body),
    });
    const text = await answer.text();
    if (!answer.ok) throw new Error(`${at} answered ${answer.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  };
  const { sessionId } = await post('/session', { type: 'open', deviceId: 'setup-tablet' });
  const commands = inputs.map((input) => ({ commandId: randomUUID(), at: Date.now(), input }));
  if (commands.length > 0) {
    const reply = await post('/commands', { protocolVersion: 2, sessionId, commands });
    const refused = reply.results.filter((r) => r.status !== 'accepted');
    if (refused.length > 0) throw new Error(`taps refused: ${JSON.stringify(refused)}`);
  }
  await post('/session', { type: 'release', sessionId });
}

/** The scoring screen on `page`: its parts, and the taps a scorekeeper makes. */
export function court(page) {
  const root = page.locator('[data-scoring]');
  const pad = root.locator('[data-pad]');
  /** A player's tile in their team's panel, by side and jersey number. */
  const tile = (side, jersey) =>
    root.locator(`[data-teams] [data-side="${side}"][data-player]`).filter({
      has: page.locator('.court-tile-number', { hasText: new RegExp(`^${jersey}$`) }),
    });
  /** An option of the open pad: p1, p2, p3, foul, unfoul, turnover. */
  const option = (act) => pad.locator(`[data-act="${act}"]`);
  const score = async () => ({
    home: Number(await root.locator('[data-score="home"] .court-score-value').textContent()),
    away: Number(await root.locator('[data-score="away"] .court-score-value').textContent()),
  });
  const points = async (side, jersey) =>
    Number(await tile(side, jersey).locator('[data-points]').getAttribute('data-points'));
  const fouls = async (side, jersey) =>
    Number(await tile(side, jersey).locator('[data-fouls]').getAttribute('data-fouls'));
  const onCourt = async (side, jersey) =>
    (await tile(side, jersey).getAttribute('data-oncourt')) === '1';
  /** Whether a player is on the court, by their id: wherever their tile is drawn. */
  const onCourtById = async (id) =>
    (await root.locator(`[data-teams] [data-player="${id}"]`).getAttribute('data-oncourt')) === '1';
  const plays = async () => Number(await root.getAttribute('data-plays'));
  const recorded = async (tap) => {
    const before = await plays();
    await tap();
    await page.waitForFunction(
      (n) => Number(document.querySelector('[data-scoring]')?.dataset.plays) !== n,
      before,
    );
  };

  return {
    root,
    pad,
    tile,
    option,
    score,
    points,
    fouls,
    onCourt,
    onCourtById,
    banner: root.locator('[data-saved-banner]'),
    said: root.locator('[data-say]'),
    turnoversChip: (side) => root.locator(`[data-turnovers="${side}"]`),
    more: root.locator('.court-more-button'),
    sheet: root.locator('[data-more] [role="dialog"]'),

    /**
     * Waits for the scoring screen, confirming the game format on the way if it is asked.
     * A game another device still holds (a run before this one left it with taps unsent)
     * is taken over, as a second scorekeeper would; the answer says whether it was, so a
     * test can say a game was held that should have been free.
     */
    async open() {
      const confirm = page.getByRole('button', { name: 'Confirm and start scoring' });
      const takeOver = page.getByRole('button', { name: 'Take over scoring' });
      await root.or(confirm).or(takeOver).first().waitFor();
      const tookOver = await takeOver.isVisible();
      if (tookOver) {
        await takeOver.click();
        await page.getByRole('button', { name: 'Yes, take over' }).click();
        await root.or(confirm).first().waitFor();
      }
      if (await confirm.isVisible()) await confirm.click();
      await root.waitFor();
      return { tookOver };
    },
    /**
     * Leaves the game by the screen's own way out (More, "Back to your games"), which
     * lets go of the game before the page goes (T6 §5): the next to open it finds it free.
     */
    async leave() {
      if (!(await root.locator('[data-more] [role="dialog"]').isVisible())) {
        await root.locator('.court-more-button').click();
      }
      await Promise.all([
        page.waitForURL((url) => !url.pathname.includes('/score/')),
        root
          .locator('[data-more] [role="dialog"]')
          .getByRole('link', { name: 'Back to your games' })
          .click(),
      ]);
    },
    /** Taps each of a team's players by jersey number: its starters while they are picked. */
    async pick(side, jerseys) {
      for (const jersey of jerseys) await tile(side, jersey).click();
    },
    /**
     * Runs `tap` and waits until the game on the screen holds a play more or fewer: the
     * tap was stored on the device and is shown (the screen says how many plays it holds).
     */
    recorded,
    /** Taps a player, then one of their options, and waits for the play to be shown. */
    async play(side, jersey, act) {
      // The option tapped is one of this player's own: the pad is waited for until it
      // shows them, never an option still drawn from the tap before.
      const options = pad.locator(
        `[data-options="${await tile(side, jersey).getAttribute('data-player')}"]`,
      );
      if (!(await options.isVisible())) await tile(side, jersey).click();
      await recorded(() => options.locator(`[data-act="${act}"]`).click());
    },
    /** Taps an option of the open pad (or any button of it) and waits for the play. */
    choose: (act) => recorded(() => option(act).click()),
    /** The button beside a team's name that opens its bench in the pad (a short phone). */
    benchButton: (side) => root.locator(`[data-bench-open="${side}"]`),
    /** A player in the bench opened in the pad, by jersey number. */
    benchPlayer: (jersey) =>
      pad.locator('[data-bench-pick]').filter({
        has: page.locator('.court-opt-number', { hasText: new RegExp(`^${jersey}$`) }),
      }),
    /** The end tile of a line of bench players that does not hold them all ("5 more"). */
    moreTile: (within) => within.locator('.court-more-tile'),
    /** A bench player comes in for a floor player, by "In for". */
    async substitute(side, coming, going) {
      // What the pad shows decides, not the tile: the options are that player's own, and
      // if they are open already (tapped before), a second tap would close them.
      const options = pad.locator(
        `[data-options="${await tile(side, coming).getAttribute('data-player')}"]`,
      );
      if (!(await options.isVisible())) await tile(side, coming).click();
      await options.waitFor();
      await recorded(() =>
        options
          .locator('[data-act="sub"]')
          .filter({
            has: page.locator('.court-opt-number', { hasText: new RegExp(`^${going}$`) }),
          })
          .click(),
      );
    },
    /** Drags one player's tile onto another's, as a finger or a mouse does. */
    async drag(from, to) {
      const [a, b] = [await from.boundingBox(), await to.boundingBox()];
      if (a === null || b === null) throw new Error('a tile to drag is not on the screen');
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
      await page.mouse.up();
    },
    /** Waits until every tap made is on the server: the banner says "All saved". */
    async saved() {
      await root.locator('[data-saved-banner][data-state="saved"]').waitFor();
    },

    // --- The clock, periods, team fouls and timeouts (step 2.36). ---
    /** The clock in the scoreboard: the button that sets it and picks the period. */
    clock: root.locator('[data-clock]'),
    /** The time the clock shows, "7:58". */
    clockText: async () => (await root.locator('[data-clock-time]').textContent()) ?? '',
    /** Start or Pause, under the scoreboard: `data-state` is start, pause or over. */
    toggle: root.locator('[data-clock-toggle]'),
    /** The large Start clock button in the pad at rest, its × and its line of words. */
    startButton: pad.locator('[data-start-clock]'),
    hideStart: pad.locator('[data-hide-start]'),
    stopReason: pad.locator('[data-stop-reason]'),
    /** At 0:00, in the pad at rest: the way to the next period. */
    pickPeriodButton: pad.locator('[data-pick-period]'),
    /** The form that sets the clock and picks the period. */
    clockSheet: root.locator('[data-clock-sheet] [role="dialog"]'),
    /** A team's fouls this period and its bonus badge, in its box of the scoreboard. */
    teamFouls: (side) => root.locator(`[data-team-fouls="${side}"]`),
    bonus: (side) => root.locator(`[data-bonus="${side}"]`),
    /** The one way to both teams' timeouts, and what the pad then holds. */
    timeoutsButton: root.locator('[data-timeouts-open]'),
    timeoutsPad: pad.locator('[data-timeout-list]'),
    timeoutButton: (side, seconds = 60) =>
      pad.locator(`[data-act="timeout"][data-side="${side}"][data-seconds="${seconds}"]`),
    /** Starts the clock with the button under the scoreboard, and waits until it runs. */
    async startClock() {
      await root.locator('[data-clock-toggle][data-state="start"]').click();
      await root.locator('[data-clock-toggle][data-state="pause"]').waitFor();
    },
    async pauseClock() {
      await root.locator('[data-clock-toggle][data-state="pause"]').click();
      await root.locator('[data-clock-toggle][data-state="start"]').waitFor();
    },
    /** Opens the clock's form and types a time on its keys: '630' is 6:30. Does not set it. */
    async typeClock(digits) {
      const sheet = root.locator('[data-clock-sheet] [role="dialog"]');
      if (!(await sheet.isVisible())) await root.locator('[data-clock]').click();
      await sheet.waitFor();
      for (const digit of digits) await sheet.locator(`[data-key="${digit}"]`).click();
    },
    /** Sets the clock through its form: '630' is 6:30. The clock is stopped by it. */
    async setClock(digits) {
      await this.typeClock(digits);
      await root.locator('[data-clock-sheet] [data-set-clock]').click();
      await root.locator('[data-clock-sheet]').waitFor({ state: 'detached' });
    },
    /** Picks a period in the clock's form: 2 is the second, the first past regulation is overtime. */
    async pickPeriod(period) {
      const sheet = root.locator('[data-clock-sheet] [role="dialog"]');
      if (!(await sheet.isVisible())) await root.locator('[data-clock]').click();
      await recorded(() => sheet.locator(`[data-period-pick="${period}"]`).click());
      await root.locator(`[data-clock] [data-period="${period}"]`).waitFor();
    },
    /** Opens the timeouts and calls one for a team; answers "Record it anyway" if asked. */
    async timeout(side, seconds = 60, { anyway = true } = {}) {
      if (!(await pad.locator('[data-timeout-list]').isVisible())) {
        await root.locator('[data-timeouts-open]').click();
      }
      const button = pad.locator(
        `[data-act="timeout"][data-side="${side}"][data-seconds="${seconds}"]`,
      );
      const asked = (await button.getAttribute('data-none')) !== null;
      if (!asked) return recorded(() => button.click());
      await button.click();
      await pad.locator('[data-timeout-ask]').waitFor();
      if (!anyway) return undefined;
      // Its answers take no tap for a moment after the question is asked.
      await page.waitForTimeout(450);
      return recorded(() => pad.locator('[data-answer="yes"]').click());
    },
  };
}

/** Both teams' starters: the five lowest numbers of each. */
export const starters = [3, 5, 7, 9, 11];

/**
 * A first stretch of a made-up game, played through the screen's own buttons once both
 * lineups are set: baskets, fouls and a turnover, to 10 for the home team and 7 for the
 * visitors. The clock is not started here: Start and Pause are step 2.36's.
 */
export async function playStretch(c) {
  await c.play('home', 5, 'p2');
  await c.play('away', 3, 'p3');
  await c.play('home', 9, 'p2');
  await c.play('home', 7, 'p1');
  await c.play('away', 11, 'p2');
  await c.play('home', 5, 'p3');
  await c.play('away', 7, 'turnover');
  await c.play('home', 11, 'foul');
  await c.play('away', 5, 'p2');
  await c.play('away', 9, 'foul');
  await c.play('home', 3, 'p2');
  await c.play('away', 9, 'foul');
}

/** A made-up game in play: both lineups picked, then the first stretch. */
export async function playOpening(page) {
  const c = court(page);
  await c.pick('home', starters);
  await c.pick('away', starters);
  await playStretch(c);
  return c;
}
