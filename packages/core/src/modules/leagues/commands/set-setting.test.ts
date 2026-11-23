// setSetting, clearSetting and getSetting on a stand-in store; the same commands
// against the real database are in packages/database (stores, role matrix, harness).
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { testDeps } from '../../../command/testing/memory-transaction.ts';
import { eventHandlers } from '../../../event-handlers.ts';
import { memoryLeagues, ownerId, leagueId } from '../memory-leagues.test-helper.ts';
import { defineSetting, settingRegistry } from '../settings/define-setting.ts';
import { getSetting } from '../settings/get-setting.ts';
import { clearSetting, clearSettingFor } from './clear-setting.ts';
import { setSetting, setSettingFor } from './set-setting.ts';

const programId = '01900000-0000-7000-8000-0000000000c1';
const seasonId = '01900000-0000-7000-8000-0000000000d1';
const hours = defineSetting({
  key: 'notifications.reminderLeadHours',
  type: z.number().int().min(1).max(72),
  default: 24,
  levels: ['league', 'program', 'season'],
  permission: 'league.settings',
  label: 'setting.notifications.reminderLeadHours.label',
});
const leagueOnly = defineSetting({
  key: 'members.startPage',
  type: z.enum(['leagueHome', 'myTeam']),
  default: 'leagueHome',
  levels: ['league'],
  permission: 'league.settings',
  label: 'setting.members.startPage.label',
});
const names = defineSetting({
  key: 'privacy.publicNames',
  type: z.enum(['fullName', 'firstNameLastInitial', 'hidden']),
  default: 'firstNameLastInitial',
  levels: ['league'],
  permission: 'league.settings',
  label: 'setting.privacy.publicNames.label',
  confirm: ['fullName'],
});
const registry = settingRegistry([hours, leagueOnly, names]);
const set = setSettingFor(registry);
const clear = clearSettingFor(registry);

function setUp() {
  const m = memoryLeagues({
    programs: [
      { id: 'program-default', slug: 'main', isDefault: true },
      { id: programId, slug: 'youth', isDefault: false },
    ],
    seasons: [{ id: seasonId, programId, slug: 'fall', isCurrent: false }],
  });
  const context = m.as(ownerId);
  return { ...m, context };
}
const input = (extra: Record<string, unknown>) => ({
  level: 'league',
  key: hours.key,
  value: 12,
  version: null,
  ...extra,
});

