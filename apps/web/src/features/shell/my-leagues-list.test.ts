// The person's own list of leagues (the account page, the front page): each league's name
// opens its public home, and beside a league they help run, "Admin" opens its admin (step
// 2.194's walk: the admin was otherwise found only behind the menu).
import { en } from '@srleagues/site';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LeagueMembership, MyLeague } from '@srleagues/core';
import { MyLeaguesList, runsSomething } from './my-leagues-list.tsx';

const leagueOf = (slug: string, memberships: readonly LeagueMembership[]): MyLeague => ({
  leagueId: `01900000-0000-7000-8000-00000000000${slug.length % 10}`,
  slug,
  name: `${slug} League`,
  status: 'live',
  memberships,
});
const adminLink = (slug: string) => `<a href="/${slug}/admin">${en['account.leagueAdmin']}</a>`;

describe('MyLeaguesList', () => {
  it("links each league's name to its home and, for its staff, Admin to its admin", () => {
    const html = renderToStaticMarkup(
      createElement(MyLeaguesList, {
        leagues: [leagueOf('still-waters', ['owner']), leagueOf('north-valley', ['on-a-team'])],
      }),
    );
    expect(html).toContain('href="/still-waters"');
    expect(html).toContain(adminLink('still-waters'));
    expect(html).toContain('href="/north-valley"');
    expect(html).not.toContain(adminLink('north-valley'));
  });
});

describe('runsSomething', () => {
  it('is true for the owner and every role that opens an area of the admin', () => {
    for (const role of [
      'owner',
      'admin',
      'registrar',
      'scheduler',
      'editor',
      'scorekeeper',
      'club_admin',
    ] as const) {
      expect(runsSomething([role]), role).toBe(true);
    }
  });

  it('is false for a coach, a captain and a player, who have no area there', () => {
    expect(runsSomething(['coach'])).toBe(false);
    expect(runsSomething(['captain'])).toBe(false);
    expect(runsSomething(['on-a-team'])).toBe(false);
    expect(runsSomething(['coach', 'on-a-team'])).toBe(false);
    expect(runsSomething(['coach', 'scorekeeper'])).toBe(true);
  });
});
