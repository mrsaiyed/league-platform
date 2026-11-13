// setSetting, clearSetting and getSetting on a stand-in store; the same commands
// against the real database are in packages/database (stores, role matrix, harness).
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { memoryLeagues, ownerId, leagueId } from '../memory-leagues.test-helper.ts';
import { defineSetting, settingRegistry } from '../settings/define-setting.ts';
import { getSetting } from '../settings/get-setting.ts';
import { clearSettingFor } from './clear-setting.ts';
import { setSettingFor } from './set-setting.ts';

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
const registry = settingRegistry([hours, leagueOnly]);
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
