// What the worker does as it sends an invitation's email (T-226).
import { describe, expect, it } from 'vitest';
import { acceptInvitation } from './commands/accept-invitation.ts';
import { invite } from './commands/invite.ts';
import { issueInvitationLink } from './invitation-link.ts';
import { hashInvitationToken } from './invitation-token.ts';
import {
  adminId,
  memoryAccess,
  ownerId,
  programId,
  strangerId,
} from './memory-access.test-helper.ts';

async function invited() {
  const made = memoryAccess();
  const result = await invite(
    made.as(ownerId),
    { email: 'a@example.test', role: 'editor' },
    made.deps,
  );
  if (!result.ok) throw new Error('not invited');
  return { ...made, invitationId: result.value.invitationId };
}

describe('issueInvitationLink', () => {
  it('makes a working link, keeping only its hash, and gives what the email needs', async () => {
    const { db, deps, as, invitationId } = await invited();
    const link = await deps.transaction(as(null), (tx) => issueInvitationLink(tx, invitationId));
    expect(link).toMatchObject({
      invitation: { id: invitationId, email: 'a@example.test', role: 'editor', status: 'pending' },
    });
    const token = link?.token ?? '';
    expect(db.state.invitations[0]?.tokenHash).toBe(await hashInvitationToken(token));
    expect(await acceptInvitation(as(strangerId), { token }, deps)).toMatchObject({ ok: true });
  });

  it('ends the link before when run again, as a retried job does', async () => {
    const { deps, as, invitationId, linkFor } = await invited();
    const first = await linkFor(invitationId);
    const second = await linkFor(invitationId);
    expect(await acceptInvitation(as(strangerId), { token: first }, deps)).toMatchObject({
      error: { code: 'invitation-not-found' },
    });
    expect(await acceptInvitation(as(strangerId), { token: second }, deps)).toMatchObject({
      ok: true,
    });
  });

  it('makes nothing for an invitation that is cancelled, used or expired', async () => {
    for (const change of [{ cancelled: true }, { acceptedBy: strangerId }, { expired: true }]) {
      const { db, deps, as, invitationId } = await invited();
      const stored = db.state.invitations[0];
      if (stored !== undefined) Object.assign(stored, change);
      const hash = stored?.tokenHash;
      expect(
        await deps.transaction(as(null), (tx) => issueInvitationLink(tx, invitationId)),
      ).toBeUndefined();
      expect(db.state.invitations[0]?.tokenHash).toBe(hash);
    }
  });

  it('makes nothing where the league takes no new people, keeping the link as it was', async () => {
    for (const change of [
      { status: 'archived' },
      { status: 'suspended' },
      { ownerId: undefined },
    ]) {
      const { db, deps, as, invitationId } = await invited();
      const hash = db.state.invitations[0]?.tokenHash;
      Object.assign(db.state, change);
      expect(
        await deps.transaction(as(null), (tx) => issueInvitationLink(tx, invitationId)),
      ).toBeUndefined();
      expect(db.state.invitations[0]?.tokenHash).toBe(hash);
    }
  });

  it('makes nothing once the sender can no longer give the role, or there is no sender', async () => {
    const made = memoryAccess();
    const sent = await invite(
      made.as(adminId),
      { email: 'b@example.test', role: 'editor' },
      made.deps,
    );
    if (!sent.ok) throw new Error('not invited');
    const { invitationId } = sent.value;
    const hash = made.db.state.invitations[0]?.tokenHash;
    made.db.state.grants = made.db.state.grants.map((g) => ({ ...g, revokedAt: 'now' }));
    expect(
      await made.deps.transaction(made.as(null), (tx) => issueInvitationLink(tx, invitationId)),
    ).toBeUndefined();
    expect(made.db.state.invitations[0]?.tokenHash).toBe(hash);

    const { db, deps, as, invitationId: ownersId } = await invited();
    const stored = db.state.invitations[0];
    if (stored !== undefined) stored.invitedByAccountId = null;
    expect(
      await deps.transaction(as(null), (tx) => issueInvitationLink(tx, ownersId)),
    ).toBeUndefined();
  });

  it('makes nothing once its program has gone to the bin', async () => {
    const made = memoryAccess();
    const sent = await invite(
      made.as(ownerId),
      { email: 'c@example.test', role: 'editor', scope: { type: 'program', id: programId } },
      made.deps,
    );
    if (!sent.ok) throw new Error('not invited');
    made.db.state.programs = [];
    expect(
      await made.deps.transaction(made.as(null), (tx) =>
        issueInvitationLink(tx, sent.value.invitationId),
      ),
    ).toBeUndefined();
  });
});
