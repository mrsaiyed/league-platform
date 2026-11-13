// Step 2.27 against the real database: assigning scorekeepers, the league's choice of
// who may score (P4 §4), roles and assignments read fresh on every call (T-75), and
// the scorekeeper's games for today and the week, by the league's own today. Each
// call is one transaction (commandTransaction). The isolation cases are in ../isolation.
import type { PGlite } from '@electric-sql/pglite';
import {
  assignScorekeeper,
  listMyGames,
  recordFinalScore,
  revokeGrant,
  setSetting,
  unassignScorekeeper,
  type AccessTx,
  type CommandDeps,
  type GamesTx,
  type Job,
  type LeaguesTx,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import {
  freshSchema,
  newAccount,
  newGame,
  newLeague,
  newProgram,
  newSeason,
  newStage,
  newTeam,
  one,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { divisionsStore } from './divisions-store.ts';
import { gamesStore } from './games-store.ts';
import { leaguesStore } from './leagues-store.ts';

type Tx = GamesTx & LeaguesTx & AccessTx;

let pglite: PGlite;
let db: DatabaseHandle;
let deps: CommandDeps<Tx>;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  const transaction = commandTransaction(
    db,
    (scope): Tx => ({
      jobs: { enqueue: async (_job: Job) => {} },
      games: gamesStore(scope),
      leagues: leaguesStore(scope, { platformStaff: [] }),
      divisions: divisionsStore(scope),
      access: accessStore(scope),
      activity: activityLogStore(scope),
    }),
  );
  deps = { transaction, events: [], log: () => {}, now: () => 0 };
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

async function grant(leagueId: string, role: string, programId: string | null = null) {
  const accountId = await newAccount(pglite);
  const row = await one<{ id: string }>(
    pglite,
    `insert into role_grants (league_id, account_id, role, scope_type, scope_id)
     values ($1, $2, $3, $4, $5) returning id`,
    [leagueId, accountId, role, programId === null ? 'league' : 'program', programId],
  );
  return { accountId, grantId: row.id };
}

/** A league with a game, two league-wide scorekeepers and a scheduler. */
async function leagueWithScorekeepers() {
  const l = await newLeague(pglite);
  const programId = await newProgram(pglite, l.leagueId);
  const seasonId = await newSeason(pglite, l.leagueId, programId);
  const stageId = await newStage(pglite, l.leagueId, seasonId);
  const home = await newTeam(pglite, l.leagueId, seasonId);
  const away = await newTeam(pglite, l.leagueId, seasonId);
  const gameAt = (columns: Record<string, unknown> = {}) =>
    newGame(pglite, {
      leagueId: l.leagueId,
      seasonId,
      stageId,
      homeTeamId: home,
      awayTeamId: away,
      columns,
    });
  const gameId = await gameAt();
  const as = (accountId: string) => ({ leagueId: l.leagueId, accountId, requestId: 'r-1' });
  return {
    ...l,
    programId,
    seasonId,
    gameId,
    gameAt,
    as,
    assigned: await grant(l.leagueId, 'scorekeeper'),
    unassigned: await grant(l.leagueId, 'scorekeeper'),
    scheduler: await grant(l.leagueId, 'scheduler'),
  };
}

type League = Awaited<ReturnType<typeof leagueWithScorekeepers>>;

const chooseRule = async (l: League, value: 'anyScorekeeper' | 'assignedOnly') =>
  expect(
    await setSetting(
      l.as(l.ownerId),
      { level: 'league', key: 'games.whoMayScore', value, version: null },
      deps,
    ),
  ).toMatchObject({ ok: true });

const scoreAs = async (l: League, accountId: string, gameId = l.gameId) => {
  const result = await recordFinalScore(
    l.as(accountId),
    { gameId, version: 1, homeScore: 30, awayScore: 20 },
    deps,
  );
  return result.ok ? 'ok' : result.error.code;
};

/** Each scoring try runs on a fresh copy of the game: 'ok' finalizes it. */
async function triesToScore(l: League, accountId: string) {
  return scoreAs(l, accountId, await l.gameAt());
}

async function assign(l: League, accountId: string, gameId = l.gameId) {
  return assignScorekeeper(l.as(l.ownerId), { gameId, accountId }, deps);
}

describe('who may score, on the database (P4 section 4, T-75)', () => {
  for (const rule of ['starting value', 'anyScorekeeper', 'assignedOnly'] as const) {
    it(`under ${rule}: an assigned scorekeeper may score, an unassigned one ${
      rule === 'assignedOnly' ? 'may not' : 'may too'
    }; owner and scheduler always may`, async () => {
      const l = await leagueWithScorekeepers();
      if (rule !== 'starting value') await chooseRule(l, rule);
      // Each try gets its own new game, with the first scorekeeper assigned to it.
      const tryAs = async (accountId: string) => {
        const gameId = await l.gameAt();
        expect(await assign(l, l.assigned.accountId, gameId)).toMatchObject({ ok: true });
        return scoreAs(l, accountId, gameId);
      };
      expect(await tryAs(l.assigned.accountId)).toBe('ok');
      expect(await tryAs(l.unassigned.accountId)).toBe(
        rule === 'assignedOnly' ? 'not-allowed' : 'ok',
      );
      expect(await tryAs(l.ownerId)).toBe('ok');
      expect(await tryAs(l.scheduler.accountId)).toBe('ok');
    });
  }

  it('refuses a scorekeeper the moment their role is removed, assigned or not', async () => {
    const l = await leagueWithScorekeepers();
    for (const rule of ['anyScorekeeper', 'assignedOnly'] as const) {
      await pglite.query('delete from setting_values where league_id = $1', [l.leagueId]);
      await chooseRule(l, rule);
      const { accountId, grantId } = await grant(l.leagueId, 'scorekeeper');
      const gameId = await l.gameAt();
      expect(await assign(l, accountId, gameId)).toMatchObject({ ok: true });
      expect(await revokeGrant(l.as(l.ownerId), { grantId }, deps)).toMatchObject({ ok: true });
      // The very next request is refused: nothing about the role was kept.
      expect(await scoreAs(l, accountId, gameId)).toBe('not-allowed');
      const list = await listMyGames(l.as(accountId), {}, deps);
      expect(list).toEqual({ ok: false, error: { code: 'not-allowed' } });
      // And they can no longer be assigned to anything.
      expect(await assign(l, accountId, await l.gameAt())).toEqual({
        ok: false,
        error: { code: 'cannot-score-game' },
      });
    }
  });

  it('refuses a scorekeeper the moment their assignment is taken away, when only assigned ones may', async () => {
    const l = await leagueWithScorekeepers();
    await chooseRule(l, 'assignedOnly');
    expect(await assign(l, l.assigned.accountId)).toMatchObject({ ok: true });
    expect(
      await unassignScorekeeper(
        l.as(l.scheduler.accountId),
        { gameId: l.gameId, accountId: l.assigned.accountId },
        deps,
      ),
    ).toMatchObject({ ok: true });
    expect(await scoreAs(l, l.assigned.accountId)).toBe('not-allowed');
    // Loosening the setting lets them in again, at once.
    await pglite.query('delete from setting_values where league_id = $1', [l.leagueId]);
    expect(await triesToScore(l, l.assigned.accountId)).toBe('ok');
  });

  it("follows each league's own choice: another league's setting changes nothing here", async () => {
    const strict = await leagueWithScorekeepers();
    const loose = await leagueWithScorekeepers();
    await chooseRule(strict, 'assignedOnly');
    expect(await triesToScore(strict, strict.unassigned.accountId)).toBe('not-allowed');
    expect(await triesToScore(loose, loose.unassigned.accountId)).toBe('ok');
  });

  it("keeps a program's scorekeeper to that program", async () => {
    const l = await leagueWithScorekeepers();
    const other = await newSeason(pglite, l.leagueId, l.defaultProgramId);
    const elsewhere = await newGame(pglite, {
      leagueId: l.leagueId,
      seasonId: other,
      stageId: await newStage(pglite, l.leagueId, other),
      homeTeamId: await newTeam(pglite, l.leagueId, other),
      awayTeamId: await newTeam(pglite, l.leagueId, other),
    });
    const { accountId } = await grant(l.leagueId, 'scorekeeper', l.programId);
    expect(await assign(l, accountId, elsewhere)).toEqual({
      ok: false,
      error: { code: 'cannot-score-game' },
    });
    expect(await scoreAs(l, accountId, elsewhere)).toBe('not-allowed');
    expect(await triesToScore(l, accountId)).toBe('ok');
  });
});

describe('assigning scorekeepers, on the database', () => {
  it('assigns once, logs it, and takes the assignment away again', async () => {
    const l = await leagueWithScorekeepers();
    const input = { gameId: l.gameId, accountId: l.assigned.accountId };
    expect(await assign(l, l.assigned.accountId)).toEqual({ ok: true, value: input });
    expect(await assign(l, l.assigned.accountId)).toEqual({
      ok: false,
      error: { code: 'already-assigned' },
    });
    const rows = () =>
      pglite.query<{ account_id: string }>(
        'select account_id from game_assignments where league_id = $1 and game_id = $2',
        [l.leagueId, l.gameId],
      );
    expect((await rows()).rows).toEqual([{ account_id: l.assigned.accountId }]);
    expect(await unassignScorekeeper(l.as(l.ownerId), input, deps)).toEqual({
      ok: true,
      value: input,
    });
    expect(await unassignScorekeeper(l.as(l.ownerId), input, deps)).toEqual({
      ok: false,
      error: { code: 'not-assigned' },
    });
    expect((await rows()).rows).toEqual([]);
    const log = await pglite.query<{ action: string; details: Record<string, unknown> }>(
      `select action, details from activity_log where league_id = $1 and target_id = $2
       order by at, action`,
      [l.leagueId, l.gameId],
    );
    expect(log.rows).toEqual([
      {
        action: 'games.assign_scorekeeper',
        details: { accountId: l.assigned.accountId, scopeType: 'program', scopeId: l.programId },
      },
      {
        action: 'games.unassign_scorekeeper',
        details: { accountId: l.assigned.accountId, scopeType: 'program', scopeId: l.programId },
      },
    ]);
  });

  it('is for those who run Games: a scorekeeper cannot assign themselves', async () => {
    const l = await leagueWithScorekeepers();
    expect(
      await assignScorekeeper(
        l.as(l.unassigned.accountId),
        { gameId: l.gameId, accountId: l.unassigned.accountId },
        deps,
      ),
    ).toEqual({ ok: false, error: { code: 'not-allowed' } });
  });
});

describe("the scorekeeper's games for today and the week, on the database", () => {
  it("lists the games from the start of the league's today for seven days, by its time zone", async () => {
    const l = await leagueWithScorekeepers();
    // The edges of the window, worked out by the database in the league's time zone
    // (America/Chicago), and the league's today as the list should give it.
    const edges = await one<{ start: Date; end: Date; today: string }>(
      pglite,
      `select date_trunc('day', now() at time zone 'America/Chicago')
                at time zone 'America/Chicago' as start,
              (date_trunc('day', now() at time zone 'America/Chicago') + interval '7 days')
                at time zone 'America/Chicago' as end,
              to_char(now() at time zone 'America/Chicago', 'YYYY-MM-DD') as today`,
    );
    const at = (base: Date, minutes: number) =>
      new Date(base.getTime() + minutes * 60_000).toISOString();
    const first = await l.gameAt({ starts_at: at(edges.start, 0) });
    const last = await l.gameAt({ starts_at: at(edges.end, -1) });
    await l.gameAt({ starts_at: at(edges.start, -1) });
    await l.gameAt({ starts_at: at(edges.end, 0) });
    await l.gameAt({ starts_at: at(edges.start, 60), deleted_at: new Date().toISOString() });
    const middle = await l.gameAt({ starts_at: at(edges.start, 3 * 24 * 60) });
    expect(await assign(l, l.assigned.accountId, middle)).toMatchObject({ ok: true });

    const listAs = async (accountId: string) => {
      const result = await listMyGames(l.as(accountId), {}, deps);
      if (!result.ok) throw new Error(result.error.code);
      return result.value;
    };
    const mine = await listAs(l.assigned.accountId);
    expect(mine.today).toBe(edges.today);
    expect(mine.games.map((g) => [g.id, g.assignedToMe])).toEqual([
      [first, false],
      [middle, true],
      [last, false],
    ]);
    expect(mine.games[0]).toMatchObject({ day: edges.today, isToday: true, status: 'scheduled' });
    expect(mine.games[2]?.isToday).toBe(false);

    // Once only assigned games may be scored, the list is the assigned ones.
    await chooseRule(l, 'assignedOnly');
    expect((await listAs(l.assigned.accountId)).games.map((g) => g.id)).toEqual([middle]);
    expect((await listAs(l.unassigned.accountId)).games).toEqual([]);
    expect((await listAs(l.scheduler.accountId)).games.map((g) => g.id)).toEqual([
      first,
      middle,
      last,
    ]);
  });
});
