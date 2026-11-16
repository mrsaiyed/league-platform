// GitHub's gate (.github/workflows/ci.yml, step 2.191) runs as several jobs side by side.
// These checks keep it whole: every part of `npm run verify` and every test script of
// package.json is run by some job, the web browser tests' groups are 1 to n and together
// hold every test, no job can be skipped or wait on another, each job starts as the single
// job did, and the workflow never becomes one that reaches the live tracker.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { reachesLiveSite } from '../scripts/promote-rules.mjs';
import { browserChain } from '../scripts/web-browser-chain.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = '.github/workflows/ci.yml';
const workflow = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const scripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
/** The workflow without its comments: only what GitHub runs. */
const commands = workflow
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');
/** The jobs, as { id: their lines }, from the two-space keys under `jobs:`. */
const jobs = (() => {
  const found = {};
  let current = null;
  for (const line of workflow.slice(workflow.indexOf('\njobs:\n') + 7).split('\n')) {
    const key = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
    if (key) found[(current = key[1])] = [];
    else if (current && !/^\s*#/.test(line)) found[current].push(line);
  }
  return found;
})();
/** Whether some line GitHub runs has `npm <words>` as a whole command, not a longer one. */
const runs = (npm) =>
  new RegExp(`${npm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w:-])`).test(commands);

test('every part of npm run verify is run by some job', () => {
  const parts = scripts.verify.split('&&').map((part) => part.trim());
  assert.ok(parts.length >= 7, scripts.verify);
  for (const part of parts) assert.ok(runs(part), `${part} is in verify but no job runs it`);
});

test('every test script of package.json is run by some job', () => {
  const tests = Object.keys(scripts).filter((name) => name === 'test' || name.startsWith('test:'));
  assert.ok(tests.includes('test:web:browser') && tests.includes('test:stats:browser'));
  for (const name of tests) {
    const npm = name === 'test' ? 'npm test' : `npm run ${name}`;
    assert.ok(runs(npm), `${npm} is a test script but no job runs it`);
  }
});

test('the web browser tests run in groups 1 to n that together hold every test once', () => {
  const lines = jobs['web-browser'].join('\n');
  const matrix = /^\s+group: \[([\d, ]+)\]\s*$/m.exec(lines);
  assert.ok(matrix, 'the web-browser job has a matrix of groups');
  const groups = matrix[1].split(',').map((n) => Number(n.trim()));
  const n = groups.length;
  assert.ok(n >= 2, 'two groups at least');
  assert.deepEqual(
    groups,
    Array.from({ length: n }, (_, i) => i + 1),
  );
  // The runner is given its group and the number of groups the matrix has.
  assert.match(
    lines,
    /npm run test:web:browser -- --group=\$\{\{ matrix\.group \}\}\/\$\{\{ strategy\.job-total \}\} /,
  );
  assert.match(lines, /^\s+fail-fast: false\s*$/m);
  // With the real folder: the n groups together are the whole chain, each test once.
  const folder = path.join(root, 'tests/browser');
  const names = fs.readdirSync(folder);
  const read = (name) => fs.readFileSync(path.join(folder, name), 'utf8');
  const whole = browserChain(names, read).map((t) => t.file);
  const together = groups.flatMap((k) =>
    browserChain(names, read, [], 'tests/browser', { k, n }).map((t) => t.file),
  );
  assert.deepEqual([...together].sort(), [...whole].sort());
  for (const k of groups) {
    assert.ok(browserChain(names, read, [], 'tests/browser', { k, n }).length > 0, `group ${k}`);
  }
});

test("vitest's tests run in parts 1 to n, by vitest's own --shard", () => {
  const lines = jobs['vitest-tests'].join('\n');
  const matrix = /^\s+shard: \[([\d, ]+)\]\s*$/m.exec(lines);
  assert.ok(matrix, 'the vitest-tests job has a matrix of parts');
  const shards = matrix[1].split(',').map((n) => Number(n.trim()));
  assert.deepEqual(
    shards,
    Array.from({ length: shards.length }, (_, i) => i + 1),
  );
  assert.match(
    lines,
    /npm run test:units -- --shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\} /,
  );
  assert.match(lines, /^\s+fail-fast: false\s*$/m);
  // No other job runs a part of a matrix: every other job's commands are whole.
  for (const [id, other] of Object.entries(jobs)) {
    if (id === 'vitest-tests' || id === 'web-browser') continue;
    assert.doesNotMatch(other.join('\n'), /matrix|--shard|--group/, id);
  }
});

test('no job waits on another or can be skipped, and each starts as the single job did', () => {
  assert.ok(Object.keys(jobs).length >= 6, Object.keys(jobs).join(', '));
  for (const [id, lines] of Object.entries(jobs)) {
    const text = lines.join('\n');
    // A job that needs another is skipped when that one fails, and a job with its own
    // condition can be skipped: GitHub counts a skipped job as no failure.
    assert.doesNotMatch(text, /^ {4}(needs|if):/m, `${id} waits on another or has a condition`);
    assert.match(text, /^ {4}runs-on: ubuntu-latest$/m, id);
    assert.match(text, /^ {6}- uses: actions\/checkout@v4$/m, id);
    assert.match(
      text,
      /^ {6}- uses: actions\/setup-node@v4\n {8}with:\n {10}node-version: '24'\n {10}cache: npm$/m,
      id,
    );
    assert.match(text, /^ {6}- run: npm ci$/m, id);
    // Only the actions the gate has always used.
    for (const uses of text.match(/uses: \S+/g) ?? []) {
      assert.ok(
        ['uses: actions/checkout@v4', 'uses: actions/setup-node@v4'].includes(uses),
        `${id}: ${uses}`,
      );
    }
  }
  // Every job that opens a browser installs it first.
  for (const [id, lines] of Object.entries(jobs)) {
    const text = lines.join('\n');
    const install = text.indexOf('npx playwright install --with-deps chromium');
    const browser = text.search(/npm run test:[\w:]*browser/);
    if (browser >= 0) assert.ok(install >= 0 && install < browser, `${id} installs the browser`);
  }
});

test('the gate runs on the same events, with nothing that reaches the live tracker', () => {
  assert.match(workflow, /^on: \[push, pull_request\]$/m);
  assert.match(workflow, /^permissions:\n {2}contents: read$/m);
  assert.equal(reachesLiveSite(file, workflow), false);
  assert.doesNotMatch(commands, /secrets\./);
});
