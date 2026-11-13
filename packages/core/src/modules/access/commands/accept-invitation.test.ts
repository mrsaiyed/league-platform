import { describe, expect, it } from 'vitest';
import {
  grantOf,
  memoryAccess,
  ownerId,
  programId,
  strangerId,
} from '../memory-access.test-helper.ts';
import { acceptInvitation } from './accept-invitation.ts';
import { invite } from './invite.ts';

const volleyball = { type: 'program', id: programId } as const;

async function invited(role = 'scheduler', scope: object = volleyball) {
  const made = memoryAccess();
  const result = await invite(
    made.as(ownerId),
    { email: 'a@example.test', role, scope },
    made.deps,
  );
  if (!result.ok) throw new Error('not invited');
  const token = await made.linkFor(result.value.invitationId);
  return { ...made, token };
}

describe('acceptInvitation', () => {
  it('gives the signed-in account the role, for the place invited to', async () => {
    const { db, deps, as, token } = await invited();
    const result = await acceptInvitation(as(strangerId), { token }, deps);
    expect(result).toMatchObject({ ok: true, value: { role: 'scheduler', scope: volleyball } });
    expect(db.state.grants.at(-1)).toMatchObject({
      accountId: strangerId,
      role: 'scheduler',
      scope: volleyball,
      grantedByAccountId: ownerId,
      revokedAt: null,
    });
    expect(db.state.invitations[0]?.acceptedBy).toBe(strangerId);
    expect(db.state.activity.at(-1)).toMatchObject({
      actorAccountId: strangerId,
      action: 'access.accept_invitation',
      targetType: 'role_grant',
    });
  });

  it('works once only', async () => {
    const { db, deps, as, token } = await invited();
    await acceptInvitation(as(strangerId), { token }, deps);
    expect(await acceptInvitation(as(ownerId), { token }, deps)).toMatchObject({
      error: { code: 'invitation-closed' },
    });
    expect(db.state.grants.filter((g) => g.role === 'scheduler')).toHaveLength(1);
  });

  it('refuses an expired link, an unknown one, and a visitor', async () => {
    const { db, deps, as, token } = await invited();
    const stored = db.state.invitations[0];
    if (stored !== undefined) stored.expired = true;
    expect(await acceptInvitation(as(strangerId), { token }, deps)).toMatchObject({
      error: { code: 'invitation-expired' },
    });
    const unknown = 'x'.repeat(43);
    expect(await acceptInvitation(as(strangerId), { token: unknown }, deps)).toMatchObject({
      error: { code: 'invitation-not-found' },
    });
    if (stored !== undefined) stored.expired = false;
    expect(await acceptInvitation(as(null), { token }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(db.state.grants.some((g) => g.accountId === strangerId)).toBe(false);
  });

  it('keeps the grant someone already has instead of making a second', async () => {
    const { db, deps, as, token } = await invited('editor', { type: 'league' });
    const held = grantOf(strangerId, 'editor');
    db.state.grants.push(held);
    expect(await acceptInvitation(as(strangerId), { token }, deps)).toMatchObject({
      value: { grantId: held.id },
    });
    expect(db.state.grants.filter((g) => g.accountId === strangerId)).toHaveLength(1);
  });
});
