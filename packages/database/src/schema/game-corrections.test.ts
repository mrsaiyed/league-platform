// S-7, T3 §8, T6 §8: a correction to a decided game says who, when and why; it is
// history, never changed or removed; and a decided game's result changes only
// alongside a correction for it in the same transaction.
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asApp,
  freshSchema,
  gameRules,
  newDivision,
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

/** A league with a season, its stage, two teams and one game (final 50-45 unless given columns). */
async function game(columns: Record<string, unknown> = {}) {
  const league = await newLeague(db);
  const seasonId = await newSeason(db, league.leagueId, league.defaultProgramId);
  const stageId = await newStage(db, league.leagueId, seasonId);
  const gameId = await newGame(db, {
    leagueId: league.leagueId,
    seasonId,
    stageId,
    homeTeamId: await newTeam(db, league.leagueId, seasonId),
    awayTeamId: await newTeam(db, league.leagueId, seasonId),
    columns: {
      status: 'final',
      home_score: 50,
      away_score: 45,
      finalized_at: decided(),
      ...columns,
    },
  });
  return { ...league, seasonId, gameId };
}

type Made = Awaited<ReturnType<typeof game>>;

const correct = (sql: Sql, g: Made, reason = 'Score sheet had a basket on the wrong team') =>
  sql.query(
    `insert into game_corrections (league_id, game_id, account_id, reason, before, after)
     values ($1, $2, $3, $4, '{"version": 1, "status": "final", "homeScore": 50, "awayScore": 45}',
       '{"version": 1, "status": "live"}')
     returning id`,
    [g.leagueId, g.gameId, g.ownerId, reason],
  );

const reopen = (sql: Sql, g: Made) =>
  sql.query("update games set status = 'live', finalized_at = null where id = $1", [g.gameId]);

const needsCorrection = {
  ...refused.check,
  constraint: 'games_result_change_needs_correction',
};

describe('game corrections', () => {
  it('point at a game of their own league (T-40)', async () => {
    const a = await game();
    const b = await game();
    await expect(correct(db, { ...a, gameId: b.gameId })).rejects.toMatchObject({
      ...refused.foreignKey,
      constraint: 'game_corrections_game',
    });
  });

  it('say who made them and why, in 1 to 1000 characters (S-7)', async () => {
    const g = await game();
    for (const reason of ['', '   ', 'x'.repeat(1001)]) {
      await expect(correct(db, g, reason)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'game_corrections_reason_length',
      });
    }
    await expect(
      db.query(
        `insert into game_corrections (league_id, game_id, reason, before, after)
         values ($1, $2, 'Why', '{"version": 1}', '{"version": 1}')`,
        [g.leagueId, g.gameId],
      ),
    ).rejects.toMatchObject(refused.notNull);
  });

  it('keep the result before and after as small versioned documents', async () => {
    const g = await game();
    const write = (before: string, after: string) =>
      db.query(
        `insert into game_corrections (league_id, game_id, account_id, reason, before, after)
         values ($1, $2, $3, 'Why', $4, $5)`,
        [g.leagueId, g.gameId, g.ownerId, before, after],
      );
    const big = JSON.stringify({ version: 1, pad: 'x'.repeat(16400) });
    for (const bad of ['{}', '[]', '{"version": 0}', big]) {
      await expect(write(bad, '{"version": 1}')).rejects.toMatchObject({
        ...refused.check,
        constraint: 'game_corrections_before_document',
      });
      await expect(write('{"version": 1}', bad)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'game_corrections_after_document',
      });
    }
  });

  it('are dated by the database, never by the caller', async () => {
    const g = await game();
    const { rows } = await db.query<{ id: string }>(
      `insert into game_corrections (league_id, game_id, account_id, reason, before, after, at)
       values ($1, $2, $3, 'Why', '{"version": 1}', '{"version": 1}', now() - interval '3 days')
       returning id`,
      [g.leagueId, g.gameId, g.ownerId],
    );
    const { recent } = await one<{ recent: boolean }>(
      db,
      `select at > now() - interval '1 minute' as recent from game_corrections where id = $1`,
      [rows[0]?.id],
    );
    expect(recent).toBe(true);
  });

  it('can never be changed or removed, even by the tables’ owner (T-45)', async () => {
    const g = await game();
    const { rows } = await correct(db, g);
    const id = (rows[0] as { id: string }).id;
    await expect(
      db.query(`update game_corrections set reason = 'Something else' where id = $1`, [id]),
    ).rejects.toMatchObject(refused.restrict);
    await expect(
      db.query('delete from game_corrections where id = $1', [id]),
    ).rejects.toMatchObject(refused.restrict);
  });

  it('can only be added by the app, never changed or removed (T-60)', async () => {
    const g = await game();
    const { rows } = await asApp(db, { league: g.leagueId }, async (tx) => {
      const added = await correct(tx, g);
      await reopen(tx, g);
      return added;
    });
    const id = (rows[0] as { id: string }).id;
    for (const sql of [
      `update game_corrections set reason = 'Something else' where id = $1`,
      'delete from game_corrections where id = $1',
    ]) {
      await expect(
        asApp(db, { league: g.leagueId }, (tx) => tx.query(sql, [id])),
      ).rejects.toMatchObject(refused.privilege);
    }
    const { n } = await one<{ n: number }>(
      db,
      'select count(*)::int as n from game_corrections where id = $1',
      [id],
    );
    expect(n).toBe(1);
  });
});

