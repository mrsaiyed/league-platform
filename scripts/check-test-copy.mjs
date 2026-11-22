// node scripts/check-test-copy.mjs <address> (step 2.207): reads the test copy at one
// address and says line by line whether it answers as the test copy must: the health
// answer asks the database; every page and robots.txt say "do not index"; the local-only
// pages and the "be this person" action answer exactly as an address that does not exist;
// the test-copy line is shown. Run by the lead against the real test copy in the session
// and after every release (2.105 audit, M14), and by the rehearsal on this computer.
//
// The "be this person" action's id changes with every build, and nobody outside a hosted
// copy can know it: against the real test copy the lead runs it with `--without-action`,
// and that one line is printed NOT CHECKED, with the reason, and is no failure. What proves
// that action is the rehearsal (`npm run rehearse:test-copy`), which runs this check on the
// same code with the build's own manifest (`--manifest`). Without either, the line fails.
//
// Read-only and with no secret: it reads no environment, holds no key and changes nothing
// (decision T-302). A thin command: the address it takes and the checks are in
// check-test-copy-checks.mjs, its words in check-test-copy.messages.mjs. Exit code 0 when
// every check passed, 1 when one failed, 2 when it refused to run.
import { exitCodeFor, runChecks, settingsFor } from './check-test-copy-checks.mjs';

const chosen = settingsFor({ argv: process.argv.slice(2) });
if ('problems' in chosen) {
  const write = chosen.exitCode === 0 ? console.log : console.error;
  for (const text of chosen.problems) write(text);
  process.exit(chosen.exitCode);
}

const outcome = await runChecks({
  ...chosen.settings,
  fetch: globalThis.fetch,
  print: (text) => console.log(text),
});
process.exit(exitCodeFor(outcome));
