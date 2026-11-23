// Pictures of every screen, so that whoever designs or reviews a screen has seen it
// (docs/build/DESIGN.md, section 2). The web app runs on its made-up stand-in (APP_ENV=test):
// made-up leagues and people, no database, nothing leaves this computer.
//
//   node scripts/shots.mjs                      builds the web app in this folder, then takes them
//   node scripts/shots.mjs --dev                `next dev` instead of a build (quicker to start)
//   node scripts/shots.mjs --no-build           serves the build that is already here
//   node scripts/shots.mjs --only=home,admin    only pictures whose name contains one of these
//   node scripts/shots.mjs --design=pine        the first made-up league under a named design
//   node scripts/shots.mjs --binned-team=badgers  with that team of the first league in the bin
//   node scripts/shots.mjs --measure            also measures the contrast of every public page
//   LOCAL_NOW=<UTC time> node scripts/shots.mjs  the made-up world's clock starts there, as in
//                                                the browser tests (a game day at noon: worldAtNoon)
//
// `--measure` sets every piece of text on each public page it pictures against what the
// text stands on, and every control's edge against what is around it, and writes what it
// found to `.local/shots/contrast.txt` (`contrast-in-<design>.txt` under a named design):
// measured in the browser, from the colors as they are drawn (see measureContrast).
//
// `--only=states` takes what the pointer and the keyboard do to each kind of link, button,
// card and picker (`…-states-….jpg`, the pointer over one and the keyboard on another in
// the same picture), and `--only=header-scrolled` the laptop header while the page is
// scrolled: both in the first league, and under a named design too.
//
// `--design=<name>` proves that every shared piece takes its colors from a league's design
// (docs/build/DESIGN.md, section 4, line 28). It starts the web app with the first made-up
// league drawn under that design (the LOCAL_DESIGN setting, which the app refuses outside
// local work and tests, as it does the stand-in itself) and takes that league's public
// pages only, named `…-in-<name>.jpg`. The names are the starting designs (crest,
// crest-light, midnight-gold, clean-court) and the made-up ones kept for pictures (pine, a
// green league, and ember, a light one whose main color is a bright orange:
// apps/web/src/server/stand-in-designs.ts); any other name stops the app as it starts.
//
// Each screen is taken whole, at two widths: 390 (a phone) and 1280 (a laptop). The files go
// to .local/shots/<width>/<name>.jpg, which git ignores. Open them with the Read tool. A
// lane runs this in its own folder, so the pictures show that lane's work.
//
// A game's page is taken in each state it has (`--only=game`): `game-live` and `game-final`
// are the two made-up games a tracker scores (this script taps a short game into each
// first, through the tracker's own endpoints), with their play-by-play and players;
// `game-result`, `game-forfeit`, `game-postponed`, `game-scheduled` and `game-undated` are
// games of the made-up schedules. Only the first made-up league has tracked games, so
// `game-live-light` and `game-final-light` are those two pages drawn with the second
// league's design values, which is all that differs between two leagues' looks (T-90).
//
// `--only=long-name` takes the public pages at 320 and 390 wide with long made-up names put
// in: a team's of 36 letters in the first row of every table, on a scoreboard, a game card
// and a team card and in a team page's heading, and a league's of 54 letters in the header.
// Pages with tables are taken as they open and with the tables scrolled to their far end
// (.local/shots/320 and /390, `…-long-name.jpg` and `…-long-name-scrolled.jpg`).
//
// `--only=menu` takes the phone menu, open, at 390 in each league's look (`…-menu-open.jpg`).
//
// `--only=overtime` plays a game won in overtime and takes the pages that show its result
// (`north-valley-overtime-….jpg`, step 2.200): see overtimePages.
//
// Signed in as the made-up owner (step 2.127): the front page and the account page with
// their leagues (`platform-home-signed-in`, `platform-account`), and the account button's
// menu, open, on the first league's home (`north-valley-account-menu-open`): in the phone
// menu's panel at 390, under the account button at 1280; the screen as it is held.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withLoopback } from './web-listen.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(root, 'apps/web');
const out = path.join(root, '.local/shots');
const nextBin = createRequire(path.join(app, 'package.json')).resolve('next/dist/bin/next');
const madeUp = {
  NEXT_TELEMETRY_DISABLED: '1',
  APP_ENV: 'test',
  LOG_LEVEL: 'warn',
  EMAIL_FROM: 'hello@example.test',
  // The made-up address the Terms and Privacy pages give (step 2.135).
  CONTACT_EMAIL: 'contact@example.test',
};
// The stand-in's two live leagues, and its made-up owner, who is known by this cookie alone
// (apps/web/src/server/stand-in-ports.ts).
const leagues = ['north-valley', 'harbor-city'];
const owner = { name: 'srl_session', value: 'local-owner-token' };
// The made-up scorekeeper, who scores games in the first league only.
const scorekeeper = { name: 'srl_session', value: 'local-scorekeeper-token' };
const widths = [
  { name: '390', viewport: { width: 390, height: 844 } },
  { name: '1280', viewport: { width: 1280, height: 800 } },
];
// What a visitor sees. `first` follows the first link on the page whose address contains it.
const publicPages = [
  { name: 'home', at: '' },
  { name: 'schedule', at: '/schedule' },
  { name: 'standings', at: '/standings' },
  { name: 'stats', at: '/stats' },
  { name: 'teams', at: '/teams' },
  { name: 'team', at: '/teams', first: '/teams/' },
];
// A game's page in each of its states. The ids are the stand-in's own
// (apps/web/src/server/stand-in-games.ts and stand-in-public-schedule.ts): a tracked game
// is number n of the games area, a listed one is game `index` of a season of `count` games.
const hexId = (head, n) => `01900000-0000-7000-8000-${head}${n.toString(16).padStart(8, '0')}`;
const trackedGame = (n) => hexId('006a', n);
const trackedPlayer = (team, n) => hexId((0x70 + team).toString(16).padStart(4, '0'), n);
const listedGame = (count, index) => hexId('0000', 0xb2000000 + index + count * 1000);
const trackedLeagueId = hexId('0000', 1);
const liveGame = trackedGame(2);
const finalGame = trackedGame(3);
const gamePages = {
  'north-valley': [
    // The home page of a season with no game under way: the hero by itself, with its mark
    // where the live game would stand (`home-no-live`). The first league's other season.
    { name: 'home-no-live', at: '?season=spring-2026' },
    { name: 'game-live', at: `/games/${liveGame}` },
    { name: 'game-live-light', at: `/games/${liveGame}`, lookOf: 'harbor-city' },
    { name: 'game-final', at: `/games/${finalGame}` },
    { name: 'game-final-light', at: `/games/${finalGame}`, lookOf: 'harbor-city' },
    { name: 'game-result', at: `/games/${listedGame(13, 0)}` },
    { name: 'game-forfeit', at: `/games/${listedGame(13, 1)}` },
    { name: 'game-postponed', at: `/games/${listedGame(13, 3)}` },
    { name: 'game-scheduled', at: `/games/${listedGame(13, 8)}` },
  ],
  'harbor-city': [
    { name: 'game-result', at: `/games/${listedGame(5, 0)}` },
    { name: 'game-scheduled', at: `/games/${listedGame(5, 3)}` },
    { name: 'game-undated', at: `/games/${listedGame(5, 4)}` },
  ],
};
/**
 * The box score grid on a phone shows one team at a time (step 2.103): picks the team a
 * box belongs to before it is typed in, as a person would. Nothing to do on a laptop.
 */
async function showSheetTeamOf(page, box) {
  const team = await box.evaluate(
    (el) => el.closest('[data-sheet-team]')?.getAttribute('data-sheet-team') ?? null,
  );
  const tabs = page.locator('.admin-sheet-tabs');
  if (team === null || (await tabs.count()) === 0 || !(await tabs.isVisible())) return;
  await tabs.locator('label').nth(Number(team)).click();
}
// The games area's states, reached by tapping (steps 2.154 and 2.155); see adminPages.
const gamesStates = [
  { name: 'admin-games-boxes-open', at: '/admin/games', onlyIn: leagues[0], tap: openBoxes(1) },
  {
    // Step 2.156: the game played three days ago with no score, first under "Needs a
    // result", made final: "Saved" names it at the top, and it has left that list.
    name: 'admin-games-needs-saved',
    at: '/admin/games',
    onlyIn: leagues[0],
    tap: async (page) => {
      const id = listedGame(13, 20);
      const game = page.locator(`li[id="game-${id}"]`);
      if ((await game.count()) === 0) {
        // Made final at the other width already: reopened first, as a correction is.
        await page.goto(page.url().replace(/\/admin\/games.*$/, `/admin/games/${id}`));
        await page.locator('[data-reopen-form] input[name="reason"]').fill('Pictures');
        await Promise.all([
          page.waitForURL((url) => url.pathname.endsWith('/admin/games')),
          page.locator('[data-reopen-form] button[type="submit"]').click(),
        ]);
      }
      const boxes = game.locator('[data-score-boxes]');
      if ((await boxes.getAttribute('open')) === null) await boxes.locator('> summary').click();
      await game.locator('input[name="awayScore"]').fill('45');
      await game.locator('input[name="homeScore"]').fill('50');
      await game.locator('[data-score-boxes] button[type="submit"]').click();
      await game.getByRole('button', { name: 'Yes, make it final' }).click();
      await page.getByRole('status').filter({ hasText: 'Saved' }).waitFor();
    },
  },
  {
    // Step 2.156: "Earlier games" with its latest round chosen, a round at a time.
    name: 'admin-games-earlier',
    at: '/admin/games',
    onlyIn: leagues[0],
    light: true,
    tap: async (page) => {
      const picker = page.locator('#earlier select[name="round"]');
      const latest = await picker.locator('option').nth(1).getAttribute('value');
      await Promise.all([
        page.waitForURL((url) => url.searchParams.get('round') === latest),
        picker.selectOption(latest ?? ''),
      ]);
      await page.locator('#earlier li[id^="game-"]').first().waitFor();
    },
  },
  {
    name: 'admin-games-question',
    at: '/admin/games',
    onlyIn: leagues[0],
    tap: async (page) => {
      await askFinal(page, 4, 47, 51);
    },
  },
  {
    name: 'admin-games-refused',
    at: '/admin/games',
    onlyIn: leagues[0],
    light: true,
    tap: async (page) => {
      const game = await askFinal(page, 1, 40, 40);
      await game.getByRole('button', { name: 'Yes, make it final' }).click();
      await game.getByRole('alert').waitFor();
    },
  },
  {
    name: 'admin-games-saved',
    // From the game's reopen form, which "Correct this result" leads to.
    at: `/admin/games/${trackedGame(5)}`,
    onlyIn: leagues[0],
    light: true,
    tap: async (page) => {
      await page.locator('[data-reopen-form] input[name="reason"]').fill('Pictures');
      await Promise.all([
        page.waitForURL((url) => url.pathname.endsWith('/admin/games')),
        page.locator('[data-reopen-form] button[type="submit"]').click(),
      ]);
      const again = await askFinal(page, 5, 50, 44);
      await again.getByRole('button', { name: 'Yes, make it final' }).click();
      await gameRow(page, 5).getByRole('status').filter({ hasText: 'Saved' }).waitFor();
    },
  },
  {
    // The reopen form of the league's first game that has one ("Correct this result").
    // The second league has no final game this week, so its grid is taken instead (below).
    name: 'admin-games-correct-form',
    at: '/admin/games',
    onlyIn: leagues[0],
    tap: async (page) => {
      const correct = page.locator('main').getByRole('link', { name: 'Correct this result' });
      await Promise.all([
        page.waitForURL(/\/admin\/games\/[0-9a-f-]{36}$/),
        correct.first().click(),
      ]);
    },
  },
  {
    name: 'admin-games-box',
    at: '/admin/games',
    onlyIn: leagues[0],
    first: `/admin/games/${trackedGame(1)}`,
  },
  {
    // The second league's grid: its first game with "Box score" this week.
    name: 'admin-games-box',
    at: '/admin/games',
    onlyIn: leagues[1],
    tap: async (page) => {
      const grid = page.locator('main').getByRole('link', { name: 'Box score' });
      await Promise.all([page.waitForURL(/\/admin\/games\/[0-9a-f-]{36}$/), grid.first().click()]);
    },
  },
  {
    name: 'admin-games-box-refused',
    at: '/admin/games',
    onlyIn: leagues[0],
    first: `/admin/games/${trackedGame(1)}`,
    light: true,
    tap: async (page) => {
      const points = page.locator('main input[name^="stat.points."]');
      const typed = [3, 4, 5, 6, 7, 5, 10, 4, 4, 4, 4, 4];
      for (const [i, value] of typed.entries()) {
        await showSheetTeamOf(page, points.nth(i));
        await points.nth(i).fill(String(value));
      }
      await page.locator('main input[name="awayScore"]').fill('30');
      await page.locator('main input[name="homeScore"]').fill('30');
      await page.locator('main form button[type="submit"]').last().click();
      await page.locator('#box-score-scores [role="alert"]').waitFor();
    },
  },
  {
    name: 'admin-games-box-wrong-box',
    at: '/admin/games',
    onlyIn: leagues[0],
    first: `/admin/games/${trackedGame(1)}`,
    tap: async (page) => {
      // A count over the box's limit, typed in one team's grid; then the other team is
      // picked, so that grid is put away on a phone, and Save is tapped. The form leaves the
      // telling to the server (step 2.103): the refusal names the box, and its team is shown.
      const points = page.locator('main input[name^="stat.points."]');
      await showSheetTeamOf(page, points.nth(3));
      await points.nth(3).fill('1000');
      await showSheetTeamOf(page, points.nth(8));
      await points.nth(8).fill('9');
      await page.locator('main form button[type="submit"]').last().click();
      await page.locator('#box-score-scores [role="alert"]').waitFor();
    },
  },
];

