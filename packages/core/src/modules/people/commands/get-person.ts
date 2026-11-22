// One person's league record, for their own page in Admin → People (step 2.50): the
// form that fixes their details reads it, with its version (T-46). It changes nothing,
// but runs in the same shape as a command (record 014), and reading is allowed in a
// league that is archived or suspended too. Contact email, birth date and minor-or-not
// are selected only when the acting role holds `people.read_sensitive` (R-16, T-76): for
// anyone else the query never reads them, so the record carries no `sensitive` key. A
// person in the bin is not found here: the bin is where they are brought back (A-5).
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayReadPeople, maySeeSensitive } from '../policy.ts';
import type { PeopleTx, PersonRecord } from '../ports.ts';

export type GetPersonError = { readonly code: 'person-not-found' };

export const getPerson = defineCommand({
  name: 'people.get_person',
  permission: 'people.read',
  input: z.object({ personId: z.uuid() }),
  allowed: (context, _input, tx: PeopleTx) => mayReadPeople(context, tx, 'people.read'),
  run: async ({ context, input, tx }): Promise<Result<PersonRecord, GetPersonError>> => {
    const person = await tx.people.find(input.personId, await maySeeSensitive(context, tx));
    if (person === undefined || person.binned) return fail({ code: 'person-not-found' });
    return ok(person);
  },
});
