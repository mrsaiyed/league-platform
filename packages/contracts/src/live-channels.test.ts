import { describe, expect, it } from 'vitest';
import {
  LeagueScoreMessage,
  LiveMessage,
  gameChannelName,
  leagueScoreFrom,
  leagueScoresChannelName,
  liveChannelName,
  parseLiveChannelName,
} from '../index.ts';

const league = '0192f000-0000-7000-8000-00000000000a';
const game = '0192f000-0000-7000-8000-00000000000b';

const message: LiveMessage = {
  gameId: game,
  sequence: 7,
  sentAt: 1_700_000_000_000,
  status: 'live',
  score: { home: 12, away: 9 },
  period: 2,
  clock: { state: 'running', remainingMs: 300_000, asOf: 1_700_000_000_000 },
  teamFouls: { home: 3, away: 1 },
  latestPlay: { type: 'score', side: 'home', playerName: 'A. Player', jersey: '4', points: 2 },
};

describe('live channel names', () => {
  it('puts the league first in every channel', () => {
    expect(gameChannelName(league, game)).toBe(`league:${league}:game:${game}`);
    expect(leagueScoresChannelName(league)).toBe(`league:${league}:live-scores`);
  });

  it('reads back what it writes, and nothing else', () => {
    expect(parseLiveChannelName(gameChannelName(league, game))).toEqual({
      kind: 'game',
      leagueId: league,
      gameId: game,
    });
    expect(parseLiveChannelName(leagueScoresChannelName(league))).toEqual({
      kind: 'league-scores',
      leagueId: league,
    });
    for (const name of [
      '',
      `game:${game}`,
      `league:not-an-id:live-scores`,
      `league:${league}:game:not-an-id`,
      `league:${league}:live-scores:extra`,
      `league:${league}:game:${game}:extra`,
      `league:${league.toUpperCase()}:live-scores`,
      `realtime:league:${league}:live-scores`,
    ]) {
      expect(parseLiveChannelName(name)).toBeNull();
    }
  });

  it('refuses an ID that is not a UUID rather than make a channel from it', () => {
    expect(() => gameChannelName('one', game)).toThrow('leagueId');
    expect(() => leagueScoresChannelName(`${league}:game:${game}`)).toThrow('leagueId');
    expect(() => liveChannelName({ kind: 'game', leagueId: league, gameId: 'x' })).toThrow(
      'gameId',
    );
  });
});

describe('league score message', () => {
  it('keeps the score and where the game stands, and drops the players', () => {
    const score = leagueScoreFrom(message);
    expect(score).toEqual({
      gameId: game,
      sequence: 7,
      sentAt: 1_700_000_000_000,
      status: 'live',
      score: { home: 12, away: 9 },
      period: 2,
    });
    expect(LeagueScoreMessage.safeParse(score).success).toBe(true);
    expect(JSON.stringify(score)).not.toContain('A. Player');
  });

  it('refuses anything extra', () => {
    expect(LeagueScoreMessage.safeParse({ ...leagueScoreFrom(message), players: [] }).success).toBe(
      false,
    );
  });
});
