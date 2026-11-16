// Which browser tests of the web app `npm run test:web:browser` runs, and in what order
// (step 2.188, T-276, record 072). Kept apart from scripts/run-web-browser-tests.mjs, which
// reads the folder and runs them, so it can be tested by itself
// (tests/web-browser-chain.test.mjs).
//
// The tests are the files themselves: every `tests/browser/<name>-test.mjs` is in the
// chain, and nothing else is: the helpers there are listed in HELPERS below, and any other
// file, or a test that exports or never sets how it ended, stops the chain with a sentence
// before anything runs. A new browser test is only its file: no shared line or list
// to edit, so two lanes that each add one never collide (before this step the chain was
// one line of package.json that every such step edited).
//
// The order, and why it is sound:
// - web-exit-test.mjs runs first and builds the app; every other test runs after it with
//   --no-build and serves that build. Every test builds the same way (`next build` with
//   APP_ENV=test), so which one builds changes nothing but where a build error is shown;
//   the exit test is the one whose build the other tests' comments name.
// - The rest run in alphabetical order. No test needs another to run before or after it:
//   each starts its own server on a free port of its own, on a made-up world it makes
//   fresh in memory, and none writes a file another reads. A test that ever needs an
//   order of its own must say so here, in words, and in FIRST below or beside it.
// - Extra arguments: a test that needs some in the chain (none does today) says so in a
//   line of its own, `// In the browser chain: <arguments>`, in its own file.
// - The chain stops at the first test that fails, with that test's own exit code; a test
//   stopped by a signal is named and ends the chain with 128 and the signal's number.
//
// Groups (step 2.191): on GitHub the chain runs as n groups side by side, each a job of its
// own. Group k of n is every test whose place in the whole chain above, counted from 0, is
// k - 1 more than a multiple of n: the exit test (place 0) is always first in group 1 and
// builds there, as it does in the whole chain, and the first test of every other group
// builds that group's own copy of the app. So the groups together hold every test exactly
// once, a new test file lands in a group by its name alone, and nobody edits the workflow
// to add one (tests/ci-workflow.test.mjs checks the workflow's groups against this rule).
import os from 'node:os';

/** The test that runs first and builds the app; the rest are given --no-build. */
export const FIRST = 'web-exit-test.mjs';

/**
 * The files in tests/browser that are not tests: the helpers the tests import. The one list
 * of them. Any other file there must be a test, named `<name>-test.mjs`, or the chain
 * refuses to run, so a test misnamed is never quietly left out.
 */
export const HELPERS = ['scoring-clock-steps.mjs', 'tracker-driver.mjs', 'web-browser-kit.mjs'];

/** Whether a file in tests/browser is a test of the chain. */
export const isBrowserTest = (name) => /^[a-z0-9]+(?:-[a-z0-9]+)*-test\.mjs$/.test(name);

/**
 * What is wrong with the folder, as sentences ([] when nothing is): a file that is neither
 * a test nor a listed helper, and a test that does not run. A test runs and says how it
 * ended: it exports nothing (a helper misnamed as a test exports what it lends) and, outside
 * its comments, calls `process.exit` or sets `process.exitCode`, as every test does to fail;
 * a file that never does could only ever pass.
 */
export function folderProblems(names, read) {
  const problems = [];
  for (const name of [...names].sort()) {
    if (HELPERS.includes(name)) continue;
    if (!isBrowserTest(name)) {
      problems.push(
        `${name} is neither a browser test ("<name>-test.mjs") nor a helper listed in HELPERS (scripts/web-browser-chain.mjs).`,
      );
      continue;
    }
    const code = read(name)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    if (/^\s*export\b/m.test(code)) {
      problems.push(`${name} exports something, as a helper does: a test only runs.`);
    } else if (!/\bprocess\.exit(?:Code)?\b/.test(code)) {
      problems.push(
        `${name} never sets how it ended (process.exit or process.exitCode), so it could never fail.`,
      );
    }
  }
  return problems;
}

