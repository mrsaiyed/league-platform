// The web app shell's check against the real built server (step 1.17), with no
// browser: npm run test:web. Builds the app (skip with --no-build), starts it on
// this computer with made-up settings on the made-up stand-in (APP_ENV=test), asks
// for addresses as different made-up people, and checks the status and the words of
// each answer, the league's own design, name and the "Powered by" mark (step 1.18): "you do not have access" for admin addresses without access (U-6),
// a draft league only for those with an admin area in it and a suspended one only
// for its owner and admins (U-9, step 2.87), forwarding (U-7), and
// the security headers on every answer.
// Then it starts the app as staging with a database address that answers nobody,
// and checks that it refuses to start (T-60). Nothing leaves this computer.
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adminPlaceholder } from './admin-placeholder.mjs';
import { checkStructure, formatViolation } from './structure/index.mjs';
import { withLoopback } from './web-listen.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(root, 'apps/web');
const nextBin = createRequire(path.join(app, 'package.json')).resolve('next/dist/bin/next');

/**
 * The environment the servers start from (T-201): only what Node.js and Next.js need
 * to run on this computer, never this shell's own settings, so no real address, key
 * or secret this shell holds (DATABASE_URL, RESEND_API_KEY, STRIPE_*, SESSION_SECRET,
 * PG*, anything else) can ride along. Every setting the app reads is made up below.
 */
const runOnly = [
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'TEMP',
  'TMP',
  'TMPDIR',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMDATA',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
  'OS',
  'LANG',
];

const madeUp = {
  LOG_LEVEL: 'warn',
  EMAIL_FROM: 'hello@example.test',
};

// The made-up people's session cookies (apps/web/src/server/stand-in-ports.ts).
const tokens = {
  owner: 'local-owner-token',
  scheduler: 'local-scheduler-token',
  coach: 'local-coach-token',
  stranger: 'local-stranger-token',
  admin: 'local-admin-token',
  registrar: 'local-registrar-token',
  editor: 'local-editor-token',
  scorekeeper: 'local-scorekeeper-token',
  clubAdmin: 'local-club-admin-token',
  programScheduler: 'local-program-scheduler-token',
  otherAdmin: 'local-other-admin-token',
  // The Owls' coach, by a coach role on that one team (step 2.46).
  teamCoach: 'local-team-coach-token',
};

// The made-up leagues' ids (stand-in-ports.ts), which name the cookie of a device's "my team".
const northValley = '01900000-0000-7000-8000-000000000001';
const harborCity = '01900000-0000-7000-8000-000000000002';
const quietPines = '01900000-0000-7000-8000-000000000003';
// Two of the made-up games of the first league (stand-in-games.ts).
const liveGame = '01900000-0000-7000-8000-006a00000002';
const unassignedGame = '01900000-0000-7000-8000-006a00000003';

/** A made-up game of North Valley (apps/web/src/server/stand-in-games.ts): 1 scheduled,
 * 2 live (Hawks v Bears), 5 final (Bears v Lions), 6 in a season still being set up. */
const game = (n) => `01900000-0000-7000-8000-006a${n.toString(16).padStart(8, '0')}`;
/** The draft league's game nobody scored, two days ago, assigned to the scorekeeper. */
const draftUnscored = '01900000-0000-7000-8000-0000b20003e8';

// Which refusal the page made. Next.js 16 sends a refused page as a shell that the
// browser's script fills with the not-found or forbidden screen (record 020), so
// the refusal is read from the page's data, beside its status.
// A made-up invitation token of the right shape, which no invitation has (step 2.97).
const heldMadeUpToken = 'made-up-invitation-token-000000000000000000';
const noAccess = 'NEXT_HTTP_ERROR_FALLBACK;403';
const notFound = 'NEXT_HTTP_ERROR_FALLBACK;404';

// A link in the admin's own navigation (features/staff/staff-nav.tsx). The area's
// name alone is no proof: the site's menu has "Schedule" and "Teams" too.
const adminLink = (league, area) => `href="/${league}/admin/${area}"`;

// A page's own markup: what the browser draws before any script runs. The page's data
// (`self.__next_f.push` pieces) and every other script are left out, so words a refusal's
// copy or any other data holds cannot stand in for what is drawn.
const drawnMarkup = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');

/**
 * The staff frame drawn in the page's markup (features/staff/staff-frame.tsx and
 * staff-nav.tsx, step 2.103): the bar on top, and the admin's own menu, both copies of it
 * (the phone's panel and the side), each marking `href` as the place the page is in, and
 * only that. The words "Admin areas" alone are no proof: they are in a refusal's copy in
 * every admin page's data.
 */
const staffFrameAt = (href) => ({
  label: `the staff frame drawn, its menu at ${href}`,
  problem(html) {
    const markup = drawnMarkup(html);
    if (!markup.includes('<header class="staff-bar">')) return 'no staff bar drawn';
    const menus = [...markup.matchAll(/<nav class="staff-nav"[^>]*>([\s\S]*?)<\/nav>/g)];
    if (menus.length !== 2) return `${menus.length} copies of the admin's menu drawn, not 2`;
    for (const [, menu] of menus) {
      const marked = [...menu.matchAll(/<a\b[^>]*\baria-current="page"[^>]*>/g)];
      if (marked.length !== 1 || !marked[0][0].includes(`href="${href}"`)) {
        return `the admin's menu marks ${marked.map((m) => m[0]).join(', ') || 'nothing'}`;
      }
    }
    return undefined;
  },
});

/** Exactly one main heading drawn in the page's markup. */
const oneHeading = {
  label: 'one h1',
  problem(html) {
    const count = (drawnMarkup(html).match(/<h1[\s>]/g) ?? []).length;
    return count === 1 ? undefined : `${count} h1 headings drawn, not 1`;
  },
};

/** The Lions, a team of the first league's current season (stand-in-world-seed.ts). */
const lionsTeam = '01900000-0000-7000-8000-007e00000001';

/**
 * [who, path, status, words that must be there (or a check of the drawn markup, such as
 * staffFrameAt), words that must not, forward to, extra cookies]
 *
 * Grouped by page, in the order a person meets them. A new case goes in the group of its
 * own page or area, beside the cases like it, never at the end of the list, so two steps
 * that each add one rarely touch the same lines (step 2.188, record 072).
 */
