// Migration 0020 (step 2.187, record 073): a league's site and its published releases
// (T3 §10). What the database itself promises, whoever writes: the fence on both tables,
// a release that is history, its number once in its league, a site that points only at
// its own league's release, the documents' shape; and the draft-league removal and the
// bin's purge taking a site with them. The design's values are checked in code (core's
// command, the read): leagues-commands.test.ts and the web app's database-league-sites.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { loadMigrations, pgliteDriver, runMigrations } from '../migrations/index.ts';
import { findPublishedDesign } from '../queries/index.ts';
import {
  asApp,
  freshSchema,
  newAccount,
  newLeague,
  one,
  refused,
  type Sql,
} from './schema.test-helper.ts';

let db: PGlite;
beforeAll(async () => {
  db = await freshSchema();
});
afterAll(async () => {
  await db.close();
});

const migrationText = () => {
  const folder = fileURLToPath(new URL('../../../../supabase/migrations/', import.meta.url));
  const file = readdirSync(folder).find((name) => name.startsWith('0020_'));
  if (file === undefined) throw new Error('migration 0020 is missing');
  return readFileSync(path.join(folder, file), 'utf8');
};

const design = JSON.stringify({ version: 1, base: 'light', colors: { primary: '#1f5fbf' } });

/** Writes release `number` of a league, as the tables' owner: its id. */
async function release(sql: Sql, leagueId: string, number: number, by: string) {
  return (
    await one<{ id: string }>(
      sql,
      `insert into site_releases (league_id, number, starting_design, design, published_by_account_id)
       values ($1, $2, 'crest', $3::jsonb, $4) returning id`,
      [leagueId, number, design, by],
    )
  ).id;
}

/** The league's site pointing at a release. */
async function site(sql: Sql, leagueId: string, releaseId: string | null) {
  return (
    await one<{ id: string }>(
      sql,
      `insert into sites (league_id, starting_design, design_draft, published_release_id)
       values ($1, 'crest', $2::jsonb, $3) returning id`,
      [leagueId, design, releaseId],
    )
  ).id;
}

describe('site releases (0020)', () => {
  it('are numbered from 1, each number once in its league; another league has its own', async () => {
    const a = await newLeague(db);
    const b = await newLeague(db);
    await release(db, a.leagueId, 1, a.ownerId);
    await release(db, a.leagueId, 2, a.ownerId);
    await release(db, b.leagueId, 1, b.ownerId);
    await expect(release(db, a.leagueId, 2, a.ownerId)).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'site_releases_number_key',
    });
    await expect(release(db, a.leagueId, 0, a.ownerId)).rejects.toMatchObject({
      ...refused.check,
      constraint: 'site_releases_number_positive',
    });
  });

  it('are history: never changed or removed, by the app or by the tables’ owner', async () => {
    const league = await newLeague(db);
    const id = await release(db, league.leagueId, 1, league.ownerId);
    await expect(
      db.query(`update site_releases set starting_design = 'crest-light' where id = $1`, [id]),
    ).rejects.toMatchObject(refused.restrict);
    await expect(db.query('delete from site_releases where id = $1', [id])).rejects.toMatchObject(
      refused.restrict,
    );
    for (const change of [
      `update site_releases set number = 9 where id = $1`,
      'delete from site_releases where id = $1',
    ]) {
      await expect(
        asApp(db, { league: league.leagueId }, (tx) => tx.query(change, [id])),
      ).rejects.toMatchObject(refused.privilege);
    }
  });

  it('hold documents that name their format version, within a size, and a starting design’s key', async () => {
    const league = await newLeague(db);
    // Each document column given `value`, the others a sound one.
    const insert = (column: string, value: string, number: number) => {
      const documents = {
        design,
        menu: '{"version": 1}',
        pages: '{"version": 1}',
        [column]: value,
      };
      return db.query(
        `insert into site_releases (league_id, number, starting_design, published_by_account_id, design, menu, pages)
         values ($1, $2, 'crest', $3, $4::jsonb, $5::jsonb, $6::jsonb)`,
        [
          league.leagueId,
          number,
          league.ownerId,
          documents.design,
          documents.menu,
          documents.pages,
        ],
      );
    };
    let number = 10;
    for (const column of ['design', 'menu', 'pages']) {
      for (const bad of ['{}', '[]', '"crest"', '{"version": "1"}']) {
        await expect(insert(column, bad, number++)).rejects.toMatchObject({
          ...refused.check,
          constraint: `site_releases_${column}_document`,
        });
      }
    }
    await expect(
      insert('design', JSON.stringify({ version: 1, text: 'x'.repeat(9000) }), number++),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'site_releases_design_size' });
    for (const key of ['Crest', 'crest; drop', '', 'a'.repeat(41), '</style>']) {
      await expect(
        db.query(
          `insert into site_releases (league_id, number, starting_design, design, published_by_account_id)
           values ($1, $2, $3, $4::jsonb, $5)`,
          [league.leagueId, number++, key, design, league.ownerId],
        ),
      ).rejects.toMatchObject({
        ...refused.check,
        constraint: 'site_releases_starting_design_format',
      });
    }
    // An empty menu and pages until the design editor fills them.
    const id = await release(db, league.leagueId, 1, league.ownerId);
    expect(await one(db, 'select menu, pages from site_releases where id = $1', [id])).toEqual({
      menu: { version: 1 },
      pages: { version: 1 },
    });
  });
});

