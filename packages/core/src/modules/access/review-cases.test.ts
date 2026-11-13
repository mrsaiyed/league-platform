// The rules added after the step 1.12 review, on the stand-in store: removing
// someone takes their invitations with them, accepting checks the offer again, read-
// only and binned leagues, and reads scoped to one program. The same rules on the
// real database are in packages/database/src/stores/access-review.test.ts.
import { describe, expect, it } from 'vitest';
import { readOnlyStatuses } from '../leagues/index.ts';
import { readOnlyLeagueStatuses } from './access-values.ts';
import { acceptInvitation } from './commands/accept-invitation.ts';
import { cancelInvitation } from './commands/cancel-invitation.ts';
import { invite } from './commands/invite.ts';
import { resendInvitation } from './commands/resend-invitation.ts';
import { revokeGrant } from './commands/revoke-grant.ts';
import {
  adminId,
  grantOf,
  memoryAccess,
  ownerId,
  programId,
  strangerId,
} from './memory-access.test-helper.ts';
import { listAccess } from './queries/list-access.ts';
import { listActivity } from './queries/list-activity.ts';
import { myAccess } from './queries/my-access.ts';

const volleyball = { type: 'program', id: programId } as const;
const joiner = '01900000-0000-7000-8000-0000000000a9';

async function sentBy(made: ReturnType<typeof memoryAccess>, by: string, scope: object = {}) {
  const result = await invite(
    made.as(by),
    { email: `${made.db.jobs.length}@example.test`, role: 'editor', ...scope },
    made.deps,
  );
  if (!result.ok) throw new Error(`not invited: ${result.error.code}`);
  return {
    invitationId: result.value.invitationId,
    token: made.db.jobs.at(-1)?.ids['token'] ?? '',
  };
}

describe('removing someone cancels the invitations they sent', () => {
  it('cancels those they could no longer send, and no one else’s', async () => {
    const made = memoryAccess();
    const fromAdmin = await sentBy(made, adminId);
    const fromOwner = await sentBy(made, ownerId);
    const grantId = made.db.state.grants[0]?.id ?? '';
    expect(await revokeGrant(made.as(ownerId), { grantId }, made.deps)).toMatchObject({
      value: { cancelledInvitations: 1 },
    });
    const statusOf = (id: string) => made.db.state.invitations.find((i) => i.id === id)?.cancelled;
    expect(statusOf(fromAdmin.invitationId)).toBe(true);
    expect(statusOf(fromOwner.invitationId)).toBe(false);
    expect(
      await acceptInvitation(made.as(joiner), { token: fromAdmin.token }, made.deps),
    ).toMatchObject({ error: { code: 'invitation-closed' } });
  });

  it('keeps those they can still send through another role', async () => {
    const programRole = grantOf(adminId, 'admin', volleyball);
    const made = memoryAccess();
    made.db.state.grants.push(programRole);
    const inProgram = await sentBy(made, adminId, { scope: volleyball });
    expect(
      await revokeGrant(
        made.as(ownerId),
        { grantId: made.db.state.grants[0]?.id ?? '' },
        made.deps,
      ),
    ).toMatchObject({ value: { cancelledInvitations: 0 } });
    expect(
      await acceptInvitation(made.as(joiner), { token: inProgram.token }, made.deps),
    ).toMatchObject({
      ok: true,
    });
  });
});

describe('accepting checks the offer again', () => {
  it('is withdrawn once the sender can no longer give that role', async () => {
    const made = memoryAccess();
    const sent = await sentBy(made, adminId);
    // The sender's access ended some other way than revokeGrant (which cancels too).
    made.db.state.grants = made.db.state.grants.map((g) => ({ ...g, revokedAt: 'now' }));
    expect(await acceptInvitation(made.as(joiner), { token: sent.token }, made.deps)).toEqual({
      ok: false,
      error: { code: 'invitation-withdrawn' },
    });
    expect(made.db.state.grants.some((g) => g.accountId === joiner)).toBe(false);
  });

  it('is withdrawn when no one is named as the sender', async () => {
    const made = memoryAccess();
    const sent = await sentBy(made, ownerId);
    made.db.state.invitations = made.db.state.invitations.map((i) => ({
      ...i,
      invitedByAccountId: null,
    }));
    expect(await acceptInvitation(made.as(joiner), { token: sent.token }, made.deps)).toMatchObject(
      {
        error: { code: 'invitation-withdrawn' },
      },
    );
  });

  it('is refused when the program has gone to the bin', async () => {
    const made = memoryAccess();
    const sent = await sentBy(made, ownerId, { scope: volleyball });
    made.db.state.programs = made.db.state.programs.filter((p) => p !== programId);
    expect(await acceptInvitation(made.as(joiner), { token: sent.token }, made.deps)).toMatchObject(
      {
        error: { code: 'program-not-found' },
      },
    );
  });
});