const cases = [
  // Step 2.127: the front page says what SR Leagues is and offers "Sign in" to a visitor
  // (the words it is found by changed from the placeholder's "Find your league, or start
  // one"); a signed-in person sees their leagues first, and only those they may see.
  [
    'visitor',
    '/',
    200,
    ['SR Leagues runs the websites of sports leagues', 'Sign in'],
    ['This page is not built yet.', 'Your leagues', 'Signed in as'],
  ],
  [
    'owner',
    '/',
    200,
    ['Your leagues', 'North Valley League', 'Harbor City League', 'Quiet Pines League', 'Owner'],
    ['Binned League', 'binned-league'],
  ],
  [
    'scheduler',
    '/',
    200,
    ['North Valley League', 'Scheduler', 'Quiet Pines League'],
    ['Harbor City'],
  ],
  ['coach', '/', 200, ['North Valley League', 'Coach'], ['Quiet Pines']],
  ['stranger', '/', 200, ['The leagues you belong to will be listed here'], ['North Valley']],
  [
    'owner',
    '/account',
    200,
    ['Signed in as local-owner-token@example.test', 'Your leagues', 'North Valley League'],
  ],
  // The sign-in screen names only a league this person may see (return-league.ts, U-9):
  // never a draft or a suspended league to a visitor or the coach, nor a league that does
  // not exist; a live league to anyone.
  [
    'visitor',
    '/signin?next=%2Fnorth-valley',
    200,
    ['Sign in to carry on at North Valley League.', 'Back to North Valley League'],
  ],
  // Sent to sign in from a page that refused them, "Back to" leads to the league's home,
  // never to the refusal again; signing in still goes on to the page (review of 2.157).
  [
    'visitor',
    '/signin?next=%2Fnorth-valley%2Fadmin%2Fteams',
    200,
    [
      '<a class="ui-button" data-kind="quiet" href="/north-valley">Back to North Valley League</a>',
      'name="next" value="/north-valley/admin/teams"',
    ],
  ],
  // A signed-in person refused there ("Use another account") is told who they are signed in
  // as and can sign out to use another, coming back to sign in for the same page (2.163).
  [
    'coach',
    '/signin?next=%2Fnorth-valley%2Fadmin%2Fteams',
    200,
    [
      'You are already signed in',
      'Sign out and use another account',
      'name="next" value="/signin?next=%2Fnorth-valley%2Fadmin%2Fteams"',
    ],
    ['name="password"'],
  ],
  ...['visitor', 'coach'].flatMap((who) =>
    ['%2Fquiet-pines', '%2Fquiet-pines%2Fadmin', '%2Fclosed-gate', '%2Fno-such-league'].map(
      (next) => [
        who,
        `/signin?next=${next}`,
        200,
        ['Sign in'],
        ['carry on at', 'Back to', 'Quiet Pines', 'Closed Gate'],
      ],
    ),
  ),
  // Step 2.96: the two local-only pages answer on made-up data (here APP_ENV=test) and
  // show no password; nothing is served under the kept emails' page, not its files; and
  // no page a visitor sees links to either. In staging and production they answer as an
  // unknown /signin/<name>, by the same route (apps/web/src/server/local-only.test.ts):
  // neither mode can serve a page today, as the check at the end of this file shows.
  [
    'visitor',
    '/signin/kept-emails',
    200,
    ['Emails kept on this computer', 'None of them left it'],
    ['made-up owner password'],
  ],
  [
    'visitor',
    '/signin/made-up-people',
    200,
    ['Be a made-up person', 'Olive Owner', 'owner@example.test', 'Open North Valley League as'],
    ['made-up owner password', 'made-up member password', 'local-owner-token'],
  ],
  ...['/signin/kept-emails/anything.json', '/signin/kept-emails/anything.html'].map((address) => [
    'visitor',
    address,
    404,
    [notFound],
  ]),
  ...['/', '/signin', '/signup', '/north-valley'].map((address) => [
    'visitor',
    address,
    200,
    [],
    ['/signin/kept-emails', '/signin/made-up-people'],
  ]),
  // The account button (U-8): a signed-in person's own, never in a visitor's page.
  [
    'owner',
    '/north-valley',
    200,
    ['Signed in as local-owner-token@example.test', 'My games to score', 'Your account'],
    ['Sign in or create an account'],
  ],
  [
    'visitor',
    '/north-valley',
    200,
    ['Sign in or create an account', 'href="/signin?next=%2Fnorth-valley"'],
    ['Signed in as', 'site-account', 'My games to score', 'local-owner-token'],
  ],
  // The sign-in screens (step 1.14).
  ['visitor', '/account', 307, [], [], '/signin?next=%2Faccount'],
  ['owner', '/account', 200, ['Your account', 'Signed-in devices', 'Sign out everywhere']],
  // Google is not set up here (GOOGLE_SIGN_IN), so no screen offers it (step 2.163, M27).
  [
    'visitor',
    '/signin',
    200,
    ['Sign in', 'Forgot your password?', 'New here? Create an account'],
    ['Continue with Google'],
  ],
  // Nor does a refusal of the bot check: its words without Google (M27).
  [
    'visitor',
    '/signin?problem=botCheckFailed',
    200,
    ['We could not check that you are a person.', 'try again in a few minutes'],
    ['Continue with Google'],
  ],
  ['visitor', '/signin?problem=wrongEmailOrPassword', 200, ['Wrong email or password.']],
  ['visitor', '/signin?problem=%3Cscript%3E', 200, ['Sign in'], ['role="alert"']],
  // A lock-out is said in minutes, with the way in that does not wait (step 2.163, M28).
  [
    'visitor',
    '/signin?problem=tooManyAttempts&wait=900',
    200,
    ['Please wait 15 minutes, or tap &quot;Forgot your password?&quot; to choose a new one now.'],
    ['900 seconds'],
  ],
  ['visitor', '/signup', 200, ['Create your account', 'Email me a code'], ['Continue with Google']],
  // The forgotten-password route is "Choose a new password", with a way back (step 2.163).
  ['visitor', '/signin/forgot', 200, ['Choose a new password', 'Back to sign in']],
  // With no sign-up or reset under way the code screen names no address and says no code
  // was sent (step 2.163's fix round); there is no password to choose (L10): the first
  // screen again, saying why, or a signed-in person's account. The code screen's words,
  // which name the address the code went to, are checked in a browser
  // (sign-in-says-test.mjs).
  [
    'visitor',
    '/signup/code',
    200,
    ['Enter your code', 'Nothing is waiting for a code on this device.', 'Start again'],
    ['we have sent', 'We sent'],
  ],
  ['visitor', '/signup/password', 307, [], [], '/signup?problem=proofInvalid'],
  ['visitor', '/signup?problem=proofInvalid', 200, ['That took too long. Start again.']],
  ['owner', '/signup/password', 307, [], [], '/account'],
  // The password again is for a signed-in person: anyone else signs in and comes back.
  ['visitor', '/account/confirm', 307, [], [], '/signin?next=%2Faccount%2Fconfirm'],
  ['owner', '/account/confirm', 200, ['Enter your password again'], ['Continue with Google']],
  ['visitor', '/account/inbox', 307, [], [], '/signin?next=%2Faccount%2Finbox'],
  // A signed-in person at /signin and /signup is told so (step 2.163, L10).
  [
    'owner',
    '/signin',
    200,
    ['You are already signed in', 'You are signed in as local-owner-token@example.test'],
    ['name="password"'],
  ],
  ['owner', '/signup', 200, ['You are already signed in'], ['name="email"']],
  // Signing out leaves the person on the page, told so, and only while signed out (R-30).
  ['visitor', '/?notice=signedOut', 200, ['You are signed out.']],
  ['owner', '/?notice=signedOut', 200, [], ['You are signed out.']],
  ['visitor', '/north-valley?notice=signedOut', 200, ['You are signed out.']],
  ['owner', '/north-valley?notice=signedOut', 200, [], ['You are signed out.']],
  // "Sign out everywhere" asks first (step 2.163, M30).
  [
    'owner',
    '/account?ask=signOutEverywhere',
    200,
    ['Sign out every device that uses your account, this one too?', 'No, keep them signed in'],
  ],
  // The home and schedule pages (step 2.42): real content, not the placeholder; the two
  // leagues have different rounds.
  [
    'visitor',
    '/north-valley',
    200,
    // The sections' titles as step 2.147 phrased them, each under its kicker; the hero's
    // sentence and its two ways on; the call to action near the foot.
    [
      'Home',
      'Recent results',
      'The next matchups',
      'The standings',
      'On the schedule',
      'Scores, standings and the schedule for every team, all season long.',
      'See the schedule',
      'Meet the teams',
    ],
    // No fixed line under the league's name: a line of the league's own is a setting for
    // a later step, and until then none is shown.
    ['This page is not built yet.', 'Upcoming games', 'Official league site'],
  ],
  [
    'visitor',
    '/north-valley/schedule',
    200,
    ['Schedule', 'This round', 'Round 1', 'Team'],
    ['This page is not built yet.'],
  ],
  ['visitor', '/harbor-city/schedule', 200, ['Opening day', 'Other games']],
  ['visitor', '/north-valley/schedule?season=nope', 404, [notFound]],
  // The teams list and a team's page (step 2.44): record and seed, the roster by the one name
  // function, statistics as each team's setting allows; a team that is not there is not found.
  [
    'visitor',
    '/north-valley/teams',
    200,
    // The records are worked out from the season's results (step 2.152): the Owls are 2-1.
    ['Owls', 'Falcons', '2-1', 'East', 'Seed', 'Record'],
    ['This page is not built yet.'],
  ],
  // A league with no divisions says nothing about divisions on its team cards.
  ['visitor', '/harbor-city/teams', 200, ['Comets', 'Rockets', 'Meteors'], ['No division']],
  [
    'visitor',
    '/north-valley/teams/falcons',
    200,
    [
      'Falcons',
      'Roster',
      'Dana Whitfield',
      'Name not shown',
      'Left the team',
      'Schedule',
      'Results',
      'Statistics',
      'League home',
    ],
    ['This page is not built yet.', 'Fontaine', 'Make this my team'],
  ],
  [
    'visitor',
    '/north-valley/teams/owls',
    200,
    // 87: Jordan Castellanos's points this season, which a staff-only team never shows.
    ['Owls', 'Team totals', 'Roster', 'Jordan Castellanos'],
    ['Players', '>87<'],
  ],
  // Another league's team is no team of this one (the league fence, step 2.152).
  ['visitor', '/north-valley/teams/comets', 404, [notFound]],
  ['visitor', '/north-valley/teams/falcons?season=nope', 404, [notFound]],
  // Any address under a league that is no page of it is refused by the league's own gate
  // (step 2.85): "not found" for a league the visitor may see and for one they may not.
  ['visitor', '/north-valley/no-such-page/at-all', 404, [notFound]],
  [
    'visitor',
    '/quiet-pines/no-such-page/at-all',
    404,
    [notFound],
    ['This league is not published.', 'site-header'],
  ],
  ['owner', '/north-valley/admin/no-such-area/at-all', 404, [notFound]],
  // The season picker is in the header of the menu's pages, once, and carries the page's
  // other choices; a league with one season has none (step 2.85).
  [
    'visitor',
    '/north-valley/schedule?team=owls',
    200,
    ['id="site-season"', 'name="team" value="owls"', 'Spring 2026'],
  ],
  ['visitor', '/harbor-city/schedule', 200, ['Opening day'], ['id="site-season"']],
  ['owner', '/north-valley/admin/teams', 200, ['Add a team'], ['id="site-season"']],
  // The start page for members (step 2.44, U-5, R-10). North Valley keeps the league home;
  // Harbor City starts members on their team: a member with a roster place, or the team a
  // device remembers. The league home is always one tap away (start=league).
  ['visitor', '/north-valley', 200, ['Recent results', 'start=league']],
  ['coach', '/north-valley', 200, ['Recent results']],
  ['visitor', '/harbor-city', 200, ['Recent results']],
  ['stranger', '/harbor-city', 200, ['Recent results']],
  ['coach', '/harbor-city', 307, [], [], '/harbor-city/teams/rockets'],
  ['coach', '/harbor-city?start=league', 200, ['Recent results']],
  ['coach', '/harbor-city?season=winter', 200, ['Recent results']],
  [
    'visitor',
    '/harbor-city',
    307,
    [],
    [],
    '/harbor-city/teams/comets',
    `srl_my_team_${harborCity}=comets`,
  ],
  [
    'visitor',
    '/harbor-city?start=league',
    200,
    ['Recent results'],
    [],
    undefined,
    `srl_my_team_${harborCity}=comets`,
  ],
  [
    'visitor',
    '/harbor-city',
    200,
    ['Recent results'],
    [],
    undefined,
    `srl_my_team_${harborCity}=nobody`,
  ],
  [
    'visitor',
    '/harbor-city',
    200,
    ['Recent results'],
    [],
    undefined,
    `srl_my_team_${harborCity}=..%2Fx`,
  ],
  [
    'visitor',
    '/north-valley',
    200,
    ['Recent results'],
    [],
    undefined,
    `srl_my_team_${northValley}=owls`,
  ],
  ['visitor', '/harbor-city/teams/rockets', 200, ['Make this my team', 'League home']],
  [
    'visitor',
    '/harbor-city/teams/rockets',
    200,
    ['This is your team on this device.', 'Stop using this as my team'],
    ['Make this my team'],
    undefined,
    `srl_my_team_${harborCity}=rockets`,
  ],
  // Step 2.168: a coach finds their team. The team page a coach is served holds no trace of
  // them (it is a visitor's); their team is read after it, privately: the coach is told of
  // the Rockets and that the league opens there, a visitor of nothing, or of the team their
  // device chose, and only a team of the league. `/my` signed out is the sign-in screen,
  // coming back; signed in, the coach's team; for someone on no team, a sentence.
  [
    'coach',
    '/harbor-city/teams/rockets',
    200,
    ['Make this my team', 'Rockets'],
    ['This is your team.', 'The league opens here for you.', 'data-your-team'],
  ],
  [
    'coach',
    `/api/v1/leagues/${harborCity}/my-team`,
    200,
    ['"teams":["rockets"]', '"startsOn":"rockets"', '"href":"/harbor-city/teams/rockets"'],
    ['herons'],
  ],
  [
    'visitor',
    `/api/v1/leagues/${harborCity}/my-team`,
    200,
    ['{"teams":[],"startsOn":null,"marked":[]}'],
    ['Your team'],
  ],
  [
    'visitor',
    `/api/v1/leagues/${harborCity}/my-team`,
    200,
    ['"marked":[{"slug":"comets"', '"mark":"Your team"'],
    ['rockets'],
    undefined,
    `srl_my_team_${harborCity}=comets`,
  ],
  [
    'visitor',
    `/api/v1/leagues/${harborCity}/my-team`,
    200,
    ['{"teams":[],"startsOn":null,"marked":[]}'],
    [],
    undefined,
    `srl_my_team_${harborCity}=herons`,
  ],
  ['visitor', '/north-valley/my', 307, [], [], '/signin?next=%2Fnorth-valley%2Fmy'],
  ['coach', '/north-valley/my', 307, [], [], '/north-valley/teams/herons'],
  [
    'stranger',
    '/north-valley/my',
    200,
    ['You are not on a team in this league this season.', 'See the teams'],
    ['This page is not built yet.'],
  ],
  // The design as variables once per page, the header and the mark (step 1.18, T-90, U-8):
  // two leagues, two looks.
  [
    'visitor',
    '/north-valley',
    200,
    ['North Valley League', 'Powered by SR Leagues', '--color-primary: #96062d', 'Schedule'],
    ['#1f5fbf'],
  ],
  [
    'visitor',
    '/harbor-city/standings',
    200,
    ['Harbor City League', 'Powered by SR Leagues', '--color-primary: #1f5fbf'],
    ['#96062d'],
  ],
  // The standings and statistics pages (step 2.43): real tables, not the placeholder; a
  // team set to staff only shows its totals and none of its players to a visitor (S-22).
  // Since step 2.195 the note on level teams is true of each team it is beside: it never
  // tells one it was "placed above".
  [
    'visitor',
    '/north-valley/standings',
    200,
    [
      'East',
      'West',
      'Owls',
      'Played an ineligible player in round 3.',
      'The game between them puts Owls ahead.',
    ],
    ['This page is not built yet.', 'Placed above'],
  ],
  ['visitor', '/north-valley/standings?season=spring-2026', 200, ['Spring 2026', 'All teams']],
  ['visitor', '/north-valley/standings?season=nope', 404, [notFound]],
  [
    'visitor',
    '/north-valley/stats',
    200,
    [
      'Leaders',
      'Dana Whitfield',
      'Owls',
      // The note names the team whose totals are on the page. The Bears' players are staff
      // only too, but nothing is recorded for them, so no totals of theirs are shown and
      // the note no longer says they are (step 2.147 part 3).
      'Only team totals are shown for Owls.',
      'ui-stats',
    ],
    ['This page is not built yet.', 'shown for Bears', 'Jordan', 'Castellanos', 'Imani', 'Brooks'],
  ],
  ['coach', '/north-valley/stats', 200, ['Dana Whitfield'], ['Jordan', 'Castellanos', 'Brooks']],
  ['visitor', '/north-valley/stats?by=total', 200, ['Season totals']],
  ['visitor', '/harbor-city/stats', 200, ['Sam R.', 'Noor H.'], ['Rivera', 'Haddad']],
  ['visitor', '/harbor-city/standings', 200, ['Level with another team', 'PTS']],
  ['scheduler', '/north-valley/admin', 200, ['Powered by SR Leagues', '--color-primary: #96062d']],
  // Someone not signed in at the admin's home (a scorekeeper's games) is sent to sign in
  // and brought back (step 2.33), and since step 2.157 at every admin area too (U-15,
  // changed November 17: this row was 403 "you do not have access" before).
  [
    'visitor',
    '/north-valley/admin',
    307,
    [],
    ['Admin areas'],
    '/signin?next=%2Fnorth-valley%2Fadmin',
  ],
  [
    'visitor',
    '/north-valley/admin/teams',
    307,
    [],
    ['Admin areas', noAccess],
    '/signin?next=%2Fnorth-valley%2Fadmin%2Fteams',
  ],
  // A scorekeeper whose phone was signed out, at their own games (finding H3 of the audit).
  [
    'visitor',
    '/north-valley/admin/games',
    307,
    [],
    ['Admin areas', noAccess],
    '/signin?next=%2Fnorth-valley%2Fadmin%2Fgames',
  ],
  // Someone the admin is not open to at all is refused on the plain screen of SR Leagues'
  // own: nothing of the admin's frame, and no way "back to the admin" (U-9).
  ['stranger', '/north-valley/admin', 403, [noAccess], ['Admin areas', 'Back to the admin']],
  ['coach', '/north-valley/admin/teams', 403, [noAccess], ['Admin areas', 'Back to the admin']],
  [
    'scheduler',
    '/north-valley/admin',
    200,
    [
      'Admin areas',
      adminLink('north-valley', 'schedule'),
      adminLink('north-valley', 'games'),
      staffFrameAt('/north-valley/admin'),
      oneHeading,
    ],
    [adminLink('north-valley', 'people')],
  ],
  [
    'scheduler',
    '/north-valley/admin/schedule',
    200,
    [
      adminLink('north-valley', 'schedule'),
      'Build the schedule here, round by round.',
      staffFrameAt('/north-valley/admin/schedule'),
      oneHeading,
    ],
    [adminPlaceholder],
  ],
  // Each built area's page draws the staff frame, marked at its area, and one main
  // heading (step 2.103): an import under Schedule, a box score under Games.
  [
    'scheduler',
    '/north-valley/admin/schedule/import',
    200,
    ['Import fixtures', staffFrameAt('/north-valley/admin/schedule'), oneHeading],
    [adminPlaceholder],
  ],
  // Step 2.49: a season's divisions under Season settings (the owner's), and the league's
  // venues under Schedule (the scheduler's); a scheduler is refused the divisions.
  [
    'owner',
    '/north-valley/admin/season/divisions',
    200,
    ['Divisions', 'East', 'West', staffFrameAt('/north-valley/admin/season'), oneHeading],
    [adminPlaceholder],
  ],
  ['scheduler', '/north-valley/admin/season/divisions', 403, [noAccess]],
  [
    'scheduler',
    '/north-valley/admin/schedule/venues',
    200,
    ['Venues', 'Central Gym', 'Court 2', staffFrameAt('/north-valley/admin/schedule'), oneHeading],
    [adminPlaceholder],
  ],
  // A scorekeeper is refused both screens; someone signed out is sent to sign in and back.
  ['scorekeeper', '/north-valley/admin/season/divisions', 403, [noAccess], ['East', 'West']],
  ['scorekeeper', '/north-valley/admin/schedule/venues', 403, [noAccess], ['Central Gym']],
  [
    'visitor',
    '/north-valley/admin/season/divisions',
    307,
    [],
    ['Admin areas', noAccess],
    '/signin?next=%2Fnorth-valley%2Fadmin%2Fseason%2Fdivisions',
  ],
  [
    'visitor',
    '/north-valley/admin/schedule/venues',
    307,
    [],
    ['Admin areas', noAccess],
    '/signin?next=%2Fnorth-valley%2Fadmin%2Fschedule%2Fvenues',
  ],
  [
    'scheduler',
    '/north-valley/admin/games',
    200,
    ['Enter the final score', staffFrameAt('/north-valley/admin/games'), oneHeading],
    [adminPlaceholder],
  ],
  [
    'scheduler',
    `/north-valley/admin/games/${game(1)}`,
    200,
    ['Box score: Tigers at Lions', staffFrameAt('/north-valley/admin/games'), oneHeading],
    [adminPlaceholder],
  ],
  // A scheduler at an area that is not theirs is refused inside the admin's own frame,
  // which is open to them: their own areas in its menu, and the way back to its home
  // (step 2.103). Another league's admin, which is not open to them, shows them no frame.
  // (A refusal's screen is in the page's data, so an area's address is looked for bare.)
  [
    'scheduler',
    '/north-valley/admin/teams',
    403,
    [noAccess, 'Admin areas', '/north-valley/admin/schedule', 'Back to the admin'],
    ['/north-valley/admin/people'],
  ],
  ['scheduler', '/harbor-city/admin/teams', 403, [noAccess], ['Admin areas', 'Back to the admin']],
  // An area with no screen yet is the placeholder, in the words the checks around this
  // one look for to prove a real screen has replaced it (scripts/admin-placeholder.mjs).
  ['owner', '/north-valley/admin/registration', 200, [adminPlaceholder, 'Back to the admin']],
  // Admin → People (step 2.50): everyone in the league, searched by name, with the form to
  // add someone; each name leads to their record. A scorekeeper is refused it.
  [
    'owner',
    '/north-valley/admin/people',
    200,
    [
      'Everyone in the league, on a team or not.',
      'Search by name',
      'Add a person',
      'Dana Whitfield',
      'Leo Fischer',
      staffFrameAt('/north-valley/admin/people'),
      oneHeading,
    ],
    [adminPlaceholder],
  ],
  ['owner', '/north-valley/admin/people?q=fisch', 200, ['Leo Fischer'], ['Dana Whitfield']],
  ['scorekeeper', '/north-valley/admin/people', 403, [noAccess], ['Dana Whitfield']],
  ['owner', '/north-valley/admin/people/not-a-person', 404, [notFound]],
  // Admin → Teams (step 2.51): the season's teams and the form to add one.
  [
    'owner',
    '/north-valley/admin/teams',
    200,
    [
      'Teams of Fall 2026',
      'Lions',
      'Owls',
      'Add a team',
      'Short name',
      staffFrameAt('/north-valley/admin/teams'),
      oneHeading,
    ],
    [adminPlaceholder],
  ],
  // Each league's own teams: the youth league's, none of the first league's.
  ['owner', '/harbor-city/admin/teams', 200, ['Comets', 'Add a team'], ['Lions']],
  // A team's page is under Teams.
  [
    'owner',
    `/north-valley/admin/teams/${lionsTeam}`,
    200,
    ['Lions', staffFrameAt('/north-valley/admin/teams'), oneHeading],
    [adminPlaceholder],
  ],
  ['owner', '/north-valley/admin/teams/not-a-team', 404, [notFound]],
  ['scheduler', '/harbor-city/admin', 403, [noAccess]],
  [
    'owner',
    '/north-valley/admin/settings',
    200,
    [
      'League settings',
      adminLink('north-valley', 'people'),
      adminLink('north-valley', 'teams'),
      // Drawn from the declarations (step 2.48): label, default and what it accepts.
      'Where members land first',
      'The league home',
      'Default: Any game',
      'Accepts yes or no.',
      'Accepts one of the choices shown.',
      staffFrameAt('/north-valley/admin/settings'),
      oneHeading,
    ],
  ],
  ['scheduler', '/north-valley/admin/settings', 403, [noAccess]],
  ['coach', '/north-valley/admin/settings', 403, [noAccess]],
  // League settings → Admins (step 2.97, P4 §4): only someone who may manage access for the
  // whole league (the owner, an admin) opens it; everyone else is refused, and a refused
  // person never sees who has access.
  [
    'owner',
    '/north-valley/admin/settings/admins',
    200,
    ['Admins', 'Invite someone', 'People with access', 'Send the invitation', oneHeading],
  ],
  [
    'admin',
    '/quiet-pines/admin/settings/admins',
    200,
    ['Admins', 'Invite someone', 'People with access'],
  ],
  ['scheduler', '/north-valley/admin/settings/admins', 403, [noAccess], ['People with access']],
  ['coach', '/north-valley/admin/settings/admins', 403, [noAccess], ['People with access']],
  ['stranger', '/north-valley/admin/settings/admins', 403, [noAccess], ['People with access']],
  ['scorekeeper', '/north-valley/admin/settings/admins', 403, [noAccess], ['People with access']],
  ['registrar', '/quiet-pines/admin/settings/admins', 403, [noAccess], ['People with access']],
  // The invitation's accept page (step 2.97, record 086): with no link held, everyone gets
  // the one answer for a link that does not work; a visitor holding a link is offered
  // signing in or up and nothing about the league; a signed-in person holding a link that
  // is no invitation is told it does not work, as for every link that does not.
  [
    'visitor',
    '/north-valley/invitation',
    200,
    ['This link does not work'],
    ['Accept the invitation'],
  ],
  [
    'visitor',
    '/north-valley/invitation',
    200,
    ['Your invitation', 'Sign in', 'Create an account'],
    ['invites you to help run it', 'This link does not work'],
    undefined,
    `srl_invitation=${heldMadeUpToken}`,
  ],
  [
    'owner',
    '/north-valley/invitation',
    200,
    ['This link does not work'],
    ['Accept the invitation'],
    undefined,
    `srl_invitation=${heldMadeUpToken}`,
  ],
  [
    'stranger',
    '/north-valley/invitation',
    200,
    ['This link does not work'],
    ['Accept the invitation'],
  ],
  // Season settings' first panel (step 2.182, A-18): who can see a season, shown or
  // hidden by the owner or an admin after one question; never a scheduler's.
  [
    'owner',
    '/north-valley/admin/season',
    200,
    [
      'Who can see this season',
      'Everyone can see Fall 2026.',
      'Hide it again',
      // Drawn inside the staff frame, its menu at Season settings (step 2.103).
      staffFrameAt('/north-valley/admin/season'),
      oneHeading,
    ],
    [adminPlaceholder, 'Show this season to visitors'],
  ],
  [
    'owner',
    '/north-valley/admin/season?season=winter-2027',
    200,
    ['Only the people who run the league can see Winter 2027.', 'Show this season to visitors'],
    ['Everyone can see', 'Yes, show it'],
  ],
  // A season the league does not list: the current one, said plainly, never "no season".
  [
    'owner',
    '/north-valley/admin/season?season=no-such-season',
    200,
    ['That season was not found, so this page shows Fall 2026.', 'Everyone can see Fall 2026.'],
    ['This league has no season yet.'],
  ],
  // An address alone never makes the panel say something happened that did not.
  [
    'owner',
    '/north-valley/admin/season?season=winter-2027&done=shown',
    200,
    ['Only the people who run the league can see Winter 2027.'],
    ['Visitors can see Winter 2027 now.'],
  ],
  [
    'owner',
    '/north-valley/admin/season?season=winter-2027&ask=show',
    200,
    [
      'Visitors will see its teams, schedule and results.',
      'Yes, show it',
      'No, keep it hidden',
      staffFrameAt('/north-valley/admin/season'),
      oneHeading,
    ],
  ],
  // Hiding the current season, with a game being scored (Hawks v Bears), says both.
  [
    'owner',
    '/north-valley/admin/season?ask=hide',
    200,
    [
      'Hide Fall 2026 from visitors?',
      'will show another season visitors can see instead',
      'A game of Fall 2026 is being scored right now',
      'Yes, hide it',
      staffFrameAt('/north-valley/admin/season'),
      oneHeading,
    ],
  ],
  // In a league not published, a shown season is never said to be seen by visitors.
  [
    'owner',
    '/quiet-pines/admin/season?done=shown',
    200,
    [
      'is shown. Visitors will see it once the league is published.',
      'is shown, but visitors cannot see this league until it is published.',
    ],
    ['Everyone can see', 'Visitors can see', 'Visitors will see its'],
  ],
  [
    'owner',
    '/quiet-pines/admin/season?ask=hide',
    200,
    ['Yes, hide it'],
    ['Everyone can see', 'Visitors can see', 'Visitors will see its'],
  ],
  [
    'owner',
    '/old-meadow/admin/season',
    200,
    ['A season that is over stays shown'],
    ['Hide it again', 'Show this season to visitors'],
  ],
  ['scheduler', '/north-valley/admin/season', 403, [noAccess], ['Who can see this season']],
  ['scorekeeper', '/north-valley/admin/season', 403, [noAccess], ['Who can see this season']],
  // The tracker (step 2.33): a signed-in account allowed to score that game, and nobody
  // else, another league's admin included (U-6). Hawks v Bears is live; Lions v Tigers is
  // the scorekeeper's; game 3 is assigned to nobody (any scorekeeper may score it).
  ['scheduler', `/north-valley/score/${liveGame}`, 200, ['Score a game', 'Bears at Hawks']],
  ['scorekeeper', `/north-valley/score/${liveGame}`, 200, ['Bears at Hawks', 'Opening the game']],
  ['scorekeeper', `/north-valley/score/${unassignedGame}`, 200, ['Lions at Hawks']],
  ['owner', `/north-valley/score/${liveGame}`, 200, ['Bears at Hawks']],
  ['coach', `/north-valley/score/${liveGame}`, 403, [noAccess], ['Bears at Hawks']],
  // Someone not signed in is sent to sign in, told why, and brought back to the game.
  [
    'visitor',
    `/north-valley/score/${liveGame}`,
    307,
    [],
    ['Bears at Hawks'],
    `/signin?problem=signInToScore&next=%2Fnorth-valley%2Fscore%2F${liveGame}`,
  ],
  ['visitor', '/signin?problem=signInToScore', 200, ['Sign in to score this game.']],
  ['otherAdmin', `/north-valley/score/${liveGame}`, 403, [noAccess], ['Bears at Hawks']],
  // No such game: "Page not found" with status 404, in the tracker's own look, with the way
  // back (step 2.33; status 404 since step 2.157).
  [
    'owner',
    '/north-valley/score/game-1',
    404,
    [notFound, 'We could not find that game.', 'Back to your games'],
    [noAccess],
  ],
  // Another league's game asked for through this league's address is not there: status 404
  // and nothing of the other league (step 2.157).
  [
    'owner',
    `/harbor-city/score/${liveGame}`,
    404,
    [notFound, 'We could not find that game.'],
    ['Bears at Hawks', 'North Valley'],
  ],
  // The same in the admin's games: the box score of another league's game, "Page not
  // found" in the box score's own words (step 2.157).
  [
    'owner',
    `/harbor-city/admin/games/${liveGame}`,
    404,
    [notFound, 'That game is not there, or you may not score it.', 'Back to the games'],
    ['Bears at Hawks', 'North Valley', noAccess],
  ],
  // Every box score a person cannot open is the same 404, never a page answered 200 (step
  // 2.157): a game not assigned to a scorekeeper in the draft league, which scores assigned
  // games only (the same game the tracker refuses them above), a game of
  // an archived league (nobody scores there), and an address that is no game.
  [
    'scorekeeper',
    `/quiet-pines/admin/games/${liveGame}`,
    404,
    [notFound, 'That game is not there, or you may not score it.'],
    [noAccess],
  ],
  [
    'owner',
    `/old-meadow/admin/games/${liveGame}`,
    404,
    [notFound, 'That game is not there, or you may not score it.'],
    [noAccess],
  ],
  [
    'owner',
    `/north-valley/admin/games/${game(99)}`,
    404,
    [notFound, 'That game is not there, or you may not score it.'],
    [noAccess],
  ],
  // A scorekeeper's admin: their games, each with a button to the tracker (P4 §4).
  [
    'scorekeeper',
    '/north-valley/admin',
    200,
    [
      'Your games',
      'Score this game',
      `href="/north-valley/score/${liveGame}"`,
      staffFrameAt('/north-valley/admin'),
      oneHeading,
    ],
    [adminPlaceholder],
  ],
  // A game's page (step 2.45): drawn with how the game stands, its live part ready to
  // follow it; a finished game's result; a game not started; a game that is not this
  // league's, not public yet, or not an id is not found. The Bears show their players'
  // numbers to their staff only, so none of their names is on the page (S-22).
  [
    'visitor',
    `/north-valley/games/${game(2)}`,
    200,
    ['Bears at Hawks', 'The game, live', 'data-live-status="live"', 'Live', 'Play by play'],
    ['This page is not built yet.', 'Bearsley'],
  ],
  [
    'visitor',
    `/north-valley/games/${game(5)}`,
    200,
    ['Lions at Bears', 'Final', 'Box scores', 'Only the final score was recorded for this game.'],
    ['Corrected on'],
  ],
  ['visitor', `/north-valley/games/${game(1)}`, 200, ['This game has not started yet.']],
  ['visitor', `/north-valley/games/${game(6)}`, 404, [notFound]],
  ['visitor', `/north-valley/games/${game(99)}`, 404, [notFound]],
  ['visitor', '/north-valley/games/not-a-game', 404, [notFound]],
  ['visitor', `/harbor-city/games/${game(2)}`, 404, [notFound]],
  ['visitor', `/quiet-pines/games/${game(2)}`, 404, [notFound]],
  // An address that is no game: "Page not found", status 404 (step 2.157).
  ['scheduler', '/north-valley/score/game-1', 404, [notFound, 'We could not find that game.']],
  ['coach', '/north-valley/score/game-1', 403, [noAccess]],
  ['visitor', '/quiet-pines', 404, [notFound]],
  ['coach', '/quiet-pines', 404, [notFound]],
  ['stranger', '/quiet-pines/admin', 404, [notFound], [noAccess]],
  ['otherAdmin', '/quiet-pines', 404, [notFound], ['This league is not published.']],
  ['otherAdmin', '/quiet-pines/admin', 404, [notFound], [noAccess, 'Admin areas']],
  ['owner', '/quiet-pines', 200, ['This league is not published.']],
  [
    'owner',
    '/quiet-pines/admin',
    200,
    ['Admin areas', staffFrameAt('/quiet-pines/admin'), oneHeading],
  ],
  // Everyone with an admin area in a draft league may open it (step 2.87).
  ['admin', '/quiet-pines/admin', 200, [adminLink('quiet-pines', 'settings')]],
  ['scheduler', '/quiet-pines', 200, ['This league is not published.']],
  [
    'scheduler',
    '/quiet-pines/admin',
    200,
    [adminLink('quiet-pines', 'schedule'), adminLink('quiet-pines', 'games')],
    [adminLink('quiet-pines', 'people')],
  ],
  [
    'programScheduler',
    '/quiet-pines/admin/schedule',
    200,
    // The draft league's season is of the program this scheduler holds (step 2.152).
    [adminLink('quiet-pines', 'schedule'), 'Build the schedule here, round by round.'],
    [adminPlaceholder],
  ],
  [
    'registrar',
    '/quiet-pines/admin',
    200,
    [adminLink('quiet-pines', 'registration'), adminLink('quiet-pines', 'people')],
    [adminLink('quiet-pines', 'games'), adminLink('quiet-pines', 'settings')],
  ],
  ['registrar', '/quiet-pines/admin/schedule', 403, [noAccess]],
  // A registrar runs People (P4 §4) and may enter a person's private details (R-16).
  [
    'registrar',
    '/quiet-pines/admin/people',
    200,
    ['Add a person', 'Private details', 'Date of birth (optional)'],
    [adminPlaceholder],
  ],
  ['editor', '/quiet-pines', 200, ['This league is not published.']],
  [
    'editor',
    '/quiet-pines/admin',
    200,
    [adminLink('quiet-pines', 'site')],
    [adminLink('quiet-pines', 'schedule')],
  ],
  // The draft league has the same games, scores assigned games only and gives the live
  // one to its admin (stand-in-ports.ts): its scorekeeper is refused it (P7 §5.1), with the
  // tracker's own words and the way back, not the league's "no access" (step 2.33).
  [
    'scorekeeper',
    `/quiet-pines/score/${liveGame}`,
    200,
    ['You are not assigned to score this game.', 'href="/quiet-pines/admin"'],
    ['Bears at Hawks', noAccess],
  ],
  [
    'scorekeeper',
    `/quiet-pines/score/${unassignedGame}`,
    200,
    ['You are not assigned to score this game.'],
    ['Lions at Hawks', noAccess],
  ],
  // Step 2.153: "Score this game" on the public pages is read after the page, for the person
  // signed in only. The page a scorekeeper is served holds no trace of it, as a visitor's;
  // the read gives a scorekeeper the games they may score (in the draft league, which scores
  // assigned games only, only theirs) and gives a visitor, a coach and another league's
  // admin nothing, privately.
  [
    'scorekeeper',
    '/north-valley/schedule',
    200,
    ['Hawks'],
    ['Score this game', 'Enter the score', '/north-valley/score/'],
  ],
  [
    'scorekeeper',
    `/api/v1/leagues/${northValley}/scoring?games=${liveGame},${game(5)}`,
    200,
    [`"href":"/north-valley/score/${liveGame}"`, '"score":"Score this game"'],
    [game(5)],
  ],
  ...['visitor', 'coach', 'otherAdmin'].map((who) => [
    who,
    `/api/v1/leagues/${northValley}/scoring?games=${liveGame},${unassignedGame}`,
    200,
    ['{"games":[]}'],
    [liveGame, unassignedGame, 'Score this game'],
  ]),
  [
    'scorekeeper',
    `/api/v1/leagues/${quietPines}/scoring?games=${liveGame},${unassignedGame},${game(4)},${draftUnscored}`,
    200,
    [`"gameId":"${draftUnscored}"`, '"kind":"enter"'],
    // Game 4 is theirs too, but two days ahead: not offered before its day (S-70).
    [liveGame, unassignedGame, game(4)],
  ],
  // A game of tomorrow is not offered today, to its scorekeeper either (S-70).
  [
    'scorekeeper',
    `/api/v1/leagues/${northValley}/scoring?games=${unassignedGame}`,
    200,
    ['{"games":[]}'],
    [unassignedGame],
  ],
  [
    'clubAdmin',
    '/quiet-pines/admin/teams',
    200,
    [adminLink('quiet-pines', 'teams'), adminLink('quiet-pines', 'registration'), 'Lions'],
    [adminLink('quiet-pines', 'people')],
  ],
  ['otherAdmin', '/still-waters/admin', 200, [adminLink('still-waters', 'settings')]],
  // Step 2.192: the empty league to start from. Its Teams and Schedule open on its one
  // current season, which holds nothing yet, and each says what to do first.
  [
    'owner',
    '/still-waters/admin/teams',
    200,
    ['Teams of First Season', 'No teams yet.', 'Add a team'],
  ],
  [
    'owner',
    '/still-waters/admin/schedule',
    200,
    [
      adminLink('still-waters', 'schedule'),
      'Season: First Season',
      'This season has no rounds yet.',
      'Add the first one here, then add its games.',
    ],
  ],
  ['scheduler', '/reed-marsh', 404, [notFound]],
  // The empty league starts live (step 2.194), so a visitor reads its home page.
  ['visitor', '/still-waters', 200, ['Still Waters League']],
  ['registrar', '/closed-gate', 404, [notFound]],
  ['visitor', '/closed-gate', 404, [notFound]],
  ['owner', '/closed-gate/admin', 200, ['This league has been taken down.']],
  ['scheduler', '/closed-gate', 404, [notFound]],
  ['visitor', '/old-meadow/standings', 200, ['This league is archived.']],
  // A scorekeeper who still holds the role in the archived league is told so, with a way
  // back, not "no access" (step 2.33); someone with no role there still gets "no access".
  [
    'scorekeeper',
    `/old-meadow/score/${liveGame}`,
    200,
    ['This league is archived, so its games cannot be scored or changed.', 'Back to your games'],
    [noAccess, 'Bears at Hawks'],
  ],
  [
    'scorekeeper',
    '/old-meadow/admin',
    200,
    ['Your games', 'This league is archived, so its games cannot be scored or changed.'],
    [noAccess],
  ],
  ['coach', `/old-meadow/score/${liveGame}`, 403, [noAccess]],
  ['visitor', '/nobody-has-this', 404, [notFound]],
  ['visitor', '/binned-league', 404, [notFound]],
  ['visitor', '/north-vale/schedule', 308, [], [], '/north-valley/schedule'],
  ['visitor', '/North-Valley', 308, [], [], '/north-valley'],
  ['visitor', '/Account', 308, [], [], '/account'],
  ['visitor', '/quiet-pine/admin', 404, [notFound]],
  ['otherAdmin', '/quiet-pine/admin', 404, [notFound]],
  ['scheduler', '/quiet-pine/admin', 308, [], [], '/quiet-pines/admin'],
  ['owner', '/quiet-pine/admin', 308, [], [], '/quiet-pines/admin'],
];

