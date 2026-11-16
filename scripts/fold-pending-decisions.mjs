// Run by the lead at landing (step 2.188, T-276, record 072): folds every pending decision
// row (docs/specs/v1/decisions-pending/<ID>.md) into docs/specs/v1/DECISIONS.md, each in
// its table and place (scripts/pending-decisions-rules.mjs), formats the file as the format
// check does, and removes the pending files it folded. It prints every row it adds or
// replaces, with the old status and the new.
//
//   node scripts/fold-pending-decisions.mjs                         folds them in
//   node scripts/fold-pending-decisions.mjs --check                 says what it would do; writes nothing
//   node scripts/fold-pending-decisions.mjs --replace-agreed T-201  also lets T-201's agreed row be replaced
//   node scripts/fold-pending-decisions.mjs --founder-agreed S-64   also lets S-64 be written "Agreed"
//
// Statuses are copied as the lane wrote them. A row that would replace an agreed row, mark
// a product decision "Agreed", or reuse an ID the list holds is refused, and then nothing is
// written: only the founder's words make a row "Agreed" (the two flags name one ID each, and
// the lead uses --founder-agreed only while quoting the founder in the landing commit).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import { foldAll, parseId, pendingNames, sayChange } from './pending-decisions-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const decisions = path.join(root, 'docs/specs/v1/DECISIONS.md');
const folder = path.join(root, 'docs/specs/v1/decisions-pending');

const args = process.argv.slice(2);
const allowed = { replaceAgreed: [], founderAgreed: [] };
let check = false;
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--check') check = true;
  else if (arg === '--replace-agreed' || arg === '--founder-agreed') {
    const id = args[i + 1];
    if (!id || !parseId(id)) {
      console.error(`${arg} must be followed by the one ID it allows, such as T-201.`);
      process.exit(1);
    }
    (arg === '--replace-agreed' ? allowed.replaceAgreed : allowed.founderAgreed).push(id);
    i += 1;
  } else {
    console.error(`Unknown argument "${arg}": nothing was folded.`);
    process.exit(1);
  }
}

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
  folded = foldAll(fs.readFileSync(decisions, 'utf8'), pending, allowed);
} catch (error) {
  console.error(`Refused, nothing written: ${String(error?.message ?? error)}`);
  process.exit(1);
}
for (const change of folded.changes) console.log(sayChange(change));
const formatted = await prettier.format(folded.text, {
  ...(await prettier.resolveConfig(decisions)),
  filepath: decisions,
});
if (check) {
  console.log(`These would fold into DECISIONS.md (nothing written): ${names.join(', ')}.`);
  process.exit(0);
}
fs.writeFileSync(decisions, formatted);
for (const name of names) fs.rmSync(path.join(folder, name));
console.log(`Folded into DECISIONS.md and removed: ${names.join(', ')}.`);
