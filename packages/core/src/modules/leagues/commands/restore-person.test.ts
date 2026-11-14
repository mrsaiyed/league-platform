import { describe, expect, it } from 'vitest';
import { grantOf, memoryBin, ownerId, teamId } from '../memory-bin.test-helper.ts';
import { restorePerson } from './restore-person.ts';

const binnedAt = '2026-01-01T00:00:00.000Z';
const id = teamId(5);

describe('restorePerson', () => {
  it('brings a person back', async () => {
    const { db, deps, as } = memoryBin({
      things: [{ id, kind: 'person', name: 'Sam', binnedAt }],
    });
    expect(await restorePerson(as(ownerId), { personId: id }, deps)).toMatchObject({ ok: true });
    expect(db.state.things[0]?.binnedAt).toBeNull();
    expect(db.state.activity.map((a) => a.action)).toEqual(['leagues.restore_person']);
  });

  it('says so when their account is linked to someone else now', async () => {
    const { db, deps, as } = memoryBin({
      things: [{ id, kind: 'person', name: 'Sam', binnedAt, clash: 'profile-taken' }],
    });
    expect(await restorePerson(as(ownerId), { personId: id }, deps)).toEqual({
      ok: false,
      error: { code: 'person-profile-taken' },
    });
    expect(db.state.things[0]?.binnedAt).toBe(binnedAt);
  });

  it('refuses a missing person and non-admins', async () => {
    const { deps, as } = memoryBin();
    expect(await restorePerson(as(ownerId), { personId: id }, deps)).toMatchObject({
      error: { code: 'person-not-found' },
    });
    expect(await restorePerson(as('someone'), { personId: id }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });

  it('lets a registrar restore, as they may remove (A-5), but not a scheduler', async () => {
    const { deps, as } = memoryBin({
      things: [{ id, kind: 'person', name: 'Sam', binnedAt }],
      grants: [grantOf('reg', 'registrar'), grantOf('sch', 'scheduler')],
    });
    expect(await restorePerson(as('sch'), { personId: id }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(await restorePerson(as('reg'), { personId: id }, deps)).toMatchObject({ ok: true });
  });
});
