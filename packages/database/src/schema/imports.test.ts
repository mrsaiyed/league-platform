// T3 §11, T-80: an import's kind, status, report and what it created, and times
// that fit its status, so undo can remove exactly what it brought in.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asApp,
  freshSchema,
  newLeague,
  newSeason,
  one,
  refused,
  type MadeLeague,
} from './schema.test-helper.ts';

let db: PGlite;
let league: MadeLeague;
let seasonId: string;
beforeAll(async () => {
  db = await freshSchema();
  league = await newLeague(db);
  seasonId = await newSeason(db, league.leagueId, league.defaultProgramId);
});
afterAll(async () => {
  await db.close();
});

const refusedBy = (constraint: string, kind: { code: string } = refused.check) => ({
  ...kind,
  constraint,
});

const start = (columns: Record<string, unknown> = {}) => {
  const all: Record<string, unknown> = {
    league_id: league.leagueId,
    season_id: seasonId,
    kind: 'fixtures',
    account_id: league.ownerId,
    file_name: 'fixtures.csv',
    ...columns,
  };
  const names = Object.keys(all);
  return db.query<{ id: string }>(
    `insert into imports (${names.join(', ')})
     values (${names.map((_, k) => `$${k + 1}`).join(', ')}) returning id`,
    Object.values(all),
  );
};

describe('imports (T3 §11)', () => {
  it('are fixtures, people or teams, and start being read', async () => {
    await expect(start({ kind: 'photos' })).rejects.toMatchObject(refusedBy('imports_kind'));
    await expect(start({ status: 'done' })).rejects.toMatchObject(refusedBy('imports_status'));
    for (const kind of ['fixtures', 'people', 'teams']) {
      const { rows } = await start({ kind, season_id: kind === 'people' ? null : seasonId });
      const made = await one<{ status: string }>(db, 'select status from imports where id = $1', [
        rows[0]?.id,
      ]);
      expect(made.status).toBe('reading');
    }
  });

  it('go from read to applied to undone, with the times that fit', async () => {
    const { rows } = await start();
    const id = rows[0]?.id;
    const set = (sql: string) => db.query(`update imports set ${sql} where id = $1`, [id]);
    await set(`status = 'ready', report = '{"version": 1, "rows": 12, "problems": []}'`);
    await expect(set(`status = 'applied'`)).rejects.toMatchObject(
      refusedBy('imports_applied_when'),
    );
    await set(
      `status = 'applied', applied_at = now(), created = '{"version": 1, "games": ["g1", "g2"]}'`,
    );
    await expect(set(`status = 'undone'`)).rejects.toMatchObject(refusedBy('imports_undone_when'));
    await expect(
      set(`status = 'undone', undone_at = applied_at - interval '1 minute'`),
    ).rejects.toMatchObject(refusedBy('imports_undone_after_applied'));
    await set(`status = 'undone', undone_at = now()`);
    await expect(start({ status: 'failed', applied_at: new Date() })).rejects.toMatchObject(
      refusedBy('imports_applied_when'),
    );
  });

  it('keep the report and what was created as versioned documents, and never the file', async () => {
    for (const column of ['report', 'created'] as const) {
      await expect(start({ [column]: '{"rows": 1}' })).rejects.toMatchObject(
        refusedBy(`imports_${column}_document`),
      );
    }
    await expect(
      start({ report: JSON.stringify({ version: 1, pad: 'x'.repeat(1_048_600) }) }),
    ).rejects.toMatchObject(refusedBy('imports_report_size'));
    for (const name of ['', '  ', 'x'.repeat(256)]) {
      await expect(start({ file_name: name })).rejects.toMatchObject(
        refusedBy('imports_file_name_length'),
      );
    }
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'imports' and data_type = 'bytea'`,
    );
    expect(rows).toEqual([]);
  });

  it('name a season of their own league, and keep their kind and who started them', async () => {
    const other = await newLeague(db);
    const theirSeason = await newSeason(db, other.leagueId, other.defaultProgramId);
    await expect(start({ season_id: theirSeason })).rejects.toMatchObject(
      refusedBy('imports_season', refused.foreignKey),
    );
    const { rows } = await start();
    for (const [column, value] of [
      ['kind', 'people'],
      ['season_id', null],
      ['account_id', other.ownerId],
    ] as const) {
      await expect(
        db.query(`update imports set ${column} = $2 where id = $1`, [rows[0]?.id, value]),
      ).rejects.toMatchObject(refused.restrict);
    }
  });

  it('stay as the record: the app cannot remove one', async () => {
    const { rows } = await start();
    await expect(
      asApp(db, { league: league.leagueId }, (tx) =>
        tx.query('delete from imports where id = $1', [rows[0]?.id]),
      ),
    ).rejects.toMatchObject(refused.privilege);
  });
});
