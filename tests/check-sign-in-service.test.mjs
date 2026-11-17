// The sign-in service check (scripts/check-sign-in-service.mjs, step 2.206), proved
// against the fake Supabase Auth the adapter's own tests use, answering over HTTP on
// this computer only (127.0.0.1). No real service is contacted, ever (T-201): every
// address, key and project reference here is made up, except the tracker's project
// reference read from supabase/site.json, which is only compared, never opened.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createGoTrueClient, trackerProjectFor } from '@srleagues/providers';
import { createFakeSupabaseAuth } from '../packages/providers/src/sign-in/supabase/fake-supabase-auth.test-helper.ts';
import { exitCodeFor, runChecks, settingsFor } from '../scripts/check-sign-in-service-checks.mjs';
import * as words from '../scripts/check-sign-in-service.messages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const secretKey = 'sb_secret_made_up_for_this_test_only';
const leaked = 'password1234';

/** A clock that always moves on, so a refresh token used again is never "the same moment". */
function movingClock() {
  let last = 0;
  return () => {
    last = Math.max(Date.now(), last + 1);
    return new Date(last);
  };
}

/**
 * The fake, set as record 018 says the project is (reuse interval 0, leaked-password
 * protection on), answering over HTTP on 127.0.0.1. `reshape(call, response)` may
 * answer a call another way after the fake has done its work; `setUp(fake)` may set
 * the fake's own overrides, which answer before it does any.
 */
