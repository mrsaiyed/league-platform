import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import { applyMigrations } from './apply-migrations.ts';
import { migrationChecksum } from './checksum.ts';
import { defaultMigrationsFolder, loadMigrations } from './load-migrations.ts';
import type { MigrationDriver } from './migration-driver.ts';
import type { Migration } from './migration-types.ts';
import { pgliteDriver } from './pglite-driver.ts';
import { runMigrations } from './run-migrations.ts';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step();
});

async function freshDatabase(): Promise<MigrationDriver> {
  const driver = pgliteDriver(new PGlite());
  cleanup.push(() => driver.close());
  return driver;
}

async function folderWith(files: Record<string, string>): Promise<string> {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'migrations-'));
  cleanup.push(() => rm(folder, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) await writeFile(path.join(folder, name), text);
  return folder;
}

const migration = (version: number, name: string, sql: string): Migration => ({
  version,
  name,
  sql,
  checksum: migrationChecksum(sql),
});

/** A driver whose queries matching `pattern` are answered by `answer` instead. */
function intercept(
  driver: MigrationDriver,
  pattern: RegExp,
  answer: () => Promise<unknown[]>,
): MigrationDriver {
  return {
    ...driver,
    async query<Row>(sql: string, params?: readonly unknown[]) {
      if (pattern.test(sql)) return { rows: (await answer()) as Row[] };
      return driver.query<Row>(sql, params);
    },
  };
}

const logRows = (driver: MigrationDriver) =>
  driver
    .query<{
      version: number;
      name: string;
      checksum: string;
    }>('select version, name, checksum from migration_log.applied order by version')
    .then((r) => r.rows);

const tableExists = async (driver: MigrationDriver, name: string) =>
  (await driver.query<{ found: string | null }>('select to_regclass($1)::text as found', [name]))
    .rows[0]?.found === name;

const steps = {
  '0001_teams.sql': 'create table teams (id integer primary key);\n',
  '0002_team_names.sql': 'alter table teams add column name text;\n',
  '0003_players.sql':
    'create table players (id integer primary key, team_id integer references teams (id));\n',
};
const none = { applied: [], alreadyApplied: [], newerInDatabase: [] };

describe('the repository migrations', () => {
  it('apply to a fresh database and record each file with its checksum', async () => {
    const driver = await freshDatabase();
    const loaded = await loadMigrations();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const run = await applyMigrations(driver);
    expect(run).toEqual({
      ok: true,
      value: { ...none, applied: loaded.value.map((m) => m.name) },
    });
    expect(await logRows(driver)).toEqual(
      loaded.value.map((m) => ({ version: m.version, name: m.name, checksum: m.checksum })),
    );
  });

  it('run again is a no-op', async () => {
    const driver = await freshDatabase();
    await applyMigrations(driver);
    const before = await logRows(driver);

    const again = await applyMigrations(driver, defaultMigrationsFolder);
    expect(again.ok && again.value.applied).toEqual([]);
    expect(again.ok && again.value.alreadyApplied).toEqual(before.map((r) => r.name));
    expect(await logRows(driver)).toEqual(before);
  });
});