// Step 2.158: forfeiting, postponing and cancelling ask first, and a game called off is put
// back. Each state is reached by the owner's own taps on the games list (nothing rides in
// the address, record 067), on games of the first league's week no other picture uses:
// Owls at Badgers tonight (asked about, never changed), Lions at Hawks tomorrow (postponed,
// then asked to go back on its date) and Herons at Falcons (cancelled, then put back). A
// picture that changes a game finds it already changed at the second width, and starts
// from there. A "Yes" is tapped once the question has been read: the server takes a "Yes"
// within its first moments as the second tap of a double tap (call-off-step.ts).
const callOffGame = (page, away, home) =>
  page.locator('li.admin-game[id^="game-"]').filter({ hasText: away }).filter({ hasText: home });
const owlsAtBadgers = (page) => callOffGame(page, 'Owls', 'Badgers');
const lionsAtHawks = (page) => callOffGame(page, 'Lions', 'Hawks');
const heronsAtFalcons = (page) => callOffGame(page, 'Herons', 'Falcons');
const statusOf = (game) => game.locator('.ui-game-card').first().getAttribute('data-status');
/** A game's panel by its button's words; the last one ("Forfeit, …") when none is named. */
const panelOf = (game, summary) =>
  summary === undefined
    ? game.locator('details[data-call-off]').last()
    : game.locator('details[data-call-off]').filter({
        has: game.page().locator('summary', { hasText: summary }),
      });
async function openPanel(panel) {
  if ((await panel.getAttribute('open')) === null) await panel.locator('> summary').click();
}
async function askToCallOff(game, button, summary) {
  await openPanel(panelOf(game, summary));
  await game.getByRole('button', { name: button, exact: true }).click();
  await game.locator('[data-call-off-ask]').waitFor();
}
async function sayYes(game, name) {
  await game.page().waitForTimeout(1000);
  await game.getByRole('button', { name }).click();
  await game.getByRole('status').filter({ hasText: 'Saved' }).waitFor();
}
/** Lions at Hawks postponed through its question, unless it already is. */
async function postponedLions(page) {
  const game = lionsAtHawks(page);
  if ((await statusOf(game)) === 'scheduled') {
    await askToCallOff(game, 'Postpone');
    await sayYes(game, 'Yes, postpone it');
  }
  return game;
}
/** Herons at Falcons cancelled through its question, unless it already is. */
async function cancelledHerons(page) {
  const game = heronsAtFalcons(page);
  if ((await statusOf(game)) !== 'cancelled') {
    await askToCallOff(game, 'Cancel the game');
    await sayYes(game, 'Yes, cancel it');
  }
  return game;
}
const callOffStates = [
  {
    // "Forfeit, postpone or cancel" open: its three buttons apart, the destructive one at
    // the far end of its row.
    name: 'admin-games-panel-open',
    at: '/admin/games',
    onlyIn: leagues[0],
    tap: async (page) => openPanel(panelOf(owlsAtBadgers(page))),
  },
  {
    // "No" stands where "Postpone" was; the question and its "Yes" come after.
    name: 'admin-games-postpone-ask',
    at: '/admin/games',
    onlyIn: leagues[0],
    light: true,
    tap: async (page) => askToCallOff(owlsAtBadgers(page), 'Postpone'),
  },
  {
    name: 'admin-games-cancel-ask',
    at: '/admin/games',
    onlyIn: leagues[0],
    tap: async (page) => askToCallOff(owlsAtBadgers(page), 'Cancel the game'),
  },
  {
    // "Team that forfeits" starts empty; a team chosen, the question names both and the score.
    name: 'admin-games-forfeit-ask',
    at: '/admin/games',
    onlyIn: leagues[0],
    tap: async (page) => {
      const game = owlsAtBadgers(page);
      await openPanel(panelOf(game));
      await game.getByLabel('Team that forfeits').selectOption({ label: 'Owls' });
      await askToCallOff(game, 'Record forfeit');
    },
  },
  {
    // "Yes, postpone it": "Saved" says where it waits, its card leads to the list of games
    // waiting for a new date, and the list holds it.
    name: 'admin-games-postponed',
    at: '/admin/games',
    onlyIn: leagues[0],
    light: true,
    tap: async (page) => {
      await postponedLions(page);
    },
  },
  {
    // "Put it back on its date": a reason chosen, the question naming its old date.
    name: 'admin-games-restore-ask',
    at: '/admin/games',
    onlyIn: leagues[0],
    tap: async (page) => {
      const game = await postponedLions(page);
      const panel = panelOf(game, 'Put it back on its date');
      await openPanel(panel);
      await panel.getByLabel(/Why are you putting it back/).selectOption({
        label: 'Postponed by mistake',
      });
      await askToCallOff(game, 'Put it back', 'Put it back on its date');
    },
  },
  {
    // The postponed game's own page: why it has no score, no grid, the way to its new date.
    name: 'admin-games-box-postponed',
    at: '/admin/games',
    onlyIn: leagues[0],
    tap: async (page) => {
      const game = await postponedLions(page);
      const id = ((await game.getAttribute('id')) ?? '').slice('game-'.length);
      await page.goto(page.url().replace(/\/admin\/games.*$/, `/admin/games/${id}`));
      await page.locator('main h1').waitFor();
    },
  },
  {
    // Cancelled through its question, then "Put this game back" opened, a reason to choose.
    name: 'admin-games-put-back',
    at: '/admin/games',
    onlyIn: leagues[0],
    light: true,
    tap: async (page) => {
      const game = await cancelledHerons(page);
      await openPanel(game.locator('details[data-action-form]'));
    },
  },
  {
    // Put back with a reason: a scheduled game again, "Saved" beside it.
    name: 'admin-games-put-back-saved',
    at: '/admin/games',
    onlyIn: leagues[0],
    tap: async (page) => {
      const game = await cancelledHerons(page);
      const panel = game.locator('details[data-action-form]');
      await openPanel(panel);
      await panel.getByLabel(/Why are you putting it back/).selectOption({
        label: 'Cancelled by mistake',
      });
      await panel.getByRole('button', { name: 'Put it back on the schedule' }).click();
      await game.getByRole('status').filter({ hasText: 'back on the schedule' }).waitFor();
    },
  },
];

