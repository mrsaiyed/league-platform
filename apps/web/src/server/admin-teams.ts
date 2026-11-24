// What the admin's Teams screens need from outside (step 2.51): the commands' own
// transaction (the real teams and people commands run on it) and the few reads that
// no command offers yet: the season being worked on, its divisions and its teams.
// container.ts chooses the adapter: the local stand-in (stand-in-admin-teams.ts) or the
// database (database-admin-teams.ts, step 2.93 part 5).
//
// The three reads take the session's context, never a league id from the request, and
// answer only someone who may manage the season's teams (mayListSeasonTeams), so they
// are safe whatever page asks: an admin limited to another program is told of no season.
import {
  allows,
  type AccessHolder,
  type CommandContext,
  type CommandDeps,
  type PeopleTx,
  type TeamRecord,
  type TeamsTx,
} from '@srleagues/core';

/** The transaction the Teams screens' commands run in: the teams and people stores. */
export type AdminTeamsTx = TeamsTx & PeopleTx;

/** The season the screens work on: the league's current one. */
export type AdminSeason = {
  readonly id: string;
  readonly name: string;
  /** Archived (O-12): read-only, so the screens offer no change (step 2.130). */
  readonly archived: boolean;
};

export type AdminDivision = { readonly id: string; readonly name: string };

export type AdminTeamsPorts = {
  /** Runs the teams and people commands; the context comes from the session (T-23). */
  readonly deps: CommandDeps<AdminTeamsTx>;
  /** The league's current season, or undefined when it has none this person may manage. */
  readonly currentSeason: (context: CommandContext) => Promise<AdminSeason | undefined>;
  /** The season's divisions, not in the bin, in order; none for someone who may not. */
  readonly divisions: (
    context: CommandContext,
    seasonId: string,
  ) => Promise<readonly AdminDivision[]>;
  /** The season's teams not in the bin, by name; none for someone who may not. */
  readonly teams: (context: CommandContext, seasonId: string) => Promise<readonly TeamRecord[]>;
};

/**
 * Whether `holder` may be told of a season's teams and divisions on the Teams screens:
 * they may manage teams at the season's program (P4 §4, `teams.manage`), as the teams
 * commands check. Read afresh for the league the screen is for (T-75).
 */
export function mayListSeasonTeams(holder: AccessHolder | undefined, programId: string): boolean {
  return holder !== undefined && allows(holder, 'teams.manage', { type: 'program', id: programId });
}
