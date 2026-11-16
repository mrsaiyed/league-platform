// Pictures of the scoring screen with a game IN PLAY, at the five sizes it is designed for
// (the four of docs/build/DESIGN.md section 7, line 8, and 390 x 664: what a phone's
// browser really shows; finding L4 of the 2.107 audit). The last states are played with
// fifteen a side, so a long bench is seen too. scripts/shots.mjs
// photographs pages as they open; a scoring screen has to be played to be seen, so this
// plays a made-up game through the screen's own buttons and takes a picture of each state.
// The web app runs on its made-up stand-in (APP_ENV=test): nothing leaves this computer.
//
//   node scripts/tracker-shots.mjs                 builds the web app, then takes them
//   node scripts/tracker-shots.mjs --dev           `next dev` instead of a build
//   node scripts/tracker-shots.mjs --no-build      serves the build that is already here
//   node scripts/tracker-shots.mjs --only=options  only the states whose name contains this
//
// The files go to .local/shots/court/<state>-<width>x<height>.png, which git ignores; open
// them with the Read tool, beside the Al-Hadi tracker's own at the same sizes. Each state
// is one entry of `states` below. Step 2.36 added the clock's (19 to 36: stopped with its
// reason, running, the form, timeouts and the question, the bonus and the double bonus on
// each team, halftime, the period picker, overtime); step 2.37 adds its own (offline,
// read-only, final) by adding entries, with the taps in tests/browser/tracker-driver.mjs.
// From state 02 on the game is a stop-clock game, so a foul and a timeout are seen to
// stop a running clock; the made-up league's own format is a running clock.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addPlayers,
  court,
  evenMorePlayers,
  playStretch,
  scorekeeper,
  sizes,
  stopClockGame,
  trackerPath,
} from '../tests/browser/tracker-driver.mjs';
import {
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
} from '../tests/browser/web-browser-kit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.local/shots/court');
const flag = (name) => process.argv.includes(`--${name}`);
const only = process.argv
  .find((arg) => arg.startsWith('--only='))
  ?.slice('--only='.length)
  .split(',');

/**
 * The states photographed, in the order a game reaches them. `run` brings the screen from
 * the state before to this one; it is run even when the state is left out by `--only`.
 * `sizes`, when given, names the sizes (tracker-driver.mjs) it is photographed at.
 */