// Sent with every answer, refusals and forwards included (apps/web/next.config.ts).
const securityHeaders = {
  'x-frame-options': 'DENY',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

/**
 * The script policy every answer the proxy handles carries (T-79, record 081): scripts only
 * from our own address or with the answer's own nonce, no plugins, no <base>, no frames, and
 * never in another site's frame. The nonce is 18 random bytes, written as 24 characters.
 */
const scriptPolicy =
  /^script-src 'self' 'nonce-([A-Za-z0-9+/]{24})'; object-src 'none'; base-uri 'none'; frame-src 'none'; frame-ancestors 'none'$/;

/** Every nonce an answer has carried: none may come twice (security-headers.ts, newNonce). */
const noncesSeen = new Set();

/**
 * What is wrong with one answer's script policy: not the policy above, a nonce an earlier
 * answer had, or a page with a script that does not carry the answer's own nonce (it would
 * not run). Every <script> of a page is counted, inline or not.
 */
function policyProblems(label, response, text) {
  const policy = response.headers.get('content-security-policy') ?? '';
  const nonce = scriptPolicy.exec(policy)?.[1];
  if (nonce === undefined) return [`${label}: content-security-policy is "${policy}"`];
  const found = [];
  if (noncesSeen.has(nonce)) found.push(`${label}: a nonce came twice`);
  noncesSeen.add(nonce);
  if ((response.headers.get('content-type') ?? '').includes('text/html')) {
    for (const [tag] of text.matchAll(/<script\b[^>]*>/g)) {
      if (!tag.includes(` nonce="${nonce}"`)) found.push(`${label}: a script without its nonce`);
    }
  }
  return found;
}

/**
 * An answer's text with its own nonce, the one random part of it, put in one place, so two
 * answers can be compared byte for byte: only after checking that the header's nonce is the
 * one every script of the page carries, so nothing else is hidden by it.
 */
function oneNonce(headers, body, found, label) {
  const nonce = /'nonce-([A-Za-z0-9+/=]+)'/.exec(headers)?.[1];
  const inBody = [...body.matchAll(/ nonce="([^"]*)"/g)].map((m) => m[1]);
  if (nonce === undefined || inBody.some((n) => n !== nonce)) {
    found.push(`${label}: its scripts do not all carry the nonce of its policy`);
  }
  const same = (text) => (nonce === undefined ? text : text.replaceAll(nonce, '{nonce}'));
  return { headers: same(headers), body: same(body) };
}

/** [who, address asked, address header the browser sends]: all must be "not found". */
const spoofs = [
  ['visitor', '/quiet-pines', '/north-valley'],
  ['visitor', '/faviconxico', '/north-valley'],
  ['owner', '/faviconxico/admin', '/north-valley/admin'],
  ['owner', '/favicon-ico/admin/settings', '/quiet-pines/admin/settings'],
];

const failures = [];

// The shell's own settings never reach the servers (T-201): made-up stand-ins for real
// ones are put in this script's own environment, and none of them may arrive.
const shellOnly = {
  DATABASE_URL: 'postgres://shell-made-up:shell-made-up@localhost:1/nowhere',
  RESEND_API_KEY: 're_shell_made_up',
  STRIPE_SECRET_KEY: 'sk_shell_made_up',
  STRIPE_WEBHOOK_SECRET: 'whsec_shell_made_up',
  SESSION_SECRET: 'shell-made-up-session-secret-0123456789',
  PGHOST: 'shell-made-up.example.test',
};
Object.assign(process.env, shellOnly);
const arrived = spawnSync(
  process.execPath,
  ['-e', 'process.stdout.write(JSON.stringify(Object.keys(process.env)))'],
  { env: serverEnvironment({}), encoding: 'utf8' },
);
const arrivedNames = arrived.status === 0 ? JSON.parse(arrived.stdout) : null;
if (arrivedNames === null) {
  failures.push('could not read the environment the servers start with');
} else {
  for (const name of Object.keys(shellOnly)) {
    if (arrivedNames.includes(name)) failures.push(`the shell's ${name} reaches the servers`);
  }
}

if (!process.argv.includes('--no-build')) await run(['build'], { APP_ENV: 'test' });

const port = await freePort();
const origin = `http://localhost:${port}`;
const server = start(['start', '--port', String(port)], {
  APP_ENV: 'test',
  PUBLIC_BASE_URL: origin,
});
try {
  await waitFor(`${origin}/`, server);
  for (const [who, address, status, must = [], mustNot = [], to, extraCookie] of cases) {
    const sent = [who === 'visitor' ? '' : `srl_session=${tokens[who]}`, extraCookie ?? ''];
    const headers = sent.some((c) => c !== '')
      ? { cookie: sent.filter((c) => c !== '').join('; ') }
      : {};
    const response = await fetch(origin + address, { headers, redirect: 'manual' });
    const text = await response.text();
    const label = `${who} ${address}`;
    if (response.status !== status)
      failures.push(`${label}: status ${response.status}, not ${status}`);
    for (const words of must) {
      if (typeof words !== 'string') {
        const problem = words.problem(text);
        if (problem !== undefined) failures.push(`${label}: ${words.label}: ${problem}`);
      } else if (!text.includes(words)) failures.push(`${label}: no "${words}"`);
    }
    for (const words of mustNot)
      if (text.includes(words)) failures.push(`${label}: has "${words}"`);
    for (const [name, usual] of Object.entries(securityHeaders)) {
      // The accept page keeps its referrer to this site (record 086, T-288).
      const value =
        name === 'referrer-policy' && address.endsWith('/invitation') ? 'same-origin' : usual;
      if (response.headers.get(name) !== value) failures.push(`${label}: ${name} not "${value}"`);
    }
    failures.push(...policyProblems(label, response, text));
    if (!response.headers.get('permissions-policy')?.includes('camera=()')) {
      failures.push(`${label}: no permissions-policy`);
    }
    if (to !== undefined) {
      const location = response.headers.get('location') ?? '';
      if (new URL(location, origin).pathname + new URL(location, origin).search !== to) {
        failures.push(`${label}: forwards to "${location}", not "${to}"`);
      }
    }
  }
  // The address the pages see is the one that arrived, whatever header the browser
  // sends: also at addresses that look like the icon, which the proxy skips.
  for (const [who, address, header] of spoofs) {
    const headers = { 'x-srleagues-path': header };
    if (who !== 'visitor') headers.cookie = `srl_session=${tokens[who]}`;
    const spoofed = await fetch(origin + address, { headers, redirect: 'manual' });
    if (spoofed.status !== 404) {
      failures.push(`${who} ${address}: a sent address header was believed (${spoofed.status})`);
    }
  }
  // An invitation's address is never passed on to another site (record 023).
  const invitation = await fetch(`${origin}/north-valley/invitation/made-up-token`, {
    redirect: 'manual',
  });
  if (invitation.headers.get('referrer-policy') !== 'no-referrer') {
    failures.push(
      `an invitation address sends referrer-policy "${invitation.headers.get('referrer-policy')}"`,
    );
  }
  // The link holds its token in a cookie and forwards to an address with no secret in it
  // (step 2.97, record 086, T-288): never kept by a cache, and the token is in no log.
  if (!(invitation.headers.get('cache-control') ?? '').includes('no-store')) {
    failures.push(
      `an invitation address sends cache-control "${invitation.headers.get('cache-control')}"`,
    );
  }
  if (
    invitation.status !== 303 ||
    new URL(invitation.headers.get('location') ?? '', origin).pathname !==
      '/north-valley/invitation'
  ) {
    failures.push(
      `an invitation address answers ${invitation.status} to "${invitation.headers.get('location')}"`,
    );
  }
  const held = invitation.headers.get('set-cookie') ?? '';
  if (
    !/srl_invitation=/.test(held) ||
    !/HttpOnly/i.test(held) ||
    !/Path=\/north-valley\/invitation/i.test(held)
  ) {
    failures.push(`an invitation address holds its token as "${held.replace(/=[^;]*/, '=…')}"`);
  }
  const accept = await fetch(`${origin}/north-valley/invitation`, {
    redirect: 'manual',
    headers: { cookie: `srl_invitation=${heldMadeUpToken}` },
  });
  await accept.text();
  if (!(accept.headers.get('cache-control') ?? '').includes('no-store')) {
    failures.push(`the accept page sends cache-control "${accept.headers.get('cache-control')}"`);
  }
  if (!['no-referrer', 'same-origin'].includes(accept.headers.get('referrer-policy') ?? '')) {
    failures.push(
      `the accept page sends referrer-policy "${accept.headers.get('referrer-policy')}"`,
    );
  }
  if (server.output().includes('made-up-token') || server.output().includes(heldMadeUpToken)) {
    failures.push('an invitation token was written to the server log');
  }
  failures.push(...(await sameAsNoLeague(origin)));
  failures.push(...(await scoringSameAsNoLeague(origin)));
  failures.push(...(await checkStaffNumbers(origin)));
  failures.push(...(await checkStylesheets(origin)));
  failures.push(...(await checkScriptPolicy(origin)));
  failures.push(...(await checkSignIn(origin)));
  failures.push(...(await checkTeams(origin)));
  failures.push(...(await checkSettings(origin)));
  failures.push(...(await checkOtherHosts(port)));
} finally {
  server.child.kill();
}

// Staging, and since step 2.96 production too, with a database that answers nobody: the app
// must refuse to start, so in neither mode does any page answer, the local-only pages of
// step 2.96 among them (that they answer there as an unknown address is
// apps/web/src/server/local-only.test.ts).
for (const appEnv of ['staging', 'production']) {
  const deployed = start(['start', '--port', String(await freePort())], {
    APP_ENV: appEnv,
    PUBLIC_BASE_URL: `https://${appEnv}.example.test`,
    // Required in staging and production (config-schema.ts), so the settings check passes
    // and the database is reached. All made up: the address answers nobody on this
    // computer. A host name, as staging refuses an IP address as the host (record 055).
    TRUSTED_PROXY: 'one',
    PLATFORM_DATABASE_URL: 'postgres://made-up:made-up-password@localhost:1/nowhere',
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_SECRET_KEY: 'made-up-supabase-secret-key',
    // Production needs Turnstile's keys; staging is left without them, so its bot check is
    // off and start-up says so (T-270, record 081).
    ...(appEnv === 'production'
      ? {
          RESEND_API_KEY: 'made-up-resend-key',
          TURNSTILE_SITE_KEY: 'made-up-turnstile-site-key',
          TURNSTILE_SECRET_KEY: 'made-up-turnstile-secret-key',
        }
      : {}),
  });
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      deployed.child.kill();
      resolve('still running');
    }, 60_000);
    deployed.child.on('exit', (exitCode) => {
      clearTimeout(timer);
      resolve(exitCode);
    });
  });
  if (code === 0 || code === 'still running') {
    failures.push(`${appEnv} with an unreachable database did not refuse to start (${code})`);
  } else if (!deployed.output().includes('the database could not be reached')) {
    failures.push(
      `${appEnv} refused to start without saying why:\n${deployed.output()}${whichFileNodeRefused(deployed.output())}`,
    );
  } else if (deployed.output().includes('made-up-password')) {
    failures.push(`the ${appEnv} refusal printed the database address`);
  } else if (deployed.output().includes('made-up-supabase-secret-key')) {
    failures.push(`the ${appEnv} refusal printed SUPABASE_SECRET_KEY`);
  } else if (deployed.output().includes('made-up-resend-key')) {
    failures.push(`the ${appEnv} refusal printed RESEND_API_KEY`);
  } else if (deployed.output().includes('made-up-turnstile-secret-key')) {
    failures.push(`the ${appEnv} refusal printed TURNSTILE_SECRET_KEY`);
  } else if (deployed.output().includes('The bot check is off') !== (appEnv === 'staging')) {
    failures.push(
      `${appEnv} ${appEnv === 'staging' ? 'did not say' : 'said'} its bot check is off`,
    );
  }
}

