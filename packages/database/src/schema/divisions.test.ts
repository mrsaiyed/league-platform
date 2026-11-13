// T3 §4 and §12: a division belongs to a season of its league, sits under a parent
// in the same season if it has one, and is never its own ancestor.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asApp,
  freshSchema,
  newDivision,
  newLeague,
  newSeason,
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

/** A league with one season, ready for divisions. */
async function season() {
  const league = await newLeague(db);
  const seasonId = await newSeason(db, league.leagueId, league.defaultProgramId);
  return { ...league, seasonId };
}

const setParent = (division: string, parent: string | null) =>
  db.query('update divisions set parent_division_id = $1 where id = $2', [parent, division]);

describe('divisions', () => {
  it("cannot point at another league's season (T-40)", async () => {
    const a = await season();
    const b = await season();
    await newDivision(db, a.leagueId, a.seasonId);
    await expect(newDivision(db, a.leagueId, b.seasonId)).rejects.toMatchObject({
      ...refused.foreignKey,
      constraint: 'divisions_season',
    });
  });

  it('sit under a parent in the same season of the same league only (U-12)', async () => {
    const a = await season();
    const parent = await newDivision(db, a.leagueId, a.seasonId);
    await newDivision(db, a.leagueId, a.seasonId, { parentId: parent });

    const nextSeason = await newSeason(db, a.leagueId, a.defaultProgramId);
    await expect(
      newDivision(db, a.leagueId, nextSeason, { parentId: parent }),
    ).rejects.toMatchObject({ ...refused.foreignKey, constraint: 'divisions_parent' });

    const b = await season();
    const theirs = await newDivision(db, b.leagueId, b.seasonId);
    await expect(
      newDivision(db, a.leagueId, a.seasonId, { parentId: theirs }),
    ).rejects.toMatchObject({ ...refused.foreignKey, constraint: 'divisions_parent' });
  });

  it('are never their own parent', async () => {
    const { leagueId, seasonId } = await season();
    const division = await newDivision(db, leagueId, seasonId);
    await expect(setParent(division, division)).rejects.toMatchObject({
      ...refused.check,
      constraint: 'divisions_not_own_parent',
    });
  });

  it('are never their own ancestor, however far up', async () => {
    const { leagueId, seasonId } = await season();
    const top = await newDivision(db, leagueId, seasonId);
    const middle = await newDivision(db, leagueId, seasonId, { parentId: top });
    const bottom = await newDivision(db, leagueId, seasonId, { parentId: middle });
    for (const under of [middle, bottom]) {
      await expect(setParent(top, under)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'divisions_no_parent_loop',
      });
    }
    // Moving a branch elsewhere in the tree, or to the top, is fine.
    const other = await newDivision(db, leagueId, seasonId);
    await setParent(middle, other);
    await setParent(top, bottom);
    await setParent(middle, null);
  });

  it("refuse a loop just the same as the app's fenced role (T-60)", async () => {
    const { leagueId, seasonId } = await season();
    const top = await newDivision(db, leagueId, seasonId);
    const below = await newDivision(db, leagueId, seasonId, { parentId: top });
    await expect(
      asApp(db, { league: leagueId }, (tx) =>
        tx.query('update divisions set parent_division_id = $1 where id = $2', [below, top]),
      ),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'divisions_no_parent_loop' });
  });

  it('have names unique among their siblings, whatever the capitals, while not in the bin', async () => {
    const { leagueId, seasonId, defaultProgramId } = await season();
    const east = await newDivision(db, leagueId, seasonId, { name: 'East' });
    const west = await newDivision(db, leagueId, seasonId, { name: 'West' });
    await expect(newDivision(db, leagueId, seasonId, { name: ' east ' })).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'divisions_name_key',
    });

    // The same name under two parents, or in another season, is fine.
    await newDivision(db, leagueId, seasonId, { name: 'North', parentId: east });
    await newDivision(db, leagueId, seasonId, { name: 'North', parentId: west });
    await expect(
      newDivision(db, leagueId, seasonId, { name: 'NORTH', parentId: east }),
    ).rejects.toMatchObject({ ...refused.unique, constraint: 'divisions_name_key' });
    const spring = await newSeason(db, leagueId, defaultProgramId);
    await newDivision(db, leagueId, spring, { name: 'East' });

    // A division in the bin lets its name go.
    await db.query('update divisions set deleted_at = now() where id = $1', [east]);
    await newDivision(db, leagueId, seasonId, { name: 'East' });
  });

  it('have a name of 1 to 120 characters', async () => {
    const { leagueId, seasonId } = await season();
    await newDivision(db, leagueId, seasonId, { name: 'x'.repeat(120) });
    for (const name of ['', '   ', 'x'.repeat(121)]) {
      await expect(newDivision(db, leagueId, seasonId, { name })).rejects.toMatchObject({
        ...refused.check,
        constraint: 'divisions_name_length',
      });
    }
  });

  it('have a lower-case #rrggbb color, or none (T5 §1)', async () => {
    const { leagueId, seasonId } = await season();
    const division = await newDivision(db, leagueId, seasonId);
    const paint = (color: string | null) =>
      db.query('update divisions set color = $1 where id = $2', [color, division]);
    await paint('#c8a84b');
    await paint(null);
    for (const color of ['#C8A84B', 'red', '#abc', '#c8a84b00', 'c8a84b', '']) {
      await expect(paint(color)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'divisions_color_format',
      });
    }
  });

  it('are sorted by a number from 0 to 100000', async () => {
    const { leagueId, seasonId } = await season();
    const division = await newDivision(db, leagueId, seasonId);
    const sort = (n: number) =>
      db.query('update divisions set sort = $1 where id = $2', [n, division]);
    await sort(0);
    await sort(100000);
    for (const n of [-1, 100001]) {
      await expect(sort(n)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'divisions_sort_range',
      });
    }
  });

  it('never move to another season', async () => {
    const { leagueId, seasonId, defaultProgramId } = await season();
    const division = await newDivision(db, leagueId, seasonId, { name: unique('Moving') });
    const other = await newSeason(db, leagueId, defaultProgramId);
    await expect(
      db.query('update divisions set season_id = $1 where id = $2', [other, division]),
    ).rejects.toMatchObject(refused.restrict);
  });
});
