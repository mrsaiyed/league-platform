// The web app shell's check against the real built server (step 1.17), with no
// browser: npm run test:web. Builds the app (skip with --no-build), starts it on
// this computer with made-up settings on the made-up stand-in (APP_ENV=test), asks
// for addresses as different made-up people, and checks the status and the words of
// each answer, the league's own design, name and the "Powered by" mark (step 1.18): "you do not have access" for admin addresses without access (U-6),
// unpublished leagues only for their owner and admins (U-9), forwarding (U-7), and
// the security headers on every answer.
// Then it starts the app as staging with a database address that answers nobody,
// and checks that it refuses to start (T-60). Nothing leaves this computer.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(root, 'apps/web');
const nextBin = createRequire(path.join(app, 'package.json')).resolve('next/dist/bin/next');

const madeUp = {
  LOG_LEVEL: 'warn',
  DATABASE_URL: 'postgres://made-up:made-up-password@127.0.0.1:1/nowhere',
  SESSION_SECRET: 'made-up-session-secret-0123456789abcdef',
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SECRET_KEY: 'made-up-supabase-key',
  RESEND_API_KEY: 'made-up-resend-key',
  EMAIL_FROM: 'hello@example.test',
  STRIPE_SECRET_KEY: 'made-up-stripe-key',
  STRIPE_WEBHOOK_SECRET: 'made-up-webhook-key',
};

// The made-up people's session cookies (apps/web/src/server/stand-in-ports.ts).
const tokens = {
  owner: 'local-owner-token',
  scheduler: 'local-scheduler-token',
  coach: 'local-coach-token',
  stranger: 'local-stranger-token',
};

// The made-up leagues' ids (stand-in-ports.ts), which name the cookie of a device's "my team".
const northValley = '01900000-0000-7000-8000-000000000001';
const harborCity = '01900000-0000-7000-8000-000000000002';

// Which refusal the page made. Next.js 16 sends a refused page as a shell that the
// browser's script fills with the not-found or forbidden screen (record 020), so
// the refusal is read from the page's data, beside its status.
const noAccess = 'NEXT_HTTP_ERROR_FALLBACK;403';
const notFound = 'NEXT_HTTP_ERROR_FALLBACK;404';

