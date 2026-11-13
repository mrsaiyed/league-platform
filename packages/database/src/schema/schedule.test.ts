// T3 §8: a season's rounds and stage, its one schedule draft and its numbered
// schedule revisions (A-6, A-8, A-9), and the scorekeepers assigned to its games.
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asApp,
  freshSchema,
  newAccount,
  newGame,
  newLeague,
  newRound,
  newSeason,
  newStage,
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

async function season() {
  const league = await newLeague(db);
  const seasonId = await newSeason(db, league.leagueId, league.defaultProgramId);
  return { ...league, seasonId };
}

const update = (table: string, id: string, column: string, value: unknown) =>
  db.query(`update ${table} set ${column} = $1 where id = $2`, [value, id]);

describe('rounds', () => {
  it('belong to a season of their league (T-40)', async () => {
    const a = await season();
    const b = await season();
    await expect(newRound(db, a.leagueId, b.seasonId, 1)).rejects.toMatchObject({
      ...refused.foreignKey,
      constraint: 'rounds_season',
    });
  });

  it('are numbered 1 to 1000, each number once in a season', async () => {
    const { leagueId, seasonId, defaultProgramId } = await season();
    await newRound(db, leagueId, seasonId, 1);
    await newRound(db, leagueId, seasonId, 1000);
    await expect(newRound(db, leagueId, seasonId, 1)).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'rounds_number_key',
    });
    await newRound(db, leagueId, await newSeason(db, leagueId, defaultProgramId), 1);
    for (const number of [0, -3, 1001]) {
      await expect(newRound(db, leagueId, seasonId, number)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'rounds_number_range',
      });
    }
  });

  it('have an optional label of 1 to 120 characters and an optional date', async () => {
    const { leagueId, seasonId } = await season();
    const round = await newRound(db, leagueId, seasonId, 5);
    await update('rounds', round, 'label', 'Week 5 — Rivalry Week');
    await update('rounds', round, 'label', null);
    for (const label of ['', '  ', 'x'.repeat(121)]) {
      await expect(update('rounds', round, 'label', label)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'rounds_label_length',
      });
    }
    await update('rounds', round, 'date', '2026-12-06');
    await expect(update('rounds', round, 'date', '1899-12-31')).rejects.toMatchObject({
      ...refused.check,
      constraint: 'rounds_date_plausible',
    });
  });

  it('stay in their season, and stay while a game names them', async () => {
    const { leagueId, seasonId, defaultProgramId } = await season();
    const round = await newRound(db, leagueId, seasonId, 1);
    await expect(
      update('rounds', round, 'season_id', await newSeason(db, leagueId, defaultProgramId)),
    ).rejects.toMatchObject(refused.restrict);
    const stageId = await newStage(db, leagueId, seasonId);
    await newGame(db, {
      leagueId,
      seasonId,
      stageId,
      homeTeamId: await newTeam(db, leagueId, seasonId),
      awayTeamId: await newTeam(db, leagueId, seasonId),
      columns: { round_id: round, deleted_at: new Date().toISOString() },
    });
    await expect(db.query('delete from rounds where id = $1', [round])).rejects.toMatchObject({
      ...refused.foreignKey,
      constraint: 'games_round',
    });
    const empty = await newRound(db, leagueId, seasonId, 2);
    await db.query('delete from rounds where id = $1', [empty]);
  });
});

describe('stages', () => {
  it('are one regular season per season for now, in a season of their league', async () => {
    const a = await season();
    const b = await season();
    await newStage(db, a.leagueId, a.seasonId);
    await expect(newStage(db, a.leagueId, a.seasonId, 'Second')).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'stages_one_regular',
    });
    await expect(newStage(db, a.leagueId, b.seasonId)).rejects.toMatchObject({
      ...refused.foreignKey,
      constraint: 'stages_season',
    });
    await expect(
      db.query(
        `insert into stages (league_id, season_id, type, name) values ($1, $2, 'bracket', 'Playoffs')`,
        [b.leagueId, b.seasonId],
      ),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'stages_type' });
  });

  it('have a name of 1 to 120 characters and a small versioned config', async () => {
    const { leagueId, seasonId } = await season();
    const stage = await newStage(db, leagueId, seasonId);
    for (const name of ['', '   ', 'x'.repeat(121)]) {
      await expect(update('stages', stage, 'name', name)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'stages_name_length',
      });
    }
    await update('stages', stage, 'config', '{"version": 2, "games": 10}');
    for (const config of ['{}', '[]', '{"version": "1"}']) {
      await expect(update('stages', stage, 'config', config)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'stages_config_document',
      });
    }
    await expect(
      update('stages', stage, 'config', JSON.stringify({ version: 1, pad: 'x'.repeat(16400) })),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'stages_config_size' });
  });

  // Their type is fixed too, which a test can show once a second type exists.
  it('keep their season', async () => {
    const { leagueId, seasonId, defaultProgramId } = await season();
    const stage = await newStage(db, leagueId, seasonId);
    await expect(
      update('stages', stage, 'season_id', await newSeason(db, leagueId, defaultProgramId)),
    ).rejects.toMatchObject(refused.restrict);
  });
});

