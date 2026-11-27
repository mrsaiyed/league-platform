// Pending decision rows (step 2.188, T-276, record 072): a lane writes its rows in
// docs/specs/v1/decisions-pending/<ID>.md instead of editing DECISIONS.md, and the lead folds
// them in at landing (scripts/fold-pending-decisions.mjs). These check where a row goes, what
// is refused (an agreed row replaced, a product decision written "Agreed", an ID used twice),
// what is said for each row, and that every pending file in the folder today folds into the
// real DECISIONS.md under the same rules, so a lane learns of a refusal in its own checks,
// not at landing.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import {
  foldAll,
  foldRow,
  fullListTables,
  keptById,
  parsePending,
  pendingNames,
  sayChange,
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
  '### [P7 — Game day](product/P7.md)',
  '',
  '| ID  | Decision | Status      |',
  '| --- | -------- | ----------- |',
  '| S-1 | One      | Agreed      |',
  '| S-2 | Two      | Recommended |',
  '',
  '### [T9 — Quality](technical/T9.md)',
  '',
  '| ID    | Decision | Status             |',
  '| ----- | -------- | ------------------ |',
  '| T-180 | One      | Agreed (delegated) |',
  '| T-190 | Two      | Open               |',
  '| T-201 | Three    | Agreed (delegated) |',
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
const file = (id, kind, ...sections) => ({
  name: `${id}.md`,
  text: `# ${id}\n\n${kind}\n\n${sections.join('\n\n')}\n`,
});

test('a row goes in its ID place in a table kept by ID, and at the end of the change log', () => {
  const { text, changes } = foldAll(madeUp, [
    file(
      'T-195',
      'New',
      '## T9 — Quality\n\n| T-195 | Four | Agreed (delegated) |',
      '## Change log\n\n| T-195 | New | Four | Why |',
    ),
    file('T-250', 'New', '## T9 — Quality\n\n| T-250 | Five | Agreed (delegated) |'),
  ]);
  assert.deepEqual(rowsOf(text, 'T9 — Quality'), ['T-180', 'T-190', 'T-195', 'T-201', 'T-250']);
  assert.deepEqual(rowsOf(text, 'Change log'), ['T-9', 'T-2', 'T-195']);
  assert.deepEqual(changes.map(sayChange), [
    'added T-195 to "T9 — Quality": (none) → Agreed (delegated)',
    'added T-195 to "Change log": (none) → —',
    'added T-250 to "T9 — Quality": (none) → Agreed (delegated)',
  ]);
});

test('a Change replaces a row that is not agreed, and says its old status and its new', () => {
  const { text, changes } = foldAll(madeUp, [
    file('T-190', 'Change', '## T9 — Quality\n\n| T-190 | Two, now | Agreed (delegated) |'),
  ]);
  assert.deepEqual(rowsOf(text, 'T9 — Quality'), ['T-180', 'T-190', 'T-201']);
  assert.match(text, /\| T-190 \| Two, now \| Agreed \(delegated\) \|/);
  assert.doesNotMatch(text, /\| T-190 \| Two {6}\|/);
  assert.deepEqual(changes.map(sayChange), [
    'replaced T-190 in "T9 — Quality": Open → Agreed (delegated)',
  ]);
});

test('an agreed row is never replaced unless the lead names it with --replace-agreed', () => {
  const pending = [
    file('T-201', 'Change', '## T9 — Quality\n\n| T-201 | Three, now | Decided for you |'),
  ];
  assert.throws(
    () => foldAll(madeUp, pending),
    /T-201\.md: it would replace T-201 under "T9 — Quality", which is "Agreed \(delegated\)".*--replace-agreed T-201/,
  );
  const founders = [file('S-1', 'Change', '## P7 — Game day\n\n| S-1 | One, now | Recommended |')];
  assert.throws(() => foldAll(madeUp, founders), /which is "Agreed"/);
  // Named by the lead, for that ID only.
  assert.throws(
    () => foldAll(madeUp, pending, { replaceAgreed: ['T-180'], founderAgreed: [] }),
    /--replace-agreed T-201/,
  );
  const { changes } = foldAll(madeUp, pending, { replaceAgreed: ['T-201'], founderAgreed: [] });
  assert.deepEqual(changes.map(sayChange), [
    'replaced T-201 in "T9 — Quality": Agreed (delegated) → Decided for you',
  ]);
});

test('a product decision is never written "Agreed" unless the lead names it with --founder-agreed', () => {
  const pending = [file('S-3', 'New', '## P7 — Game day\n\n| S-3 | Three | Agreed |')];
  assert.throws(
    () => foldAll(madeUp, pending),
    /S-3\.md: it marks S-3 "Agreed" under "P7 — Game day"\. Only the founder's own words.*--founder-agreed S-3/,
  );
  const { changes } = foldAll(madeUp, pending, { replaceAgreed: [], founderAgreed: ['S-3'] });
  assert.deepEqual(changes.map(sayChange), ['added S-3 to "P7 — Game day": (none) → Agreed']);
  // "Decided for you" and the technical statuses need no flag.
  assert.doesNotThrow(() =>
    foldAll(madeUp, [file('S-4', 'New', '## P7 — Game day\n\n| S-4 | Four | Decided for you |')]),
  );
});

