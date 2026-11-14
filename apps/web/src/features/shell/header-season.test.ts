import { describe, expect, it } from 'vitest';
import { headerSeason } from './header-season.ts';

const league = { slug: 'north-valley' };
const seasons = [
  { id: 's2', name: 'Fall 2026', slug: 'fall-2026', isCurrent: true },
  { id: 's1', name: 'Spring 2026', slug: 'spring-2026', isCurrent: false },
];

describe("the header's season picker", () => {
  it('shows the current season, and every season to choose from', () => {
    const picker = headerSeason(league, '/north-valley/standings', seasons);
    expect(picker?.value).toBe('fall-2026');
    expect(picker?.options).toEqual([
      { value: 'fall-2026', label: 'Fall 2026' },
      { value: 'spring-2026', label: 'Spring 2026' },
    ]);
    expect(picker?.action).toBe('/north-valley/standings');
    expect(picker?.keep).toEqual({});
  });

  it('shows the season the address asks for', () => {
    expect(headerSeason(league, '/north-valley/stats?season=spring-2026', seasons)?.value).toBe(
      'spring-2026',
    );
    // A season the league does not have: the page is "not found", the picker stays usable.
    expect(headerSeason(league, '/north-valley/stats?season=nope', seasons)?.value).toBe(
      'fall-2026',
    );
  });

  it("keeps the page's other choices, and never a second season", () => {
    const picker = headerSeason(
      league,
      '/north-valley/schedule?season=spring-2026&team=owls&round=2&round=3&empty=',
      seasons,
    );
    expect(picker?.action).toBe('/north-valley/schedule');
    expect(picker?.keep).toEqual({ team: 'owls', round: '2' });
    expect(headerSeason(league, '/north-valley?start=league', seasons)).toMatchObject({
      action: '/north-valley',
      keep: { start: 'league' },
    });
  });

  it('carries only plain names, and only a few', () => {
    const many = Array.from({ length: 20 }, (_, i) => `a${i}=1`).join('&');
    const picker = headerSeason(league, `/north-valley/stats?${many}&b%22c=x&__proto__=y`, seasons);
    expect(Object.keys(picker?.keep ?? {})).toHaveLength(8);
    expect(Object.keys(picker?.keep ?? {}).every((name) => /^a\d+$/.test(name))).toBe(true);
  });

  it('on a page under a menu page, goes to that menu page and carries nothing', () => {
    const picker = headerSeason(league, '/north-valley/teams/owls?season=spring-2026&x=1', seasons);
    expect(picker).toMatchObject({
      action: '/north-valley/teams',
      value: 'spring-2026',
      keep: {},
    });
  });

  it('is not there with one season, or on a page off the menu', () => {
    expect(headerSeason(league, '/north-valley/standings', seasons.slice(0, 1))).toBeNull();
    expect(headerSeason(league, '/north-valley/standings', [])).toBeNull();
    expect(headerSeason(league, '/north-valley/admin/teams', seasons)).toBeNull();
    expect(headerSeason(league, '/north-valley/games/g1', seasons)).toBeNull();
    expect(headerSeason(league, '/harbor-city/standings', seasons)).toBeNull();
  });
});
