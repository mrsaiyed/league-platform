// `npm run test:web:browser`: runs the web app's browser tests, one after another, in the
// order scripts/web-browser-chain.mjs gives (the exit test first, building the app; the
// rest in alphabetical order with --no-build). Step 2.188, T-276, record 072.
//
//   node scripts/run-web-browser-tests.mjs              every test
//   node scripts/run-web-browser-tests.mjs rounds-test  only those named (the first builds)
//   node scripts/run-web-browser-tests.mjs --list       prints the chain and runs nothing
//   node scripts/run-web-browser-tests.mjs --group=2/3  only group 2 of 3 (its first builds)
//
// A group is what one of GitHub's side-by-side jobs runs (step 2.191; the rule is in
// scripts/web-browser-chain.mjs). Before the first test the runner names every test it is
// about to run, and when they have all passed it names them again, so a run's log shows
// which tests ran in it; `--list --group=2/3` prints that group's chain.
//
// Before it starts a test it prints "+ node tests/browser/<file>.mjs …", the line bash's
// trace printed when the chain was one line of package.json, so the notes on GitHub
// (scripts/browser-failure-notes.mjs) still name the test that stopped. It stops at the
// first test that fails, with that test's own exit code; the test's own output is its own.
// A test stopped by a signal (out of memory on GitHub, say) or that could not start is
// named in a line of the runner's own ("Killed: … was stopped by SIGKILL"), and the chain
// ends with 128 and the signal's number, as bash's did.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserChain, parseGroup, startLine, stoppedLine } from './web-browser-chain.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Only the runner's own test (tests/web-browser-chain.test.mjs) points it at another folder
// of made-up tests; the gate never sets it.
const relative = process.env.WEB_BROWSER_TESTS_FOLDER ?? 'tests/browser';
const folder = path.join(root, relative);
const asked = process.argv.slice(2);
const groupFlag = '--group=';
const isKnownFlag = (a) => a === '--list' || a.startsWith(groupFlag);
const unknownFlags = asked.filter((a) => a.startsWith('-') && !isKnownFlag(a));
if (unknownFlags.length > 0) {
  console.error(
    `The browser tests' runner does not know ${unknownFlags.join(', ')} (it knows --list, --group=<k>/<n> and test names): nothing was run.`,
  );
  process.exit(1);
}
const groups = asked.filter((a) => a.startsWith(groupFlag));
let chain;
let group = null;
try {
  if (groups.length > 1) throw new Error('Give one group at most: nothing was run.');
  if (groups.length === 1) group = parseGroup(groups[0].slice(groupFlag.length));
  chain = browserChain(
    fs.readdirSync(folder),
    (name) => fs.readFileSync(path.join(folder, name), 'utf8'),
    asked.filter((a) => !a.startsWith('-')),
    relative,
    group,
  );
} catch (error) {
  console.error(String(error?.message ?? error));
  process.exit(1);
}

if (asked.includes('--list')) {
  for (const test of chain) console.log(startLine(test).slice(2));
  process.exit(0);
}
const which = group ? `group ${group.k} of ${group.n}` : relative;
if (chain.length === 0) {
  console.error(`There is no browser test in ${which}: nothing was run.`);
  process.exit(1);
}
const named = chain.map((test) => path.basename(test.file)).join(', ');
const count = `${chain.length} ${chain.length === 1 ? 'test' : 'tests'}`;
// Written at once, so the list comes before any test's own output.
fs.writeSync(1, `Browser tests to run in ${which} (${count}): ${named}\n`);
for (const test of chain) {
  // Written at once, before the test starts, so it comes before the test's own output.
  fs.writeSync(2, `${startLine(test)}\n`);
  const run = spawnSync(process.execPath, [test.file, ...test.args], {
    cwd: root,
    stdio: 'inherit',
  });
  const stopped = stoppedLine(test, run);
  if (stopped) {
    fs.writeSync(2, `${stopped.line}\n`);
    process.exit(stopped.code);
  }
  if (run.status !== 0) process.exit(run.status ?? 1);
}
fs.writeSync(1, `Browser tests passed in ${which} (${count}): ${named}\n`);
