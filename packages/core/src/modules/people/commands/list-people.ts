// The league's people for the admin list, searchable by name (P4 §3). It changes
// nothing, but runs in the same shape as a command (record 014). Contact email, birth
// date and minor-or-not are selected only when the acting role holds
// `people.read_sensitive` (R-16, T-76): for anyone else the query never reads them.
import { z } from 'zod';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { mayReadPeople, maySeeSensitive } from '../policy.ts';
import type { PeopleTx, PersonRecord } from '../ports.ts';

export const listPeople = defineCommand({
  name: 'people.list_people',
  permission: 'people.read',
  input: z.object({
    search: z.string().trim().min(1).max(100).optional(),
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).default(0),
  }),
  allowed: (context, _input, tx: PeopleTx) => mayReadPeople(context, tx, 'people.read'),
  run: async ({ context, input, tx }): Promise<Result<readonly PersonRecord[], never>> =>
    ok(
      await tx.people.list({
        ...(input.search === undefined ? {} : { search: input.search }),
        limit: input.limit,
        offset: input.offset,
        sensitive: await maySeeSensitive(context, tx),
      }),
    ),
});
