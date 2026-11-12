// T-183 and T-49: a migration never drops or renames something in one step. The
// version still running during a release reads the old names, so removing or
// renaming them at once breaks it. The safe way is two releases: first add the new
// thing while the old still works, release, then remove the old in a later file.
//
// That later file does drop something, so it is the one exception, and it is
// allowed only by name and checksum in `migrationDropsAllowed` (config.mjs), where
// the change that adds it is reviewed. There is no marker a migration can carry to
// allow itself. An entry stops counting the moment its file changes.
//
// Rejected:
// - every DROP statement except DROP INDEX, POLICY and TRIGGER;
// - inside ALTER, every DROP except DROP CONSTRAINT, and DROP DEFAULT, NOT NULL,
//   IDENTITY or EXPRESSION right after `ALTER [COLUMN] name` (or `ALTER DOMAIN name`).
//   So DROP COLUMN, DROP ATTRIBUTE, and the bare `ALTER TABLE t DROP c`, which also
//   drops a column (even one named `identity`), are rejected;
// - every RENAME, and SET SCHEMA (a move is a rename);
// - TRUNCATE (it empties a table the running version still uses), but not the
//   TRUNCATE privilege in GRANT or REVOKE;
// - any dynamic SQL: EXECUTE (other than EXECUTE FUNCTION/PROCEDURE in a trigger, and
//   GRANT/REVOKE EXECUTE ON) and format(...). This check reads SQL text with regular
//   expressions; it cannot see what SQL built at run time will do, so it cannot prove
//   dynamic SQL safe. A file that needs it is reviewed and listed like a drop.
//
// Comments, quoted names and string text are ignored. Function and DO bodies are
// read as SQL: dollar-quoted bodies (`$$...$$`, `$body$...$body$`) always, and
// single-quoted ones when they follow AS or DO.
import crypto from 'node:crypto';
import { violation } from './source.mjs';

export const rule = 'T-183';
export const title = 'no drop or rename in one migration step';

const dropStatementsAllowed = ['INDEX', 'POLICY', 'TRIGGER'];
const ident = String.raw`(?:"[^"]*"|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]*"|[A-Za-z_][\w$]*))*`;
// What may come right before DROP DEFAULT / NOT NULL / IDENTITY / EXPRESSION.
const alterColumn = new RegExp(String.raw`\bALTER\s+(?:COLUMN\s+|DOMAIN\s+)?${ident}\s*$`, 'i');

/**
 * The same checksum the migration runner records (packages/database/src/migrations/
 * checksum.ts): SHA-256 of the text with no byte-order mark and LF line endings.
 */
export function migrationChecksum(text) {
  const withoutMark = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return crypto
    .createHash('sha256')
    .update(withoutMark.replace(/\r\n/g, '\n'), 'utf8')
    .digest('hex');
}

export function check(repo) {
  const { migrationFolder, migrationDropsAllowed } = repo.config;
  const out = [];
  const config = 'scripts/structure/config.mjs';
  const configProblem = (message) => out.push({ rule, file: config, line: 1, message });

  const allowed = new Map();
  for (const entry of migrationDropsAllowed) {
    const name = typeof entry?.file === 'string' ? entry.file : String(entry?.file);
    if (typeof entry?.file !== 'string' || !entry.file.startsWith(migrationFolder)) {
      configProblem(
        `migrationDropsAllowed names ${name}, which is not in ${migrationFolder}. Only ` +
          'migrations can be allowed.',
      );
      continue;
    }
    if (typeof entry.reason !== 'string' || !entry.reason.trim()) {
      configProblem(
        `migrationDropsAllowed entry for ${name} has no reason. Say which release stopped ` +
          'using what it removes.',
      );
      continue;
    }
    if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
      configProblem(
        `migrationDropsAllowed entry for ${name} has no sha256 (64 lower-case hex characters).`,
      );
      continue;
    }
    if (!repo.file(entry.file)) {
      configProblem(
        `migrationDropsAllowed names ${name}, which does not exist. An entry allows one ` +
          'reviewed file; remove it, or write the file first.',
      );
      continue;
    }
    allowed.set(entry.file, entry);
  }

  for (const file of repo.files) {
    if (file.ext !== '.sql' || !file.rel.startsWith(migrationFolder)) continue;
    const found = findUnsafeChanges(file);
    const entry = allowed.get(file.rel);
    if (!entry) {
      out.push(...found);
      continue;
    }
    const checksum = migrationChecksum(file.text);
    if (entry.sha256 !== checksum) {
      out.push(
        violation(
          rule,
          file,
          undefined,
          'changed after it was allowed to drop or rename (its checksum is not the one in ' +
            `migrationDropsAllowed). Review it again and update the entry in ${config}. ` +
            `Its checksum is now ${checksum}.`,
        ),
      );
      out.push(...found);
    } else if (!found.length) {
      out.push(
        violation(
          rule,
          file,
          undefined,
          `no longer drops or renames anything: remove it from migrationDropsAllowed in ${config}.`,
        ),
      );
    }
  }
  return out;
}

