// The link an invitation's email carries (T-226), made when the email is sent and
// at no other time. Inviting and re-sending record an `email.send` job holding only
// the invitation's id (T-131: the jobs table takes ids and nothing else); the worker
// (step 1.19 part 2) calls this in a transaction for the job's league, puts the
// returned token in the link it builds, and forgets it. Only the token's hash is
// kept, so the plain token exists only in the email.
//
// This is a step of the worker's job, not a command: no person acts, and it is not
// in the command registry, so no request can reach it. Only the worker may import
// it (structure rule T-226, scripts/structure/worker-only.mjs).
//
// The offer is checked again here, as accepting would check it: nothing is sent for
// an invitation that is no longer pending, in a league that takes no new people
// (in the bin, archived or suspended), for a program that is gone, or from someone
// who can no longer give the role. Then the link stays as it was.
//
// The order the worker must follow (record 014):
//   1. call this and COMMIT its transaction, so the new hash is stored;
//   2. only then hand the email to the provider.
// Sending first and committing after could email a link whose hash was never stored
// (the commit fails), and that link would never work. Each call makes a new link and
// ends the one before, so a job run twice sends two emails: the second link works and
// the first one stops working. That is accepted (record 014, "Revisit if").
import { newInvitationToken } from './invitation-token.ts';
import { isOpenForNewPeople, senderStillMay } from './policy.ts';
import type { AccessTx, Invitation } from './ports.ts';

export type InvitationLink = { readonly token: string; readonly invitation: Invitation };

/** A new link for an invitation that may still be sent; undefined if there is nothing to send. */
export async function issueInvitationLink(
  tx: AccessTx,
  invitationId: string,
): Promise<InvitationLink | undefined> {
  const id = invitationId.toLowerCase();
  const found = await tx.access.findInvitation(id);
  if (found === undefined || found.status !== 'pending') return undefined;
  if (!(await isOpenForNewPeople(tx))) return undefined;
  if (found.scope.type === 'program' && !(await tx.access.programExists(found.scope.id))) {
    return undefined;
  }
  if (!(await senderStillMay(tx, found))) return undefined;
  const { token, tokenHash } = await newInvitationToken();
  // The store still checks it is pending, in the same update.
  const invitation = await tx.access.replaceInvitationLink(id, tokenHash);
  return invitation === undefined ? undefined : { token, invitation };
}
