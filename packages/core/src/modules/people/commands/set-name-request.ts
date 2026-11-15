// Records what a person asked for about their name on the league's public pages (R-23,
// T-81): "as the league shows everyone", initials, or removed. Set by an admin or a
// registrar on the person's record (people.manage) until the person can set it
// themselves (stage 4). It writes `people.visibility`, which the one name function reads
// as the request; removed keeps the person's numbers as a nameless line (R-17).
//
// The activity log keeps ids and fixed words only (A-6, 0004), so the reason is one of
// a fixed list, not typed text, and names no one; it is always required (R-23).
//
// R-25: a request is saved only if it takes effect. Initials always do for a child (or
// a person of unknown age in a youth or mixed league), whatever the league's settings;
// for an adult only while the league lets players ask for initials, and otherwise the
// request is refused (`initials-not-offered`), never kept to do nothing. Removed always
// works. R-26: in an archived or suspended league a change that shows less of the person
// (to initials, or to removed) still works; one that shows more is refused (U-9).
// R-27: the check is for a new request only. Saving the value a person already has is
// not one: it is allowed and changes nothing, and a request once recorded keeps taking
// effect whatever later happens to the switch or to the person's age.
import { z } from 'zod';
import { hasPermission, readOnlyLeagueStatuses, recordActivity } from '../../access/index.ts';
import {
  defineCommand,
  fail,
  ok,
  type CommandContext,
  type Result,
} from '../../../command/index.ts';
import type { PeopleTx } from '../ports.ts';
import { readNamePolicy } from '../queries/read-name-policy.ts';
import {
  mayRecordNameRequest,
  nameRequests,
  requestShowsLess,
  type NameRequest,
} from '../rules/name-policy.ts';

/** Why the request was recorded: who asked, or that the league decided (R-23). */
export const nameRequestReasons = ['personAsked', 'guardianAsked', 'leagueDecided'] as const;
export type NameRequestReason = (typeof nameRequestReasons)[number];

export type SetNameRequestError = {
  readonly code: 'person-not-found' | 'changed-since-read' | 'initials-not-offered';
};

/**
 * May this account record the request? `people.manage`, and the league not read-only,
 * unless the request shows less of the person than the one kept (R-26). A person who is
 * not there is left to the command, which says so.
 */
async function mayRecordRequest(
  context: CommandContext,
  tx: PeopleTx,
  showAs: NameRequest,
  personId: string,
): Promise<boolean> {
  if (!(await hasPermission(context, tx, 'people.manage'))) return false;
  const status = await tx.access.leagueStatus();
  if (status === undefined) return false;
  if (!readOnlyLeagueStatuses.includes(status)) return true;
  const person = await tx.people.find(personId, false);
  return person === undefined || requestShowsLess(person.visibility, showAs);
}

export const setNameRequest = defineCommand({
  name: 'people.set_name_request',
  permission: 'people.manage',
  input: z.object({
    personId: z.uuid(),
    version: z.number().int().positive(),
    showAs: z.enum(nameRequests),
    reason: z.enum(nameRequestReasons),
  }),
  allowed: (context, input, tx: PeopleTx) =>
    mayRecordRequest(context, tx, input.showAs, input.personId),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ version: number }, SetNameRequestError>> => {
    // Whether the person is a child decides whether initials take effect (R-25). Only
    // people.manage reaches here, and every role holding it may also read sensitive
    // fields (P4 §4), so reading the age tells the caller nothing they may not see.
    const person = await tx.people.find(input.personId, input.showAs === 'initials');
    if (person === undefined || person.binned) return fail({ code: 'person-not-found' });
    if (person.version !== input.version) return fail({ code: 'changed-since-read' });
    if (person.visibility === input.showAs) return ok({ version: person.version });
    if (input.showAs === 'initials') {
      const [audience, policy] = await Promise.all([
        tx.people.leagueAudience(),
        readNamePolicy({ settingRows: (key) => tx.people.leagueSettingRows(key) }),
      ]);
      const isMinor = person.sensitive?.isMinor ?? null;
      if (!mayRecordNameRequest('initials', { isMinor }, audience, policy)) {
        return fail({ code: 'initials-not-offered' });
      }
    }
    const updated = await tx.people.update(person.id, { visibility: input.showAs }, input.version);
    if (updated === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'people.set_name_request',
      target: { type: 'person', id: person.id },
      details: { showAs: input.showAs, reason: input.reason },
    });
    return ok({ version: updated });
  },
});
