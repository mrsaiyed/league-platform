import { describe, expect, it } from 'vitest';
import {
  statsShown,
  statsVisibilities,
  type StatsShown,
  type StatsVisibility,
  type TeamStatsSetting,
} from './stats-shown.ts';
import { publicViewer, type Viewer } from './viewer.ts';

const leagueId = 'league-1';
const team = 'team-a';

const viewers: ReadonlyArray<readonly [string, Viewer]> = [
  ['anyone', publicViewer(leagueId)],
  ['a signed-in visitor with no role', { leagueId, leagueAdmin: false, staffOfTeamIds: [] }],
  ["another team's staff", { leagueId, leagueAdmin: false, staffOfTeamIds: ['team-b'] }],
  ["the team's own staff", { leagueId, leagueAdmin: false, staffOfTeamIds: ['team-b', team] }],
  ['a league admin', { leagueId, leagueAdmin: true, staffOfTeamIds: [] }],
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

function setting(statsVisibility: StatsVisibility): TeamStatsSetting {
  return { leagueId, teamId: team, statsVisibility };
}

describe('statsShown (S-22, T-87)', () => {
  for (const visibility of statsVisibilities) {
    for (const [who, viewer] of viewers) {
      it(`a team set to "${visibility}" shows ${expected[visibility][who]} to ${who}`, () => {
        expect(statsShown(setting(visibility), viewer)).toBe(expected[visibility][who]);
      });
    }
  }

  it('builds only the two levels of stage 2', () => {
    expect(statsVisibilities).toEqual(['everyone', 'staff']);
  });

  it('shows only team totals for a level it does not know, including the stage 4 levels', () => {
    const admin: Viewer = { leagueId, leagueAdmin: true, staffOfTeamIds: [team] };
    for (const level of ['members', 'team', 'league_members', 'EVERYONE', '', null, undefined, 3]) {
      const odd = { leagueId, teamId: team, statsVisibility: level } as unknown as TeamStatsSetting;
      expect(statsShown(odd, admin), String(level)).toBe('team_totals');
    }
  });

  it('shows only team totals when the setting or the viewer is missing', () => {
    expect(statsShown(null as unknown as TeamStatsSetting, publicViewer(leagueId))).toBe(
      'team_totals',
    );
    expect(statsShown(setting('everyone'), undefined as unknown as Viewer)).toBe('team_totals');
  });

  it("refuses a viewer from another league, even that league's admin", () => {
    const otherAdmin: Viewer = { leagueId: 'league-2', leagueAdmin: true, staffOfTeamIds: [team] };
    expect(statsShown(setting('staff'), otherAdmin)).toBe('team_totals');
    expect(statsShown(setting('everyone'), publicViewer('league-2'))).toBe('team_totals');
    const noLeague = { teamId: team, statsVisibility: 'everyone' } as unknown as TeamStatsSetting;
    expect(statsShown(noLeague, publicViewer(leagueId))).toBe('team_totals');
  });

  it('the public viewer cannot be changed', () => {
    const viewer = publicViewer(leagueId);
    expect(Object.isFrozen(viewer)).toBe(true);
    expect(Object.isFrozen(viewer.staffOfTeamIds)).toBe(true);
  });
});
