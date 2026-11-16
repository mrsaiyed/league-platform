// Run by the lead at landing (step 2.188, T-276, record 072): folds every pending decision
// row (docs/specs/v1/decisions-pending/<ID>.md) into docs/specs/v1/DECISIONS.md, each in
// its table and place (scripts/pending-decisions-rules.mjs), formats the file as the format
// check does, and removes the pending files it folded.
//
//   node scripts/fold-pending-decisions.mjs           folds them in
//   node scripts/fold-pending-decisions.mjs --check   says whether they would fold; changes nothing
//
// Statuses are copied as the lane wrote them: only the founder's words make a row "Agreed".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import { foldAll, pendingNames } from './pending-decisions-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const decisions = path.join(root, 'docs/specs/v1/DECISIONS.md');
const folder = path.join(root, 'docs/specs/v1/decisions-pending');

const names = pendingNames(fs.existsSync(folder) ? fs.readdirSync(folder) : []);
if (names.length === 0) {
  console.log('No pending decision rows to fold in.');
  process.exit(0);
}
const pending = names.map((name) => ({
  name,
  text: fs.readFileSync(path.join(folder, name), 'utf8'),
}));
let folded;
try {
  folded = foldAll(fs.readFileSync(decisions, 'utf8'), pending);
} catch (error) {
  console.error(String(error?.message ?? error));
  process.exit(1);
}
const formatted = await prettier.format(folded, {
  ...(await prettier.resolveConfig(decisions)),
  filepath: decisions,
});
if (process.argv.includes('--check')) {
  console.log(`These would fold into DECISIONS.md: ${names.join(', ')}.`);
  process.exit(0);
}
fs.writeFileSync(decisions, formatted);
for (const name of names) fs.rmSync(path.join(folder, name));
console.log(`Folded into DECISIONS.md and removed: ${names.join(', ')}.`);