describe('a league’s site (0020)', () => {
  it('is one per league, and points only at a release of its own league', async () => {
    const a = await newLeague(db);
    const b = await newLeague(db);
    const ofA = await release(db, a.leagueId, 1, a.ownerId);
    const ofB = await release(db, b.leagueId, 1, b.ownerId);
    await expect(site(db, a.leagueId, ofB)).rejects.toMatchObject({
      ...refused.foreignKey,
      constraint: 'sites_published_release',
    });
    const id = await site(db, a.leagueId, ofA);
    await expect(site(db, a.leagueId, ofA)).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'sites_one_per_league',
    });
    // Editable: each change moves its version (T-46).
    expect(
      await one(
        db,
        `update sites set design_draft = '{"version": 1}' where id = $1 returning version`,
        [id],
      ),
    ).toEqual({ version: 2 });
    await expect(
      db.query(`update sites set menu_draft = '[]' where id = $1`, [id]),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'sites_menu_draft_document' });
  });
});

describe('the fence on both tables (T-61)', () => {
  it("lets a league's transaction read and write its own rows only", async () => {
    const a = await newLeague(db);
    const b = await newLeague(db);
    const ofB = await release(db, b.leagueId, 1, b.ownerId);
    await site(db, b.leagueId, ofB);
    const seen = (tx: Transaction, table: string) =>
      one<{ n: number }>(tx, `select count(*)::int as n from ${table}`);
    await asApp(db, { league: a.leagueId }, async (tx) => {
      expect(await seen(tx, 'site_releases')).toEqual({ n: 0 });
      expect(await seen(tx, 'sites')).toEqual({ n: 0 });
      // Its own league's rows, as a publish writes them.
      const own = await release(tx, a.leagueId, 1, a.ownerId);
      await site(tx, a.leagueId, own);
      expect(await seen(tx, 'site_releases')).toEqual({ n: 1 });
      expect(
        await one(tx, 'update sites set starting_design = $1 returning version', ['crest-light']),
      ).toEqual({ version: 2 });
    });
    // Written as the app, set to A, a row of B is refused by the policy.
    await expect(
      asApp(db, { league: a.leagueId }, (tx) => release(tx, b.leagueId, 3, b.ownerId)),
    ).rejects.toMatchObject(refused.policy);
    await expect(
      asApp(db, { league: a.leagueId }, (tx) =>
        tx.query(`update sites set starting_design = 'crest' where league_id = $1`, [b.leagueId]),
      ),
    ).resolves.toMatchObject({ affectedRows: 0 });
    await expect(asApp(db, {}, (tx) => seen(tx, 'site_releases'))).resolves.toEqual({ n: 0 });
  });
});

/** A league as the internal tool now leaves it: its log rows, its season, and its first release. */
async function makerShaped(withSite: boolean, on: PGlite = db) {
  const league = await newLeague(on);
  const staff = await newAccount(on);
  const season = await one<{ id: string }>(
    on,
    `insert into seasons (league_id, program_id, slug, name) values ($1, $2, 'fall', 'Fall')
     returning id`,
    [league.leagueId, league.defaultProgramId],
  );
  await on.query('update seasons set is_current = true where id = $1', [season.id]);
  for (const action of ['leagues.create', 'leagues.create_season']) {
    await on.query(
      `insert into activity_log (league_id, actor_account_id, action, summary)
       values ($1, $2, $3, $4)`,
      [league.leagueId, staff, action, `activity.${action}`],
    );
  }
  const releaseId = withSite ? await release(on, league.leagueId, 1, staff) : null;
  if (releaseId !== null) await site(on, league.leagueId, releaseId);
  const row = await one<{ slug: string; version: number; created_at: string }>(
    on,
    'select slug, version, created_at::text as created_at from leagues where id = $1',
    [league.leagueId],
  );
  return { ...league, staff, releaseId, ...row };
}

