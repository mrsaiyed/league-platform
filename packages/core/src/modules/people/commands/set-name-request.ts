// Records what a person asked for about their name on the league's public pages (R-23,
// T-81): "as the league shows everyone", initials, or removed. Set by an admin or a
// registrar on the person's record (people.manage) until the person can set it
// themselves (stage 4). It writes `people.visibility`, which the one name function reads
// as the request; removed keeps the person's numbers as a nameless line (R-17).
//
// The activity log keeps ids and fixed words only (A-6, 0004), so the reason is one of
// a fixed list, not typed text, and names no one. Initials take effect only while the
// league lets players ask for them (R-15); the request is kept either way.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayChangePeople } from '../policy.ts';
import type { PeopleTx } from '../ports.ts';
import { nameRequests } from '../rules/name-policy.ts';

/** Why the request was recorded: who asked, or that the league decided (R-23). */
export const nameRequestReasons = ['personAsked', 'guardianAsked', 'leagueDecided'] as const;
export type NameRequestReason = (typeof nameRequestReasons)[number];

export type SetNameRequestError = {
  readonly code: 'person-not-found' | 'changed-since-read';
};

export const setNameRequest = defineCommand({
  name: 'people.set_name_request',
  permission: 'people.manage',
  input: z.object({
    personId: z.uuid(),
    version: z.number().int().positive(),
    showAs: z.enum(nameRequests),
    reason: z.enum(nameRequestReasons),
  }),
  allowed: (context, _input, tx: PeopleTx) => mayChangePeople(context, tx, 'people.manage'),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ version: number }, SetNameRequestError>> => {
    const person = await tx.people.find(input.personId, false);
    if (person === undefined || person.binned) return fail({ code: 'person-not-found' });
    if (person.version !== input.version) return fail({ code: 'changed-since-read' });
    if (person.visibility === input.showAs) return ok({ version: person.version });
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
