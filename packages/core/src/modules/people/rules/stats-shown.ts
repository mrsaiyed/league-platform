// Who may see a team's player statistics (S-22, T-87).
import type { Viewer } from './viewer.ts';

/**
 * S-22's levels built so far: everyone, or only the team's staff and the league's
 * admins. "Signed-in members of the league" and "the team's own players, parents and
 * staff" arrive with accounts in stage 4.
 */
export const statsVisibilities = ['everyone', 'staff'] as const;
export type StatsVisibility = (typeof statsVisibilities)[number];

/** A team and its statistics setting. */
export interface TeamStatsSetting {
  readonly teamId: string;
  readonly statsVisibility: StatsVisibility;
}

/**
 * Player lines (box score lines, season totals, stat leaders, names in the
 * play-by-play), or only the team's totals. Scores, results and standings are never
 * restricted (S-22).
 */
export type StatsShown = 'player_lines' | 'team_totals';

/** What this viewer may see of this team's statistics. */
export function statsShown(team: TeamStatsSetting, viewer: Viewer): StatsShown {
  switch (team.statsVisibility) {
    case 'everyone':
      return 'player_lines';
    case 'staff':
      return viewer.leagueAdmin || viewer.staffOfTeamIds.includes(team.teamId)
        ? 'player_lines'
        : 'team_totals';
  }
}
