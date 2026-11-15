// What the browser stage's failure step prints on GitHub (scripts/browser-failure-rules.mjs),
// on made-up output shaped like the real chain's: bash's trace line before each test, the
// test's own list of failed checks, and the last lines of a Next.js run that did not finish
// well (tests/browser/web-browser-kit.mjs, sayOnFailure).
import assert from 'node:assert/strict';
import test from 'node:test';
import { browserFailureNotes } from '../scripts/browser-failure-rules.mjs';

const decode = (text) => text.replace(/%0A/g, '\n').replace(/%0D/g, '\r').replace(/%25/g, '%');
const titled = (notes, title) =>
  notes
    .filter((note) => note.startsWith(`::error title=${title}::`))
    .map((note) => decode(note.slice(`::error title=${title}::`.length)));
const lastLines = (notes) => {
  const tail = notes.find((note) => /^::error title=the last \d+ lines::/.test(note)) ?? '';
  return decode(tail.split('::').slice(2).join('::')).split('\n');
};
const machine = [
  ['browser', 'Chromium 140.0.0.0'],
  ['time zone', 'UTC (UTC+00:00; TZ not set)'],
  ['time (UTC)', '2026-11-15T11:40:19.000Z'],
];
/**
 * The heading sayOnFailure prints above a Next.js run's last lines, built as it builds it, so
 * the scan of starters (tests/web-listen.test.mjs) does not read a made-up line as one.
 */
const lastOf = (count, command, how) =>
  `The last ${count} lines \`next ${command}\` printed (${how}):`;
const chain = [
  '> league-platform@0.1.0 test:web:browser',
  '> node tests/browser/web-exit-test.mjs && node tests/browser/made-up-test.mjs --no-build',
  '',
];

test('a failing check: the file, the check and the machine are named', () => {
  const notes = browserFailureNotes(
    [
      ...chain,
      '+ node tests/browser/web-exit-test.mjs',
      'Browser exit-test check passed: 212 checks in a real browser.',
      '+ node tests/browser/made-up-test.mjs --no-build',
      'Made-up browser check failed:',
      '  the made-up league home shows its name',
      '  accessibility: the made-up league home: low contrast 2.10:1 in "Made-up"',
      lastOf(2, 'start', 'the test had stopped it'),
      '  | ▲ Next.js 15.0.0',
      '  | ✓ Ready in 300ms',
    ].join('\n'),
    machine,
  );
  assert.ok(notes.length <= 9, 'GitHub keeps at most ten error annotations per step');
  assert.ok(notes.every((note) => note.startsWith('::error title=')));
  assert.deepEqual(titled(notes, 'browser tests stopped in tests/browser/made-up-test.mjs'), [
    'node tests/browser/made-up-test.mjs --no-build\nMade-up browser check failed:',
  ]);
  assert.deepEqual(titled(notes, 'failed check'), [
    'the made-up league home shows its name',
    'accessibility: the made-up league home: low contrast 2.10:1 in "Made-up"',
  ]);
  const tail = lastLines(notes);
  assert.equal(tail[0], 'Made-up browser check failed:', "only the stopped test's own lines");
  assert.equal(tail.at(-1), '  | ✓ Ready in 300ms');
  assert.deepEqual(titled(notes, 'the machine'), [
    'browser: Chromium 140.0.0.0\ntime zone: UTC (UTC+00:00; TZ not set)\ntime (UTC): 2026-11-15T11:40:19.000Z',
  ]);
});

test('a build that fails before any check: its own error is named', () => {
  const notes = browserFailureNotes(
    [
      ...chain,
      '+ node tests/browser/web-exit-test.mjs',
      'Browser exit-test check failed:',
      '  building the web app: next build failed or took over 10 minutes',
      lastOf(4, 'build', 'it ended with code 1'),
      '  |    ▲ Next.js 15.0.0',
      '  | Failed to compile.',
      "  | ./src/server/made-up.ts:3:1 Module not found: Can't resolve './Made-Up-Name'",
      '  | > Build failed because of webpack errors',
    ].join('\n'),
  );
  assert.match(
    notes[0],
    /^::error title=browser tests stopped in tests\/browser\/web-exit-test\.mjs::/,
  );
  assert.deepEqual(titled(notes, 'failed check'), [
    'building the web app: next build failed or took over 10 minutes',
  ]);
  assert.deepEqual(titled(notes, 'printed'), [
    'Failed to compile.',
    "./src/server/made-up.ts:3:1 Module not found: Can't resolve './Made-Up-Name'",
  ]);
  assert.equal(lastLines(notes).at(-1), '  | > Build failed because of webpack errors');
  assert.equal(titled(notes, 'the machine').length, 0, 'no machine given, none shown');
});

