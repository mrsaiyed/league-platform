import { describe, expect, it } from 'vitest';
import { currentMenuPage } from './current-menu-page.ts';

const league = { slug: 'north-valley' };

describe('the page the menu marks', () => {
  it('is the page the address is on, whatever follows the question mark', () => {
    expect(currentMenuPage(league, '/north-valley')).toBe('home');
    expect(currentMenuPage(league, '/north-valley?start=league')).toBe('home');
    expect(currentMenuPage(league, '/north-valley/schedule?round=2')).toBe('schedule');
    expect(currentMenuPage(league, '/north-valley/standings/')).toBe('standings');
    expect(currentMenuPage(league, '/North-Valley/stats')).toBe('stats');
  });

  it('is the menu page a deeper page sits under', () => {
    expect(currentMenuPage(league, '/north-valley/teams/owls')).toBe('teams');
  });

  it('is none for a page the menu does not hold, or another league', () => {
    expect(currentMenuPage(league, '/north-valley/admin')).toBeNull();
    expect(currentMenuPage(league, '/north-valley/teamsters')).toBeNull();
    expect(currentMenuPage(league, '/harbor-city/schedule')).toBeNull();
    expect(currentMenuPage(league, '')).toBeNull();
  });
});
