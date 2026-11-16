// Pending decision rows (step 2.188, T-276, record 072): a lane writes its rows in
// docs/specs/v1/decisions-pending/<ID>.md instead of editing DECISIONS.md, and the lead folds
// them in at landing (scripts/fold-pending-decisions.mjs). These check where a row goes, and
// that every pending file in the folder today folds into the real DECISIONS.md, so a lane
// learns of a wrong heading or cell count in its own checks, not at landing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import {
  foldAll,
  foldRow,
  parsePending,
  pendingNames,
} from '../scripts/pending-decisions-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'docs/specs/v1/decisions-pending');
const decisionsFile = path.join(root, 'docs/specs/v1/DECISIONS.md');

const madeUp = [
  '# Decisions',
  '',
  '## Change log',
  '',
  '| ID   | Was | Now | Why     |',
  '| ---- | --- | --- | ------- |',
  '| T-9  | Old | New | Founder |',
  '| T-2  | Old | New | Founder |',
  '',
  '### [T9 — Quality](technical/T9.md)',
  '',
  '| ID    | Decision | Status |',
  '| ----- | -------- | ------ |',
  '| T-180 | One      | Agreed |',
  '| T-190 | Two      | Open   |',
  '| T-201 | Three    | Agreed |',
  '',
].join('\n');

const rowsOf = (text, heading) => {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.includes(heading));
  const rows = [];
  for (let i = at + 1; i < lines.length && !lines[i].startsWith('#'); i += 1)
    if (lines[i].startsWith('| ') && !lines[i].startsWith('| -')) rows.push(lines[i]);
  return rows.slice(1).map((r) => r.split('|')[1].trim());
};

test('a row goes in its ID place in a table kept by ID, and at the end of the change log', () => {
  const text = foldAll(madeUp, [
    {
      name: 'T-195.md',
      text: '# T-195\n\n## T9 — Quality\n\n| T-195 | Four | Agreed (delegated) |\n\n## Change log\n\n| T-195 | New | Four | Why |\n',
    },
    {
      name: 'T-250.md',
      text: '# T-250\n\n## T9 — Quality\n\n| T-250 | Five | Agreed (delegated) |\n',
    },
  ]);
  assert.deepEqual(rowsOf(text, 'T9 — Quality'), ['T-180', 'T-190', 'T-195', 'T-201', 'T-250']);
  assert.deepEqual(rowsOf(text, 'Change log'), ['T-9', 'T-2', 'T-195']);
});

test('a row whose ID is already in a table kept by ID replaces it', () => {
  const text = foldRow(madeUp, {
    heading: 'T9 — Quality',
    cells: ['T-190', 'Two, now', 'Agreed (delegated)'],
  });
  assert.deepEqual(rowsOf(text, 'T9 — Quality'), ['T-180', 'T-190', 'T-201']);
  assert.match(text, /\| T-190 \| Two, now \| Agreed \(delegated\) \|/);
  assert.doesNotMatch(text, /\| T-190 \| Two {6}\|/);
});

test('a wrong heading, a wrong number of cells or a row outside a heading is refused by name', () => {
  assert.throws(
    () => foldRow(madeUp, { heading: 'T12 — Nothing', cells: ['T-1', 'x', 'y'] }, 'T-1.md'),
    /T-1\.md: DECISIONS\.md has no table under "T12 — Nothing"/,
  );
  assert.throws(
    () => foldRow(madeUp, { heading: 'T9 — Quality', cells: ['T-1', 'x'] }, 'T-1.md'),
    /2 cells; the table has 3/,
  );
  assert.throws(() => parsePending('T-1.md', '# T-1\n\n| T-1 | x | y |\n'), /a row before any/);
  assert.throws(() => parsePending('T-1.md', '# T-1\n\n## T9 — Quality\n'), /no row/);
});

test('only "<ID>.md" files are pending rows: the folder README is not', () => {
  assert.deepEqual(pendingNames(['README.md', 'T-276.md', 'S-64.md', 'notes.txt']), [
    'T-276.md',
    'S-64.md',
  ]);
});

test('every pending file in the folder folds into DECISIONS.md, and the result is formatted', async () => {
  const names = pendingNames(fs.existsSync(folder) ? fs.readdirSync(folder) : []);
  const pending = names.map((name) => ({
    name,
    text: fs.readFileSync(path.join(folder, name), 'utf8'),
  }));
  const folded = foldAll(fs.readFileSync(decisionsFile, 'utf8'), pending);
  const options = { ...(await prettier.resolveConfig(decisionsFile)), filepath: decisionsFile };
  const formatted = await prettier.format(folded, options);
  assert.ok(await prettier.check(formatted, options));
  for (const { name } of pending) {
    const id = name.replace(/\.md$/, '');
    assert.ok(formatted.includes(`| ${id} `), `${id} is in DECISIONS.md once folded`);
  }
});
