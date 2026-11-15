// What the gate's failure steps print on GitHub (scripts/verify-failure-rules.mjs, and
// scripts/verify-failure-notes.mjs, which prints them).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  browserFailureNotes,
  chainSteps,
  failureNotes,
  plainLines,
} from '../scripts/verify-failure-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const output = [
  '> league-platform@0.1.0 verify',
  '> npm run check && npm run test:units',
  '',
  '> league-platform@0.1.0 test:units',
  '> vitest run',
  '',
  ' \x1b[32m✓\x1b[39m packages/core/src/made-up.test.ts (3 tests) 20ms',
  ' \x1b[31m×\x1b[39m packages/database/src/made-up.test.ts > reads a made-up backup 180002ms',
  '   → Test timed out in 180000ms.',
  ' FAIL  packages/database/src/made-up.test.ts > reads a made-up backup',
  'Error: the made-up folder could not be read',
  ' ❯ packages/database/src/made-up.test.ts:12:3',
  'progress 1/2\rprogress 2/2',
  ' Test Files  1 failed | 1 passed (2)',
  '      Tests  1 failed | 3 passed (4)',
].join('\n');

const decode = (text) => text.replace(/%0A/g, '\n').replace(/%0D/g, '\r').replace(/%25/g, '%');

test('the notes name the stage that stopped, what failed, and how the output ended', () => {
  const notes = failureNotes(output);
  assert.ok(notes.length <= 9, 'GitHub keeps at most ten error annotations per step');
  assert.ok(notes.every((note) => note.startsWith('::error title=')));
  assert.equal(
    notes[0],
    '::error title=verify stopped during test%3Aunits::> league-platform@0.1.0 test:units',
  );
  const failed = notes.filter((note) => note.startsWith('::error title=failed::'));
  assert.deepEqual(
    failed.map((note) => note.slice('::error title=failed::'.length)),
    [
      '× packages/database/src/made-up.test.ts > reads a made-up backup 180002ms',
      '→ Test timed out in 180000ms.',
      'FAIL  packages/database/src/made-up.test.ts > reads a made-up backup',
      'Test Files  1 failed | 1 passed (2)',
      'Tests  1 failed | 3 passed (4)',
      'Error: the made-up folder could not be read | ❯ packages/database/src/made-up.test.ts:12:3',
    ],
  );
  const tail = notes.at(-1);
  // Every line that is not blank: fewer than fifteen here.
  assert.match(tail, /^::error title=the last 13 lines::/);
  const lines = decode(tail.split('::').slice(2).join('::')).split('\n');
  assert.equal(lines.length, 13);
  assert.equal(lines.at(-1), '      Tests  1 failed | 3 passed (4)');
  assert.ok(lines.includes('progress 2/2'));
  assert.ok(!notes.join('\n').includes('\x1b'), 'no colour codes');
});

test('many failures are cut short, and long lines too', () => {
  const lines = Array.from(
    { length: 30 },
    (_, i) => ` FAIL  made-up-${i}.test.ts ${'x'.repeat(400)}`,
  );
  const notes = failureNotes(lines.join('\n'));
  const failed = notes.filter((note) => note.startsWith('::error title=failed::'));
  assert.equal(failed.length, 7);
  assert.match(failed[6], /24 more lines name failures; see the log\./);
  assert.ok(failed[0].length < 360);
  assert.ok(notes.length <= 9);
  assert.equal(notes[0], '::error title=verify stopped::npm printed no stage before it stopped.');
});

test('a line redrawn in place keeps only its last state', () => {
  assert.deepEqual(plainLines('a\r b\r c\nd'), [' c', 'd']);
});

test("a repository check's own failure and Node's refusal of a file are named", () => {
  // The words GitHub printed when the web shell check failed (step 2.149).
  const notes = failureNotes(
    [
      '> league-platform@0.1.0 test:web',
      '> node scripts/check-web-shell.mjs',
      'Web shell check failed:',
      '  staging refused to start without saying why:',
      '✓ Ready in 65ms',
      'TypeScript parameter property is not supported in strip-only mode',
      '  The file Node refused:',
      '    packages/database/src/made-up.ts:10 [NODE-TS] Node refuses this file',
    ].join('\n'),
  );
  assert.equal(
    notes[0],
    '::error title=verify stopped during test%3Aweb::> league-platform@0.1.0 test:web',
  );
  assert.deepEqual(
    notes.filter((note) => note.startsWith('::error title=failed::')).map((note) => note.slice(22)),
    [
      'Web shell check failed:',
      'TypeScript parameter property is not supported in strip-only mode',
      'packages/database/src/made-up.ts:10 [NODE-TS] Node refuses this file',
    ],
  );
});

