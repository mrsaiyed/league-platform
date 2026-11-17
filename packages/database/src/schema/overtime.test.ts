// Step 2.200 (migration 0021; P7 §5.6, the numbers audit's M8): how many overtime periods a
// final game had is kept with its result. Only a final game has a count, from 0 to 18; a
// decided game's count changes only with a correction (S-7); and a game final before 0021
// keeps an empty count, never guessed.
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadMigrations, pgliteDriver, runMigrations } from '../migrations/index.ts';
import {
  asApp,
  freshSchema,
  newGame,
  newLeague,
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

const decided = () => new Date().toISOString();

/** A league with a season, its stage, two teams and one game with these columns. */
async function game(on: PGlite, columns: Record<string, unknown>) {
  const league = await newLeague(on);
  const seasonId = await newSeason(on, league.leagueId, league.defaultProgramId);
  const stageId = await newStage(on, league.leagueId, seasonId);
  const gameId = await newGame(on, {
    leagueId: league.leagueId,
    seasonId,
    stageId,
    homeTeamId: await newTeam(on, league.leagueId, seasonId),
    awayTeamId: await newTeam(on, league.leagueId, seasonId),
    columns,
  });
  return { ...league, seasonId, gameId };
}

const final = (overtime: number | null) => ({
  status: 'final',
  home_score: 52,
  away_score: 50,
  finalized_at: decided(),
  overtime_periods: overtime,
});

const countOf = async (sql: Sql, gameId: string) =>
  (
    await one<{ overtime_periods: number | null }>(
      sql,
      'select overtime_periods from games where id = $1',
      [gameId],
    )
  ).overtime_periods;

const correct = (sql: Sql, g: { leagueId: string; gameId: string; ownerId: string }) =>
  sql.query(
    `insert into game_corrections (league_id, game_id, account_id, reason, before, after)
     values ($1, $2, $3, 'The second overtime was entered by mistake',
       '{"version": 1, "status": "final", "homeScore": 52, "awayScore": 50}',
       '{"version": 1, "status": "final", "homeScore": 52, "awayScore": 50}')`,
    [g.leagueId, g.gameId, g.ownerId],
  );

describe('a final game’s overtime periods (P7 §5.6)', () => {
  it('are 0 for regulation, 1 or more for overtime, at most 18, or not known', async () => {
    for (const count of [null, 0, 1, 2, 18]) {
      const g = await game(db, final(count));
      expect(await countOf(db, g.gameId)).toBe(count);
    }
    for (const count of [-1, 19]) {
      await expect(game(db, final(count))).rejects.toMatchObject({
        ...refused.check,
        constraint: 'games_overtime_periods_range',
      });
    }
  });

  it('are kept only on a final game: never a forfeit, nor a game still to play or being played', async () => {
    const forfeit = { status: 'forfeit', home_score: 20, away_score: 0, finalized_at: decided() };
    for (const columns of [
      { ...forfeit, overtime_periods: 0 },
      { status: 'live', home_score: 50, away_score: 50, overtime_periods: 1 },
      { status: 'scheduled', overtime_periods: 1 },
      { status: 'postponed', overtime_periods: 0 },
      { status: 'cancelled', overtime_periods: 2 },
    ]) {
      await expect(game(db, columns)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'games_overtime_when_final',
      });
    }
    // A forfeit, and a game not decided, with no count are as before.
    expect(await countOf(db, (await game(db, forfeit)).gameId)).toBeNull();
    expect(await countOf(db, (await game(db, { status: 'scheduled' })).gameId)).toBeNull();
  });

  it('are the result’s: a decided game’s count changes only with a correction (S-7)', async () => {
    const g = await game(db, final(2));
    await expect(
      db.query('update games set overtime_periods = 1 where id = $1', [g.gameId]),
    ).rejects.toMatchObject({
      ...refused.check,
      constraint: 'games_result_change_needs_correction',
    });
    await expect(
      db.query('update games set overtime_periods = null where id = $1', [g.gameId]),
    ).rejects.toMatchObject({ constraint: 'games_result_change_needs_correction' });
    expect(await countOf(db, g.gameId)).toBe(2);
    // As the app, with its correction in the same transaction.
    await asApp(db, { league: g.leagueId, account: g.ownerId }, async (tx) => {
      await correct(tx, g);
      await tx.query('update games set overtime_periods = 1 where id = $1', [g.gameId]);
    });
    expect(await countOf(db, g.gameId)).toBe(1);
  });

  it('still guard the rest of the result as 0009 did', async () => {
    const g = await game(db, final(0));
    await expect(
      db.query('update games set home_score = 53 where id = $1', [g.gameId]),
    ).rejects.toMatchObject({ constraint: 'games_result_change_needs_correction' });
    // A change that is not the result needs none.
    await db.query("update games set external_ref = 'sheet 4' where id = $1", [g.gameId]);
  });

  it('are set by the app on a game of its own league only (T-61)', async () => {
    const mine = await game(db, { status: 'live', home_score: 50, away_score: 50 });
    const theirs = await game(db, { status: 'live', home_score: 40, away_score: 40 });
    const ended = await asApp(db, { league: mine.leagueId, account: mine.ownerId }, (tx) =>
      tx.query(
        `update games set status = 'final', home_score = 52, finalized_at = now(),
           overtime_periods = 1
         where id = any($1::uuid[]) returning id`,
        [[mine.gameId, theirs.gameId]],
      ),
    );
    expect(ended.rows).toEqual([{ id: mine.gameId }]);
    expect(await countOf(db, mine.gameId)).toBe(1);
    expect(await countOf(db, theirs.gameId)).toBeNull();
  });
});

describe('a game final before 0021', () => {
  it('has no count after it: nothing guesses how many periods it had', async () => {
    const loaded = await loadMigrations();
    if (!loaded.ok) throw new Error(loaded.error.message);
    const at = loaded.value.findIndex((m) => m.name.startsWith('0021_'));
    expect(at).toBeGreaterThan(0);
    const older = new PGlite();
    try {
      const before = await runMigrations(pgliteDriver(older), loaded.value.slice(0, at));
      if (!before.ok) throw new Error(before.error.message);
      // A game ended by the tracker in the first overtime, as 0020 kept it: its saved
      // state says so, its row cannot.
      const g = await game(older, {
        status: 'final',
        capture_mode: 'live',
        home_score: 52,
        away_score: 50,
        finalized_at: decided(),
      });
      await older.query(
        `insert into game_states (league_id, game_id, seq, state)
         values ($1, $2, 1, '{"version": 1, "status": "final", "plays": [{"type": "period", "period": 3}], "rules": {"periods": 2}}')`,
        [g.leagueId, g.gameId],
      );
      const after = await runMigrations(pgliteDriver(older), loaded.value);
      if (!after.ok) throw new Error(after.error.message);
      expect(await countOf(older, g.gameId)).toBeNull();
    } finally {
      await older.close();
    }
  });
});
