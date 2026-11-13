import { describe, expect, it } from 'vitest';
import {
  adminId,
  grantOf,
  memoryAccess,
  ownerId,
  programId,
  strangerId,
} from '../memory-access.test-helper.ts';
import { invite } from './invite.ts';
import { revokeGrant } from './revoke-grant.ts';

describe('revokeGrant', () => {
  it('ends access at once: the next command already reads it as gone (T-75)', async () => {
    const { db, deps, as } = memoryAccess();
    const adminGrant = db.state.grants[0];
    if (adminGrant === undefined) throw new Error('no admin');
    const input = { email: 'a@example.test', role: 'editor' };
    expect(await invite(as(adminId), input, deps)).toMatchObject({ ok: true });
    expect(await revokeGrant(as(ownerId), { grantId: adminGrant.id }, deps)).toEqual({
      ok: true,
      value: { grantId: adminGrant.id },
    });
    expect(await invite(as(adminId), { ...input, email: 'b@example.test' }, deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
    expect(db.state.activity.at(-1)).toMatchObject({
      actorAccountId: ownerId,
      action: 'access.revoke_grant',
      targetId: adminGrant.id,
      details: { role: 'admin', accountId: adminId },
    });
    expect(await revokeGrant(as(ownerId), { grantId: adminGrant.id }, deps)).toMatchObject({
      error: { code: 'grant-already-revoked' },
    });
  });

  it('lets an admin remove another admin, or themselves', async () => {
    const other = grantOf(strangerId, 'admin');
    const { db, deps, as } = memoryAccess();
    db.state.grants.push(other);
    expect(await revokeGrant(as(adminId), { grantId: other.id }, deps)).toMatchObject({ ok: true });
    const own = db.state.grants[0]?.id ?? '';
    expect(await revokeGrant(as(adminId), { grantId: own }, deps)).toMatchObject({ ok: true });
  });

  it("lets a program's admin remove only that program's roles", async () => {
    const programAdmin = grantOf(strangerId, 'admin', { type: 'program', id: programId });
    const inProgram = grantOf(ownerId, 'editor', { type: 'program', id: programId });
    const { db, deps, as } = memoryAccess();
    db.state.grants.push(programAdmin, inProgram);
    const leagueAdmin = db.state.grants[0]?.id ?? '';
    expect(await revokeGrant(as(strangerId), { grantId: leagueAdmin }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(await revokeGrant(as(strangerId), { grantId: inProgram.id }, deps)).toMatchObject({
      ok: true,
    });
  });

  it('says not found only to those who manage access for the whole league', async () => {
    const { deps, as } = memoryAccess();
    const grantId = '01900000-0000-7000-8000-0000000000ff';
    expect(await revokeGrant(as(ownerId), { grantId }, deps)).toMatchObject({
      error: { code: 'grant-not-found' },
    });
    expect(await revokeGrant(as(strangerId), { grantId }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
