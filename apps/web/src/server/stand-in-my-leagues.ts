// THE STAND-IN'S "LEAGUES OF AN ACCOUNT". FOR LOCAL WORK AND TESTS ONLY.
//
// What the database's my_leagues() gives (migration 0018, record 066), over the made-up
// leagues in memory: for one account, each league not in the bin where it is the owner,
// holds a role in force, or has a current roster place, with nothing else. The roster
// places are the one made-up world's rows (step 2.152), read as the migration reads its
// tables: a roster entry not left, of a person and a team not in the bin, whose person is
// the account. The rule of what the person may see of each (U-9) is not here: core's
// myLeagues applies it to these rows, on the stand-in and on the database alike.
import type { AccessReader, AccountLeagueRow, LeagueStatus } from '@srleagues/core';
import { standInStatusOf } from './stand-in-league-states.ts';
import type { World } from './stand-in-world.ts';

type MadeUpLeague = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: LeagueStatus;
  readonly inBin: boolean;
};

export type StandInMyLeaguesOptions = {
  readonly leagues: readonly MadeUpLeague[];
  /** The access reader of one made-up league (the same one its pages read). */
  readonly accessOf: (leagueId: string) => Pick<AccessReader, 'ownerAccountId' | 'activeGrantsOf'>;
  /** The one made-up world, whose people and rosters give the roster places. */
  readonly world: Pick<World, 'read'>;
  /**
   * Roster places of a made-up account that is no person in the world's rows (the made-up
   * member who signs in with a password): account id to the leagues it plays in.
   */
  readonly placesBeyondTheWorld: Readonly<Record<string, readonly string[]>>;
};

/** Whether `accountId` is a person with a current place on a team of the league's rows. */
async function onWorldRoster(
  world: Pick<World, 'read'>,
  leagueId: string,
  accountId: string,
): Promise<boolean> {
  const rows = await world.read(leagueId);
  if (rows === undefined) return false;
  const persons = new Set(
    rows.people.filter((p) => !p.binned && p.accountId === accountId).map((p) => p.id),
  );
  const teams = new Set(rows.teams.filter((t) => !t.binned).map((t) => t.id));
  return rows.roster.some(
    (r) => r.leftOn === null && persons.has(r.personId) && teams.has(r.teamId),
  );
}

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
      const onRoster =
        (options.placesBeyondTheWorld[accountId] ?? []).includes(league.id) ||
        (await onWorldRoster(options.world, league.id, accountId));
      if (!isOwner && roles.length === 0 && !onRoster) continue;
      rows.push({
        leagueId: league.id,
        slug: league.slug,
        // The league's own name, as the database's leagues.name: the cast's, which its
        // pages show too (stand-in-league-sites.ts).
        name: league.name,
        status: standInStatusOf(league),
        isOwner,
        roles,
        leagueWideRoles,
        onRoster,
      });
    }
    return rows;
  };
}
