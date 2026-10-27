// The server as it runs online: anyone can watch, only a signed-in scorer can change
// anything, and it will not start online without a scorer passcode.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { attemptLimiter, scorerAuth } from '../apps/live-stats/auth.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const site = 'https://stats.example.test';

function start(env) {
  const child = spawn(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', 'apps/live-stats/server.ts'],
    {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, LIVE_STATS_STORE: 'memory', DATABASE_URL: '', ...env },
    },
  );
  let output = '';
  child.stdout.on('data', (s) => (output += s));
  child.stderr.on('data', (s) => (output += s));
  const ready = new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (output.includes('Live stats:')) {
        clearInterval(timer);
        resolve();
      } else if (child.exitCode !== null) {
        clearInterval(timer);
        reject(new Error(output));
      }
    }, 100);
  });
  return { child, ready, output: () => output };
}

/** A request as a browser on the public site would send it, Host and Origin included. */
function request(port, method, path, { body, cookie, host = 'stats.example.test' } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path,
        headers: {
          Host: host,
          ...(method === 'GET' ? {} : { Origin: site }),
          ...(data ? { 'Content-Type': 'application/json' } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
      },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            json: text ? JSON.parse(text) : null,
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(data);
  });
}

test('online without a scorer passcode, the server refuses to start', async () => {
  const server = start({
    LIVE_STATS_PUBLIC_URL: site,
    PORT: '4192',
    LIVE_STATS_SCORER_PASSCODE: '',
  });
  await assert.rejects(server.ready, /LIVE_STATS_SCORER_PASSCODE/);
});

test('online: watching is open, changes need the scorer passcode', async () => {
  const port = 4193;
  const server = start({
    LIVE_STATS_PUBLIC_URL: site,
    PORT: String(port),
    LIVE_STATS_SCORER_PASSCODE: 'lions-score-2026',
  });
  try {
    await server.ready;
    assert.match(server.output(), /Database: memory only/);
    assert.equal((await request(port, 'GET', '/healthz', { host: '10.0.0.5:4193' })).status, 200);
    assert.equal((await request(port, 'GET', '/', { host: 'evil.example' })).status, 403);

    const schedule = await request(port, 'GET', '/api/schedule');
    assert.equal(schedule.status, 200);
    assert.equal(schedule.json.games.length, 10);
    const game = schedule.json.games[0];
    assert.deepEqual((await request(port, 'GET', '/api/session')).json, {
      canScore: false,
      signIn: true,
      watchUrls: [],
    });

    const add = { name: 'Yusuf', jersey: '23' };
    const unsigned = await request(port, 'POST', `/api/teams/${game.away.id}/players`, {
      body: add,
    });
    assert.equal(unsigned.status, 401);
    const command = { commandId: randomUUID(), input: { type: 'start' } };
    assert.equal(
      (await request(port, 'POST', `/api/games/${game.id}/commands`, { body: command })).status,
      401,
    );

    const wrong = await request(port, 'POST', '/api/session', { body: { passcode: 'nope' } });
    assert.equal(wrong.status, 401);
    const right = await request(port, 'POST', '/api/session', {
      body: { passcode: 'lions-score-2026' },
    });
    assert.equal(right.status, 200);
    const setCookie = right.headers['set-cookie'][0];
    assert.match(setCookie, /HttpOnly; SameSite=Strict; Secure/);
    const cookie = setCookie.split(';')[0];

    assert.equal((await request(port, 'GET', '/api/session', { cookie })).json.canScore, true);
    assert.equal(
      (await request(port, 'POST', `/api/teams/${game.away.id}/players`, { body: add, cookie }))
        .status,
      201,
    );
    const started = await request(port, 'POST', `/api/games/${game.id}/commands`, {
      body: command,
      cookie,
    });
    assert.equal(started.status, 200);
    assert.equal(started.json.status, 'live');
    const forged = cookie.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
    assert.equal(
      (
        await request(port, 'POST', `/api/teams/${game.away.id}/players`, {
          body: add,
          cookie: forged,
        })
      ).status,
      401,
    );

    for (let i = 0; i < 10; i++)
      await request(port, 'POST', '/api/session', { body: { passcode: 'x' } });
    const locked = await request(port, 'POST', '/api/session', {
      body: { passcode: 'lions-score-2026' },
    });
    assert.equal(locked.status, 429, 'too many wrong passcodes');
  } finally {
    server.child.kill();
  }
});

test('sessions expire, survive a restart and end when the passcode changes', () => {
  const now = Date.parse('2026-11-02T18:00:00Z');
  const auth = scorerAuth('lions-score-2026', { secure: false });
  const cookie = auth.issue(now).split(';')[0];
  assert.ok(auth.valid(cookie, now + 1000));
  assert.ok(
    scorerAuth('lions-score-2026', { secure: false }).valid(cookie, now),
    'same passcode, new process',
  );
  assert.ok(!scorerAuth('another-passcode', { secure: false }).valid(cookie, now));
  assert.ok(!auth.valid(cookie, now + 8 * 86_400_000), 'a week later');
  assert.ok(!auth.valid('ls_session=99999999999999.abc', now));
  assert.ok(auth.matches('lions-score-2026'));
  assert.ok(!auth.matches('lions-score-2027'));
  assert.doesNotMatch(auth.issue(now), /Secure/);

  const limiter = attemptLimiter(3, 1000);
  for (let i = 0; i < 3; i++) limiter.fail('1.2.3.4', now);
  assert.ok(limiter.blocked('1.2.3.4', now + 10));
  assert.ok(!limiter.blocked('5.6.7.8', now + 10));
  assert.ok(!limiter.blocked('1.2.3.4', now + 1001), 'the window passes');
});