// The web app's browser tests, as ci.yml runs them: each test of package.json's chain under
// its own `::group::` heading (step 2.152, review 2). Made-up output throughout.
const browserOutput = [
  '::group::node tests/browser/web-exit-test.mjs',
  'Browser exit-test check passed: 120 checks in a real browser.',
  '::endgroup::',
  '::group::node tests/browser/tracker-route-test.mjs --no-build',
  'Tracker route browser test passed (40 checks).',
  '::endgroup::',
  '::group::node tests/browser/one-world-test.mjs --no-build',
  '\x1b[33mwarn\x1b[39m made-up server line',
  'One made-up world browser test failed:',
  '  the visitor sees the record "1-1", not "2-0"',
  '  the stats page shows no PTS for Robin Ashgrove',
].join('\n');

test('a failed browser test is named by its file, with its failing check and last lines', () => {
  const notes = browserFailureNotes(browserOutput);
  assert.ok(notes.length <= 9, 'GitHub keeps at most ten error annotations per step');
  assert.equal(
    notes[0],
    '::error title=web browser test failed%3A tests/browser/one-world-test.mjs::node tests/browser/one-world-test.mjs --no-build',
  );
  assert.deepEqual(
    notes.filter((note) => note.startsWith('::error title=failed::')).map((note) => note.slice(22)),
    [
      'One made-up world browser test failed:',
      'the visitor sees the record "1-1", not "2-0"',
      'the stats page shows no PTS for Robin Ashgrove',
    ],
  );
  const tail = notes.at(-1);
  assert.match(tail, /^::error title=the last 4 lines of tests\/browser\/one-world-test\.mjs::/);
  const lines = decode(tail.split('::').slice(2).join('::')).split('\n');
  // Only the failing test's own lines: none of the tests that passed before it.
  assert.equal(lines[0], 'warn made-up server line');
  assert.equal(lines.at(-1), '  the stats page shows no PTS for Robin Ashgrove');
  assert.ok(!notes.join('\n').includes('passed'));
});

test('a browser test that stopped by throwing is named, with the error and its next line', () => {
  const notes = browserFailureNotes(
    [
      '::group::node tests/browser/web-exit-test.mjs',
      'Browser exit-test check passed: 120 checks in a real browser.',
      '::endgroup::',
      '::group::node tests/browser/live-game-test.mjs --no-build',
      'file:///made-up/tests/browser/web-browser-kit.mjs:54',
      'Error: the server stopped:',
      '    at waitFor (file:///made-up/tests/browser/web-browser-kit.mjs:54:51)',
    ].join('\n'),
  );
  assert.match(notes[0], /web browser test failed%3A tests\/browser\/live-game-test\.mjs::/);
  assert.deepEqual(
    notes.filter((note) => note.startsWith('::error title=failed::')).map((note) => note.slice(22)),
    [
      'Error: the server stopped: | at waitFor (file:///made-up/tests/browser/web-browser-kit.mjs:54:51)',
    ],
  );
});

test('when no browser test started, the notes say so and give the last lines', () => {
  const notes = browserFailureNotes('npm warn made-up\nsomething went wrong');
  assert.equal(notes[0], '::error title=web browser tests stopped::No browser test had started.');
  assert.match(notes[1], /^::error title=the last 2 lines::/);
});

test("the chain is read from package.json's own script, and only as node tests joined by &&", () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const steps = chainSteps(scripts['test:web:browser']);
  assert.equal(steps.join(' && '), scripts['test:web:browser']);
  assert.equal(steps[0], 'node tests/browser/web-exit-test.mjs');
  assert.ok(steps.every((step) => /^node tests\/browser\/[\w-]+\.mjs( --no-build)?$/.test(step)));
  for (const refused of ['node a.mjs || node b.mjs', 'node a.mjs; rm -rf x', 'npm test', '']) {
    assert.throws(() => chainSteps(refused), /not a chain/, refused);
  }
});

test('the notes script prints the chain, and the notes from a made-up output file', () => {
  const notesScript = path.join(root, 'scripts', 'verify-failure-notes.mjs');
  const listed = spawnSync(process.execPath, [notesScript, '--steps', 'test:web:browser'], {
    encoding: 'utf8',
  });
  assert.equal(listed.status, 0);
  const { scripts } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(listed.stdout.trim().split(/\r?\n/).join(' && '), scripts['test:web:browser']);

  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-notes-'));
  try {
    const file = path.join(folder, 'web-browser-output.txt');
    fs.writeFileSync(file, browserOutput);
    const printed = spawnSync(process.execPath, [notesScript, '--web-browser', file], {
      encoding: 'utf8',
    });
    assert.equal(printed.status, 0);
    assert.deepEqual(printed.stdout.trim().split(/\r?\n/), browserFailureNotes(browserOutput));
    const missing = spawnSync(
      process.execPath,
      [notesScript, '--web-browser', path.join(folder, 'none.txt')],
      { encoding: 'utf8' },
    );
    assert.match(missing.stdout, /^::error title=the web app's browser tests stopped::/);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
