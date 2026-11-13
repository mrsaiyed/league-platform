// T-187: the structure scan fails when a component holds interface text of its own.
// Planted in a throwaway repository, beside the check that the real repository passes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkStructure } from '../scripts/structure/index.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function plant(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'interface-text-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  write(
    'package.json',
    JSON.stringify({ name: 'fixture', private: true, workspaces: ['apps/web'] }),
  );
  write(
    'apps/web/package.json',
    JSON.stringify({ name: '@srleagues/web', exports: { '.': './index.ts' } }),
  );
  write('apps/web/index.ts', 'export {};\n');
  for (const [rel, text] of Object.entries(files)) write(rel, text);
  return checkStructure(root, { only: ['T-187'] }).violations;
}

const nl = String.fromCharCode(10);

test('T-187 catches words between tags, in an expression and in an attribute', (t) => {
  const bad = [
    'export const A = () => (',
    '  <main><h1>Standings</h1><p>{"Hello there"}</p><button aria-label="Close menu" /></main>',
    ');',
    '',
  ].join(nl);
  const found = plant(t, { 'apps/web/src/a.tsx': bad });
  const text = found.map((v) => v.message).join(nl);
  assert.equal(found.length, 3, text);
  assert.match(text, /Standings/);
  assert.match(text, /Hello there/);
  assert.match(text, /Close menu/);
  assert.ok(found.every((v) => v.rule === 'T-187' && v.file === 'apps/web/src/a.tsx'));
});

test('T-187 lets t(key), numbers, comparisons, comments and tests pass', (t) => {
  const good = [
    '// <p>Standings</p>',
    "export const B = () => <main><h1>{t('page.home')}</h1><span>{count} / {total}</span><b aria-label={t('nav.menu')} /></main>;",
    'const f = (a: number) => a > 1 && a < 2;',
    '',
  ].join(nl);
  const found = plant(t, {
    'apps/web/src/b.tsx': good,
    'apps/web/src/c.test.tsx': 'export const T = () => <p>Standings</p>;' + nl,
  });
  assert.deepEqual(found, []);
});

test('the real repository has no interface text inside components', () => {
  const result = checkStructure(repoRoot, { only: ['T-187'] });
  assert.deepEqual(result.violations, []);
});
