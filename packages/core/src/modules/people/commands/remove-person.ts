// Moves a person's league record to the bin (A-5): the row stays, with `deleted_at`
// set, and can be restored for 30 days. It is refused while the person is on a team's
// roster: the admin takes them off first (they then stay in the team's history,
// R-17), so a roster never holds someone who is not in the league's list.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayChangePeople } from '../policy.ts';
import type { PeopleTx } from '../ports.ts';

export type RemovePersonError = { readonly code: 'person-not-found' | 'person-on-a-roster' };

export const removePerson = defineCommand({
  name: 'people.remove_person',
  permission: 'people.manage',
  input: z.object({ personId: z.uuid() }),
  allowed: (context, _input, tx: PeopleTx) => mayChangePeople(context, tx, 'people.manage'),
  run: async ({ context, input, tx }): Promise<Result<{ personId: string }, RemovePersonError>> => {
    const person = await tx.people.find(input.personId, false);
    if (person === undefined || person.binned) return fail({ code: 'person-not-found' });
    if (await tx.people.isOnRoster(person.id)) return fail({ code: 'person-on-a-roster' });
    await tx.people.setBinned(person.id, true);
    await recordActivity(tx, context, {
      action: 'people.remove_person',
      target: { type: 'person', id: person.id },
    });
    return ok({ personId: person.id });
  },
});