const problemsOf = async (leagueId: string) =>
  (
    await one<{ problems: string[] }>(db, 'select public.league_removal_problems($1) as problems', [
      leagueId,
    ])
  ).problems;

describe('removing a draft league with its first release (0020 over 0017)', () => {
  it('counts both tables in league_rows', async () => {
    const league = await makerShaped(true);
    const { rows } = await db.query<{ table_name: string; row_count: number }>(
      `select table_name, row_count::int as row_count from public.league_rows($1)
       where table_name in ('public.sites', 'public.site_releases') order by 1`,
      [league.leagueId],
    );
    expect(rows).toEqual([
      { table_name: 'public.site_releases', row_count: 1 },
      { table_name: 'public.sites', row_count: 1 },
    ]);
  });

  it('passes the site the tool makes, and the league with none, and removes the site with it', async () => {
    const bare = await makerShaped(false);
    expect(await problemsOf(bare.leagueId)).toEqual([]);
    const league = await makerShaped(true);
    expect(await problemsOf(league.leagueId)).toEqual([]);
    const outcome = await db.transaction(async (tx) => {
      await tx.query(
        "select set_config('app.league_id', $1, true), set_config('app.account_id', $2, true)",
        [league.leagueId, league.staff],
      );
      return one<{ outcome: string }>(
        tx,
        'select outcome from public.remove_draft_league($1, $2, $3, $4, $5::timestamptz, null)',
        [league.leagueId, league.slug, league.staff, league.version, league.created_at],
      );
    });
    expect(outcome).toEqual({ outcome: 'removed' });
    expect(
      await one(db, 'select coalesce(sum(row_count), 0)::int as n from public.league_rows($1)', [
        league.leagueId,
      ]),
    ).toEqual({ n: 0 });
    // The history rule is back: no other release can be removed now.
    const kept = await makerShaped(true);
    await expect(
      db.query('delete from site_releases where league_id = $1', [kept.leagueId]),
    ).rejects.toMatchObject(refused.restrict);
  });

  it('refuses a second release, a release by someone else, a changed draft, or a site without one', async () => {
    const second = await makerShaped(true);
    await db.query('update sites set published_release_id = null where league_id = $1', [
      second.leagueId,
    ]);
    const two = await release(db, second.leagueId, 2, second.staff);
    await db.query('update sites set published_release_id = $2 where league_id = $1', [
      second.leagueId,
      two,
    ]);
    expect(await problemsOf(second.leagueId)).toEqual(['site-changed']);

    const byOwner = await makerShaped(false);
    await site(db, byOwner.leagueId, await release(db, byOwner.leagueId, 1, byOwner.ownerId));
    expect(await problemsOf(byOwner.leagueId)).toEqual(['site-changed']);

    const changed = await makerShaped(true);
    await db.query(`update sites set starting_design = 'crest-light' where league_id = $1`, [
      changed.leagueId,
    ]);
    expect(await problemsOf(changed.leagueId)).toEqual(['site-changed']);

    const noRelease = await makerShaped(false);
    await site(db, noRelease.leagueId, null);
    expect(await problemsOf(noRelease.leagueId)).toEqual(['site-changed']);

    const noSite = await makerShaped(false);
    await release(db, noSite.leagueId, 1, noSite.staff);
    expect(await problemsOf(noSite.leagueId)).toEqual(['site-changed']);
  });
});

