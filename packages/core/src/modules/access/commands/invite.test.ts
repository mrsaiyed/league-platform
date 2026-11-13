// invite on a stand-in store; on the real database in packages/database/src/stores.
import { describe, expect, it } from 'vitest';
import { hashInvitationToken } from '../invitation-token.ts';
import {
  adminId,
  grantOf,
  leagueId,
  memoryAccess,
  ownerId,
  programId,
  strangerId,
} from '../memory-access.test-helper.ts';
import { invite } from './invite.ts';

const volleyball = { type: 'program', id: programId } as const;

describe('invite', () => {
  it('stores only the hash of the link, and emails the link by a job (T-226)', async () => {
    const { db, deps, as } = memoryAccess();
    const result = await invite(
      as(adminId),
      { email: '  Helper@Example.TEST ', role: 'scorekeeper' },
      deps,
    );
    expect(result).toMatchObject({ ok: true, value: { expiresAt: 'in 14 days' } });
    const [stored] = db.state.invitations;
    expect(stored).toMatchObject({
      email: 'helper@example.test',
      role: 'scorekeeper',
      scope: { type: 'league' },
      invitedByAccountId: adminId,
    });
    const [job] = db.jobs;
    expect(job).toMatchObject({ type: 'access.send_invitation', leagueId });
    const token = job?.ids['token'] ?? '';
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(stored?.tokenHash).toBe(await hashInvitationToken(token));
    expect(JSON.stringify(db.state.invitations)).not.toContain(token);
    expect(db.state.activity).toEqual([
      {
        actorAccountId: adminId,
        action: 'access.invite',
        targetType: 'invitation',
        targetId: stored?.id,
        summary: 'activity.access.invite',
        details: { role: 'scorekeeper', scopeType: 'league', scopeId: null },
      },
    ]);
  });

  it('lets a program admin invite to that program only', async () => {
    const programAdmin = grantOf(strangerId, 'admin', volleyball);
    const { db, deps, as } = memoryAccess({ grants: [programAdmin] });
    const toProgram = { email: 'a@example.test', role: 'scheduler', scope: volleyball };
    expect(await invite(as(strangerId), toProgram, deps)).toMatchObject({ ok: true });
    const toLeague = { email: 'b@example.test', role: 'scheduler' };
    expect(await invite(as(strangerId), toLeague, deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
    expect(db.state.invitations).toHaveLength(1);
  });

  it('refuses a role at a scope it cannot have, or one not built yet', async () => {
    const { deps, as } = memoryAccess();
    const club = { type: 'club', id: programId };
    expect(
      await invite(as(ownerId), { email: 'a@example.test', role: 'coach' }, deps),
    ).toMatchObject({ error: { code: 'role-does-not-fit-scope' } });
    expect(
      await invite(as(ownerId), { email: 'a@example.test', role: 'club_admin', scope: club }, deps),
    ).toMatchObject({ error: { code: 'scope-not-available' } });
    const unknown = { type: 'program', id: '01900000-0000-7000-8000-0000000000ff' };
    expect(
      await invite(as(ownerId), { email: 'a@example.test', role: 'editor', scope: unknown }, deps),
    ).toMatchObject({ error: { code: 'program-not-found' } });
  });

  it('refuses a second open invitation for the same person, role and place', async () => {
    const { db, deps, as } = memoryAccess();
    const input = { email: 'a@example.test', role: 'editor' };
    await invite(as(ownerId), input, deps);
    expect(await invite(as(ownerId), { ...input, email: 'A@example.test' }, deps)).toMatchObject({
      error: { code: 'already-invited' },
    });
    expect(
      await invite(as(ownerId), { ...input, scope: volleyball }, deps),
    ).toMatchObject({ ok: true });
    expect(db.jobs).toHaveLength(2);
  });

  it('refuses a bad email before anything else', async () => {
    const { db, deps, as } = memoryAccess();
    expect(
      await invite(as(ownerId), { email: 'not an email', role: 'editor' }, deps),
    ).toMatchObject({ error: { code: 'invalid-input' } });
    expect(db.opened).toEqual([]);
  });
});
