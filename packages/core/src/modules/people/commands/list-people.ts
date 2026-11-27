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
    // False for a screen that shows names only (Admin → Teams): the private columns are
    // then not read at all, whoever asks. True gives them to those who may see them.
    privateFields: z.boolean().default(true),
    // Only those ticked as children who are 18 or over by birth date (step 2.146). Ages
    // are private (R-16): for a role that may not see them the list is empty.
    tickedButGrown: z.boolean().default(false),
    // Only those added at a scorer's table with no age recorded (S-136, amended in step
    // 2.146's fix round), guarded the same way: whether someone counts as a child is private.
    walkUps: z.boolean().default(false),
  }),
  allowed: (context, _input, tx: PeopleTx) => mayReadPeople(context, tx, 'people.read'),
  run: async ({ context, input, tx }): Promise<Result<readonly PersonRecord[], never>> => {
    const sensitive = input.privateFields && (await maySeeSensitive(context, tx));
    if ((input.tickedButGrown || input.walkUps) && !sensitive) return ok([]);
    return ok(
      await tx.people.list({
        // Names only; a curly apostrophe (as a phone types "o’neill") is a plain one.
        ...(input.search === undefined
          ? {}
          : { search: input.search.replace(/[\u2018\u2019]/g, "'") }),
        limit: input.limit,
        offset: input.offset,
        sensitive,
        ...(input.tickedButGrown ? { tickedButGrown: true } : {}),
        ...(input.walkUps ? { walkUps: true } : {}),
      }),
    );
  },
});