// What the league's owner sees.
const adminPages = [
  { name: 'admin-home', at: '/admin' },
  { name: 'admin-games', at: '/admin/games' },
  // The states of the games list (steps 2.154 and 2.155), reached by tapping, as none of
  // them rides in the address (record 067): one game's score boxes open, the question
  // before a final score is saved (for a game whose time has not come), a tie refused
  // beside the boxes, "Saved" beside a final game (this morning's game reopened and its
  // score entered again as it was), and the reopen form a final game leads to. The live
  // game, with plays, is on `admin-games` itself, with no score boxes. Then the box score
  // grid, a tie refused there with twelve players' points kept, and a player's box refused
  // (the sentence names the player and the column; the box has the focus). The refusals
  // and "Saved" are taken again in the second league's light design (`…-light`).
  ...gamesStates.flatMap((job) => [
    job,
    ...(job.light ? [{ ...job, name: `${job.name}-light`, lookOf: leagues[1] }] : []),
  ]),
  // Step 2.158's questions, the postponed game and the put-back (callOffStates).
  ...callOffStates.flatMap((job) => [
    job,
    ...(job.light ? [{ ...job, name: `${job.name}-light`, lookOf: leagues[1] }] : []),
  ]),
  { name: 'admin-teams', at: '/admin/teams' },
  { name: 'admin-team', at: '/admin/teams', first: '/admin/teams/' },
  // Step 2.161, in the first made-up league, by the owner's own taps (undoSteps): a leaving
  // date of next year refused beside its field, with the date kept; the Falcons' page,
  // whose "Left the team" line has its put-back button and whose bin says how many people
  // are on the roster; and a game removed from the schedule draft, answered "Removed: … Put
  // it back". Step 2.180: the Badgers, with results and games to come, whose panel says up
  // front they cannot be removed this season, with no tick or button (A-17); a team with
  // no games keeps its tick (tests/browser/team-bin-test.mjs pictures it).
  ...['team-leaving-refused', 'team-left-and-bin', 'team-cannot-be-removed'].map((step) => ({
    name: `admin-${step}`,
    at: '/admin/teams',
    league: 'north-valley',
    steps: (page) => undoSteps(page, step),
  })),
  // A player put back without the number someone else now wears (R-32), in the second
  // league, whose youth season asks for a different number for each player.
  {
    name: 'admin-team-put-back-no-number',
    at: '/admin/teams',
    league: 'harbor-city',
    steps: (page) => undoSteps(page, 'team-put-back-no-number'),
  },
  { name: 'admin-schedule', at: '/admin/schedule' },
  {
    name: 'admin-schedule-game-removed',
    at: '/admin/schedule',
    league: 'north-valley',
    steps: (page) => undoSteps(page, 'schedule-game-removed'),
  },
  // Step 2.185, in the first made-up league's current season, by the owner's own taps
  // (draftPutBackSteps): a published game removed and another moved, the removed one still
  // in its place, struck through, with "Removed in this draft" and "Put it back"; and a
  // game removed and put back, the draft then "the same as the published schedule" with
  // "Discard the draft" beside it. The draft is discarded again once the page is drawn.
  ...[
    { name: 'admin-schedule-removed-stays', then: 'move' },
    { name: 'admin-schedule-draft-same', then: 'put-back' },
  ].map(({ name, then }) => ({
    name,
    at: '/admin/schedule',
    league: 'north-valley',
    steps: (page) => draftPutBackSteps(page, then),
  })),
  // Step 2.181, in the first made-up league's current season, by the owner's own taps
  // (emptiedRoundSteps): both games of the last round removed from the draft, the round's
  // controls opened ("0 games" and whether it can be removed), and then "Remove this
  // round" tapped, with its answer. The draft is discarded again once the page is drawn.
  ...[
    { name: 'admin-schedule-round-emptied', remove: false },
    { name: 'admin-schedule-round-emptied-removed', remove: true },
  ].map(({ name, remove }) => ({
    name,
    at: '/admin/schedule',
    league: 'north-valley',
    steps: (page) => emptiedRoundSteps(page, remove),
  })),
  // Step 2.160, in the first made-up league's season that is not public yet (only it has
  // one), each also in the second league's light look: the empty season with its form;
  // "Saved" after adding a round; the moved game's question; a game outside its round with
  // its button; a round's controls opened, one with "Remove this round" and one saying why
  // it cannot be removed; a game's own form opened ("Edit this game": Save game, and Remove
  // game apart from it); a round date refused beside its round, and a new round's date
  // refused beside its field. Each is reached by the owner's own taps (roundSteps).
  ...[
    { name: 'admin-schedule-no-rounds', steps: [] },
    { name: 'admin-schedule-round-added', steps: ['rounds'] },
    { name: 'admin-schedule-move-question', steps: ['rounds', 'game', 'move'] },
    { name: 'admin-schedule-outside-round', steps: ['rounds', 'game', 'move', 'keep'] },
    { name: 'admin-schedule-round-controls', steps: ['rounds', 'game', 'open'] },
    { name: 'admin-schedule-edit-game', steps: ['rounds', 'game', 'edit'] },
    { name: 'admin-schedule-round-refused', steps: ['rounds', 'game', 'bad-round-date'] },
    { name: 'admin-schedule-add-round-refused', steps: ['rounds', 'bad-new-date'] },
  ].flatMap(({ name, steps }) =>
    [undefined, 'harbor-city'].map((lookOf) => ({
      name: lookOf === undefined ? name : `${name}-light`,
      at: '/admin/schedule?season=winter-2027',
      league: 'north-valley',
      steps: (page) => roundSteps(page, steps),
      ...(lookOf === undefined ? {} : { lookOf }),
    })),
  ),
  { name: 'admin-import', at: '/admin/schedule/import' },
  { name: 'admin-season', at: '/admin/season' },
  // Step 2.49: a season's divisions (the first league's two, each holding teams) and the
  // league's venues with their courts; the answers are taken by divisionVenueSteps' taps.
  { name: 'admin-divisions', at: '/admin/season/divisions' },
  { name: 'admin-venues', at: '/admin/schedule/venues' },
  ...['divisions-refused', 'divisions-removed', 'venues-refused', 'venues-court-removed'].map(
    (what) => ({
      name: `admin-${what}`,
      at: what.startsWith('divisions') ? '/admin/season/divisions' : '/admin/schedule/venues',
      league: 'north-valley',
      steps: (page) => divisionVenueSteps(page, what),
    }),
  ),
  // Step 2.182, Season settings' first panel: the first league's season not public yet; the
  // question before showing it and before hiding the current one; the answer after the
  // owner really shows it (winterSteps taps Show and Yes); and the schedule's "published"
  // sentence for the hidden season (the page draws it from the address's `done=published`
  // and the season as it stands, as after publishing, so taking it publishes nothing that
  // the other pictures would then show). Each picture of the season hidden first hides it
  // again by the owner's own taps if an earlier picture showed it.
  {
    name: 'admin-season-hidden',
    at: '/admin/season?season=winter-2027',
    league: 'north-valley',
    steps: (page) => winterSteps(page, 'hidden', '/admin/season?season=winter-2027'),
  },
  {
    name: 'admin-season-show-ask',
    at: '/admin/season?season=winter-2027',
    league: 'north-valley',
    steps: (page) =>
      winterSteps(page, 'hidden', '/admin/season?season=winter-2027&ask=show#who-can-see'),
  },
  { name: 'admin-season-hide-ask', at: '/admin/season?ask=hide#who-can-see' },
  {
    name: 'admin-season-shown-done',
    at: '/admin/season?season=winter-2027',
    league: 'north-valley',
    steps: (page) => winterSteps(page, 'shown'),
  },
  // Step 2.47, Season settings' parts in the first league's current season (it has
  // results): each part's form on its own step, the game rules filled from a preset, a
  // refused save with its marked box, the question before a tiebreaker change that moves
  // the standings, and "Saved" beside a part. Nothing here saves a change: the save is of
  // the name and dates as they are, and the question is answered by nobody.
  ...['name', 'game', 'recording', 'standings', 'rosters'].map((part) => ({
    name: `admin-season-edit-${part}`,
    at: `/admin/season?season=fall-2026&edit=${part}#season-${part}`,
  })),
  ...['preset', 'refused', 'moves', 'saved'].map((what) => ({
    name: `admin-season-${what}`,
    at: '/admin/season?season=fall-2026',
    league: 'north-valley',
    steps: (page) => seasonPartSteps(page, what),
  })),
  {
    name: 'admin-schedule-published-hidden',
    at: '/admin/schedule?season=winter-2027',
    league: 'north-valley',
    steps: (page) =>
      winterSteps(page, 'hidden', '/admin/schedule?season=winter-2027&done=published'),
  },
  { name: 'admin-settings', at: '/admin/settings' },
  // Step 2.97: League settings → Admins (the stand-in's grants and made-up names; its
  // invitations are pictured on the made-up database by admins-invitations-test.mjs --shots),
  // and the accept page with no invitation held: "This link does not work".
  { name: 'admin-settings-admins', at: '/admin/settings/admins' },
  // Step 2.77: its activity log, the filters and what an empty answer says.
  { name: 'admin-settings-activity', at: '/admin/settings/activity' },
  { name: 'invitation-not-usable', at: '/invitation' },
  { name: 'admin-people', at: '/admin/people' },
  // Step 2.50, Admin → People: a search by name; one person's record (the first on the
  // list); and, by the owner's own taps with scripts off (peopleSteps), a child added by hand
  // with an email and a date of birth, landing on their record that says so; the add form
  // refused beside its boxes, with what was typed kept; a misspelt name put right, "Saved"
  // beside the details; and a date of birth that makes a player two years old shown back
  // before it is saved (R-28). Each taken in the first league only.
  { name: 'admin-people-search', at: '/admin/people?q=ta' },
  { name: 'admin-person', at: '/admin/people', first: '/admin/people/' },
  ...['person-added', 'person-add-refused', 'person-saved', 'person-birth-date-asked'].map(
    (step) => ({
      name: `admin-${step}`,
      at: '/admin/people',
      league: 'north-valley',
      steps: (page) => peopleSteps(page, step),
    }),
  ),
  { name: 'admin-standings', at: '/admin/standings' },
  // The admin's own frame (step 2.103): its menu, open, as a phone holds it (on a laptop the
  // menu is always at the side, so the picture is the page's first screen); and "not
  // found" inside the admin, for a team that is not there.
  { name: 'admin-menu-open', at: '/admin/teams', opensStaffMenu: true },
  { name: 'admin-not-found', at: '/admin/teams/01900000-0000-7000-8000-00000000dead' },
];
// The admin of the made-up league that is not published (step 2.103): its pill in the header.
const draftLeague = 'quiet-pines';
const draftPages = [
  { name: 'admin-home', at: '/admin' },
  { name: 'admin-status-open', at: '/admin', opensStaffStatus: true },
];
// What the made-up scheduler sees (step 2.103): a menu of their own areas only, and "You
// do not have access" at an area that is not theirs.
const scheduler = { name: 'srl_session', value: 'local-scheduler-token' };
const schedulerPages = [
  { name: 'scheduler-admin-home', at: '/admin' },
  { name: 'scheduler-admin-refused', at: '/admin/teams' },
];
// A refusal as each kind of person meets it (step 2.157): staff outside their role (a
// scheduler and a scorekeeper at People), a coach and a signed-in stranger at the admin,
// a signed-in stranger at a draft league's admin ("Page not found", nothing of the league),
// a long address (a visitor at an admin area is sent to sign in since U-15 changed, so has
// no picture here), another league's game under this league's address (on the
// scoring page and in the admin), and a club admin's team page, which may not show the
// league's list of people. `who` is the made-up person's cookie; null is a visitor.
const otherLeaguesGame = '01900000-0000-7000-8000-006a00000002';
const refusalPages = [
  {
    name: 'refusal-scheduler-people',
    who: 'local-scheduler-token',
    at: '/north-valley/admin/people',
  },
  {
    name: 'refusal-scorekeeper-people',
    who: 'local-scorekeeper-token',
    at: '/north-valley/admin/people',
  },
  { name: 'refusal-coach-admin', who: 'local-coach-token', at: '/north-valley/admin' },
  { name: 'refusal-stranger-admin', who: 'local-stranger-token', at: '/north-valley/admin' },
  { name: 'refusal-stranger-draft-admin', who: 'local-stranger-token', at: '/quiet-pines/admin' },
  // A scheduler signed in with a long address (52 letters): it breaks inside the card, in
  // the admin's frame and on the plain screen.
  {
    name: 'refusal-long-address-people',
    who: 'local-scheduler-with-long-address-token',
    at: '/north-valley/admin/people',
  },
  {
    name: 'refusal-long-address-plain',
    who: 'local-scheduler-with-long-address-token',
    at: '/harbor-city/admin',
  },
  {
    name: 'refusal-other-leagues-game',
    who: 'local-owner-token',
    at: `/harbor-city/score/${otherLeaguesGame}`,
  },
  {
    name: 'refusal-other-leagues-box-score',
    who: 'local-owner-token',
    at: `/harbor-city/admin/games/${otherLeaguesGame}`,
  },
  {
    name: 'refusal-club-admin-team',
    who: 'local-club-admin-token',
    at: '/quiet-pines/admin/teams/01900000-0000-7000-8000-007e00000004',
  },
];
// The games list's taps (step 2.155): a game's place on the list, its boxes opened, and a
// score typed and saved, which only asks.
function gameRow(page, n) {
  return page.locator(`li[id="game-${trackedGame(n)}"]`);
}
function openBoxes(n) {
  return async (page) => {
    const boxes = gameRow(page, n).locator('[data-score-boxes]');
    // A game just reopened has its boxes open already.
    if ((await boxes.getAttribute('open')) === null) await boxes.locator('> summary').click();
  };
}
async function askFinal(page, n, away, home) {
  const game = gameRow(page, n);
  await openBoxes(n)(page);
  await game.locator('input[name="awayScore"]').fill(String(away));
  await game.locator('input[name="homeScore"]').fill(String(home));
  await game.locator('[data-score-boxes] button[type="submit"]').click();
  await game.locator('[data-question]').waitFor();
  return game;
}

/** The buttons are read after the page (step 2.153): the picture waits for the first one. */
const offersDrawn = (page) =>
  page.locator('main [data-offer]').first().waitFor({ state: 'attached', timeout: 60_000 });
// What the scorekeeper sees (step 2.33): their games, and the tracker opened from them.
const scorekeeperPages = [
  // The league's own pages as the scorekeeper sees them (step 2.153): "Score this game" or
  // "Enter the score" on the cards of the games they may score, and on a game's page.
  { name: 'scorekeeper-home', at: '', steps: offersDrawn },
  { name: 'scorekeeper-schedule', at: '/schedule', steps: offersDrawn },
  { name: 'scorekeeper-game', at: `/games/${liveGame}`, steps: offersDrawn },
  // In the draft league, which scores assigned games only: the scorekeeper's one game whose
  // day has come carries the button, its neighbours none (S-70; the card's foot, 2.153).
  {
    name: 'scorekeeper-schedule-assigned',
    league: 'quiet-pines',
    at: '/schedule',
    steps: offersDrawn,
  },
  { name: 'scorekeeper-games', at: '/admin' },
  { name: 'scorekeeper-tracker', at: '/admin', first: '/score/' },
  // The games list as a scorekeeper sees it: a final game says who can reopen it (2.154).
  { name: 'scorekeeper-games-list', at: '/admin/games' },
];
// What a coach finds (step 2.168): "My team" in the account menu, and their team marked as
// theirs, after the page, on its page, the Teams list and the league home. The made-up coach
// is on North Valley's Herons and Harbor City's Rockets, and Harbor City opens on a member's
// team. A visitor whose device chose a team sees it marked; someone on no team who opens
// `/my` is told so (the made-up stranger, signed in, holds nothing anywhere).
const coach = { name: 'srl_session', value: 'local-coach-token' };
const stranger = { name: 'srl_session', value: 'local-stranger-token' };
const chosenComets = { name: `srl_my_team_${hexId('0000', 2)}`, value: 'comets' };
/** The marks are read after the page: the picture waits for the first one. */
const yoursDrawn = (page) =>
  page
    .locator('main :is([data-yours], [data-your-team])')
    .first()
    .waitFor({ state: 'attached', timeout: 60_000 });
