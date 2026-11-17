// What an invitation's link offers, read before it is accepted (P4 §4, step 2.97): the
// accept page shows the role it gives and asks the signed-in person to accept it. It
// changes nothing, but runs in the shape of a command (record 014), inside the league's
// fence like accepting: a token from another league's link is simply not found.
//
// It checks exactly what accepting checks, so the page never offers a button that would
// then be refused. Every way a link cannot be used (no such link, used by someone else,
// cancelled, run out, replaced by a newer email, its sender no longer able to give the
// role, its program gone, the league taking no new people) is one answer,
// `invitation-not-usable`: someone trying links learns nothing about which it was. The
// one other answer is for the account that accepted it, opening the link again: it is
// told it is done, which tells nobody else anything.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { hashInvitationToken, invitationTokenSchema } from '../invitation-token.ts';
import { isOpenForNewPeople, isSignedInHere, senderStillMay } from '../policy.ts';
import type { AccessTx } from '../ports.ts';
import type { Role } from '../roles.ts';
import type { Scope } from '../scopes.ts';

export type InvitationOffer =
  | {
      readonly kind: 'open';
      readonly role: Role;
      readonly scope: Scope;
      /**
       * The address it was sent to: only for the page to say, without naming it, when the
       * person is signed in with another one (T-226: any holder of the link may accept).
       */
      readonly sentTo: string;
    }
  /** This account accepted it already. */
  | { readonly kind: 'accepted'; readonly role: Role; readonly scope: Scope };

export type ReadInvitationError = { readonly code: 'invitation-not-usable' };

export const readInvitation = defineCommand({
  name: 'access.read_invitation',
  permission: 'signed-in',
  input: z.object({ token: invitationTokenSchema }),
  allowed: (context, _input, tx: AccessTx) => isSignedInHere(context, tx),
  run: async ({ context, input, tx }): Promise<Result<InvitationOffer, ReadInvitationError>> => {
    const notUsable = fail({ code: 'invitation-not-usable' as const });
    const invitation = await tx.access.findInvitationByTokenHash(
      await hashInvitationToken(input.token),
    );
    if (invitation === undefined) return notUsable;
    const { role, scope } = invitation;
    if (invitation.status === 'accepted') {
      return invitation.acceptedByAccountId !== null &&
        invitation.acceptedByAccountId === context.accountId
        ? ok({ kind: 'accepted', role, scope })
        : notUsable;
    }
    if (invitation.status !== 'pending') return notUsable;
    if (!(await isOpenForNewPeople(tx))) return notUsable;
    if (scope.type === 'program' && !(await tx.access.programExists(scope.id))) return notUsable;
    if (!(await senderStillMay(tx, invitation))) return notUsable;
    return ok({ kind: 'open', role, scope, sentTo: invitation.email });
  },
});
