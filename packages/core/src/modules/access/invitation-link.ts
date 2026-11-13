// The link an invitation's email carries (T-226), made when the email is sent and
// at no other time. Inviting and re-sending record an `email.send` job holding only
// the invitation's id (T-131: the jobs table takes ids and nothing else); the worker
// (step 1.19 part 2) calls this in a transaction for the job's league, puts the
// returned token in the link it builds, and forgets it. Only the token's hash is
// kept, so the plain token exists only in the email.
//
// This is a step of the worker's job, not a command: no person acts, and it is not
// in the command registry, so no request can reach it. Each call makes a new link
// and ends the one before, so a retried job sends a link that works and the earlier
// email's link stops working.
import { newInvitationToken } from './invitation-token.ts';
import type { AccessTx, Invitation } from './ports.ts';

export type InvitationLink = { readonly token: string; readonly invitation: Invitation };

/** A new link for a pending, unexpired invitation; undefined if there is nothing to send. */
export async function issueInvitationLink(
  tx: AccessTx,
  invitationId: string,
): Promise<InvitationLink | undefined> {
  const { token, tokenHash } = await newInvitationToken();
  const invitation = await tx.access.replaceInvitationLink(invitationId.toLowerCase(), tokenHash);
  return invitation === undefined ? undefined : { token, invitation };
}
