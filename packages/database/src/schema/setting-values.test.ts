// T5 §6 and record 019: a setting value is set once per key at one place (the
// league, a program or a season of the same league), holds a small versioned
// document, and never moves to another key or place.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  freshSchema,
  newLeague,
  newProgram,
  newSeason,
  one,
  refused,
  type MadeLeague,
} from './schema.test-helper.ts';

let db: PGlite;
beforeAll(async () => {
  db = await freshSchema();
});
afterAll(async () => {
  await db.close();
});

type Place = { level: string; programId?: string | null; seasonId?: string | null };

const value = (v: unknown, version = 1) => JSON.stringify({ version, value: v });

async function setValue(
  leagueId: string,
  place: Place,
  key = 'notifications.reminderLeadHours',
  document = value(24),
) {
  return (
    await one<{ id: string }>(
      db,
      `insert into setting_values (league_id, level, program_id, season_id, key, value)
       values ($1, $2, $3, $4, $5, $6::jsonb) returning id`,
      [leagueId, place.level, place.programId ?? null, place.seasonId ?? null, key, document],
    )
  ).id;
}

/** A league with a second program and a season in it. */
async function league(): Promise<MadeLeague & { programId: string; seasonId: string }> {
  const made = await newLeague(db);
  const programId = await newProgram(db, made.leagueId);
  const seasonId = await newSeason(db, made.leagueId, programId);
  return { ...made, programId, seasonId };
}

describe('setting values', () => {
  it('name exactly the place their level says', async () => {
    const { leagueId, programId, seasonId } = await league();
    await setValue(leagueId, { level: 'league' });
    await setValue(leagueId, { level: 'program', programId });
    await setValue(leagueId, { level: 'season', seasonId });
    for (const place of [
      { level: 'league', programId },
      { level: 'league', seasonId },
      { level: 'program' },
      { level: 'program', programId, seasonId },
      { level: 'season' },
      { level: 'season', programId, seasonId },
    ]) {
      await expect(setValue(leagueId, place, 'other.key')).rejects.toMatchObject({
        ...refused.check,
        constraint: 'setting_values_place',
      });
    }
    await expect(setValue(leagueId, { level: 'team' }, 'other.key')).rejects.toMatchObject({
      ...refused.check,
      constraint: 'setting_values_level',
    });
  });

  it("cannot point at another league's program or season (T-40)", async () => {
    const a = await league();
    const b = await league();
    await expect(
      setValue(a.leagueId, { level: 'program', programId: b.programId }),
    ).rejects.toMatchObject({ ...refused.foreignKey, constraint: 'setting_values_program' });
    await expect(
      setValue(a.leagueId, { level: 'season', seasonId: b.seasonId }),
    ).rejects.toMatchObject({ ...refused.foreignKey, constraint: 'setting_values_season' });
  });

  it('are set once per key at each place', async () => {
    const { leagueId, programId, seasonId, defaultProgramId } = await league();
    const key = 'standings.startingStatsLevel';
    await setValue(leagueId, { level: 'league' }, key);
    await setValue(leagueId, { level: 'program', programId }, key);
    await setValue(leagueId, { level: 'program', programId: defaultProgramId }, key);
    await setValue(leagueId, { level: 'season', seasonId }, key);
    await setValue(
      leagueId,
      { level: 'season', seasonId: await newSeason(db, leagueId, programId) },
      key,
    );
    for (const place of [
      { level: 'league' },
      { level: 'program', programId },
      { level: 'season', seasonId },
    ]) {
      await expect(setValue(leagueId, place, key)).rejects.toMatchObject({
        ...refused.unique,
        constraint: 'setting_values_once',
      });
    }
    // Another league has its own values for the same key.
    await setValue((await league()).leagueId, { level: 'league' }, key);
  });

  it('have a dotted camelCase key of up to 100 characters', async () => {
    const { leagueId } = await league();
    for (const key of ['members.startPage', 'a.b.c2', `a.${'b'.repeat(98)}`]) {
      await setValue(leagueId, { level: 'league' }, key);
    }
    for (const key of [
      'reminders',
      'Notifications.leadHours',
      'notifications.lead-hours',
      'notifications.lead_hours',
      'notifications.',
      '.leadHours',
      `a.${'b'.repeat(99)}`,
    ]) {
      await expect(setValue(leagueId, { level: 'league' }, key)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'setting_values_key_format',
      });
    }
  });

  it('hold {"version": n, "value": ...} with a value that is not null (T-50)', async () => {
    const { leagueId } = await league();
    let n = 0;
    const set = (document: string) =>
      setValue(leagueId, { level: 'league' }, `test.setting${++n}`, document);
    for (const good of [
      value(24),
      value('schedule'),
      value(false),
      value(['wins', 'headToHead']),
      value({ minutes: 10 }, 3),
    ]) {
      await set(good);
    }
    for (const bad of [
      '24',
      '{"value": 24}',
      '{"version": 1}',
      '{"version": 1, "value": null}',
      '{"version": 0, "value": 24}',
      '{"version": 1, "value": 24, "note": "extra"}',
      '[1]',
      '"text"',
      'null',
    ]) {
      await expect(set(bad)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'setting_values_value_document',
      });
    }
    await expect(set(value('x'.repeat(8200)))).rejects.toMatchObject({
      ...refused.check,
      constraint: 'setting_values_value_size',
    });
  });

  it('never move to another key, level or place; a new value moves the version (T-46)', async () => {
    const { leagueId, programId, seasonId } = await league();
    const id = await setValue(leagueId, { level: 'season', seasonId });
    const other = await newSeason(db, leagueId, programId);
    for (const [sql, params] of [
      ["update setting_values set key = 'other.key' where id = $1", [id]],
      [
        "update setting_values set level = 'program', season_id = null, program_id = $2 where id = $1",
        [id, programId],
      ],
      ['update setting_values set season_id = $2 where id = $1', [id, other]],
    ] as const) {
      await expect(db.query(sql, [...params])).rejects.toMatchObject(refused.restrict);
    }
    await db.query('update setting_values set value = $2::jsonb where id = $1', [id, value(48)]);
    expect(await one(db, 'select version, value from setting_values where id = $1', [id])).toEqual({
      version: 2,
      value: { version: 1, value: 48 },
    });
    // Clearing a value removes its row; the lookup then falls back a level.
    expect((await db.query('delete from setting_values where id = $1', [id])).affectedRows).toBe(1);
  });
});