const coachPages = [
  { name: 'coach-menu-open', at: '', opens: true },
  { name: 'coach-league-home', at: '', steps: yoursDrawn },
  { name: 'coach-team', at: '/teams/herons', steps: yoursDrawn },
  { name: 'coach-team-opens-here', league: 'harbor-city', at: '/teams/rockets', steps: yoursDrawn },
  { name: 'coach-teams', league: 'harbor-city', at: '/teams', steps: yoursDrawn },
  { name: 'coach-home', league: 'harbor-city', at: '?start=league', steps: yoursDrawn },
];
const chosenTeamPages = [
  { name: 'visitor-chose-teams', at: '/teams', steps: yoursDrawn },
  { name: 'visitor-chose-home', at: '?start=league', steps: yoursDrawn },
];
const noTeamPages = [{ name: 'my-no-team', at: '/my' }];
// A game won in overtime (step 2.200, `--only=overtime`): Lions v Tigers, the first league's
// game 1, played level through regulation and won in the first overtime by this script's
// own taps (scoreOvertimeGame), after every other picture is taken, so none of them
// changes. Then its page, its card on the schedule, the home page and the Lions' page, and
// the games lists of the owner and the scorekeeper, and its box score sheet: each says
// "Final, OT", beside the made-up season's other results, which say "Final" alone.
const overtimeGame = trackedGame(1);
const overtimePages = [
  { name: 'overtime-game', at: `/games/${overtimeGame}`, as: 'visitor' },
  { name: 'overtime-schedule', at: '/schedule', as: 'visitor' },
  { name: 'overtime-home', at: '', as: 'visitor' },
  { name: 'overtime-team', at: '/teams/lions', as: 'visitor' },
  { name: 'overtime-admin-games', at: '/admin/games', as: 'owner' },
  { name: 'overtime-scorekeeper-games', at: '/admin', as: 'scorekeeper' },
  { name: 'overtime-box-score', at: `/admin/games/${overtimeGame}`, as: 'owner' },
];
// SR Leagues' own pages, signed in as the made-up owner (step 2.127).
const signedInPlatformPages = [
  { name: 'platform-home-signed-in', at: '/' },
  { name: 'platform-account', at: '/account' },
];
// The account button's menu, open, on the first league's home (step 2.127).
const accountMenuPages = [{ name: 'account-menu-open', at: '', opens: true }];
// SR Leagues' own pages, which belong to no league.
const platformPages = [
  { name: 'platform-home', at: '/' },
  { name: 'platform-signin', at: '/signin' },
  { name: 'platform-signup', at: '/signup' },
  { name: 'platform-find', at: '/find' },
  { name: 'platform-start', at: '/start' },
  { name: 'platform-help', at: '/help' },
  { name: 'platform-terms', at: '/terms?from=%2Fnorth-valley' },
  { name: 'platform-privacy', at: '/privacy?from=%2Fnorth-valley' },
];

// Long names, at the two narrowest phones: a team's wherever a team is named (the column of
// a table that stays put, a scoreboard, a game card, a team card, a team page's heading)
// and a league's in the header.
const longName = 'The Northside Community Thunderbolts';
// One long word, which cannot wrap: a made-up team name of 16 letters.
const longWord = 'Trailblazerettes';
const longLeagueName = 'The Greater Northside Community Basketball Association';
const longNameWidths = [
  { name: '320', viewport: { width: 320, height: 700 } },
  { name: '390', viewport: { width: 390, height: 844 } },
];
const longNamePages = [
  { name: 'north-valley-home-long-name', at: '/north-valley' },
  { name: 'north-valley-schedule-long-name', at: '/north-valley/schedule' },
  { name: 'north-valley-standings-long-name', at: '/north-valley/standings' },
  { name: 'north-valley-stats-long-name', at: '/north-valley/stats' },
  { name: 'north-valley-teams-long-name', at: '/north-valley/teams' },
  { name: 'north-valley-team-long-name', at: '/north-valley/teams/owls', heading: true },
  { name: 'north-valley-game-final-long-name', at: `/north-valley/games/${finalGame}` },
  { name: 'north-valley-game-live-long-name', at: `/north-valley/games/${liveGame}` },
  {
    name: 'north-valley-game-postponed-long-name',
    at: `/north-valley/games/${listedGame(13, 3)}`,
  },
  {
    name: 'north-valley-game-scheduled-long-name',
    at: `/north-valley/games/${listedGame(13, 8)}`,
  },
  { name: 'harbor-city-home-long-name', at: '/harbor-city' },
  { name: 'harbor-city-game-undated-long-name', at: `/harbor-city/games/${listedGame(5, 4)}` },
];
// The phone menu, open, at 390 only (`--only=menu`): one picture a league.
const menuWidth = { name: '390', viewport: { width: 390, height: 844 } };

// What a pointer and a keyboard do to each kind of link, button, card and picker
// (`--only=states`; step 2.147 part 3). One picture a kind, in the first league, cut to the
// part of the page that holds it: the pointer is over one of the kind (`hover`) and the
// keyboard is on another (`focus`), so both states are in one picture. `nth` picks which
// of the matches. Focus must always be seen (docs/build/DESIGN.md, section 4, line 25).
const statePages = [
  {
    name: 'states-tabs',
    at: '',
    part: '.site-header',
    hover: ['.site-tabs a', 1],
    focus: ['.site-tabs a', 3],
  },
  {
    name: 'states-header',
    at: '',
    part: '.site-header',
    hover: ['.site-header select', 0],
    focus: ['.site-header a.site-sign-in', 0],
  },
  {
    name: 'states-hero-buttons',
    at: '?season=spring-2026',
    part: '.ui-hero',
    hover: ['.ui-hero-actions .ui-button', 0],
    focus: ['.ui-hero-actions .ui-button', 1],
  },
  {
    name: 'states-boards',
    at: '/schedule',
    part: '.ui-group[open] .ui-card-grid',
    hover: ['.ui-group[open] .ui-game-card', 0],
    focus: ['.ui-group[open] .ui-game-link', 1],
  },
  {
    name: 'states-way-on',
    at: '',
    part: '.site-column .ui-section',
    hover: ['.site-column .ui-more', 0],
    focus: ['.site-column .ui-game-link', 0],
  },
  {
    name: 'states-way-on-focus',
    at: '',
    part: '.site-column .ui-section-head',
    focus: ['.site-column .ui-more', 0],
  },
  {
    name: 'states-team-cards',
    at: '/teams',
    part: 'main',
    hover: ['.ui-team-card', 0],
    focus: ['.ui-team-card-name a', 1],
  },
  {
    name: 'states-band-button',
    at: '/teams',
    part: '.ui-call-band',
    focus: ['.ui-call-band .ui-button', 0],
  },
  {
    name: 'states-band-button-hover',
    at: '/teams',
    part: '.ui-call-band',
    hover: ['.ui-call-band .ui-button', 0],
  },
  {
    name: 'states-table',
    at: '/stats',
    part: '.stats-tables',
    hover: ['.ui-stats tbody tr', 2],
    focus: ['.ui-sort-button', 2],
  },
  {
    name: 'states-pickers',
    at: '/schedule',
    part: 'main',
    viewport: true,
    hover: ['.ui-toolbar select', 0],
    focus: ['.ui-toolbar select', 1],
  },
  {
    name: 'states-rounds',
    at: '/schedule',
    part: 'main',
    viewport: true,
    hover: ['.ui-group > summary', 0],
    focus: ['.ui-group > summary', 1],
  },
  {
    name: 'states-crumbs',
    at: '/teams/owls',
    part: '.ui-crumbs',
    hover: ['.ui-crumbs a', 0],
    focus: ['.ui-crumbs a', 1],
  },
  {
    name: 'states-standings-row',
    at: '/standings',
    part: '.ui-table-frame',
    hover: ['.ui-standings tbody tr', 1],
    focus: ['.ui-note-mark a', 0],
  },
  {
    name: 'states-footer',
    at: '',
    part: '.site-footer',
    hover: ['.site-footer a', 0],
    focus: ['.site-footer a', 1],
  },
];
const statesWidth = { name: '1280', viewport: { width: 1280, height: 800 } };
// The phone's own: the menu button with the keyboard on it, and a link of the open menu.
const phoneStatePages = [
  {
    name: 'states-menu-button',
    at: '',
    part: '.site-header',
    focus: ['.site-menu > summary', 0],
  },
];

/**
 * Measured, not judged by eye (`--measure`; DESIGN.md, section 4, line 25): on each public
 * page as it is pictured, every piece of text that is drawn is set against what it stands
 * on, and every control's edge or fill against what is around it. Run in the page. A text
 * needs 4.5 to 1, large text (24 and up, or 18.66 and up in bold) 3 to 1, and a control's
 * edge or fill 3 to 1 (WCAG 2.1 AA, 1.4.3 and 1.4.11). What a text stands on is every
 * solid color and every color of a gradient of the boxes it is inside, laid one over
 * the other, and the worst of them counts. Not seen from here: what a box draws with
 * `::before` or `::after` (the hero's glow, whose colors the design's own tests measure),
 * and a picture. What is hidden from screen readers and drawn only as decoration (a team's
 * letter in its shield, beside its written name) is left out.
 */
function measureContrast() {
  const parse = (value) => {
    let m = /^rgba?\(([^)]+)\)$/.exec(value.trim());
    if (m) {
      const p = m[1]
        .split(/[,\s/]+/)
        .filter(Boolean)
        .map(Number);
      return [p[0], p[1], p[2], p[3] ?? 1];
    }
    m = /^color\(srgb ([^)]+)\)$/.exec(value.trim());
    if (m) {
      const p = m[1]
        .split(/[\s/]+/)
        .filter(Boolean)
        .map(Number);
      return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1];
    }
    return null;
  };
  const over = (top, under) => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
  };
  const luminance = (c) => {
    const [r, g, b] = [0, 1, 2].map((i) => {
      const v = c[i] / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [x, y] = [luminance(a), luminance(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const hex = (c) =>
    `#${[0, 1, 2].map((i) => Math.round(c[i]).toString(16).padStart(2, '0')).join('')}`;
  const colorsIn = (text) =>
    [...text.matchAll(/rgba?\([^)]+\)|color\(srgb [^)]+\)/g)]
      .map((m) => parse(m[0]))
      .filter(Boolean);
  /** Every color a box may show behind what is in it, from the page up to the box. */
  const groundsOf = (element) => {
    const layers = [];
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      // The box a table scrolls in draws a soft shadow at an edge it is scrolled from, 12
      // wide, over its panel's color: no text stands on that at rest, so it is not a ground.
      const image =
        style.backgroundImage === 'none' || node.classList.contains('ui-table-wrap')
          ? []
          : colorsIn(style.backgroundImage);
      const fill = parse(style.backgroundColor);
      layers.push({ fill, image });
      if (fill && fill[3] === 1 && image.every((c) => c[3] === 1)) break;
    }
    let grounds = [[255, 255, 255, 1]];
    for (const layer of layers.reverse()) {
      if (layer.fill && layer.fill[3] > 0) grounds = grounds.map((g) => over(layer.fill, g));
      if (layer.image.length > 0) {
        grounds = layer.image.flatMap((c) => grounds.map((g) => over(c, g)));
      }
    }
    return grounds;
  };
  const drawn = (element) => {
    if (element.closest('[aria-hidden="true"], nextjs-portal')) return false;
    const box = element.getBoundingClientRect();
    if (box.width <= 1 || box.height <= 1) return false;
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (Number(style.opacity) === 0 || style.clipPath !== 'none') return false;
      // Words pushed out of sight and kept for screen readers (a card's whole link).
      if (parseFloat(style.textIndent) > 100 && style.overflow !== 'visible') return false;
    }
    return true;
  };
  const nameOf = (element) => {
    const parts = [];
    for (let node = element; node && parts.length < 3; node = node.parentElement) {
      const cls = typeof node.className === 'string' ? node.className.trim().split(/\s+/)[0] : '';
      parts.unshift(cls ? `${node.tagName.toLowerCase()}.${cls}` : node.tagName.toLowerCase());
    }
    return parts.join(' > ');
  };
  const short = [];
  let texts = 0;
  let controls = 0;
  let lowest = { ratio: 99, what: '' };
  for (const element of document.querySelectorAll('body *')) {
    const words = [...element.childNodes]
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent.trim())
      .join(' ')
      .trim();
    if (words === '' || !drawn(element)) continue;
    const style = getComputedStyle(element);
    const ink = parse(element instanceof SVGElement ? style.fill : style.color);
    if (!ink) continue;
    const grounds = groundsOf(element);
    const worst = Math.min(...grounds.map((g) => ratio(over(ink, g), g)));
    const size = parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
    const needs = large ? 3 : 4.5;
    texts += 1;
    if (worst < lowest.ratio)
      lowest = { ratio: worst, what: `${nameOf(element)} "${words.slice(0, 24)}"` };
    if (worst < needs) {
      const ground = grounds.reduce((a, b) =>
        ratio(over(ink, a), a) < ratio(over(ink, b), b) ? a : b,
      );
      short.push(
        `text ${worst.toFixed(2)} (needs ${needs}): ${nameOf(element)} "${words.slice(0, 30)}" ${hex(over(ink, ground))} on ${hex(ground)}, ${size}px`,
      );
    }
  }
  for (const element of document.querySelectorAll(
    'main select, main input, main button, main a.ui-button, header select, header a.ui-button, header summary',
  )) {
    if (!drawn(element)) continue;
    const style = getComputedStyle(element);
    const around = element.parentElement ? groundsOf(element.parentElement) : [[255, 255, 255, 1]];
    const edge = parse(style.borderTopColor);
    const hasEdge = parseFloat(style.borderTopWidth) > 0 && edge && edge[3] > 0;
    const fill = parse(style.backgroundColor);
    const worst = Math.min(
      ...around.map((g) =>
        Math.max(
          hasEdge ? ratio(over(edge, g), g) : 1,
          fill && fill[3] > 0 ? ratio(over(fill, g), g) : 1,
        ),
      ),
    );
    // A control that is only its words (a quiet button, a heading that sorts) has no edge
    // to measure: its words are measured above.
    if (!hasEdge && !(fill && fill[3] > 0)) continue;
    controls += 1;
    if (worst < 3) short.push(`control ${worst.toFixed(2)} (needs 3): ${nameOf(element)}`);
  }
  return { texts, controls, lowest: `${lowest.ratio.toFixed(2)} ${lowest.what}`, short };
}

