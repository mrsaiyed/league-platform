import { describe, expect, it } from 'vitest';
import { acceptInvitation } from '../commands/accept-invitation.ts';
import { cancelInvitation } from '../commands/cancel-invitation.ts';
import { invite } from '../commands/invite.ts';
import { resendInvitation } from '../commands/resend-invitation.ts';
import { revokeGrant } from '../commands/revoke-grant.ts';
import {
  adminId,
  memoryAccess,
  ownerId,
  programId,
  strangerId,
} from '../memory-access.test-helper.ts';
import { readInvitation } from './read-invitation.ts';

const notUsable = { ok: false, error: { code: 'invitation-not-usable' } };

async function invited(by = ownerId, scope: object = { type: 'league' }) {
  const made = memoryAccess();
  const result = await invite(
    made.as(by),
    { email: 'helper@example.test', role: 'scorekeeper', scope },
    made.deps,
  );
  if (!result.ok) throw new Error('not invited');
  const invitationId = result.value.invitationId;
  const token = await made.linkFor(invitationId);
  return { ...made, invitationId, token };
}

describe('readInvitation (step 2.97)', () => {
  it('says what a working link offers, and to which address it was sent', async () => {
    const { deps, as, token, db } = await invited();
    expect(await readInvitation(as(strangerId), { token }, deps)).toEqual({
      ok: true,
      value: {
        kind: 'open',
        role: 'scorekeeper',
        scope: { type: 'league' },
        sentTo: 'helper@example.test',
      },
    });
    // It only reads: nothing accepted, nothing in the activity log.
    expect(db.state.invitations[0]?.acceptedBy).toBeNull();
    expect(db.state.activity.map((e) => e.action)).toEqual(['access.invite']);
  });

  it('refuses a visitor: the link is read only once someone is signed in', async () => {
    const { deps, as, token } = await invited();
    expect(await readInvitation(as(null), { token }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });

  it('answers one way for a wrong, cancelled, run-out, replaced or used link', async () => {
    const wrong = await invited();
    expect(
      await readInvitation(wrong.as(strangerId), { token: 'x'.repeat(43) }, wrong.deps),
    ).toEqual(notUsable);

    const cancelled = await invited();
    await cancelInvitation(
      cancelled.as(ownerId),
      { invitationId: cancelled.invitationId },
      cancelled.deps,
    );
    expect(
      await readInvitation(cancelled.as(strangerId), { token: cancelled.token }, cancelled.deps),
    ).toEqual(notUsable);

    const ranOut = await invited();
    const stored = ranOut.db.state.invitations[0];
    if (stored !== undefined) stored.expired = true;
    expect(
      await readInvitation(ranOut.as(strangerId), { token: ranOut.token }, ranOut.deps),
    ).toEqual(notUsable);

    const replaced = await invited();
    await resendInvitation(
      replaced.as(ownerId),
      { invitationId: replaced.invitationId },
      replaced.deps,
    );
    await replaced.linkFor(replaced.invitationId);
    expect(
      await readInvitation(replaced.as(strangerId), { token: replaced.token }, replaced.deps),
    ).toEqual(notUsable);

    const used = await invited();
    await acceptInvitation(used.as(adminId), { token: used.token }, used.deps);
    expect(await readInvitation(used.as(strangerId), { token: used.token }, used.deps)).toEqual(
      notUsable,
    );
  });

  it('tells the account that accepted it, opening it again, that it is done', async () => {
    const { deps, as, token } = await invited();
    await acceptInvitation(as(strangerId), { token }, deps);
    expect(await readInvitation(as(strangerId), { token }, deps)).toEqual({
      ok: true,
      value: { kind: 'accepted', role: 'scorekeeper', scope: { type: 'league' } },
    });
  });

  it('answers the same when the offer no longer stands', async () => {
    // The admin who sent it lost their access: what they offered is withdrawn.
    const fromAdmin = await invited(adminId);
    const adminGrant = fromAdmin.db.state.grants.find((g) => g.accountId === adminId);
    // Removing the admin cancels their open invitations; put it back to pending so the
    // sender check itself is what is tested.
    if (adminGrant !== undefined) {
      await revokeGrant(fromAdmin.as(ownerId), { grantId: adminGrant.id }, fromAdmin.deps);
    }
    const row = fromAdmin.db.state.invitations[0];
    if (row !== undefined) row.cancelled = false;
    expect(
      await readInvitation(fromAdmin.as(strangerId), { token: fromAdmin.token }, fromAdmin.deps),
    ).toEqual(notUsable);

    const archived = await invited();
    archived.db.state.status = 'archived';
    expect(
      await readInvitation(archived.as(strangerId), { token: archived.token }, archived.deps),
    ).toEqual(notUsable);

    const programGone = await invited(ownerId, { type: 'program', id: programId });
    programGone.db.state.programs = [];
    expect(
      await readInvitation(
        programGone.as(strangerId),
        { token: programGone.token },
        programGone.deps,
      ),
    ).toEqual(notUsable);
  });
});
