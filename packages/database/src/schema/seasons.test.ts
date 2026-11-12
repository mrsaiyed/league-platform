// T3 §4 and §12: seasons belong to a program in the same league, and only one
// season per program is current.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshSchema, newLeague, newProgram, newSeason, refused } from './schema.test-helper.ts';

let db: PGlite;
beforeAll(async () => {
  db = await freshSchema();
});
afterAll(async () => {
  await db.close();
});

describe('seasons', () => {
  it("cannot point at another league's program (T-40)", async () => {
    const a = await newLeague(db);
    const b = await newLeague(db);
    await newSeason(db, a.leagueId, a.defaultProgramId);
    await expect(newSeason(db, a.leagueId, b.defaultProgramId)).rejects.toMatchObject({
      ...refused.foreignKey,
      constraint: 'seasons_program',
    });
  });

  it('allow one current season per program (T3 §12)', async () => {
    const { leagueId, defaultProgramId } = await newLeague(db);
    const fall = await newSeason(db, leagueId, defaultProgramId, { isCurrent: true });
    await newSeason(db, leagueId, defaultProgramId);
    await expect(
      newSeason(db, leagueId, defaultProgramId, { isCurrent: true }),
    ).rejects.toMatchObject({ ...refused.unique, constraint: 'seasons_one_current' });

    // Another program in the same league has its own current season.
    const other = await newProgram(db, leagueId);
    await newSeason(db, leagueId, other, { isCurrent: true });

    // Moving "current" to a new season works once the old one lets go.
    const spring = await newSeason(db, leagueId, defaultProgramId);
    await expect(
      db.query('update seasons set is_current = true where id = $1', [spring]),
    ).rejects.toMatchObject({ ...refused.unique, constraint: 'seasons_one_current' });
    await db.transaction(async (tx) => {
      await tx.query('update seasons set is_current = false where id = $1', [fall]);
      await tx.query('update seasons set is_current = true where id = $1', [spring]);
    });
  });

  it('cannot be current and in the bin', async () => {
    const { leagueId, defaultProgramId } = await newLeague(db);
    const season = await newSeason(db, leagueId, defaultProgramId, { isCurrent: true });
    await expect(
      db.query('update seasons set deleted_at = now() where id = $1', [season]),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'seasons_current_not_deleted' });
  });

  it('end on or after the day they start', async () => {
    const { leagueId, defaultProgramId } = await newLeague(db);
    const season = await newSeason(db, leagueId, defaultProgramId);
    await db.query(
      "update seasons set starts_on = '2027-01-10', ends_on = '2027-01-10' where id = $1",
      [season],
    );
    await expect(
      db.query("update seasons set ends_on = '2027-01-09' where id = $1", [season]),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'seasons_dates_in_order' });
  });

  it('are draft, active or completed', async () => {
    const { leagueId, defaultProgramId } = await newLeague(db);
    const season = await newSeason(db, leagueId, defaultProgramId);
    for (const status of ['active', 'completed', 'draft']) {
      await db.query('update seasons set status = $1 where id = $2', [status, season]);
    }
    await expect(
      db.query("update seasons set status = 'paused' where id = $1", [season]),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'seasons_status' });
  });

  it('have short names unique in their program while not in the bin', async () => {
    const { leagueId, defaultProgramId } = await newLeague(db);
    const other = await newProgram(db, leagueId);
    const first = await newSeason(db, leagueId, defaultProgramId, { slug: 'fall-2027' });
    await newSeason(db, leagueId, other, { slug: 'fall-2027' });
    await expect(
      newSeason(db, leagueId, defaultProgramId, { slug: 'fall-2027' }),
    ).rejects.toMatchObject({ ...refused.unique, constraint: 'seasons_slug_key' });
    await db.query('update seasons set deleted_at = now() where id = $1', [first]);
    await newSeason(db, leagueId, defaultProgramId, { slug: 'fall-2027' });
  });
});
