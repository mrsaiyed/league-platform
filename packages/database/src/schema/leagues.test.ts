// T3 §4 and §12: leagues, their short names and forwarding history, features, and
// the one default program.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  freshSchema,
  newAccount,
  newLeague,
  newProgram,
  one,
  refused,
  unique,
} from './schema.test-helper.ts';

let db: PGlite;
beforeAll(async () => {
  db = await freshSchema();
});
afterAll(async () => {
  await db.close();
});

const rename = (leagueId: string, slug: string) =>
  db.query('update leagues set slug = $1 where id = $2', [slug, leagueId]);

const forward = (leagueId: string, oldSlug: string, expiresAt = "now() + interval '12 months'") =>
  db.query(
    `insert into league_slug_history (league_id, old_slug, expires_at) values ($1, $2, ${expiresAt})`,
    [leagueId, oldSlug],
  );

/** A forwarding row that expired last year. */
const expiredForward = (leagueId: string, oldSlug: string) =>
  db.query(
    `insert into league_slug_history (league_id, old_slug, created_at, expires_at)
     values ($1, $2, now() - interval '2 years', now() - interval '1 year')`,
    [leagueId, oldSlug],
  );

describe('league short names (U-7)', () => {
  it('are 3 to 40 lowercase letters, numbers and hyphens', async () => {
    await newLeague(db, 'abc');
    await newLeague(db, 'x'.repeat(40));
    await newLeague(db, 'spring-league-2027');
    for (const slug of ['ab', 'x'.repeat(41), 'Upper', 'with space', 'under_score', 'dot.name']) {
      await expect(newLeague(db, slug)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'leagues_slug_format',
      });
    }
  });

  it('are unique across leagues, including leagues in the bin', async () => {
    const slug = unique('taken');
    const first = await newLeague(db, slug);
    await db.query('update leagues set deleted_at = now() where id = $1', [first.leagueId]);
    await expect(newLeague(db, slug)).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'leagues_slug_key',
    });
  });

  it('stay held while forwarding: no other league can take one (T3 §12)', async () => {
    const old = unique('old');
    const moved = await newLeague(db, old);
    await rename(moved.leagueId, unique('new'));
    await forward(moved.leagueId, old);

    await expect(newLeague(db, old)).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'leagues_slug_not_forwarding',
    });
    const other = await newLeague(db);
    await expect(rename(other.leagueId, old)).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'leagues_slug_not_forwarding',
    });
  });

  it('can be taken back by the league that is forwarding it', async () => {
    const old = unique('back');
    const league = await newLeague(db, old);
    await rename(league.leagueId, unique('away'));
    await forward(league.leagueId, old);
    await rename(league.leagueId, old);
  });

  it('are free for anyone once the forwarding has expired', async () => {
    const old = unique('expired');
    const league = await newLeague(db, old);
    await rename(league.leagueId, unique('later'));
    await expiredForward(league.leagueId, old);
    await newLeague(db, old);
  });

  it('cannot be recorded as forwarding when another league uses the name', async () => {
    const used = unique('in-use');
    await newLeague(db, used);
    const other = await newLeague(db);
    await expect(forward(other.leagueId, used)).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'league_slug_history_slug_free',
    });
    // An expired row is only history and blocks nothing, so it may be recorded.
    await expiredForward(other.leagueId, used);
  });

  it('forward to one league at a time', async () => {
    const old = unique('shared');
    const a = await newLeague(db);
    const b = await newLeague(db);
    await forward(a.leagueId, old);
    await expect(forward(b.leagueId, old)).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'league_slug_history_slug_free',
    });
  });

  it('cannot have a forwarding moved onto a name in use by updating it', async () => {
    const used = unique('used');
    await newLeague(db, used);
    const other = await newLeague(db);
    const old = unique('mine');
    await forward(other.leagueId, old);
    await expect(
      db.query('update league_slug_history set old_slug = $1 where old_slug = $2', [used, old]),
    ).rejects.toMatchObject({ ...refused.unique, constraint: 'league_slug_history_slug_free' });
  });

  it('forward for a time that ends after it starts', async () => {
    const { leagueId } = await newLeague(db);
    await expect(
      forward(leagueId, unique('past'), "now() - interval '1 day'"),
    ).rejects.toMatchObject({
      ...refused.check,
      constraint: 'league_slug_history_expires_after_created',
    });
  });
});

