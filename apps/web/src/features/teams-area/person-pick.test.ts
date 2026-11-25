import { describe, expect, it } from 'vitest';
import { pickOf } from './person-pick.ts';

describe('pickOf (step 2.90)', () => {
  it('reads a searched name and a page', () => {
    expect(pickOf({ q: '  Zara ', page: '2' })).toEqual({ search: 'Zara', page: 2 });
  });

  it('shows the first page unsearched when nothing was asked', () => {
    expect(pickOf({})).toEqual({ search: undefined, page: 1 });
    expect(pickOf({ q: '   ' })).toEqual({ search: undefined, page: 1 });
  });

  it('never searches by an email address', () => {
    expect(pickOf({ q: 'someone@example.test' }).search).toBeUndefined();
  });

  it('reads a curly apostrophe as a plain one', () => {
    expect(pickOf({ q: 'o’neill' }).search).toBe("o'neill");
  });

  it('takes a page that is not a whole number from one up as the first', () => {
    for (const page of ['0', '-1', '1.5', 'two', '100000']) {
      expect(pickOf({ page }).page).toBe(1);
    }
    expect(pickOf({ page: ['2', '3'] }).page).toBe(1);
  });

  it('cuts a long search to 100 characters', () => {
    expect(pickOf({ q: 'a'.repeat(150) }).search).toHaveLength(100);
  });
});