const states = [
  {
    name: '01-format',
    about: 'the game is opened: the format is checked, in the tracker’s own frame',
    run: async (page) => {
      await page.getByRole('heading', { level: 2, name: 'Check the game format' }).waitFor();
    },
  },
  {
    name: '02-lineups',
    about: 'before tip-off: nobody picked yet',
    run: async (page, origin) => {
      const c = court(page);
      await c.open();
      // The made-up league plays a running clock, under which a foul or a timeout does
      // not stop the clock. So that the pictures of step 2.36 show a clock stopped for a
      // foul and for a timeout, the game is let go of, switched to a stop clock from
      // another tablet (the engine's own switch), and opened again.
      await c.leave();
      await stopClockGame(origin);
      await page.goto(`${origin}${trackerPath()}`);
      await c.open();
    },
  },
  {
    name: '03-picking',
    about: 'three of the home team’s starters tapped; the visitors’ five are set',
    run: async (page) => {
      const c = court(page);
      await c.pick('home', [3, 5, 7]);
      await c.pick('away', [3, 5, 7, 9, 11]);
    },
  },
  {
    name: '04-tip-off',
    about: 'both lineups set, nothing scored yet',
    run: async (page) => {
      await court(page).pick('home', [9, 11]);
    },
  },
  {
    name: '05-in-play',
    about: 'a game in play, nobody picked: the pad at rest',
    run: async (page) => {
      const c = court(page);
      await playStretch(c);
      await c.saved();
      // The sentence a turnover says has gone by now.
      await page.waitForTimeout(3400);
    },
  },
  {
    name: '06-options-floor',
    about: 'a floor player tapped: who it is, who can come in, +1 +2 +3, Foul, −Foul, Turnover',
    run: async (page) => {
      await court(page).tile('home', 5).click();
    },
  },
  {
    name: '07-options-bench',
    about: 'a bench player tapped: "In for" each of the five on the court',
    run: async (page) => {
      await court(page).tile('away', 21).click();
    },
  },
  {
    name: '08-substituted',
    about: 'the substitution made by "In for", and one more by dragging',
    run: async (page) => {
      const c = court(page);
      await c.substitute('away', 21, 9);
      await c.recorded(() => c.drag(c.tile('home', 20), c.tile('home', 11)));
      await c.saved();
    },
  },
  {
    name: '09-turnovers',
    about: 'a team’s turnovers open in the pad, with a team turnover',
    run: async (page) => {
      const c = court(page);
      await c.play('away', 3, 'turnover');
      await c.play('away', 7, 'turnover');
      await c.turnoversChip('away').click();
      await c.choose('team-turnover');
      await c.saved();
      await page.waitForTimeout(3400);
    },
  },
  {
    name: '10-fouled-out',
    about: 'a player at the league’s foul limit: marked, and still tappable',
    run: async (page) => {
      const c = court(page);
      await c.pad.locator('.court-close').click();
      for (let i = 0; i < 5; i += 1) await c.play('home', 7, 'foul');
      await c.saved();
      await c.tile('home', 7).click();
    },
  },
  {
    name: '11-said',
    about: 'a wrong drag is explained in a sentence',
    run: async (page) => {
      const c = court(page);
      await c.pad.locator('.court-close').click();
      await c.drag(c.tile('home', 21), c.tile('away', 3));
      await c.said.filter({ hasText: /./ }).waitFor();
    },
  },
  {
    name: '12-more',
    about: 'the buttons used once a game, behind More',
    run: async (page) => {
      await court(page).more.click();
      await court(page).sheet.waitFor();
    },
  },
  {
    name: '13-swapped',
    about: 'the colors swapped: the home team is now drawn dark',
    run: async (page) => {
      const c = court(page);
      await c.sheet.locator('[data-swap-colors]').click();
      await c.root.locator('[data-score="home"][data-color="dark"]').waitFor();
      await c.saved();
      await page.waitForTimeout(3400);
    },
  },
  {
    name: '14-bench',
    about: 'a team’s whole bench opened in the pad (the way to it on a short phone)',
    run: async (page) => {
      const c = court(page);
      // The button is drawn only where the bench is folded away; it is there at every size.
      await c.benchButton('away').evaluate((button) => button.click());
      await c.pad.locator('[data-bench-list="away"]').waitFor();
    },
  },
  {
    name: '15-fifteen-a-side',
    about: 'fifteen a side: a bench of ten ends in a tile that says how many more',
    run: async (page, origin) => {
      const c = court(page);
      // The game is let go of, three more a side are added at the table, and it is
      // opened again.
      await c.pad.locator('.court-close').click();
      await c.more.click();
      await Promise.all([
        page.waitForURL((url) => !url.pathname.includes('/score/')),
        c.sheet.getByRole('link', { name: 'Back to your games' }).click(),
      ]);
      await addPlayers(origin, evenMorePlayers);
      await page.goto(`${origin}${trackerPath()}`);
      await c.open();
      await c.root.locator('[data-floor="home"] .court-tile').first().waitFor();
    },
  },
  {
    name: '16-fifteen-sub-in',
    about: 'fifteen a side: "Sub in" for a floor player, ending in the way to the rest',
    run: async (page) => {
      const c = court(page);
      await c.root.locator('[data-floor="home"] .court-tile').first().click();
      await c.pad.locator('[data-options]').waitFor();
    },
  },
  {
    name: '17-fifteen-bench',
    about: 'fifteen a side: the whole bench, to come in for that player',
    run: async (page) => {
      const c = court(page);
      await c.moreTile(c.pad).click();
      await c.pad.locator('[data-bench-list="home"]').waitFor();
    },
  },
  {
    name: '18-account',
    about: 'the account button’s menu open (step 2.127): signing a shared tablet out',
    // Where the first row is shortest: the phone in its browser, and lying down.
    sizes: ['phone-in-browser', 'phone-lying'],
    run: async (page) => {
      const c = court(page);
      await c.pad.locator('.court-close').click();
      await c.pad.locator('[data-rest]').waitFor();
      await c.root.locator('[data-account] > summary').click();
      await c.root.locator('[data-account] .site-account-panel').waitFor();
    },
  },
  // --- Step 2.36: the clock, periods, team fouls and timeouts. The game is a stop-clock
  // game here (a foul or a timeout stops a running clock), set before tip-off. ---
  {
    name: '19-clock-stopped',
    about: 'the clock stopped by hand: the Start clock button in the pad, with why',
    run: async (page) => {
      const c = court(page);
      await c.root.locator('[data-account] > summary').click();
      await c.startClock();
      await page.waitForTimeout(2600);
      await c.pauseClock();
      await c.startButton.waitFor();
    },
  },
  {
    name: '20-clock-running',
    about: 'the clock running: Pause, in a word and a shape of its own; the pad at rest',
    run: async (page) => {
      // Started with the large button in the pad, where the thumb is.
      await court(page).startButton.click();
      await court(page).root.locator('[data-clock-toggle][data-state="pause"]').waitFor();
    },
  },
  {
    name: '21-stopped-for-a-foul',
    about: 'a foul on the running clock stopped it: said, and the Start clock button says why',
    run: async (page) => {
      const c = court(page);
      await c.play('away', 3, 'foul');
      await c.startButton.waitFor();
    },
  },
  {
    name: '22-options-clock-stopped',
    about: 'a player’s options while the clock is stopped: a free throw is scored as always',
    run: async (page) => {
      const c = court(page);
      await page.waitForTimeout(3400);
      await c.tile('home', 3).click();
      await c.pad.locator('[data-options]').waitFor();
    },
  },
  {
    name: '23-set-clock',
    about:
      'the clock tapped: the period picker and the form with large keys, 20:00 typed, which puts time back on',
    run: async (page) => {
      const c = court(page);
      await c.pad.locator('.court-close').click();
      await c.typeClock('2000');
    },
  },
  {
    name: '24-clock-set',
    about: 'the clock set: said, with what came off the players’ minutes when time went back on',
    run: async (page) => {
      const c = court(page);
      await c.setClock('');
      await c.said.filter({ hasText: /./ }).waitFor();
    },
  },
  {
    name: '25-timeouts',
    about: 'both teams’ timeouts in the pad: how many are left by length, and the rule',
    run: async (page) => {
      const c = court(page);
      await c.startClock();
      await c.timeoutsButton.click();
      await c.timeoutsPad.waitFor();
    },
  },
  {
    name: '26-timeout-taken',
    about: 'a timeout taken on the running clock: said, and the clock stopped for it',
    run: async (page) => {
      const c = court(page);
      await c.timeout('home');
      await c.startButton.waitFor();
    },
  },
  {
    name: '27-timeout-question',
    about: 'a team with none left: asked first, before one more is recorded',
    run: async (page) => {
      const c = court(page);
      await c.timeout('home');
      await page.waitForTimeout(3400);
      await c.timeout('home', 60, { anyway: false });
    },
  },
  {
    name: '28-timeouts-used',
    about: 'timeouts used up: "none left", those taken with period and time, − for the latest',
    run: async (page) => {
      const c = court(page);
      await page.waitForTimeout(450);
      await c.recorded(() => c.pad.locator('[data-answer="yes"]').click());
      await page.waitForTimeout(3400);
      await c.timeout('away');
      await page.waitForTimeout(3400);
      await c.timeoutsButton.click();
      await c.timeoutsPad.waitFor();
    },
  },
  {
    name: '29-bonus',
    about: 'the visitors’ seventh team foul: the home team’s Bonus badge, the horn’s sentence',
    run: async (page) => {
      const c = court(page);
      await c.pad.locator('.court-close').click();
      // The visitors have three team fouls this half; four more is the bonus.
      for (const jersey of [5, 7, 11, 5]) await c.play('away', jersey, 'foul');
      await c.bonus('home').waitFor();
    },
  },
  {
    name: '30-double-bonus',
    about: 'the double bonus for one team and the bonus for the other, each in its box',
    run: async (page) => {
      const c = court(page);
      for (const jersey of [7, 11, 5]) await c.play('away', jersey, 'foul');
      // The home team has six; its seventh puts the visitors in the bonus.
      await c.play('home', 3, 'foul');
      await c.bonus('away').waitFor();
    },
  },
  {
    name: '31-both-double-bonus',
    about: 'both teams in the double bonus: the fullest the scoreboard’s boxes get',
    run: async (page) => {
      const c = court(page);
      for (const jersey of [5, 9, 11]) await c.play('home', jersey, 'foul');
      await c.root.locator('[data-bonus="away"][data-level="2"]').waitFor();
      await page.waitForTimeout(3400);
    },
  },
  {
    name: '32-halftime',
    about:
      'the clock ran out: "Halftime.", Start greyed as "Period over", the way to the next period',
    run: async (page) => {
      const c = court(page);
      await c.setClock('2');
      await c.startClock().catch(() => undefined);
      await c.pickPeriodButton.waitFor();
    },
  },
  {
    name: '33-period-picker',
    about: 'the period picker at 0:00: every period and three overtimes, the next one in gold',
    run: async (page) => {
      const c = court(page);
      await c.pickPeriodButton.click();
      await c.clockSheet.waitFor();
    },
  },
  {
    name: '34-second-half',
    about: 'the second half picked: the clock at its length, team fouls start again',
    run: async (page) => {
      const c = court(page);
      await c.pickPeriod(2);
      await c.startButton.waitFor();
    },
  },
  {
    name: '35-end-of-period',
    about: 'the last period’s clock ran out: "End of H2."',
    run: async (page) => {
      const c = court(page);
      // Two team fouls for the home team and one for the visitors in the second half:
      // overtime carries them on.
      await c.play('home', 3, 'foul');
      await c.play('home', 20, 'foul');
      await c.play('away', 21, 'foul');
      await c.setClock('2');
      await c.startClock().catch(() => undefined);
      await c.pickPeriodButton.waitFor();
    },
  },
  {
    name: '36-overtime',
    about: 'overtime picked: OT1, its own length, and the fouls carried on from the last period',
    run: async (page) => {
      const c = court(page);
      await c.pickPeriod(3);
      await c.startButton.waitFor();
    },
  },
];

