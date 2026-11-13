// T3 §1 (T-40 to T-46): the conventions every table follows, checked on each
// table, and the helpers in 0002_conventions.sql that carry them out.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  freshSchema,
  newAccount,
  newLeague,
  newProgram,
  one,
  refused,
} from './schema.test-helper.ts';

let db: PGlite;
beforeAll(async () => {
  db = await freshSchema();
});
afterAll(async () => {
  await db.close();
});

// Tables without a league_id: those that belong to a person, not a league (T-62:
// accounts, profiles, profile_access), and leagues itself, whose own id is the
// league id. Every other table is a league table.
const personTables = ['accounts', 'profiles', 'profile_access', 'leagues'];
// History: only ever added to (T-45), so no version.
const historyTables = ['activity_log', 'command_receipts', 'support_access_log'];
// History that is never changed at all, so no updated_at either.
const neverChanged = ['activity_log', 'command_receipts'];

type Column = {
  table_name: string;
  column_name: string;
  data_type: string;
  default: string | null;
};

async function columns(): Promise<Column[]> {
  const { rows } = await db.query<Column>(
    `select table_name, column_name, data_type, column_default as default
     from information_schema.columns where table_schema = 'public'`,
  );
  return rows;
}

async function tables(): Promise<string[]> {
  const { rows } = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
  );
  return rows.map((r) => r.table_name);
}

describe('every table', () => {
  it('is one of the tables of steps 1.6, 1.19 (jobs) and 2.1 (divisions to settings)', async () => {
    expect(await tables()).toEqual(
      [
        'accounts',
        'activity_log',
        'command_receipts',
        'courts',
        'divisions',
        'invitations',
        'jobs',
        'league_features',
        'league_slug_history',
        'leagues',
        'profile_access',
        'profiles',
        'programs',
        'role_grants',
        'seasons',
        'setting_values',
        'support_access_log',
        'venues',
      ].sort(),
    );
  });

  it('has a version 7 UUID id, created_at, and times only in UTC (T-41, T-42)', async () => {
    const all = await columns();
    for (const table of await tables()) {
      const id = all.find((c) => c.table_name === table && c.column_name === 'id');
      expect(id, table).toMatchObject({ data_type: 'uuid', default: 'uuid_v7()' });
      const created = all.find((c) => c.table_name === table && c.column_name === 'created_at');
      expect(created?.data_type, table).toBe('timestamp with time zone');
    }
    const localTimes = all.filter((c) => c.data_type === 'timestamp without time zone');
    expect(localTimes).toEqual([]);
  });

  it('has updated_at and, if editable, a version moved by the update trigger (T-46)', async () => {
    const all = await columns();
    const { rows: triggers } = await db.query<{ table_name: string }>(
      `select c.relname as table_name from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_proc p on p.oid = t.tgfoid
       where p.proname = 'on_row_update'`,
    );
    for (const table of await tables()) {
      const has = (name: string) =>
        all.some((c) => c.table_name === table && c.column_name === name);
      expect(has('updated_at'), `${table}.updated_at`).toBe(!neverChanged.includes(table));
      const editable = !historyTables.includes(table);
      expect(has('version'), `${table}.version`).toBe(editable);
      expect(
        triggers.some((t) => t.table_name === table),
        `${table} on_row_update trigger`,
      ).toBe(editable);
    }
  });

  it('holds league data with a league_id, and links league tables through it (T-40)', async () => {
    const all = await columns();
    for (const table of await tables()) {
      if (personTables.includes(table)) continue;
      expect(
        all.some((c) => c.table_name === table && c.column_name === 'league_id'),
        `${table}.league_id`,
      ).toBe(true);
    }

    // Every foreign key from a league table to another league table includes
    // league_id on both sides; a link to leagues is league_id itself.
    const { rows: links } = await db.query<{
      name: string;
      from_table: string;
      to_table: string;
      from_columns: string[];
      to_columns: string[];
    }>(
      `select con.conname as name, src.relname as from_table, dst.relname as to_table,
         array(select a.attname::text from unnest(con.conkey) k
               join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k) as from_columns,
         array(select a.attname::text from unnest(con.confkey) k
               join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k) as to_columns
       from pg_constraint con
       join pg_class src on src.oid = con.conrelid
       join pg_class dst on dst.oid = con.confrelid
       join pg_namespace n on n.oid = src.relnamespace
       where con.contype = 'f' and n.nspname = 'public'`,
    );
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      if (link.to_table === 'leagues') {
        expect(link.from_columns, link.name).toEqual(['league_id']);
      } else if (!personTables.includes(link.to_table)) {
        expect(link.from_columns, link.name).toContain('league_id');
        expect(link.to_columns, link.name).toContain('league_id');
      }
    }
  });
});

