// Run by .github/workflows/ci.yml when a check fails: prints, as GitHub annotations, what
// failed, from the output the step kept (scripts/verify-failure-rules.mjs decides what is
// shown).
//
//   node scripts/verify-failure-notes.mjs <file with verify's output>
//       which stage of `npm run verify` stopped, and what failed
//   node scripts/verify-failure-notes.mjs --web-browser <file with the browser tests' output>
//       which of the web app's browser tests failed, and its failing check's lines
//   node scripts/verify-failure-notes.mjs --steps <npm script>
//       the tests of that npm script's chain, one command a line, for ci.yml to run in turn
//
// It reads only package.json and that file, and prints nothing else.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserFailureNotes, chainSteps, failureNotes } from './verify-failure-rules.mjs';

const [first, second] = process.argv.slice(2);

if (first === '--steps') {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { scripts = {} } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const step of chainSteps(scripts[second ?? ''])) console.log(step);
  process.exit(0);
}

const browser = first === '--web-browser';
let output;
try {
  output = fs.readFileSync((browser ? second : first) ?? '', 'utf8');
} catch {
  const what = browser ? "the web app's browser tests" : 'verify';
  console.log(`::error title=${what} stopped::${what} did not run, or left no output to read.`);
  process.exit(0);
}
for (const note of browser ? browserFailureNotes(output) : failureNotes(output)) console.log(note);
