// The chain of the web app's browser tests (scripts/web-browser-chain.mjs, step 2.188): every
// test file is in it, the exit test first and building, the rest in alphabetical order with
// --no-build, a test's own extra arguments kept; and the runner prints the line the notes
// on GitHub read (scripts/browser-failure-rules.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  browserChain,
  extraArguments,
  isBrowserTest,
  startLine,
} from '../scripts/web-browser-chain.mjs';
import { browserFailureNotes } from '../scripts/browser-failure-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'tests/browser');
const read = (name) => fs.readFileSync(path.join(folder, name), 'utf8');

test('the chain is every test file in tests/browser: the exit test first, then alphabetical', () => {
  const names = fs.readdirSync(folder);
  const chain = browserChain(names, read);
  const files = chain.map((t) => t.file.replace('tests/browser/', ''));
  assert.deepEqual(new Set(files), new Set(names.filter((n) => n.endsWith('-test.mjs'))));
  assert.equal(files[0], 'web-exit-test.mjs');
  assert.deepEqual(files.slice(1), [...files.slice(1)].sort());
  assert.ok(files.length >= 16, 'the sixteen tests of step 2.188 at least');
  // The helpers are not tests.
  assert.ok(!files.includes('web-browser-kit.mjs') && !files.includes('tracker-driver.mjs'));
  // The first builds; every other serves its build.
  assert.deepEqual(chain[0].args, []);
  for (const t of chain.slice(1)) assert.equal(t.args[0], '--no-build', t.file);
});

test('only files named "<name>-test.mjs" are tests', () => {
  for (const name of ['rounds-test.mjs', 'web-exit-test.mjs', 'a-b-c-test.mjs'])
    assert.ok(isBrowserTest(name), name);
  for (const name of [
    'web-browser-kit.mjs',
    'tracker-driver.mjs',
    'rounds-test.mjs.bak',
    'test.mjs',
    'Old-test.mjs',
  ])
    assert.ok(!isBrowserTest(name), name);
});

test("a test's own extra arguments come from its own line, after --no-build", () => {
  const files = {
    'web-exit-test.mjs': '// the exit test\n',
    'b-test.mjs': '// B\n// In the browser chain: --now=2026-11-16T18:00:00Z --dev\nconst x = 1;\n',
    'a-test.mjs': '// A\n',
    'kit.mjs': '',
  };
  assert.deepEqual(extraArguments(files['b-test.mjs']), ['--now=2026-11-16T18:00:00Z', '--dev']);
  assert.deepEqual(
    browserChain(Object.keys(files), (n) => files[n]),
    [
      { file: 'tests/browser/web-exit-test.mjs', args: [] },
      { file: 'tests/browser/a-test.mjs', args: ['--no-build'] },
      {
        file: 'tests/browser/b-test.mjs',
        args: ['--no-build', '--now=2026-11-16T18:00:00Z', '--dev'],
      },
    ],
  );
  // Named tests only: the first of them builds.
  assert.deepEqual(
    browserChain(Object.keys(files), (n) => files[n], ['b-test', 'a-test.mjs']).map((t) => t.args),
    [[], ['--no-build', '--now=2026-11-16T18:00:00Z', '--dev']],
  );
});

test('the line printed before a test is the one the notes on GitHub name the test by', () => {
  const chain = browserChain(['web-exit-test.mjs', 'made-up-test.mjs'], () => '');
  assert.deepEqual(chain.map(startLine), [
    '+ node tests/browser/web-exit-test.mjs',
    '+ node tests/browser/made-up-test.mjs --no-build',
  ]);
  const notes = browserFailureNotes(
    [
      '> league-platform@0.1.0 test:web:browser',
      '> node scripts/run-web-browser-tests.mjs',
      '',
      startLine(chain[0]),
      'Browser exit-test check passed: 212 checks in a real browser.',
      startLine(chain[1]),
      'Made-up browser check failed:',
      '  the made-up league home shows its name',
    ].join('\n'),
  );
  assert.ok(
    notes[0].startsWith('::error title=browser tests stopped in tests/browser/made-up-test.mjs'),
    notes[0],
  );
  assert.ok(notes.some((n) => n.includes('the made-up league home shows its name')));
});