async function main() {
  if (!flag('dev') && !flag('no-build')) {
    if (!(await buildNext())) throw new Error('next build failed or took over 10 minutes');
  }
  const origin = `http://localhost:${await freePort()}`;
  const server = startNext([flag('dev') ? 'dev' : 'start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  let browser;
  try {
    await waitFor(`${origin}/`, server);
    await addPlayers(origin);
    browser = await launch();
    const [first] = sizes;
    const context = await browser.newContext({
      viewport: { width: first.width, height: first.height },
    });
    await context.addCookies([{ ...scorekeeper, url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(flag('dev') ? 120_000 : 30_000);
    const problems = [];
    page.on('pageerror', (error) => problems.push(error.message));
    await page.goto(`${origin}${trackerPath()}`);
    fs.mkdirSync(out, { recursive: true });
    for (const state of states) {
      await state.run(page, origin);
      if (only !== undefined && !only.some((word) => state.name.includes(word))) continue;
      // What was just tapped has stopped showing on its tile.
      await page.waitForTimeout(800);
      for (const size of sizes) {
        // A state photographed at some sizes only names them.
        if (state.sizes !== undefined && !state.sizes.includes(size.name)) continue;
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.waitForTimeout(200);
        await page.screenshot({
          path: path.join(out, `${state.name}-${size.width}x${size.height}.png`),
        });
      }
      await page.setViewportSize({ width: first.width, height: first.height });
      console.log(`${state.name}: ${state.about}`);
    }
    if (problems.length > 0) throw new Error(`the page reported: ${problems.join('; ')}`);
    console.log(`pictures saved in ${out}`);
  } finally {
    await browser?.close();
    server.child.kill();
  }
}

await main();
