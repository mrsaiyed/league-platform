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
//   node scripts/tracker-shots.mjs --chapter=plays only that chapter: `clock` (steps 2.35
//                                                  and 2.36, states 01 to 40) or `plays`
//                                                  (step 2.37, from 41). Each chapter is a
//                                                  game of its own, so one is played
//                                                  without the other
//   node scripts/tracker-shots.mjs --face=wider    in letters as wide as GitHub's Ubuntu
//                                                  machines and some phones draw (the face
//                                                  the browser test also measures in); or
//                                                  --face="Tahoma", any face this computer
//                                                  has. The files then end in the face:
//                                                  <state>-<width>x<height>-wider.png
//
// The files go to .local/shots/court/<state>-<width>x<height>.png, which git ignores; open
// them with the Read tool, beside the Al-Hadi tracker's own at the same sizes. Each state
// is one entry of `states` below. Step 2.36 added the clock's (19 to 37: stopped with its
// reason, running, the form, timeouts and the question, the bonus and the double bonus on
// each team, halftime, the period picker, overtime, six timeouts taken by each team; and
// after its fix round 38 to 40: a time longer than the period, the Start clock button
// caught in its third of a second not yet ready, the scoreboard at its fullest).
// Step 2.37's are a chapter of their own, `playsStates` (from 41: Undo naming its play,
// Undo with a player's options open, Redo, a foul undone, plays waiting with no
// connection, the play log), played on a game of its own with fifteen a side; the taps
// are in tests/browser/tracker-driver.mjs.
// From state 02 on the game is a stop-clock game, so a foul and a timeout are seen to
// stop a running clock; the made-up league's own format is a running clock.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addPlayers,
  admin,
  bannerShortHtml,
  court,
  evenMorePlayers,
  playStretch,
  scorekeeper,
  sizes,
  starters,
  stopClockGame,
  trackerPath,
  widerFace,
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
// The screen draws with the face the device has, so a picture taken on this computer
// shows this computer's letters. `--face` draws it in another: `wider` is the face the
// browser test measures the fit in (tracker-driver.mjs).
const faceAsked = process.argv.find((arg) => arg.startsWith('--face='))?.slice('--face='.length);
const face = faceAsked === 'wider' ? widerFace : (faceAsked ?? '');
const faceEnding =
  faceAsked === undefined ? '' : `-${faceAsked.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

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
    about:
      'the last period’s clock ran out: "End of H2.", and since step 2.37 End game offered in the pad when a team is ahead',
    run: async (page) => {
      const c = court(page);
      // Two team fouls for the home team and one for the visitors in the second half:
      // overtime carries them on.
      await c.play('home', 3, 'foul');
      await c.play('home', 20, 'foul');
      await c.play('away', 21, 'foul');
      await c.setClock('2');
      await c.startClock().catch(() => undefined);
      // The way to the next period at a level score, End game with a team ahead.
      await c.pickPeriodButton.or(c.endOffer).first().waitFor();
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
  {
    name: '37-timeouts-six-each',
    about:
      'six timeouts taken by each team: the latest two written out, then "and 4 earlier"; nothing scrolls',
    run: async (page) => {
      const c = court(page);
      const takenBy = async (side) => {
        if (!(await c.timeoutsPad.isVisible())) await c.timeoutsButton.click();
        await c.timeoutsPad.waitFor();
        return Number(
          await c.timeoutsPad
            .locator(`[data-timeouts-of="${side}"]`)
            .getAttribute('data-taken-count'),
        );
      };
      for (const side of ['home', 'away']) {
        while ((await takenBy(side)) < 6) await c.timeout(side);
      }
      await page.waitForTimeout(3400);
      if (!(await c.timeoutsPad.isVisible())) await c.timeoutsButton.click();
      await c.timeoutsPad.waitFor();
    },
  },
  {
    name: '38-clock-longer-than-period',
    about: 'a time longer than the period typed in the clock’s form: refused in words, not offered',
    run: async (page) => {
      const c = court(page);
      await c.pad.locator('.court-close').click();
      // Overtime is 5:00 long here: 20:00 is longer.
      await c.typeClock('2000');
      await c.clockSheet.locator('[data-clock-note]', { hasText: /or less\.$/ }).waitFor();
    },
  },
  {
    name: '39-start-clock-not-ready',
    about:
      'the Start clock button in the third of a second after the pad comes to rest: hollow, its × faint',
    run: async (page) => {
      const c = court(page);
      await c.clockSheet.locator('.court-close').click();
      await c.root.locator('[data-clock-sheet]').waitFor({ state: 'detached' });
    },
    // Taken inside the third of a second, for each size: a player's options are opened
    // and closed with ×, and the picture is kept only if the button was still resting
    // once it was taken; otherwise it is taken again.
    shoot: async (page, file) => {
      const c = court(page);
      for (let tries = 0; tries < 8; tries += 1) {
        const tile = c.root.locator('[data-floor="home"] .court-tile').first();
        await tile.click();
        await c.pad.locator('[data-options] .court-close').waitFor();
        await page.waitForTimeout(200);
        await c.pad.locator('[data-options] .court-close').click();
        await c.pad.locator('[data-start-bar][data-resting]').waitFor({ timeout: 2000 });
        await page.screenshot({ path: file });
        if ((await c.pad.locator('[data-start-bar][data-resting]').count()) === 1) return;
      }
      throw new Error('the Start clock button could not be caught resting in eight tries');
    },
  },
  {
    name: '40-scoreboard-fullest',
    about:
      'the scoreboard at its fullest: both teams in the double bonus, three-figure scores, the longest the banner says (four things) and long names, one of two lines (written in): nothing above the two teams grows',
    sizes: ['phone-lying', 'phone-in-browser', 'phone-upright'],
    run: async (page) => {
      const c = court(page);
      await c.pad.locator('[data-rest]').waitFor();
      await page.context().setOffline(true);
      // Ten team fouls a side this period, on floor players with room for more, then
      // baskets to past a hundred: all kept on the device, so the banner is waiting.
      await page.evaluate(async () => {
        const drawn = () => new Promise((resolve) => setTimeout(resolve, 0));
        const tap = async (tile, act) => {
          tile.click();
          while (document.querySelector(`[data-pad] [data-act="${act}"]`) === null) await drawn();
          document.querySelector(`[data-pad] [data-act="${act}"]`).click();
          while (document.querySelector('[data-pad] [data-rest]') === null) await drawn();
        };
        const fouls = (tile) => Number(tile.querySelector('[data-fouls]')?.dataset.fouls ?? 0);
        for (const side of ['home', 'away']) {
          const count = () =>
            Number(document.querySelector(`[data-team-fouls="${side}"]`).textContent.match(/\d+/));
          while (count() < 10) {
            const tiles = [...document.querySelectorAll(`[data-floor="${side}"] .court-tile`)];
            const tile = tiles
              .filter((t) => !t.hasAttribute('data-out'))
              .sort((a, b) => fouls(a) - fouls(b))[0];
            await tap(tile, 'foul');
          }
          const floor = `[data-floor="${side}"] .court-tile:not([data-out])`;
          const scored = () =>
            Number(document.querySelector(`[data-score="${side}"] .court-score-value`).textContent);
          while (scored() < 100) await tap(document.querySelector(floor), 'p3');
        }
      });
      await c.root.locator('[data-bonus="home"][data-level="2"]').waitFor();
      await c.root.locator('[data-bonus="away"][data-level="2"]').waitFor();
      await c.root.locator('[data-saved-banner][data-state="waiting"]').waitFor();
      // Written into the page for the picture only: the banner's four lines at once
      // (queue-banner.ts: the storage, the connection, plays waiting, plays not saved),
      // in its long form and in the short one a phone shows, drawn as the screen draws
      // it, and long made-up names: one of fifteen letters, one of two lines.
      const waiting = (await c.banner.locator('.court-banner-short').textContent()) ?? '';
      await page.evaluate(
        (short) => {
          const long = document.querySelector('[data-saved-banner] .court-banner-long');
          long.textContent = `This device could not save to its storage · ${long.textContent} · 12 plays not saved`;
          document.querySelector('[data-saved-banner] .court-banner-short').innerHTML = short;
          const [home, away] = document.querySelectorAll('[data-score] .court-score-name');
          home.textContent = 'Riverside Bears';
          away.textContent = 'Northside Academy Hawks of the Valley';
        },
        bannerShortHtml(['Storage failed', ...waiting.split(' · '), '12 not saved']),
      );
    },
  },
];

/**
 * Step 2.37's states: Undo and Redo, the latest play, the play log. A game of their own,
 * played from its start on a made-up world of its own (the game above is in overtime at
 * a hundred each by its end), with fifteen a side and a stop clock, so a foul stops the
 * clock and its undo has something to say.
 */
const playsStates = [
  {
    name: '41-latest-play',
    about:
      'a game in play, the clock running: Undo names the play it takes back, Redo is greyed, and the pad at rest begins with the latest play’s line',
    run: async (page) => {
      const c = court(page);
      await c.open();
      await c.pick('home', starters);
      await c.pick('away', starters);
      await c.startClock();
      await playStretch(c);
      await c.saved();
      await page.waitForTimeout(3400);
      // The last foul of the stretch stopped the clock: it runs again here.
      await c.startClock();
    },
  },
  {
    name: '42-undo-options-open',
    about:
      'Undo tapped with a player’s options open: the options stay where they are, what it took back is said over the player’s line, and Undo names the play before it',
    run: async (page) => {
      const c = court(page);
      // A wrong basket, then the next player tapped before the mistake is seen.
      await c.play('home', 7, 'p3');
      await c.saved();
      await c.tile('away', 5).click();
      await c.pad.locator('[data-options]').waitFor();
      await c.undo();
      await c.said.filter({ hasText: /^Undone/ }).waitFor();
    },
  },
  {
    name: '43-redo',
    about: 'Redo brought the basket back: said in the pad at rest, over the latest play’s line',
    run: async (page) => {
      const c = court(page);
      await page.waitForTimeout(3400);
      await c.pad.locator('.court-close').click();
      await c.redo();
      await c.said.filter({ hasText: /^Brought back/ }).waitFor();
    },
  },
  {
    name: '44-foul-undone',
    about:
      'a foul that had stopped the clock, undone: the screen says the clock stays stopped, and the Start clock button is in the pad',
    run: async (page) => {
      const c = court(page);
      await page.waitForTimeout(3400);
      await c.play('away', 7, 'foul');
      await c.startButton.waitFor();
      await page.waitForTimeout(3400);
      await c.undo();
      await c.said.filter({ hasText: /^Undone/ }).waitFor();
    },
  },
  {
    name: '45-nothing-to-redo',
    about: 'Redo tapped while it is greyed: it says why in a sentence',
    run: async (page) => {
      const c = court(page);
      await page.waitForTimeout(3400);
      // A new play empties Redo.
      await c.play('home', 9, 'p2');
      // Greyed is not switched off: a finger can tap it, and it then says why.
      await c.redoButton.click({ force: true });
      await c.said.filter({ hasText: /redo/i }).waitFor();
    },
  },
  {
    name: '46-plays-waiting',
    about:
      'no connection: the banner says so and how many plays wait, and the latest play’s line says it is not sent yet',
    run: async (page) => {
      const c = court(page);
      await page.waitForTimeout(3400);
      await c.startClock();
      await page.context().setOffline(true);
      await c.play('away', 3, 'p2');
      await c.play('home', 5, 'turnover');
      await c.root.locator('[data-saved-banner][data-state="waiting"]').waitFor();
      await page.waitForTimeout(3400);
    },
  },
  {
    name: '47-play-log',
    about:
      'the play log, open over the screen: every play newest first with its period and clock, the score after a basket, and the two the league does not have yet dimmed and saying so',
    run: async (page) => {
      await court(page).openLog();
    },
  },
];

/**
 * Step 2.37's states of ending a game, from 48: Mark not started and its question, End
 * game behind More, the question in the middle of a period and at the end, the level
 * score, End offered in the pad, the final panel not sent and saved, the End taken back,
 * a tile tapped on a final game, the Reopen question and the game carried on. A game of
 * its own with fifteen a side, on the made-up league's own format: two 20-minute halves
 * on a running clock, as the founder's first test is played.
 */
const endStates = [
  {
    name: '48-not-started-ask',
    about:
      'a game started by mistake, nothing recorded yet: Mark not started (behind More) asks first, in the pad',
    run: async (page) => {
      const c = court(page);
      await c.open();
      await c.pick('home', starters);
      await c.pick('away', starters);
      await c.startClock();
      await c.fromMore('more-not-started');
      await c.notStartedAsk.waitFor();
    },
  },
  {
    name: '49-more-end',
    about:
      'More on a game in play: End game first, then Swap colors, the play log and Mark not started',
    run: async (page) => {
      const c = court(page);
      await c.answer('no').click();
      await playStretch(c);
      await c.saved();
      await page.waitForTimeout(3400);
      await c.more.click();
      await c.sheet.waitFor();
    },
  },
  {
    name: '50-not-started-undo-first',
    about:
      'Mark not started with baskets and fouls standing: a scorekeeper is told to undo them first, and is offered no "yes"',
    run: async (page) => {
      const c = court(page);
      await c.sheet.locator('[data-more-not-started]').click();
      await c.notStartedAsk.waitFor();
    },
  },
  {
    name: '51-end-ask-early',
    about:
      'End game from More in the middle of the second half: the question says the score, that time is still on the clock, and what ending does',
    run: async (page) => {
      const c = court(page);
      await c.answer('no').click();
      await c.pickPeriod(2);
      await c.startClock();
      await c.fromMore('more-end');
      await c.endAsk.waitFor();
    },
  },
  {
    name: '52-end-level',
    about:
      'End game at a level score in a season with no ties: refused on the device at once, in words that say to play overtime',
    run: async (page) => {
      const c = court(page);
      await c.answer('no').click();
      // 10 to 7 after the first stretch: a three makes it level.
      await c.play('away', 3, 'p3');
      await c.saved();
      await page.waitForTimeout(3400);
      await c.fromMore('more-end');
      await c.endRefused.waitFor();
    },
  },
  {
    name: '53-end-offered',
    about:
      'the last period has run out with a team ahead: the pad’s first line offers End game, in gold',
    run: async (page) => {
      const c = court(page);
      await c.answer('no').click();
      await c.play('home', 5, 'p2');
      await c.saved();
      await c.setClock('2');
      await c.startClock().catch(() => undefined);
      await c.endOffer.waitFor();
      await page.waitForTimeout(3400);
    },
  },
  {
    name: '54-end-ask',
    about: 'End game tapped in the pad: the question, with its answers in the pad’s lowest band',
    run: async (page) => {
      const c = court(page);
      await c.endOffer.click();
      await c.endAsk.waitFor();
    },
  },
  {
    name: '55-final-not-sent',
    about:
      'the game ended with no connection: the final panel says who won and that the result is not sent yet, and offers "Take back End game"',
    run: async (page) => {
      const c = court(page);
      await page.context().setOffline(true);
      await c.answer('yes').click();
      await c.pad.locator('[data-final="not-sent"]').waitFor();
    },
  },
  {
    name: '56-end-taken-back',
    about:
      'the End taken back on the device, with no connection: the game is live again, and the screen says the clock is stopped',
    run: async (page) => {
      const c = court(page);
      await c.finalButton('take-back').click();
      await c.said.filter({ hasText: /^End game taken back/ }).waitFor();
    },
  },
  {
    name: '57-final-saved',
    about:
      'the game ended and the league has it: the final panel says so, and "Reopen game" with the time left',
    run: async (page) => {
      const c = court(page);
      await page.context().setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await c.saved();
      await page.waitForTimeout(3400);
      await c.endOffer.click();
      await c.endAsk.waitFor();
      await c.answer('yes').click();
      await c.pad.locator('[data-final="saved"]').waitFor();
      await c.pad
        .locator('[data-reopen-line]')
        .filter({ hasText: /minutes/ })
        .waitFor();
    },
  },
  {
    name: '58-final-tile-tapped',
    about: 'a player tapped on a final game: the screen says it is final, and to reopen it',
    run: async (page) => {
      const c = court(page);
      await c.tile('home', 5).click();
      await c.said.filter({ hasText: /^This game is final/ }).waitFor();
    },
  },
  {
    name: '59-reopen-ask',
    about:
      '"Reopen game" tapped: the question says what reopening does, with the reason already filled in',
    run: async (page) => {
      const c = court(page);
      await page.waitForTimeout(3400);
      await c.finalButton('reopen').click();
      await c.reopenAsk.waitFor();
    },
  },
  {
    name: '60-reopened',
    about: 'reopened: the same screen carries on, live, the clock stopped where the End found it',
    run: async (page) => {
      const c = court(page);
      await c.answer('yes').click();
      await c.said.filter({ hasText: /live again/ }).waitFor();
    },
  },
];

/**
 * The same two doors for someone who may correct games (a league admin at the table): the
 * Mark not started question says how many plays and what score will be cleared and asks
 * for a reason from the fixed list, and a final game can be reopened at any time.
 */
const endAdminStates = [
  {
    name: '61-not-started-clears',
    about:
      'Mark not started for someone who may correct games, with plays standing: how many plays and what score are cleared, and a reason from the list',
    run: async (page) => {
      const c = court(page);
      await c.open();
      await c.pick('home', starters);
      await c.pick('away', starters);
      await c.startClock();
      await playStretch(c);
      await c.saved();
      await page.waitForTimeout(3400);
      await c.fromMore('more-not-started');
      await c.notStartedAsk.waitFor();
    },
  },
  {
    name: '62-final-reopen-always',
    about: 'a game ended by someone who may correct games: it can be reopened at any time',
    run: async (page) => {
      const c = court(page);
      await c.answer('no').click();
      await c.endGame();
      await c.pad.locator('[data-final="saved"]').waitFor();
      await c.pad
        .locator('[data-reopen-line]')
        .filter({ hasText: /any time/ })
        .waitFor();
    },
  },
];

/** The chapters photographed: each is a game of its own on a made-up world of its own. */
const chapters = [
  {
    name: 'clock',
    about: 'steps 2.35 and 2.36: the frame, the clock, fouls and timeouts',
    states,
    prepare: async (origin) => {
      await addPlayers(origin);
    },
  },
  {
    name: 'plays',
    about: 'step 2.37: Undo, Redo, the play log',
    states: playsStates,
    prepare: async (origin) => {
      // Fifteen a side, and a stop clock set from another tablet before the game is opened.
      await addPlayers(origin);
      await addPlayers(origin, evenMorePlayers);
      await stopClockGame(origin);
    },
  },
  {
    name: 'end',
    about: 'step 2.37: End game, the final panel, Reopen and Mark not started',
    states: endStates,
    prepare: async (origin) => {
      await addPlayers(origin);
      await addPlayers(origin, evenMorePlayers);
    },
  },
  {
    name: 'end-admin',
    about: 'step 2.37: the same two doors for someone who may correct games',
    states: endAdminStates,
    as: admin,
    prepare: async (origin) => {
      await addPlayers(origin);
      await addPlayers(origin, evenMorePlayers);
    },
  },
];
const chapterAsked = process.argv
  .find((arg) => arg.startsWith('--chapter='))
  ?.slice('--chapter='.length);

async function main() {
  if (!flag('dev') && !flag('no-build')) {
    if (!(await buildNext())) throw new Error('next build failed or took over 10 minutes');
  }
  for (const chapter of chapters) {
    if (chapterAsked !== undefined && chapterAsked !== chapter.name) continue;
    // A chapter none of whose states is asked for is not played at all.
    const wanted = (state) => only === undefined || only.some((word) => state.name.includes(word));
    if (!chapter.states.some(wanted)) continue;
    console.log(`--- ${chapter.name}: ${chapter.about}`);
    await shootChapter(chapter);
  }
  console.log(`pictures saved in ${out}`);
}

async function shootChapter({ states, prepare, as = scorekeeper }) {
  const origin = `http://localhost:${await freePort()}`;
  const server = startNext([flag('dev') ? 'dev' : 'start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  let browser;
  try {
    await waitFor(`${origin}/`, server);
    await prepare(origin);
    browser = await launch();
    const [first] = sizes;
    const context = await browser.newContext({
      viewport: { width: first.width, height: first.height },
    });
    await context.addCookies([{ ...as, url: origin }]);
    if (face !== '') {
      // On every page the game is opened in, from its first drawing, as a device's own
      // face is.
      await context.addInitScript((family) => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.textContent = `.court, .court * { font-family: ${family}, sans-serif !important; }`;
          document.head.append(style);
        });
      }, face);
    }
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
        const file = path.join(out, `${state.name}-${size.width}x${size.height}${faceEnding}.png`);
        if (state.shoot === undefined) await page.screenshot({ path: file });
        else await state.shoot(page, file);
      }
      await page.setViewportSize({ width: first.width, height: first.height });
      console.log(`${state.name}: ${state.about}`);
    }
    if (problems.length > 0) throw new Error(`the page reported: ${problems.join('; ')}`);
  } finally {
    await browser?.close();
    server.child.kill();
  }
}

await main();
