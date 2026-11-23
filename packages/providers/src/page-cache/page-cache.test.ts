// The labels: keyed by league (T-66), and a result's are exactly its season's and its game's.
import { describe, expect, it } from 'vitest';
import {
  gamePageLabel,
  labelsForGameResult,
  leagueLabel,
  PageCacheClearError,
  seasonPageLabel,
} from './page-cache.ts';

const league = '01900000-0000-7000-8000-000000000001';
const season = '01900000-0000-7000-8000-0000000000c1';
const game = '01900000-0000-7000-8000-0000000000f1';

describe('page labels (T5 §4)', () => {
  it('start with their league and hold ids only', () => {
    expect(leagueLabel(league)).toBe(`league:${league}`);
    expect(seasonPageLabel(league, season, 'standings')).toBe(
      `league:${league}:season:${season}:standings`,
    );
    expect(gamePageLabel(league, game)).toBe(`league:${league}:game:${game}`);
  });

  it('a result clears its season’s standings, results and statistics and its game', () => {
    expect(labelsForGameResult({ leagueId: league, seasonId: season, gameId: game })).toEqual([
      `league:${league}:season:${season}:standings`,
      `league:${league}:season:${season}:results`,
      `league:${league}:season:${season}:stats`,
      `league:${league}:game:${game}`,
    ]);
  });

  it('a refused key is not tried again; anything else is', () => {
    expect(new PageCacheClearError('not-authorized').retryable).toBe(false);
    expect(new PageCacheClearError('rate-limited').retryable).toBe(true);
    expect(new PageCacheClearError('unavailable').code).toBe('unavailable');
  });
});