/** [who, path, status, words that must be there, words that must not, forward to, extra cookies] */
const cases = [
  ['visitor', '/', 200, ['Find your league, or start one']],
  // The sign-in screens (step 1.14).
  ['visitor', '/account', 307, [], [], '/signin?next=%2Faccount'],
  ['owner', '/account', 200, ['Your account', 'Signed-in devices', 'Sign out everywhere']],
  ['visitor', '/signin', 200, ['Sign in', 'Continue with Google', 'Forgot your password?']],
  ['visitor', '/signin?problem=wrongEmailOrPassword', 200, ['Wrong email or password.']],
  ['visitor', '/signin?problem=%3Cscript%3E', 200, ['Sign in'], ['role="alert"']],
  ['visitor', '/signup', 200, ['Create your account', 'Email me a code']],
  ['visitor', '/signin/forgot', 200, ['Forgot your password']],
  ['visitor', '/signup/code', 200, ['Enter your code', 'If that address can sign in']],
  ['visitor', '/signup/password', 200, ['Choose your password']],
  ['visitor', '/account/confirm', 200, ['Enter your password again']],
  // The home and schedule pages (step 2.42): real content, not the placeholder; the two
  // leagues have different rounds.
  [
    'visitor',
    '/north-valley',
    200,
    ['Home', 'Recent results', 'Upcoming games', 'Standings'],
    ['This page is not built yet.'],
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
    ['Owls', 'Falcons', '5-1', 'East', 'Seed', 'Record'],
    ['This page is not built yet.'],
  ],
  ['visitor', '/harbor-city/teams', 200, ['Comets', 'Rockets', 'Meteors']],
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
    ['Owls', 'Team totals', 'Roster'],
    ['Castellanos', 'Brooks'],
  ],
  ['visitor', '/north-valley/teams/lions', 404, [notFound]],
  ['visitor', '/north-valley/teams/falcons?season=nope', 404, [notFound]],
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
  // The design as variables once per page, the header and the mark (step 1.18, T-90, U-8):
  // two leagues, two looks.
  [
    'visitor',
    '/north-valley',
    200,
    ['North Valley League', 'Powered by SR Leagues', '--color-primary: #c8a84b', 'Schedule'],
    ['#1f5fbf'],
  ],
  [
    'visitor',
    '/harbor-city/standings',
    200,
    ['Harbor City League', 'Powered by SR Leagues', '--color-primary: #1f5fbf'],
    ['#c8a84b'],
  ],
  // The standings and statistics pages (step 2.43): real tables, not the placeholder; a
  // team set to staff only shows its totals and none of its players to a visitor (S-22).
  [
    'visitor',
    '/north-valley/standings',
    200,
    ['East', 'West', 'Owls', 'Played an ineligible player in round 3.', 'games they played'],
    ['This page is not built yet.'],
  ],
  ['visitor', '/north-valley/standings?season=spring-2026', 200, ['Spring 2026', 'All teams']],
  ['visitor', '/north-valley/standings?season=nope', 404, [notFound]],
  [
    'visitor',
    '/north-valley/stats',
    200,
    ['Leaders', 'Dana Whitfield', 'Owls', 'Only team totals are shown for Owls.', 'ui-stats'],
    ['This page is not built yet.', 'Jordan', 'Castellanos', 'Imani', 'Brooks'],
  ],
  ['coach', '/north-valley/stats', 200, ['Dana Whitfield'], ['Jordan', 'Castellanos', 'Brooks']],
  ['visitor', '/north-valley/stats?by=total', 200, ['Season totals']],
  ['visitor', '/harbor-city/stats', 200, ['Sam R.', 'Noor H.'], ['Rivera', 'Haddad']],
  ['visitor', '/harbor-city/standings', 200, ['Level with another team', 'PTS']],
  ['scheduler', '/north-valley/admin', 200, ['Powered by SR Leagues', '--color-primary: #c8a84b']],
  ['visitor', '/north-valley/admin', 403, [noAccess], ['Admin areas']],
  ['stranger', '/north-valley/admin', 403, [noAccess]],
  ['coach', '/north-valley/admin/teams', 403, [noAccess]],
  ['scheduler', '/north-valley/admin', 200, ['Admin areas', 'Schedule', 'Games'], ['People']],
  ['scheduler', '/north-valley/admin/schedule', 200, ['Schedule', 'Nothing here yet.']],
  ['scheduler', '/north-valley/admin/teams', 403, [noAccess]],
  ['scheduler', '/harbor-city/admin', 403, [noAccess]],
  ['owner', '/north-valley/admin/settings', 200, ['League settings', 'People', 'Teams']],
  ['scheduler', '/north-valley/score/game-1', 200, ['Score a game']],
  ['coach', '/north-valley/score/game-1', 403, [noAccess]],
  ['visitor', '/quiet-pines', 404, [notFound]],
  ['coach', '/quiet-pines', 404, [notFound]],
  ['stranger', '/quiet-pines/admin', 404, [notFound], [noAccess]],
  ['owner', '/quiet-pines', 200, ['This league is not published.']],
  ['scheduler', '/quiet-pines/admin', 404, [notFound], ['Admin areas']],
  ['owner', '/quiet-pines/admin', 200, ['Admin areas']],
  ['visitor', '/closed-gate', 404, [notFound]],
  ['owner', '/closed-gate/admin', 200, ['This league has been taken down.']],
  ['scheduler', '/closed-gate', 404, [notFound]],
  ['visitor', '/old-meadow/standings', 200, ['This league is archived.']],
  ['visitor', '/nobody-has-this', 404, [notFound]],
  ['visitor', '/binned-league', 404, [notFound]],
  ['visitor', '/north-vale/schedule', 308, [], [], '/north-valley/schedule'],
  ['visitor', '/North-Valley', 308, [], [], '/north-valley'],
  ['visitor', '/Account', 308, [], [], '/account'],
  ['visitor', '/quiet-pine/admin', 404, [notFound]],
  ['scheduler', '/quiet-pine/admin', 404, [notFound]],
  ['owner', '/quiet-pine/admin', 308, [], [], '/quiet-pines/admin'],
];

