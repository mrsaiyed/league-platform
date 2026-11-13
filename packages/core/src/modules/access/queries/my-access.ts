// What the signed-in account may do in this league: whether it is the owner, its
// roles, and the permissions it has across the whole league. The admin shell uses
// it to show only what each person can use (P4 §4); the commands still check for
// themselves (T-74). Read in the same shape as a command (record 014).
import { z } from 'zod';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { allows, isSignedInHere } from '../policy.ts';
import type { AccessTx, Grant } from '../ports.ts';
import { permissions, type Permission } from '../roles.ts';
import { leagueScope } from '../scopes.ts';

export type MyAccess = {
  readonly isOwner: boolean;
  readonly grants: readonly Grant[];
  /** Permissions held for the whole league; a program role adds only its program's. */
  readonly leaguePermissions: readonly Permission[];
};

export const myAccess = defineCommand({
  name: 'access.my_access',
  input: z.object({}),
  allowed: (context, _input, tx: AccessTx) => isSignedInHere(context, tx),
  run: async ({ context, tx }): Promise<Result<MyAccess, never>> => {
    const accountId = context.accountId;
    if (accountId === null) throw new Error('access.my_access: nobody is signed in.');
    const holder = {
      accountId,
      isOwner: (await tx.access.ownerAccountId()) === accountId,
      grants: await tx.access.activeGrantsOf(accountId),
    };
    return ok({
      isOwner: holder.isOwner,
      grants: holder.grants,
      leaguePermissions: permissions.filter((p) => allows(holder, p, leagueScope)),
    });
  },
});
