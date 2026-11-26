import { describe, expect, it } from 'vitest';
import type { GameNames } from '../../server/games-area-ports.ts';
import { keptNames } from './kept-names.ts';

const all: GameNames = {
  teams: { t1: 'Tigers', t2: 'Lions', t3: 'Hawks', t4: 'Bears', t5: 'Owls' },
  removedTeams: ['t2', 't3'],
  scorekeepers: { g1: ['Sam'], g2: ['Kim'] },
  seasons: { s1: 'Spring', s2: 'Fall', s3: 'Draft season' },
  people: { a1: 'Sam', a2: 'Kim' },
};

describe('keptNames (step 2.227)', () => {
  it('keeps only the teams, seasons and scorekeepers of the games given', () => {
    const names = keptNames(all, [
      { id: 'g1', homeTeamId: 't1', awayTeamId: 't2', seasonId: 's1' },
    ]);
    expect(names).toEqual({
      teams: { t1: 'Tigers', t2: 'Lions' },
      removedTeams: ['t2'],
      scorekeepers: { g1: ['Sam'] },
      seasons: { s1: 'Spring' },
      people: {},
    });
  });

  it('keeps the teams and seasons a command named beside its games', () => {
    const names = keptNames(all, [], { teamIds: ['t4'], seasonIds: ['s2'] });
    expect(names.teams).toEqual({ t4: 'Bears' });
    expect(names.seasons).toEqual({ s2: 'Fall' });
    expect(names.scorekeepers).toEqual({});
  });

  it('names nothing when no game was returned', () => {
    const names = keptNames(all, []);
    expect(names).toEqual({
      teams: {},
      removedTeams: [],
      scorekeepers: {},
      seasons: {},
      people: {},
    });
  });
});
