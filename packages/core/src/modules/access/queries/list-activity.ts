// The activity log (A-6), newest first, a page at a time: visible to the owner and
// admins, and a program's admin sees the entries about their program. Read in the
// same shape as a command (record 014).
import { z } from 'zod';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { activityPageLimit } from '../access-values.ts';
import { hasPermission } from '../policy.ts';
import type { AccessTx, ActivityRecord } from '../ports.ts';
import { leagueScope, scopeInput } from '../scopes.ts';

export const listActivity = defineCommand({
  name: 'access.list_activity',
  input: z.object({
    limit: z.number().int().min(1).max(activityPageLimit).default(50),
    /** The last entry already shown; the page continues after it. */
    before: z.object({ at: z.iso.datetime({ offset: true }), id: z.uuid() }).optional(),
    scope: scopeInput.default(leagueScope),
  }),
  allowed: (context, input, tx: AccessTx) =>
    hasPermission(context, tx, 'activity.read', input.scope),
  run: async ({ input, tx }): Promise<Result<readonly ActivityRecord[], never>> =>
    ok(await tx.activity.list(input.limit, input.before, input.scope)),
});
