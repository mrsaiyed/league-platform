// What Admin → Schedule needs from outside (step 2.52): the scheduling commands' deps
// (their transaction is bound to the league of the command's context, T-28) and the
// names of a season's teams, which the scheduling store does not hold. The real
// database fills it in a later step; until then only the made-up stand-in does.
import type { CommandDeps, SchedulingTx } from '@srleagues/core';

export type ScheduleTeam = { readonly id: string; readonly name: string };

export type ScheduleAdminPorts = {
  /** Deps for the scheduling commands; the transaction follows the context's league. */
  readonly deps: CommandDeps<SchedulingTx>;
  /** The season's teams that are not in the bin, by name. */
  readonly teamsOf: (leagueId: string, seasonId: string) => Promise<readonly ScheduleTeam[]>;
};
