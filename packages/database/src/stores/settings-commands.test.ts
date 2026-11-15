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
  newPerson,
  newProgram,
  newSeason,
  one,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { divisionsStore } from './divisions-store.ts';
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
  divisions: divisionsStore(scope),
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

describe('what the Privacy settings read from the database (record 065)', () => {
  const inA = <T>(work: (tx: ReturnType<typeof transaction>) => Promise<T>) =>
    withTransaction(db, { leagueId: a.leagueId, accountId: a.ownerId }, (scope) =>
      work(transaction(scope)),
    );

  it('gives the time a value was saved, and writes nothing for the same value saved again', async () => {
    const [before] = await inA((tx) => tx.leagues.settingRows(hours.key, {}));
    expect(before?.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const logged = async () =>
      Number(
        (
          await one<{ n: string }>(
            pglite,
            `select count(*) as n from activity_log where league_id = $1 and action = 'leagues.set_setting'`,
            [a.leagueId],
          )
        ).n,
      );
    const entries = await logged();
    const version = before?.version ?? null;
    // The database keeps the document's keys in its own order; the same value is still seen.
    expect(
      await set(ctx(a), { level: 'league', key: hours.key, value: 11, version }, deps),
    ).toEqual({ ok: true, value: { key: hours.key, version } });
    expect(await logged()).toBe(entries);
    const [after] = await inA((tx) => tx.leagues.settingRows(hours.key, {}));
    expect(after).toEqual(before);
  });

  it('says who plays and whether anyone is recorded as a child, never another league', async () => {
    expect(await inA((tx) => tx.leagues.leagueAudience())).toBe('adult');
    expect(await inA((tx) => tx.leagues.hasRecordedChild())).toBe(false);
    const childInB = await newPerson(pglite, b.leagueId);
    await pglite.query('update people set is_minor = true where id = $1', [childInB]);
    expect(await inA((tx) => tx.leagues.hasRecordedChild())).toBe(false);
    const child = await newPerson(pglite, a.leagueId);
    await pglite.query('update people set is_minor = true where id = $1', [child]);
    expect(await inA((tx) => tx.leagues.hasRecordedChild())).toBe(true);
    // Someone in the bin does not count.
    await pglite.query('update people set deleted_at = now() where id = $1', [child]);
    expect(await inA((tx) => tx.leagues.hasRecordedChild())).toBe(false);
  });
});
