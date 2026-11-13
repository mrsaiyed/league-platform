// T3 §7: a team belongs to one season of its league, in a division of that season if
// it has one, with a short name and a name unique in the season (while not in the
// bin), who sees its players' numbers (S-22), and a lineage across seasons.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  freshSchema,
  newDivision,
  newLeague,
  newSeason,
  newTeam,
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

/** A league with one season, ready for teams. */
async function season() {
  const league = await newLeague(db);
  const seasonId = await newSeason(db, league.leagueId, league.defaultProgramId);
  return { ...league, seasonId };
}

const set = (team: string, column: string, value: unknown) =>
  db.query(`update teams set ${column} = $1 where id = $2`, [value, team]);

describe('teams', () => {
  it("cannot point at another league's season (T-40)", async () => {
    const a = await season();
    const b = await season();
    await expect(newTeam(db, a.leagueId, b.seasonId)).rejects.toMatchObject({
      ...refused.foreignKey,
      constraint: 'teams_season',
    });
  });

  it('sit in a division of their own season, or in none', async () => {
    const a = await season();
    const east = await newDivision(db, a.leagueId, a.seasonId);
    await newTeam(db, a.leagueId, a.seasonId, { divisionId: east });
    await newTeam(db, a.leagueId, a.seasonId);

    const nextSeason = await newSeason(db, a.leagueId, a.defaultProgramId);
    await expect(newTeam(db, a.leagueId, nextSeason, { divisionId: east })).rejects.toMatchObject({
      ...refused.foreignKey,
      constraint: 'teams_division',
    });

    const b = await season();
    const theirs = await newDivision(db, b.leagueId, b.seasonId);
    await expect(newTeam(db, a.leagueId, a.seasonId, { divisionId: theirs })).rejects.toMatchObject(
      { ...refused.foreignKey, constraint: 'teams_division' },
    );
  });

  it('have a short name unique in their season while not in the bin', async () => {
    const { leagueId, seasonId, defaultProgramId } = await season();
    const lions = await newTeam(db, leagueId, seasonId, { slug: 'lions' });
    await expect(newTeam(db, leagueId, seasonId, { slug: 'lions' })).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'teams_slug_key',
    });
    await newTeam(db, leagueId, await newSeason(db, leagueId, defaultProgramId), {
      slug: 'lions',
    });
    await set(lions, 'deleted_at', new Date());
    await newTeam(db, leagueId, seasonId, { slug: 'lions' });
  });

  it('have a short name of lowercase letters, numbers and single hyphens', async () => {
    const { leagueId, seasonId } = await season();
    await newTeam(db, leagueId, seasonId, { slug: 'north-stars-2' });
    for (const slug of ['', 'Lions', 'two--hyphens', '-edge', 'with space', 'x'.repeat(61)]) {
      await expect(newTeam(db, leagueId, seasonId, { slug })).rejects.toMatchObject({
        ...refused.check,
        constraint: 'teams_slug_format',
      });
    }
  });

  it('have a name of 1 to 120 characters, unique in the season whatever the capitals', async () => {
    const { leagueId, seasonId } = await season();
    const lions = await newTeam(db, leagueId, seasonId, { name: 'Lions' });
    await expect(newTeam(db, leagueId, seasonId, { name: ' LIONS ' })).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'teams_name_key',
    });
    await set(lions, 'deleted_at', new Date());
    await newTeam(db, leagueId, seasonId, { name: 'Lions' });
    for (const name of ['', '   ', 'x'.repeat(121)]) {
      await expect(newTeam(db, leagueId, seasonId, { name })).rejects.toMatchObject({
        ...refused.check,
        constraint: 'teams_name_length',
      });
    }
  });

  it('have a lower-case #rrggbb color, or none (T5 §1)', async () => {
    const { leagueId, seasonId } = await season();
    const team = await newTeam(db, leagueId, seasonId);
    await set(team, 'color', '#1a2b3c');
    await set(team, 'color', null);
    for (const color of ['#1A2B3C', 'blue', '#abc', '']) {
      await expect(set(team, 'color', color)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'teams_color_format',
      });
    }
  });

  it("say who sees their players' numbers: one of S-22's four levels, always chosen", async () => {
    const { leagueId, seasonId } = await season();
    const team = await newTeam(db, leagueId, seasonId);
    for (const level of ['everyone', 'members', 'team', 'staff']) {
      await set(team, 'stats_visibility', level);
    }
    for (const level of ['nobody', 'Staff', '']) {
      await expect(set(team, 'stats_visibility', level)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'teams_stats_visibility',
      });
    }
    // No starting level in the database: the league's setting chooses (step 2.14).
    await expect(
      db.query(`insert into teams (league_id, season_id, slug, name) values ($1, $2, 'x', 'X')`, [
        leagueId,
        seasonId,
      ]),
    ).rejects.toMatchObject(refused.notNull);
  });

  it('get their own lineage, shared by at most one team in a season', async () => {
    const { leagueId, seasonId, defaultProgramId } = await season();
    const first = await newTeam(db, leagueId, seasonId);
    const second = await newTeam(db, leagueId, seasonId);
    const lineages = await db.query<{ lineage_id: string }>(
      'select lineage_id from teams where id = any($1::uuid[])',
      [[first, second]],
    );
    expect(new Set(lineages.rows.map((r) => r.lineage_id)).size).toBe(2);

    const { lineage_id: lineageId } = await one<{ lineage_id: string }>(
      db,
      'select lineage_id from teams where id = $1',
      [first],
    );
    // Carried over to the next season: the same lineage.
    await newTeam(db, leagueId, await newSeason(db, leagueId, defaultProgramId), { lineageId });
    await expect(newTeam(db, leagueId, seasonId, { lineageId })).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'teams_one_per_lineage',
    });
  });

  it('free their lineage slot in a season when they go to the bin', async () => {
    const { leagueId, seasonId } = await season();
    const binned = await newTeam(db, leagueId, seasonId);
    const { lineage_id: lineageId } = await one<{ lineage_id: string }>(
      db,
      'select lineage_id from teams where id = $1',
      [binned],
    );
    await expect(newTeam(db, leagueId, seasonId, { lineageId })).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'teams_one_per_lineage',
    });
    await set(binned, 'deleted_at', new Date().toISOString());
    await newTeam(db, leagueId, seasonId, { lineageId });
  });

  it('never move to another season', async () => {
    const { leagueId, seasonId, defaultProgramId } = await season();
    const team = await newTeam(db, leagueId, seasonId);
    const other = await newSeason(db, leagueId, defaultProgramId);
    await expect(set(team, 'season_id', other)).rejects.toMatchObject(refused.restrict);
  });
});
