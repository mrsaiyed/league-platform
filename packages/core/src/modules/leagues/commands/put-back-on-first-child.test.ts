import { describe, expect, it, vi } from 'vitest';
import type { ActivityEntry } from '../../access/index.ts';
import type { FirstChildGuard } from './put-back-on-first-child.ts';
import { putBackOnFirstChild, watchForFirstChild } from './put-back-on-first-child.ts';

const context = { leagueId: 'league-1', accountId: 'owner-1', requestId: 'request-1' };
const yesRow = { level: 'league' as const, document: { version: 1, value: true }, version: 4 };

function guardOf(over: Partial<FirstChildGuard> & { rows?: unknown[][] }) {
  const rows = [...(over.rows ?? [[yesRow]])];
  const guard: FirstChildGuard = {
    leagueAudience: async () => 'adult',
    hasRecordedChild: async () => true,
    leagueSettingRows: async () => (rows.length > 1 ? rows.shift() : rows[0]) as never,
    clearLeagueSetting: async () => true,
    ...over,
  };
  const activity: ActivityEntry[] = [];
  const tx = {
    jobs: { enqueue: async () => {} },
    activity: { record: async (e: ActivityEntry) => void activity.push(e), list: async () => [] },
  };
  return { guard, tx, activity };
}

describe('putBackOnFirstChild (S-109)', () => {
  it('watches only an adult league that has no recorded child yet', async () => {
    expect(await watchForFirstChild(guardOf({ hasRecordedChild: async () => false }).guard)).toBe(
      true,
    );
    expect(await watchForFirstChild(guardOf({}).guard)).toBe(false);
    const mixed = guardOf({
      leagueAudience: async () => 'mixed',
      hasRecordedChild: async () => false,
    });
    expect(await watchForFirstChild(mixed.guard)).toBe(false);
  });

  it('clears the yes at the version read, logs it and emits the setting change', async () => {
    const clear = vi.fn(async () => true);
    const { guard, tx, activity } = guardOf({ clearLeagueSetting: clear });
    const emit = vi.fn();
    expect(await putBackOnFirstChild(guard, tx as never, context, emit, true)).toBe(true);
    expect(clear).toHaveBeenCalledWith('privacy.childrenInFullConfirmed', 4);
    expect(activity.map((a) => a.action)).toEqual(['leagues.clear_setting']);
    expect(emit).toHaveBeenCalledWith({
      type: 'leagues.setting_changed',
      leagueId: 'league-1',
      key: 'privacy.childrenInFullConfirmed',
    });
  });

  it('does nothing when not watching or when the save recorded no child', async () => {
    const clear = vi.fn(async () => true);
    const quiet = guardOf({ clearLeagueSetting: clear, hasRecordedChild: async () => false });
    expect(await putBackOnFirstChild(quiet.guard, quiet.tx as never, context, vi.fn(), true)).toBe(
      false,
    );
    const unwatched = guardOf({ clearLeagueSetting: clear });
    expect(
      await putBackOnFirstChild(unwatched.guard, unwatched.tx as never, context, vi.fn(), false),
    ).toBe(false);
    expect(clear).not.toHaveBeenCalled();
  });

  it('another save that cleared it first is fine; a yes that will not clear rolls back', async () => {
    const gone = guardOf({ clearLeagueSetting: async () => false, rows: [[yesRow], []] });
    expect(await putBackOnFirstChild(gone.guard, gone.tx as never, context, vi.fn(), true)).toBe(
      false,
    );
    const stuck = guardOf({ clearLeagueSetting: async () => false });
    await expect(
      putBackOnFirstChild(stuck.guard, stuck.tx as never, context, vi.fn(), true),
    ).rejects.toThrow('still yes');
  });
});
