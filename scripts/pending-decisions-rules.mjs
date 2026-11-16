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
//   ## T9 — Quality and maintainability
//
//   | T-276 | The decision, in the words of the row | Agreed (delegated) |  |
//
//   ## Change log
//
//   | T-276 | New | Agreed (delegated): what it now says | Why |
//
// Each `## <heading>` names a heading of DECISIONS.md (its words, without a link: "T9 —
// Quality and maintainability" for "### [T9 — Quality and maintainability](technical/…)"),
// and the rows under it go into the first table under that heading, with as many cells as
// the table has columns. At landing the lead folds them in and removes the files.
//
// Where a row goes: a table whose rows each have one ID, every ID once and in number order
// within its letter (the full list's tables) gets the row in its ID's place, and a row whose
// ID is already there replaces it (a decision whose status or words change). Any other table
// (the change log, "Decided for you, waiting for your yes": in the order things happened)
// gets the row at its end. Then the whole file is formatted by Prettier, as the format
// check would, so the tables are padded once, in the lead's commit.

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
 * A pending file's rows: [{ heading, cells }]. Throws, naming the file, when it holds a
 * row outside a `## heading` or no row at all.
 */
export function parsePending(name, text) {
  const rows = [];
  let heading;
  for (const line of text.split(/\r?\n/)) {
    if (/^## /.test(line)) heading = headingWords(line);
    else if (isRow(line)) {
      if (heading === undefined) throw new Error(`${name}: a row before any "## heading".`);
      rows.push({ heading, cells: cellsOf(line) });
    }
  }
  if (rows.length === 0) throw new Error(`${name}: no row to fold in.`);
  return rows;
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

/** Whether a table's rows are kept by ID: one ID each, every ID once, in order per letter. */
function keptById(ids) {
  if (ids.some((id) => !parseId(id)) || new Set(ids).size !== ids.length) return false;
  const lastOf = new Map();
  for (const id of ids) {
    const { letter, number } = parseId(id);
    if (lastOf.has(letter) && lastOf.get(letter) >= number) return false;
    lastOf.set(letter, number);
  }
  return true;
}

/**
 * DECISIONS.md's text with one row folded in (not yet formatted). Throws when the heading
 * has no table or the row has the wrong number of cells.
 */
export function foldRow(text, { heading, cells }, name = 'a pending row') {
  const lines = text.split('\n');
  const table = tableUnder(lines, heading);
  if (!table) throw new Error(`${name}: DECISIONS.md has no table under "${heading}".`);
  const columns = cellsOf(lines[table.header]).length;
  if (cells.length !== columns) {
    throw new Error(
      `${name}: its row under "${heading}" has ${cells.length} cells; the table has ${columns}.`,
    );
  }
  const row = `| ${cells.join(' | ')} |`;
  const first = table.header + 2;
  const ids = lines.slice(first, table.last + 1).map((line) => cellsOf(line)[0]);
  let at = table.last + 1;
  let replace = 0;
  const id = parseId(cells[0]);
  if (id && keptById(ids)) {
    const same = ids.indexOf(cells[0]);
    if (same >= 0) {
      at = first + same;
      replace = 1;
    } else {
      const mine = ids
        .map((other, i) => [other, i])
        .filter(([other]) => parseId(other).letter === id.letter);
      const after = mine.findIndex(([other]) => compareIds(other, cells[0]) > 0);
      if (after >= 0) at = first + mine[after][1];
      else if (mine.length > 0) at = first + mine[mine.length - 1][1] + 1;
    }
  }
  lines.splice(at, replace, row);
  return lines.join('\n');
}

/**
 * Every pending file folded in, in ID order: `pending` is [{ name, text }]; returns the new
 * text, not yet formatted.
 */
export function foldAll(text, pending) {
  let folded = text;
  const ordered = [...pending].sort((a, b) =>
    compareIds(a.name.replace(/\.md$/, ''), b.name.replace(/\.md$/, '')),
  );
  for (const { name, text: own } of ordered) {
    for (const row of parsePending(name, own)) folded = foldRow(folded, row, name);
  }
  return folded;
}

/** The pending files of a folder listing: every "<ID>.md" (not the folder's README). */
export const pendingNames = (names) =>
  names.filter((name) => parseId(name.replace(/\.md$/, '')) && name.endsWith('.md'));
