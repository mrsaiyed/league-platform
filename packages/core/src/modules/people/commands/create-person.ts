// Adds a person to the league by hand (P6 §7, T3 §3): a name, and optionally the name
// they are shown by, a contact email, a birth date and whether they are a minor. The
// sensitive three are set only by a role that may see them (R-16, T-76). A person
// added by hand has no account; claiming or registering links one later.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { personBirthDate, personEmail, personName, personPublicName } from '../person-fields.ts';
import { mayChangePeople, maySeeSensitive } from '../policy.ts';
import type { PeopleTx } from '../ports.ts';

export type CreatePersonError = { readonly code: 'sensitive-fields-not-allowed' };

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
  run: async ({ context, input, tx }): Promise<Result<{ personId: string }, CreatePersonError>> => {
    const hasSensitive =
      input.contactEmail !== undefined ||
      input.birthDate !== undefined ||
      input.isMinor !== undefined;
    if (hasSensitive && !(await maySeeSensitive(context, tx))) {
      return fail({ code: 'sensitive-fields-not-allowed' });
    }
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
    return ok({ personId });
  },
});