test('a New file whose ID the list already holds is refused, in its table or another', () => {
  assert.throws(
    () => foldAll(madeUp, [file('T-190', 'New', '## T9 — Quality\n\n| T-190 | Again | Open |')]),
    /T-190\.md: says New, but the full list already holds T-190/,
  );
  assert.throws(
    () => foldAll(madeUp, [file('T-190', 'New', '## Change log\n\n| T-190 | a | b | c |')]),
    /says New, but the full list already holds T-190/,
  );
  assert.throws(
    () =>
      foldRow(madeUp, { heading: 'T9 — Quality', cells: ['T-190', 'x', 'y'] }, 'New', 'T-190.md'),
    /T-190 is already under "T9 — Quality", and the file says New/,
  );
});

test('a wrong heading, a wrong number of cells, no kind or a row outside a heading is refused by name', () => {
  assert.throws(
    () => foldRow(madeUp, { heading: 'T12 — Nothing', cells: ['T-1', 'x', 'y'] }, 'New', 'T-1.md'),
    /T-1\.md: DECISIONS\.md has no table under "T12 — Nothing"/,
  );
  assert.throws(
    () => foldRow(madeUp, { heading: 'T9 — Quality', cells: ['T-1', 'x'] }, 'New', 'T-1.md'),
    /2 cells; the table has 3/,
  );
  assert.throws(
    () => parsePending('T-1.md', '# T-1\n\nNew\n\n| T-1 | x | y |\n'),
    /a row before any/,
  );
  assert.throws(() => parsePending('T-1.md', '# T-1\n\nNew\n\n## T9 — Quality\n'), /no row/);
  assert.throws(
    () => parsePending('T-1.md', '# T-1\n\n## T9 — Quality\n\n| T-1 | x | y |\n'),
    /must be "New" \(an ID not in the list yet\) or "Change"/,
  );
});

test("a pending file's name, its first line and every row in it name the same ID", () => {
  assert.throws(
    () => parsePending('T-1.md', '# T-2\n\nNew\n\n## T9 — Quality\n\n| T-2 | x | y |\n'),
    /T-1\.md: its first line must be "# T-1", the ID in its name/,
  );
  assert.throws(
    () =>
      parsePending(
        'T-1.md',
        '# T-1\n\nNew\n\n## T9 — Quality\n\n| T-1 | x | y |\n\n## Change log\n\n| T-3 | a | b | c |\n',
      ),
    /T-1\.md: a row under "Change log" is for T-3, not T-1/,
  );
  assert.deepEqual(
    parsePending('T-1.md', '# T-1\n\nChange\n\n## T9 — Quality\n\n| T-1 | x | y |\n'),
    { id: 'T-1', kind: 'Change', rows: [{ heading: 'T9 — Quality', cells: ['T-1', 'x', 'y'] }] },
  );
});

test('only "<ID>.md" files are pending rows: the folder README is not', () => {
  assert.deepEqual(pendingNames(['README.md', 'T-276.md', 'S-64.md', 'notes.txt']), [
    'T-276.md',
    'S-64.md',
  ]);
});

test("the lead's script refuses an argument it does not know, and a flag with no ID", () => {
  for (const args of [['--bogus'], ['--replace-agreed'], ['--founder-agreed', 'everything']]) {
    const run = spawnSync(process.execPath, ['scripts/fold-pending-decisions.mjs', ...args], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(run.status, 1, args.join(' '));
    assert.match(run.stderr, /Unknown argument|must be followed by the one ID/);
  }
});

test("every table of DECISIONS.md's full list is kept by ID, T4 once (its rows were there three times)", () => {
  const tables = fullListTables(fs.readFileSync(decisionsFile, 'utf8'));
  assert.equal(tables.length, 19, 'P1 to P9 and T1 to T10');
  for (const { heading, ids } of tables) {
    assert.ok(ids.length > 0, heading);
    assert.ok(keptById(ids), `${heading}: one ID a row, each once, in order`);
  }
  const t4 = tables.find((t) => t.heading.startsWith('T4 '));
  // 41 when the three copies were made one; 42 since T-284 was folded in (step 2.93 part 5);
  // 43 since T-285 was folded in (step 2.98); 44 since T-298 (step 2.239); 45 since T-299 (step 2.203);
  // 46 since T-287 (step 2.46); 47 since T-291 (step 2.163); 48 since T-288 (step 2.97); 49 since T-294 (step 2.224);
  // 51 since T-312 (step 2.60); 50 since T-305 (step 2.56); 54 since step 2.223; 59 since step 2.225; 63 since step 2.227; 71 since step 2.226's eight (landing next).; 80 since step 2.112 (T-490 to T-497, T-499); 89 since step 2.128 (its nine T rows, T-498 among them); 93 since step 2.228 (T-500 to T-503); 96 since step 2.253 (T-519 to T-521); 106 since step 2.234 (T-504 to T-512, T-522); 110 since step 2.146 (T-513 to T-518 less those kept elsewhere)
  assert.equal(t4?.ids.length, 110);
});

test('every pending file in the folder folds into DECISIONS.md under the same rules, formatted', async () => {
  const names = pendingNames(fs.existsSync(folder) ? fs.readdirSync(folder) : []);
  const pending = names.map((name) => ({
    name,
    text: fs.readFileSync(path.join(folder, name), 'utf8'),
  }));
  // No --replace-agreed and no --founder-agreed: what the lane may do alone.
  const folded = foldAll(fs.readFileSync(decisionsFile, 'utf8'), pending);
  const options = { ...(await prettier.resolveConfig(decisionsFile)), filepath: decisionsFile };
  const formatted = await prettier.format(folded.text, options);
  assert.ok(await prettier.check(formatted, options));
  for (const { name } of pending) {
    const id = name.replace(/\.md$/, '');
    assert.ok(formatted.includes(`| ${id} `), `${id} is in DECISIONS.md once folded`);
  }
});
