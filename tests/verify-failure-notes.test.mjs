// What the gate's failure step prints on GitHub (scripts/verify-failure-rules.mjs).
import assert from 'node:assert/strict';
import test from 'node:test';
import { failureNotes, plainLines } from '../scripts/verify-failure-rules.mjs';

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