describe('leagues', () => {
  it('have the four states of U-9 and the three audiences', async () => {
    const { leagueId } = await newLeague(db);
    const state = await one<{ status: string }>(db, 'select status from leagues where id = $1', [
      leagueId,
    ]);
    expect(state.status).toBe('draft');
    for (const status of ['live', 'archived', 'suspended', 'draft']) {
      await db.query('update leagues set status = $1 where id = $2', [status, leagueId]);
    }
    await expect(
      db.query("update leagues set status = 'deleted' where id = $1", [leagueId]),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'leagues_status' });
    for (const audience of ['youth', 'mixed', 'adult']) {
      await db.query('update leagues set audience = $1 where id = $2', [audience, leagueId]);
    }
    await expect(
      db.query("update leagues set audience = 'seniors' where id = $1", [leagueId]),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'leagues_audience' });
  });

  it('have an owner account that exists', async () => {
    const ownerless = db.transaction(async (tx) => {
      await tx.query(
        `insert into leagues (slug, name, time_zone, audience, listed, owner_account_id)
         values ($1, 'No Owner', 'UTC', 'adult', true, '00000000-0000-7000-8000-000000000000')`,
        [unique('ownerless')],
      );
    });
    await expect(ownerless).rejects.toMatchObject(refused.foreignKey);
  });
});

describe('the default program (T3 §4)', () => {
  const leagueOnly = async (slug: string) => {
    const owner = await newAccount(db);
    return db.transaction(async (tx) => {
      await tx.query(
        `insert into leagues (slug, name, time_zone, audience, listed, owner_account_id)
         values ($1, 'Made-up League', 'UTC', 'youth', false, $2)`,
        [slug, owner],
      );
    });
  };

  it('is required: a league created without one is refused when the transaction ends', async () => {
    const slug = unique('alone');
    await expect(leagueOnly(slug)).rejects.toMatchObject({
      ...refused.check,
      constraint: 'leagues_have_default_program',
    });
    const { rows } = await db.query('select 1 from leagues where slug = $1', [slug]);
    expect(rows).toEqual([]);
  });

  it('is one only: a second default program is refused', async () => {
    const { leagueId } = await newLeague(db);
    await expect(
      db.query(
        `insert into programs (league_id, slug, name, sport_key, is_default)
         values ($1, 'second', 'Second', 'soccer', true)`,
        [leagueId],
      ),
    ).rejects.toMatchObject({ ...refused.unique, constraint: 'programs_one_default' });
  });

  it('can move to another program inside one transaction', async () => {
    const { leagueId, defaultProgramId } = await newLeague(db);
    const next = await newProgram(db, leagueId);
    await db.transaction(async (tx) => {
      await tx.query('update programs set is_default = false where id = $1', [defaultProgramId]);
      await tx.query('update programs set is_default = true where id = $1', [next]);
    });
    const row = await one<{ id: string }>(
      db,
      'select id from programs where league_id = $1 and is_default',
      [leagueId],
    );
    expect(row.id).toBe(next);
  });

  it('cannot be taken away without another taking its place', async () => {
    const { defaultProgramId } = await newLeague(db);
    await expect(
      db.query('update programs set is_default = false where id = $1', [defaultProgramId]),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'leagues_have_default_program' });
    await expect(
      db.query('delete from programs where id = $1', [defaultProgramId]),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'leagues_have_default_program' });
  });

  it('is never put in the bin', async () => {
    const { defaultProgramId } = await newLeague(db);
    await expect(
      db.query('update programs set deleted_at = now() where id = $1', [defaultProgramId]),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'programs_default_not_deleted' });
  });
});

describe('programs', () => {
  it('have short names unique in their league while not in the bin', async () => {
    const a = await newLeague(db);
    const b = await newLeague(db);
    const first = await newProgram(db, a.leagueId, 'volleyball');
    await newProgram(db, b.leagueId, 'volleyball');
    await expect(newProgram(db, a.leagueId, 'volleyball')).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'programs_slug_key',
    });
    await db.query('update programs set deleted_at = now() where id = $1', [first]);
    await newProgram(db, a.leagueId, 'volleyball');
  });

  it('belong to a league that exists', async () => {
    await expect(newProgram(db, '00000000-0000-7000-8000-000000000000')).rejects.toMatchObject(
      refused.foreignKey,
    );
  });
});

describe('league_features', () => {
  it('have each feature once per league', async () => {
    const { leagueId } = await newLeague(db);
    const add = () =>
      db.query("insert into league_features (league_id, feature_key) values ($1, 'drafts')", [
        leagueId,
      ]);
    await add();
    await expect(add()).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'league_features_once',
    });
    const other = await newLeague(db);
    await db.query("insert into league_features (league_id, feature_key) values ($1, 'drafts')", [
      other.leagueId,
    ]);
  });
});
