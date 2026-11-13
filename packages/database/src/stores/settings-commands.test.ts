// Defined settings (step 2.14) against the real database: the lookup order through
// real rows, saves that name their version, and a value written by another league
// never read. The role-by-command rows are in role-matrix.test.ts, the isolation
// cases in ../isolation.
import type { PGlite } from '@electric-sql/pglite';
import {
  clearSettingFor,
  defineSetting,
  getSetting,
  setSettingFor,
  settingRegistry,
  type CommandDeps,
  type Job,
  type LeaguesTx,
} from '@srleagues/core';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import {
  freshSchema,
  newLeague,
  newProgram,
  newSeason,
  one,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { leaguesStore } from './leagues-store.ts';

const hours = defineSetting({
  key: 'notifications.reminderLeadHours',
  type: z.number().int().min(1).max(72),
  default: 24,
  levels: ['league', 'program', 'season'],
  permission: 'league.settings',
  label: 'setting.notifications.reminderLeadHours.label',
});
const registry = settingRegistry([hours]);
const set = setSettingFor(registry);
const clear = clearSettingFor(registry);

let pglite: PGlite;
let db: DatabaseHandle;
let deps: CommandDeps<LeaguesTx>;
let a: MadeLeague;
let b: MadeLeague;
let programId: string;
let seasonId: string;
const transaction = (scope: Parameters<typeof leaguesStore>[0]) => ({
  jobs: { enqueue: async (_job: Job) => {} },
  leagues: leaguesStore(scope),
  access: accessStore(scope),
  activity: activityLogStore(scope),
});

beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  deps = {
    transaction: commandTransaction(db, transaction),
    events: [],
    log: () => {},
    now: () => 0,
  };
  a = await newLeague(pglite);
  b = await newLeague(pglite);
  programId = await newProgram(pglite, a.leagueId, 'youth');
  seasonId = await newSeason(pglite, a.leagueId, programId);
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const owner = { leagueId: '', accountId: '', requestId: 'r-1' };
const ctx = (league: MadeLeague) => ({
  ...owner,
  leagueId: league.leagueId,
  accountId: league.ownerId,
});
const read = (league: MadeLeague, place: { programId?: string; seasonId?: string }) =>
  withTransaction(db, { leagueId: league.leagueId, accountId: league.ownerId }, (scope) =>
    getSetting(transaction(scope), hours, place),
  );

describe('settings against the database', () => {
  it('reads season, then program, then league, then our default', async () => {
    expect(await read(a, { seasonId })).toEqual({ value: 24, source: 'default' });
    await set(ctx(a), { level: 'league', key: hours.key, value: 10, version: null }, deps);
    expect(await read(a, { seasonId })).toEqual({ value: 10, source: 'league' });
    await set(
      ctx(a),
      { level: 'program', programId, key: hours.key, value: 20, version: null },
      deps,
    );
    expect(await read(a, { seasonId })).toEqual({ value: 20, source: 'program' });
    await set(
      ctx(a),
      { level: 'season', seasonId, key: hours.key, value: 30, version: null },
      deps,
    );
    expect(await read(a, { seasonId })).toEqual({ value: 30, source: 'season' });
    expect(await read(a, {})).toEqual({ value: 10, source: 'league' });
  });

  it("never reads another league's values", async () => {
    expect(await read(b, {})).toEqual({ value: 24, source: 'default' });
    await set(ctx(b), { level: 'league', key: hours.key, value: 5, version: null }, deps);
    expect(await read(a, {})).toEqual({ value: 10, source: 'league' });
    expect(await read(b, {})).toEqual({ value: 5, source: 'league' });
  });

  it('saves at the version read, and refuses a stale or doubled save (A-8)', async () => {
    const league = { level: 'league', key: hours.key } as const;
    expect(await set(ctx(a), { ...league, value: 11, version: null }, deps)).toMatchObject({
      error: { code: 'changed-since-read' },
    });
    expect(await set(ctx(a), { ...league, value: 11, version: 1 }, deps)).toMatchObject({
      value: { version: 2 },
    });
    expect(await set(ctx(a), { ...league, value: 12, version: 1 }, deps)).toMatchObject({
      error: { code: 'changed-since-read' },
    });
    expect(await read(a, {})).toEqual({ value: 11, source: 'league' });
  });

  it('stores the versioned document the table asks for, and logs the change', async () => {
    const stored = await one<{ value: unknown }>(
      pglite,
      `select value from setting_values where league_id = $1 and level = 'league'`,
      [a.leagueId],
    );
    expect(stored.value).toEqual({ version: 1, value: 11 });
    const log = await one<{ n: string }>(
      pglite,
      `select count(*) as n from activity_log where league_id = $1 and action = 'leagues.set_setting'`,
      [a.leagueId],
    );
    expect(Number(log.n)).toBe(4);
  });

  it('clears a value so the lookup falls back, only at its version', async () => {
    const season = { level: 'season', seasonId, key: hours.key } as const;
    expect(await clear(ctx(a), { ...season, version: 5 }, deps)).toMatchObject({
      error: { code: 'changed-since-read' },
    });
    expect(await clear(ctx(a), { ...season, version: 1 }, deps)).toMatchObject({ ok: true });
    expect(await read(a, { seasonId })).toEqual({ value: 20, source: 'program' });
  });

  it('refuses a place of another league and an undeclared key', async () => {
    const otherProgram = await newProgram(pglite, b.leagueId, 'other');
    expect(
      await set(
        ctx(a),
        { level: 'program', programId: otherProgram, key: hours.key, value: 3, version: null },
        deps,
      ),
    ).toMatchObject({ error: { code: 'place-not-found' } });
    expect(
      await set(
        ctx(a),
        { level: 'league', key: 'nothing.declared', value: 3, version: null },
        deps,
      ),
    ).toMatchObject({ error: { code: 'unknown-setting' } });
  });
});
