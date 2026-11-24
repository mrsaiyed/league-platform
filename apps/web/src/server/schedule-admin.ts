// What Admin → Schedule needs from outside (step 2.52): the scheduling commands' deps
// (their transaction is bound to the league of the command's context, T-28), the names
// of a season's teams, which the scheduling store does not hold, and the league's
// seasons, the ones not public yet among them, since a season is scheduled before it is
// shown (step 2.160). The made-up stand-in fills it (stand-in-schedule.ts), and so does
// the database (database-schedule-admin.ts, step 2.93 part 4).
import type { AccessHolder, CommandDeps, SchedulingTx } from '@srleagues/core';
import type { PublicSeason } from './public-stats.ts';

/**
 * A team of the season as the grid names it. One in the bin (`removed`) is not offered for
 * a game, only named: its games from before A-17 are still in the grid ("Badgers (removed)").
 */
export type ScheduleTeam = {
  readonly id: string;
  readonly name: string;
  readonly removed: boolean;
  /** Has left the league (S-87): offered for no new game. */
  readonly left: boolean;
};

/**
 * A season the schedule can be built for; `isPublic` is false while visitors cannot see it.
 * Its program says who may see it while it is not public (`mayListSeason`).
 */
export type ScheduleSeason = PublicSeason & {
  readonly isPublic: boolean;
  readonly programId: string;
  /** Archived (O-12): read-only, so no screen offers to change it. */
  readonly archived: boolean;
};

export type ScheduleAdminPorts = {
  /** Deps for the scheduling commands; the transaction follows the context's league. */
  readonly deps: CommandDeps<SchedulingTx>;
  /** The season's teams by name, those in the bin too, marked `removed`. */
  readonly teamsOf: (leagueId: string, seasonId: string) => Promise<readonly ScheduleTeam[]>;
  /**
   * The league's seasons `holder` may be told of (P4 §4): the public ones in the order the
   * public pages list them, then the ones not public yet that the holder may see, by name.
   * The list itself applies the scheduling module's one rule (`mayListSeason`: a season not
   * public only to someone with `schedule.read` at its program), so no screen that lists
   * seasons to staff can leave it out. `holder` is required: undefined (nobody signed in,
   * or no access read) gets the public seasons only. The database's version applies the
   * same rule, `mayListSeason`, to what it reads, and reads what the holder's account holds
   * again for `leagueId` itself, so a holder of another league opens nothing here.
   */
  readonly seasonsOf: (
    leagueId: string,
    holder: AccessHolder | undefined,
  ) => Promise<readonly ScheduleSeason[]>;
};