if (failures.length > 0) {
  console.error(`Web shell check failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `Web shell check passed: ${cases.length + spoofs.length + 7} checks against the built server.`,
);

// When Node refused a TypeScript file it was to run itself, the server prints only
// "… is not supported in strip-only mode", naming no file (step 2.149). Then the
// structure rule that puts the same files through Node's own stripper names it.
function whichFileNodeRefused(output) {
  if (!/strip-only mode|ERR_(?:UNSUPPORTED|INVALID)_TYPESCRIPT_SYNTAX/.test(output)) return '';
  const { violations } = checkStructure(root, { only: ['NODE-TS'] });
  if (violations.length === 0) {
    return '\n  Node refused a TypeScript file, but the NODE-TS structure rule finds none: the file is reached some other way.';
  }
  return `\n  The file Node refused:\n${violations.map((v) => `    ${formatViolation(v)}`).join('\n')}`;
}

function serverEnvironment(env) {
  const clean = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && runOnly.includes(name.toUpperCase())) clean[name] = value;
  }
  return { ...clean, NEXT_TELEMETRY_DISABLED: '1', ...madeUp, ...env };
}

function start(args, env) {
  let output = '';
  // Next.js itself, not scripts/web.mjs, so stopping it stops the server. On the made-up
  // stand-in, on this computer's loopback address only (web-listen.mjs).
  const environment = serverEnvironment(env);
  const child = spawn(process.execPath, [nextBin, ...withLoopback(args, environment)], {
    cwd: app,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  return { child, output: () => output };
}

function run(args, env) {
  return new Promise((resolve, reject) => {
    const { child, output } = start(args, env);
    child.on('exit', (exitCode) =>
      exitCode === 0 ? resolve() : reject(new Error(`next ${args[0]} failed:\n${output()}`)),
    );
  });
}

async function waitFor(url, server) {
  const until = Date.now() + 60_000;
  while (Date.now() < until) {
    if (server.child.exitCode !== null) {
      throw new Error(
        `the server stopped:\n${server.output()}${whichFileNodeRefused(server.output())}`,
      );
    }
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`the server did not answer within a minute:\n${server.output()}`);
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

/**
 * A page as the browser ends up with it, whatever the timing of the stream. Next.js
 * sends the page's data in `self.__next_f.push` pieces as each part is ready, so how
 * the data is cut into pieces, and the order its numbered rows arrive in, depend on
 * how busy the server was. The markup outside those pieces is kept as sent; the data
 * is joined back together and its rows put in order. Every byte is still compared.
 */
function settle(body) {
  const pieces = [];
  const markup = body.replace(
    /<script(?: nonce="[^"]*")?>self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)<\/script>/g,
    (_, piece) => {
      pieces.push(JSON.parse(piece));
      return '';
    },
  );
  const rows = pieces.join('').split('\n').filter(Boolean).sort().join('\n');
  return { markup, rows };
}

/** Where two texts first part, for the report. */
function firstDifference(a, b) {
  let at = 0;
  while (at < a.length && a[at] === b[at]) at += 1;
  return `at ${at}: "${a.slice(at, at + 80)}" / "${b.slice(at, at + 80)}"`;
}

/**
 * A league hidden from someone is "not found" for them, exactly the answer for a name
 * nobody has (U-9, steps 2.87 and 2.157): the same status, headers, markup and page data,
 * once each name is put in the same place. Only the date, the length and how the stream
 * happened to be cut (settle above) may differ. Asked by each kind of person, at the
 * admin's home, two admin areas, the league's home and a game's scoring address, for each
 * league hidden from them: a draft, a suspended league, a league in the bin, and another
 * league's draft. The refusal Next.js draws into every page names the person signed in, so
 * this also proves it says nothing more of a hidden league than of no league at all.
 */
async function sameAsNoLeague(origin) {
  const ask = async (who, name, rest) => {
    const response = await fetch(`${origin}/${name}${rest}`, {
      headers: who === 'visitor' ? {} : { cookie: `srl_session=${tokens[who]}` },
      redirect: 'manual',
    });
    const headers = [...response.headers]
      .filter(([header]) => !['date', 'content-length'].includes(header))
      .map(([header, value]) => `${header}: ${value.replaceAll(name, '{name}')}`)
      .join('\n');
    const body = (await response.text()).replaceAll(name, '{name}');
    return {
      status: response.status,
      ...oneNonce(headers, body, found, `${who} at /${name}${rest}`),
    };
  };
  // Who may not see which (stand-in-ports.ts): the coach holds a coach's place in the
  // draft, which is not an area of its admin; the scheduler holds the draft and the first
  // league; another league's admin holds the empty league only; no one but the owner
  // holds the second draft (Reed Marsh).
  const hiddenFrom = {
    visitor: ['quiet-pines', 'closed-gate', 'binned-league', 'reed-marsh'],
    stranger: ['quiet-pines', 'closed-gate', 'binned-league', 'reed-marsh'],
    coach: ['quiet-pines', 'closed-gate', 'reed-marsh'],
    scheduler: ['closed-gate', 'binned-league', 'reed-marsh'],
    otherAdmin: ['quiet-pines', 'closed-gate', 'binned-league', 'reed-marsh'],
  };
  const addresses = ['/admin', '/admin/people', '/admin/games', '', `/score/${liveGame}`];
  const found = [];
  for (const [who, hidden] of Object.entries(hiddenFrom)) {
    for (const rest of addresses) {
      const nobody = await ask(who, 'nobody-has-this', rest);
      const b = settle(nobody.body);
      for (const name of hidden) {
        const at = `${who} at /${name}${rest}`;
        const league = await ask(who, name, rest);
        if (league.status !== 404 || nobody.status !== 404) {
          found.push(`${at}: answers ${league.status}, no league ${nobody.status}, not 404`);
        }
        if (league.headers !== nobody.headers) {
          found.push(
            `${at}: headers differ from no league's:\n${league.headers}\n---\n${nobody.headers}`,
          );
        }
        const a = settle(league.body);
        if (a.rows === '' || b.rows === '')
          found.push(`${at}: a not-found page carries no page data`);
        if (a.markup !== b.markup) {
          found.push(
            `${at}: markup differs from no league's ${firstDifference(a.markup, b.markup)}`,
          );
        }
        if (a.rows !== b.rows) {
          found.push(
            `${at}: page data differs from no league's ${firstDifference(a.rows, b.rows)}`,
          );
        }
      }
    }
  }
  return found;
}

