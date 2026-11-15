// Run by .github/workflows/ci.yml when `npm run verify` fails: prints, as GitHub
// annotations, which stage of the gate stopped and what failed, from the output the
// step kept (scripts/verify-failure-rules.mjs decides what is shown).
//
//   node scripts/verify-failure-notes.mjs <file with verify's output>
//
// It reads only that file and prints nothing else.
import fs from 'node:fs';
import { failureNotes } from './verify-failure-rules.mjs';

let output;
try {
  output = fs.readFileSync(process.argv[2] ?? '', 'utf8');
} catch {
  console.log('::error title=verify stopped::verify did not run, or left no output to read.');
  process.exit(0);
}
for (const note of failureNotes(output)) console.log(note);
