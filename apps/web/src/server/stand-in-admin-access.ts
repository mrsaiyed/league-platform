// The Admins page and the accept page on the made-up stand-in (step 2.97). The stand-in's
// access store only reads (stand-in-ports.ts): its grants are listed, and inviting,
// re-sending, cancelling, removing and accepting refuse there, as they always have
// (record 075: the stand-in has no invitations; step 2.88 gives it some). The names are
// made-up stand-in names, and some people have given none, so the page's "No name yet"
// (A-14) is pictured too.
import type { AccessTx, CommandDeps, OwnName, OwnNameStore } from '@srleagues/core';
import type { LogThingName } from '../features/access-area/activity-log-view.ts';
import type { AdminAccessPorts } from './admin-access.ts';
import { standInPeople } from './stand-in-cast.ts';
import type { World } from './stand-in-world.ts';

/** Made-up names; the people left out have given none. */
const standInNames: ReadonlyMap<string, string> = new Map([
  [standInPeople.owner.accountId, 'Robin Example'],
  [standInPeople.scheduler.accountId, 'Jordan Example'],
  [standInPeople.coach.accountId, 'Casey Example'],
  [standInPeople.admin.accountId, 'Avery Example'],
  [standInPeople.registrar.accountId, 'Morgan Example'],
  [standInPeople.otherAdmin.accountId, 'Quinn Example'],
]);

/**
 * The made-up world's own names (R-21, step 2.128), in memory: the named made-up people's to
 * start with, and whatever a person gives or changes on the account page. The Admins page
 * reads them, so a changed name shows there.
 */
export function standInOwnNames(): OwnNameStore & { readonly names: Map<string, OwnName> } {
  const names = new Map<string, OwnName>();
  for (const [accountId, name] of standInNames) {
    const [firstName = '', lastName = ''] = name.split(' ');
    names.set(accountId, { firstName, lastName });
  }
  return {
    names,
    create: async (accountId, name) => {
      if (names.has(accountId)) return 'already-has-one';
      names.set(accountId, name);
      return 'made';
    },
    rename: async (accountId, name) => {
      if (!names.has(accountId)) return 'no-own-profile';
      names.set(accountId, name);
      return 'renamed';
    },
  };
}

export function standInAdminAccess(
  deps: CommandDeps<AccessTx>,
  world: World,
  ownNames: ReturnType<typeof standInOwnNames>,
): AdminAccessPorts {
  return {
    deps,
    namesOf: async () => {
      const names = new Map<string, string | null>();
      for (const person of Object.values(standInPeople)) {
        const own = ownNames.names.get(person.accountId);
        names.set(person.accountId, own === undefined ? null : `${own.firstName} ${own.lastName}`);
      }
      // Someone who signed up through the form and has given a name (step 2.128).
      for (const [accountId, own] of ownNames.names) {
        names.set(accountId, `${own.firstName} ${own.lastName}`);
      }
      return names;
    },
    // The made-up world's rows of the league, things in the bin too (step 2.77).
    thingsNamed: async (leagueId, _accountId, asks) => {
      const s = await world.read(leagueId);
      if (s === undefined) return [];
      const teamName = (id: string) => s.teams.find((t) => t.id === id)?.name;
      const named: LogThingName[] = [];
      for (const ask of asks) {
        const { kind, id } = ask;
        if (kind === 'person') {
          const p = s.people.find((one) => one.id === id);
          if (p !== undefined)
            named.push({ kind, id, firstName: p.firstName, lastName: p.lastName });
        } else if (kind === 'game') {
          const g = s.games.find((one) => one.id === id);
          const home = g === undefined ? undefined : teamName(g.homeTeamId);
          const away = g === undefined ? undefined : teamName(g.awayTeamId);
          if (g !== undefined && home !== undefined && away !== undefined) {
            named.push({ kind, id, homeName: home, awayName: away, startsAt: g.startsAt });
          }
        } else {
          const name =
            kind === 'team'
              ? teamName(id)
              : kind === 'adjustment'
                ? teamName(s.adjustments.find((j) => j.id === id)?.teamId ?? '')
                : (kind === 'season'
                    ? s.seasons
                    : kind === 'division'
                      ? s.divisions
                      : s.venues
                  ).find((one) => one.id === id)?.name;
          if (name !== undefined) named.push({ kind, id, name });
        }
      }
      return named;
    },
    sendQueuedInvitations: null,
  };
}
