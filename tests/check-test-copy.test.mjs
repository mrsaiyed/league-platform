// The test copy check (scripts/check-test-copy.mjs, step 2.207), proved against a small
// made-up copy served over HTTP on this computer only (127.0.0.1), started in each test. It
// answers as the test copy does (do-not-index.ts, robots.txt, health.ts, the local-only
// gate of local-tools.ts, the test-copy line); each test plants one fault and sees the
// check fail on that line. Nothing else is ever contacted.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { leagueUrl } from '@srleagues/core';
import {
  actionIdIn,
  defaultLeague,
  doNotIndexMark,
  exitCodeFor,
  originOf,
  runChecks,
  settingsFor,
  testCopyLine,
} from '../scripts/check-test-copy-checks.mjs';
import * as words from '../scripts/check-test-copy.messages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const actionId = '40c0ffee'.padEnd(42, '0');
const keepOut = 'User-agent: *\nDisallow: /\n';

/**
 * A made-up test copy. Every page carries a nonce of its own and streams its data in two
 * pieces in a random order, as Next.js does; the "not found" page repeats the address's
 * last name in its data. `plant` names one fault: 'no-header' (pages without
 * X-Robots-Tag), 'kept-emails-drawn' (/signin/kept-emails answers a page of its own),
 * 'kept-emails-body' (/signin/kept-emails answers 404, as an unknown address does, but
 * with a body of its own),
 * 'no-database' (the health answer did not ask the database), 'no-line' (no test-copy
 * line), 'action-runs' (the posted action answers otherwise than an unknown address),
 * 'redirect-away' (the front page sends the browser to another host), 'slow' (the health
 * answer never comes).
 */
