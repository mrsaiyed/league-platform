// The proof of step 2.188's split of the English messages: the object that en.ts joins
// from ./en/ holds exactly the keys and texts the one file held before the split. The
// snapshot beside it was written from the old en.ts just before the split, by importing it.
// Both are kept only for as long as the proof needs (record 072): the lead removes them in
// the commit that lands step 2.188, once GitHub has passed the lane, because any later step
// that adds or changes a message would make them fail.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { en } from './en.ts';

const before: Record<string, string> = JSON.parse(
  readFileSync(new URL('./en-before-split.test-fixture.json', import.meta.url), 'utf8'),
);

describe('the split of the English messages (step 2.188)', () => {
  it('has every key of the old file, and no other', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(before).sort());
    expect(Object.keys(en)).toHaveLength(1495);
  });
  it('has the same text for every key', () => {
    for (const [key, text] of Object.entries(before)) {
      expect(en[key as keyof typeof en], key).toBe(text);
    }
    expect({ ...en }).toStrictEqual(before);
  });
});
