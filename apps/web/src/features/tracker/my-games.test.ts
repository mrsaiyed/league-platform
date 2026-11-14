import { describe, expect, it } from 'vitest';
import {
  entersScoreInGames,
  gameNightOrder,
  leagueScores,
  notScoredBecause,
  opensInTracker,
  scoresOnly,
} from './my-games.ts';

describe('the scorekeeper’s admin (P4 §4)', () => {
  it('is for those whose only area of the admin is Games', () => {
    expect(scoresOnly(['games'])).toBe(true);
    expect(scoresOnly(['schedule', 'games'])).toBe(false);
    expect(scoresOnly([])).toBe(false);
  });

  it('offers the tracker for a game to be played or being played, in a league that may score', () => {
    const live = { recording: 'live' } as const;
    expect(opensInTracker({ ...live, status: 'scheduled', scorable: true })).toBe(true);
    expect(opensInTracker({ ...live, status: 'live', scorable: true })).toBe(true);
    for (const status of ['final', 'forfeit', 'postponed', 'cancelled']) {
      expect(opensInTracker({ ...live, status, scorable: true })).toBe(false);
    }
    expect(opensInTracker({ ...live, status: 'live', scorable: false })).toBe(false);
  });

  it('offers the tracker only for a game recorded live', () => {
    for (const recording of ['final-score', 'box-score', undefined] as const) {
      expect(opensInTracker({ recording, status: 'scheduled', scorable: true })).toBe(false);
    }
  });

  it('scores in a league that is not archived or suspended', () => {
    for (const status of ['live', 'draft']) expect(leagueScores(status)).toBe(true);
    for (const status of ['archived', 'suspended']) expect(leagueScores(status)).toBe(false);
  });

  it('says which of archived or suspended stops the scoring', () => {
    expect(notScoredBecause('live')).toBeNull();
    expect(notScoredBecause('draft')).toBeNull();
    expect(notScoredBecause('archived')).toBe('archived');
    expect(notScoredBecause('suspended')).toBe('suspended');
  });

  it('sends a final-score or box-score game to the games area, while it may be scored', () => {
    const open = { status: 'scheduled', scorable: true } as const;
    expect(entersScoreInGames({ ...open, recording: 'final-score' })).toBe('final-score');
    expect(entersScoreInGames({ ...open, recording: 'box-score' })).toBe('box-score');
    expect(entersScoreInGames({ ...open, status: 'live', recording: 'box-score' })).toBe(
      'box-score',
    );
    expect(entersScoreInGames({ ...open, recording: 'live' })).toBeNull();
    expect(entersScoreInGames({ ...open, recording: undefined })).toBeNull();
    expect(entersScoreInGames({ ...open, scorable: false, recording: 'final-score' })).toBeNull();
    for (const status of ['final', 'forfeit', 'postponed', 'cancelled']) {
      expect(entersScoreInGames({ ...open, status, recording: 'final-score' })).toBeNull();
    }
  });
});

describe('the scorekeeper’s games in game-night order (step 2.33)', () => {
  const game = (id: string, status: string, isToday: boolean) => ({ id, status, isToday });

  it('puts games live now first, then today’s still to play, the days ahead, and finished last', () => {
    // Soonest first, as games.list_my_games gives them.
    const listed = [
      game('today-final', 'final', true),
      game('today-early', 'scheduled', true),
      game('today-live', 'live', true),
      game('today-late', 'scheduled', true),
      game('today-cancelled', 'cancelled', true),
      game('tomorrow', 'scheduled', false),
      game('tomorrow-postponed', 'postponed', false),
      game('next-week', 'scheduled', false),
      game('next-week-forfeit', 'forfeit', false),
    ];
    expect(gameNightOrder(listed).map((g) => g.id)).toEqual([
      'today-live',
      'today-early',
      'today-late',
      'tomorrow',
      'next-week',
      'today-final',
      'today-cancelled',
      'tomorrow-postponed',
      'next-week-forfeit',
    ]);
  });

  it('leaves the list it was given as it was', () => {
    const listed = [game('a', 'final', true), game('b', 'live', true)];
    gameNightOrder(listed);
    expect(listed.map((g) => g.id)).toEqual(['a', 'b']);
  });
});