/** Writes revision `number` of a season. */
const revision = (sql: Sql, leagueId: string, seasonId: string, number: number) =>
  sql.query(
    `insert into schedule_revisions (league_id, season_id, number, summary)
     values ($1, $2, $3, '{"version": 1, "gamesAdded": 3}') returning id`,
    [leagueId, seasonId, number],
  );

describe('schedule revisions', () => {
  it('are numbered 1, 2, 3 ... in their season, each number once', async () => {
    const { leagueId, seasonId, defaultProgramId } = await season();
    const inOrder = { ...refused.check, constraint: 'schedule_revisions_in_order' };
    await expect(revision(db, leagueId, seasonId, 2)).rejects.toMatchObject(inOrder);
    await revision(db, leagueId, seasonId, 1);
    await expect(revision(db, leagueId, seasonId, 1)).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'schedule_revisions_number_key',
    });
    await revision(db, leagueId, seasonId, 2);
    await expect(revision(db, leagueId, seasonId, 4)).rejects.toMatchObject(inOrder);
    // Another season counts from 1 by itself.
    const next = await newSeason(db, leagueId, defaultProgramId);
    await expect(revision(db, leagueId, next, 3)).rejects.toMatchObject(inOrder);
    await revision(db, leagueId, next, 1);
    await expect(revision(db, leagueId, seasonId, 0)).rejects.toMatchObject({
      ...refused.check,
      constraint: 'schedule_revisions_number_positive',
    });
  });

  it('count from 1 in the same way at every isolation level (no lock to take)', async () => {
    const { leagueId, seasonId } = await season();
    for (const [number, level] of [
      [1, 'repeatable read'],
      [2, 'serializable'],
    ] as const) {
      await db.transaction(async (tx) => {
        await tx.exec(`set transaction isolation level ${level}`);
        await revision(tx, leagueId, seasonId, number);
      });
    }
  });

  it('belong to a season of their league, and say who published them', async () => {
    const a = await season();
    const b = await season();
    await expect(revision(db, a.leagueId, b.seasonId, 1)).rejects.toMatchObject({
      ...refused.foreignKey,
      constraint: 'schedule_revisions_season',
    });
    await db.query(
      `insert into schedule_revisions (league_id, season_id, number, published_by_account_id)
       values ($1, $2, 1, $3)`,
      [a.leagueId, a.seasonId, a.ownerId],
    );
  });

  it('have a small versioned summary', async () => {
    const { leagueId, seasonId } = await season();
    const write = (summary: string) =>
      db.query(
        `insert into schedule_revisions (league_id, season_id, number, summary) values ($1, $2, 1, $3)`,
        [leagueId, seasonId, summary],
      );
    for (const summary of ['{}', '[]', '{"version": 0}']) {
      await expect(write(summary)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'schedule_revisions_summary_document',
      });
    }
    await expect(
      write(JSON.stringify({ version: 1, pad: 'x'.repeat(65600) })),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'schedule_revisions_summary_size' });
  });

  it('are history: never changed or removed, even by the tables’ owner (T-45)', async () => {
    const { leagueId, seasonId } = await season();
    const { rows } = await revision(db, leagueId, seasonId, 1);
    const id = (rows[0] as { id: string }).id;
    await expect(
      update('schedule_revisions', id, 'summary', '{"version": 1}'),
    ).rejects.toMatchObject(refused.restrict);
    await expect(
      db.query('delete from schedule_revisions where id = $1', [id]),
    ).rejects.toMatchObject(refused.restrict);
    for (const sql of [
      `update schedule_revisions set summary = '{"version": 1}' where id = $1`,
      'delete from schedule_revisions where id = $1',
    ]) {
      await expect(
        asApp(db, { league: leagueId }, (tx) => tx.query(sql, [id])),
      ).rejects.toMatchObject(refused.privilege);
    }
  });
});

