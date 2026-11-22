// node scripts/check-sign-in-service.mjs --hosted (step 2.206): asks the real sign-in
// service every call our sign-in adapter makes, through the adapter's own client, and
// says line by line whether each answer was as our code expects (record 018, "To check
// on staging"). For the supervised session with the test copy, as its first act
// (docs/operations/check-sign-in-service.md). No builder or unattended run uses it
// against a real service (T-201): it refuses to run anywhere but at a terminal.
//
// A thin command: where it may run and the checks are in check-sign-in-service-checks.mjs,
// its words in check-sign-in-service.messages.mjs. It never prints an error's own
// message, which could repeat an address or a key; it exits 0 when every check was as
// expected, 1 when one was not, 2 when it refused to run, 130 when stopped at once.
import { trackerProjectFor } from '@srleagues/providers';
// The client that can remove a user is not in the package's index (review L2).
import { createGoTrueClient } from '../packages/providers/src/sign-in/for-operations.ts';
import { exitCodeFor, runChecks, settingsFor } from './check-sign-in-service-checks.mjs';
import * as words from './check-sign-in-service.messages.mjs';

const chosen = settingsFor({
  argv: process.argv.slice(2),
  env: process.env,
  terminal: process.stdin.isTTY === true,
  trackerProject: trackerProjectFor(import.meta.url),
});
if ('problems' in chosen) {
  const write = chosen.exitCode === 0 ? console.log : console.error;
  for (const text of chosen.problems) write(text);
  process.exit(chosen.exitCode);
}

const { projectUrl, secretKey, local } = chosen.settings;
const stop = new AbortController();
// The first Ctrl+C stops after the check in hand and still removes the made-up user;
// a second stops at once.
process.on('SIGINT', () => {
  if (stop.signal.aborted) {
    for (const text of words.stoppedTwice) console.error(text);
    process.exit(130);
  }
  console.log(words.stopping);
  stop.abort();
});

console.log(words.title);
console.log(local ? words.whereLocal : words.whereHosted);
for (const text of words.aboutTheRun) console.log(text);

let exitCode = 1;
try {
  const client = createGoTrueClient({ projectUrl, secretKey, fetch: globalThis.fetch });
  const outcome = await runChecks({
    client,
    print: (text) => console.log(text),
    signal: stop.signal,
    withheld: [secretKey, projectUrl, new URL(projectUrl).host],
  });
  exitCode = exitCodeFor(outcome);
} catch {
  console.error(words.unexpected);
  for (const text of words.notRemoved) console.error(text);
}
process.exit(exitCode);
