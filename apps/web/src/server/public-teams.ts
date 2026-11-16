// What the public teams pages and the members' start page need from outside (step 2.44):
// the league's start-page setting, and which teams a signed-in account is linked to by a
// roster place. Bound to one league by the caller, so nothing here takes a league from the
// request (T-28). The teams, their records, their statistics and a team's roster come from
// the statistics port (public-stats.ts, statisticsOf), all in one snapshot (record 070).

/** The league's "Start page for members" setting (U-5). */
export type StartPage = 'leagueHome' | 'myTeam';

export type PublicTeamsPorts = {
  /** The league's start-page setting; "league home" when it never chose. */
  readonly startPageOf: (leagueId: string) => Promise<StartPage>;
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
