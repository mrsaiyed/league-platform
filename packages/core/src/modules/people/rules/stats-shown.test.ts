import { describe, expect, it } from 'vitest';
import {
  statsShown,
  statsVisibilities,
  type StatsShown,
  type StatsVisibility,
} from './stats-shown.ts';
import { publicViewer, type Viewer } from './viewer.ts';

const team = 'team-a';

const viewers: ReadonlyArray<readonly [string, Viewer]> = [
  ['anyone', publicViewer],
  ['a signed-in visitor with no role', { leagueAdmin: false, staffOfTeamIds: [] }],
  ["another team's staff", { leagueAdmin: false, staffOfTeamIds: ['team-b'] }],
  ["the team's own staff", { leagueAdmin: false, staffOfTeamIds: ['team-b', team] }],
  ['a league admin', { leagueAdmin: true, staffOfTeamIds: [] }],
];

const expected: Record<StatsVisibility, Record<string, StatsShown>> = {
  everyone: {
    anyone: 'player_lines',
    'a signed-in visitor with no role': 'player_lines',
    "another team's staff": 'player_lines',
    "the team's own staff": 'player_lines',
    'a league admin': 'player_lines',
  },
  staff: {
    anyone: 'team_totals',
    'a signed-in visitor with no role': 'team_totals',
    "another team's staff": 'team_totals',
    "the team's own staff": 'player_lines',
    'a league admin': 'player_lines',
  },
};

describe('statsShown (S-22, T-87)', () => {
  for (const visibility of statsVisibilities) {
    for (const [who, viewer] of viewers) {
      it(`a team set to "${visibility}" shows ${expected[visibility][who]} to ${who}`, () => {
        expect(statsShown({ teamId: team, statsVisibility: visibility }, viewer)).toBe(
          expected[visibility][who],
        );
      });
    }
  }

  it('builds only the two levels of stage 2', () => {
    expect(statsVisibilities).toEqual(['everyone', 'staff']);
  });

  it('the public viewer cannot be changed', () => {
    expect(Object.isFrozen(publicViewer)).toBe(true);
    expect(Object.isFrozen(publicViewer.staffOfTeamIds)).toBe(true);
  });
});
