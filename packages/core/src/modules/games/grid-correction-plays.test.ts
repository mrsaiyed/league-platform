import type { basketball } from '@srleagues/sports';
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

/** A play as the game's state keeps it, stamped in `period`. */
const stamped = (play: basketball.Play, id: string, period = 1): basketball.LoggedPlay => ({
  ...play,
  id,
  at: 0,
  period,
  clockMs: 0,
  elapsedMs: 0,
});
const basket = (id: string, playerId: string, points: 1 | 2 | 3, period = 1) =>
  stamped(
    { type: 'score', side: playerId.startsWith('q') ? 'away' : 'home', playerId, points },
    id,
    period,
  );
// The plays the lines above are made of.
const plays = [
  basket('b-p1-2', 'p1', 2),
  basket('b-p1-3', 'P1', 3),
  basket('b-p2-2', 'p2', 2),
  basket('b-q1-2', 'q1', 2),
];

describe('the plays a box score grid makes on a tracked game (step 2.65, T-122)', () => {
  it('gives no plays when nothing changed', () => {
    const wanted = replayed.map((l) => ({ teamId: l.teamId, personId: l.personId, ...l.stats }));
    expect(gridCorrectionPlays(teams, replayed, wanted, plays)).toEqual({ ok: true, plays: [] });
    expect(gridCorrectionPlays(teams, replayed, [], plays)).toEqual({ ok: true, plays: [] });
  });

  it('moves a foul to the right player: the take-back first, then the foul', () => {
    const wanted = [
      { teamId: 'team-h', personId: 'p1', fouls: 1 },
      { teamId: 'team-h', personId: 'p2', fouls: 1 },
    ];
    expect(gridCorrectionPlays(teams, replayed, wanted, plays)).toEqual({
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
    expect(gridCorrectionPlays(teams, replayed, wanted, plays)).toEqual({
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

  it('moves two points from one player to another: the basket taken back, then the new one (T-436)', () => {
    const wanted = [
      { teamId: 'team-h', personId: 'p1', fg2: 0 },
      { teamId: 'team-h', personId: 'p2', fg2: 2 },
    ];
    expect(gridCorrectionPlays(teams, replayed, wanted, plays)).toEqual({
      ok: true,
      plays: [
        { type: 'unscore', side: 'home', playerId: 'p1', points: 2, playId: 'b-p1-2' },
        { type: 'score', side: 'home', playerId: 'p2', points: 2 },
      ],
    });
  });

  it("takes back the player's newest standing basket of that value first", () => {
    const two = [
      basket('old', 'p1', 2, 1),
      basket('other', 'p2', 2, 2),
      basket('three', 'p1', 3, 2),
      basket('new', 'p1', 2, 2),
    ];
    const lines = [line('team-h', 'p1', { fg2: 2, fg3: 1 }), line('team-h', 'p2', { fg2: 1 })];
    const lower = (fg2: number, list: readonly basketball.LoggedPlay[]) =>
      gridCorrectionPlays(teams, lines, [{ teamId: 'team-h', personId: 'p1', fg2 }], list);
    expect(lower(1, two)).toEqual({
      ok: true,
      plays: [{ type: 'unscore', side: 'home', playerId: 'p1', points: 2, playId: 'new' }],
    });
    // One already taken back stands no more: the next newest is taken.
    const takenBack = stamped(
      { type: 'unscore', side: 'home', playerId: 'p1', points: 2, playId: 'new' },
      'u',
      2,
    );
    const afterTakeBack = [...two, takenBack];
    const linesAfter = [line('team-h', 'p1', { fg2: 1, fg3: 1 })];
    expect(
      gridCorrectionPlays(
        teams,
        linesAfter,
        [{ teamId: 'team-h', personId: 'p1', fg2: 0 }],
        afterTakeBack,
      ),
    ).toEqual({
      ok: true,
      plays: [{ type: 'unscore', side: 'home', playerId: 'p1', points: 2, playId: 'old' }],
    });
    expect(lower(0, two)).toEqual({
      ok: true,
      plays: [
        { type: 'unscore', side: 'home', playerId: 'p1', points: 2, playId: 'new' },
        { type: 'unscore', side: 'home', playerId: 'p1', points: 2, playId: 'old' },
      ],
    });
  });

  it('refuses fewer baskets than the plays hold, and makes none', () => {
    // The lines say two 3s, the plays hold one: what cannot be explained by plays.
    const lines = [line('team-h', 'p1', { fg3: 2, fouls: 2 })];
    const wanted = [{ teamId: 'team-h', personId: 'p1', fg3: 0, fouls: 3 }];
    expect(gridCorrectionPlays(teams, lines, wanted, plays)).toEqual({
      ok: false,
      problems: [{ problem: 'basket-not-in-plays', personId: 'p1', stat: 'fg3' }],
    });
  });

  it('refuses a team not in the game and a player listed twice', () => {
    const wanted = [
      { teamId: 'team-x', personId: 'p1', fouls: 0 },
      { teamId: 'team-h', personId: 'p2', fouls: 1 },
      { teamId: 'team-h', personId: 'P2', fouls: 2 },
    ];
    expect(gridCorrectionPlays(teams, replayed, wanted, plays)).toEqual({
      ok: false,
      problems: [
        { problem: 'team-not-in-game', teamId: 'team-x' },
        { problem: 'player-listed-twice', personId: 'P2' },
      ],
    });
  });
});
