// THE STAND-IN'S "LEAGUES OF AN ACCOUNT". FOR LOCAL WORK AND TESTS ONLY.
//
// What the database's my_leagues() gives (migration 0018, record 066), over the made-up
// leagues in memory: for one account, each league not in the bin where it is the owner,
// holds a role in force, or has a made-up roster place, with nothing else. The rule of
// what the person may see of each (U-9) is not here: core's myLeagues applies it to these
// rows, on the stand-in and on the database alike.
import type { AccessReader, AccountLeagueRow, LeagueStatus } from '@srleagues/core';

type MadeUpLeague = {
  readonly id: string;
  readonly slug: string;
  readonly status: LeagueStatus;
  readonly inBin: boolean;
};

export type StandInMyLeaguesOptions = {
  readonly leagues: readonly MadeUpLeague[];
  /** The access reader of one made-up league (the same one its pages read). */
  readonly accessOf: (leagueId: string) => Pick<AccessReader, 'ownerAccountId' | 'activeGrantsOf'>;
  /** The made-up roster places: account id to the leagues it plays in. */
  readonly rosterPlaces: Readonly<Record<string, readonly string[]>>;
};

/** The leagues of `accountId`, before any rule of what it may see. */
export function standInMyLeagues(
  options: StandInMyLeaguesOptions,
): (accountId: string) => Promise<readonly AccountLeagueRow[]> {
  return async (accountId) => {
    const rows: AccountLeagueRow[] = [];
    for (const league of options.leagues) {
      if (league.inBin) continue;
      const access = options.accessOf(league.id);
      const isOwner = (await access.ownerAccountId()) === accountId;
      const grants = await access.activeGrantsOf(accountId);
      const roles = [...new Set(grants.map((g) => g.role))];
      const leagueWideRoles = [
        ...new Set(grants.filter((g) => g.scope.type === 'league').map((g) => g.role)),
      ];
      const onRoster = (options.rosterPlaces[accountId] ?? []).includes(league.id);
      if (!isOwner && roles.length === 0 && !onRoster) continue;
      rows.push({
        leagueId: league.id,
        slug: league.slug,
        // The made-up leagues' names are their pages' (stand-in-league-sites.ts), which the
        // list's page puts on; here, as for a league no design names, the short name.
        name: league.slug,
        status: league.status,
        isOwner,
        roles,
        leagueWideRoles,
        onRoster,
      });
    }
    return rows;
  };
}
