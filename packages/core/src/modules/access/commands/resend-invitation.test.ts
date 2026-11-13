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
    const { db, deps, as, invitationId } = await invited();
    const first = db.jobs[0]?.ids['token'] ?? '';
    const stored = db.state.invitations[0];
    if (stored !== undefined) stored.expired = true;
    expect(await resendInvitation(as(adminId), { invitationId }, deps)).toMatchObject({
      ok: true,
      value: { invitationId, expiresAt: 'in 14 days' },
    });
    const second = db.jobs[1]?.ids['token'] ?? '';
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
