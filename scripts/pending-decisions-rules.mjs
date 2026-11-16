// Folding a lane's pending decision rows into docs/specs/v1/DECISIONS.md (step 2.188, T-276,
// record 072). Kept apart from scripts/fold-pending-decisions.mjs, which reads and writes
// the files, so it can be tested by itself (tests/pending-decisions.test.mjs).
//
// A lane does not edit DECISIONS.md: two lanes that each add a row to the same table always
// touched the same lines (the end of the change log, or the end of a table, and Prettier
// pads every row of a table to its widest cell, so one longer cell changes every row). A
// lane writes its rows in a file of its own, docs/specs/v1/decisions-pending/<ID>.md, one
// file per decision, which never collides. Its shape:
//
//   # T-276
//
//   New
//
//   ## T9 — Quality and maintainability
//
//   | T-276 | The decision, in the words of the row | Agreed (delegated) |  |
//
//   ## Change log
//
//   | T-276 | New | Agreed (delegated): what it now says | Why |
//
// The line under the ID says what the file is: `New` (an ID the list does not hold yet) or
// `Change` (a decision already in the list whose words or status change). The file's name,
// its `# <ID>` and the first cell of every row in it are the same ID. Each `## <heading>`
// names a heading of DECISIONS.md (its words, without a link: "T9 — Quality and
// maintainability" for "### [T9 — Quality and maintainability](technical/…)"), and the rows
// under it go into the first table under that heading, with as many cells as the table has
// columns. At landing the lead folds them in and removes the files.
//
// Where a row goes: a table whose rows each have one ID, every ID once and in number order
// within its letter (the full list's tables) gets the row in its ID's place, and a `Change`
// row whose ID is already there replaces it. Any other table (the change log, "Decided for
// you, waiting for your yes": in the order things happened) gets the row at its end. Then
// the whole file is formatted by Prettier, as the format check would, so the tables are
// padded once, in the lead's commit.
//
// What is refused (nothing is written then), because only the founder's own words make a
// decision "Agreed" and nobody takes that back (T-199):
// - a `New` file whose ID the full list already holds (an ID used twice);
// - a `Change` that would replace a row whose status starts with "Agreed", unless the lead
//   names that ID with `--replace-agreed <ID>`;
// - a row whose status is exactly "Agreed" for a decision that is not technical (an ID not
//   starting "T-"), unless the lead names it with `--founder-agreed <ID>`, which the lead
//   does only while quoting the founder's words in the landing commit.
// Every row added or replaced is said in one line: the ID, the table, the old status and
// the new.

/** "T-276" → { letter: 'T', number: 276 }; undefined for anything else ("O-7, A-3"). */
export function parseId(cell) {
  const match = /^([A-Z]+)-(\d+)$/.exec(cell.trim());
  return match ? { letter: match[1], number: Number(match[2]) } : undefined;
}

/** The cells of a table row, trimmed. */
export const cellsOf = (line) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