const flag = (name) => process.argv.includes(name);
const only = (process.argv.find((arg) => arg.startsWith('--only=')) ?? '')
  .slice('--only='.length)
  .split(',')
  .filter(Boolean);
const wanted = (name) => !only.length || only.some((part) => name.includes(part));
// The design the first made-up league is pictured under, when one is named.
const design = (process.argv.find((arg) => arg.startsWith('--design=')) ?? '').slice(
  '--design='.length,
);
if (design !== '' && !/^[a-z][a-z0-9-]{0,39}$/.test(design)) {
  console.error('--design takes a design name, such as crest-light or pine.');
  process.exit(1);
}
// A team of the first league's current season put in the bin with its games as the world is
// made (LOCAL_BINNED_TEAM, step 2.180): `--binned-team=badgers` pictures how the grid, the
// standings and the rest show a team moved there before A-17 (`…-with-badgers-binned.jpg`).
const binnedTeam = (process.argv.find((arg) => arg.startsWith('--binned-team=')) ?? '').slice(
  '--binned-team='.length,
);
if (binnedTeam !== '' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(binnedTeam)) {
  console.error('--binned-team takes a team’s short name, such as badgers.');
  process.exit(1);
}
/** A picture's file name: marked with the design and the team in the bin, when named. */
const fileName = (name) =>
  `${design === '' ? name : `${name}-in-${design}`}${binnedTeam === '' ? '' : `-with-${binnedTeam}-binned`}`;
// Under a named design only the first league's public pages change, so only they are taken.
const picturedLeagues = design === '' ? leagues : [leagues[0]];

/** On GitHub the Chromium ci.yml installs; here the Edge Windows already has. */
const launch = () => (process.env.CI ? chromium.launch() : chromium.launch({ channel: 'msedge' }));

function start(args, env = {}) {
  let output = '';
  // On the made-up stand-in, on this computer's loopback address only (web-listen.mjs).
  const environment = { ...process.env, ...madeUp, ...env };
  const child = spawn(process.execPath, [nextBin, ...withLoopback(args, environment)], {
    cwd: app,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  return { child, output: () => output };
}
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}
async function waitFor(url, server) {
  const until = Date.now() + 120_000;
  while (Date.now() < until) {
    if (server.child.exitCode !== null) throw new Error(`the server stopped:\n${server.output()}`);
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`the server did not answer within two minutes:\n${server.output()}`);
}

/**
 * Plays Lions v Tigers (the first league's game 1, a halves game) level through both halves,
 * then the first overtime, which the Lions win (step 2.200), as the owner's tablet would.
 */
async function scoreOvertimeGame(origin) {
  const five = (team) => [1, 2, 3, 4, 5].map((n) => trackedPlayer(team, n));
  const [lions, tigers] = [five(1), five(2)];
  const post = async (at, body) => {
    const answer = await fetch(
      `${origin}/api/v1/leagues/${trackedLeagueId}/games/${overtimeGame}${at}`,
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
    const text = await answer.text();
    if (!answer.ok) throw new Error(`${at} answered ${answer.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  };
  const { sessionId } = await post('/session', { type: 'open', deviceId: 'overtime-tablet' });
  const score = (side, playerId, points) => ({ type: 'score', side, playerId, points });
  const next = (period) => [{ type: 'pause' }, { type: 'period', period }, { type: 'start' }];
  const inputs = [
    { type: 'lineup', side: 'home', playerIds: lions },
    { type: 'lineup', side: 'away', playerIds: tigers },
    { type: 'start' },
    score('home', lions[0], 3),
    score('away', tigers[0], 2),
    ...next(2),
    score('away', tigers[1], 3),
    score('home', lions[1], 2),
    // Level at 5 when the second half ends: the first overtime.
    ...next(3),
    score('home', lions[2], 2),
    { type: 'end' },
  ];
  const reply = await post('/commands', {
    protocolVersion: 1,
    sessionId,
    commands: inputs.map((input) => ({ commandId: randomUUID(), at: Date.now(), input })),
  });
  const refused = reply.results.filter((r) => r.status !== 'accepted');
  if (refused.length > 0) throw new Error(`refused: ${JSON.stringify(refused)}`);
}

/**
 * Taps a short made-up game into each of the two tracked games, as a scorekeeper's tablet
 * would (the tracker's endpoints, step 2.32), so their pages have plays and players to
 * show. The Hawks (team 3) are at home in both: to the Bears (team 4), left under way, and
 * to the Lions (team 1), played to the end.
 */
async function scoreTrackedGames(origin) {
  const five = (team) => [1, 2, 3, 4, 5].map((n) => trackedPlayer(team, n));
  const [hawks, bears, lions] = [five(3), five(4), five(1)];
  const tablet = async (game, token) => {
    const post = async (at, body) => {
      const answer = await fetch(`${origin}/api/v1/leagues/${trackedLeagueId}/games/${game}${at}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `srl_session=${token}`, origin },
        body: JSON.stringify(body),
      });
      const text = await answer.text();
      if (!answer.ok) throw new Error(`${at} answered ${answer.status}: ${text.slice(0, 200)}`);
      return JSON.parse(text);
    };
    const { sessionId } = await post('/session', { type: 'open', deviceId: 'pictures-tablet' });
    return async (...inputs) => {
      // A tablet sends at most 50 taps at once (maxCommandsPerBatch); 25 keeps well inside it.
      for (let from = 0; from < inputs.length; from += 25) {
        const reply = await post('/commands', {
          protocolVersion: 1,
          sessionId,
          commands: inputs
            .slice(from, from + 25)
            .map((input) => ({ commandId: randomUUID(), at: Date.now(), input })),
        });
        const refused = reply.results.filter((r) => r.status !== 'accepted');
        if (refused.length > 0) throw new Error(`refused: ${JSON.stringify(refused)}`);
      }
    };
  };
  const score = (side, playerId, points) => ({ type: 'score', side, playerId, points });
  const clock = (minutes, seconds) => [
    { type: 'pause' },
    { type: 'set-clock', ms: (minutes * 60 + seconds) * 1000 },
    { type: 'start' },
  ];
  /** A first half, the break, and the opening of the second. */
  const plays = (away) => [
    { type: 'lineup', side: 'home', playerIds: hawks },
    { type: 'lineup', side: 'away', playerIds: away },
    { type: 'start' },
    ...clock(18, 42),
    score('home', hawks[0], 3),
    ...clock(17, 5),
    score('away', away[0], 2),
    { type: 'foul', side: 'away', playerId: away[1] },
    ...clock(15, 30),
    score('home', hawks[1], 2),
    score('home', hawks[1], 1),
    ...clock(12, 8),
    { type: 'turnover', side: 'home', playerId: hawks[2] },
    score('away', away[2], 3),
    ...clock(9, 51),
    { type: 'timeout', side: 'home', seconds: 60 },
    { type: 'sub', side: 'home', inId: trackedPlayer(3, 6), outId: hawks[4] },
    ...clock(6, 14),
    score('home', hawks[3], 2),
    { type: 'foul', side: 'home', playerId: hawks[3] },
    score('away', away[3], 1),
    ...clock(2, 40),
    score('away', away[0], 2),
    score('home', hawks[0], 2),
    { type: 'pause' },
    { type: 'period', period: 2 },
    { type: 'start' },
    ...clock(19, 12),
    score('away', away[4], 2),
    { type: 'team-turnover', side: 'away' },
    ...clock(16, 3),
    score('home', hawks[1], 3),
    { type: 'foul', side: 'away', playerId: away[2] },
  ];
  const live = await tablet(liveGame, 'local-scorekeeper-token');
  await live(...plays(bears));
  const done = await tablet(finalGame, 'local-owner-token');
  await done(...plays(lions), ...clock(0, 4), score('home', hawks[2], 2), { type: 'end' });
}

/**
 * The owner's taps that bring Admin → Schedule's season not public yet to a state (step
 * 2.160), from the season as the seed has it: any draft is discarded first, so each
 * picture, at each width, starts from no rounds. Nothing is published.
 */
/** The owner's taps for step 2.50's pictures of People (see adminPages). Scripts are off. */
async function peopleSteps(page, what) {
  const add = page.locator('#add-person');
  const send = async (form, button) => {
    await Promise.all([
      page.waitForEvent('load'),
      form.getByRole('button', { name: button }).click(),
    ]);
  };
  if (what === 'person-add-refused') {
    await add.getByLabel('First name').fill('Jon');
    await add.getByLabel('Last name').fill('Smiht');
    await add.getByLabel('Email (optional)').fill('jon.parent.example.test');
    await add.getByLabel('Date of birth (optional)').fill('2999-01-01');
    await send(add, 'Add to the league');
    await page.locator('#add-person [data-wrong]').first().waitFor();
    await page.locator('#add-person').scrollIntoViewIfNeeded();
    return;
  }
  await add.getByLabel('First name').fill('Jon');
  await add.getByLabel('Last name').fill('Smiht');
  await add.getByLabel('Email (optional)').fill('jon.parent@example.test');
  await add.getByLabel('Date of birth (optional)').fill('2014-06-01');
  await add.getByLabel('Child or adult').selectOption('child');
  await send(add, 'Add to the league');
  if (!/\/admin\/people\/[0-9a-f-]{36}/.test(page.url())) {
    throw new Error(`adding a person landed on ${page.url()}`);
  }
  if (what === 'person-added') return;
  const details = page.locator('#details');
  if (what === 'person-birth-date-asked') {
    // A date of birth that makes a player two years old is shown back before it is saved
    // (R-28 as changed on 2026-11-17).
    const year = new Date().getUTCFullYear() - 2;
    await details.getByLabel('Date of birth (optional)').fill(`${year}-01-15`);
    await send(details, 'Save details');
    await page.locator('#details [data-wrong="birthDate"]').waitFor();
    return;
  }
  await details.getByLabel('Last name').fill('Smith');
  await send(details, 'Save details');
  await page.getByText('Saved: Jon Smith.').waitFor();
}

/** The owner's taps for step 2.161's pictures (see adminPages). Scripts are off. */
/**
 * Step 2.49's answers, by the owner's own taps on the divisions and venues screens: a
 * division name already taken, refused beside its box; a division removed, with "Put it
 * back"; a venue's map link that is not https, refused beside its box; a court removed.
 * Each sets its own scene, so the picture at the other width finds it again.
 */