async function serveFake({ reshape, setUp } = {}) {
  const fake = createFakeSupabaseAuth({
    now: movingClock(),
    secretKey,
    reuseSeconds: 0,
    leakedPasswords: [leaked],
  });
  setUp?.(fake);
  const seen = [];
  const server = createServer(async (request, reply) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');
    const headers = Object.fromEntries(
      Object.entries(request.headers).map(([name, value]) => [
        name,
        Array.isArray(value) ? value.join(', ') : String(value),
      ]),
    );
    const call = { method: request.method, path: request.url, headers, body };
    seen.push(call);
    let response = await fake.fetch(`http://127.0.0.1${request.url}`, {
      method: request.method,
      headers,
      ...(body === '' ? {} : { body }),
    });
    if (reshape) response = (await reshape(call, response)) ?? response;
    const text = await response.text();
    const out = {};
    response.headers.forEach((value, name) => {
      out[name] = value;
    });
    reply.writeHead(response.status, out);
    reply.end(text);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    fake,
    seen,
    projectUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** Runs the checks against a served fake through the adapter's own client; every line printed. */
async function runAgainst(served, options = {}) {
  const lines = [];
  const client = createGoTrueClient({
    projectUrl: served.projectUrl,
    secretKey,
    fetch: globalThis.fetch,
  });
  const outcome = await runChecks({
    client,
    print: (text) => lines.push(text),
    minuteMs: 0,
    withheld: [secretKey, served.projectUrl, new URL(served.projectUrl).host],
    ...options,
  });
  return { outcome, lines, output: lines.join('\n') };
}

const checkLines = (lines) =>
  lines.filter(
    (text) => text.startsWith(`  ${words.asExpected}`) || text.startsWith(`  ${words.differed}`),
  );
const lineFor = (lines, label) => lines.find((text) => text.includes(label));

/** The made-up address the run made, from the first call that named it. */
function madeAddress(served) {
  const first = served.seen.find((call) => call.path === '/auth/v1/admin/generate_link');
  return JSON.parse(first.body).email;
}

/**
 * Everything secret the run sent or was sent: the key, the addresses, every password,
 * code, token, hash and verifier in a request, and every token and code the fake
 * handed back (seen again as a bearer, a refresh token or a code). None may be printed.
 */
function secretsOf(served) {
  const found = new Set([secretKey, served.projectUrl, new URL(served.projectUrl).host]);
  for (const call of served.seen) {
    const bearer = (call.headers['authorization'] ?? '').replace(/^Bearer /, '');
    if (bearer) found.add(bearer);
    if (call.body) {
      for (const [name, value] of Object.entries(JSON.parse(call.body))) {
        if (typeof value === 'string' && name !== 'type') found.add(value);
      }
    }
    const id = /^\/auth\/v1\/admin\/users\/(.+)$/.exec(call.path)?.[1];
    if (id) found.add(decodeURIComponent(id));
  }
  return [...found].filter((value) => value.length >= 4);
}

function assertNothingSecret(output, served) {
  for (const secret of secretsOf(served)) {
    assert.ok(
      !output.includes(secret),
      `the output holds something secret (${secret.length} characters)`,
    );
  }
  assert.doesNotMatch(output, /@|https?:\/\/|eyJ|Bearer/);
}

test('against the fake over HTTP, every line says "as expected", and the made-up user is removed', async () => {
  const served = await serveFake();
  try {
    const { outcome, lines, output } = await runAgainst(served);
    const made = checkLines(lines);
    assert.equal(made.length, Object.keys(words.checks).length, output);
    for (const text of made) assert.ok(text.startsWith(`  ${words.asExpected}`), text);
    assert.deepEqual(outcome, { total: made.length, differed: 0, removed: true });
    assert.equal(exitCodeFor(outcome), 0);
    assert.ok(lines.includes(words.allAsExpected(made.length)));
    assert.equal(served.fake.hasUser(madeAddress(served)), false);
    assert.match(madeAddress(served), /^check-sign-in-[0-9a-f]{12}@sign-in-check\.test$/);
    // The burst of M10: 300 user calls on one session.
    const userCalls = served.seen.filter(
      (call) => call.method === 'GET' && call.path === '/auth/v1/user',
    );
    assert.ok(userCalls.length >= 300);
    // The person's checks come last.
    assert.deepEqual(lines.slice(-words.personChecks.length - 1), [
      words.personTitle,
      ...words.personChecks,
    ]);
    assertNothingSecret(output, served);
  } finally {
    await served.close();
  }
});

test('with the fake answering one call in another shape, that line names the call and the run fails', async () => {
  // A renewal answered 200 without its tokens: the adapter cannot read it.
  const served = await serveFake({
    reshape: (call) =>
      call.path === '/auth/v1/token?grant_type=refresh_token' &&
      JSON.parse(call.body).refresh_token.startsWith('fake-refresh-')
        ? Response.json({ token_type: 'bearer', expires_in: 3600 })
        : undefined,
  });
  try {
    const { outcome, lines, output } = await runAgainst(served);
    const differing = checkLines(lines).filter((text) => text.startsWith(`  ${words.differed}`));
    assert.deepEqual(differing, [
      words.line(words.differed, words.checks.refresh, words.answeredShape('refresh')),
      words.line(words.differed, words.checks.refreshReuse, words.notChecked),
    ]);
    assert.equal(outcome.differed, 2);
    assert.ok(lines.includes(words.someDiffered(2, outcome.total)));
    // The command then ends in failure.
    assert.equal(exitCodeFor(outcome), 1);
    // Still removed, and nothing secret printed.
    assert.equal(outcome.removed, true);
    assert.equal(served.fake.hasUser(madeAddress(served)), false);
    assertNothingSecret(output, served);
  } finally {
    await served.close();
  }
});

test('a refusal with another error code names the call, its status and the code', async () => {
  let wrongPasswords = 0;
  const served = await serveFake({
    reshape: (call, response) => {
      if (call.path !== '/auth/v1/token?grant_type=password' || response.status !== 400)
        return undefined;
      wrongPasswords += 1;
      // Only the first wrong password: the timing tries after it are answered as usual.
      return wrongPasswords === 1
        ? Response.json({ code: 'invalid_grant', message: 'no' }, { status: 400 })
        : undefined;
    },
  });
  try {
    const { outcome, lines, output } = await runAgainst(served);
    assert.equal(
      lineFor(lines, words.checks.wrongPassword),
      words.line(
        words.differed,
        words.checks.wrongPassword,
        words.refusedWith('password sign-in', 400, 'invalid_grant'),
      ),
    );
    assert.equal(outcome.differed, 1);
    assertNothingSecret(output, served);
  } finally {
    await served.close();
  }
});

test('an error code that is not a short identifier is never repeated', async () => {
  const served = await serveFake({
    reshape: (call) =>
      call.path === '/auth/v1/verify' && JSON.parse(call.body).token_hash !== undefined
        ? Response.json({ code: 'see someone@example.test now' }, { status: 403 })
        : undefined,
  });
  try {
    const { lines, output } = await runAgainst(served);
    assert.equal(
      lineFor(lines, words.checks.noCodeSent),
      words.line(
        words.differed,
        words.checks.noCodeSent,
        words.refusedWith('verify', 403, words.otherCode),
      ),
    );
    assert.doesNotMatch(output, /someone/);
  } finally {
    await served.close();
  }
});

test('the made-up user is removed even when the first answer could not be read', async () => {
  let first = true;
  const served = await serveFake({
    reshape: (call) => {
      if (call.path !== '/auth/v1/admin/generate_link' || !first) return undefined;
      first = false;
      // The fake has made the user; its answer is one our code cannot read.
      return Response.json({ properties: {} });
    },
  });
  try {
    const { outcome, lines, output } = await runAgainst(served);
    assert.equal(
      lineFor(lines, words.checks.signUpCode),
      words.line(words.differed, words.checks.signUpCode, words.answeredShape('generate_link')),
    );
    assert.equal(
      lineFor(lines, words.checks.removed),
      words.line(words.asExpected, words.checks.removed),
    );
    assert.equal(outcome.removed, true);
    assert.equal(served.fake.hasUser(madeAddress(served)), false);
    assertNothingSecret(output, served);
    // A user left behind fails the run even with every line as expected.
    assert.equal(exitCodeFor({ differed: 0, removed: false }), 1);
  } finally {
    await served.close();
  }
});

test('a refused first code made no user, so nothing is said to be left behind', async () => {
  const served = await serveFake({
    // The key is refused for every admin call, before the fake makes anything.
    setUp: (fake) =>
      fake.override('POST', '/admin/generate_link', () =>
        Response.json({ code: 'not_admin', message: 'User not allowed' }, { status: 403 }),
      ),
  });
  try {
    const { outcome, lines } = await runAgainst(served);
    assert.equal(
      lineFor(lines, words.checks.signUpCode),
      words.line(
        words.differed,
        words.checks.signUpCode,
        words.refusedWith('generate_link', 403, 'not_admin'),
      ),
    );
    assert.equal(outcome.removed, true);
    for (const text of words.notRemoved) assert.ok(!lines.includes(text));
    assert.equal(served.seen.filter((call) => call.method === 'DELETE').length, 0);
    assert.equal(served.fake.hasUser(madeAddress(served)), false);
  } finally {
    await served.close();
  }
});

test('a user made behind a refusal is still found and removed', async () => {
  let first = true;
  const served = await serveFake({
    reshape: (call) => {
      if (call.path !== '/auth/v1/admin/generate_link' || !first) return undefined;
      first = false;
      // The fake has made the user, yet the answer is a refusal.
      return Response.json({ code: 'unexpected_failure' }, { status: 422 });
    },
  });
  try {
    const { outcome, lines } = await runAgainst(served);
    assert.ok(lineFor(lines, words.checks.signUpCode).startsWith(`  ${words.differed}`));
    assert.equal(
      lineFor(lines, words.checks.removed),
      words.line(words.asExpected, words.checks.removed),
    );
    assert.equal(outcome.removed, true);
    assert.equal(served.fake.hasUser(madeAddress(served)), false);
  } finally {
    await served.close();
  }
});

test('a service that fails halfway, or a stop with Ctrl+C, still has the made-up user removed', async () => {
  // Every password change fails with a 5xx from here on.
  const down = await serveFake({
    reshape: (call) => (call.method === 'PUT' ? new Response('down', { status: 503 }) : undefined),
  });
  try {
    const { outcome, lines, output } = await runAgainst(down);
    assert.equal(
      lineFor(lines, words.checks.newPassword),
      words.line(
        words.differed,
        words.checks.newPassword,
        words.answeredFailure('user update', 503),
      ),
    );
    assert.ok(outcome.differed > 1);
    assert.equal(outcome.removed, true);
    assert.equal(down.fake.hasUser(madeAddress(down)), false);
    assertNothingSecret(output, down);
  } finally {
    await down.close();
  }

  const stop = new AbortController();
  const stopped = await serveFake({
    reshape: (call) => {
      // Ctrl+C pressed while the first password change is asked.
      if (call.method === 'PUT') stop.abort();
      return undefined;
    },
  });
  try {
    const { outcome, lines } = await runAgainst(stopped, { signal: stop.signal });
    assert.equal(
      lineFor(lines, words.checks.userBurst),
      words.line(words.differed, words.checks.userBurst, words.stoppedHere),
    );
    assert.equal(
      lineFor(lines, words.checks.removed),
      words.line(words.asExpected, words.checks.removed),
    );
    assert.equal(outcome.removed, true);
    assert.equal(stopped.fake.hasUser(madeAddress(stopped)), false);
    assert.equal(stopped.seen.filter((call) => call.method === 'PUT').length, 1);
  } finally {
    await stopped.close();
  }
});

test('a user call refused during the burst of 300 is counted and named (M10)', async () => {
  let userCalls = 0;
  const served = await serveFake({
    reshape: (call) => {
      if (call.method !== 'GET' || call.path !== '/auth/v1/user') return undefined;
      userCalls += 1;
      // Fewer than 100 user calls come before the burst: two of its calls are refused as busy.
      return userCalls % 100 === 0
        ? Response.json({ code: 'over_request_rate_limit' }, { status: 429 })
        : undefined;
    },
  });
  try {
    const { lines } = await runAgainst(served);
    const text = lineFor(lines, words.checks.userBurst);
    assert.ok(text.startsWith(`  ${words.differed}`), text);
    assert.match(
      text,
      /of 300 were not answered as expected; the first: user was refused with status 429, error code over_request_rate_limit$/,
    );
  } finally {
    await served.close();
  }
});

test('the person’s checks name the dashboard switches, the limits per network and leaked passwords', () => {
  const block = words.personChecks.join(' ');
  for (const wanted of [
    'Confirm email',
    'Secure password change',
    'Allow new sign-ups',
    'Rate Limits',
    'Leaked-password',
    'reuse interval',
    'Google',
  ]) {
    assert.ok(block.includes(wanted), wanted);
  }
});

const ref = 'abcdefghijklmnopqrst';
const ready = {
  SUPABASE_URL: 'https://made-up-test-copy.supabase.example.test',
  SUPABASE_SECRET_KEY: secretKey,
};
const choose = (overrides = {}) =>
  settingsFor({
    argv: ['--hosted'],
    env: ready,
    terminal: true,
    trackerProject: ref,
    ...overrides,
  });

test('it runs only with --hosted, at a terminal, and opens nothing otherwise', () => {
  assert.deepEqual(choose(), {
    settings: { projectUrl: ready.SUPABASE_URL, secretKey, local: false },
  });
  assert.equal(choose({ argv: [] }).exitCode, 2);
  assert.equal(choose({ argv: [] }).problems[0], words.hostedNeeded);
  assert.deepEqual(choose({ terminal: false }), { problems: [words.needsTerminal], exitCode: 2 });
  assert.equal(choose({ argv: ['--hosted', '--other'] }).exitCode, 2);
  assert.equal(choose({ argv: ['--help'] }).exitCode, 0);
});

test('it refuses the tracker’s project by the website’s own guard, and an unreadable site.json', () => {
  const tracker = choose({ env: { ...ready, SUPABASE_URL: `https://${ref}.supabase.co` } });
  assert.equal(tracker.exitCode, 2);
  assert.ok(
    tracker.problems.includes(
      "SUPABASE_URL: invalid, must not name the tracker's Supabase project (supabase/site.json)",
    ),
  );
  // Spelled another way, it is still the tracker's.
  const encoded = choose({
    env: { ...ready, SUPABASE_URL: `https://${ref.toUpperCase()}.supabase.co` },
  });
  assert.equal(encoded.exitCode, 2);
  const same = choose({ env: { ...ready, DATABASE_URL: ready.SUPABASE_URL } });
  assert.ok(
    same.problems.includes(
      "SUPABASE_URL: invalid, must not be the tracker's database (DATABASE_URL)",
    ),
  );
  const unread = choose({ trackerProject: null });
  assert.ok(
    unread.problems.some((text) => text.startsWith('supabase/site.json: could not be read')),
  );
  // The repository's own supabase/site.json, as the command reads it: compared, never opened.
  const real = trackerProjectFor(import.meta.url);
  assert.equal(typeof real, 'string');
  const live = choose({
    env: { ...ready, SUPABASE_URL: `https://${real}.supabase.co` },
    trackerProject: real,
  });
  assert.equal(live.exitCode, 2);
  for (const result of [tracker, encoded, same, unread, live]) {
    assert.equal(result.problems.at(-1), words.nothingAsked);
    for (const text of result.problems)
      assert.ok(!text.includes(secretKey) && !text.includes('://'), text);
  }
});

test('it needs both settings, a key of some length, and https unless on this computer', () => {
  const cases = [
    [{ SUPABASE_SECRET_KEY: secretKey }, words.settingMissing('SUPABASE_URL')],
    [{ SUPABASE_URL: ready.SUPABASE_URL }, words.settingMissing('SUPABASE_SECRET_KEY')],
    [{ ...ready, SUPABASE_SECRET_KEY: 'short' }, words.keyTooShort],
    [{ ...ready, SUPABASE_URL: 'not an address' }, words.notAnAddress],
    [{ ...ready, SUPABASE_URL: 'http://made-up.supabase.example.test' }, words.mustBeHttps],
    [{ ...ready, SUPABASE_URL: `${ready.SUPABASE_URL}/auth/v1` }, words.projectAddressOnly],
    [{ ...ready, SUPABASE_URL: `${ready.SUPABASE_URL}/?x=1` }, words.projectAddressOnly],
  ];
  for (const [env, problem] of cases) {
    const result = choose({ env });
    assert.equal(result.exitCode, 2, problem);
    assert.ok(result.problems.includes(problem), `${problem} in ${result.problems.join(' | ')}`);
    for (const text of result.problems) assert.ok(!text.includes(secretKey), text);
  }
  assert.deepEqual(choose({ env: { ...ready, SUPABASE_URL: 'http://127.0.0.1:54321' } }), {
    settings: { projectUrl: 'http://127.0.0.1:54321', secretKey, local: true },
  });
});

test('the command itself, not at a terminal, refuses and asks nothing of the service', async () => {
  const served = await serveFake();
  try {
    const run = spawnSync(
      process.execPath,
      ['--disable-warning=ExperimentalWarning', 'scripts/check-sign-in-service.mjs', '--hosted'],
      {
        cwd: root,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, SUPABASE_URL: served.projectUrl, SUPABASE_SECRET_KEY: secretKey },
        timeout: 30_000,
      },
    );
    assert.equal(run.status, 2, run.stderr);
    assert.equal(run.stderr.trim(), words.needsTerminal);
    assert.equal(run.stdout, '');
    assert.deepEqual(served.seen, []);
  } finally {
    await served.close();
  }
});