async function serveCopy(plant) {
  const seen = [];
  const server = createServer(async (request, reply) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');
    const url = new URL(request.url, 'http://127.0.0.1');
    seen.push({ method: request.method, path: url.pathname, body });
    const nonce = randomBytes(12).toString('base64');
    const headers = {
      'Content-Security-Policy': `script-src 'self' 'nonce-${nonce}'`,
      // A host's own header, new for every answer: never compared.
      'X-Request-Id': randomBytes(8).toString('hex'),
      ...(plant === 'no-header' &&
      url.pathname !== '/robots.txt' &&
      url.pathname !== '/api/v1/health'
        ? {}
        : { 'X-Robots-Tag': 'noindex' }),
    };
    const page = (status, main, data) => {
      const pieces = [`0:${JSON.stringify(data)}\n`, `1:["$","main",null,{}]\n`];
      if (Math.random() < 0.5) pieces.reverse();
      const scripts = pieces
        .map((piece) => `<script>self.__next_f.push([1,${JSON.stringify(piece)}])</script>`)
        .join('');
      reply.writeHead(status, { ...headers, 'Content-Type': 'text/html; charset=utf-8' });
      reply.end(
        `<!DOCTYPE html><html><head>${doNotIndexMark}<script nonce="${nonce}" src="/_next/a.js"></script></head>` +
          `<body>${main}${scripts}</body></html>`,
      );
    };
    const line =
      plant === 'no-line' ? '' : `<p class="ui-notice" data-test-copy="">${testCopyLine}</p>`;
    const notFound = () =>
      page(404, '<h1>Not found</h1>', ['missing', url.pathname.split('/').at(-1), 'c']);

    if (url.pathname === '/api/v1/health') {
      if (plant === 'slow') return;
      const database = plant === 'no-database' ? 'none' : 'ok';
      reply.writeHead(200, { ...headers, 'Content-Type': 'application/json' });
      reply.end(
        JSON.stringify({
          status: 'ok',
          app: 'web',
          checks: { startup: 'ok', database },
          time: new Date().toISOString(),
        }),
      );
      return;
    }
    if (url.pathname === '/robots.txt') {
      reply.writeHead(200, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
      reply.end(keepOut);
      return;
    }
    if (request.method === 'POST') {
      if (plant === 'action-runs' && url.pathname === '/signin/made-up-people') {
        reply.writeHead(303, { ...headers, Location: '/' });
        reply.end();
        return;
      }
      notFound();
      return;
    }
    if (url.pathname === '/') {
      if (plant === 'redirect-away') {
        reply.writeHead(307, { ...headers, Location: 'http://example.test/' });
        reply.end();
        return;
      }
      page(200, `<h1>Leagues</h1>${line}`, ['home']);
      return;
    }
    if (url.pathname === '/signin') {
      page(200, `${line}<form></form>`, ['signin']);
      return;
    }
    if (url.pathname === '/signin/kept-emails' && plant === 'kept-emails-drawn') {
      page(200, '<h1>Kept emails</h1>', ['kept']);
      return;
    }
    if (url.pathname === '/signin/kept-emails' && plant === 'kept-emails-body') {
      // The same status as an unknown address, and the same data, but one line more.
      page(404, '<h1>Not found</h1><p>Kept emails</p>', [
        'missing',
        url.pathname.split('/').at(-1),
        'c',
      ]);
      return;
    }
    notFound();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    seen,
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}

async function checkCopy(plant, options = {}) {
  const served = await serveCopy(plant);
  try {
    const lines = [];
    const outcome = await runChecks({
      origin: served.origin,
      actionId,
      leagueAddress: leagueUrl({ slug: defaultLeague }, 'home'),
      fetch: globalThis.fetch,
      print: (text) => lines.push(text),
      ...options,
    });
    return { outcome, lines, output: lines.join('\n'), seen: served.seen };
  } finally {
    await served.close();
  }
}

const lineOf = (lines, label) => lines.find((text) => text.includes(label));
const failedOnly = (outcome, labels) => {
  assert.deepEqual(outcome.failed, labels);
  assert.equal(exitCodeFor(outcome), 1);
};

test('against a copy that answers rightly, every line passes and the run exits 0', async () => {
  const { outcome, lines, output, seen } = await checkCopy();
  assert.equal(outcome.total, Object.keys(words.checks).length, output);
  assert.deepEqual(outcome.failed, [], output);
  assert.equal(exitCodeFor(outcome), 0);
  for (const label of Object.values(words.checks)) {
    assert.ok(lineOf(lines, label)?.startsWith(`  ${words.passed}`), `${label}\n${output}`);
  }
  assert.ok(lines.includes(words.allPassed(outcome.total)));
  // Read-only: GET requests, and the one form posted twice, for a person no copy has.
  const posts = seen.filter((request) => request.method !== 'GET');
  assert.deepEqual(
    posts.map((request) => `${request.method} ${request.path}`),
    ['POST /signin/made-up-people', 'POST /signin/no-such-page'],
  );
  for (const post of posts) {
    assert.ok(post.body.includes(`$ACTION_ID_${actionId}`));
    assert.ok(post.body.includes('no-such-made-up-person'));
  }
  // The made-up league was read at its address.
  assert.ok(seen.some((request) => request.path === `/${defaultLeague}`));
});

test('a planted build without the "do not index" header fails, on every page it read (the plan’s done test)', async () => {
  const { outcome, lines } = await checkCopy('no-header');
  failedOnly(outcome, [
    words.checks.frontPage,
    words.checks.signIn,
    words.checks.league,
    words.checks.missing,
  ]);
  assert.equal(
    lineOf(lines, words.checks.frontPage),
    words.line(words.failed, words.checks.frontPage, words.pageSeen(200, null, true)),
  );
  assert.ok(lines.includes(words.someFailed(4, outcome.total)));
  assert.ok(lines.includes(words.failedItem(words.checks.missing)));
});

test('a copy whose /signin/kept-emails answers otherwise than /signin/no-such-page fails', async () => {
  const { outcome, lines } = await checkCopy('kept-emails-drawn');
  failedOnly(outcome, [words.checks.keptEmails]);
  assert.equal(
    lineOf(lines, words.checks.keptEmails),
    words.line(words.failed, words.checks.keptEmails, words.statusDiffers(200, 404)),
  );
});

test('a copy whose /signin/kept-emails answers 404 with a body of its own fails: the bodies are compared, not only the statuses', async () => {
  const { outcome, lines, output } = await checkCopy('kept-emails-body');
  failedOnly(outcome, [words.checks.keptEmails]);
  const line = lineOf(lines, words.checks.keptEmails);
  assert.ok(line.startsWith(`  ${words.failed}`), output);
  assert.match(line, /the body differs from character \d+ \(\d+ \/ \d+ characters\)/);
});

test('a posted "be this person" form answered otherwise fails; without the action’s id it is not checked and fails', async () => {
  const runs = await checkCopy('action-runs');
  failedOnly(runs.outcome, [words.checks.beThisPerson]);
  const without = await checkCopy(undefined, { actionId: undefined });
  failedOnly(without.outcome, [words.checks.beThisPerson]);
  assert.equal(
    lineOf(without.lines, words.checks.beThisPerson),
    words.line(words.failed, words.checks.beThisPerson, words.noActionId),
  );
  assert.ok(without.seen.every((request) => request.method === 'GET'));
});

test('with --without-action the "be this person" line is NOT CHECKED, says why, here and in the summary, and fails nothing', async () => {
  const run = await checkCopy(undefined, { actionId: undefined, withoutAction: true });
  assert.deepEqual(run.outcome.failed, [], run.output);
  assert.deepEqual(run.outcome.notChecked, [words.checks.beThisPerson]);
  assert.equal(exitCodeFor(run.outcome), 0);
  assert.equal(
    lineOf(run.lines, words.checks.beThisPerson),
    words.line(words.notChecked, words.checks.beThisPerson, words.withoutActionReason),
  );
  assert.ok(run.lines.includes(words.passedBut(run.outcome.total - 1)), run.output);
  assert.ok(run.lines.includes(words.notCheckedSummary(1)));
  assert.ok(run.lines.includes(words.notCheckedItem(words.checks.beThisPerson)));
  assert.ok(run.seen.every((request) => request.method === 'GET'));
  // Another failure still fails the run.
  const planted = await checkCopy('no-header', { actionId: undefined, withoutAction: true });
  assert.equal(exitCodeFor(planted.outcome), 1);
  // The flag is read, and refused beside an id.
  const flag = settingsFor({ argv: ['https://a.example.test', '--without-action'] });
  assert.equal(flag.settings.withoutAction, true);
  assert.equal(
    settingsFor({
      argv: ['https://a.example.test', '--without-action', '--action-id', actionId],
    }).problems[0],
    words.withoutActionAndId,
  );
});

test('a health answer that did not ask the database fails', async () => {
  const { outcome, lines } = await checkCopy('no-database');
  failedOnly(outcome, [words.checks.health]);
  assert.equal(
    lineOf(lines, words.checks.health),
    words.line(words.failed, words.checks.health, words.healthSeen(200, 'none')),
  );
});

test('a copy without the test-copy line fails', async () => {
  const { outcome, lines } = await checkCopy('no-line');
  failedOnly(outcome, [words.checks.testCopyLine]);
  assert.equal(
    lineOf(lines, words.checks.testCopyLine),
    words.line(
      words.failed,
      words.checks.testCopyLine,
      words.lineSeen([words.pageNames.frontPage, words.pageNames.signIn]),
    ),
  );
});

test('a redirect to another host is not followed, and an answer that never comes fails in time', async () => {
  const away = await checkCopy('redirect-away');
  assert.equal(
    lineOf(away.lines, words.checks.frontPage),
    words.line(words.failed, words.checks.frontPage, words.otherHost),
  );
  assert.ok(away.outcome.failed.includes(words.checks.frontPage));
  const slow = await checkCopy('slow', { timeoutMs: 200 });
  assert.equal(
    lineOf(slow.lines, words.checks.health),
    words.line(words.failed, words.checks.health, words.noAnswerInTime),
  );
  failedOnly(slow.outcome, [words.checks.health]);
});

test('it takes https, or plain http only to this computer, with nothing after the address', () => {
  for (const [text, origin] of [
    ['https://test-copy.example.test', 'https://test-copy.example.test'],
    ['https://test-copy.example.test/', 'https://test-copy.example.test'],
    ['https://test-copy.example.test:8443', 'https://test-copy.example.test:8443'],
    ['http://localhost:3000', 'http://localhost:3000'],
    ['http://127.0.0.1:3000/', 'http://127.0.0.1:3000'],
  ]) {
    assert.equal(originOf(text), origin, text);
  }
  for (const text of [
    'http://test-copy.example.test',
    'http://10.0.0.5:3000',
    'http://localhost.example.test',
    'ftp://localhost',
    'https://test-copy.example.test/signin',
    'https://test-copy.example.test/?x=1',
    'https://test-copy.example.test/?',
    'https://test-copy.example.test/#top',
    'https://someone@test-copy.example.test',
    'not an address',
  ]) {
    assert.equal(originOf(text), undefined, text);
    assert.deepEqual(settingsFor({ argv: [text] }), {
      problems: [words.addressForm],
      exitCode: 2,
    });
  }
  assert.deepEqual(settingsFor({ argv: [] }), { problems: [words.addressMissing], exitCode: 2 });
  assert.equal(settingsFor({ argv: ['--help'] }).exitCode, 0);
  assert.equal(settingsFor({ argv: ['https://a.example.test', '--other'] }).exitCode, 2);
  assert.equal(
    settingsFor({ argv: ['https://a.example.test', '--action-id', 'not hex!'] }).problems[0],
    words.actionIdForm,
  );
  assert.equal(
    settingsFor({ argv: ['https://a.example.test', '--league', '../x'] }).problems[0],
    words.leagueForm,
  );
});

test('the action’s id is read from a build’s manifest, or given', () => {
  const manifest = JSON.stringify({
    node: {
      ['ab'.repeat(21)]: { exportedName: 'otherAction' },
      [actionId]: { exportedName: 'beMadeUpPersonAction' },
    },
    edge: {},
  });
  assert.equal(actionIdIn(manifest), actionId);
  const read = settingsFor({
    argv: ['http://127.0.0.1:3000', '--manifest', 'made-up/manifest.json'],
    readFile: () => manifest,
  });
  assert.deepEqual(read, {
    settings: {
      origin: 'http://127.0.0.1:3000',
      actionId,
      leagueAddress: `/${defaultLeague}`,
      withoutAction: false,
    },
  });
  assert.equal(
    settingsFor({ argv: ['http://127.0.0.1:3000', '--manifest', 'x'], readFile: () => '{}' })
      .problems[0],
    words.manifestUnread,
  );
  assert.equal(
    settingsFor({
      argv: ['http://127.0.0.1:3000', '--manifest', 'x', '--action-id', actionId],
      readFile: () => manifest,
    }).problems[0],
    words.bothGiven,
  );
  assert.equal(
    settingsFor({ argv: ['http://127.0.0.1:3000', '--action-id', actionId] }).settings.actionId,
    actionId,
  );
});

/** Runs the command itself; its exit code and output. */
function command(args) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['--disable-warning=ExperimentalWarning', 'scripts/check-test-copy.mjs', ...args],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

test('the command refuses an http address that is not this computer, and asks nothing', async () => {
  const run = await command(['http://test-copy.example.test']);
  assert.equal(run.status, 2, run.stderr);
  assert.equal(run.stderr.trim(), words.addressForm);
  assert.equal(run.stdout, '');
});

test('the command exits 0 against a right copy and 1 against a planted one', async () => {
  for (const [plant, status] of [
    [undefined, 0],
    ['no-header', 1],
  ]) {
    const served = await serveCopy(plant);
    try {
      const run = await command([served.origin, '--action-id', actionId]);
      assert.equal(run.status, status, run.stdout + run.stderr);
      assert.ok(run.stdout.includes(words.title));
    } finally {
      await served.close();
    }
  }
});
