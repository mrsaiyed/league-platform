// How the English messages are kept (step 2.188, record 072): one file per area in ./en/,
// every one joined by en.ts, keys in alphabetical order inside each file (so two steps
// adding keys to one file rarely touch the same lines), and no key in two files (a second
// one would quietly win when en.ts joins them).
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { en } from './en.ts';

const folder = new URL('./en/', import.meta.url);
const files = readdirSync(folder).filter((name) => name.endsWith('.ts'));
const keysOf = (name: string) =>
  [...readFileSync(new URL(name, folder), 'utf8').matchAll(/^ {2}'([^']+)':/gm)].map(
    (match) => match[1] ?? '',
  );
const index = readFileSync(new URL('./en.ts', import.meta.url), 'utf8');

describe('the English message files', () => {
  it('are each joined by en.ts', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) expect(index, name).toContain(`from './en/${name}'`);
  });
  it('keep their keys in alphabetical order', () => {
    for (const name of files) {
      const keys = keysOf(name);
      expect(keys.length, name).toBeGreaterThan(0);
      expect(keys, name).toEqual([...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    }
  });
  it('hold every key once, and only the keys en holds', () => {
    const all = files.flatMap(keysOf);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(Object.keys(en).sort());
  });
});