/**
 * The script policy and HTTPS on the answers the cases above do not reach (T-79, record
 * 081): the static files and the two stylesheets, which the proxy never sees (the fixed
 * policy: no nonce, so nothing inline runs), the live feed, which must still stream, a
 * form's answer, the plain page for a request passed on by another server, and a request
 * that brings a policy of its own with a nonce it chose, which must be thrown away.
 */
async function checkScriptPolicy(origin) {
  const found = [];
  const fixed =
    "script-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; frame-ancestors 'none'";
  const https = securityHeaders['strict-transport-security'];
  const home = await (await fetch(`${origin}/north-valley`)).text();
  const chunk = /<script src="(\/_next\/static\/[^"]+\.js)"/.exec(home)?.[1];
  if (chunk === undefined) found.push('no script file named in a page');
  for (const address of [
    chunk ?? '/_next/static/none.js',
    '/display.css',
    '/standalone.css',
    '/favicon.ico',
    '/_next/static/none.js',
  ]) {
    const response = await fetch(origin + address, { redirect: 'manual' });
    await response.arrayBuffer();
    if (response.headers.get('content-security-policy') !== fixed) {
      found.push(
        `${address}: content-security-policy "${response.headers.get('content-security-policy')}"`,
      );
    }
    if (response.headers.get('strict-transport-security') !== https) {
      found.push(`${address}: no strict-transport-security`);
    }
  }
  // The live feed still streams: its first bytes arrive, with the policy and HTTPS on it.
  const channel = encodeURIComponent(`league:${northValley}:game:${liveGame}`);
  const stop = new AbortController();
  const live = await fetch(`${origin}/api/v1/live?channel=${channel}`, { signal: stop.signal });
  found.push(...policyProblems('the live feed', live, ''));
  if (live.headers.get('strict-transport-security') !== https)
    found.push('the live feed: no strict-transport-security');
  if (
    live.status !== 200 ||
    !(live.headers.get('content-type') ?? '').includes('text/event-stream')
  ) {
    found.push(`the live feed answers ${live.status} ${live.headers.get('content-type')}`);
  } else {
    const first = await Promise.race([
      live.body
        .getReader()
        .read()
        .then(() => 'streamed'),
      new Promise((resolve) => setTimeout(() => resolve('nothing in 20 seconds'), 20_000)),
    ]);
    if (first !== 'streamed') found.push(`the live feed sent ${first}`);
  }
  stop.abort();
  // A request passed on by another server gets the plain page, which has no script: the
  // fixed policy, and HTTPS.
  const passedOn = await fetch(`${origin}/north-valley`, { headers: { via: '1.1 a-proxy' } });
  await passedOn.text();
  if (passedOn.status !== 421 || passedOn.headers.get('content-security-policy') !== fixed) {
    found.push(
      `the page for a request passed on: ${passedOn.status}, "${passedOn.headers.get('content-security-policy')}"`,
    );
  }
  if (passedOn.headers.get('strict-transport-security') !== https)
    found.push('the page for a request passed on: no strict-transport-security');
  // A policy the browser sends, with a nonce it chose, is replaced: its nonce is on nothing.
  const chosen = 'AAAAAAAAAAAAAAAAAAAAAAAA';
  const brought = await fetch(`${origin}/north-valley`, {
    headers: { 'content-security-policy': `script-src 'nonce-${chosen}'` },
  });
  const broughtPage = await brought.text();
  found.push(...policyProblems('a page asked with a policy of its own', brought, broughtPage));
  if (
    broughtPage.includes(chosen) ||
    (brought.headers.get('content-security-policy') ?? '').includes(chosen)
  ) {
    found.push('a nonce the browser chose was used');
  }
  return found;
}

