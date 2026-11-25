import { describe, expect, it } from 'vitest';
import { gridCorrectionPlays, type ReplayedLine } from './grid-correction-plays.ts';

const teams = { homeTeamId: 'team-h', awayTeamId: 'team-a' };
const line = (teamId: string, personId: string, stats: Record<string, number>): ReplayedLine => ({
  teamId,
  personId,
  stats,
});
const replayed = [
  line('team-h', 'p1', { points: 5, fg1: 0, fg2: 1, fg3: 1, fouls: 2, turnovers: 1 }),
  line('team-h', 'p2', { points: 2, fg1: 0, fg2: 1, fg3: 0, fouls: 0, turnovers: 0 }),
  line('team-a', 'q1', { points: 2, fg1: 0, fg2: 1, fg3: 0, fouls: 1, turnovers: 0 }),
];

describe('the plays a box score grid makes on a tracked game (step 2.65, T-122)', () => {
  it('gives no plays when nothing changed', () => {
    const wanted = replayed.map((l) => ({ teamId: l.teamId, personId: l.personId, ...l.stats }));
    expect(gridCorrectionPlays(teams, replayed, wanted)).toEqual({ ok: true, plays: [] });
    expect(gridCorrectionPlays(teams, replayed, [])).toEqual({ ok: true, plays: [] });
  });

  it('moves a foul to the right player: the take-back first, then the foul', () => {
    const wanted = [
      { teamId: 'team-h', personId: 'p1', fouls: 1 },
      { teamId: 'team-h', personId: 'p2', fouls: 1 },
    ];
    expect(gridCorrectionPlays(teams, replayed, wanted)).toEqual({
      ok: true,
      plays: [
        { type: 'unfoul', side: 'home', playerId: 'p1' },
        { type: 'foul', side: 'home', playerId: 'p2' },
      ],
    });
  });

  it('adds baskets and turnovers, takes back turnovers, and leaves counts left out alone', () => {
    const wanted = [
      { teamId: 'team-h', personId: 'p1', turnovers: 0 },
      { teamId: 'TEAM-A', personId: 'Q1', fg1: 2, fg3: 1, turnovers: 1 },
      // On the roster, not yet in the plays: a line from nothing.
      { teamId: 'team-a', personId: 'q2', fouls: 1 },
    ];
    expect(gridCorrectionPlays(teams, replayed, wanted)).toEqual({
      ok: true,
      plays: [
        { type: 'unturnover', side: 'home', playerId: 'p1' },
        { type: 'turnover', side: 'away', playerId: 'q1' },
        { type: 'foul', side: 'away', playerId: 'q2' },
        { type: 'score', side: 'away', playerId: 'q1', points: 1 },
        { type: 'score', side: 'away', playerId: 'q1', points: 1 },
        { type: 'score', side: 'away', playerId: 'q1', points: 3 },
      ],
    });
  });

  it('says a basket cannot be taken back by a play, and makes none (T-405)', () => {
    const wanted = [
      { teamId: 'team-h', personId: 'p1', fg3: 0, fouls: 3 },
      { teamId: 'team-h', personId: 'p2', fg3: 1 },
    ];
    expect(gridCorrectionPlays(teams, replayed, wanted)).toEqual({
      ok: false,
      problems: [{ problem: 'basket-taken-back', personId: 'p1', stat: 'fg3' }],
    });
  });

  it('refuses a team not in the game and a player listed twice', () => {
    const wanted = [
      { teamId: 'team-x', personId: 'p1', fouls: 0 },
      { teamId: 'team-h', personId: 'p2', fouls: 1 },
      { teamId: 'team-h', personId: 'P2', fouls: 2 },
    ];
    expect(gridCorrectionPlays(teams, replayed, wanted)).toEqual({
      ok: false,
      problems: [
        { problem: 'team-not-in-game', teamId: 'team-x' },
        { problem: 'player-listed-twice', personId: 'P2' },
      ],
    });
  });
});