describe('runMigrations', () => {
  it('applies files in number order, each building on the last', async () => {
    const driver = await freshDatabase();
    // Written in reverse so the order comes from the numbers, not the folder listing.
    const folder = await folderWith(Object.fromEntries(Object.entries(steps).reverse()));

    const run = await applyMigrations(driver, folder);
    expect(run).toEqual({ ok: true, value: { ...none, applied: Object.keys(steps) } });
    await driver.query("insert into teams (id, name) values (1, 'Made-up Team')");
    await driver.query('insert into players (id, team_id) values (1, 1)');
  });

  it('applies only the new files when more are added later', async () => {
    const driver = await freshDatabase();
    const folder = await folderWith({ '0001_teams.sql': steps['0001_teams.sql'] });
    await applyMigrations(driver, folder);
    await writeFile(path.join(folder, '0002_team_names.sql'), steps['0002_team_names.sql']);

    const run = await applyMigrations(driver, folder);
    expect(run).toEqual({
      ok: true,
      value: { ...none, applied: ['0002_team_names.sql'], alreadyApplied: ['0001_teams.sql'] },
    });
  });

  it('checks the list it is given: in order, without gaps, checksums matching', async () => {
    const driver = await freshDatabase();
    const one = migration(1, '0001_teams.sql', steps['0001_teams.sql']);
    const two = migration(2, '0002_team_names.sql', steps['0002_team_names.sql']);

    const unsorted = await runMigrations(driver, [two, one]);
    expect(!unsorted.ok && unsorted.error.code).toBe('version_gap');
    const gap = await runMigrations(driver, [two]);
    expect(!gap.ok && gap.error.code).toBe('version_gap');
    const forged = await runMigrations(driver, [{ ...one, sql: 'drop table teams;\n' }]);
    expect(!forged.ok && forged.error.code).toBe('bad_checksum');
    const control = await runMigrations(driver, [migration(1, '0001_a.sql', 'commit;\n')]);
    expect(!control.ok && control.error.code).toBe('transaction_control');
    expect(await tableExists(driver, 'migration_log.applied')).toBe(false);
  });

  it('refuses to run when an applied file was edited, and applies nothing new', async () => {
    const driver = await freshDatabase();
    const folder = await folderWith({ '0001_teams.sql': steps['0001_teams.sql'] });
    await applyMigrations(driver, folder);
    await writeFile(path.join(folder, '0001_teams.sql'), 'create table teams (id bigint);\n');
    await writeFile(path.join(folder, '0002_team_names.sql'), steps['0002_team_names.sql']);

    const run = await applyMigrations(driver, folder);
    expect(run.ok).toBe(false);
    if (run.ok) return;
    expect(run.error.code).toBe('applied_file_changed');
    expect(run.error.file).toBe('0001_teams.sql');
    expect(run.applied).toEqual([]);
    expect((await logRows(driver)).map((r) => r.name)).toEqual(['0001_teams.sql']);
  });

  it('treats a change of line endings or a byte-order mark as no change', async () => {
    const driver = await freshDatabase();
    const folder = await folderWith({ '0001_teams.sql': 'create table teams (id integer);\n' });
    await applyMigrations(driver, folder);
    const byteOrderMark = String.fromCharCode(0xfeff);
    await writeFile(
      path.join(folder, '0001_teams.sql'),
      byteOrderMark + 'create table teams (id integer);\r\n',
    );

    const run = await applyMigrations(driver, folder);
    expect(run).toEqual({ ok: true, value: { ...none, alreadyApplied: ['0001_teams.sql'] } });
  });

  it('refuses to run when an applied file is missing or renamed', async () => {
    const driver = await freshDatabase();
    const folder = await folderWith(steps);
    await applyMigrations(driver, folder);

    const renamed = await folderWith({
      '0001_teams.sql': steps['0001_teams.sql'],
      '0002_names.sql': steps['0002_team_names.sql'],
      '0003_players.sql': steps['0003_players.sql'],
    });
    const run = await applyMigrations(driver, renamed);
    expect(!run.ok && run.error.code).toBe('applied_file_missing');
    expect(!run.ok && run.error.message).toContain('now 0002_names.sql');

    const gone = await applyMigrations(driver, await folderWith({}));
    expect(!gone.ok && gone.error.code).toBe('applied_file_missing');
  });

  it('accepts a database that is ahead of the folder, as after a release is reversed', async () => {
    const driver = await freshDatabase();
    await applyMigrations(driver, await folderWith(steps));

    const older = await folderWith({ '0001_teams.sql': steps['0001_teams.sql'] });
    const run = await applyMigrations(driver, older);
    expect(run).toEqual({
      ok: true,
      value: {
        applied: [],
        alreadyApplied: ['0001_teams.sql'],
        newerInDatabase: ['0002_team_names.sql', '0003_players.sql'],
      },
    });
  });

  it('rolls a failing file back whole and records nothing for it', async () => {
    const driver = await freshDatabase();
    const folder = await folderWith({
      '0001_teams.sql': steps['0001_teams.sql'],
      '0002_broken.sql':
        'create table seasons (id integer);\nalter table nowhere add column x int;\n',
      '0003_players.sql': steps['0003_players.sql'],
    });

    const run = await applyMigrations(driver, folder);
    expect(run.ok).toBe(false);
    if (run.ok) return;
    expect(run.error.code).toBe('migration_failed');
    expect(run.error.file).toBe('0002_broken.sql');
    expect(run.error.message).toContain('rolled back');
    expect(run.applied).toEqual(['0001_teams.sql']);
    expect(await tableExists(driver, 'seasons')).toBe(false);
    expect(await tableExists(driver, 'players')).toBe(false);
    expect((await logRows(driver)).map((r) => r.name)).toEqual(['0001_teams.sql']);
  });

  it('records the checksum of the normalised text', async () => {
    const driver = await freshDatabase();
    const text = 'create table teams (id integer);\r\n';
    const folder = await folderWith({ '0001_teams.sql': text });
    await applyMigrations(driver, folder);
    expect((await logRows(driver))[0]?.checksum).toBe(migrationChecksum(text));
  });

  it('sets lock_timeout and statement_timeout inside each migration only', async () => {
    const driver = await freshDatabase();
    const check = [
      'do $$ begin',
      "  if current_setting('lock_timeout') <> '1234ms' then",
      "    raise exception 'lock_timeout is %', current_setting('lock_timeout'); end if;",
      "  if current_setting('statement_timeout') <> '5678ms' then",
      "    raise exception 'statement_timeout is %', current_setting('statement_timeout'); end if;",
      'end $$;',
    ].join('\n');
    const run = await runMigrations(driver, [migration(1, '0001_limits.sql', check)], {
      lockTimeoutMs: 1234,
      statementTimeoutMs: 5678,
    });
    expect(run.ok).toBe(true);
    const after = await driver.query<{ lock: string; statement: string }>(
      "select current_setting('lock_timeout') as lock, current_setting('statement_timeout') as statement",
    );
    expect(after.rows[0]).toEqual({ lock: '0', statement: '0' });
  });

  it('rejects options that are not positive whole numbers', async () => {
    const driver = await freshDatabase();
    for (const options of [{ lockWaitMs: 0 }, { lockPollMs: -1 }, { statementTimeoutMs: 1.5 }]) {
      const run = await runMigrations(driver, [], options);
      expect(!run.ok && run.error.code).toBe('invalid_options');
    }
  });
});

