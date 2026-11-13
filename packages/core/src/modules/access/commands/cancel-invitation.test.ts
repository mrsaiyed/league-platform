import { describe, expect, it } from 'vitest';
import { memoryAccess, ownerId, strangerId } from '../memory-access.test-helper.ts';
import { acceptInvitation } from './accept-invitation.ts';
import { cancelInvitation } from './cancel-invitation.ts';
import { invite } from './invite.ts';

describe('cancelInvitation', () => {
  it('cancels an open invitation, after which its link does nothing', async () => {
    const { db, deps, as } = memoryAccess();
    const made = await invite(as(ownerId), { email: 'a@example.test', role: 'editor' }, deps);
    if (!made.ok) throw new Error('not invited');
    const { invitationId } = made.value;
    expect(await cancelInvitation(as(ownerId), { invitationId }, deps)).toEqual({
      ok: true,
      value: { invitationId },
    });
    expect(db.state.activity.at(-1)).toMatchObject({
      action: 'access.cancel_invitation',
      targetId: invitationId,
    });
    expect(await cancelInvitation(as(ownerId), { invitationId }, deps)).toMatchObject({
      error: { code: 'invitation-closed' },
    });
    const token = db.jobs[0]?.ids['token'];
    expect(await acceptInvitation(as(strangerId), { token }, deps)).toMatchObject({
      error: { code: 'invitation-closed' },
    });
    expect(db.state.grants.some((g) => g.accountId === strangerId)).toBe(false);
  });

  it('is refused to anyone who may not manage access', async () => {
    const { db, deps, as } = memoryAccess();
    const made = await invite(as(ownerId), { email: 'a@example.test', role: 'editor' }, deps);
    if (!made.ok) throw new Error('not invited');
    expect(
      await cancelInvitation(as(strangerId), { invitationId: made.value.invitationId }, deps),
    ).toMatchObject({ error: { code: 'not-allowed' } });
    expect(db.state.invitations[0]?.cancelled).toBe(false);
  });
});
