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

// Which refusal the page made. Next.js 16 sends a refused page as a shell that the
// browser's script fills with the not-found or forbidden screen (record 020), so
// the refusal is read from the page's data, beside its status.
const noAccess = 'NEXT_HTTP_ERROR_FALLBACK;403';
const notFound = 'NEXT_HTTP_ERROR_FALLBACK;404';

/** [who, path, status, words that must be there, words that must not, forward to] */
const cases = [
  ['visitor', '/', 200, ['Find your league, or start one']],
  ['visitor', '/account', 200, ['Your account']],
  ['visitor', '/north-valley', 200, ['Home', 'This page is not built yet.']],
  ['visitor', '/north-valley/teams/lions', 200, ['Team']],
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
  for (const [who, address, status, must = [], mustNot = [], to] of cases) {
    const headers = who === 'visitor' ? {} : { cookie: `srl_session=${tokens[who]}` };
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
} finally {
  server.child.kill();
}

// Staging with a database that answers nobody: the app must refuse to start.
const staging = start(['start', '--port', String(await freePort())], {
  APP_ENV: 'staging',
  PUBLIC_BASE_URL: 'https://staging.example.test',
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