/** A test's own extra arguments, from its line `// In the browser chain: …` ([] if none). */
export function extraArguments(source) {
  const line = /^\/\/ In the browser chain: (.+)$/m.exec(source);
  return line ? line[1].trim().split(/\s+/) : [];
}

/**
 * A group as `--group=<k>/<n>` writes it: { k, n }, whole numbers with 1 <= k <= n. Throws
 * a sentence for anything else.
 */
export function parseGroup(text) {
  const found = /^([1-9]\d*)\/([1-9]\d*)$/.exec(text);
  const group = found ? { k: Number(found[1]), n: Number(found[2]) } : null;
  if (!group || group.k > group.n) {
    throw new Error(
      `"${text}" is not a group: write --group=<k>/<n>, as --group=2/3 for the second of three.`,
    );
  }
  return group;
}

/** Whether the test at `place` in the whole chain (counted from 0) is in group { k, n }. */
export const inGroup = (place, { k, n }) => place % n === k - 1;

/**
 * The chain: `names` are the files in tests/browser, `read(name)` gives a file's text. Each
 * entry is { file, args }, as `node <file> <args…>` runs it from the repository's root.
 * `only`, when given, keeps just those tests (by file name, with or without ".mjs"), in the
 * chain's order; the first kept builds. `group`, when given ({ k, n }, from parseGroup),
 * keeps just the tests of group k of n, by their places in the whole chain; the first kept
 * builds.
 */
export function browserChain(names, read, only = [], folder = 'tests/browser', group = null) {
  const problems = folderProblems(names, read);
  if (problems.length > 0) {
    throw new Error(`The browser tests in ${folder} cannot run:\n  ${problems.join('\n  ')}`);
  }
  if (group && only.length > 0) {
    throw new Error('Name tests or give a group, not both: nothing was run.');
  }
  const wanted = only.map((name) => (name.endsWith('.mjs') ? name : `${name}.mjs`));
  const unknown = wanted.filter((name) => !names.filter(isBrowserTest).includes(name));
  if (unknown.length > 0) {
    throw new Error(
      `No browser test is named ${unknown.join(', ')} in ${folder}: nothing was run.`,
    );
  }
  const tests = names
    .filter(isBrowserTest)
    .sort((a, b) => (a === FIRST ? -1 : b === FIRST ? 1 : a < b ? -1 : a > b ? 1 : 0))
    .filter((_, place) => !group || inGroup(place, group))
    .filter((name) => wanted.length === 0 || wanted.includes(name));
  return tests.map((name, i) => ({
    file: `${folder}/${name}`,
    args: [...(i === 0 ? [] : ['--no-build']), ...extraArguments(read(name))],
  }));
}

/** The line the runner prints before it starts a test, as bash's trace printed it. */
export const startLine = ({ file, args }) => `+ ${['node', file, ...args].join(' ')}`;

/**
 * What the runner says when a test did not end by itself: stopped by a signal (`run.signal`)
 * or never started (`run.error`), as spawnSync reports them. { line, code }, or undefined
 * for a test that ended with an exit code of its own. The line is one the notes on GitHub
 * pick out (scripts/browser-failure-rules.mjs: "Killed", or "Error:"): bash used to print
 * "Killed" for a test the machine stopped, as when it runs out of memory, so SIGKILL keeps
 * that word. The code is the one bash gave: 128 and the signal's number.
 */
export function stoppedLine({ file }, run) {
  if (run.error) {
    return { line: `Error: ${file} could not be run: ${run.error.message}`, code: 1 };
  }
  if (!run.signal) return undefined;
  const code = 128 + (os.constants.signals[run.signal] ?? 0);
  const said = `${file} was stopped by ${run.signal} (exit code ${code})`;
  return { line: run.signal === 'SIGKILL' ? `Killed: ${said}` : `Error: ${said}`, code };
}
