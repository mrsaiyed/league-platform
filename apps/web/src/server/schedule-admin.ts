// What Admin → Schedule needs from outside (step 2.52): the scheduling commands' deps
// (their transaction is bound to the league of the command's context, T-28), the names
// of a season's teams, which the scheduling store does not hold, and the league's
// seasons, the ones not public yet among them, since a season is scheduled before it is
// shown (step 2.160). The real database fills it in a later step; until then only the
// made-up stand-in does.
import type { CommandDeps, SchedulingTx } from '@srleagues/core';
import type { PublicSeason } from './public-stats.ts';

export type ScheduleTeam = { readonly id: string; readonly name: string };

/** A season the schedule can be built for; `isPublic` is false while visitors cannot see it. */
export type ScheduleSeason = PublicSeason & { readonly isPublic: boolean };

export type ScheduleAdminPorts = {
  /** Deps for the scheduling commands; the transaction follows the context's league. */
  readonly deps: CommandDeps<SchedulingTx>;
  /** The season's teams that are not in the bin, by name. */
  readonly teamsOf: (leagueId: string, seasonId: string) => Promise<readonly ScheduleTeam[]>;
  /**
   * Every season of the league: the public ones in the order the public pages list them,
   * then the ones not public yet, by name.
   */
  readonly seasonsOf: (leagueId: string) => Promise<readonly ScheduleSeason[]>;
};
