// T2 §1–2 and T9 §3: no SQL outside packages/database (and the migrations and
// seed under supabase/). Catches .sql files, `sql`-tagged templates, strings that
// read as SQL statements, and imports of database drivers.
import { isCodeFile, libraryIn, violation } from './source.mjs';

export const rule = 'SQL';
export const title = 'no SQL outside packages/database';

// Upper-case keywords are matched as SQL on their own. Lower-case text needs the
// shape of a statement, so interface text like "Select a team from the list" or
// "Delete from this season" does not trip it.
const ident = String.raw`"?[A-Za-z_][\w$]*"?(?:\."?[A-Za-z_][\w$]*"?)*`;
const keywords =
  'where|join|on|set|values|order|group|limit|inner|left|right|full|cross|returning|using|from';
const alias = String.raw`(?:\s+(?:as\s+)?(?!(?:${keywords})\b)[A-Za-z_]\w*)?`;
const clause =
  String.raw`(?:where\s+${ident}\s*(?:=|<>|!=|<=|>=|<|>|\bin\b|\bis\b|\bi?like\b)` +
  String.raw`|(?:(?:inner|left|right|full|cross)\s+)?join\s+${ident}` +
  String.raw`|(?:order|group)\s+by\s+${ident}|limit\s+(?:\d+|\$\d+|\?))`;

const statements = [
  /\bSELECT\b[\s\S]*?\bFROM\b/,
  /\bINSERT\s+INTO\b/,
  /\bUPDATE\s+[\w."]+\s+SET\b/,
  /\bDELETE\s+FROM\b/,
  /\b(?:CREATE|ALTER|DROP)\s+(?:OR\s+REPLACE\s+)?(?:UNIQUE\s+)?(?:TABLE|INDEX|VIEW|SCHEMA|FUNCTION|TRIGGER|POLICY|TYPE|EXTENSION|ROLE|SEQUENCE)\b/,
  /\bGRANT\s+\w+(?:\s*,\s*\w+)*\s+ON\b/,
  new RegExp(
    String.raw`\binsert\s+into\s+${ident}\s*(?:\(|(?:values|select|default\s+values)\b)`,
    'i',
  ),
  new RegExp(String.raw`\bupdate\s+${ident}${alias}\s+set\s+${ident}\s*=`, 'i'),
  new RegExp(
    String.raw`\bdelete\s+from\s+${ident}(?:${alias}\s+(?:where|using|returning)\b|\s*(?:;|$))`,
    'i',
  ),
  /\b(?:create|alter|drop)\s+table\b/i,
];

const selectStatement = new RegExp(
  String.raw`\bselect\s+(?:distinct\s+)?([\s\S]+?)\s+from\s+${ident}${alias}(\s+${clause}|\s*;)?`,
  'gi',
);
const selectItem = new RegExp(
  String.raw`^(?:\*|${ident}\.\*|${ident}(?:\s*\([\s\S]*\))?|\d+|\$\d+)(?:\s*::\s*\w+)?` +
    String.raw`(?:\s+(?:as\s+)?[A-Za-z_]\w*)?$`,
  'i',
);

/**
 * Lower-case `select ... from ...`: every item of the list must read as a column
 * or function, and something must mark it as SQL (a `*`, call, comma, dotted or
 * snake_case name, `$1`, `as`, a following clause, or a `;`).
 */
function looksLikeSelect(text) {
  for (const match of text.matchAll(selectStatement)) {
    const items = splitTopLevel(match[1]);
    if (!items.every((item) => selectItem.test(item))) continue;
    const marked = /[*(,]|\w\.\w|\$\d|[A-Za-z]_[A-Za-z]|\sas\s/i.test(match[1]);
    if (marked || match[2]) return true;
  }
  return false;
}

/** Splits on commas outside parentheses. */
function splitTopLevel(list) {
  const items = [];
  let depth = 0;
  let from = 0;
  for (let k = 0; k < list.length; k++) {
    if (list[k] === '(') depth++;
    else if (list[k] === ')') depth--;
    else if (list[k] === ',' && depth === 0) {
      items.push(list.slice(from, k).trim());
      from = k + 1;
    }
  }
  items.push(list.slice(from).trim());
  return items;
}

const isSql = (text) => statements.some((re) => re.test(text)) || looksLikeSelect(text);

export function check(repo) {
  const { sqlAllowedIn, databaseLibraries } = repo.config;
  const out = [];
  const where = 'SQL belongs in packages/database (queries) or supabase/migrations (schema).';
  for (const file of repo.files) {
    if (sqlAllowedIn.some((place) => file.rel.startsWith(place))) continue;
    if (file.ext === '.sql') {
      out.push(
        violation(rule, file, undefined, `is a .sql file outside packages/database. ${where}`),
      );
      continue;
    }
    if (!isCodeFile(file.rel)) continue;
    const { literals, imports } = file.lexed;
    for (const lit of literals) {
      if (lit.kind === 'template' && lit.tag && /sql$/i.test(lit.tag)) {
        out.push(violation(rule, file, lit.start, `has a ${lit.tag}\`...\` query. ${where}`));
        continue;
      }
      if (isSql(lit.value)) {
        const snippet = lit.value.trim().replace(/\s+/g, ' ').slice(0, 50);
        out.push(violation(rule, file, lit.start, `has SQL text ("${snippet}"). ${where}`));
      }
    }
    for (const imp of imports) {
      const target = repo.resolve(file, imp.spec);
      if (target.kind === 'library' && libraryIn(databaseLibraries, target.name)) {
        out.push(
          violation(
            rule,
            file,
            imp.start,
            `imports the database library '${target.name}'. Only packages/database talks to the database.`,
          ),
        );
      }
    }
  }
  return out;
}