/**
 * Step 2.46's signed-in read of the numbers a page keeps from the public (GET
 * /api/v1/leagues/{leagueId}/staff-numbers, T-287, record 085), as every kind of person.
 * The Owls keep their players' numbers to their staff. The statistics page and the Owls'
 * page, as a visitor gets them, each carry the one address to ask (and the Falcons' page,
 * with nothing kept back, carries none). Asked there, the Owls' coach and the league's owner
 * get the Owls' players with the note that they are not public; a visitor, a signed-in
 * stranger, another team's coach, a scheduler and another league's admin all get the one
 * answer `{"more":null}`, so it never says numbers are kept from them. Every answer is
 * private and no-store.
 */
async function checkStaffNumbers(origin) {
  const found = [];
  const addressIn = (html) =>
    html
      .replaceAll('\\u0026', '&')
      .replaceAll('&amp;', '&')
      .match(/\/api\/v1\/leagues\/[0-9a-f-]{36}\/staff-numbers\?[a-z0-9=&-]+/)?.[0];
  const pageOf = async (address) => (await fetch(origin + address)).text();
  const falcons = addressIn(await pageOf('/north-valley/teams/falcons'));
  if (falcons !== undefined) found.push(`the Falcons' page asks for staff numbers: ${falcons}`);
  for (const page of ['/north-valley/stats', '/north-valley/teams/owls']) {
    const address = addressIn(await pageOf(page));
    if (address === undefined) {
      found.push(`${page} carries no staff numbers address`);
      continue;
    }
    if (/castellanos|brooks/i.test(address)) found.push(`${page}'s address names a player`);
    const nothing = ['visitor', 'stranger', 'coach', 'scheduler', 'otherAdmin'];
    for (const who of [...nothing, 'teamCoach', 'owner']) {
      const answer = await fetch(origin + address, {
        headers: who === 'visitor' ? {} : { cookie: `srl_session=${tokens[who]}` },
      });
      const body = await answer.text();
      const label = `${who}'s staff numbers for ${page}`;
      if (answer.status !== 200) found.push(`${label}: status ${answer.status}`);
      if (answer.headers.get('cache-control') !== 'private, no-store')
        found.push(`${label}: cache-control ${answer.headers.get('cache-control')}`);
      if (nothing.includes(who)) {
        if (body !== '{"more":null}')
          found.push(`${label} is not "nothing more": ${body.slice(0, 120)}`);
      } else if (
        !body.includes('Jordan Castellanos') ||
        !body.includes('Not public: shown to you as staff')
      ) {
        found.push(`${label} lacks the Owls' players or the note: ${body.slice(0, 120)}`);
      }
    }
  }
  return found;
}

/**
 * Step 2.153's read of a page's buttons (GET /api/v1/leagues/{leagueId}/scoring) answers a
 * league its visitor may not see, a draft or a suspended one, exactly as a league that does
 * not exist or is in the bin (U-9): for a visitor, a signed-in stranger, another league's
 * admin and another league's scorekeeper, the answers for the leagues each may not see are
 * compared with no league's, status, body and every header but the date and the length.
 * The draft league's owner gets the ordinary answer.
 */
