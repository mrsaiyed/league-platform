import { describe, expect, it } from 'vitest';
import { findQuery, pickOf, pickQuery } from './person-pick.ts';

describe('pickOf (step 2.90)', () => {
  it('reads a searched name and a page', () => {
    expect(pickOf({ q: '  Zara ', page: '2' })).toEqual({
      search: 'Zara',
      page: 2,
      byNameOnly: false,
    });
  });

  it('shows the first page unsearched when nothing was asked', () => {
    const first = { search: undefined, page: 1, byNameOnly: false };
    expect(pickOf({})).toEqual(first);
    expect(pickOf({ q: '   ' })).toEqual(first);
  });

  it('never searches by an email address', () => {
    expect(pickOf({ q: 'someone@example.test' })).toEqual({
      search: undefined,
      page: 1,
      byNameOnly: true,
    });
    // "Find" never puts the email in the address, only the marker the page says it by.
    expect(findQuery(' someone@example.test ')).toEqual({ find: 'by-name' });
    expect(pickOf(findQuery('someone@example.test')).byNameOnly).toBe(true);
    expect(pickOf({ q: 'Zara' }).byNameOnly).toBe(false);
  });

  it('is the one rule for what "Find" makes of what was typed', () => {
    expect(findQuery('  Zara ')).toEqual({ q: 'Zara' });
    expect(findQuery('   ')).toEqual({});
    expect(findQuery('o’neill')).toEqual({ q: "o'neill" });
    expect(findQuery('a'.repeat(150))['q']).toHaveLength(100);
    for (const typed of ['  Zara ', 'o’neill', '']) {
      expect(pickOf(findQuery(typed)).search).toBe(pickOf({ q: typed }).search);
    }
  });

  it('builds the address query that shows the same search and page again', () => {
    expect(pickQuery(pickOf({ q: 'Zara', page: '3' }))).toEqual({ q: 'Zara', page: '3' });
    expect(pickQuery(pickOf({ q: 'Zara', page: '3' }), 4)).toEqual({ q: 'Zara', page: '4' });
    expect(pickQuery(pickOf({}))).toEqual({});
    expect(pickQuery(pickOf({ q: 'x@y.test', page: '2' }))).toEqual({ page: '2' });
  });

  it('reads a curly apostrophe as a plain one', () => {
    expect(pickOf({ q: 'o’neill' }).search).toBe("o'neill");
  });

  it('takes a page that is not a whole number from one up as the first', () => {
    for (const page of ['0', '-1', '1.5', 'two', '100000', '1e1', '0x2', '+2', ' 2', '2.0', '']) {
      expect(pickOf({ page }).page).toBe(1);
    }
    expect(pickOf({ page: ['2', '3'] }).page).toBe(1);
    expect(pickOf({ page: '10000' }).page).toBe(10_000);
  });

  it('cuts a long search to 100 characters', () => {
    expect(pickOf({ q: 'a'.repeat(150) }).search).toHaveLength(100);
  });
});
