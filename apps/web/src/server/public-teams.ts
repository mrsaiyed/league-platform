// What the public teams pages and the members' start page need from outside (step 2.44):
// each team's roster as the public may see it, the league's start-page setting, and
// which teams a signed-in account is linked to by a roster place. Bound to one league by
// the caller, so nothing here takes a league from the request (T-28). The teams, their
// records and their statistics come from the standings port (public-stats.ts).
import type { PublicDisplay, PublicRoster } from '@srleagues/core';

/** The league's "Start page for members" setting (U-5). */
export type StartPage = 'leagueHome' | 'myTeam';

export type PublicTeamsPorts = {
  /** The league's start-page setting; "league home" when it never chose. */
  readonly startPageOf: (leagueId: string) => Promise<StartPage>;
  /** One team's roster: those on it now, then those who left (R-17); names by the one name function (T-81). */
  readonly rosterOf: (
    leagueId: string,
    teamId: string,
    display: PublicDisplay,
  ) => Promise<PublicRoster>;
  /**
   * The teams of the season the account has a roster place on now (not one it left),
   * by team id. A coach or captain role on a team is read from the account's grants
   * instead (access module), so it is not here.
   */
  readonly teamIdsOfAccount: (
    leagueId: string,
    seasonId: string,
    accountId: string,
  ) => Promise<readonly string[]>;
};