async function scoringSameAsNoLeague(origin) {
  const leagueOf = (n) => `01900000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
  const leagues = {
    'no league': leagueOf(0xfffff),
    'in the bin': leagueOf(6),
    draft: leagueOf(3),
    suspended: leagueOf(5),
    // Reed Marsh; Still Waters (7), the empty league, starts live (step 2.194).
    'another draft': leagueOf(8),
  };
  // Who may not see which: another league's admin holds the empty league only; no one
  // but the owner holds the other draft; another league's scorekeeper holds north-valley,
  // the draft and the archived league (stand-in-ports.ts).
  const hiddenFrom = {
    visitor: ['draft', 'another draft', 'suspended'],
    stranger: ['draft', 'another draft', 'suspended'],
    otherAdmin: ['draft', 'another draft', 'suspended'],
    scorekeeper: ['another draft', 'suspended'],
  };
  const ask = async (who, leagueId) => {
    const response = await fetch(
      `${origin}/api/v1/leagues/${leagueId}/scoring?games=${liveGame},${unassignedGame}`,
      {
        headers: who === 'visitor' ? {} : { cookie: `srl_session=${tokens[who]}` },
        redirect: 'manual',
      },
    );
    const headers = [...response.headers]
      .filter(([header]) => !['date', 'content-length'].includes(header))
      .map(([header, value]) => `${header}: ${value}`)
      .join('\n');
    const body = await response.text();
    return { status: response.status, ...oneNonce(headers, body, found, `${who} ${leagueId}`) };
  };
  const found = [];
  for (const [who, hidden] of Object.entries(hiddenFrom)) {
    const answers = [];
    for (const what of ['no league', 'in the bin', ...hidden]) {
      answers.push([what, await ask(who, leagues[what])]);
    }
    const [, first] = answers[0];
    if (first.status !== 404) found.push(`${who}'s scoring read of no league is ${first.status}`);
    for (const [what, answer] of answers.slice(1)) {
      if (JSON.stringify(answer) !== JSON.stringify(first)) {
        found.push(
          `${who}'s scoring read of a league ${what} differs from no league's:\n${JSON.stringify(answer)}\n---\n${JSON.stringify(first)}`,
        );
      }
    }
  }
  // And exactly as the other public read, the snapshot, answers a visitor of a hidden league.
  const snapshot = await fetch(
    `${origin}/api/v1/leagues/${leagues.draft}/games/${liveGame}/snapshot`,
    { redirect: 'manual' },
  );
  const snapshotAnswer = {
    status: snapshot.status,
    ...oneNonce(
      [...snapshot.headers]
        .filter(([header]) => !['date', 'content-length'].includes(header))
        .map(([header, value]) => `${header}: ${value}`)
        .join('\n'),
      await snapshot.text(),
      found,
      'the snapshot',
    ),
  };
  const scoringAnswer = await ask('visitor', leagues.draft);
  if (JSON.stringify(scoringAnswer) !== JSON.stringify(snapshotAnswer)) {
    found.push(
      `a visitor's scoring read of a draft differs from its snapshot:\n${JSON.stringify(scoringAnswer)}\n---\n${JSON.stringify(snapshotAnswer)}`,
    );
  }
  const owner = await ask('owner', leagues.draft);
  if (owner.status !== 200 || !/private, no-store/.test(owner.headers)) {
    found.push(`the draft league's owner's scoring read is ${owner.status}: ${owner.headers}`);
  }
  return found;
}

/**
 * The admin Teams forms over HTTP (step 2.51), as a browser with no script posts them:
 * the owner adds a team, puts a player on its roster with a number and marks them as
 * having left; someone who may not open the Teams area changes nothing. The commands'
 * own rules are tested beside the code (apps/web/src/server/stand-in-admin-teams.test.ts).
 */
/**
 * The two stylesheets we serve ourselves are public and kept by browsers and shared
 * caches, so nothing of a person's session may ride on their answers: no cookie is ever
 * set, whatever cookies the request carries. A request with a renewing token and no
 * session is the one the proxy would act on (it clears an ended one, as checkSignIn
 * shows on a page), so the stylesheets must not pass through the proxy at all.
 */
async function checkStylesheets(origin) {
  const problems = [];
  const home = await (await fetch(`${origin}/north-valley`)).text();
  const linked = /href="(\/display\.css\?v=[0-9a-f]+)"/.exec(home)?.[1];
  if (linked === undefined)
    problems.push('a league page does not link to /display.css with its mark');
  const carried = [
    ['no cookies', ''],
    ['an ended renewing token', 'srl_renew=made-up-ended-token'],
    ['a session and a renewing token', `srl_session=${tokens.owner}; srl_renew=made-up-token`],
  ];
  for (const address of [linked ?? '/display.css', '/display.css', '/standalone.css']) {
    for (const [label, cookie] of carried) {
      const answer = await fetch(origin + address, {
        headers: cookie === '' ? {} : { cookie },
        redirect: 'manual',
      });
      const kept = answer.headers.get('cache-control') ?? '';
      if (answer.status !== 200 || !(answer.headers.get('content-type') ?? '').includes('css')) {
        problems.push(`${address} with ${label} answers ${answer.status}`);
      }
      if (answer.headers.getSetCookie().length > 0) {
        problems.push(`${address} with ${label} sets a cookie on an answer caches may keep`);
      }
      if (!kept.startsWith('public') || kept.includes('private') || kept.includes('no-store')) {
        problems.push(`${address} with ${label} is sent with cache-control "${kept}"`);
      }
    }
  }
  return problems;
}

/**
 * The page's own forms: those after the league's header. Since step 2.127 the header holds
 * the account button's "Sign out" form (twice: the phone menu and the laptop's button),
 * so forms are counted from the page's own content, as they were before it. The admin's
 * own frame (step 2.103) holds "Sign out" too, in its phone menu and again in its side
 * menu, which comes after its header: so the count starts where the page's content does
 * (`id="content"`, in the league's frame and in the admin's alike).
 */
function pageForms(html) {
  const content = html.indexOf('id="content"');
  return html.slice(Math.max(0, content >= 0 ? content : html.indexOf('</header>')));
}

async function checkTeams(origin) {
  const problems = [];
  const as = (who) => ({ cookie: `srl_session=${tokens[who]}` });
  const pageOf = async (who, page) => (await fetch(origin + page, { headers: as(who) })).text();
  /**
   * Posts a form of `page` with the fields given: the `index`th form when `index` is a
   * number, or, when it is a field's name, the one form that has that field (so a form is
   * found by what it is, wherever the page puts it).
   */
  async function post(who, page, index, fields, formPage = page) {
    const html = await pageOf('owner', formPage);
    const actionOf = (form) => /name="(\$ACTION_ID_[^"]+)"/.exec(form)?.[1];
    let id;
    if (typeof index === 'number') {
      id = [...pageForms(html).matchAll(/name="(\$ACTION_ID_[^"]+)"/g)].map((m) => m[1])[index];
    } else {
      const having = pageForms(html)
        .split('<form')
        .slice(1)
        .map((form) => form.slice(0, form.indexOf('</form>')))
        .filter((form) => form.includes(`name="${index}"`) && actionOf(form) !== undefined);
      if (having.length > 1) problems.push(`${page}: ${having.length} forms have ${index}`);
      id = having.length === 1 ? actionOf(having[0]) : undefined;
    }
    if (id === undefined) {
      problems.push(`${page}: no form ${index}`);
      return undefined;
    }
    const body = new FormData();
    body.set(id, '');
    for (const [name, value] of Object.entries(fields)) body.set(name, value);
    return fetch(origin + page, {
      method: 'POST',
      body,
      headers: { origin, ...as(who) },
      redirect: 'manual',
    });
  }
  const to = (response) => {
    const location = new URL(response.headers.get('location') ?? '/nowhere', origin);
    return location.pathname + location.search;
  };
  const list = '/harbor-city/admin/teams';
  const added = await post('owner', list, 0, {
    league: 'harbor-city',
    name: 'Blue Jays',
    useOwnColors: 'on',
  });
  if (added === undefined) return problems;
  const team = /^\/harbor-city\/admin\/teams\/([0-9a-f-]{36})\?done=created$/.exec(to(added))?.[1];
  if (added.status !== 303 || team === undefined) {
    problems.push(`adding a team answers ${added.status} to ${to(added)}`);
    return problems;
  }
  const page = `${list}/${team}`;
  // A team with no one on it yet has two ways to add a player: someone new (first, step
  // 2.194) and one of the league's people (the league has people, step 2.152). The new
  // player's form is the one with a first name.
  const player = await post('owner', page, 'firstName', {
    league: 'harbor-city',
    team,
    firstName: 'Casey',
    lastName: 'Walker',
    jerseyNumber: '7',
    role: 'captain',
  });
  if (player === undefined || to(player) !== `${page}?done=added`) {
    problems.push(`adding a player answers ${player?.status} to ${player && to(player)}`);
    return problems;
  }
  const withPlayer = await pageOf('owner', page);
  if (!withPlayer.includes('Casey Walker') || !withPlayer.includes('value="7"')) {
    problems.push('the roster does not show the player added with a number');
  }
  const entry = /name="entry" value="([^"]+)"/.exec(withPlayer)?.[1];
  const version = /name="version" value="([^"]+)"[^>]*\/><p><label>Number/.exec(withPlayer)?.[1];
  const forms = [...pageForms(withPlayer).matchAll(/name="(\$ACTION_ID_[^"]+)"/g)].length;
  // The one player's "mark as left" form is the one with a day they left.
  const gone = await post('owner', page, 'leftOn', {
    league: 'harbor-city',
    team,
    entry,
    version: version ?? '1',
    leftOn: '2026-11-13',
  });
  // The answer lands on the marked player's own line (step 2.161): the address names
  // exactly the roster entry this check marked.
  if (
    gone === undefined ||
    entry === undefined ||
    gone.status !== 303 ||
    to(gone) !== `${page}?done=left&entry=${entry}`
  ) {
    problems.push(
      `marking a player as left answers ${gone?.status} to ${gone && to(gone)} of ${forms} forms`,
    );
    return problems;
  }
  // The day is written in words, as the public pages write a day (step 2.103).
  if (!(await pageOf('owner', page)).includes('Casey Walker, left on Fri, Nov 13')) {
    problems.push('the roster does not show the player who left');
  }
  // Forged posts change nothing: a league field that is not the page's league is "not
  // found", and another league's team id is not a team of this league (T-23).
  const forgedLeague = await post('owner', list, 0, { league: 'north-valley', name: 'Forged' });
  if (
    forgedLeague !== undefined &&
    forgedLeague.status === 303 &&
    !to(forgedLeague).includes('problem=')
  ) {
    problems.push(
      `a post naming another league was taken (${forgedLeague.status} to ${to(forgedLeague)})`,
    );
  }
  const lions = /\/north-valley\/admin\/teams\/([0-9a-f-]{36})/.exec(
    await pageOf('owner', '/north-valley/admin/teams'),
  )?.[1];
  if (lions === undefined) {
    problems.push('the north valley list does not link its teams');
  } else {
    const hijack = await post('owner', page, 0, {
      league: 'harbor-city',
      team: lions,
      version: '1',
      name: 'Hijacked',
    });
    if (hijack !== undefined && !to(hijack).includes('problem=teams.update_team.team-not-found')) {
      problems.push(`another league's team id was not refused (${hijack.status} to ${to(hijack)})`);
    }
  }
  for (const where of ['/north-valley/admin/teams', list]) {
    const html = await pageOf('owner', where);
    if (html.includes('Forged') || html.includes('Hijacked')) {
      problems.push(`a forged post changed ${where}`);
    }
  }
  if (!(await pageOf('owner', '/north-valley/admin/teams')).includes('Lions')) {
    problems.push('the north valley teams lost Lions');
  }
  // Someone who may not manage teams changes nothing, and the team page is refused.
  const refused = await post(
    'scheduler',
    '/north-valley/admin/teams',
    0,
    {
      league: 'north-valley',
      name: 'Sneaky',
    },
    '/north-valley/admin/teams',
  );
  if (refused !== undefined && refused.status === 303) {
    problems.push(`a scheduler's team was taken (${refused.status})`);
  }
  if (
    !(await pageOf('owner', '/north-valley/admin/teams')).includes('Lions') ||
    (await pageOf('owner', '/north-valley/admin/teams')).includes('Sneaky')
  ) {
    problems.push('the scheduler changed the north valley teams');
  }
  return problems;
}

/**
 * The admin League settings forms over HTTP (step 2.48), as a browser with no script
 * posts them: the owner saves a setting and goes back to its default; a value outside
 * the limits and a stale version are refused with their own words; someone who may not
 * open the settings area changes nothing. The commands' own rules are tested beside
 * the code (apps/web/src/features/settings-area/settings-area.test.ts).
 */
