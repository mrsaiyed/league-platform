// Cancels a pending or expired invitation (P4 §4). Its link stops working at once;
// the row stays, so the history of who was invited stays true. It works in an
// archived or suspended league too: taking an offer back must always be possible.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { recordActivity } from '../activity.ts';
import { mayManageInvitation } from '../policy.ts';
import type { AccessTx } from '../ports.ts';
import { scopeDetails } from '../scopes.ts';

export type CancelInvitationError = {
  readonly code: 'invitation-not-found' | 'invitation-closed';
};

export const cancelInvitation = defineCommand({
  name: 'access.cancel_invitation',
  permission: 'access.manage',
  input: z.object({ invitationId: z.uuid().transform((id) => id.toLowerCase()) }),
  allowed: (context, input, tx: AccessTx) => mayManageInvitation(context, tx, input.invitationId),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ invitationId: string }, CancelInvitationError>> => {
    const found = await tx.access.findInvitation(input.invitationId);
    if (found === undefined) return fail({ code: 'invitation-not-found' });
    if (found.status === 'accepted' || found.status === 'cancelled') {
      return fail({ code: 'invitation-closed' });
    }
    if (!(await tx.access.cancelInvitation(found.id))) return fail({ code: 'invitation-closed' });
    await recordActivity(tx, context, {
      action: 'access.cancel_invitation',
      target: { type: 'invitation', id: found.id },
      details: { role: found.role, ...scopeDetails(found.scope) },
    });
    return ok({ invitationId: found.id });
  },
});
