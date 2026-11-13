import { describe, expect, it } from 'vitest';
import { hashInvitationToken } from '../invitation-token.ts';
import { adminId, memoryAccess, ownerId, strangerId } from '../memory-access.test-helper.ts';
import { invite } from './invite.ts';
import { resendInvitation } from './resend-invitation.ts';

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

describe('resendInvitation', () => {
  it('gives the invitation a new link and a new expiry; the old link stops working', async () => {
    const { db, deps, as, invitationId, linkFor } = await invited();
    const first = await linkFor(invitationId);
    const stored = db.state.invitations[0];
    if (stored !== undefined) stored.expired = true;
    expect(await resendInvitation(as(adminId), { invitationId }, deps)).toMatchObject({
      ok: true,
      value: { invitationId, expiresAt: 'in 14 days' },
    });
    // The old link ends at once, before the new email goes.
    expect(db.state.invitations[0]?.tokenHash).not.toBe(await hashInvitationToken(first));
    expect(db.jobs.map((job) => job.ids)).toEqual([{ invitationId }, { invitationId }]);
    const second = await linkFor(invitationId);
    expect(second).not.toBe(first);
    expect(db.state.invitations[0]).toMatchObject({
      expired: false,
      tokenHash: await hashInvitationToken(second),
    });
    expect(db.state.activity.at(-1)).toMatchObject({ action: 'access.resend_invitation' });
  });

  it('refuses an accepted or cancelled invitation, and an unknown one', async () => {
    const { db, deps, as, invitationId } = await invited();
    const stored = db.state.invitations[0];
    if (stored !== undefined) stored.cancelled = true;
    expect(await resendInvitation(as(ownerId), { invitationId }, deps)).toMatchObject({
      error: { code: 'invitation-closed' },
    });
    const unknown = { invitationId: '01900000-0000-7000-8000-0000000000ff' };
    expect(await resendInvitation(as(ownerId), unknown, deps)).toMatchObject({
      error: { code: 'invitation-not-found' },
    });
    expect(db.jobs).toHaveLength(1);
  });

  it('refuses once the sender can no longer give the role, sending nothing', async () => {
    const made = memoryAccess();
    const sent = await invite(
      made.as(adminId),
      { email: 'b@example.test', role: 'editor' },
      made.deps,
    );
    if (!sent.ok) throw new Error('not invited');
    const { invitationId } = sent.value;
    const before = made.db.state.invitations[0];
    // The admin's access ended some other way than revokeGrant (which cancels too).
    made.db.state.grants = made.db.state.grants.map((g) => ({ ...g, revokedAt: 'now' }));
    expect(await resendInvitation(made.as(ownerId), { invitationId }, made.deps)).toEqual({
      ok: false,
      error: { code: 'invitation-withdrawn' },
    });
    expect(made.db.state.invitations[0]).toEqual(before);
    expect(made.db.jobs).toHaveLength(1);
  });

  it('refuses anyone who may not manage access, even for an unknown id', async () => {
    const { deps, as, invitationId } = await invited();
    expect(await resendInvitation(as(strangerId), { invitationId }, deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
    const unknown = { invitationId: '01900000-0000-7000-8000-0000000000ff' };
    expect(await resendInvitation(as(strangerId), unknown, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
