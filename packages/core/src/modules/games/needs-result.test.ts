import { describe, expect, it } from 'vitest';
import { needsResult, oldestFirst } from './needs-result.ts';

// Fixed times: the league plays in Chicago, where midnight of 16 November is 06:00 UTC.
const beforeMidnight = '2026-11-16T05:30:00.000Z'; // 11:30 PM on the 15th, Chicago
const afterMidnight = Date.parse('2026-11-16T06:20:00.000Z'); // 12:20 AM on the 16th, Chicago

describe('needsResult', () => {
  it('counts a game under way however long ago it started, across the midnight too', () => {
    expect(needsResult({ status: 'live', startsAt: beforeMidnight }, afterMidnight)).toBe(true);
    expect(
      needsResult({ status: 'live', startsAt: '2026-11-01T18:00:00.000Z' }, afterMidnight),
    ).toBe(true);
    // Started early, before its time, or given none.
    expect(
      needsResult({ status: 'live', startsAt: '2026-11-16T07:00:00.000Z' }, afterMidnight),
    ).toBe(true);
    expect(needsResult({ status: 'live', startsAt: null }, afterMidnight)).toBe(true);
  });

  it('counts a scheduled game whose start has come, and not one still to come', () => {
    expect(needsResult({ status: 'scheduled', startsAt: beforeMidnight }, afterMidnight)).toBe(
      true,
    );
    expect(
      needsResult({ status: 'scheduled', startsAt: '2026-11-16T06:20:00.000Z' }, afterMidnight),
    ).toBe(true);
    expect(
      needsResult({ status: 'scheduled', startsAt: '2026-11-16T06:20:00.001Z' }, afterMidnight),
    ).toBe(false);
    expect(needsResult({ status: 'scheduled', startsAt: null }, afterMidnight)).toBe(false);
  });

  it('leaves out a game that is decided or called off', () => {
    for (const status of ['final', 'forfeit', 'postponed', 'cancelled']) {
      expect(needsResult({ status, startsAt: beforeMidnight }, afterMidnight), status).toBe(false);
    }
  });
});

describe('oldestFirst', () => {
  it('puts the oldest start first, a game with no start last, and ties by id', () => {
    const games = [
      { id: 'c', startsAt: null },
      { id: 'b', startsAt: '2026-11-12T18:00:00.000Z' },
      { id: 'a', startsAt: '2026-11-12T18:00:00.000Z' },
      { id: 'd', startsAt: '2026-11-10T18:00:00.000Z' },
    ];
    expect([...games].sort(oldestFirst).map((g) => g.id)).toEqual(['d', 'a', 'b', 'c']);
  });
});