describe('archived and suspended leagues (U-9)', () => {
  it('are the leagues module’s read-only states', () => {
    expect([...readOnlyLeagueStatuses]).toEqual([...readOnlyStatuses]);
  });

  it('take no new people, but invitations can be cancelled and access removed', async () => {
    for (const status of readOnlyLeagueStatuses) {
      const made = memoryAccess();
      const sent = await sentBy(made, ownerId);
      const other = await sentBy(made, ownerId);
      made.db.state.status = status;
      const readOnly = { ok: false, error: { code: 'league-read-only' } };
      expect(
        await invite(made.as(ownerId), { email: 'x@example.test', role: 'editor' }, made.deps),
      ).toEqual(readOnly);
      expect(
        await resendInvitation(made.as(ownerId), { invitationId: sent.invitationId }, made.deps),
      ).toEqual(readOnly);
      expect(await acceptInvitation(made.as(joiner), { token: sent.token }, made.deps)).toEqual(
        readOnly,
      );
      expect(
        await cancelInvitation(made.as(ownerId), { invitationId: other.invitationId }, made.deps),
      ).toMatchObject({ ok: true });
      const grantId = made.db.state.grants[0]?.id ?? '';
      expect(await revokeGrant(made.as(ownerId), { grantId }, made.deps)).toMatchObject({
        ok: true,
      });
    }
  });
});

describe('a league in the bin', () => {
  it('lets no one do anything in it, the owner included', async () => {
    const made = memoryAccess();
    const sent = await sentBy(made, ownerId);
    made.db.state.ownerId = undefined;
    const refused = { ok: false, error: { code: 'not-allowed' } };
    const grantId = made.db.state.grants[0]?.id ?? '';
    for (const account of [ownerId, adminId]) {
      const as = made.as(account);
      expect(await invite(as, { email: 'x@example.test', role: 'editor' }, made.deps)).toEqual(
        refused,
      );
      expect(await resendInvitation(as, { invitationId: sent.invitationId }, made.deps)).toEqual(
        refused,
      );
      expect(await cancelInvitation(as, { invitationId: sent.invitationId }, made.deps)).toEqual(
        refused,
      );
      expect(await revokeGrant(as, { grantId }, made.deps)).toEqual(refused);
      expect(await listAccess(as, {}, made.deps)).toEqual(refused);
      expect(await listActivity(as, {}, made.deps)).toEqual(refused);
      expect(await myAccess(as, {}, made.deps)).toEqual(refused);
    }
    expect(await acceptInvitation(made.as(joiner), { token: sent.token }, made.deps)).toEqual(
      refused,
    );
  });
});

describe("a program's admin reads their own program", () => {
  it('sees its grants, invitations and activity, and not the league’s', async () => {
    const programAdmin = grantOf(strangerId, 'admin', volleyball);
    const made = memoryAccess();
    made.db.state.grants.push(programAdmin);
    await sentBy(made, ownerId);
    await sentBy(made, strangerId, { scope: volleyball });
    const asProgramAdmin = made.as(strangerId);
    expect(await listAccess(asProgramAdmin, {}, made.deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(await listAccess(asProgramAdmin, { scope: volleyball }, made.deps)).toMatchObject({
      ok: true,
      value: { grants: [{ id: programAdmin.id }], invitations: [{ scope: volleyball }] },
    });
    const activity = await listActivity(asProgramAdmin, { scope: volleyball }, made.deps);
    expect(activity).toMatchObject({ ok: true, value: [{ actorAccountId: strangerId }] });
    expect(activity.ok && activity.value).toHaveLength(1);
    expect(await listActivity(asProgramAdmin, {}, made.deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