function findUnsafeChanges(file) {
  const code = migrationCode(file.text);
  const out = [];
  const how =
    'T-49: release a version that no longer uses the old name first, then remove it in a ' +
    'later migration listed in migrationDropsAllowed (scripts/structure/config.mjs).';
  const quote = (at) =>
    code
      .slice(at, at + 60)
      .split(';')[0]
      .replace(/\s+/g, ' ')
      .trim();
  const statementStart = (at) => {
    const start = code.lastIndexOf(';', at - 1) + 1;
    return start + (code.slice(start).length - code.slice(start).trimStart().length);
  };
  const add = (at, message) => out.push(violation(rule, file, at, message));

  for (const match of code.matchAll(/\bDROP\b\s*([A-Za-z_]*)(\s+NULL\b)?/gi)) {
    const at = match.index;
    const before = code.slice(code.lastIndexOf(';', at - 1) + 1, at);
    const word = match[1].toUpperCase();
    let safe;
    if (!/\bALTER\b/i.test(before)) safe = dropStatementsAllowed.includes(word);
    else if (word === 'CONSTRAINT') safe = true;
    else if (['DEFAULT', 'IDENTITY', 'EXPRESSION'].includes(word)) safe = alterColumn.test(before);
    else if (word === 'NOT') safe = Boolean(match[2]) && alterColumn.test(before);
    else safe = false;
    if (!safe) add(at, `drops in one step ("${quote(at)}"). ${how}`);
  }
  for (const match of code.matchAll(/\bRENAME\b|\bSET\s+SCHEMA\b/gi)) {
    add(match.index, `renames in one step ("${quote(statementStart(match.index))}"). ${how}`);
  }
  for (const match of code.matchAll(/\bTRUNCATE\b/gi)) {
    // `GRANT TRUNCATE ON t` names a privilege; it empties nothing.
    if (/\b(?:GRANT|REVOKE)\b/i.test(code.slice(statementStart(match.index), match.index))) {
      continue;
    }
    add(
      match.index,
      `empties a table in one step ("${quote(match.index)}"), while the running version ` +
        `still uses it. ${how}`,
    );
  }
  for (const match of code.matchAll(
    /\bEXECUTE\b(?!\s+(?:FUNCTION|PROCEDURE|ON)\b)|\bformat\s*\(/gi,
  )) {
    add(
      match.index,
      `builds SQL at run time ("${quote(match.index)}"), which this check cannot read, so it ` +
        'cannot prove it safe. Write the statements out, or have the file reviewed and listed ' +
        'in migrationDropsAllowed (scripts/structure/config.mjs).',
    );
  }
  return out;
}

/**
 * The SQL as this check reads it, the same length and lines as `src`: comments,
 * quoted names and string text blanked. Function and DO bodies stay readable as
 * SQL, with a `;` where each body starts and ends, so their statements are read as
 * statements too.
 */
export function migrationCode(src) {
  const chars = src.split('');
  const out = src.split('');
  lexRange(chars, out, 0, chars.length);
  return out.join('');
}

/** Lexes chars[from, to) into `out`. Bodies are lexed by calling it again on their range. */
function lexRange(chars, out, from, to) {
  const at = (k) => (k >= from && k < to ? chars[k] : '');
  const blank = (start, end) => {
    for (let k = start; k < end; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  let i = from;
  while (i < to) {
    const c = chars[i];
    const next = at(i + 1);
    if (c === '-' && next === '-') {
      const start = i;
      while (i < to && chars[i] !== '\n') i++;
      blank(start, i);
    } else if (c === '/' && next === '*') {
      // Block comments nest in PostgreSQL.
      const start = i;
      let depth = 0;
      while (i < to) {
        if (chars[i] === '/' && at(i + 1) === '*') ((depth += 1), (i += 2));
        else if (chars[i] === '*' && at(i + 1) === '/') {
          depth -= 1;
          i += 2;
          if (depth === 0) break;
        } else i++;
      }
      blank(start, Math.min(i, to));
    } else if (c === "'") {
      const start = i;
      const escapes = /[eE]/.test(at(i - 1)) && !/[\w$]/.test(at(i - 2));
      i++;
      while (i < to) {
        if (escapes && chars[i] === '\\') i += 2;
        else if (chars[i] === "'" && at(i + 1) === "'") i += 2;
        else if (chars[i] === "'") break;
        else i++;
      }
      const end = Math.min(i, to); // the closing quote, or `to` when there is none
      const before = out.slice(Math.max(from, start - 40), escapes ? start - 1 : start).join('');
      if (/\b(?:AS|DO)\s*$/i.test(before)) {
        // A function or DO body: its own quotes are doubled. Undouble them in place
        // (`''` becomes ` '`, same length) and read the body as SQL.
        for (let k = start + 1; k < end - 1; k++) {
          if (chars[k] === "'" && chars[k + 1] === "'") {
            chars[k] = ' ';
            out[k] = ' ';
            k++;
          }
        }
        out[start] = ';';
        if (end < to) out[end] = ';';
        lexRange(chars, out, start + 1, end);
      } else blank(start + 1, end);
      i = end + 1;
    } else if (c === '"') {
      const start = i;
      i++;
      while (i < to && chars[i] !== '"') i++;
      blank(start + 1, Math.min(i, to));
      i++;
    } else if (c === '$' && !/[\w$]/.test(at(i - 1))) {
      const tag = /^\$(?:[A-Za-z_]\w*)?\$/.exec(chars.slice(i, Math.min(to, i + 64)).join(''))?.[0];
      if (!tag) {
        i++;
        continue;
      }
      // Find the matching closing tag, then read everything between as SQL.
      const bodyStart = i + tag.length;
      let close = -1;
      for (let k = bodyStart; k + tag.length <= to; k++) {
        if (chars[k] === '$' && chars.slice(k, k + tag.length).join('') === tag) {
          close = k;
          break;
        }
      }
      const bodyEnd = close === -1 ? to : close;
      out[i] = ';';
      blank(i + 1, bodyStart);
      lexRange(chars, out, bodyStart, bodyEnd);
      if (close === -1) i = to;
      else {
        out[close] = ';';
        blank(close + 1, close + tag.length);
        i = close + tag.length;
      }
    } else i++;
  }
}
