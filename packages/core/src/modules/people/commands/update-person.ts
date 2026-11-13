// Fixes a person's details: names, the name they are shown by, and (for a role that
// may see them, R-16) contact email, birth date and minor or not; null clears one.
// The save names the version it started from and is refused if someone else saved
// since (T-46). The activity entry names the fields changed, never their values.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { personBirthDate, personEmail, personName, personPublicName } from '../person-fields.ts';
import { mayChangePeople, maySeeSensitive } from '../policy.ts';
import type { PeopleTx, PersonChange } from '../ports.ts';

export type UpdatePersonError = {
  readonly code: 'person-not-found' | 'changed-since-read' | 'sensitive-fields-not-allowed';
};

export const updatePerson = defineCommand({
  name: 'people.update_person',
  permission: 'people.manage',
  input: z
    .object({
      personId: z.uuid(),
      version: z.number().int().positive(),
      firstName: personName.optional(),
      lastName: personName.optional(),
      publicName: personPublicName.nullable().optional(),
      contactEmail: personEmail.nullable().optional(),
      birthDate: personBirthDate.nullable().optional(),
      isMinor: z.boolean().nullable().optional(),
    })
    .refine(
      (p) =>
        p.firstName !== undefined ||
        p.lastName !== undefined ||
        p.publicName !== undefined ||
        p.contactEmail !== undefined ||
        p.birthDate !== undefined ||
        p.isMinor !== undefined,
      { path: ['firstName'] },
    ),
  allowed: (context, _input, tx: PeopleTx) => mayChangePeople(context, tx, 'people.manage'),
  run: async ({ context, input, tx }): Promise<Result<{ version: number }, UpdatePersonError>> => {
    const sensitive = await maySeeSensitive(context, tx);
    const touchesSensitive =
      input.contactEmail !== undefined ||
      input.birthDate !== undefined ||
      input.isMinor !== undefined;
    if (touchesSensitive && !sensitive) return fail({ code: 'sensitive-fields-not-allowed' });
    const person = await tx.people.find(input.personId, sensitive);
    if (person === undefined || person.binned) return fail({ code: 'person-not-found' });
    if (person.version !== input.version) return fail({ code: 'changed-since-read' });
    const was = person.sensitive;
    const change: PersonChange = {
      ...(input.firstName !== undefined && input.firstName !== person.firstName
        ? { firstName: input.firstName }
        : {}),
      ...(input.lastName !== undefined && input.lastName !== person.lastName
        ? { lastName: input.lastName }
        : {}),
      ...(input.publicName !== undefined && input.publicName !== person.publicName
        ? { publicName: input.publicName }
        : {}),
      ...(input.contactEmail !== undefined && input.contactEmail !== was?.contactEmail
        ? { contactEmail: input.contactEmail }
        : {}),
      ...(input.birthDate !== undefined && input.birthDate !== was?.birthDate
        ? { birthDate: input.birthDate }
        : {}),
      ...(input.isMinor !== undefined && input.isMinor !== was?.isMinor
        ? { isMinor: input.isMinor }
        : {}),
    };
    if (Object.keys(change).length === 0) return ok({ version: person.version });
    const updated = await tx.people.update(person.id, change, input.version);
    if (updated === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'people.update_person',
      target: { type: 'person', id: person.id },
      details: { changed: Object.keys(change).join(',') },
    });
    return ok({ version: updated });
  },
});
