// Removes someone's access (P4 §4): the grant ends now and every command after this
// one reads it as gone (T-75). The row stays, with who ended it, so the history of
// who could do what stays true. The owner is not a grant and cannot be removed here.
//
// Invitations the person sent, which they could no longer send, are cancelled with
// it: removing an admin must not leave their open invitations able to bring people
// in. (Accepting checks the sender again too, as a second guard.) Works in an
// archived or suspended league: removing access must always be possible.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { recordActivity } from '../activity.ts';
import { roleRevoked } from '../events.ts';
import { accessOfAccount, allows, mayManageGrant } from '../policy.ts';
import type { AccessTx } from '../ports.ts';
import { scopeDetails } from '../scopes.ts';

export type RevokeGrantError = { readonly code: 'grant-not-found' | 'grant-already-revoked' };

export const revokeGrant = defineCommand({
  name: 'access.revoke_grant',
  input: z.object({ grantId: z.uuid().transform((id) => id.toLowerCase()) }),
  allowed: (context, input, tx: AccessTx) => mayManageGrant(context, tx, input.grantId),
  run: async ({
    context,
    input,
    tx,
    emit,
  }): Promise<Result<{ grantId: string; cancelledInvitations: number }, RevokeGrantError>> => {
    const by = context.accountId;
    if (by === null) throw new Error('access.revoke_grant: nobody is signed in.');
    const grant = await tx.access.findGrant(input.grantId);
    if (grant === undefined) return fail({ code: 'grant-not-found' });
    if (grant.revokedAt !== null || !(await tx.access.revokeGrant(grant.id, by))) {
      return fail({ code: 'grant-already-revoked' });
    }
    // What the person still holds, read after the grant ended.
    const left = await accessOfAccount(tx, grant.accountId);
    let cancelledInvitations = 0;
    for (const invitation of await tx.access.listOpenInvitations()) {
      if (invitation.invitedByAccountId !== grant.accountId) continue;
      if (left !== undefined && allows(left, 'access.manage', invitation.scope)) continue;
      if (await tx.access.cancelInvitation(invitation.id)) cancelledInvitations += 1;
    }
    await recordActivity(tx, context, {
      action: 'access.revoke_grant',
      target: { type: 'role_grant', id: grant.id },
      details: {
        role: grant.role,
        ...scopeDetails(grant.scope),
        accountId: grant.accountId,
        cancelledInvitations,
      },
    });
    emit({ type: roleRevoked, leagueId: context.leagueId, grantId: grant.id });
    return ok({ grantId: grant.id, cancelledInvitations });
  },
});
