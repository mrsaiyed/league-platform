// Accepts an invitation from its link (P4 §4): the person signs in, or creates an
// account, and is in. The link names the league, so the app sets the league first
// (find_league_by_slug) and this runs inside that league's fence: a token from
// another league is simply not found (T-226). The link is the proof: any signed-in
// account that holds it may accept it, once, before it expires.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { recordActivity } from '../activity.ts';
import { roleGranted } from '../events.ts';
import { hashInvitationToken, invitationTokenSchema } from '../invitation-token.ts';
import { isSignedIn } from '../policy.ts';
import type { AccessTx } from '../ports.ts';
import type { Role } from '../roles.ts';
import { sameScope, scopeDetails, type Scope } from '../scopes.ts';

export type AcceptInvitationError = {
  readonly code: 'invitation-not-found' | 'invitation-expired' | 'invitation-closed';
};

export type AcceptedInvitation = {
  readonly grantId: string;
  readonly role: Role;
  readonly scope: Scope;
};

export const acceptInvitation = defineCommand({
  name: 'access.accept_invitation',
  input: z.object({ token: invitationTokenSchema }),
  allowed: (context, _input, _tx: AccessTx) => isSignedIn(context),
  run: async ({
    context,
    input,
    tx,
    emit,
  }): Promise<Result<AcceptedInvitation, AcceptInvitationError>> => {
    const accountId = context.accountId;
    if (accountId === null) throw new Error('access.accept_invitation: nobody is signed in.');
    const tokenHash = await hashInvitationToken(input.token);
    const invitation = await tx.access.findInvitationByTokenHash(tokenHash);
    if (invitation === undefined) return fail({ code: 'invitation-not-found' });
    if (invitation.status === 'expired') return fail({ code: 'invitation-expired' });
    if (invitation.status !== 'pending') return fail({ code: 'invitation-closed' });
    if (!(await tx.access.acceptInvitation(invitation.id, accountId))) {
      // It expired or was used between the read and the write.
      return fail({ code: 'invitation-closed' });
    }
    const { role, scope } = invitation;
    // Someone who already has this role here keeps the grant they have.
    const held = (await tx.access.activeGrantsOf(accountId)).find(
      (grant) => grant.role === role && sameScope(grant.scope, scope),
    );
    const grant =
      held ??
      (await tx.access.createGrant({
        accountId,
        role,
        scope,
        grantedByAccountId: invitation.invitedByAccountId,
      }));
    await recordActivity(tx, context, {
      action: 'access.accept_invitation',
      target: { type: 'role_grant', id: grant.id },
      details: { role, ...scopeDetails(scope), invitationId: invitation.id },
    });
    if (held === undefined)
      emit({ type: roleGranted, leagueId: context.leagueId, grantId: grant.id });
    return ok({ grantId: grant.id, role, scope });
  },
});
