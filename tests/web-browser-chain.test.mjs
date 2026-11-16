// The chain of the web app's browser tests (scripts/web-browser-chain.mjs, step 2.188): every
// test file is in it, the exit test first and building, the rest in alphabetical order with
// --no-build, a test's own extra arguments kept; and the runner prints the line the notes
// on GitHub read (scripts/browser-failure-rules.mjs).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  browserChain,
  extraArguments,
  isBrowserTest,
  startLine,
  stoppedLine,
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

test('a test stopped by a signal is named, in a line the notes pick out, with 128 and its number', () => {
  const file = { file: 'tests/browser/made-up-test.mjs', args: [] };
  assert.equal(stoppedLine(file, { status: 3, signal: null }), undefined);
  assert.deepEqual(stoppedLine(file, { status: null, signal: 'SIGKILL' }), {
    line: 'Killed: tests/browser/made-up-test.mjs was stopped by SIGKILL (exit code 137)',
    code: 137,
  });
  assert.deepEqual(stoppedLine(file, { status: null, signal: 'SIGTERM' }), {
    line: 'Error: tests/browser/made-up-test.mjs was stopped by SIGTERM (exit code 143)',
    code: 143,
  });
  assert.deepEqual(
    stoppedLine(file, { status: null, signal: null, error: new Error('spawn ENOMEM') }),
    {
      line: 'Error: tests/browser/made-up-test.mjs could not be run: spawn ENOMEM',
      code: 1,
    },
  );
  // As GitHub's notes read it: the test named, and the line that says what stopped it.
  const notes = browserFailureNotes(
    [
      startLine(file),
      'Made-up browser check: starting',
      stoppedLine(file, { status: null, signal: 'SIGKILL' }).line,
    ].join('\n'),
  );
  assert.ok(notes[0].includes('browser tests stopped in tests/browser/made-up-test.mjs'), notes[0]);
  assert.ok(
    notes.some((n) =>
      n.startsWith('::error title=printed::Killed: tests/browser/made-up-test.mjs'),
    ),
  );
});

/** Runs the runner on a folder of made-up tests: { status, stderr, stdout }. */
function runOn(tests, ...args) {
  fs.mkdirSync(path.join(root, '.local'), { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, '.local', 'browser-chain-test-'));
  try {
    for (const [name, source] of Object.entries(tests))
      fs.writeFileSync(path.join(dir, name), source);
    const run = spawnSync(process.execPath, ['scripts/run-web-browser-tests.mjs', ...args], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        WEB_BROWSER_TESTS_FOLDER: path.relative(root, dir).split(path.sep).join('/'),
      },
    });
    return { status: run.status, stdout: run.stdout, stderr: run.stderr, dir: path.basename(dir) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('the runner stops at the first test that fails, with its own exit code', () => {
  const run = runOn({
    'a-pass-test.mjs': "console.log('A made-up check passed.');\n",
    'b-fail-test.mjs': "console.log('Made-up check failed:');\nprocess.exit(3);\n",
    'c-never-test.mjs': "console.log('never run');\n",
  });
  assert.equal(run.status, 3);
  assert.ok(run.stderr.includes(`+ node .local/${run.dir}/b-fail-test.mjs --no-build`), run.stderr);
  assert.doesNotMatch(run.stdout + run.stderr, /never run/);
});

test('a test that kills itself stops the chain; where signals exist it is named "Killed", 137', () => {
  const run = runOn({
    'a-kill-test.mjs': "console.log('stopping myself');\nprocess.kill(process.pid, 'SIGKILL');\n",
    'b-never-test.mjs': "console.log('never run');\n",
  });
  assert.doesNotMatch(run.stdout + run.stderr, /never run/);
  if (process.platform === 'win32') {
    // Windows has no signals: a process that kills itself just ends, with exit code 1.
    assert.equal(run.status, 1);
  } else {
    assert.equal(run.status, 137);
    assert.ok(
      run.stderr.includes(
        `Killed: .local/${run.dir}/a-kill-test.mjs was stopped by SIGKILL (exit code 137)`,
      ),
      run.stderr,
    );
  }
});
