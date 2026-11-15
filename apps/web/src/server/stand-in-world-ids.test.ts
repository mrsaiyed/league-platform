// The one world's ids are version 7 UUIDs, in the order they were made, as the database's.
import { describe, expect, it } from 'vitest';
import { newId } from './stand-in-world-ids.ts';

describe('the made-up world’s new ids', () => {
  it('are version 7 UUIDs of the right variant', () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('sort in the order they were made, within one millisecond too', () => {
    const made = Array.from({ length: 200 }, () => newId(1_800_000_000_000));
    expect([...made].sort()).toEqual(made);
    expect(new Set(made).size).toBe(made.length);
    const later = newId(1_800_000_000_001);
    expect(later > (made.at(-1) ?? '')).toBe(true);
  });
});
