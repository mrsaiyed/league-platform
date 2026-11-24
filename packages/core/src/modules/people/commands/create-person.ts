// Adds a person to the league by hand (P6 §7, T3 §3): a name, and optionally the name
// they are shown by, a contact email, a birth date and whether they are a minor. The
// sensitive three are set only by a role that may see them (R-16, T-76). A person
// added by hand has no account; claiming or registering links one later.
// S-109 (step 2.243): the first child an adult league records puts a confirmed
// "children in full" back to no in the same save, and the result says so.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { putBackOnFirstChild, watchForFirstChild } from '../../leagues/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import {
  birthDateAfter,
  personBirthDate,
  personEmail,
  personName,
  personPublicName,
} from '../person-fields.ts';
import { mayChangePeople, maySeeSensitive } from '../policy.ts';
import type { PeopleTx } from '../ports.ts';

export type CreatePersonError = {
  readonly code: 'sensitive-fields-not-allowed' | 'invalid-input';
};

export type PersonCreated = {
  readonly personId: string;
  /** Present when this was the adult league's first child and the yes went back to no. */
  readonly clearedChildrenInFull?: true;
};

export const createPerson = defineCommand({
  name: 'people.create_person',
  permission: 'people.manage',
  input: z.object({
    firstName: personName,
    lastName: personName,
    publicName: personPublicName.optional(),
    contactEmail: personEmail.optional(),
    birthDate: personBirthDate.optional(),
    isMinor: z.boolean().optional(),
  }),
  allowed: (context, _input, tx: PeopleTx) => mayChangePeople(context, tx, 'people.manage'),
  run: async ({ context, input, tx, emit }): Promise<Result<PersonCreated, CreatePersonError>> => {
    const hasSensitive =
      input.contactEmail !== undefined ||
      input.birthDate !== undefined ||
      input.isMinor !== undefined;
    if (hasSensitive && !(await maySeeSensitive(context, tx))) {
      return fail({ code: 'sensitive-fields-not-allowed' });
    }
    // Never after the league's own today (person-fields.ts).
    if (
      input.birthDate !== undefined &&
      birthDateAfter(input.birthDate, await tx.people.leagueToday())
    ) {
      return fail({ code: 'invalid-input' });
    }
    const watching = await watchForFirstChild(tx.people);
    const personId = await tx.people.create({
      firstName: input.firstName,
      lastName: input.lastName,
      publicName: input.publicName ?? null,
      contactEmail: input.contactEmail ?? null,
      birthDate: input.birthDate ?? null,
      isMinor: input.isMinor ?? null,
    });
    await recordActivity(tx, context, {
      action: 'people.create_person',
      target: { type: 'person', id: personId },
    });
    const putBack = await putBackOnFirstChild(tx.people, tx, context, emit, watching);
    return ok({ personId, ...(putBack ? { clearedChildrenInFull: true as const } : {}) });
  },
});
