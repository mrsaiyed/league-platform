// Re-sends an invitation (P4 §4), pending or expired: the full time again, and a
// new email whose link the worker makes as it sends. The old link stops working at
// once, so a link sent to the wrong place can be replaced (T-226).
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { recordActivity } from '../activity.ts';
import { invitationLifetimeDays, invitationEmailJob } from '../access-values.ts';
import { newInvitationToken } from '../invitation-token.ts';
import { isOpenForNewPeople, mayManageInvitation } from '../policy.ts';
import type { AccessTx } from '../ports.ts';
import { scopeDetails } from '../scopes.ts';

export type InvitationClosedError = {
  readonly code: 'invitation-not-found' | 'invitation-closed' | 'league-read-only';
};

export const resendInvitation = defineCommand({
  name: 'access.resend_invitation',
  input: z.object({ invitationId: z.uuid().transform((id) => id.toLowerCase()) }),
  allowed: (context, input, tx: AccessTx) => mayManageInvitation(context, tx, input.invitationId),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ invitationId: string; expiresAt: string }, InvitationClosedError>> => {
    const found = await tx.access.findInvitation(input.invitationId);
    if (found === undefined) return fail({ code: 'invitation-not-found' });
    if (found.status === 'accepted' || found.status === 'cancelled') {
      return fail({ code: 'invitation-closed' });
    }
    if (!(await isOpenForNewPeople(tx))) return fail({ code: 'league-read-only' });
    // No link yet: the email job makes it as it sends (issueInvitationLink, T-226).
    const { tokenHash } = await newInvitationToken();
    const renewed = await tx.access.renewInvitation(found.id, tokenHash, invitationLifetimeDays);
    if (renewed === undefined) return fail({ code: 'invitation-closed' });
    await tx.jobs.enqueue({
      type: invitationEmailJob,
      leagueId: context.leagueId,
      ids: { invitationId: renewed.id },
    });
    await recordActivity(tx, context, {
      action: 'access.resend_invitation',
      target: { type: 'invitation', id: renewed.id },
      details: { role: renewed.role, ...scopeDetails(renewed.scope) },
    });
    return ok({ invitationId: renewed.id, expiresAt: renewed.expiresAt });
  },
});