async function checkSettings(origin) {
  const problems = [];
  const as = (who) => ({ cookie: `srl_session=${tokens[who]}` });
  const page = '/north-valley/admin/settings';
  const pageOf = async (who) => (await fetch(origin + page, { headers: as(who) })).text();
  async function post(who, index, fields) {
    const html = await pageOf('owner');
    const id = [...pageForms(html).matchAll(/name="(\$ACTION_ID_[^"]+)"/g)].map((m) => m[1])[index];
    if (id === undefined) {
      problems.push(`settings: no form ${index}`);
      return undefined;
    }
    const body = new FormData();
    body.set(id, '');
    for (const [name, value] of Object.entries(fields)) body.set(name, value);
    const response = await fetch(origin + page, {
      method: 'POST',
      body,
      headers: { origin, ...as(who) },
      redirect: 'manual',
    });
    const location = new URL(response.headers.get('location') ?? '/nowhere', origin);
    return { status: response.status, to: location.pathname + location.search };
  }
  const key = 'games.whoMayScore';
  const saved = await post('owner', 1, {
    league: 'north-valley',
    key,
    version: '',
    value: 'assignedOnly',
  });
  if (saved?.to !== `${page}?done=saved`) {
    problems.push(`saving a setting answers ${saved?.status} to ${saved?.to}`);
    return problems;
  }
  const after = await pageOf('owner');
  if (!after.includes('Now: set for this league.') || !after.includes('Go back to the default')) {
    problems.push('the settings page does not show the saved value');
  }
  const stale = await post('owner', 1, {
    league: 'north-valley',
    key,
    version: '',
    value: 'anyScorekeeper',
  });
  if (!stale?.to.includes('problem=leagues.set_setting.changed-since-read')) {
    problems.push(`a stale version was not refused (${stale?.to})`);
  }
  const outside = await post('owner', 1, {
    league: 'north-valley',
    key,
    version: '1',
    value: 'nobody',
  });
  if (!outside?.to.includes('problem=leagues.set_setting.invalid-value')) {
    problems.push(`a value outside the limits was not refused (${outside?.to})`);
  }
  const cleared = await post('owner', 1, {
    league: 'north-valley',
    key,
    version: '1',
    intent: 'clear',
  });
  if (cleared?.to !== `${page}?done=cleared`) {
    problems.push(`going back to the default answers ${cleared?.to}`);
  }
  if ((await pageOf('owner')).includes('Go back to the default')) {
    problems.push('the settings page still shows a value after going back to the default');
  }
  // A scheduler may not open the area, so the post is refused and nothing is saved.
  const refused = await post('scheduler', 1, {
    league: 'north-valley',
    key,
    version: '',
    value: 'assignedOnly',
  });
  if (refused !== undefined && refused.status === 303) {
    problems.push(`a scheduler's setting was taken (${refused.to})`);
  }
  if ((await pageOf('owner')).includes('Now: set for this league.')) {
    problems.push('the scheduler changed a setting');
  }
  return problems;
}

/**
 * The made-up world answers only this computer (step 2.152; review 1 M4, review 2 M1).
 * Another computer cannot connect at all: the server listens on the loopback address
 * only, so this computer's own network address is refused. A request addressed to another
 * host (a `.test` name included, unless it is PUBLIC_BASE_URL's), or carrying a sign of
 * having been passed on by another server (Forwarded, Via, an X-Forwarded-For from
 * elsewhere, an X-Forwarded-Host of another name), gets the plain page and nothing of any
 * league, with the made-up owner's cookie or without it, a page, an admin page or the API;
 * the same address on this computer's name is answered as usual. Sent with node:http,
 * since fetch keeps the Host header to itself.
 */
async function checkOtherHosts(port) {
  const problems = [];
  const ask = (host, address, cookie, more = {}) =>
    new Promise((resolve, reject) => {
      const request = http.request(
        {
          host: '127.0.0.1',
          port,
          path: address,
          headers: { host, ...(cookie === undefined ? {} : { cookie }), ...more },
        },
        (response) => {
          let body = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => (body += chunk));
          response.on('end', () => resolve({ status: response.statusCode, body }));
        },
      );
      request.on('error', reject);
      request.end();
    });
  const owner = `srl_session=${tokens.owner}`;
  const local = `localhost:${port}`;
  const refused = [
    ...['example.com', 'srleagues.example.com:443', 'localhost.evil.example', 'other.test'].map(
      (host) => [`Host ${host}`, host, {}],
    ),
    ['CF-Connecting-IP', local, { 'cf-connecting-ip': '10.0.0.5' }],
    ['Forwarded', local, { forwarded: 'for=10.0.0.5' }],
    ['Via', local, { via: '1.1 a-proxy' }],
    ['X-Forwarded-For from elsewhere', local, { 'x-forwarded-for': '10.0.0.5' }],
    ['X-Forwarded-For passed on', local, { 'x-forwarded-for': '127.0.0.1, 10.0.0.5' }],
    ['X-Forwarded-Host of another name', local, { 'x-forwarded-host': 'example.com' }],
  ];
  for (const [what, host, more] of refused) {
    for (const address of [
      '/north-valley',
      '/north-valley/admin/teams',
      `/api/v1/leagues/${northValley}/games/${liveGame}/snapshot`,
    ]) {
      for (const cookie of [undefined, owner]) {
        const { status, body } = await ask(host, address, cookie, more);
        const label = `${what} ${address}${cookie === undefined ? '' : ' (owner)'}`;
        if (status !== 421) problems.push(`${label}: status ${status}, not 421`);
        if (!body.includes('not requests passed on by another server')) {
          problems.push(`${label}: not the plain page`);
        }
        if (/North Valley|Falcons|Add a team/.test(body)) {
          problems.push(`${label}: shows the league`);
        }
      }
    }
  }
  const here = await ask(local, '/north-valley', owner);
  if (here.status !== 200 || !here.body.includes('North Valley League')) {
    problems.push(`this computer's own name is not answered (${here.status})`);
  }
  // What Next.js itself writes for a request from this computer is no sign of passing on.
  const asNextWrites = await ask(local, '/north-valley', owner, {
    'x-forwarded-for': '127.0.0.1',
    'x-forwarded-host': local,
  });
  if (asNextWrites.status !== 200) {
    problems.push(
      `a request with Next.js's own forwarding headers is refused (${asNextWrites.status})`,
    );
  }
  // This computer's own network addresses are not listened on: no other computer can connect.
  for (const address of networkAddresses()) {
    if (await connects(address, port)) {
      problems.push(`the made-up world can be reached at ${address}, not only at 127.0.0.1`);
    }
  }
  if (!here.body.includes('A made-up league on this computer.')) {
    problems.push('a made-up league page does not say it is made up');
  }
  return problems;
}

/** This computer's addresses on its networks (not loopback), as other computers reach it. */
function networkAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry !== undefined && !entry.internal)
    .map((entry) => entry.address);
}

/** Whether a connection to `address` on `port` is taken, within two seconds. */
function connects(address, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: address, port });
    const done = (answer) => {
      socket.destroy();
      resolve(answer);
    };
    socket.setTimeout(2000, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/**
 * The sign-in forms over HTTP (step 1.14), as a browser with no script posts them:
 * answers and cookies (T-68, T-69), refusal of a form posted from another site,
 * and the proxy clearing a session that has ended. The full flows, with codes, are
 * tested beside the code (apps/web/src/server/sign-in/flows.test.ts).
 */
async function checkSignIn(origin) {
  const problems = [];
  /**
   * Posts the `index`th form of `page`, as Next.js's no-script form post does: with every
   * hidden field the page drew in that form (the bot check's stand-in answer among them,
   * record 081), then `fields`; a field given as null is left out, as a bot posting the
   * form itself would leave it.
   */
  async function post(page, index, fields, from = origin) {
    const html = await (await fetch(origin + page)).text();
    const form = html.split('<form').slice(1)[index]?.split('</form>')[0];
    const id = form === undefined ? undefined : /name="(\$ACTION_ID_[^"]+)"/.exec(form)?.[1];
    if (id === undefined) {
      problems.push(`${page}: no form ${index}`);
      return undefined;
    }
    const body = new FormData();
    body.set(id, '');
    for (const [input] of form.matchAll(/<input\b[^>]*>/g)) {
      const attribute = (name) => new RegExp(`\\b${name}="([^"]*)"`).exec(input)?.[1];
      const name = attribute('name');
      if (attribute('type') === 'hidden' && name !== undefined && name !== id) {
        body.set(name, (attribute('value') ?? '').replaceAll('&amp;', '&'));
      }
    }
    for (const [name, value] of Object.entries(fields)) {
      if (value === null) body.delete(name);
      else body.set(name, value);
    }
    return fetch(origin + page, {
      method: 'POST',
      body,
      headers: { origin: from },
      redirect: 'manual',
    });
  }
  const cookieNamesOf = (response) =>
    response.headers
      .getSetCookie()
      .map((c) => c.split('=')[0])
      .sort();
  const where = (response) => {
    const location = new URL(response.headers.get('location') ?? '/nowhere', origin);
    return location.pathname + location.search;
  };

  // T-68: the same answer for the made-up member's address, which has an account
  // (stand-in-ports.ts, standInMember), and one that has none: asking to sign up,
  // the forgotten-password route, and a wrong password.
  const member = 'member@example.test';
  const nobody = 'nobody-here@example.test';
  const forms = [
    ['/signup', (email) => ({ email }), '/signup/code'],
    ['/signin/forgot', (email) => ({ email }), '/signup/code'],
    [
      '/signin',
      (email) => ({ email, password: 'not the password' }),
      '/signin?problem=wrongEmailOrPassword',
    ],
  ];
  for (const [page, fields, expected] of forms) {
    const answers = [];
    for (const email of [member, nobody]) {
      const response = await post(page, 0, fields(email));
      if (response === undefined) return problems;
      answers.push({
        status: response.status,
        to: where(response),
        cookies: cookieNamesOf(response),
      });
      problems.push(...policyProblems(`${page}'s form`, response, ''));
      for (const cookie of response.headers.getSetCookie()) {
        if (!/HttpOnly/i.test(cookie) || !/SameSite=lax/i.test(cookie)) {
          problems.push(
            `${page} sets a cookie without HttpOnly and SameSite=Lax: ${cookie.split('=')[0]}`,
          );
        }
      }
    }
    if (answers[0].status !== 303 || answers[0].to !== expected) {
      problems.push(`${page} answers ${answers[0].status} to ${answers[0].to}, not ${expected}`);
    }
    if (JSON.stringify(answers[0]) !== JSON.stringify(answers[1])) {
      problems.push(`${page} answers differently for an address with an account and one without`);
    }
  }
  // The bot check's stand-in refuses a form that comes without its answer, or with another,
  // at sign-in, sign-up and the forgotten password (T4 §6, record 081): the screen again
  // with its problem, and nothing set in the browser.
  const answerField = 'cf-turnstile-response';
  for (const [page, fields] of forms) {
    for (const answer of [null, 'a made-up wrong answer']) {
      const response = await post(page, 0, { ...fields(member), [answerField]: answer });
      if (response === undefined) return problems;
      const expected = `${page}?problem=botCheckFailed`;
      if (response.status !== 303 || where(response) !== expected) {
        problems.push(
          `${page} with ${answer === null ? 'no' : 'a wrong'} bot check answer: ${response.status} to ${where(response)}, not ${expected}`,
        );
      }
      if (response.headers.getSetCookie().length > 0) {
        problems.push(`${page} refused by the bot check still set ${cookieNamesOf(response)}`);
      }
    }
  }
  // The member's account is real: the right password signs in.
  const right = await post('/signin', 0, { email: member, password: 'made-up member password' });
  if (
    right !== undefined &&
    (where(right) !== '/account' || !cookieNamesOf(right).includes('srl_session'))
  ) {
    problems.push(`the made-up member could not sign in (${right.status} to ${where(right)})`);
  }
  // A form posted from another site changes nothing (T4 §5).
  const forged = await post(
    '/signup',
    0,
    { email: 'someone@example.test' },
    'https://evil.example',
  );
  if (
    forged !== undefined &&
    (forged.status === 303 || cookieNamesOf(forged).includes('srl_flow'))
  ) {
    problems.push(`a form posted from another site was taken (${forged.status})`);
  }
  // An ended session's renewing token is cleared by the proxy (T-69).
  const ended = await fetch(`${origin}/signin`, {
    headers: { cookie: 'srl_renew=made-up-ended-token' },
    redirect: 'manual',
  });
  const cleared = ended.headers.getSetCookie().find((c) => c.startsWith('srl_renew='));
  if (cleared === undefined || !/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(cleared)) {
    problems.push('an ended session was not cleared from the browser');
  }
  // Google's return address holds a one-time code: never passed on.
  const back = await fetch(`${origin}/signin/google?code=made-up`, { redirect: 'manual' });
  if (back.status !== 303 || where(back) !== '/signin?problem=googleFailed') {
    problems.push(
      `Google's return with no sign-in started answers ${back.status} to ${where(back)}`,
    );
  }
  if (back.headers.get('referrer-policy') !== 'no-referrer') {
    problems.push(`Google's return sends referrer-policy "${back.headers.get('referrer-policy')}"`);
  }
  return problems;
}
