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

const planted = [
  ['words next to an expression', '<p>Hello {name}</p>', /Hello/],
  ['words after an expression', '<p>{count} items left</p>', /items left/],
  ['text with parentheses', '<p>Save (draft)</p>', /Save \(draft\)/],
  ['text with a semicolon', '<p>Wait; then go</p>', /Wait; then go/],
  ['a web address in text', '<p>See https://example.org/help</p>', /https/],
  ['a string in a ternary', "<p>{ok ? 'Yes' : t('x.y')}</p>", /Yes/],
  ['the other side of a ternary', "<p>{ok ? t('x.y') : 'Nope'}</p>", /Nope/],
  ['a string after &&', "<p>{ready && 'Ready now'}</p>", /Ready now/],
  ['a template with words', '<p>{`Hello ${name}`}</p>', /Hello/],
  ['a single-quoted attribute', "<b aria-label='Close menu' />", /Close menu/],
  ['a template attribute', '<b title={`Close ${x}`} />', /Close/],
  ['a ternary attribute', "<b alt={ok ? 'Good' : 'Bad'} />", /Good/],
  ['a heading prop', '<Card heading="Latest news" />', /Latest news/],
  ['a description prop', '<Card description="All the news" />', /All the news/],
  ['a text prop', '<Card text="Hi there" />', /Hi there/],
  ['a caption prop', '<Card caption="A photo" />', /A photo/],
  ['a tooltip prop', '<Card tooltip="More info" />', /More info/],
  ['a role description', '<b aria-roledescription="slide show" />', /slide show/],
  ['a value text', '<b aria-valuetext="half way" />', /half way/],
  ['a button value', '<button value="Send now" />', /Send now/],
  ['a submit input value', '<input type="submit" value="Go on" />', /Go on/],
  ['text in a nested element in an expression', '<ul>{xs.map((x) => <li>Item</li>)}</ul>', /Item/],
];

for (const [name, jsx, pattern] of planted) {
  test(`T-187 catches ${name}`, (t) => {
    const found = plant(t, {
      'apps/web/src/p.tsx': `export const P = () => (${nl}  <main>${jsx}</main>${nl});${nl}`,
    });
    assert.ok(found.length >= 1, `nothing found for ${jsx}`);
    assert.match(found.map((v) => v.message).join(nl), pattern);
  });
}

test('T-187 catches page metadata with words of its own', (t) => {
  const found = plant(t, {
    'apps/web/src/app/layout.ts':
      "export const metadata = { title: 'My League', description: `About us` };" + nl,
  });
  const text = found.map((v) => v.message).join(nl);
  assert.equal(found.length, 2, text);
  assert.match(text, /My League/);
});

test('T-187 lets generics, comparisons, t(...), keys, values and metadata keys pass', (t) => {
  const good = [
    'type Props = { readonly items: Array<string>; map: Map<string, number> };',
    'export const G = ({ a, b }: Props & { a: number; b: number }) => {',
    '  const small = a < b && b > a;',
    '  return (',
    "    <main className={a > 1 ? 'big' : 'small'} style={{ color: 'red' }}>",
    "      <h1>{t('page.home')}</h1>",
    "      <p>{ok ? t('a.b') : t('c.d')}</p>",
    '      <button type="button" value={t(\'x.y\')} aria-label="nav.menu" data-x="Fine" />',
    '      <input value="typed by someone" />',
    '      <span>{count} / {total} &nbsp; � {a === 1 ? 1 : 2}</span>',
    '      {/* Some comment */}',
    '      {x.map((i) => <b key={i}>{i}</b>)}',
    '    </main>',
    '  );',
    '};',
    '',
  ].join(nl);
  const found = plant(t, {
    'apps/web/src/g.tsx': good,
    'apps/web/src/app/meta.ts': "export const metadata = { title: t('shell.siteName') };" + nl,
  });
  assert.deepEqual(found, []);
});

test('the real repository has no interface text inside components', () => {
  const result = checkStructure(repoRoot, { only: ['T-187'] });
  assert.deepEqual(result.violations, []);
});
