import { describe, expect, it } from 'vitest';
import { activityKindOf } from '../activity-search.ts';
import type { ActivityEntry } from '../ports.ts';
import {
  adminId,
  grantOf,
  memoryAccess,
  ownerId,
  programId,
  strangerId,
} from '../memory-access.test-helper.ts';
import { searchActivity } from './search-activity.ts';

const entry = (action: string, actor: string): ActivityEntry => ({
  actorAccountId: actor,
  action,
  targetType: null,
  targetId: null,
  summary: `activity.${action}`,
  details: {},
});

// Written a second apart from 13 November 2026, 00:00 UTC, in this order.
const written = [
  entry('teams.remove_team', adminId),
  entry('standings.add_adjustment', ownerId),
  entry('leagues.update_season', adminId),
  entry('leagues.restore_team', adminId),
  entry('access.invite', ownerId),
];

describe('searchActivity', () => {
  it('pages the whole log newest first, older and newer (A-6, step 2.77)', async () => {
    const { deps, as } = memoryAccess({ activity: [...written] });
    const first = await searchActivity(as(adminId), { limit: 2 }, deps);
    if (!first.ok) throw new Error('refused');
    expect(first.value.entries.map((e) => e.action)).toEqual([
      'access.invite',
      'leagues.restore_team',
    ]);
    expect(first.value.newer).toBeNull();
    const older = first.value.older;
    if (older === null) throw new Error('no older page');
    const second = await searchActivity(as(adminId), { limit: 2, before: older }, deps);
    if (!second.ok) throw new Error('refused');
    expect(second.value.entries.map((e) => e.action)).toEqual([
      'leagues.update_season',
      'standings.add_adjustment',
    ]);
    const newer = second.value.newer;
    if (newer === null || second.value.older === null) throw new Error('no way on');
    const back = await searchActivity(as(adminId), { limit: 2, after: newer }, deps);
    expect(back).toMatchObject({
      ok: true,
      value: { entries: first.value.entries, newer: null },
    });
    const last = await searchActivity(as(adminId), { limit: 2, before: second.value.older }, deps);
    expect(last).toMatchObject({ ok: true, value: { older: null } });
    expect(last.ok && last.value.entries.map((e) => e.action)).toEqual(['teams.remove_team']);
  });

  it('keeps only one person, one kind of thing, and a span of time', async () => {
    const { deps, as } = memoryAccess({ activity: [...written] });
    const byOwner = await searchActivity(as(ownerId), { actor: ownerId }, deps);
    expect(byOwner.ok && byOwner.value.entries.map((e) => e.action)).toEqual([
      'access.invite',
      'standings.add_adjustment',
    ]);
    // A team brought back from the bin is about teams, not settings.
    const teams = await searchActivity(as(ownerId), { kind: 'teams' }, deps);
    expect(teams.ok && teams.value.entries.map((e) => e.action)).toEqual([
      'leagues.restore_team',
      'teams.remove_team',
    ]);
    const settings = await searchActivity(as(ownerId), { kind: 'settings' }, deps);
    expect(settings.ok && settings.value.entries.map((e) => e.action)).toEqual([
      'leagues.update_season',
    ]);
    const span = await searchActivity(
      as(ownerId),
      { from: '2026-11-13T00:00:01Z', until: '2026-11-13T00:00:03Z' },
      deps,
    );
    expect(span.ok && span.value.entries.map((e) => e.action)).toEqual([
      'leagues.update_season',
      'standings.add_adjustment',
    ]);
  });

  it('names a kind for every entry', () => {
    expect(activityKindOf('imports.record_imported_scores')).toBe('games');
    expect(activityKindOf('imports.apply_fixture_import')).toBe('schedule');
    expect(activityKindOf('leagues.restore_person')).toBe('people');
    expect(activityKindOf('leagues.set_setting')).toBe('settings');
    expect(activityKindOf('access.revoke_grant')).toBe('access');
  });

  it("is the owner's and the league's admins' only: not a program's admin, nor other roles", async () => {
    const { deps, as } = memoryAccess({
      activity: [...written],
      grants: [
        grantOf(adminId, 'admin'),
        grantOf(strangerId, 'admin', { type: 'program', id: programId }),
      ],
    });
    expect(await searchActivity(as(strangerId), {}, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    const { deps: d2, as: as2 } = memoryAccess({ grants: [grantOf(strangerId, 'scheduler')] });
    expect(await searchActivity(as2(strangerId), {}, d2)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(
      await searchActivity(
        as(ownerId),
        {
          before: { at: '2026-11-13T00:00:01Z', id: '01900000-0000-7000-8000-000000000001' },
          after: { at: '2026-11-13T00:00:01Z', id: '01900000-0000-7000-8000-000000000001' },
        },
        deps,
      ),
    ).toMatchObject({ error: { code: 'invalid-input' } });
  });
});
