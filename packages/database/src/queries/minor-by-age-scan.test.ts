// No query but the one SQL helper reads `people.is_minor` or `people.birth_date` for an
// answer (R-28, record 080): whether someone is a child is selected as isMinorSql(), so
// the rule is applied wherever an answer can reach a visitor (the public roster, the
// statistics, the game page and the tracker, Privacy settings), and the date never leaves
// the database. The only other places that name those columns are listed below with the
// reason; a new one fails here until it goes through the helper or is added to the list
// in review.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The files that may name the columns, and why. */
const allowed = new Map<string, string>([
  ['queries/minor-by-age-sql.ts', 'the one rule, R-28 in SQL'],
  [
    'queries/person-summary.ts',
    'the private columns, selected only for a role holding people.read_sensitive (T-76): staff, never a visitor',
  ],
  ['queries/insert-person.ts', 'writes the fields a people command was given; returns an id only'],
  [
    'queries/update-person.ts',
    'writes the fields a people command was given; returns a version only',
  ],
  ['db/schema-types.ts', "the tables' types, generated from the migrations; no query"],
]);

/** Every TypeScript file of the package's source that is not a test or the seed's data. */
function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    // The seed's made-up people as plain data (seed-data.ts): written by the commands.
    const isSource =
      entry.name.endsWith('.ts') &&
      entry.name !== 'seed-data.ts' &&
      !/\.test(-helper)?\.ts$/.test(entry.name);
    return isSource ? [full] : [];
  });
}

/** The code of a file without its comments, and without reading the helper's own answer. */
function codeOf(text: string): string {
  return (
    text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
      // Selecting the helper's answer under its usual name, and reading that name back.
      .replaceAll("isMinorSql().as('is_minor')", '')
      .replace(/\brow\.is_minor\b/g, '')
  );
}

const columns = /\b(is_minor|birth_date)\b/;

describe('only the one SQL helper reads whether a person is a child (R-28)', () => {
  it('finds the columns in no other source file', () => {
    const found = sourceFiles(src)
      .map((file) => path.relative(src, file).split(path.sep).join('/'))
      .filter((file) => !allowed.has(file))
      .filter((file) => columns.test(codeOf(readFileSync(path.join(src, file), 'utf8'))));
    expect(found).toEqual([]);
  });

  it('finds them where a query reads the column itself, so the scan would catch one', () => {
    expect(columns.test(codeOf(".select(['id', 'people.is_minor as is_minor'])"))).toBe(true);
    expect(columns.test(codeOf(".where('birth_date', '<', today)"))).toBe(true);
    expect(columns.test(codeOf("sql`people.is_minor`.as('minor')"))).toBe(true);
    // And not where the helper's answer is selected and read back, or in a comment.
    expect(columns.test(codeOf("isMinorSql().as('is_minor') // people.is_minor"))).toBe(false);
    expect(columns.test(codeOf('isMinor: row.is_minor,'))).toBe(false);
  });

  it('still lists only files that exist', () => {
    const files = new Set(
      sourceFiles(src).map((f) => path.relative(src, f).split(path.sep).join('/')),
    );
    expect([...allowed.keys()].filter((file) => !files.has(file))).toEqual([]);
  });
});