async function divisionVenueSteps(page, what) {
  if (what === 'divisions-refused' || what === 'venues-refused') {
    const venues = what === 'venues-refused';
    const form = page.locator(venues ? 'form[data-form="add-venue"]' : 'form[data-form="add"]');
    await form.getByLabel('Name').fill(venues ? 'Lakeview Gym' : 'east');
    if (venues) await form.getByLabel('Map link (if you like)').fill('http://maps.example.test');
    await form.getByRole('button', { name: venues ? 'Add the venue' : 'Add the division' }).click();
    await form.getByRole('alert').waitFor();
    return;
  }
  const venues = what === 'venues-court-removed';
  const scope = venues
    ? page.locator('section[data-venue="Riverside Hall"]')
    : page.locator('main');
  const name = venues ? 'Court B' : 'Spare';
  const holder = venues
    ? scope.locator(`[data-court="${name}"]`)
    : page.locator(`section[data-division="${name}"]`);
  if ((await holder.count()) === 0) {
    const form = scope.locator(venues ? 'form[data-form="add-court"]' : 'form[data-form="add"]');
    await form.getByLabel(venues ? 'Court name' : 'Name').fill(name);
    await form.getByRole('button', { name: venues ? 'Add the court' : 'Add the division' }).click();
    await holder.getByRole('status').waitFor();
  }
  await holder.getByLabel(`Yes, remove ${name}`).check();
  await holder
    .getByRole('button', { name: venues ? 'Remove the court' : 'Remove the division' })
    .click();
  await page.locator('[data-said="removed"]').waitFor();
}

async function undoSteps(page, what) {
  const tapTo = async (locator, url) => {
    await Promise.all([page.waitForEvent('load'), locator.click()]);
    if (!url.test(page.url())) throw new Error(`a step landed on ${page.url()}, not ${url}`);
  };
  if (what === 'schedule-game-removed') {
    const game = page
      .locator('li[data-game]', { has: page.locator('summary', { hasText: 'Edit this game' }) })
      .first();
    await game.locator('summary', { hasText: 'Edit this game' }).click();
    await tapTo(
      game.getByRole('button', { name: 'Remove game' }),
      /\/admin\/schedule(\?season=[\w-]+)?#(saved|game-[\w-]+)$/,
    );
    return;
  }
  if (what === 'team-put-back-no-number') {
    // The youth league asks for unique numbers: Jay Whitaker takes the 1 Tess Moreno wore,
    // then Tess, marked as left, is put back without it (R-32).
    await tapTo(
      page.locator('main').getByRole('link', { name: 'Rockets', exact: true }),
      /\/admin\/teams\//,
    );
    const row = (name) => page.locator('main ol > li', { hasText: name });
    const number = async (name, value) => {
      await row(name).locator('input[name=jerseyNumber]').fill(value);
      await tapTo(row(name).getByRole('button', { name: 'Save number and role' }), /done=/);
    };
    // The picture at the other width finds Tess already back: set the scene again.
    if ((await row('Tess Moreno').count()) === 1) {
      await number('Jay Whitaker', '13');
      await number('Tess Moreno', '1');
      const lately = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
      await row('Tess Moreno').locator('input[name=leftOn]').fill(lately);
      await tapTo(row('Tess Moreno').getByRole('button', { name: 'Mark as left' }), /done=left/);
    }
    await number('Jay Whitaker', '1');
    const formerly = page.locator('[data-left-entry]', { hasText: 'Tess Moreno' });
    await tapTo(
      formerly.getByRole('button', { name: 'Put back on the roster (marked by mistake)' }),
      /done=putBackNoNumber/,
    );
    return;
  }
  if (what === 'team-cannot-be-removed') {
    await tapTo(
      page.locator('main').getByRole('link', { name: 'Badgers', exact: true }),
      /\/admin\/teams\//,
    );
    return;
  }
  await tapTo(
    page.locator('main').getByRole('link', { name: 'Falcons', exact: true }),
    /\/admin\/teams\//,
  );
  if (what === 'team-leaving-refused') {
    const line = page.locator('main ol > li', { hasText: 'Marcus Oyelaran' });
    await line.locator('input[name=leftOn]').fill(`${new Date().getFullYear() + 1}-06-01`);
    await tapTo(line.getByRole('button', { name: 'Mark as left' }), /problem=/);
    return;
  }
  // The seed's Falcons already have a player who left. They have results, so since A-17
  // their bin says they cannot be removed and has no box to tick (step 2.180).
}

/**
 * Step 2.182's pictures: the first league's Winter 2027 brought to `want` ('shown' or
 * 'hidden') by the owner's own taps in Season settings (Show or Hide it again, then Yes),
 * when it is not so already; then, if `then` is given, that address of the league is
 * opened. Scripts are off. Showing ends on the panel's "done" answer, which is the picture.
 */
