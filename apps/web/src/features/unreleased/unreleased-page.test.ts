// Which page not built yet an address is (step 2.140): the placeholders the unknown-address
// routes draw in local work and tests, and nothing else.
import { describe, expect, it } from 'vitest';
import { unreleasedPageAt } from './unreleased-page.ts';

describe('unreleasedPageAt', () => {
  it('finds our own pages not built yet by their whole address', () => {
    expect(unreleasedPageAt(['find'])).toEqual({
      kind: 'platform',
      page: 'find',
      title: 'page.find',
    });
    expect(unreleasedPageAt(['account', 'inbox'])).toEqual({
      kind: 'platform',
      page: 'inbox',
      title: 'page.inbox',
    });
    for (const word of ['find', 'start', 'help', 'contact', 'status']) {
      expect(unreleasedPageAt([word])?.kind, word).toBe('platform');
    }
  });

  it('finds a league’s pages not built yet, a value standing for any one word', () => {
    expect(unreleasedPageAt(['north-valley', 'register'])).toEqual({
      kind: 'league',
      page: 'register',
      title: 'nav.register',
    });
    expect(unreleasedPageAt(['north-valley', 'news', 'a-post'])).toEqual({
      kind: 'league',
      page: 'news-post',
      title: 'page.newsPost',
    });
    expect(unreleasedPageAt(['north-valley', 'players', 'p1'])).toMatchObject({
      title: 'page.player',
    });
    expect(unreleasedPageAt(['north-valley', 'news'])).toMatchObject({ title: 'nav.news' });
  });

  it('finds the admin’s areas with no screen yet, and only the area itself', () => {
    for (const area of ['registration', 'standings', 'site', 'messages']) {
      expect(unreleasedPageAt(['north-valley', 'admin', area]), area).toEqual({
        kind: 'admin',
        area,
      });
    }
    expect(unreleasedPageAt(['north-valley', 'admin', 'registration', 'more'])).toBeNull();
    expect(unreleasedPageAt(['north-valley', 'admin', 'people'])).toBeNull();
    expect(unreleasedPageAt(['north-valley', 'admin', 'teams'])).toBeNull();
    expect(unreleasedPageAt(['north-valley', 'admin', 'no-such-area'])).toBeNull();
  });

  it('is nothing for a released page, an unknown address or a page with no placeholder', () => {
    for (const address of [
      ['north-valley'],
      ['north-valley', 'schedule'],
      ['north-valley', 'teams', 'owls'],
      ['north-valley', 'register', 'more'],
      ['north-valley', 'players'],
      ['north-valley', 'awards'],
      ['north-valley', 'invitation', 'token'],
      ['north-valley', 'no-such-page'],
      ['signin'],
      ['signin', 'kept-emails'],
      ['account'],
      ['find', 'more'],
      ['terms'],
      ['privacy'],
      ['north-valley', 'my'],
      ['Terms'],
    ]) {
      expect(unreleasedPageAt(address), address.join('/')).toBeNull();
    }
  });
});
