// Accepts an invitation from its link (P4 §4): the person signs in, or creates an
// account, and is in. The link names the league, so the app sets the league first
// (find_league_by_slug) and this runs inside that league's fence: a token from
// another league is simply not found (T-226). The link is the proof: any signed-in
// account that holds it may accept it, once, before it expires.
//
// What the invitation offered is checked again now, not as it was when sent: the
// person who sent it must still be able to give that role there, the program must
// still be there, and the league must not be archived or suspended (U-9).
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { recordActivity } from '../activity.ts';
import { roleGranted } from '../events.ts';
import { hashInvitationToken, invitationTokenSchema } from '../invitation-token.ts';
import { accessOfAccount, allows, isOpenForNewPeople, isSignedInHere } from '../policy.ts';
import type { AccessTx, Grant, Invitation } from '../ports.ts';
import type { Role } from '../roles.ts';
import { sameScope, scopeDetails, type Scope } from '../scopes.ts';

export type AcceptInvitationError = {
  readonly code:
    | 'invitation-not-found'
    | 'invitation-expired'
    | 'invitation-closed'
    | 'invitation-withdrawn'
    | 'program-not-found'
    | 'league-read-only';
};

export type AcceptedInvitation = {
  readonly grantId: string;
  readonly role: Role;
  readonly scope: Scope;
};

/** Whoever sent it may still give this role there (an invitation with no sender may not). */
async function senderStillMay(tx: AccessTx, invitation: Invitation): Promise<boolean> {
  if (invitation.invitedByAccountId === null) return false;
  const sender = await accessOfAccount(tx, invitation.invitedByAccountId);
  return sender !== undefined && allows(sender, 'access.manage', invitation.scope);
}

async function heldGrant(tx: AccessTx, accountId: string, role: Role, scope: Scope) {
  return (await tx.access.activeGrantsOf(accountId)).find(
    (grant) => grant.role === role && sameScope(grant.scope, scope),
  );
}

export const acceptInvitation = defineCommand({
  name: 'access.accept_invitation',
  input: z.object({ token: invitationTokenSchema }),
  allowed: (context, _input, tx: AccessTx) => isSignedInHere(context, tx),
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
    if (!(await isOpenForNewPeople(tx))) return fail({ code: 'league-read-only' });
    const { role, scope } = invitation;
    if (scope.type === 'program' && !(await tx.access.programExists(scope.id))) {
      return fail({ code: 'program-not-found' });
    }
    if (!(await senderStillMay(tx, invitation))) return fail({ code: 'invitation-withdrawn' });
    // Only while the link is still this one: a re-send a moment ago ended it.
    if (!(await tx.access.acceptInvitation(invitation.id, tokenHash, accountId))) {
      return fail({ code: 'invitation-closed' });
    }
    // Someone who already has this role here keeps the grant they have, even if it
    // was given a moment ago by another request.
    let grant: Grant | undefined = await heldGrant(tx, accountId, role, scope);
    let isNew = false;
    if (grant === undefined) {
      const created = await tx.access.createGrant({
        accountId,
        role,
        scope,
        grantedByAccountId: invitation.invitedByAccountId,
      });
      isNew = created !== 'already-held';
      grant = created === 'already-held' ? await heldGrant(tx, accountId, role, scope) : created;
    }
    if (grant === undefined) throw new Error('access.accept_invitation: the grant is gone.');
    await recordActivity(tx, context, {
      action: 'access.accept_invitation',
      target: { type: 'role_grant', id: grant.id },
      details: { role, ...scopeDetails(scope), invitationId: invitation.id },
    });
    if (isNew) emit({ type: roleGranted, leagueId: context.leagueId, grantId: grant.id });
    return ok({ grantId: grant.id, role, scope });
  },
});
