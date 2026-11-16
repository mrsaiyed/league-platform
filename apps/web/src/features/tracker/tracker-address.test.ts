import { describe, expect, it } from 'vitest';
import { isTrackerAddress } from './tracker-address.ts';

const league = { slug: 'north-valley' };

describe('the tracker’s addresses', () => {
  it('are a league’s score addresses, with or without a query', () => {
    expect(
      isTrackerAddress(league, '/north-valley/score/01900000-0000-7000-8000-006a00000002'),
    ).toBe(true);
    expect(isTrackerAddress(league, '/North-Valley/score/abc/?x=1')).toBe(true);
    expect(isTrackerAddress(league, '/north-valley/score/abc#top')).toBe(true);
  });

  it('are not the league’s other pages, nor another league’s tracker', () => {
    expect(isTrackerAddress(league, '/north-valley')).toBe(false);
    expect(isTrackerAddress(league, '/north-valley/score')).toBe(false);
    expect(isTrackerAddress(league, '/north-valley/score/')).toBe(false);
    // Nothing is under a game's tracker: such an address is "not found", in the league's frame.
    expect(isTrackerAddress(league, '/north-valley/score/abc/more')).toBe(false);
    expect(isTrackerAddress(league, '/north-valley/scores/abc')).toBe(false);
    expect(isTrackerAddress(league, '/north-valley/admin/games')).toBe(false);
    expect(isTrackerAddress(league, '/harbor-city/score/abc')).toBe(false);
    expect(isTrackerAddress(league, '')).toBe(false);
  });
});