describe('schedule drafts', () => {
  const draft = (sql: Sql, leagueId: string, seasonId: string, basedOn: number | null = null) =>
    sql.query(
      `insert into schedule_drafts (league_id, season_id, based_on_revision) values ($1, $2, $3)
       returning id`,
      [leagueId, seasonId, basedOn],
    );

  it('are one per season, in a season of their league', async () => {
    const a = await season();
    const b = await season();
    await draft(db, a.leagueId, a.seasonId);
    await expect(draft(db, a.leagueId, a.seasonId)).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'schedule_drafts_one_per_season',
    });
    await expect(draft(db, a.leagueId, b.seasonId)).rejects.toMatchObject({
      ...refused.foreignKey,
      constraint: 'schedule_drafts_season',
    });
  });

  it('are based on a published revision of their own season, or on none yet', async () => {
    const { leagueId, seasonId, defaultProgramId } = await season();
    const other = await newSeason(db, leagueId, defaultProgramId);
    await revision(db, leagueId, other, 1);
    const basedOn = { ...refused.foreignKey, constraint: 'schedule_drafts_based_on' };
    await expect(draft(db, leagueId, seasonId, 1)).rejects.toMatchObject(basedOn);
    await revision(db, leagueId, seasonId, 1);
    const { rows } = await draft(db, leagueId, seasonId, 1);
    const id = (rows[0] as { id: string }).id;
    await expect(update('schedule_drafts', id, 'based_on_revision', 2)).rejects.toMatchObject(
      basedOn,
    );
    await revision(db, leagueId, seasonId, 2);
    await update('schedule_drafts', id, 'based_on_revision', 2);
  });

  it('hold their changes as a versioned document of at most a megabyte', async () => {
    const { leagueId, seasonId } = await season();
    const { rows } = await draft(db, leagueId, seasonId);
    const id = (rows[0] as { id: string }).id;
    const { changes } = await one<{ changes: unknown }>(
      db,
      'select changes from schedule_drafts where id = $1',
      [id],
    );
    expect(changes).toEqual({ version: 1, changes: [] });
    for (const doc of ['{}', '[]', '{"version": -1}']) {
      await expect(update('schedule_drafts', id, 'changes', doc)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'schedule_drafts_changes_document',
      });
    }
    await expect(
      update(
        'schedule_drafts',
        id,
        'changes',
        JSON.stringify({ version: 1, pad: 'x'.repeat(1048600) }),
      ),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'schedule_drafts_changes_size' });
  });

  it('stop two admins overwriting each other: a save from a stale version changes nothing (A-8)', async () => {
    const { leagueId, seasonId } = await season();
    const { rows } = await draft(db, leagueId, seasonId);
    const id = (rows[0] as { id: string }).id;
    const save = () =>
      db.query(
        `update schedule_drafts set changes = '{"version": 1, "changes": [1]}'
         where id = $1 and version = 1`,
        [id],
      );
    expect((await save()).affectedRows).toBe(1);
    expect((await save()).affectedRows).toBe(0);
  });
});

describe('game assignments', () => {
  async function game() {
    const s = await season();
    const stageId = await newStage(db, s.leagueId, s.seasonId);
    const gameId = await newGame(db, {
      leagueId: s.leagueId,
      seasonId: s.seasonId,
      stageId,
      homeTeamId: await newTeam(db, s.leagueId, s.seasonId),
      awayTeamId: await newTeam(db, s.leagueId, s.seasonId),
    });
    return { ...s, gameId };
  }
  const assign = (sql: Sql, leagueId: string, gameId: string, accountId: string) =>
    sql.query(
      'insert into game_assignments (league_id, game_id, account_id) values ($1, $2, $3) returning id',
      [leagueId, gameId, accountId],
    );

  it('assign a scorekeeper to a game of the same league once', async () => {
    const a = await game();
    const b = await game();
    const scorer = await newAccount(db);
    await assign(db, a.leagueId, a.gameId, scorer);
    await expect(assign(db, a.leagueId, a.gameId, scorer)).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'game_assignments_once',
    });
    await expect(assign(db, a.leagueId, b.gameId, scorer)).rejects.toMatchObject({
      ...refused.foreignKey,
      constraint: 'game_assignments_game',
    });
    await assign(db, b.leagueId, b.gameId, scorer);
  });

  it("are refused another league's game for the app's fenced role too (T-60)", async () => {
    const a = await game();
    const b = await game();
    const scorer = await newAccount(db);
    await expect(
      asApp(db, { league: a.leagueId }, (tx: Transaction) =>
        assign(tx, a.leagueId, b.gameId, scorer),
      ),
    ).rejects.toMatchObject({ ...refused.foreignKey, constraint: 'game_assignments_game' });
  });

  it('never move to another game or account: a different one is a new row', async () => {
    const a = await game();
    const { rows } = await assign(db, a.leagueId, a.gameId, await newAccount(db));
    const id = (rows[0] as { id: string }).id;
    await expect(
      update('game_assignments', id, 'account_id', await newAccount(db)),
    ).rejects.toMatchObject(refused.restrict);
    await db.query('delete from game_assignments where id = $1', [id]);
  });
});
