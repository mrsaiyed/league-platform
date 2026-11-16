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
  folderProblems,
  HELPERS,
  inGroup,
  isBrowserTest,
  parseGroup,
  startLine,
  stoppedLine,
} from '../scripts/web-browser-chain.mjs';
import { browserFailureNotes } from '../scripts/browser-failure-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'tests/browser');
const read = (name) => fs.readFileSync(path.join(folder, name), 'utf8');
/** How a made-up test ends, as every real one does. */
const ends = 'process.exitCode = 0;\n';

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

test('a file that is neither a test nor a listed helper, or a test that does not run, stops the chain', () => {
  // The real folder: only tests and the listed helpers, every test a real run.
  assert.deepEqual(folderProblems(fs.readdirSync(folder), read), []);
  assert.deepEqual(HELPERS, ['tracker-driver.mjs', 'web-browser-kit.mjs']);
  const files = {
    'web-exit-test.mjs': ends,
    'rounds.test.mjs': ends,
    'notes.txt': 'notes',
    'kit-test.mjs': `export const lent = 1;\n${ends}`,
    'quiet-test.mjs': "// process.exit(1) only in a comment\nconsole.log('passed');\n",
    'tracker-driver.mjs': 'export const driver = 1;\n',
  };
  const read2 = (n) => files[n];
  assert.deepEqual(folderProblems(Object.keys(files), read2), [
    'kit-test.mjs exports something, as a helper does: a test only runs.',
    'notes.txt is neither a browser test ("<name>-test.mjs") nor a helper listed in HELPERS (scripts/web-browser-chain.mjs).',
    'quiet-test.mjs never sets how it ended (process.exit or process.exitCode), so it could never fail.',
    'rounds.test.mjs is neither a browser test ("<name>-test.mjs") nor a helper listed in HELPERS (scripts/web-browser-chain.mjs).',
  ]);
  assert.throws(
    () => browserChain(Object.keys(files), read2),
    /The browser tests in tests\/browser cannot run:\n {2}kit-test\.mjs exports/,
  );
});