const isRow = (line) => line.trim().startsWith('|');
const isDelimiter = (line) => /^\|(\s*:?-+:?\s*\|)+\s*$/.test(line.trim());
/** A heading's words: "### [T9 — Quality](technical/t9.md)" → "T9 — Quality". */
const headingWords = (line) =>
  line
    .replace(/^#+\s*/, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim();

/** Orders IDs as the full list does: by letter, then by number. */
export function compareIds(a, b) {
  const x = parseId(a);
  const y = parseId(b);
  if (!x || !y) return a < b ? -1 : a > b ? 1 : 0;
  if (x.letter !== y.letter) return x.letter < y.letter ? -1 : 1;
  return x.number - y.number;
}

/**
 * A pending file: { id, kind: 'New' | 'Change', rows: [{ heading, cells }] }. Throws, naming
 * the file, when its name, its `# <ID>` and its rows' IDs are not all the same ID, when it
 * does not say `New` or `Change` under its ID, or when it holds a row outside a
 * `## heading` or no row at all.
 */
export function parsePending(name, text) {
  const id = name.replace(/\.md$/, '');
  const lines = text.split(/\r?\n/);
  const title = lines.find((line) => line.trim() !== '') ?? '';
  if (title.trim() !== `# ${id}`) {
    throw new Error(`${name}: its first line must be "# ${id}", the ID in its name.`);
  }
  const kind = lines.slice(lines.indexOf(title) + 1).find((line) => line.trim() !== '');
  if (kind?.trim() !== 'New' && kind?.trim() !== 'Change') {
    throw new Error(
      `${name}: the line under "# ${id}" must be "New" (an ID not in the list yet) or "Change" (one already there).`,
    );
  }
  const rows = [];
  let heading;
  for (const line of lines) {
    if (/^## /.test(line)) heading = headingWords(line);
    else if (isRow(line)) {
      if (heading === undefined) throw new Error(`${name}: a row before any "## heading".`);
      const cells = cellsOf(line);
      if (cells[0] !== id) {
        throw new Error(`${name}: a row under "${heading}" is for ${cells[0]}, not ${id}.`);
      }
      rows.push({ heading, cells });
    }
  }
  if (rows.length === 0) throw new Error(`${name}: no row to fold in.`);
  return { id, kind: kind.trim(), rows };
}

/** The table under a heading: the line numbers of its header row and its last row. */
function tableUnder(lines, heading) {
  const at = lines.findIndex((line) => /^#+ /.test(line) && headingWords(line) === heading);
  if (at < 0) return undefined;
  for (let i = at + 1; i < lines.length && !/^#+ /.test(lines[i]); i += 1) {
    if (isRow(lines[i]) && isDelimiter(lines[i + 1] ?? '')) {
      let last = i + 1;
      while (last + 1 < lines.length && isRow(lines[last + 1])) last += 1;
      return { header: i, last };
    }
  }
  return undefined;
}

/**
 * The full list's tables (one under each "### [P1 — …](…)" heading): [{ heading, ids }],
 * the IDs in the order the table holds them.
 */
export function fullListTables(text) {
  const lines = text.split('\n');
  return lines
    .filter((line) => /^### \[/.test(line))
    .map((line) => {
      const heading = headingWords(line);
      const table = tableUnder(lines, heading);
      const ids = table
        ? lines.slice(table.header + 2, table.last + 1).map((row) => cellsOf(row)[0])
        : [];
      return { heading, ids };
    });
}

/** Whether a table's rows are kept by ID: one ID each, every ID once, in order per letter. */
export function keptById(ids) {
  if (ids.some((id) => !parseId(id)) || new Set(ids).size !== ids.length) return false;
  const lastOf = new Map();
  for (const id of ids) {
    const { letter, number } = parseId(id);
    if (lastOf.has(letter) && lastOf.get(letter) >= number) return false;
    lastOf.set(letter, number);
  }
  return true;
}

/** What the lead allows by name: { replaceAgreed: [ids], founderAgreed: [ids] }. */
const noneAllowed = { replaceAgreed: [], founderAgreed: [] };

/**
 * DECISIONS.md's text with one row folded in (not yet formatted), and what was done:
 * { text, change: { id, heading, action: 'added' | 'replaced', from, to } } (statuses; '—'
 * for a table with no Status column). Throws, naming the file, when the heading has no
 * table, the row has the wrong number of cells, or a rule above refuses it.
 */
export function foldRow(
  text,
  { heading, cells },
  kind,
  name = 'a pending row',
  allowed = noneAllowed,
) {
  const lines = text.split('\n');
  const table = tableUnder(lines, heading);
  if (!table) throw new Error(`${name}: DECISIONS.md has no table under "${heading}".`);
  const header = cellsOf(lines[table.header]);
  if (cells.length !== header.length) {
    throw new Error(
      `${name}: its row under "${heading}" has ${cells.length} cells; the table has ${header.length}.`,
    );
  }
  const statusAt = header.indexOf('Status');
  const statusOf = (row) => (statusAt >= 0 ? (row[statusAt] ?? '') : '—');
  const id = cells[0];
  const to = statusOf(cells);
  if (to === 'Agreed' && !id.startsWith('T-') && !allowed.founderAgreed.includes(id)) {
    throw new Error(
      `${name}: it marks ${id} "Agreed" under "${heading}". Only the founder's own words make a decision agreed; the lead folds it only with --founder-agreed ${id}, quoting them.`,
    );
  }
  const row = `| ${cells.join(' | ')} |`;
  const first = table.header + 2;
  const existing = lines.slice(first, table.last + 1).map((line) => cellsOf(line));
  const ids = existing.map((cellsHere) => cellsHere[0]);
  let at = table.last + 1;
  let replace = 0;
  let from = '';
  const parsed = parseId(id);
  if (parsed && keptById(ids)) {
    const same = ids.indexOf(id);
    if (same >= 0) {
      if (kind !== 'Change') {
        throw new Error(
          `${name}: ${id} is already under "${heading}", and the file says New. Use a new ID, or say Change if this changes ${id}.`,
        );
      }
      from = statusOf(existing[same]);
      if (from.startsWith('Agreed') && !allowed.replaceAgreed.includes(id)) {
        throw new Error(
          `${name}: it would replace ${id} under "${heading}", which is "${from}". An agreed row is not replaced unless the lead names it: --replace-agreed ${id}.`,
        );
      }
      at = first + same;
      replace = 1;
    } else {
      const mine = ids
        .map((other, i) => [other, i])
        .filter(([other]) => parseId(other).letter === parsed.letter);
      const after = mine.findIndex(([other]) => compareIds(other, id) > 0);
      if (after >= 0) at = first + mine[after][1];
      else if (mine.length > 0) at = first + mine[mine.length - 1][1] + 1;
    }
  }
  lines.splice(at, replace, row);
  return {
    text: lines.join('\n'),
    change: { id, heading, action: replace ? 'replaced' : 'added', from, to },
  };
}

/** One line saying what a fold did, for the lead to read. */
export const sayChange = ({ id, heading, action, from, to }) =>
  action === 'replaced'
    ? `replaced ${id} in "${heading}": ${from} → ${to}`
    : `added ${id} to "${heading}": (none) → ${to}`;

/**
 * Every pending file folded in, in ID order: `pending` is [{ name, text }]; returns
 * { text, changes } (the text not yet formatted). Throws on the first file refused, so
 * nothing is written.
 */
export function foldAll(text, pending, allowed = noneAllowed) {
  let folded = text;
  const changes = [];
  const listed = new Set(fullListTables(text).flatMap((table) => table.ids));
  const ordered = [...pending].sort((a, b) =>
    compareIds(a.name.replace(/\.md$/, ''), b.name.replace(/\.md$/, '')),
  );
  for (const { name, text: own } of ordered) {
    const { id, kind, rows } = parsePending(name, own);
    if (kind === 'New' && listed.has(id)) {
      throw new Error(
        `${name}: says New, but the full list already holds ${id}. Use a new ID, or say Change.`,
      );
    }
    for (const row of rows) {
      const done = foldRow(folded, row, kind, name, allowed);
      folded = done.text;
      changes.push(done.change);
    }
  }
  return { text: folded, changes };
}

/** The pending files of a folder listing: every "<ID>.md" (not the folder's README). */
export const pendingNames = (names) =>
  names.filter((name) => parseId(name.replace(/\.md$/, '')) && name.endsWith('.md'));
