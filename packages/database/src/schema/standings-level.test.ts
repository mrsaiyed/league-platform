// Step 2.198 (migration 0022; S-74, T3 §9): a standings row keeps how the teams level with
// it were ordered, as a versioned document of at most 256 KiB, only on a row whose place a
// tiebreaker decided; app_user writes it in its own league only, and a row saved before
// 0022 keeps it empty, never guessed.
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadMigrations, pgliteDriver, runMigrations } from '../migrations/index.ts';
import {
  asApp,
  freshSchema,
  newLeague,
  newSeason,
  newTeam,
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

/** A league with a season and one team in it. */
async function made(on: PGlite) {
  const league = await newLeague(on);
  const seasonId = await newSeason(on, league.leagueId, league.defaultProgramId);
  const teamId = await newTeam(on, league.leagueId, seasonId);
  return { ...league, seasonId, teamId };
}

type Made = Awaited<ReturnType<typeof made>>;

const document = (teamId: string) => ({
  version: 1,
  teamIds: [teamId, 'another'],
  steps: [
    {
      tiebreaker: 'head-to-head',
      applied: true,
      teams: [
        { teamId, place: 1, value: null, record: { wins: 1, losses: 0, ties: 0 } },
        { teamId: 'another', place: 2, value: null, record: { wins: 0, losses: 1, ties: 0 } },
      ],
    },
  ],
});

const insert = (sql: Sql, m: Made, columns: Record<string, unknown>) => {
  const all: Record<string, unknown> = {
    league_id: m.leagueId,
    season_id: m.seasonId,
    team_id: m.teamId,
    rank: 1,
    seed: 1,
    ...columns,
  };
  const names = Object.keys(all);
  return sql.query(
    `insert into standings_rows (${names.join(', ')})
     values (${names.map((_, k) => `$${k + 1}`).join(', ')})`,
    Object.values(all),
  );
};

const levelOf = async (sql: Sql, m: Made) =>
  (
    await one<{ level: unknown }>(sql, 'select level from standings_rows where team_id = $1', [
      m.teamId,
    ])
  ).level;

const refusedBy = (constraint: string) => ({ ...refused.check, constraint });

describe('how level teams were ordered, on a standings row (step 2.198)', () => {
  it('is empty, or a versioned document on a row a tiebreaker placed', async () => {
    const empty = await made(db);
    await insert(db, empty, {});
    expect(await levelOf(db, empty)).toBeNull();
    const kept = await made(db);
    await insert(db, kept, {
      decided_by: 'head-to-head',
      level: JSON.stringify(document(kept.teamId)),
    });
    expect(await levelOf(db, kept)).toEqual(document(kept.teamId));
  });

  it('refuses what is not a versioned document, one too big, and one on a row its record placed', async () => {
    for (const level of ['[]', '"head-to-head"', '{"teamIds": []}', '{"version": 0}']) {
      await expect(
        insert(db, await made(db), { decided_by: 'still-tied', level }),
      ).rejects.toMatchObject(refusedBy('standings_rows_level_document'));
    }
    const big = JSON.stringify({ version: 1, padding: 'x'.repeat(262144) });
    await expect(
      insert(db, await made(db), { decided_by: 'still-tied', level: big }),
    ).rejects.toMatchObject(refusedBy('standings_rows_level_size'));
    const m = await made(db);
    await expect(
      insert(db, m, { decided_by: null, level: JSON.stringify(document(m.teamId)) }),
    ).rejects.toMatchObject(refusedBy('standings_rows_level_needs_reason'));
  });

  it('is written by the app in its own league only (T-61)', async () => {
    const mine = await made(db);
    const theirs = await made(db);
    await insert(db, mine, { decided_by: 'head-to-head' });
    await insert(db, theirs, { decided_by: 'head-to-head' });
    const changed = await asApp(db, { league: mine.leagueId, account: mine.ownerId }, (tx) =>
      tx.query(
        `update standings_rows set level = $1 where team_id = any($2::uuid[]) returning team_id`,
        [JSON.stringify(document(mine.teamId)), [mine.teamId, theirs.teamId]],
      ),
    );
    expect(changed.rows).toEqual([{ team_id: mine.teamId }]);
    expect(await levelOf(db, mine)).toEqual(document(mine.teamId));
    expect(await levelOf(db, theirs)).toBeNull();
    // Nor read in another league.
    const seen = await asApp(db, { league: mine.leagueId, account: mine.ownerId }, (tx) =>
      tx.query('select level from standings_rows where team_id = $1', [theirs.teamId]),
    );
    expect(seen.rows).toEqual([]);
  });
});

describe('a standings row saved before 0022', () => {
  it('has no document after it, until the season is worked out again', async () => {
    const loaded = await loadMigrations();
    if (!loaded.ok) throw new Error(loaded.error.message);
    const at = loaded.value.findIndex((m) => m.name.startsWith('0022_'));
    expect(at).toBeGreaterThan(0);
    const older = new PGlite();
    try {
      const before = await runMigrations(pgliteDriver(older), loaded.value.slice(0, at));
      if (!before.ok) throw new Error(before.error.message);
      const m = await made(older);
      await insert(older, m, { decided_by: 'point-difference' });
      const after = await runMigrations(pgliteDriver(older), loaded.value);
      if (!after.ok) throw new Error(after.error.message);
      expect(await levelOf(older, m)).toBeNull();
      const row = await one<{ decided_by: string }>(
        older,
        'select decided_by from standings_rows where team_id = $1',
        [m.teamId],
      );
      expect(row.decided_by).toBe('point-difference');
    } finally {
      await older.close();
    }
  });
});
