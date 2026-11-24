// Brings a person's league record back from the bin (A-5). A person is linked to one
// account at most (0008), and the link lets go while they are in the bin, so the
// account may belong to another person now: then this says so. Restoring a person who
// is not in the bin changes nothing. Whoever may remove a person may restore them
// (A-5): `people.manage`, as `people.remove_person` needs, so a registrar can.
// S-109 (step 2.243): bringing back an adult league's only child records its first
// child again, so a confirmed "children in full" goes back to no in the same save.
import { z } from 'zod';
import { leagueScope, recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayRestore } from '../bin-policy.ts';
import { putBackOnFirstChild, watchForFirstChild } from './put-back-on-first-child.ts';
import type { BinTx } from '../bin.ts';

export type RestorePersonError = { readonly code: 'person-not-found' | 'person-profile-taken' };

export type PersonRestored = {
  readonly personId: string;
  /** Present when the person back was the adult league's first child (S-109). */
  readonly clearedChildrenInFull?: true;
};

export const restorePerson = defineCommand({
  name: 'leagues.restore_person',
  permission: 'people.manage',
  input: z.object({ personId: z.uuid() }),
  // People are the league's, not a program's (P4 §3): checked league-wide.
  allowed: (context, _input, tx: BinTx) => mayRestore(context, tx, 'people.manage', leagueScope),
  run: async ({
    context,
    input,
    tx,
    emit,
  }): Promise<Result<PersonRestored, RestorePersonError>> => {
    const person = await tx.bin.findPerson(input.personId);
    if (person === undefined) return fail({ code: 'person-not-found' });
    if (!person.binned) return ok({ personId: input.personId });
    const watching = await watchForFirstChild(tx.bin.firstChild);
    const restored = await tx.bin.restorePerson(input.personId);
    if (restored === 'profile-taken') return fail({ code: 'person-profile-taken' });
    if (restored === false) return fail({ code: 'person-not-found' });
    await recordActivity(tx, context, {
      action: 'leagues.restore_person',
      target: { type: 'person', id: input.personId },
    });
    const putBack = await putBackOnFirstChild(tx.bin.firstChild, tx, context, emit, watching);
    return ok({
      personId: input.personId,
      ...(putBack ? { clearedChildrenInFull: true as const } : {}),
    });
  },
});