describe('the purge of a league 30 days in the bin (0020 over 0010)', () => {
  it('removes its site and releases with its history, and no other league’s', async () => {
    const binned = await newLeague(db);
    const kept = await newLeague(db);
    for (const league of [binned, kept]) {
      await site(db, league.leagueId, await release(db, league.leagueId, 1, league.ownerId));
    }
    await db.query(`update leagues set deleted_at = now() - interval '31 days' where id = $1`, [
      binned.leagueId,
    ]);
    await db.query('select public.purge_league_history($1)', [binned.leagueId]);
    const count = (table: string, leagueId: string) =>
      one<{ n: number }>(db, `select count(*)::int as n from ${table} where league_id = $1`, [
        leagueId,
      ]);
    expect(await count('site_releases', binned.leagueId)).toEqual({ n: 0 });
    expect(await count('sites', binned.leagueId)).toEqual({ n: 0 });
    expect(await count('site_releases', kept.leagueId)).toEqual({ n: 1 });
    expect(await count('sites', kept.leagueId)).toEqual({ n: 1 });
  });
});

describe('migration 0020 runs twice', () => {
  it('applies again over itself without error, and keeps what was there', async () => {
    const league = await newLeague(db);
    await site(db, league.leagueId, await release(db, league.leagueId, 1, league.ownerId));
    await db.exec(migrationText());
    await db.exec(migrationText());
    expect(
      await one(db, 'select count(*)::int as n from site_releases where league_id = $1', [
        league.leagueId,
      ]),
    ).toEqual({ n: 1 });
    const policies = await db.query<{ tablename: string }>(
      `select tablename from pg_policies where tablename in ('sites', 'site_releases') order by 1`,
    );
    expect(policies.rows.map((r) => r.tablename)).toEqual(['site_releases', 'sites']);
    expect(await problemsOf((await makerShaped(true)).leagueId)).toEqual([]);
  });

  it('writes again the comment of each function it replaces, so none describes 0017’s rules', async () => {
    const comments = await db.query<{ name: string; comment: string | null }>(
      `select p.proname as name, obj_description(p.oid, 'pg_proc') as comment
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('league_rows', 'league_removal_problems', 'remove_draft_league',
                           'purge_league_history')
       order by 1`,
    );
    expect(comments.rows.map((r) => r.name)).toEqual([
      'league_removal_problems',
      'league_rows',
      'purge_league_history',
      'remove_draft_league',
    ]);
    for (const row of comments.rows) expect(row.comment, row.name).toContain('0020');
    expect(comments.rows[0]?.comment).toContain('site-changed');
  });
});

describe('a league made before 0020', () => {
  it('has no site rows after it, is drawn in the neutral design, and can still be removed', async () => {
    const loaded = await loadMigrations();
    if (!loaded.ok) throw new Error(loaded.error.message);
    const at = loaded.value.findIndex((m) => m.name.startsWith('0020_'));
    expect(at).toBeGreaterThan(0);
    const older = new PGlite();
    try {
      // Up to 0019, a league exactly as the tool then made it; then 0020 over it.
      const before = await runMigrations(pgliteDriver(older), loaded.value.slice(0, at));
      if (!before.ok) throw new Error(before.error.message);
      const league = await makerShaped(false, older);
      const after = await runMigrations(pgliteDriver(older), loaded.value);
      if (!after.ok) throw new Error(after.error.message);
      for (const table of ['sites', 'site_releases']) {
        expect(
          await one(older, `select count(*)::int as n from ${table} where league_id = $1`, [
            league.leagueId,
          ]),
        ).toEqual({ n: 0 });
      }
      // No release: what the public read finds is nothing, so its pages are drawn in the
      // neutral design (apps/web/src/server/league-site.ts).
      const handle = createDatabase({ kind: 'pglite', pglite: older });
      try {
        expect(
          await withTransaction(handle, { leagueId: league.leagueId }, findPublishedDesign),
        ).toBeUndefined();
      } finally {
        await handle.close();
      }
      const problems = await one<{ problems: string[] }>(
        older,
        'select public.league_removal_problems($1) as problems',
        [league.leagueId],
      );
      expect(problems).toEqual({ problems: [] });
      const outcome = await older.transaction(async (tx) => {
        await tx.query(
          "select set_config('app.league_id', $1, true), set_config('app.account_id', $2, true)",
          [league.leagueId, league.staff],
        );
        return one<{ outcome: string }>(
          tx,
          'select outcome from public.remove_draft_league($1, $2, $3, $4, $5::timestamptz, null)',
          [league.leagueId, league.slug, league.staff, league.version, league.created_at],
        );
      });
      expect(outcome).toEqual({ outcome: 'removed' });
      expect(
        await one(older, 'select count(*)::int as n from leagues where id = $1', [league.leagueId]),
      ).toEqual({ n: 0 });
    } finally {
      await older.close();
    }
  });
});
