// Every face a design can name is served from our own address (T5 §1, T-262, record 059):
// the web app links one rule set per face, from a package that carries the files under an
// open licence, and none of them asks another site for anything.
import { fontFamilies, fontKeys, fontStacks } from '@srleagues/site';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sheet = readFileSync(new URL('./font-faces.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);
const imports = [...sheet.matchAll(/@import '([^']+)';/g)].map((m) => m[1] ?? '');
const require = createRequire(import.meta.url);
/** The rules of one linked package file, and the folder they sit in. */
const linked = imports.map((specifier) => {
  const file = require.resolve(specifier);
  return { specifier, folder: dirname(file), css: readFileSync(file, 'utf8') };
});

describe('the faces of the designs', () => {
  it('links one package for each face a design can name, and nothing else', () => {
    expect(sheet.replace(/@import '[^']+';/g, '').trim()).toBe('');
    expect(imports).toHaveLength(fontKeys.length);
    for (const key of fontKeys) {
      const family = fontFamilies[key];
      const found = linked.filter(({ css }) => css.includes(`font-family: '${family}';`));
      expect(found, key).toHaveLength(1);
      // The design's list starts with the very name the rules give the face.
      expect(fontStacks[key].startsWith(`'${family}', `), key).toBe(true);
    }
  });

  it('takes every file from the package beside its rules, never from another site', () => {
    for (const { specifier, folder, css } of linked) {
      const sources = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1] ?? '');
      expect(sources.length, specifier).toBeGreaterThan(0);
      for (const source of sources) {
        expect(source, specifier).toMatch(/^\.\/files\/[a-z0-9-]+\.woff2$/);
        expect(existsSync(join(folder, source)), `${specifier} ${source}`).toBe(true);
      }
      expect(css, specifier).not.toMatch(/https?:|\/\/fonts\./);
    }
  });

  it('never holds up the page: text shows in the next face until its own arrives', () => {
    for (const { specifier, css } of linked) {
      const rules = css.match(/@font-face \{[^}]*\}/g) ?? [];
      expect(rules.length, specifier).toBeGreaterThan(0);
      for (const rule of rules) {
        expect(rule, specifier).toContain('font-display: swap;');
        // Each file covers a range of letters, so only the scripts a page uses are fetched.
        expect(rule, specifier).toContain('unicode-range:');
      }
    }
  });

  it('comes under an open licence that lets us serve it: the SIL Open Font License 1.1', () => {
    for (const { specifier, folder } of linked) {
      const about = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as {
        license?: string;
      };
      expect(about.license, specifier).toBe('OFL-1.1');
      expect(readFileSync(join(folder, 'LICENSE'), 'utf8'), specifier).toContain(
        'SIL OPEN FONT LICENSE Version 1.1',
      );
    }
  });

  it('pins each package to one exact version, as every dependency is', () => {
    const app = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { dependencies: Record<string, string> };
    for (const specifier of imports) {
      const name = specifier.split('/').slice(0, 2).join('/');
      expect(app.dependencies[name], name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});
