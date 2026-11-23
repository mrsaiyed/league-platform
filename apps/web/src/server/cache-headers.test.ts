import { gamePageLabel, leagueLabel } from '@srleagues/providers';
import { describe, expect, it } from 'vitest';
import { notKept, sharedFor } from './cache-headers.ts';

const league = '01900000-0000-7000-8000-000000000001';
const game = '01900000-0000-7000-8000-0000000000f1';

describe('cache headers (T-66, T-119)', () => {
  it('a shared answer is kept 2 seconds at most, by the shared cache only, labeled', () => {
    expect(sharedFor(2, [leagueLabel(league), gamePageLabel(league, game)])).toEqual({
      'Cache-Control': 'public, max-age=0, s-maxage=2',
      'Cache-Tag': `league:${league},league:${league}:game:${game}`,
    });
  });

  it('refuses a longer keep, or labels without a league', () => {
    expect(() => sharedFor(60, [leagueLabel(league)])).toThrow(RangeError);
    expect(() => sharedFor(0, [leagueLabel(league)])).toThrow(RangeError);
    expect(() => sharedFor(2, [])).toThrow(RangeError);
    expect(() => sharedFor(2, ['standings'])).toThrow(RangeError);
    expect(() => sharedFor(2, ['league:a b'])).toThrow(RangeError);
  });

  it('anything else is never kept', () => {
    expect(notKept).toEqual({ 'Cache-Control': 'private, no-store' });
  });
});
