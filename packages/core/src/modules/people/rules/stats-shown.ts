// Who may see a team's player statistics (S-22, T-87).
import type { Viewer } from './viewer.ts';

/**
 * S-22's levels built so far: everyone, or only the team's staff and the league's
 * admins. "Signed-in members of the league" and "the team's own players, parents and
 * staff" arrive with accounts in stage 4; until then they show only the team's totals.
 */
export const statsVisibilities = ['everyone', 'staff'] as const;
export type StatsVisibility = (typeof statsVisibilities)[number];

/** A team and its statistics setting. */
export interface TeamStatsSetting {
  /** The team's league. A viewer from another league sees only the team's totals. */
  readonly leagueId: string;
  readonly teamId: string;
  readonly statsVisibility: StatsVisibility;
}

/**
 * Player lines (box score lines, season totals, stat leaders, names in the
 * play-by-play), or only the team's totals. Scores, results and standings are never
 * restricted (S-22).
 */
export type StatsShown = 'player_lines' | 'team_totals';

/**
 * What this viewer may see of this team's statistics. Anything it does not recognise
 * (a missing setting, a level from a later stage, a viewer from another league) shows
 * only the team's totals.
 */
export function statsShown(team: TeamStatsSetting, viewer: Viewer): StatsShown {
  const t: Partial<TeamStatsSetting> | null | undefined = team;
  const v: Partial<Viewer> | null | undefined = viewer;
  if (!t || !v || typeof t.leagueId !== 'string' || t.leagueId === '') return 'team_totals';
  if (t.leagueId !== v.leagueId) return 'team_totals';
  switch (t.statsVisibility) {
    case 'everyone':
      return 'player_lines';
    case 'staff':
      return v.leagueAdmin === true ||
        (typeof t.teamId === 'string' &&
          Array.isArray(v.staffOfTeamIds) &&
          v.staffOfTeamIds.includes(t.teamId))
        ? 'player_lines'
        : 'team_totals';
    default:
      return 'team_totals';
  }
}