async function winterSteps(page, want, then) {
  const tapTo = async (locator, url) => {
    await Promise.all([page.waitForEvent('load'), locator.click()]);
    if (!url.test(page.url())) throw new Error(`a step landed on ${page.url()}, not ${url}`);
  };
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}/north-valley/admin/season?season=winter-2027`);
  const panel = page.locator('#who-can-see');
  const [button, yes, answer] =
    want === 'shown'
      ? ['Show this season to visitors', 'Yes, show it', /done=shown/]
      : ['Hide it again', 'Yes, hide it', /done=hidden/];
  const start = panel.getByRole('button', { name: button });
  if ((await start.count()) > 0) {
    await tapTo(start, /ask=/);
    await tapTo(panel.getByRole('button', { name: yes }), answer);
  }
  if (then !== undefined) await page.goto(`${origin}/north-valley${then}`);
}

/**
 * Step 2.47's pictures of a part of Season settings answering, by the owner's own taps
 * with scripts off: a preset chosen; a tiebreaker chosen twice and refused; points scored
 * put first among the tiebreakers, which asks before moving teams; the name and dates
 * saved as they are, which says "Saved" beside them.
 */
async function seasonPartSteps(page, what) {
  const origin = new URL(page.url()).origin;
  const edit = (part) => `${origin}/north-valley/admin/season?season=fall-2026&edit=${part}`;
  const tap = (locator) => Promise.all([page.waitForEvent('load'), locator.click()]);
  if (what === 'preset') {
    await page.goto(edit('game'));
    await tap(page.getByRole('button', { name: 'Use High school' }));
  } else if (what === 'refused' || what === 'moves') {
    await page.goto(edit('standings'));
    const box = (n) => page.locator(`select[name=tiebreaker${n}]`);
    if (what === 'refused') {
      await box(2).selectOption('head-to-head');
    } else {
      await box(1).selectOption('points-scored');
      await box(3).selectOption('');
    }
    await tap(page.getByRole('button', { name: 'Save the standings rules' }));
  } else {
    await page.goto(edit('name'));
    await tap(page.getByRole('button', { name: 'Save the name and dates' }));
  }
}

/**
 * Step 2.181's pictures: from the current season's schedule with no draft, the owner
 * removes both games of its last round from the draft and opens the round's controls;
 * with `remove`, taps "Remove this round" too. Scripts are off. Once the page is drawn the
 * draft is discarded from a second page, so the pictures after these find the season as
 * the seed has it (the drawn page does not change: it has no scripts).
 */
/**
 * Step 2.185's pictures, by taps with scripts off: any draft discarded first; the first
 * game that can be edited removed; then either the next one moved by half an hour, or the
 * removed one put back from the grid. A second page discards the draft afterwards, as
 * emptiedRoundSteps does, so the pictures after these find the season as the seed has it.
 */
async function draftPutBackSteps(page, then) {
  const answered = /\/admin\/schedule(\?[^#]*)?#(saved|game-[\w-]+)$/;
  const tapTo = async (on, locator, url) => {
    await Promise.all([on.waitForEvent('load'), locator.click()]);
    if (!url.test(on.url())) throw new Error(`a step landed on ${on.url()}, not ${url}`);
  };
  const discard = async (on) => {
    // A draft that changes nothing is discarded in one tap (step 2.185).
    const same = on.locator('[data-discard-same] button').first();
    if ((await same.count()) > 0) return tapTo(on, same, /done=discarded/);
    const box = on.locator('details', {
      has: on.locator('button', { hasText: 'Discard all draft changes' }),
    });
    if ((await box.count()) === 0) return;
    await box.locator('summary').click();
    await tapTo(on, box.locator('button'), /done=discarded/);
  };
  await discard(page);
  const editable = page.locator('li[data-game]', {
    has: page.locator('summary', { hasText: 'Edit this game' }),
  });
  const first = editable.first();
  const gameId = await first.getAttribute('data-game');
  await first.locator('summary', { hasText: 'Edit this game' }).click();
  await tapTo(page, first.getByRole('button', { name: 'Remove game' }), answered);
  if (then === 'move') {
    const next = editable.first();
    await next.locator('summary', { hasText: 'Edit this game' }).click();
    await next.locator('input[name=time]').fill('21:30');
    await tapTo(page, next.getByRole('button', { name: 'Save game' }), /saved=game-saved/);
  } else {
    const struck = page.locator(`li[data-removed-game="${gameId}"]`);
    await tapTo(page, struck.getByRole('button', { name: 'Put it back' }), answered);
    await page.goto(page.url().replace(/#.*$/, ''));
  }
  const other = await page.context().newPage();
  try {
    await other.goto(page.url().replace(/\?.*$/, ''));
    await discard(other);
  } finally {
    await other.close();
  }
}

async function emptiedRoundSteps(page, remove) {
  const tapTo = async (on, locator, url) => {
    await Promise.all([on.waitForEvent('load'), locator.click()]);
    if (!url.test(on.url())) throw new Error(`a step landed on ${on.url()}, not ${url}`);
  };
  const discard = async (on) => {
    // A draft that changes nothing is discarded in one tap (step 2.185).
    const same = on.locator('[data-discard-same] button').first();
    if ((await same.count()) > 0) return tapTo(on, same, /done=discarded/);
    const box = on.locator('details', {
      has: on.locator('button', { hasText: 'Discard all draft changes' }),
    });
    if ((await box.count()) === 0) return;
    await box.locator('summary').click();
    await tapTo(on, box.locator('button'), /done=discarded/);
  };
  await discard(page);
  const last = page.locator('section[data-round]').last();
  const games = last.locator('li[data-game]', {
    has: page.locator('summary', { hasText: 'Edit this game' }),
  });
  while ((await games.count()) > 0) {
    const game = games.first();
    await game.locator('summary', { hasText: 'Edit this game' }).click();
    await tapTo(
      page,
      game.getByRole('button', { name: 'Remove game' }),
      /\/admin\/schedule(\?season=[\w-]+)?#(saved|game-[\w-]+)$/,
    );
  }
  await last.locator('summary', { hasText: 'Change or remove this round' }).click();
  if (remove) {
    const button = last.getByRole('button', { name: 'Remove this round' });
    await tapTo(page, button, /saved=round-removed|at=round/);
  }
  const other = await page.context().newPage();
  try {
    await other.goto(page.url().replace(/\?.*$/, ''));
    await discard(other);
  } finally {
    await other.close();
  }
}

async function roundSteps(page, steps) {
  // Scripts are off in this page (the grid is plain forms): each tap loads a whole page.
  const tapTo = async (locator, url) => {
    await Promise.all([page.waitForEvent('load'), locator.click()]);
    if (!url.test(page.url())) throw new Error(`a step landed on ${page.url()}, not ${url}`);
  };
  const discard = page.locator('details', {
    has: page.locator('button', { hasText: 'Discard all draft changes' }),
  });
  if ((await discard.count()) > 0) {
    await discard.locator('summary').click();
    await tapTo(discard.locator('button'), /done=discarded/);
  }
  const round = (label) =>
    page.locator('section[data-round]', { has: page.locator('h2', { hasText: label }) });
  const addRoundForm = async () => {
    const panel = page.locator('[data-no-rounds] form');
    if ((await panel.count()) === 1) return panel;
    const foot = page.locator('details[data-add-round]');
    if ((await foot.getAttribute('open')) === null) await foot.locator('summary').click();
    return foot.locator('form');
  };
  const addRound = async (label, date) => {
    const form = await addRoundForm();
    await form.locator('input[name=label]').fill(label);
    await form.locator('input[name=date]').fill(date);
    await tapTo(form.locator('button', { hasText: 'Add round' }), /saved=round-added/);
  };
  const game = page.locator('li[data-game]').first();
  for (const step of steps) {
    if (step === 'rounds') {
      await addRound('Week 1', '2027-01-10');
      await addRound('Week 2', '2027-01-17');
      await addRound('Week 3', '2027-01-24');
    } else if (step === 'game') {
      const add = round('Week 1').locator('details[data-add-game]');
      await add.locator('summary').click();
      for (const [field, n] of [
        ['homeTeamId', 1],
        ['awayTeamId', 2],
      ]) {
        await add.locator(`select[name=${field}]`).selectOption({ index: n });
      }
      await add.locator('input[name=time]').fill('18:00');
      await tapTo(add.locator('button', { hasText: 'Add game' }), /done=saved/);
    } else if (step === 'move') {
      await game.locator('summary', { hasText: 'Edit this game' }).click();
      await game.locator('select[name=roundId]').selectOption({ label: 'Round 3: Week 3' });
      await tapTo(game.locator('button', { hasText: 'Save game' }), /saved=game-round/);
    } else if (step === 'keep') {
      await tapTo(
        page.locator('[data-follow-round-date] a', { hasText: 'No, keep' }),
        /season=winter-2027/,
      );
    } else if (step === 'edit') {
      // "Edit this game", opened: its fields, then Save game and, apart, Remove game.
      await game.locator('summary', { hasText: 'Edit this game' }).click();
    } else if (step === 'open') {
      for (const label of ['Week 1', 'Week 2']) {
        await round(label).locator('summary', { hasText: 'Change or remove this round' }).click();
      }
    } else if (step === 'bad-round-date') {
      const third = round('Week 3');
      await third.locator('summary', { hasText: 'Change or remove this round' }).click();
      const form = third.locator('form', {
        has: page.locator('button', { hasText: 'Change round date' }),
      });
      await form.locator('input[name=date]').fill('1899-01-01');
      await tapTo(form.locator('button', { hasText: 'Change round date' }), /at=round/);
    } else if (step === 'bad-new-date') {
      const form = await addRoundForm();
      await form.locator('input[name=label]').fill('Far week');
      await form.locator('input[name=date]').fill('3027-01-31');
      await tapTo(form.locator('button', { hasText: 'Add round' }), /at=add-round/);
    }
  }
}

/**
 * A league's design values as its pages carry them: the one `:root` block (T-90). The
 * admin's pages carry the workspace's own values, worked out from the league's (step
 * 2.103), so an admin page's are read from that league's admin, as its made-up owner.
 */
async function designValuesOf(origin, league, staff = false) {
  const html = await (
    await fetch(`${origin}/${league}${staff ? '/admin' : ''}`, {
      headers: staff ? { cookie: `${owner.name}=${owner.value}` } : {},
    })
  ).text();
  const found = /:root \{[^}]*\}/.exec(html);
  if (!found) throw new Error(`no design values on /${league}`);
  return found[0];
}

const dev = flag('--dev');
if (!dev && !flag('--no-build')) {
  console.log('Building the web app (a few minutes when the computer is busy).');
  const build = start(['build']);
  const status = await new Promise((resolve) => build.child.on('exit', resolve));
  if (status !== 0) {
    console.error(`next build failed:\n${build.output()}`);
    process.exit(1);
  }
}

const port = await freePort();
const origin = `http://localhost:${port}`;
const server = start(dev ? ['dev', '--port', String(port)] : ['start', '--port', String(port)], {
  PUBLIC_BASE_URL: origin,
  ...(design === '' ? {} : { LOCAL_DESIGN: design }),
  ...(binnedTeam === '' ? {} : { LOCAL_BINNED_TEAM: binnedTeam }),
});
const taken = [];
const missed = [];
// What `--measure` found on each public page: see measureContrast.
const measuring = flag('--measure');
const measured = [];
let browser;
try {
  await waitFor(`${origin}/`, server);
  browser = await launch();
  const looks = {};
  const tracked = gamePages['north-valley'].filter((page) => /game-(live|final)/.test(page.name));
  if (
    tracked.some((page) => wanted(`north-valley-${page.name}`)) ||
    wanted('north-valley-game-final-long-name') ||
    wanted('north-valley-game-live-long-name')
  ) {
    try {
      await scoreTrackedGames(origin);
    } catch (error) {
      missed.push(`the tracked games were not scored: ${String(error.message ?? error)}`);
    }
  }
  for (const width of widths) {
    fs.mkdirSync(path.join(out, width.name), { recursive: true });
    const visitor = await browser.newContext({ viewport: width.viewport });
    const staff = await browser.newContext({ viewport: width.viewport });
    await staff.addCookies([{ ...owner, url: origin }]);
    // A page reached by taps (`steps`) is driven with scripts off, as the browser tests
    // drive the grid: every form a whole page, so each tap's answer is waited for.
    const staffTapping = await browser.newContext({
      viewport: width.viewport,
      javaScriptEnabled: false,
    });
    await staffTapping.addCookies([{ ...owner, url: origin }]);
    const keeper = await browser.newContext({ viewport: width.viewport });
    await keeper.addCookies([{ ...scorekeeper, url: origin }]);
    const planner = await browser.newContext({ viewport: width.viewport });
    await planner.addCookies([{ ...scheduler, url: origin }]);
    const coaching = await browser.newContext({ viewport: width.viewport });
    await coaching.addCookies([{ ...coach, url: origin }]);
    const choosing = await browser.newContext({ viewport: width.viewport });
    await choosing.addCookies([{ ...chosenComets, url: origin }]);
    const teamless = await browser.newContext({ viewport: width.viewport });
    await teamless.addCookies([{ ...stranger, url: origin }]);
    // One browser for each person a refusal is pictured for (step 2.157).
    const refused = new Map();
    for (const page of design === '' ? refusalPages.filter((p) => wanted(p.name)) : []) {
      if (refused.has(page.who)) continue;
      const context = await browser.newContext({ viewport: width.viewport });
      if (page.who !== null) {
        await context.addCookies([{ name: 'srl_session', value: page.who, url: origin }]);
      }
      refused.set(page.who, context);
    }
    const jobs = [
      ...(design === '' ? platformPages : []).map((page) => ({
        ...page,
        context: visitor,
        base: '',
      })),
      ...picturedLeagues.flatMap((league) => [
        ...[...publicPages, ...(gamePages[league] ?? [])]
          // A page drawn with another league's values says nothing about a named design.
          .filter((page) => design === '' || page.lookOf === undefined)
          .map((page) => ({
            ...page,
            name: `${league}-${page.name}`,
            context: visitor,
            base: `/${league}`,
            // A league's public page: its text is measured too, when that is asked for.
            publicPage: true,
          })),
        // Under a named design the admin's plain pages are taken too: the workspace's look
        // is worked out from the league's design (step 2.103).
        ...(design === ''
          ? adminPages
          : adminPages.filter(
              (page) => !page.lookOf && !page.steps && !page.tap && !page.onlyIn && !page.league,
            )
        )
          // A page of one league's own season (`league`), or one state taken in one league
          // only (`onlyIn`), is taken in that league only.
          .filter(
            (page) =>
              (page.league === undefined || page.league === league) &&
              (page.onlyIn === undefined || page.onlyIn === league),
          )
          .map((page) => ({
            ...page,
            name: `${league}-${page.name}`,
            context: page.steps === undefined ? staff : staffTapping,
            base: `/${league}`,
          })),
      ]),
      ...(design === '' ? signedInPlatformPages : []).map((page) => ({
        ...page,
        context: staff,
        base: '',
      })),
      // Under a named design too: the account button sits in the header every design draws.
      ...accountMenuPages.map((page) => ({
        ...page,
        name: `${leagues[0]}-${page.name}`,
        context: staff,
        base: `/${leagues[0]}`,
      })),
      ...scorekeeperPages.map((page) => ({
        ...page,
        name: `${page.league ?? leagues[0]}-${page.name}`,
        context: keeper,
        base: `/${page.league ?? leagues[0]}`,
      })),
      ...(design === '' ? coachPages : []).map((page) => ({
        ...page,
        name: `${page.league ?? leagues[0]}-${page.name}`,
        context: coaching,
        base: `/${page.league ?? leagues[0]}`,
      })),
      ...(design === '' ? chosenTeamPages : []).map((page) => ({
        ...page,
        name: `${leagues[1]}-${page.name}`,
        context: choosing,
        base: `/${leagues[1]}`,
      })),
      ...(design === '' ? noTeamPages : []).map((page) => ({
        ...page,
        name: `${leagues[0]}-${page.name}`,
        context: teamless,
        base: `/${leagues[0]}`,
      })),
      ...(design === '' ? schedulerPages : []).map((page) => ({
        ...page,
        name: `${leagues[0]}-${page.name}`,
        context: planner,
        base: `/${leagues[0]}`,
      })),
      ...(design === '' ? refusalPages : [])
        .filter((page) => refused.has(page.who))
        .map((page) => ({ ...page, context: refused.get(page.who), base: '' })),
      ...(design === '' ? draftPages : []).map((page) => ({
        ...page,
        name: `${draftLeague}-${page.name}`,
        context: staff,
        base: `/${draftLeague}`,
      })),
    ].filter((job) => wanted(job.name));
    for (const job of jobs) {
      const label = `${width.name}/${fileName(job.name)}`;
      const page = await job.context.newPage();
      page.setDefaultTimeout(90_000);
      try {
        let answer = await page.goto(`${origin}${job.base}${job.at}`, { waitUntil: 'networkidle' });
        if (job.first) {
          const link = await page
            .locator(`main a[href*="${job.first}"]`)
            .first()
            .getAttribute('href', { timeout: 5_000 })
            .catch(() => null);
          if (!link) {
            missed.push(`${label}: no link containing ${job.first} on ${job.base}${job.at}`);
            continue;
          }
          answer = await page.goto(new URL(link, origin).href, { waitUntil: 'networkidle' });
        }
        if (job.steps) await job.steps(page);
        // A state reached by tapping (step 2.155): nothing of it rides in the address.
        if (job.tap) {
          await job.tap(page);
          await page.waitForLoadState('networkidle');
        }
        if (job.lookOf) {
          // The same page under another league's design values: only the `:root` block changes.
          const staffLook = job.at.startsWith('/admin');
          const look = `${job.lookOf}${staffLook ? ' (admin)' : ''}`;
          looks[look] ??= await designValuesOf(origin, job.lookOf, staffLook);
          await page.evaluate((values) => {
            for (const style of document.querySelectorAll('style')) {
              if (/:root \{[^}]*--color-background/.test(style.textContent ?? '')) {
                style.textContent = style.textContent.replace(/:root \{[^}]*\}/, values);
              }
            }
            return document.fonts.ready.then(() => undefined);
          }, looks[look]);
          await page.waitForTimeout(500);
        }
        // The faces a page draws are fetched as it is laid out: wait for them, so no
        // picture shows the stand-in face a reader sees for the first moment.
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        if (job.opens) {
          // The account button: in the phone menu's panel on a phone, its own from a tablet up.
          const phone = width.viewport.width < 768;
          await page.locator(phone ? '.site-menu > summary' : '.site-account > summary').click();
          await page
            .locator(phone ? '.site-menu-account' : '.site-account-panel')
            .waitFor({ state: 'visible' });
          await page.waitForTimeout(300);
        }
        // The admin's own menu on a phone, and the pill of a league that is not public:
        // each a plain disclosure, opened by its own button where that is on the screen.
        const opened = job.opensStaffMenu
          ? '.staff-bar .staff-menu'
          : job.opensStaffStatus
            ? `.${width.viewport.width < 1024 ? 'staff-bar' : 'staff-side'} .staff-status`
            : null;
        if (opened !== null && (await page.locator(`${opened} > summary`).isVisible())) {
          await page.locator(`${opened} > summary`).click();
          await page.waitForTimeout(300);
        }
        // Nothing of the tool on the screen: Next.js's dev indicator hidden, and the pointer
        // away from every card (step 2.155's design review). After the account button is
        // opened, so the pointer leaves it too; an opened panel stays open when it does.
        // (Inserted by hand: addStyleTag waits on a page with scripts off.)
        await page.evaluate(() => {
          const style = document.createElement('style');
          style.textContent = 'nextjs-portal { display: none !important; }';
          document.head.append(style);
        });
        await page.mouse.move(0, 0);
        const file = path.join(out, width.name, `${fileName(job.name)}.jpg`);
        const whole = !job.opens && opened === null;
        // A whole page is taken from its top: a page a tap has scrolled (to a box that took
        // the focus) would be drawn with the row that stays on top across its middle.
        if (whole) await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: file,
          fullPage: whole,
          type: 'jpeg',
          quality: 80,
        });
        if (measuring && job.publicPage) {
          measured.push({ label, ...(await page.evaluate(measureContrast)) });
        }
        taken.push(
          `${label}.jpg${(answer?.status() ?? 200) >= 400 ? ` (the page answered ${answer.status()})` : ''}`,
        );
      } catch (error) {
        missed.push(`${label}: ${String(error.message ?? error).split('\n')[0]}`);
      } finally {
        await page.close();
      }
    }
    await visitor.close();
    await staff.close();
    await staffTapping.close();
    await keeper.close();
    await planner.close();
    await coaching.close();
    await choosing.close();
    await teamless.close();
    for (const context of refused.values()) await context.close();
  }
  // A game won in overtime (`--only=overtime`): scored now, after every other picture.
  {
    const jobs = (design === '' ? overtimePages : []).filter((job) =>
      wanted(`${leagues[0]}-${job.name}`),
    );
    let scored = jobs.length > 0;
    if (scored) {
      try {
        await scoreOvertimeGame(origin);
      } catch (error) {
        scored = false;
        missed.push(`the overtime game was not scored: ${String(error.message ?? error)}`);
      }
    }
    for (const width of scored ? widths : []) {
      fs.mkdirSync(path.join(out, width.name), { recursive: true });
      const contexts = {};
      for (const [as, cookie] of [
        ['visitor', null],
        ['owner', owner],
        ['scorekeeper', scorekeeper],
      ]) {
        contexts[as] = await browser.newContext({ viewport: width.viewport });
        if (cookie !== null) await contexts[as].addCookies([{ ...cookie, url: origin }]);
      }
      for (const job of jobs) {
        const name = `${leagues[0]}-${job.name}`;
        const label = `${width.name}/${name}`;
        const page = await contexts[job.as].newPage();
        page.setDefaultTimeout(90_000);
        try {
          await page.goto(`${origin}/${leagues[0]}${job.at}`, { waitUntil: 'networkidle' });
          await page.evaluate(() => {
            const style = document.createElement('style');
            style.textContent = 'nextjs-portal { display: none !important; }';
            document.head.append(style);
            return document.fonts.ready.then(() => undefined);
          });
          await page.mouse.move(0, 0);
          await page.screenshot({
            path: path.join(out, width.name, `${name}.jpg`),
            fullPage: true,
            type: 'jpeg',
            quality: 80,
          });
          taken.push(`${label}.jpg`);
        } catch (error) {
          missed.push(`${label}: ${String(error.message ?? error).split('\n')[0]}`);
        } finally {
          await page.close();
        }
      }
      for (const context of Object.values(contexts)) await context.close();
    }
  }
  // The phone menu, open (`--only=menu`), at 390 in each league's own look.
  {
    // On a page of the schedule, so the panel holds everything it can: the menu, sign-in
    // and the season picker of a league with more than one season.
    const jobs = picturedLeagues
      .map((league) => ({ name: `${league}-menu-open`, at: `/${league}/schedule` }))
      .filter((job) => wanted(job.name));
    if (jobs.length > 0) {
      fs.mkdirSync(path.join(out, menuWidth.name), { recursive: true });
      const visitor = await browser.newContext({ viewport: menuWidth.viewport });
      for (const job of jobs) {
        const page = await visitor.newPage();
        page.setDefaultTimeout(90_000);
        try {
          await page.goto(`${origin}${job.at}`, { waitUntil: 'networkidle' });
          await page.locator('.site-header .site-menu > summary').click();
          await page.locator('.site-header .site-menu-panel').waitFor({ state: 'visible' });
          await page.waitForTimeout(300);
          // The screen as a visitor holds it: the open panel over the top of the page.
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          await page.screenshot({
            path: path.join(out, menuWidth.name, `${fileName(job.name)}.jpg`),
            type: 'jpeg',
            quality: 80,
          });
          taken.push(`${menuWidth.name}/${fileName(job.name)}.jpg`);
        } catch (error) {
          missed.push(
            `${menuWidth.name}/${job.name}: ${String(error.message ?? error).split('\n')[0]}`,
          );
        } finally {
          await page.close();
        }
      }
      await visitor.close();
    }
  }
  // The states of links, buttons, cards and pickers (`--only=states`), and the laptop
  // header while the page is scrolled (`--only=header-scrolled`): the first league only.
  for (const [width, pages] of [
    [statesWidth, statePages],
    [menuWidth, phoneStatePages],
  ]) {
    const jobs = pages
      .map((job) => ({ ...job, name: `${leagues[0]}-${job.name}` }))
      .filter((job) => wanted(job.name));
    const scrolled = `${leagues[0]}-header-scrolled`;
    const wantsScrolled = width === statesWidth && wanted(scrolled);
    if (jobs.length === 0 && !wantsScrolled) continue;
    fs.mkdirSync(path.join(out, width.name), { recursive: true });
    const visitor = await browser.newContext({ viewport: width.viewport });
    const quiet = async (page) => {
      await page.evaluate(() => {
        const style = document.createElement('style');
        style.textContent = 'nextjs-portal { display: none !important; }';
        document.head.append(style);
        return document.fonts.ready.then(() => undefined);
      });
    };
    for (const job of jobs) {
      const page = await visitor.newPage();
      page.setDefaultTimeout(30_000);
      const label = `${width.name}/${fileName(job.name)}`;
      try {
        await page.goto(`${origin}/${leagues[0]}${job.at}`, { waitUntil: 'networkidle' });
        await quiet(page);
        const part = page.locator(job.part).first();
        await part.scrollIntoViewIfNeeded();
        if (job.focus) {
          // The keyboard first, so the browser shows focus as it does for a keyboard.
          await page.keyboard.press('Tab');
          await page.locator(job.focus[0]).nth(job.focus[1]).focus();
        }
        if (job.hover) await page.locator(job.hover[0]).nth(job.hover[1]).hover();
        await page.waitForTimeout(400);
        const file = path.join(out, width.name, `${fileName(job.name)}.jpg`);
        if (job.viewport) await page.screenshot({ path: file, type: 'jpeg', quality: 85 });
        else await part.screenshot({ path: file, type: 'jpeg', quality: 85 });
        taken.push(`${label}.jpg`);
      } catch (error) {
        missed.push(`${label}: ${String(error.message ?? error).split('\n')[0]}`);
      } finally {
        await page.close();
      }
    }
    if (wantsScrolled) {
      // The home page a screen and a half down: only the menu's row stays on top (line 8).
      const page = await visitor.newPage();
      page.setDefaultTimeout(30_000);
      try {
        await page.goto(`${origin}/${leagues[0]}`, { waitUntil: 'networkidle' });
        await quiet(page);
        await page.mouse.wheel(0, 1200);
        await page.waitForTimeout(600);
        await page.screenshot({
          path: path.join(out, width.name, `${fileName(scrolled)}.jpg`),
          type: 'jpeg',
          quality: 80,
        });
        taken.push(`${width.name}/${fileName(scrolled)}.jpg`);
      } catch (error) {
        missed.push(`${width.name}/${scrolled}: ${String(error.message ?? error).split('\n')[0]}`);
      } finally {
        await page.close();
      }
    }
    await visitor.close();
  }
  // Long names (`--only=long-name`), at the two narrowest phones. In the picture only, the
  // league's name in the header is rewritten to a made-up one of 54 letters, and a made-up
  // team name of 36 letters is put wherever the page names a team first: the first row of
  // every table (and every note under a standings table that names that team), the first
  // team of a scoreboard, of the first game card and of the first team card, and a team
  // page's own heading. Each page is taken as it opens and again
  // with its tables scrolled to their far end, which shows the numbers can still be reached.
  for (const width of longNameWidths) {
    const jobs = longNamePages.filter(
      (job) => wanted(job.name) && picturedLeagues.some((league) => job.name.startsWith(league)),
    );
    if (jobs.length === 0) continue;
    fs.mkdirSync(path.join(out, width.name), { recursive: true });
    const visitor = await browser.newContext({ viewport: width.viewport });
    for (const job of jobs) {
      const page = await visitor.newPage();
      page.setDefaultTimeout(90_000);
      try {
        await page.goto(`${origin}${job.at}`, { waitUntil: 'networkidle' });
        await page.evaluate(
          ({ name, word, league, heading }) => {
            const put = (el, text) => {
              if (el) el.textContent = text;
            };
            put(document.querySelector('.site-header .site-name > span'), league);
            for (const table of document.querySelectorAll('table.ui-table')) {
              // Only the name's own words are replaced. In the standings they have an
              // element of their own, with a note's mark after it in the same flow, and
              // the picture must show where the mark lands.
              const cell = table.querySelector('tbody .ui-team-cell > [dir]');
              const named = cell?.querySelector('.ui-team-name') ?? cell;
              const before = named?.textContent ?? '';
              put(named, name);
              // A standings note names the teams it is beside (step 2.195): the long name
              // goes into the notes under that table too, wherever they name the team.
              const notes = table.closest('.ui-table-wrap')?.querySelectorAll('.ui-footnotes li');
              for (const note of notes ?? []) {
                if (before !== '' && note.textContent.includes(before)) {
                  note.textContent = note.textContent.split(before).join(name);
                }
              }
            }
            put(document.querySelector('.ui-scoreboard-name > [dir]'), name);
            // The first game card gets the long name, and the next card one long word. A
            // scoreboard is told how many letters its longer name needs room for, exactly
            // as the card works it out when it is drawn with that name (packages/ui,
            // nameMeasure: the longer line of the name's best break into two): its teams
            // then stand one over the other where the card is too narrow for them side by
            // side. These made-up names are in Latin letters, one letter wide each.
            const measure = (text) => {
              const words = text
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .map((w) => [...w].length);
              const whole = words.reduce((sum, w) => sum + w, 0) + words.length - 1;
              let best = whole;
              let first = -1;
              for (const word of words.slice(0, -1)) {
                first += word + 1;
                best = Math.min(best, Math.max(first, whole - first - 1));
              }
              return Math.max(0, best);
            };
            const cards = [...document.querySelectorAll('.ui-game-card')];
            for (const [card, text] of [
              [cards[0], name],
              [cards[1], word],
            ]) {
              if (!card) continue;
              put(card.querySelector('.ui-game-team-name'), text);
              // Every board of a list reckons with the list's longest name (packages/ui,
              // listRoom), so the whole list is told the new one.
              const boards = card.closest('ul')?.querySelectorAll('.ui-game-board') ?? [];
              for (const board of boards) {
                const now = Number(board.style.getPropertyValue('--letters'));
                board.style.setProperty('--letters', String(Math.max(now, measure(text))));
              }
            }
            put(document.querySelector('.ui-team-card-name a'), name);
            if (heading) put(document.querySelector('.ui-page-head h1'), name);
          },
          {
            name: longName,
            word: longWord,
            league: longLeagueName,
            heading: job.heading === true,
          },
        );
        const hasTables = (await page.locator('.ui-table-wrap').count()) > 0;
        for (const scrolled of hasTables ? [false, true] : [false]) {
          if (scrolled) {
            await page.evaluate(() => {
              for (const box of document.querySelectorAll('.ui-table-wrap')) {
                box.scrollLeft = box.scrollWidth;
              }
            });
            await page.waitForTimeout(300);
          }
          const name = fileName(`${job.name}${scrolled ? '-scrolled' : ''}`);
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          await page.screenshot({
            path: path.join(out, width.name, `${name}.jpg`),
            fullPage: true,
            type: 'jpeg',
            quality: 80,
          });
          taken.push(`${width.name}/${name}.jpg`);
        }
      } catch (error) {
        missed.push(`${width.name}/${job.name}: ${String(error.message ?? error).split('\n')[0]}`);
      } finally {
        await page.close();
      }
    }
    await visitor.close();
  }
} finally {
  await browser?.close();
  server.child.kill();
}

console.log(`${taken.length} pictures in ${path.relative(root, out)}:`);
for (const line of taken) console.log(`  ${line}`);
if (measuring) {
  // One line a page, then every text or control that falls short, in a file beside the
  // pictures: `.local/shots/contrast.txt`, or `contrast-in-<design>.txt` under a named one.
  const lines = measured.flatMap((page) => [
    `${page.label}: ${page.texts} texts, ${page.controls} controls, lowest ${page.lowest}, ${page.short.length} short`,
    ...page.short.map((line) => `    ${line}`),
  ]);
  const short = measured.reduce((sum, page) => sum + page.short.length, 0);
  const file = path.join(out, `${fileName('contrast')}.txt`);
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  console.log(
    `Contrast measured on ${measured.length} pages: ${short} short of AA. ${path.relative(root, file)}`,
  );
}
if (missed.length) {
  console.log(`${missed.length} not taken:`);
  for (const line of missed) console.log(`  ${line}`);
  process.exit(1);
}