// Sent with every answer, refusals and forwards included (apps/web/next.config.ts).
const securityHeaders = {
  'x-frame-options': 'DENY',
  'content-security-policy': "frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

/** [who, address asked, address header the browser sends]: all must be "not found". */
const spoofs = [
  ['visitor', '/quiet-pines', '/north-valley'],
  ['visitor', '/faviconxico', '/north-valley'],
  ['owner', '/faviconxico/admin', '/north-valley/admin'],
  ['owner', '/favicon-ico/admin/settings', '/quiet-pines/admin/settings'],
];

const failures = [];

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
    for (const words of must) if (!text.includes(words)) failures.push(`${label}: no "${words}"`);
    for (const words of mustNot)
      if (text.includes(words)) failures.push(`${label}: has "${words}"`);
    for (const [name, value] of Object.entries(securityHeaders)) {
      if (response.headers.get(name) !== value) failures.push(`${label}: ${name} not "${value}"`);
    }
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
  failures.push(...(await checkSignIn(origin)));
} finally {
  server.child.kill();
}

// Staging with a database that answers nobody: the app must refuse to start.
const staging = start(['start', '--port', String(await freePort())], {
  APP_ENV: 'staging',
  PUBLIC_BASE_URL: 'https://staging.example.test',
  // Required outside local and test (config-schema.ts), so the database is reached.
  TRUSTED_PROXY: 'one',
});
const code = await new Promise((resolve) => {
  const timer = setTimeout(() => {
    staging.child.kill();
    resolve('still running');
  }, 60_000);
  staging.child.on('exit', (exitCode) => {
    clearTimeout(timer);
    resolve(exitCode);
  });
});
if (code === 0 || code === 'still running') {
  failures.push(`staging with an unreachable database did not refuse to start (${code})`);
} else if (!staging.output().includes('the database could not be reached')) {
  failures.push(`staging refused to start without saying why:\n${staging.output()}`);
} else if (staging.output().includes('made-up-password')) {
  failures.push('the refusal printed the database address');
}

if (failures.length > 0) {
  console.error(`Web shell check failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `Web shell check passed: ${cases.length + spoofs.length + 3} checks against the built server.`,
);

function start(args, env) {
  let output = '';
  // Next.js itself, not scripts/web.mjs, so stopping it stops the server.
  const child = spawn(process.execPath, [nextBin, ...args], {
    cwd: app,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ...madeUp, ...env },
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
    if (server.child.exitCode !== null) throw new Error(`the server stopped:\n${server.output()}`);
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
 * The sign-in forms over HTTP (step 1.14), as a browser with no script posts them:
 * answers and cookies (T-68, T-69), refusal of a form posted from another site,
 * and the proxy clearing a session that has ended. The full flows, with codes, are
 * tested beside the code (apps/web/src/server/sign-in/flows.test.ts).
 */
async function checkSignIn(origin) {
  const problems = [];
  /** Posts the `index`th form of `page`, as Next.js's no-script form post does. */
  async function post(page, index, fields, from = origin) {
    const html = await (await fetch(origin + page)).text();
    const ids = [...html.matchAll(/name="(\$ACTION_ID_[^"]+)"/g)].map((m) => m[1]);
    const id = ids[index];
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
