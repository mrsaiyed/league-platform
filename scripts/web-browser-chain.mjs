// Which browser tests of the web app `npm run test:web:browser` runs, and in what order
// (step 2.188, T-276, record 072). Kept apart from scripts/run-web-browser-tests.mjs, which
// reads the folder and runs them, so it can be tested by itself
// (tests/web-browser-chain.test.mjs).
//
// The tests are the files themselves: every `tests/browser/<name>-test.mjs` is in the
// chain, and nothing else is (the helpers there, web-browser-kit.mjs and tracker-driver.mjs,
// do not end in "-test.mjs"). A new browser test is only its file: no shared line or list
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
// - The chain stops at the first test that fails, with that test's own exit code.

/** The test that runs first and builds the app; the rest are given --no-build. */
export const FIRST = 'web-exit-test.mjs';

/** Whether a file in tests/browser is a test of the chain. */
export const isBrowserTest = (name) => /^[a-z0-9]+(?:-[a-z0-9]+)*-test\.mjs$/.test(name);

/** A test's own extra arguments, from its line `// In the browser chain: …` ([] if none). */
export function extraArguments(source) {
  const line = /^\/\/ In the browser chain: (.+)$/m.exec(source);
  return line ? line[1].trim().split(/\s+/) : [];
}

/**
 * The chain: `names` are the files in tests/browser, `read(name)` gives a file's text. Each
 * entry is { file, args }, as `node <file> <args…>` runs it from the repository's root.
 * `only`, when given, keeps just those tests (by file name, with or without ".mjs"), in the
 * chain's order; the first kept builds.
 */
export function browserChain(names, read, only = []) {
  const wanted = only.map((name) => (name.endsWith('.mjs') ? name : `${name}.mjs`));
  const tests = names
    .filter(isBrowserTest)
    .filter((name) => wanted.length === 0 || wanted.includes(name))
    .sort((a, b) => (a === FIRST ? -1 : b === FIRST ? 1 : a < b ? -1 : a > b ? 1 : 0));
  return tests.map((name, i) => ({
    file: `tests/browser/${name}`,
    args: [...(i === 0 ? [] : ['--no-build']), ...extraArguments(read(name))],
  }));
}

/** The line the runner prints before it starts a test, as bash's trace printed it. */
export const startLine = ({ file, args }) => `+ ${['node', file, ...args].join(' ')}`;