describe("a decided game's result changes only with a correction (S-7)", () => {
  it('reopening a final game without a correction is refused when the transaction ends', async () => {
    const g = await game();
    await expect(reopen(db, g)).rejects.toMatchObject(needsCorrection);
    await expect(
      db.transaction(async (tx) => {
        await reopen(tx, g);
        await tx.query('update games set home_score = 52, away_score = 45 where id = $1', [
          g.gameId,
        ]);
      }),
    ).rejects.toMatchObject(needsCorrection);
    const row = await one<{ status: string }>(db, 'select status from games where id = $1', [
      g.gameId,
    ]);
    expect(row.status).toBe('final');
  });

  it('with a correction for that game in the same transaction, before or after the change', async () => {
    const first = await game();
    await db.transaction(async (tx) => {
      await correct(tx, first);
      await reopen(tx, first);
    });
    const second = await game();
    await db.transaction(async (tx) => {
      await reopen(tx, second);
      await correct(tx, second);
    });
  });

  it("not with an older correction, or another game's", async () => {
    const g = await game();
    await correct(db, g);
    await expect(reopen(db, g)).rejects.toMatchObject(needsCorrection);
    const other = await game();
    await expect(
      db.transaction(async (tx) => {
        await correct(tx, other);
        await reopen(tx, g);
      }),
    ).rejects.toMatchObject(needsCorrection);
  });

  it('covers a changed score, a change of status, a forfeit and putting it in the bin', async () => {
    const changes: [Record<string, unknown>, string][] = [
      [{}, 'update games set home_score = 49 where id = $1'],
      [
        {},
        "update games set status = 'cancelled', home_score = null, away_score = null, finalized_at = null where id = $1",
      ],
      [{}, "update games set status = 'forfeit', home_score = 20, away_score = 0 where id = $1"],
      [{}, 'update games set deleted_at = now() where id = $1'],
      [
        { status: 'forfeit', home_score: 0, away_score: 20 },
        "update games set status = 'final', home_score = 0, away_score = 0 where id = $1",
      ],
    ];
    for (const [columns, sql] of changes) {
      const g = await game(columns);
      await expect(db.query(sql, [g.gameId])).rejects.toMatchObject(needsCorrection);
      await db.transaction(async (tx) => {
        await correct(tx, g);
        await tx.query(sql, [g.gameId]);
      });
    }
  });

  it('covers a change of team, of division and of the time it was finalized', async () => {
    const changes: [string, (g: Made) => Promise<unknown[]>][] = [
      ['home_team_id', async (g) => [await newTeam(db, g.leagueId, g.seasonId)]],
      ['away_team_id', async (g) => [await newTeam(db, g.leagueId, g.seasonId)]],
      ['division_id', async (g) => [await newDivision(db, g.leagueId, g.seasonId)]],
      ['finalized_at', async () => ['2026-01-01T00:00:00Z']],
    ];
    for (const [column, value] of changes) {
      const g = await game();
      const params = [g.gameId, ...(await value(g))];
      const sql = `update games set ${column} = $2 where id = $1`;
      await expect(db.query(sql, params)).rejects.toMatchObject(needsCorrection);
      await db.transaction(async (tx) => {
        await correct(tx, g);
        await tx.query(sql, params);
      });
    }
    // Its stage is the season's one regular-season stage, so it cannot change yet;
    // the same check covers it once brackets add more stages (S-4).
  });

  it('covers taking a decided game back out of the bin', async () => {
    const g = await game({ deleted_at: decided() });
    const restore = 'update games set deleted_at = null where id = $1';
    await expect(db.query(restore, [g.gameId])).rejects.toMatchObject(needsCorrection);
    await db.transaction(async (tx) => {
      await correct(tx, g);
      await tx.query(restore, [g.gameId]);
    });
    // A game that was never decided comes back without one.
    const scheduled = await game({
      status: 'scheduled',
      home_score: null,
      away_score: null,
      finalized_at: null,
      deleted_at: decided(),
    });
    await db.query(restore, [scheduled.gameId]);
  });

  it('is not needed to decide a game, or to change what is not its result', async () => {
    const live = await game({ status: 'live', home_score: 10, away_score: 8, finalized_at: null });
    await db.query(
      "update games set status = 'final', home_score = 40, away_score = 38, finalized_at = now() where id = $1",
      [live.gameId],
    );
    const scheduled = await game({
      status: 'scheduled',
      home_score: null,
      away_score: null,
      finalized_at: null,
    });
    await db.query(
      `update games set status = 'forfeit', home_score = 20, away_score = 0, finalized_at = now(),
         format = $2 where id = $1`,
      [scheduled.gameId, gameRules],
    );
    const g = await game();
    await db.query(
      "update games set starts_at = now(), capture_mode = 'box', game_number = 4 where id = $1",
      [g.gameId],
    );
  });

  it('holds for the app at every isolation level: it reads only its own transaction’s rows', async () => {
    for (const level of ['read committed', 'repeatable read', 'serializable']) {
      const g = await game();
      // The isolation level is set first, then the app's role and league, as asApp does.
      const inLevel = (work: (tx: Transaction) => Promise<unknown>) =>
        db.transaction(async (tx) => {
          await tx.exec(`set transaction isolation level ${level}`);
          await tx.query('set local role app_user');
          await tx.query("select set_config('app.league_id', $1, true)", [g.leagueId]);
          await work(tx);
        });
      await expect(inLevel((tx) => reopen(tx, g))).rejects.toMatchObject(needsCorrection);
      await inLevel(async (tx) => {
        await correct(tx, g);
        await reopen(tx, g);
      });
    }
  });
});

describe('purging a league from the bin (T-51, T-220)', () => {
  it('removes its corrections, schedule revisions and drafts with the rest of its history', async () => {
    const binned = await game();
    const kept = await game();
    const history = async (g: Made) => {
      await correct(db, g);
      await db.query(
        'insert into schedule_revisions (league_id, season_id, number) values ($1, $2, 1)',
        [g.leagueId, g.seasonId],
      );
      await db.query(
        'insert into schedule_drafts (league_id, season_id, based_on_revision) values ($1, $2, 1)',
        [g.leagueId, g.seasonId],
      );
    };
    await history(binned);
    await history(kept);
    const count = async (g: Made) =>
      (
        await one<{ n: number }>(
          db,
          `select ((select count(*) from game_corrections where league_id = $1)
                 + (select count(*) from schedule_revisions where league_id = $1)
                 + (select count(*) from schedule_drafts where league_id = $1))::int as n`,
          [g.leagueId],
        )
      ).n;
    await db.query("update leagues set deleted_at = now() - interval '31 days' where id = $1", [
      binned.leagueId,
    ]);
    await db.query('select public.purge_league_history($1)', [binned.leagueId]);
    expect(await count(binned)).toBe(0);
    expect(await count(kept)).toBe(3);
  });
});
