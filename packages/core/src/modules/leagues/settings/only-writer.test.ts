// The names settings are written by one command only (step 2.162, record 065). The rule
// that a child is shown in full only with the parents' confirmation lives in what the
// command `leagues.set_setting` accepts; a second writer (an importer, a copy from
// another league, a restore, a hand-written insert) could store a confirmation nobody
// gave. This test reads the code of the whole repository and fails if anything other
// than the settings commands writes a setting, or if the two names settings' keys are
// written into code anywhere but their declarations.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const skipped = new Set(['node_modules', '.next', '.local', '.git', 'dist', 'build', 'out']);

/** Every code file under these folders, as a path from the repository root. */
function codeFiles(...folders: string[]): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skipped.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|mjs|js|cjs|sql)$/.test(entry.name)) {
        found.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  };
  for (const folder of folders) {
    const dir = path.join(root, folder);
    if (fs.existsSync(dir)) walk(dir);
  }
  return found;
}

const isTest = (file: string) => /\.test(-helper)?\.|test-helper|\/tests?\//.test(file);
const product = codeFiles('packages', 'apps', 'scripts').filter((file) => !isTest(file));

/** The product files whose text matches, apart from those allowed. */
function writersOf(pattern: RegExp, allowed: readonly string[]): string[] {
  return product.filter((file) => {
    if (allowed.includes(file)) return false;
    return pattern.test(fs.readFileSync(path.join(root, file), 'utf8'));
  });
}

describe('one writer of the names settings (record 065)', () => {
  it('reads the code it guards', () => {
    expect(product).toContain('packages/core/src/modules/leagues/commands/set-setting.ts');
    expect(product).toContain('packages/database/src/queries/write-setting-value.ts');
    expect(product.length).toBeGreaterThan(200);
  });

  it('stores a setting only through leagues.set_setting and leagues.clear_setting', () => {
    expect(
      writersOf(/\.writeSetting\(/, ['packages/core/src/modules/leagues/commands/set-setting.ts']),
    ).toEqual([]);
    expect(
      writersOf(/\.clearSetting\(/, [
        'packages/core/src/modules/leagues/commands/clear-setting.ts',
      ]),
    ).toEqual([]);
    // S-109: a store's own clearing for the first-child put-back, called in one place.
    expect(
      writersOf(/\.clearLeagueSetting\(/, [
        'packages/core/src/modules/leagues/commands/clear-setting.ts',
      ]),
    ).toEqual([]);
  });

  it('writes the setting_values table in the two database queries the store uses, and nowhere else', () => {
    const writes =
      /(insert\s+into|update|delete\s+from)\s+(public\.)?setting_values\b|(insertInto|updateTable|deleteFrom)\(\s*['"]setting_values['"]/i;
    expect(
      writersOf(writes, [
        'packages/database/src/queries/write-setting-value.ts',
        'packages/database/src/queries/delete-setting-value.ts',
      ]),
    ).toEqual([]);
  });

  it("names the two names settings' keys only in their declarations", () => {
    expect(
      writersOf(/['"`]privacy\.(publicNames|childrenInFullConfirmed)['"`]/, [
        'packages/core/src/modules/leagues/settings/declarations.ts',
      ]),
    ).toEqual([]);
  });

  it('would notice a second writer', () => {
    const text = "await db.insertInto('setting_values').values(row)";
    expect(/(insertInto|updateTable|deleteFrom)\(\s*['"]setting_values['"]/i.test(text)).toBe(true);
    expect(
      /['"`]privacy\.(publicNames|childrenInFullConfirmed)['"`]/.test(
        "key: 'privacy.childrenInFullConfirmed'",
      ),
    ).toBe(true);
  });
});