test('a server that never answers: the server is named, with what it printed', () => {
  const notes = browserFailureNotes(
    [
      ...chain,
      '+ node tests/browser/web-exit-test.mjs',
      'Browser exit-test check passed: 212 checks in a real browser.',
      '+ node tests/browser/made-up-test.mjs --no-build',
      'Made-up browser check failed:',
      '  starting the server and the browser: the server did not answer within 90 seconds:',
      lastOf(2, 'start', 'it ended with code 1'),
      '  | Error: listen EADDRINUSE: address already in use :::3000',
      '  |     at Server.setupListenHandle (node:net:1908:16)',
    ].join('\n'),
  );
  assert.deepEqual(titled(notes, 'failed check'), [
    'starting the server and the browser: the server did not answer within 90 seconds:',
  ]);
  assert.deepEqual(titled(notes, 'printed'), [
    'Error: listen EADDRINUSE: address already in use :::3000',
  ]);
});

test('a test that times out: the wait that ran out is named, and long lists are cut', () => {
  const many = Array.from(
    { length: 9 },
    (_, i) => `  made-up part ${i}: page.goto: Timeout 30000ms exceeded.`,
  );
  const notes = browserFailureNotes(
    [
      ...chain,
      '+ node tests/browser/web-exit-test.mjs',
      'Browser exit-test check failed:',
      '  a play shows on the second screen: locator.waitFor: Timeout 10000ms exceeded.',
      ...many,
    ].join('\n'),
  );
  const failed = titled(notes, 'failed check');
  assert.equal(
    failed[0],
    'a play shows on the second screen: locator.waitFor: Timeout 10000ms exceeded.',
  );
  assert.equal(failed.length, 5);
  assert.deepEqual(titled(notes, 'more'), ['5 more failing checks or errors; see the last lines.']);
  assert.ok(notes.length <= 9);
});

test('a check listed with "- " is not named a second time as an error', () => {
  // The shape GitHub printed for lane 2.127 on 2026-11-15 (step 2.178, try 1).
  const notes = browserFailureNotes(
    [
      ...chain,
      '+ node tests/browser/made-up-test.mjs --no-build',
      'Made-up browser test failed:',
      '- with plays waiting, signing out asks first: locator.waitFor: Timeout 30000ms exceeded.',
      lastOf(1, 'start', 'the test had stopped it'),
      '  | ✓ Ready in 123ms',
    ].join('\n'),
  );
  assert.deepEqual(titled(notes, 'failed check'), [
    'with plays waiting, signing out asks first: locator.waitFor: Timeout 30000ms exceeded.',
  ]);
  assert.deepEqual(titled(notes, 'printed'), []);
});

test('a test that counts its problems is read the same way', () => {
  // The shape GitHub printed for lane 2.35 on 2026-11-15 (step 2.178, try 2).
  const notes = browserFailureNotes(
    [
      ...chain,
      '+ node tests/browser/made-up-test.mjs --no-build',
      'Made-up screen browser test: 2 problem(s)',
      '  - the made-up phone: locator.waitFor: Timeout 30000ms exceeded.',
      '  - the four made-up sizes: locator.waitFor: Timeout 30000ms exceeded.',
      '▲ Next.js 16.0.0',
    ].join('\n'),
  );
  assert.match(
    decode(notes[0]),
    /made-up-test\.mjs --no-build\nMade-up screen browser test: 2 problem\(s\)$/,
  );
  assert.deepEqual(titled(notes, 'failed check'), [
    'the made-up phone: locator.waitFor: Timeout 30000ms exceeded.',
    'the four made-up sizes: locator.waitFor: Timeout 30000ms exceeded.',
  ]);
  assert.deepEqual(titled(notes, 'printed'), []);
});

test('with no trace line and no list, it says so and still shows how the output ended', () => {
  const notes = browserFailureNotes('Killed\n');
  assert.equal(
    notes[0],
    '::error title=browser tests stopped::bash named no test file before it stopped.%0AIt printed no list of failed checks: see its last lines.',
  );
  assert.deepEqual(titled(notes, 'printed'), ['Killed']);
  assert.deepEqual(lastLines(notes), ['Killed']);
});
