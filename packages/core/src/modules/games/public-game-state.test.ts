import { describe, expect, it } from 'vitest';
import { publicGameState, type PublicGameFacts } from './public-game-state.ts';

// A league in New York: 10:00 AM on Saturday, November 14 is 15:00 UTC.
const clock = { now: '2026-11-14T15:00:00.000Z', today: '2026-11-14' };
const game = (facts: Partial<PublicGameFacts> = {}): PublicGameFacts => ({
  status: 'scheduled',
  startsAt: '2026-11-14T15:00:00.000Z',
  homeScore: null,
  awayScore: null,
  finalizedAt: null,
  ...facts,
});

describe('publicGameState: one truth for every public page (step 2.159)', () => {
  it('a game still to come is upcoming', () => {
    const truth = publicGameState(game({ startsAt: '2026-11-14T15:00:00.001Z' }), clock);
    expect(truth).toEqual({ state: 'upcoming', result: null, endedAt: null });
  });

  it('a game whose start is exactly now, with no score, is awaiting a score (T-382)', () => {
    expect(publicGameState(game(), clock).state).toBe('awaiting-score');
  });

  it('a game whose start has passed with no score is awaiting a score, never upcoming', () => {
    const truth = publicGameState(game({ startsAt: '2026-11-07T15:00:00.000Z' }), clock);
    expect(truth).toEqual({ state: 'awaiting-score', result: null, endedAt: null });
  });

  it("a game with a day but no time is upcoming on its day, awaiting after it, by the league's day", () => {
    const onDay = game({ startsAt: null, localDate: '2026-11-14' });
    expect(publicGameState(onDay, clock).state).toBe('upcoming');
    const dayBefore = game({ startsAt: null, localDate: '2026-11-13' });
    expect(publicGameState(dayBefore, clock).state).toBe('awaiting-score');
    // Late on the 14th in New York is already the 15th in UTC: the league's day decides.
    const lateEvening = { now: '2026-11-15T03:30:00.000Z', today: '2026-11-14' };
    expect(publicGameState(onDay, lateEvening).state).toBe('upcoming');
  });

  it('a game with no date at all is upcoming: there is no start to have passed', () => {
    expect(publicGameState(game({ startsAt: null }), clock).state).toBe('upcoming');
    expect(publicGameState(game({ startsAt: null, localDate: null }), clock).state).toBe(
      'upcoming',
    );
  });

  it('a live game is live, its start passed or not', () => {
    expect(publicGameState(game({ status: 'live' }), clock).state).toBe('live');
    const early = game({ status: 'live', startsAt: '2026-11-14T16:00:00.000Z' });
    expect(publicGameState(early, clock).state).toBe('live');
  });

  it('a final game is final, with its result and the time it ended', () => {
    const truth = publicGameState(
      game({
        status: 'final',
        homeScore: 40,
        awayScore: 38,
        finalizedAt: '2026-11-14T16:10:00.000Z',
      }),
      clock,
    );
    expect(truth).toEqual({
      state: 'final',
      result: { home: 40, away: 38, decided: 'final' },
      endedAt: '2026-11-14T16:10:00.000Z',
    });
  });

  it('a forfeit is a forfeit, with the forfeit score', () => {
    const truth = publicGameState(
      game({ status: 'forfeit', homeScore: 20, awayScore: 0, finalizedAt: null }),
      clock,
    );
    expect(truth).toEqual({
      state: 'forfeit',
      result: { home: 20, away: 0, decided: 'forfeit' },
      endedAt: null,
    });
  });

  it('postponed and cancelled games are what they are, their start passed or not', () => {
    const past = '2026-11-07T15:00:00.000Z';
    expect(publicGameState(game({ status: 'postponed', startsAt: past }), clock).state).toBe(
      'postponed',
    );
    expect(publicGameState(game({ status: 'cancelled', startsAt: past }), clock).state).toBe(
      'cancelled',
    );
  });

  it('a reopened game is being corrected and shows the result as it stood (S-47)', () => {
    // By hand: back to scheduled with the scores cleared; its start long past.
    const byHand = game({
      startsAt: '2026-11-07T15:00:00.000Z',
      beingCorrected: { status: 'final', homeScore: 40, awayScore: 38 },
    });
    expect(publicGameState(byHand, clock)).toEqual({
      state: 'being-corrected',
      result: { home: 40, away: 38, decided: 'final' },
      endedAt: null,
    });
    // Tracked, the scorekeeper's own reopen too: live again with its plays' score.
    const tracked = game({
      status: 'live',
      homeScore: 41,
      awayScore: 38,
      beingCorrected: { status: 'final', homeScore: 40, awayScore: 38 },
    });
    expect(publicGameState(tracked, clock).result).toEqual({
      home: 40,
      away: 38,
      decided: 'final',
    });
    expect(publicGameState(tracked, clock).state).toBe('being-corrected');
  });

  it('a forfeit reopened is being corrected, as the forfeit it was', () => {
    const truth = publicGameState(
      game({ beingCorrected: { status: 'forfeit', homeScore: 0, awayScore: 20 } }),
      clock,
    );
    expect(truth.result).toEqual({ home: 0, away: 20, decided: 'forfeit' });
  });

  it('once ended again, the game is final again: an old correction does not hold it', () => {
    const ended = game({
      status: 'final',
      homeScore: 42,
      awayScore: 38,
      finalizedAt: '2026-11-14T17:00:00.000Z',
      beingCorrected: { status: 'final', homeScore: 40, awayScore: 38 },
    });
    expect(publicGameState(ended, clock).state).toBe('final');
    expect(publicGameState(ended, clock).result).toEqual({ home: 42, away: 38, decided: 'final' });
  });

  it('a correction that took back no decided result is not a correction to show', () => {
    const odd = game({ beingCorrected: { status: 'scheduled', homeScore: null, awayScore: null } });
    expect(publicGameState(odd, clock).state).toBe('awaiting-score');
    const noScore = game({ beingCorrected: { status: 'final', homeScore: null, awayScore: 3 } });
    expect(publicGameState(noScore, clock).state).toBe('awaiting-score');
  });

  it('a final game with no score kept says final with no result to show', () => {
    expect(publicGameState(game({ status: 'final' }), clock)).toEqual({
      state: 'final',
      result: null,
      endedAt: null,
    });
  });
});
