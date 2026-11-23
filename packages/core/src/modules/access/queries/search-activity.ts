// The activity log's own screen (A-6, step 2.77): the league's whole log, a page at a
// time, newest first, by one person, of one kind of thing and between two moments, with
// where the next page older and the next page newer start. For the owner and the
// league's admins only: the whole league's log, never one program's (that is
// access.list_activity's). Read in the same shape as a command (record 014).
import { z } from 'zod';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { activityPageLimit } from '../access-values.ts';
import { activityKinds, activityMatchOf, type ActivitySearch } from '../activity-search.ts';
import { hasPermission } from '../policy.ts';
import type { ActivityCursor, ActivityRecord, ActivityTx, PermissionsTx } from '../ports.ts';
import { leagueScope } from '../scopes.ts';

export type ActivityPage = {
  readonly entries: readonly ActivityRecord[];
  /** Where the page of older entries starts, when there are older ones. */
  readonly older: ActivityCursor | null;
  /** Where the page of newer entries starts, when there are newer ones. */
  readonly newer: ActivityCursor | null;
};

const cursor = z.object({ at: z.iso.datetime({ offset: true }), id: z.uuid() });
const cursorOf = (entry: ActivityRecord | undefined): ActivityCursor | null =>
  entry === undefined ? null : { at: entry.at, id: entry.id };

export const searchActivity = defineCommand({
  name: 'access.search_activity',
  permission: 'activity.read',
  input: z
    .object({
      limit: z.number().int().min(1).max(activityPageLimit).default(25),
      /** The last entry already shown: the page of older ones. */
      before: cursor.optional(),
      /** The first entry already shown: the page of newer ones. */
      after: cursor.optional(),
      actor: z.uuid().optional(),
      kind: z.enum(activityKinds).optional(),
      from: z.iso.datetime({ offset: true }).optional(),
      until: z.iso.datetime({ offset: true }).optional(),
    })
    .refine((input) => input.before === undefined || input.after === undefined, {
      path: ['after'],
    }),
  // Any module's transaction that reads access and the log: the made-up world's too.
  allowed: (context, _input, tx: PermissionsTx & ActivityTx) =>
    hasPermission(context, tx, 'activity.read', leagueScope),
  run: async ({ input, tx }): Promise<Result<ActivityPage, never>> => {
    const search: ActivitySearch = {
      ...(input.after === undefined ? {} : { after: input.after }),
      ...(input.actor === undefined ? {} : { actorAccountId: input.actor }),
      ...(input.kind === undefined ? {} : { match: activityMatchOf(input.kind) }),
      ...(input.from === undefined ? {} : { from: input.from }),
      ...(input.until === undefined ? {} : { until: input.until }),
    };
    // One more than the page, to know whether another page lies beyond it.
    const found = await tx.activity.list(input.limit + 1, input.before, leagueScope, search);
    const more = found.length > input.limit;
    if (input.after !== undefined) {
      const entries = more ? found.slice(1) : found;
      return ok({
        entries,
        older: cursorOf(entries.at(-1)),
        newer: more ? cursorOf(entries[0]) : null,
      });
    }
    const entries = more ? found.slice(0, input.limit) : found;
    return ok({
      entries,
      older: more ? cursorOf(entries.at(-1)) : null,
      newer: input.before === undefined ? null : cursorOf(entries[0]),
    });
  },
});
