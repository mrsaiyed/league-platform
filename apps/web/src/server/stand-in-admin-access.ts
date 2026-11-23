// The Admins page and the accept page on the made-up stand-in (step 2.97). The stand-in's
// access store only reads (stand-in-ports.ts): its grants are listed, and inviting,
// re-sending, cancelling, removing and accepting refuse there, as they always have
// (record 075: the stand-in has no invitations; step 2.88 gives it some). The names are
// made-up stand-in names, and some people have given none, so the page's "No name yet"
// (A-14) is pictured too.
import type { AccessTx, CommandDeps } from '@srleagues/core';
import type { AdminAccessPorts } from './admin-access.ts';
import { standInPeople } from './stand-in-cast.ts';

/** Made-up names; the people left out have given none. */
const standInNames: ReadonlyMap<string, string> = new Map([
  [standInPeople.owner.accountId, 'Robin Example'],
  [standInPeople.scheduler.accountId, 'Jordan Example'],
  [standInPeople.coach.accountId, 'Casey Example'],
  [standInPeople.admin.accountId, 'Avery Example'],
  [standInPeople.registrar.accountId, 'Morgan Example'],
  [standInPeople.otherAdmin.accountId, 'Quinn Example'],
]);

export function standInAdminAccess(deps: CommandDeps<AccessTx>): AdminAccessPorts {
  return {
    deps,
    namesOf: async () => {
      const names = new Map<string, string | null>();
      for (const person of Object.values(standInPeople)) {
        names.set(person.accountId, standInNames.get(person.accountId) ?? null);
      }
      return names;
    },
    sendQueuedInvitations: null,
  };
}
