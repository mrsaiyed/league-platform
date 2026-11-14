import { describe, expect, it } from 'vitest';
import { grantOf, memoryBin, ownerId, teamId } from '../memory-bin.test-helper.ts';
import { restoreTeam } from './restore-team.ts';

const binnedAt = '2026-01-01T00:00:00.000Z';

describe('restoreTeam', () => {
  it('brings a team back with its roster', async () => {
    const { db, deps, as } = memoryBin({
      things: [{ id: teamId(1), kind: 'team', name: 'Hawks', binnedAt }],
      rosters: { [teamId(1)]: ['p1', 'p2'] },
    });
    expect(await restoreTeam(as(ownerId), { teamId: teamId(1) }, deps)).toMatchObject({ ok: true });
    expect(db.state.things[0]?.binnedAt).toBeNull();
    expect(db.state.rosters[teamId(1)]).toEqual(['p1', 'p2']);
    expect(db.state.activity.map((a) => a.action)).toEqual(['leagues.restore_team']);
  });

  it('says plainly when its short name or name was taken, and leaves it in the bin', async () => {
    const codes = {
      'short-name-taken': 'team-short-name-taken',
      'name-taken': 'team-name-taken',
      'lineage-taken': 'team-lineage-taken',
    } as const;
    for (const clash of ['short-name-taken', 'name-taken', 'lineage-taken'] as const) {
      const { db, deps, as } = memoryBin({
        things: [{ id: teamId(1), kind: 'team', name: 'Hawks', binnedAt, clash }],
      });
      expect(await restoreTeam(as(ownerId), { teamId: teamId(1) }, deps)).toEqual({
        ok: false,
        error: { code: codes[clash] },
      });
      expect(db.state.things[0]?.binnedAt).toBe(binnedAt);
    }
  });

  it('keeps a team in the bin while its division is there', async () => {
    const { deps, as } = memoryBin({
      things: [{ id: teamId(1), kind: 'team', name: 'Hawks', binnedAt, divisionInBin: true }],
    });
    expect(await restoreTeam(as(ownerId), { teamId: teamId(1) }, deps)).toMatchObject({
      error: { code: 'team-division-in-bin' },
    });
  });

  it('does nothing for a live team, and refuses a missing one, non-admins and an archived league', async () => {
    const live = memoryBin({
      things: [{ id: teamId(1), kind: 'team', name: 'A', binnedAt: null }],
    });
    expect(await restoreTeam(live.as(ownerId), { teamId: teamId(1) }, live.deps)).toMatchObject({
      ok: true,
    });
    expect(live.db.state.activity).toEqual([]);
    expect(await restoreTeam(live.as(ownerId), { teamId: teamId(9) }, live.deps)).toMatchObject({
      error: { code: 'team-not-found' },
    });
    expect(await restoreTeam(live.as('someone'), { teamId: teamId(1) }, live.deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    const archived = memoryBin({ status: 'archived' });
    expect(
      await restoreTeam(archived.as(ownerId), { teamId: teamId(1) }, archived.deps),
    ).toMatchObject({ error: { code: 'not-allowed' } });
  });

  it('needs what removing a team needs (A-5): a scheduler or registrar cannot', async () => {
    const { deps, as } = memoryBin({
      things: [{ id: teamId(1), kind: 'team', name: 'Hawks', binnedAt }],
      grants: [grantOf('reg', 'registrar'), grantOf('sch', 'scheduler'), grantOf('adm', 'admin')],
    });
    for (const who of ['reg', 'sch']) {
      expect(await restoreTeam(as(who), { teamId: teamId(1) }, deps)).toMatchObject({
        error: { code: 'not-allowed' },
      });
    }
    expect(await restoreTeam(as('adm'), { teamId: teamId(1) }, deps)).toMatchObject({ ok: true });
  });
});
