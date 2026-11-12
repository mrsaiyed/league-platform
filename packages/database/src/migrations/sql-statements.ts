// Splits a migration file into its top-level statements, so the loader can check
// what a file does before it runs (no transaction control, not only comments).
// Comments are dropped; string text, quoted names and dollar-quoted bodies
// (function and DO bodies) are blanked, so a `;` or a keyword inside them never
// counts. SQL-standard bodies (`BEGIN ATOMIC ... END`) stay part of their statement.

export type TopLevelStatement = {
  /** The line the statement starts on (1-based). */
  line: number;
  /** The statement's text with comments removed and quoted contents blanked. */
  code: string;
};

/** Every top-level statement in `sql`, in order. A file of only comments has none. */
export function topLevelStatements(sql: string): TopLevelStatement[] {
  const { code, ends } = blankQuoted(sql);
  const pieces: TopLevelStatement[] = [];
  let from = 0;
  for (const end of [...ends, code.length]) {
    const text = code.slice(from, end);
    const lead = text.length - text.trimStart().length;
    if (text.trim()) {
      const line = code.slice(0, from + lead).split('\n').length;
      pieces.push({ line, code: text.trim() });
    }
    from = end + 1;
  }

  // `CREATE FUNCTION ... BEGIN ATOMIC stmt; stmt; END` is one statement.
  const statements: TopLevelStatement[] = [];
  for (let k = 0; k < pieces.length; k++) {
    const piece = pieces[k];
    if (!piece) continue;
    if (/\bBEGIN\s+ATOMIC\b/i.test(piece.code)) {
      let joined = piece.code;
      while (k + 1 < pieces.length) {
        const next = pieces[++k];
        if (!next) break;
        joined += '; ' + next.code;
        if (/^END$/i.test(next.code)) break;
      }
      statements.push({ line: piece.line, code: joined });
    } else statements.push(piece);
  }
  return statements;
}

/** The text with comments and quoted contents blanked (same length), and where each top-level `;` is. */
function blankQuoted(sql: string): { code: string; ends: number[] } {
  const out = sql.split('');
  const ends: number[] = [];
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  const at = (k: number) => sql.charAt(k);
  let i = 0;
  while (i < sql.length) {
    const c = at(i);
    if (c === '-' && at(i + 1) === '-') {
      const start = i;
      while (i < sql.length && at(i) !== '\n') i++;
      blank(start, i);
    } else if (c === '/' && at(i + 1) === '*') {
      // Block comments nest in PostgreSQL.
      const start = i;
      let depth = 0;
      while (i < sql.length) {
        if (at(i) === '/' && at(i + 1) === '*') {
          depth++;
          i += 2;
        } else if (at(i) === '*' && at(i + 1) === '/') {
          depth--;
          i += 2;
          if (depth === 0) break;
        } else i++;
      }
      blank(start, i);
    } else if (c === "'") {
      const start = i;
      const escapes = /[eE]/.test(at(i - 1)) && !/[\w$]/.test(at(i - 2));
      i++;
      while (i < sql.length) {
        if (escapes && at(i) === '\\') i += 2;
        else if (at(i) === "'" && at(i + 1) === "'") i += 2;
        else if (at(i) === "'") break;
        else i++;
      }
      blank(start + 1, i);
      i++;
    } else if (c === '"') {
      const start = i;
      i++;
      while (i < sql.length && at(i) !== '"') i++;
      blank(start + 1, i);
      i++;
    } else if (c === '$' && !/[\w$]/.test(at(i - 1))) {
      const tag = /^\$(?:[A-Za-z_]\w*)?\$/.exec(sql.slice(i, i + 64))?.[0];
      if (tag) {
        const close = sql.indexOf(tag, i + tag.length);
        const end = close === -1 ? sql.length : close + tag.length;
        blank(i + 1, end);
        i = end;
      } else i++;
    } else {
      if (c === ';') ends.push(i);
      i++;
    }
  }
  return { code: out.join(''), ends };
}