test("a test's own extra arguments come from its own line, after --no-build", () => {
  const files = {
    'web-exit-test.mjs': `// the exit test\n${ends}`,
    'b-test.mjs': `// B\n// In the browser chain: --now=2026-11-16T18:00:00Z --dev\n${ends}`,
    'a-test.mjs': `// A\n${ends}`,
    'web-browser-kit.mjs': 'export const kit = 1;\n',
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

/** The groups 1..n of a folder, as file names: one list per group. */
const groupsOf = (names, readName, n) =>
  Array.from({ length: n }, (_, i) =>
    browserChain(names, readName, [], 'tests/browser', { k: i + 1, n }).map((t) =>
      t.file.replace('tests/browser/', ''),
    ),
  );

test('groups: a group is "<k>/<n>", 1 <= k <= n, and anything else is refused', () => {
  assert.deepEqual(parseGroup('1/3'), { k: 1, n: 3 });
  assert.deepEqual(parseGroup('3/3'), { k: 3, n: 3 });
  assert.deepEqual(parseGroup('12/20'), { k: 12, n: 20 });
  for (const bad of ['0/3', '4/3', '1/0', '1', '1/3/4', '-1/3', 'a/b', '', '01/3', ' 1/3'])
    assert.throws(() => parseGroup(bad), /is not a group: write --group=<k>\/<n>/, bad);
  assert.ok(inGroup(0, { k: 1, n: 3 }) && inGroup(4, { k: 2, n: 3 }) && inGroup(8, { k: 3, n: 3 }));
  assert.ok(!inGroup(0, { k: 2, n: 3 }));
  // A group and names together are refused.
  assert.throws(
    () => browserChain(['web-exit-test.mjs'], () => ends, ['web-exit-test'], 'x', { k: 1, n: 2 }),
    /Name tests or give a group, not both/,
  );
});

test('groups: every real test is in exactly one group, for any number of groups', () => {
  const names = fs.readdirSync(folder);
  const whole = browserChain(names, read).map((t) => t.file.replace('tests/browser/', ''));
  for (let n = 1; n <= 6; n += 1) {
    const groups = groupsOf(names, read, n);
    // Together, in the whole chain's order, the groups are the whole chain, once each.
    assert.deepEqual([...groups.flat()].sort(), [...whole].sort(), `${n} groups`);
    assert.equal(new Set(groups.flat()).size, whole.length, `${n} groups: no test twice`);
    // The exit test leads group 1, building there; each group keeps the chain's order.
    assert.equal(groups[0][0], 'web-exit-test.mjs');
    for (const group of groups) {
      const places = group.map((name) => whole.indexOf(name));
      assert.deepEqual(
        places,
        [...places].sort((a, b) => a - b),
      );
    }
  }
  // And with groups, the exit test still runs without --no-build, so all its checks run once.
  const first = browserChain(names, read, [], 'tests/browser', { k: 1, n: 3 })[0];
  assert.deepEqual(first, { file: 'tests/browser/web-exit-test.mjs', args: [] });
});

test('groups: each group builds once, in its first test, and keeps a test its own arguments', () => {
  const files = {
    'web-exit-test.mjs': ends,
    'a-test.mjs': ends,
    'b-test.mjs': ends,
    'c-test.mjs': `// In the browser chain: --dev\n${ends}`,
    'd-test.mjs': ends,
    'web-browser-kit.mjs': 'export const kit = 1;\n',
  };
  const names = Object.keys(files);
  const readMadeUp = (n) => files[n];
  // Whole chain: web-exit, a, b, c, d (places 0..4). Two groups: places 0, 2, 4 and 1, 3.
  assert.deepEqual(groupsOf(names, readMadeUp, 2), [
    ['web-exit-test.mjs', 'b-test.mjs', 'd-test.mjs'],
    ['a-test.mjs', 'c-test.mjs'],
  ]);
  assert.deepEqual(browserChain(names, readMadeUp, [], 'tests/browser', { k: 2, n: 2 }), [
    { file: 'tests/browser/a-test.mjs', args: [] },
    { file: 'tests/browser/c-test.mjs', args: ['--no-build', '--dev'] },
  ]);
  // A new test file lands in a group by its name alone: "bb" comes after "b", so the tests
  // after it move along one place, and still every test is in one group exactly.
  const grown = [...names, 'bb-test.mjs'];
  const readGrown = (n) => files[n] ?? ends;
  assert.deepEqual(groupsOf(grown, readGrown, 2), [
    ['web-exit-test.mjs', 'b-test.mjs', 'c-test.mjs'],
    ['a-test.mjs', 'bb-test.mjs', 'd-test.mjs'],
  ]);
  // More groups than tests: the last groups are empty (the runner then refuses to run).
  assert.deepEqual(groupsOf(names, readMadeUp, 6)[5], []);
});

test('the line printed before a test is the one the notes on GitHub name the test by', () => {
  const chain = browserChain(['web-exit-test.mjs', 'made-up-test.mjs'], () => ends);
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
    'a-pass-test.mjs': `console.log('A made-up check passed.');\n${ends}`,
    'b-fail-test.mjs': "console.log('Made-up check failed:');\nprocess.exit(3);\n",
    'c-never-test.mjs': `console.log('never run');\n${ends}`,
  });
  assert.equal(run.status, 3);
  assert.ok(run.stderr.includes(`+ node .local/${run.dir}/b-fail-test.mjs --no-build`), run.stderr);
  assert.doesNotMatch(run.stdout + run.stderr, /never run/);
});

test('a test that kills itself stops the chain; where signals exist it is named "Killed", 137', () => {
  const run = runOn({
    'a-kill-test.mjs': `console.log('stopping myself');\n${ends}process.kill(process.pid, 'SIGKILL');\n`,
    'b-never-test.mjs': `console.log('never run');\n${ends}`,
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

test('an unknown test name or an unknown flag stops the runner with a sentence, nothing run', () => {
  const tests = { 'a-pass-test.mjs': `console.log('ran');\n${ends}` };
  const name = runOn(tests, 'a-pass-test', 'no-such-test');
  assert.equal(name.status, 1);
  assert.match(
    name.stderr,
    /No browser test is named no-such-test\.mjs in \.local\/.*: nothing was run\./,
  );
  assert.doesNotMatch(name.stdout, /ran/);
  const flag = runOn(tests, '--no-bulid');
  assert.equal(flag.status, 1);
  assert.match(
    flag.stderr,
    /does not know --no-bulid \(it knows --list, --group=<k>\/<n> and test names\): nothing was run\./,
  );
  assert.doesNotMatch(flag.stdout, /ran/);
  assert.throws(
    () => browserChain(['a-pass-test.mjs'], () => ends, ['b-test']),
    /No browser test is named b-test\.mjs in tests\/browser/,
  );
});

test('the runner runs one group, names its tests before and after, and refuses a bad group', () => {
  const tests = {
    'a-test.mjs': `console.log('ran a', process.argv.slice(2).join(' '));\n${ends}`,
    'b-test.mjs': `console.log('ran b', process.argv.slice(2).join(' '));\n${ends}`,
    'c-test.mjs': `console.log('ran c', process.argv.slice(2).join(' '));\n${ends}`,
  };
  const second = runOn(tests, '--group=2/2');
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /^Browser tests to run in group 2 of 2 \(1 test\): b-test\.mjs$/m);
  // The first test of a group builds: it is given no --no-build.
  assert.match(second.stdout, /^ran b $/m);
  assert.doesNotMatch(second.stdout, /ran a|ran c/);
  assert.match(second.stdout, /^Browser tests passed in group 2 of 2 \(1 test\): b-test\.mjs$/m);
  const first = runOn(tests, '--group=1/2');
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /\(2 tests\): a-test\.mjs, c-test\.mjs$/m);
  assert.match(first.stdout, /^ran c --no-build$/m);
  const listed = runOn(tests, '--list', '--group=1/2');
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(listed.stdout.trim().split(/\r?\n/), [
    `node .local/${listed.dir}/a-test.mjs`,
    `node .local/${listed.dir}/c-test.mjs --no-build`,
  ]);
  for (const [args, said] of [
    [['--group=3/2'], /"3\/2" is not a group/],
    [['--group=1/2', '--group=2/2'], /Give one group at most/],
    [['--group=1/2', 'a-test'], /Name tests or give a group, not both/],
    [['--group=4/4'], /There is no browser test in group 4 of 4: nothing was run\./],
  ]) {
    const run = runOn(tests, ...args);
    assert.equal(run.status, 1, args.join(' '));
    assert.match(run.stderr, said, args.join(' '));
    assert.doesNotMatch(run.stdout, /ran /, args.join(' '));
  }
});
