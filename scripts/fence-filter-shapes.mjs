// How the two-league test's standing check reads a query file (step 2.224, T-294):
// scripts/fence-filter-check.mjs finds the league filters it takes out with these, and
// tests/fence-filter-check.test.mjs checks them on sample text.
//
// - filtersIn: each league filter of a known shape, and what is left when it is taken out.
// - fingerprintsOf: for each filter, a short print of its text and the lines around it, so
//   an excuse keyed by position (`file.ts#n`) cannot slide onto another filter unnoticed.
// - unknownComparisons: each `league_id` comparison that no known shape covers (not a join
//   equality, not a written value), so a filter in a new shape is never skipped in silence.
import { createHash } from 'node:crypto';

/** What a league filter looks like, and what is left when it is taken out. */
export const shapes = [
  // .where('league_id', '=', scope.leagueId), .where('t.league_id', '=', leagueId)
  { pattern: /\n?[ \t]*\.where\(\s*'(?:\w+\.)?league_id',\s*'=',\s*[\w.]+\s*\)/g, gone: '' },
  // the leagues table itself: .where('id', '=', scope.leagueId)
  { pattern: /\n?[ \t]*\.where\(\s*'(?:\w+\.)?id',\s*'=',\s*scope\.leagueId\s*\)/g, gone: '' },
  // SQL text: t.league_id = ${scope.leagueId}, league_id = ${league}
  { pattern: /\b(?:\w+\.)?league_id\s*=\s*\$\{[^}]+\}/g, gone: 'true' },
];

/** Each filter of a known shape: where it starts, how long it is, its text, its stand-in. */
export function filtersIn(text) {
  const found = [];
  for (const { pattern, gone } of shapes) {
    for (const match of text.matchAll(pattern)) {
      found.push({ at: match.index, length: match[0].length, text: match[0].trim(), gone });
    }
  }
  return found.sort((x, y) => x.at - y.at);
}

const lineAt = (text, index) => text.slice(0, index).split('\n').length;

/**
 * One print (8 hex characters) per filter: its text, the lines from two before it to two
 * after it (spaces collapsed), and, for filters alike in both, which of them it is.
 */
export function fingerprintsOf(text, filters = filtersIn(text)) {
  const lines = text.split('\n');
  const seen = new Map();
  return filters.map((filter) => {
    const start = filter.at + Math.max(0, text.slice(filter.at).search(/\S/));
    const first = lineAt(text, start) - 1;
    const last = lineAt(text, filter.at + filter.length) - 1;
    const around = lines
      .slice(Math.max(0, first - 2), last + 3)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const key = `${filter.text}\n${around}`;
    const nth = seen.get(key) ?? 0;
    seen.set(key, nth + 1);
    return createHash('sha256').update(`${key}\n${nth}`).digest('hex').slice(0, 8);
  });
}

/** The text with its comments blanked out, every character keeping its place. */
const withoutComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

const operator = /^(?:=|==|<>|!=|<|>|<=|>=|in|not in|is|is not|is distinct from|like)$/i;

/**
 * Each `league_id` comparison no filter of a known shape covers, with its line: a quoted
 * column compared through an operator (`e('s.league_id', '=', x)`, `.where('league_id',
 * 'in', ids)`) or a column of SQL text (`league_id = any(...)`). A join equality (the other
 * side is a league_id too) and a written value (`league_id: x`, a column list) are not
 * comparisons.
 */
export function unknownComparisons(text, filters = filtersIn(text)) {
  const plain = withoutComments(text);
  const covered = (index) => filters.some((f) => index >= f.at && index < f.at + f.length);
  const found = [];
  const quoted = /'(?:\w+\.)?league_id'\s*,\s*'([^']+)'\s*,\s*([^,)]+)/g;
  for (const match of plain.matchAll(quoted)) {
    if (!operator.test(match[1].trim())) continue;
    if (/^'(?:\w+\.)?league_id'$/.test(match[2].trim())) continue;
    found.push(match.index);
  }
  const bare =
    /(?<!['\w.])(?:\w+\.)?league_id\s*(?:={1,3}|<>|!==?|[<>]=?|\bin\b|\bis\b|\bnot\b)\s*(\S*)/gi;
  for (const match of plain.matchAll(bare)) {
    if (/^(?:\w+\.)?league_id\b/.test(match[1])) continue;
    found.push(match.index);
  }
  const lines = text.split('\n');
  return found
    .filter((index) => !covered(index))
    .sort((x, y) => x - y)
    .map((index) => {
      const line = lineAt(text, index);
      return { line, text: lines[line - 1].trim() };
    });
}