describe('setSetting', () => {
  it('stores a valid value as a versioned document and writes the activity log', async () => {
    const { db, deps, context } = setUp();
    expect(await set(context, input({}), deps)).toEqual({
      ok: true,
      value: { key: hours.key, version: 1 },
    });
    expect(db.state.settings[0]).toMatchObject({
      place: { level: 'league' },
      document: { version: 1, value: 12 },
    });
    expect(db.state.activity[0]).toMatchObject({
      action: 'leagues.set_setting',
      targetType: 'league',
      targetId: leagueId,
      summary: 'activity.leagues.set_setting',
      details: {
        key: hours.key,
        level: 'league',
        label: 'setting.notifications.reminderLeadHours.label',
      },
    });
  });

  it('refuses a key that is not declared', () => {
    const { db, deps, context } = setUp();
    return set(context, input({ key: 'nothing.declared' }), deps).then((r) => {
      expect(r).toEqual({ ok: false, error: { code: 'unknown-setting' } });
      expect(db.state.settings).toEqual([]);
    });
  });

  it('refuses a value that fails its schema', async () => {
    const { db, deps, context } = setUp();
    for (const value of [0, 73, 1.5, 'x', null, undefined]) {
      expect(await set(context, input({ value }), deps)).toEqual({
        ok: false,
        error: { code: 'invalid-value' },
      });
    }
    expect(db.state.settings).toEqual([]);
  });

  it('saves a value it asks to confirm only once confirmed, and logs that it was (R-14)', async () => {
    const { db, deps, context } = setUp();
    const at = (extra: Record<string, unknown>) =>
      input({ key: names.key, value: 'fullName', ...extra });
    for (const confirmed of [undefined, false]) {
      expect(await set(context, at({ confirmed }), deps)).toEqual({
        ok: false,
        error: { code: 'confirmation-needed' },
      });
    }
    expect(db.state.settings).toEqual([]);
    expect(await set(context, at({ confirmed: true }), deps)).toMatchObject({ ok: true });
    expect(db.state.activity[0]?.details).toMatchObject({ key: names.key, confirmed: true });
    // Going back needs no confirming, and its entry does not say it was confirmed.
    const back = await set(context, at({ value: 'firstNameLastInitial', version: 1 }), deps);
    expect(back).toMatchObject({ ok: true });
    expect(db.state.activity[1]?.details).not.toHaveProperty('confirmed');
  });

  it('a change of how names show records one league-wide cache.clear job; others none (step 2.26)', async () => {
    const { db, transaction, context } = setUp();
    const deps = testDeps(transaction, eventHandlers);
    const named = input({ key: names.key, value: 'hidden' });
    expect(await set(context, named, deps)).toMatchObject({ ok: true });
    expect(db.jobs).toEqual([{ type: 'cache.clear', leagueId, ids: {} }]);
    // The same value again changes nothing; another setting clears nothing.
    expect(await set(context, { ...named, version: 1 }, deps)).toMatchObject({ ok: true });
    expect(await set(context, input({}), deps)).toMatchObject({ ok: true });
    expect(db.jobs).toHaveLength(1);
    // Going back to the default is a change of names too.
    const back = { level: 'league', key: names.key, version: 1 };
    expect(await clear(context, back, deps)).toMatchObject({ ok: true });
    expect(db.jobs).toEqual([
      { type: 'cache.clear', leagueId, ids: {} },
      { type: 'cache.clear', leagueId, ids: {} },
    ]);
  });

  it('writes nothing and logs nothing when the same value is saved again (record 065)', async () => {
    const { db, deps, context } = setUp();
    expect(await set(context, input({ value: 12 }), deps)).toEqual({
      ok: true,
      value: { key: hours.key, version: 1 },
    });
    expect(await set(context, input({ value: 12, version: 1 }), deps)).toEqual({
      ok: true,
      value: { key: hours.key, version: 1 },
    });
    expect(db.state.activity).toHaveLength(1);
    expect(db.state.settings.map((s) => s.version)).toEqual([1]);
    // Saved from a version that is gone, it is refused, as any stale save is.
    expect(await set(context, input({ value: 12, version: null }), deps)).toEqual({
      ok: false,
      error: { code: 'changed-since-read' },
    });
    // A different value is a change: written and logged.
    expect(await set(context, input({ value: 6, version: 1 }), deps)).toMatchObject({ ok: true });
    expect(db.state.activity).toHaveLength(2);
  });

  it('refuses a level the declaration does not allow', async () => {
    const { deps, context } = setUp();
    const r = await set(
      context,
      input({ key: leagueOnly.key, value: 'myTeam', level: 'season', seasonId }),
      deps,
    );
    expect(r).toEqual({ ok: false, error: { code: 'level-not-allowed' } });
  });

  it('sets at a program and a season, and refuses one that is not in the league', async () => {
    const { db, deps, context } = setUp();
    expect(await set(context, input({ level: 'program', programId }), deps)).toMatchObject({
      ok: true,
    });
    expect(await set(context, input({ level: 'season', seasonId, value: 5 }), deps)).toMatchObject({
      ok: true,
    });
    expect(db.state.settings).toHaveLength(2);
    const other = '01900000-0000-7000-8000-0000000000ff';
    for (const place of [
      { level: 'program', programId: other },
      { level: 'season', seasonId: other },
    ]) {
      expect(await set(context, input(place), deps)).toEqual({
        ok: false,
        error: { code: 'place-not-found' },
      });
    }
  });

  it('refuses a save started from a version that moved (A-8)', async () => {
    const { db, deps, context } = setUp();
    await set(context, input({}), deps);
    for (const version of [null, 7]) {
      expect(await set(context, input({ value: 3, version }), deps)).toEqual({
        ok: false,
        error: { code: 'changed-since-read' },
      });
    }
    expect(await set(context, input({ value: 3, version: 1 }), deps)).toMatchObject({
      value: { version: 2 },
    });
    expect(db.state.settings[0]?.document.value).toBe(3);
  });

  it('is for the owner and admins; others, visitors and read-only leagues are refused', async () => {
    const { db, deps, as } = setUp();
    const editor = '01900000-0000-7000-8000-0000000000a3';
    db.state.grants = [
      {
        id: 'g',
        accountId: editor,
        role: 'editor',
        scope: { type: 'league' },
        grantedByAccountId: ownerId,
        revokedAt: null,
      },
    ];
    for (const account of [editor, 'someone-else', null]) {
      expect(await set(as(account), input({}), deps)).toEqual({
        ok: false,
        error: { code: 'not-allowed' },
      });
    }
    if (db.state.league !== undefined) db.state.league = { ...db.state.league, status: 'archived' };
    expect(await set(as(ownerId), input({}), deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(db.state.settings).toEqual([]);
  });

  it('is checked at the program: an admin of another program is refused', async () => {
    const { db, deps, as } = setUp();
    const programAdmin = '01900000-0000-7000-8000-0000000000a4';
    db.state.grants = [
      {
        id: 'g',
        accountId: programAdmin,
        role: 'admin',
        scope: { type: 'program', id: 'program-default' },
        grantedByAccountId: ownerId,
        revokedAt: null,
      },
    ];
    expect(await set(as(programAdmin), input({ level: 'program', programId }), deps)).toMatchObject(
      {
        error: { code: 'not-allowed' },
      },
    );
  });
});

describe('the names setting in an archived or suspended league (R-26)', () => {
  const key = 'privacy.publicNames';
  const at = (value: unknown, version: number | null, confirmed?: boolean) => ({
    level: 'league',
    key,
    value,
    version,
    ...(confirmed === undefined ? {} : { confirmed }),
  });
  const confirmedKey = 'privacy.childrenInFullConfirmed';
  /** A league whose names setting is `start` (and the confirmation given), then put in `status`. */
  async function readOnly(status: 'archived' | 'suspended', start?: string, confirmation = false) {
    const m = setUp();
    if (start !== undefined) {
      const saved = await setSetting(m.as(ownerId), at(start, null), m.deps);
      if (!saved.ok) throw new Error('expected the starting value to save');
    }
    if (confirmation) {
      const given = await setSetting(
        m.as(ownerId),
        { level: 'league', key: confirmedKey, value: true, version: null, confirmed: true },
        m.deps,
      );
      if (!given.ok) throw new Error('expected the confirmation to save');
    }
    if (m.db.state.league !== undefined) m.db.state.league = { ...m.db.state.league, status };
    m.db.state.activity = [];
    return m;
  }
  const valueOf = (m: Awaited<ReturnType<typeof readOnly>>, of = key) =>
    m.db.state.settings.find((s) => s.key === of)?.document.value ??
    (of === key ? 'fullName' : false);

  it.each(['archived', 'suspended'] as const)(
    'lets the owner move it toward less shown while %s, one step at a time',
    async (status) => {
      const m = await readOnly(status, 'fullName');
      expect(await setSetting(m.as(ownerId), at('firstNameLastInitial', 1), m.deps)).toEqual({
        ok: true,
        value: { key, version: 2 },
      });
      expect(await setSetting(m.as(ownerId), at('hidden', 2), m.deps)).toMatchObject({ ok: true });
      expect(valueOf(m)).toBe('hidden');
      expect(m.db.state.activity).toHaveLength(2);
      // From the start (no value saved, full names), straight to hidden.
      const fresh = await readOnly(status);
      expect(await setSetting(fresh.as(ownerId), at('hidden', null), fresh.deps)).toMatchObject({
        ok: true,
      });
    },
  );

  it.each(['archived', 'suspended'] as const)(
    "lets the owner take the parents' confirmation back while %s, whichever way it is done",
    async (status) => {
      // Saying no.
      const saidNo = await readOnly(status, undefined, true);
      expect(
        await setSetting(
          saidNo.as(ownerId),
          { level: 'league', key: confirmedKey, value: false, version: 1 },
          saidNo.deps,
        ),
      ).toMatchObject({ ok: true });
      expect(valueOf(saidNo, confirmedKey)).toBe(false);
      // Going back to the default, which is no.
      const cleared = await readOnly(status, undefined, true);
      expect(
        await clearSetting(
          cleared.as(ownerId),
          { level: 'league', key: confirmedKey, version: 1 },
          cleared.deps,
        ),
      ).toMatchObject({ ok: true });
      expect(valueOf(cleared, confirmedKey)).toBe(false);
    },
  );

  it.each(['archived', 'suspended'] as const)(
    'refuses any move toward more shown while %s',
    async (status) => {
      const hidden = await readOnly(status, 'hidden');
      for (const value of ['firstNameLastInitial', 'fullName']) {
        expect(await setSetting(hidden.as(ownerId), at(value, 1), hidden.deps)).toMatchObject({
          ok: false,
          error: { code: 'not-allowed' },
        });
      }
      // Going back to the default (full names) from hidden would show more.
      expect(
        await clearSetting(hidden.as(ownerId), { level: 'league', key, version: 1 }, hidden.deps),
      ).toMatchObject({ ok: false, error: { code: 'not-allowed' } });
      expect(valueOf(hidden)).toBe('hidden');
      // Giving the confirmation would show children more.
      const fresh = await readOnly(status);
      expect(
        await setSetting(
          fresh.as(ownerId),
          { level: 'league', key: confirmedKey, value: true, version: null, confirmed: true },
          fresh.deps,
        ),
      ).toMatchObject({ ok: false, error: { code: 'not-allowed' } });
      // Saving the start again is not a move toward less.
      expect(await setSetting(fresh.as(ownerId), at('fullName', null), fresh.deps)).toMatchObject({
        ok: false,
        error: { code: 'not-allowed' },
      });
      expect(hidden.db.state.activity).toEqual([]);
      expect(fresh.db.state.settings).toEqual([]);
    },
  );

  it.each(['archived', 'suspended'] as const)(
    'still refuses every other setting, and anyone without the permission, while %s',
    async (status) => {
      const m = await readOnly(status);
      for (const other of [
        { level: 'league', key: 'privacy.playersMayAskForInitials', value: true, version: null },
        { level: 'league', key: 'privacy.playersMayAskForInitials', value: false, version: null },
        { level: 'league', key: 'members.startPage', value: 'myTeam', version: null },
      ]) {
        expect(await setSetting(m.as(ownerId), other, m.deps)).toMatchObject({
          error: { code: 'not-allowed' },
        });
      }
      for (const account of ['someone-else', null]) {
        expect(await setSetting(m.as(account), at('hidden', null), m.deps)).toMatchObject({
          error: { code: 'not-allowed' },
        });
      }
      expect(m.db.state.settings).toEqual([]);
    },
  );
});

describe('program admins and the activity log', () => {
  const programAdmin = '01900000-0000-7000-8000-0000000000a4';
  const adminOf = (id: string) => ({
    id: 'g',
    accountId: programAdmin,
    role: 'admin' as const,
    scope: { type: 'program' as const, id },
    grantedByAccountId: ownerId,
    revokedAt: null,
  });

  it('lets a program admin set and clear on their own program and its seasons only', async () => {
    const { db, deps, as } = setUp();
    db.state.grants = [adminOf(programId)];
    const admin = as(programAdmin);
    expect(await set(admin, input({ level: 'program', programId }), deps)).toMatchObject({
      ok: true,
    });
    expect(await set(admin, input({ level: 'season', seasonId, value: 5 }), deps)).toMatchObject({
      ok: true,
    });
    expect(await set(admin, input({}), deps)).toMatchObject({ error: { code: 'not-allowed' } });
    expect(
      await clear(admin, { level: 'season', seasonId, key: hours.key, version: 1 }, deps),
    ).toMatchObject({ ok: true });
    db.state.grants = [adminOf('program-default')];
    expect(await set(as(programAdmin), input({ level: 'season', seasonId }), deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });

  it('checks the permission the setting declares, at the place, not league.settings', async () => {
    const edits = defineSetting({
      key: 'site.banner',
      type: z.string().max(40),
      default: 'x',
      levels: ['league', 'program', 'season'],
      permission: 'site.edit',
      label: 'setting.site.banner.label',
    });
    const setEdit = setSettingFor(settingRegistry([edits]));
    const { db, deps, as } = setUp();
    const editor = '01900000-0000-7000-8000-0000000000a5';
    db.state.grants = [
      {
        id: 'e',
        accountId: editor,
        role: 'editor',
        scope: { type: 'program', id: programId },
        grantedByAccountId: ownerId,
        revokedAt: null,
      },
    ];
    const at = (extra: Record<string, unknown>) => ({
      key: edits.key,
      value: 'hi',
      version: null,
      ...extra,
    });
    expect(await setEdit(as(editor), at({ level: 'season', seasonId }), deps)).toMatchObject({
      ok: true,
    });
    expect(await setEdit(as(editor), at({ level: 'program', programId }), deps)).toMatchObject({
      ok: true,
    });
    expect(await setEdit(as(editor), at({ level: 'league' }), deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });

  it('writes the scope of a program or season place into the activity entry', async () => {
    const { db, deps, context } = setUp();
    await set(context, input({}), deps);
    await set(context, input({ level: 'program', programId }), deps);
    await set(context, input({ level: 'season', seasonId }), deps);
    await clear(context, { level: 'season', seasonId, key: hours.key, version: 1 }, deps);
    await clear(context, { level: 'program', programId, key: hours.key, version: 1 }, deps);
    const details = db.state.activity.map((a) => a.details);
    expect(details[0]).toMatchObject({ scopeType: 'league', scopeId: null });
    expect(details[1]).toMatchObject({ scopeType: 'program', scopeId: programId });
    expect(details[2]).toMatchObject({ scopeType: 'program', scopeId: programId });
    expect(details[3]).toMatchObject({ scopeType: 'program', scopeId: programId });
    expect(details[4]).toMatchObject({ scopeType: 'program', scopeId: programId });
  });
});

describe('clearSetting', () => {
  it('removes the value, so the lookup falls back, and writes the activity log', async () => {
    const { db, deps, context } = setUp();
    await set(context, input({ level: 'season', seasonId, value: 5 }), deps);
    await set(context, input({}), deps);
    const result = await clear(
      context,
      { level: 'season', seasonId, key: hours.key, version: 1 },
      deps,
    );
    expect(result).toEqual({ ok: true, value: { key: hours.key } });
    expect(db.state.settings).toHaveLength(1);
    expect(db.state.activity.at(-1)).toMatchObject({
      action: 'leagues.clear_setting',
      targetType: 'season',
      targetId: seasonId,
    });
  });

  it('refuses a version that moved, an unknown key and a missing place', async () => {
    const { deps, context } = setUp();
    await set(context, input({}), deps);
    const base = { level: 'league', key: hours.key, version: 9 };
    expect(await clear(context, base, deps)).toMatchObject({
      error: { code: 'changed-since-read' },
    });
    expect(await clear(context, { ...base, key: 'no.such' }, deps)).toMatchObject({
      error: { code: 'unknown-setting' },
    });
    expect(
      await clear(
        context,
        { ...base, level: 'program', programId: '01900000-0000-7000-8000-0000000000ff' },
        deps,
      ),
    ).toMatchObject({ error: { code: 'place-not-found' } });
  });

  it('is for the owner and admins only', async () => {
    const { deps, as } = setUp();
    expect(
      await clear(as('someone-else'), { level: 'league', key: hours.key, version: 1 }, deps),
    ).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});

describe('getSetting', () => {
  it('reads season, then program, then league, then our default', async () => {
    const { deps, context, transaction } = setUp();
    const read = (place: { programId?: string; seasonId?: string }) =>
      transaction(context, (tx) => getSetting(tx, hours, place));
    expect(await read({ seasonId })).toEqual({ value: 24, source: 'default' });
    await set(context, input({ value: 10 }), deps);
    expect(await read({ seasonId })).toEqual({ value: 10, source: 'league' });
    await set(context, input({ level: 'program', programId, value: 20 }), deps);
    expect(await read({ seasonId })).toEqual({ value: 20, source: 'program' });
    expect(await read({})).toEqual({ value: 10, source: 'league' });
    await set(context, input({ level: 'season', seasonId, value: 30 }), deps);
    expect(await read({ seasonId })).toEqual({ value: 30, source: 'season' });
    expect(await read({ programId })).toEqual({ value: 20, source: 'program' });
  });
});
