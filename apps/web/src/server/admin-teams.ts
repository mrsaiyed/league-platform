// What the admin's Teams screens need from outside (step 2.51): the commands' own
// transaction (the real teams and people commands run on it) and the few reads that
// no command offers yet: the season being worked on, its divisions and its teams.
// container.ts chooses the adapter; today only the local stand-in
// (stand-in-admin-teams.ts) fills it, because the database's list of a season's teams
// is not wired to the web app yet.
import type { CommandDeps, PeopleTx, TeamRecord, TeamsTx } from '@srleagues/core';

/** The transaction the Teams screens' commands run in: the teams and people stores. */
export type AdminTeamsTx = TeamsTx & PeopleTx;

/** The season the screens work on: the league's current one. */
export type AdminSeason = { readonly id: string; readonly name: string };

export type AdminDivision = { readonly id: string; readonly name: string };

export type AdminTeamsPorts = {
  /** Runs the teams and people commands; the context comes from the session (T-23). */
  readonly deps: CommandDeps<AdminTeamsTx>;
  /** The league's current season, or undefined when it has none. */
  readonly currentSeason: (leagueId: string) => Promise<AdminSeason | undefined>;
  /** The season's divisions, not in the bin, in order. */
  readonly divisions: (leagueId: string, seasonId: string) => Promise<readonly AdminDivision[]>;
  /** The season's teams not in the bin, by name. */
  readonly teams: (leagueId: string, seasonId: string) => Promise<readonly TeamRecord[]>;
};
