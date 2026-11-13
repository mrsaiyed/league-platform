// The Admins page (P4 §6): the grants in force and the invitations still open, for
// the whole league or for one program. Whoever manages access there may read it, so
// a program's admin sees their program's people and no one else's. It changes
// nothing, but runs in the same shape as a command, so it has the same permission
// check, transaction and log line (record 014). Accounts are given by id; their
// names need the owner-run lookup of record 008, which is not built yet.
import { z } from 'zod';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { hasPermission } from '../policy.ts';
import type { AccessTx, Grant, Invitation } from '../ports.ts';
import { covers, leagueScope, scopeInput } from '../scopes.ts';

export type AccessList = {
  readonly ownerAccountId: string | null;
  readonly grants: readonly Grant[];
  readonly invitations: readonly Invitation[];
};

export const listAccess = defineCommand({
  name: 'access.list_access',
  input: z.object({ scope: scopeInput.default(leagueScope) }),
  allowed: (context, input, tx: AccessTx) =>
    hasPermission(context, tx, 'access.manage', input.scope),
  run: async ({ input, tx }): Promise<Result<AccessList, never>> => {
    const within = (item: Grant | Invitation) => covers(input.scope, item.scope);
    return ok({
      ownerAccountId: (await tx.access.ownerAccountId()) ?? null,
      grants: (await tx.access.listGrants()).filter(within),
      invitations: (await tx.access.listOpenInvitations()).filter(within),
    });
  },
});