describe('one run at a time', () => {
  it('waits for another run holding the lock, then applies', async () => {
    const real = await freshDatabase();
    let tries = 0;
    const driver = intercept(real, /pg_try_advisory_lock/, async () => [{ locked: ++tries > 3 }]);

    const run = await applyMigrations(driver, await folderWith(steps), {
      lockWaitMs: 120_000,
      lockPollMs: 5,
    });
    expect(tries).toBe(4);
    expect(run.ok && run.value.applied).toEqual(Object.keys(steps));
  });

  it('gives up after the bounded wait and applies nothing', async () => {
    const real = await freshDatabase();
    let tries = 0;
    const driver = intercept(real, /pg_try_advisory_lock/, async () => {
      tries++;
      return [{ locked: false }];
    });

    const run = await applyMigrations(driver, await folderWith(steps), {
      lockWaitMs: 60,
      lockPollMs: 10,
    });
    // Tried again every 10 ms for 60 ms, then stopped: a few tries, not forever.
    expect(tries).toBeGreaterThan(1);
    expect(tries).toBeLessThanOrEqual(8);
    expect(!run.ok && run.error.code).toBe('lock_timeout');
    expect(await tableExists(real, 'teams')).toBe(false);
  });

  it('two runs started together apply each file exactly once', async () => {
    const driver = await freshDatabase();
    const folder = await folderWith(steps);

    const [a, b] = await Promise.all([
      applyMigrations(driver, folder),
      applyMigrations(driver, folder),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect([...a.value.applied, ...b.value.applied].sort()).toEqual(Object.keys(steps));
    for (const run of [a, b]) {
      expect([...run.value.applied, ...run.value.alreadyApplied].sort()).toEqual(
        Object.keys(steps),
      );
    }
    expect((await logRows(driver)).map((r) => r.name)).toEqual(Object.keys(steps));
  });
});

describe('database failures come back as errors, not exceptions', () => {
  const boom = async (): Promise<unknown[]> => {
    throw new Error('connection reset');
  };

  it('when the lock cannot be taken', async () => {
    const driver = intercept(await freshDatabase(), /pg_try_advisory_lock/, boom);
    const run = await applyMigrations(driver, await folderWith(steps));
    expect(!run.ok && run.error).toMatchObject({ code: 'lock_failed' });
  });

  it('when the log cannot be created', async () => {
    const real = await freshDatabase();
    const driver: MigrationDriver = {
      ...real,
      transaction: () => Promise.reject(new Error('permission denied for database')),
    };
    const run = await applyMigrations(driver, await folderWith(steps));
    expect(!run.ok && run.error).toMatchObject({ code: 'bootstrap_failed' });
    expect(!run.ok && run.error.message).toContain('permission denied');
  });

  it('when the log cannot be read', async () => {
    const driver = intercept(await freshDatabase(), /order by version/, boom);
    const run = await applyMigrations(driver, await folderWith(steps));
    expect(!run.ok && run.error).toMatchObject({ code: 'log_unreadable' });
  });
});
