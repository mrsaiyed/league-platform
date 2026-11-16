// Pictures of every screen, so that whoever designs or reviews a screen has seen it
// (docs/build/DESIGN.md, section 2). The web app runs on its made-up stand-in (APP_ENV=test):
// made-up leagues and people, no database, nothing leaves this computer.
//
//   node scripts/shots.mjs                      builds the web app in this folder, then takes them
//   node scripts/shots.mjs --dev                `next dev` instead of a build (quicker to start)
//   node scripts/shots.mjs --no-build           serves the build that is already here
//   node scripts/shots.mjs --only=home,admin    only pictures whose name contains one of these
//   node scripts/shots.mjs --design=pine        the first made-up league under a named design
//
// `--design=<name>` proves that every shared piece takes its colors from a league's design
// (docs/build/DESIGN.md, section 4, line 28). It starts the web app with the first made-up
// league drawn under that design (the LOCAL_DESIGN setting, which the app refuses outside
// local work and tests, as it does the stand-in itself) and takes that league's public
// pages only, named `…-in-<name>.jpg`. The names are the starting designs (crest,
// crest-light, midnight-gold, clean-court) and the made-up ones kept for pictures (pine:
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
      for (const [i, value] of typed.entries()) await points.nth(i).fill(String(value));
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
      // A count the phone's own check would stop: the form is sent as a browser that does
      // not check would send it, so the server's refusal is what is pictured.
      const points = page.locator('main input[name^="stat.points."]');
      await points.nth(3).fill('1000');
      await page.locator('main form:has(#box-score-scores)').evaluate((form) => {
        form.noValidate = true;
      });
      await page.locator('main form button[type="submit"]').last().click();
      await page.locator('#box-score-scores [role="alert"]').waitFor();
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
  { name: 'admin-teams', at: '/admin/teams' },
  { name: 'admin-team', at: '/admin/teams', first: '/admin/teams/' },
  { name: 'admin-schedule', at: '/admin/schedule' },
  // Step 2.160, in the first made-up league's season that is not public yet (only it has
  // one), each also in the second league's light look: the empty season with its form;
  // "Saved" after adding a round; the moved game's question; a game outside its round with
  // its button; a round's controls opened, one with "Remove this round" and one saying why
  // it cannot be removed; a round date refused beside its round, and a new round's date
  // refused beside its field. Each is reached by the owner's own taps (roundSteps).
  ...[
    { name: 'admin-schedule-no-rounds', steps: [] },
    { name: 'admin-schedule-round-added', steps: ['rounds'] },
    { name: 'admin-schedule-move-question', steps: ['rounds', 'game', 'move'] },
    { name: 'admin-schedule-outside-round', steps: ['rounds', 'game', 'move', 'keep'] },
    { name: 'admin-schedule-round-controls', steps: ['rounds', 'game', 'open'] },
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
  { name: 'admin-settings', at: '/admin/settings' },
  { name: 'admin-people', at: '/admin/people' },
  { name: 'admin-standings', at: '/admin/standings' },
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

// What the scorekeeper sees (step 2.33): their games, and the tracker opened from them.
const scorekeeperPages = [
  { name: 'scorekeeper-games', at: '/admin' },
  { name: 'scorekeeper-tracker', at: '/admin', first: '/score/' },
  // The games list as a scorekeeper sees it: a final game says who can reopen it (2.154).
  { name: 'scorekeeper-games-list', at: '/admin/games' },
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
/** A picture's file name: marked with the design it was taken under, when one is named. */
const fileName = (name) => (design === '' ? name : `${name}-in-${design}`);
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

/** A league's design values as its pages carry them: the one `:root` block (T-90). */
async function designValuesOf(origin, league) {
  const html = await (await fetch(`${origin}/${league}`)).text();
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
});
const taken = [];
const missed = [];
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
          })),
        ...(design === '' ? adminPages : [])
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
        name: `${leagues[0]}-${page.name}`,
        context: keeper,
        base: `/${leagues[0]}`,
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
          looks[job.lookOf] ??= await designValuesOf(origin, job.lookOf);
          await page.evaluate((values) => {
            for (const style of document.querySelectorAll('style')) {
              if (/:root \{[^}]*--color-background/.test(style.textContent ?? '')) {
                style.textContent = style.textContent.replace(/:root \{[^}]*\}/, values);
              }
            }
            return document.fonts.ready.then(() => undefined);
          }, looks[job.lookOf]);
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
        await page.screenshot({ path: file, fullPage: !job.opens, type: 'jpeg', quality: 80 });
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
  // Long names (`--only=long-name`), at the two narrowest phones. In the picture only, the
  // league's name in the header is rewritten to a made-up one of 54 letters, and a made-up
  // team name of 36 letters is put wherever the page names a team first: the first row of
  // every table, the first team of a scoreboard, of the first game card and of the first
  // team card, and a team page's own heading. Each page is taken as it opens and again
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
              put(cell?.querySelector('.ui-team-name') ?? cell, name);
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
if (missed.length) {
  console.log(`${missed.length} not taken:`);
  for (const line of missed) console.log(`  ${line}`);
  process.exit(1);
}
