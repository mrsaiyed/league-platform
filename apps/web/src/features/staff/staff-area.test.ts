import { describe, expect, it } from 'vitest';
import { isStaffAddress, staffPlaceAt } from './staff-area.ts';

const league = { slug: 'north-valley' };

describe('where in the admin an address is', () => {
  it('knows the admin’s home and everything under it', () => {
    expect(isStaffAddress(league, '/north-valley/admin')).toBe(true);
    expect(isStaffAddress(league, '/north-valley/admin/')).toBe(true);
    expect(isStaffAddress(league, '/north-valley/admin?x=1')).toBe(true);
    expect(isStaffAddress(league, '/north-valley/admin/teams/abc')).toBe(true);
  });

  it('reads an address as it is written: the routes tell capitals from small letters', () => {
    // `/…/Admin/teams` is no page of the admin, so it is not framed as one.
    expect(isStaffAddress(league, '/north-valley/Admin/teams')).toBe(false);
    expect(isStaffAddress(league, '/North-Valley/admin')).toBe(false);
    expect(staffPlaceAt(league, '/north-valley/Admin', ['teams'])).toBeNull();
    expect(staffPlaceAt(league, '/north-valley/admin/Teams', ['teams'])).toBeNull();
  });

  it('is not fooled by a public page, the tracker or a longer word', () => {
    expect(isStaffAddress(league, '/north-valley')).toBe(false);
    expect(isStaffAddress(league, '/north-valley/teams')).toBe(false);
    expect(isStaffAddress(league, '/north-valley/administrators')).toBe(false);
    expect(isStaffAddress(league, '/north-valley/score/game-1')).toBe(false);
    expect(isStaffAddress(league, '/harbor-city/admin')).toBe(false);
  });

  it('names the area a page is in or under, among the person’s own', () => {
    const areas = ['teams', 'schedule', 'games'] as const;
    expect(staffPlaceAt(league, '/north-valley/admin', areas)).toBe('home');
    expect(staffPlaceAt(league, '/north-valley/admin/teams', areas)).toBe('teams');
    expect(staffPlaceAt(league, '/north-valley/admin/teams/abc?done=1', areas)).toBe('teams');
    expect(staffPlaceAt(league, '/north-valley/admin/schedule/import', areas)).toBe('schedule');
    // An area that is not this person's, or no area at all, marks nothing.
    expect(staffPlaceAt(league, '/north-valley/admin/settings', areas)).toBeNull();
    expect(staffPlaceAt(league, '/north-valley/admin/no-such-area', areas)).toBeNull();
    expect(staffPlaceAt(league, '/north-valley/admin/teamsters', areas)).toBeNull();
  });
});