describe('uuid_v7', () => {
  const parse = (id: string) => {
    const hex = id.replaceAll('-', '');
    return {
      version: hex[12],
      variant: Number.parseInt(hex.charAt(16), 16) >> 2,
      millis: Number.parseInt(hex.slice(0, 12), 16),
    };
  };

  it('makes version 7 UUIDs stamped with the current time', async () => {
    const before = Date.now();
    const { id } = await one<{ id: string }>(db, 'select public.uuid_v7()::text as id');
    const after = Date.now();
    const parts = parse(id);
    expect(parts.version).toBe('7');
    expect(parts.variant).toBe(0b10);
    expect(parts.millis).toBeGreaterThanOrEqual(before - 5);
    expect(parts.millis).toBeLessThanOrEqual(after + 5);
  });

  it('sorts in the order the ids were made', async () => {
    const ids: string[] = [];
    for (let k = 0; k < 20; k++) {
      ids.push((await one<{ id: string }>(db, 'select public.uuid_v7()::text as id')).id);
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect([...ids].sort()).toEqual(ids);
    // PostgreSQL's own ordering of uuid values agrees.
    const { rows } = await db.query<{ id: string }>(
      'select id::text from unnest($1::uuid[]) as id order by id',
      [ids],
    );
    expect(rows.map((r) => r.id)).toEqual(ids);
  });

  it('never repeats', async () => {
    const { count } = await one<{ count: number }>(
      db,
      'select count(distinct public.uuid_v7())::int as count from generate_series(1, 5000)',
    );
    expect(count).toBe(5000);
  });

  it('is the id of every new row', async () => {
    const id = await newAccount(db);
    expect(parse(id).version).toBe('7');
  });
});

describe('on_row_update', () => {
  it('adds one to version and stamps updated_at on every change', async () => {
    const id = await newAccount(db);
    const before = await one<{ version: number; created_at: Date; updated_at: Date }>(
      db,
      'select version, created_at, updated_at from accounts where id = $1',
      [id],
    );
    expect(before.version).toBe(1);

    await db.query("update accounts set display_name = 'Renamed' where id = $1", [id]);
    await db.query("update accounts set display_name = 'Again' where id = $1", [id]);
    const after = await one<{ version: number; created_at: Date; updated_at: Date }>(
      db,
      'select version, created_at, updated_at from accounts where id = $1',
      [id],
    );
    expect(after.version).toBe(3);
    expect(after.created_at).toEqual(before.created_at);
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
  });

  it('moves version itself, whatever the caller sets', async () => {
    const id = await newAccount(db);
    await db.query('update accounts set version = 99 where id = $1', [id]);
    const row = await one<{ version: number }>(db, 'select version from accounts where id = $1', [
      id,
    ]);
    expect(row.version).toBe(2);
  });

  it('lets a save that names a stale version change nothing (T-46, A-8)', async () => {
    const id = await newAccount(db);
    await db.query("update accounts set display_name = 'First' where id = $1 and version = 1", [
      id,
    ]);
    const stale = await db.query(
      "update accounts set display_name = 'Second' where id = $1 and version = 1",
      [id],
    );
    expect(stale.affectedRows).toBe(0);
  });

  it('refuses to change an id, a creation time, or the league a row belongs to', async () => {
    const a = await newLeague(db);
    const b = await newLeague(db);
    const programId = await newProgram(db, a.leagueId);
    await expect(
      db.query('update programs set league_id = $1 where id = $2', [b.leagueId, programId]),
    ).rejects.toMatchObject(refused.restrict);
    await expect(
      db.query('update programs set id = public.uuid_v7() where id = $1', [programId]),
    ).rejects.toMatchObject(refused.restrict);
    await expect(
      db.query("update programs set created_at = now() - interval '1 day' where id = $1", [
        programId,
      ]),
    ).rejects.toMatchObject(refused.restrict);
  });
});

describe('JSON documents (T-44, T-50)', () => {
  it('must be objects that name their format version', async () => {
    const { leagueId } = await newLeague(db);
    for (const wording of ['{}', '[]', '{"version": 0}', '{"version": "1"}', '{"version": 1.5}']) {
      await expect(
        db.query('update leagues set wording = $1::jsonb where id = $2', [wording, leagueId]),
      ).rejects.toMatchObject({ ...refused.check, constraint: 'leagues_wording_document' });
    }
    await db.query(`update leagues set wording = '{"version": 2, "team": "squad"}' where id = $1`, [
      leagueId,
    ]);
  });
});
