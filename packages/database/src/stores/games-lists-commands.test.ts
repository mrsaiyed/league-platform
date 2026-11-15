// Step 2.156 against the real database: the games that still need a result, however old;
// a game under way since before the league's midnight still on the scorekeeper's list
// after it; and the earlier games by round, a round at a time, in a league with 300 past
// games, each list held to its limit. Each call is one transaction (commandTransaction).
// The isolation cases are in ../isolation, the roles in role-matrix.test.ts.
import type { PGlite } from '@electric-sql/pglite';
import {
  earlierRoundGamesLimit,
  listEarlierGames,
  listGamesNeedingResult,
  listMyGames,
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
import { withTransaction } from '../db/with-transaction.ts';
import {
  freshSchema,
  gameRules,
  newGame,
  newLeague,
  newProgram,
  newSeason,
  newStage,
  newTeam,
  one,
} from '../schema/schema.test-helper.ts';
import { listEarlierRound } from '../queries/list-earlier-round.ts';
import { listEarlierRounds } from '../queries/list-earlier-rounds.ts';
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

/** A made-up league (America/Chicago) with one season, two teams and a way to add games. */
async function league() {
  const l = await newLeague(pglite);
  const programId = await newProgram(pglite, l.leagueId);
  const seasonId = await newSeason(pglite, l.leagueId, programId);
  const stageId = await newStage(pglite, l.leagueId, seasonId);
  const home = await newTeam(pglite, l.leagueId, seasonId);
  const away = await newTeam(pglite, l.leagueId, seasonId);
  const gameAt = (columns: Record<string, unknown>) =>
    newGame(pglite, {
      leagueId: l.leagueId,
      seasonId,
      stageId,
      homeTeamId: home,
      awayTeamId: away,
      columns,
    });
  const as = () => ({ leagueId: l.leagueId, accountId: l.ownerId, requestId: 'r-1' });
  // The league's own midnight, by the database's clock.
  const { midnight } = await one<{ midnight: Date }>(
    pglite,
    `select date_trunc('day', now() at time zone 'America/Chicago')
              at time zone 'America/Chicago' as midnight`,
  );
  const at = (minutes: number) => new Date(midnight.getTime() + minutes * 60_000).toISOString();
  return { ...l, programId, seasonId, stageId, home, away, gameAt, as, at };
}

const day = 24 * 60;
const final = (startsAt: string) => ({
  starts_at: startsAt,
  status: 'final',
  home_score: 50,
  away_score: 40,
  finalized_at: startsAt,
});

describe('the games that still need a result, on the database', () => {
  it('lists every game past its start with no result, oldest first, and keeps a live one listed past midnight', async () => {
    const l = await league();
    const threeDaysAgo = await l.gameAt({ starts_at: l.at(-3 * day + 18 * 60) });
    // Under way since an hour before the league's midnight.
    const live = await l.gameAt({ starts_at: l.at(-60), status: 'live', capture_mode: 'live' });
    const monthAgo = await l.gameAt({ starts_at: l.at(-30 * day) });
    // Not waiting for a result: still to come, decided, called off, in the bin.
    await l.gameAt({ starts_at: l.at(3 * day) });
    await l.gameAt(final(l.at(-2 * day)));
    await l.gameAt({ starts_at: l.at(-2 * day), status: 'postponed' });
    await l.gameAt({ starts_at: l.at(-2 * day), status: 'cancelled' });
    await l.gameAt({ starts_at: l.at(-2 * day), deleted_at: new Date().toISOString() });

    const needs = await listGamesNeedingResult(l.as(), {}, deps);
    expect(needs.ok && needs.value.games.map((g) => g.id)).toEqual([monthAgo, threeDaysAgo, live]);
    expect(needs.ok && needs.value.more).toBe(false);

    // The scorekeeper's list starts at the league's midnight, and still has the live game.
    const mine = await listMyGames(l.as(), {}, deps);
    expect(mine.ok && mine.value.games.map((g) => g.id)).toContain(live);
    expect(mine.ok && mine.value.games.map((g) => g.id)).not.toContain(threeDaysAgo);
    expect(mine.ok && mine.value.games.find((g) => g.id === live)).toMatchObject({
      isToday: false,
      status: 'live',
    });
  });
});

describe('the earlier games by round, on the database', () => {
  it('counts 300 past games by round, shows one round at a time, and keeps to its limits', async () => {
    const l = await league();
    // Thirty weekly rounds of ten final games each, the latest a week ago.
    await pglite.query(
      `with r as (
         insert into rounds (league_id, season_id, number)
         select $1, $2, n from generate_series(1, 30) n returning id, number)
       insert into games (league_id, season_id, stage_id, round_id, home_team_id, away_team_id,
         starts_at, status, capture_mode, home_score, away_score, format, finalized_at)
       select $1, $2, $3, r.id, $4, $5, t, 'final', 'final', 50, 40, $6, t
       from r cross join generate_series(1, 10) k,
         lateral (select now() - (31 - r.number) * interval '7 days' + k * interval '1 minute' as t) s`,
      [l.leagueId, l.seasonId, l.stageId, l.home, l.away, gameRules],
    );
    // A make-up game in no round, and one waiting for its result.
    const makeUp = await l.gameAt(final(l.at(-40 * day)));
    await l.gameAt({ starts_at: l.at(-40 * day) });

    const all = await listEarlierGames(l.as(), {}, deps);
    if (!all.ok) throw new Error(all.error.code);
    expect(all.value.rounds).toHaveLength(31);
    expect(all.value.moreRounds).toBe(false);
    expect(all.value.shown).toBeNull();
    expect(all.value.rounds[0]).toMatchObject({ number: 30, games: 10 });
    const noRound = all.value.rounds.find((r) => r.roundId === null);
    expect(noRound).toMatchObject({ seasonId: l.seasonId, games: 1 });

    const fourWeeks = all.value.rounds.find((r) => r.number === 27);
    const shown = await listEarlierGames(l.as(), { round: fourWeeks?.key ?? '' }, deps);
    expect(shown.ok && shown.value.shown?.games).toHaveLength(10);
    expect(shown.ok && shown.value.shown?.games.every((g) => g.status === 'final')).toBe(true);
    const made = await listEarlierGames(l.as(), { round: noRound?.key ?? '' }, deps);
    expect(made.ok && made.value.shown?.games.map((g) => g.id)).toEqual([makeUp]);
    expect(earlierRoundGamesLimit).toBeLessThan(300);

    // The queries hold to the limit they are given.
    const as = { leagueId: l.leagueId, accountId: l.ownerId };
    const counted = await withTransaction(db, as, (scope) =>
      listEarlierRounds(scope, l.ownerId, 5),
    );
    expect(counted.map((r) => r.number)).toEqual([30, 29, 28, 27, 26]);
    const round = await withTransaction(db, as, (scope) =>
      listEarlierRound(scope, l.ownerId, { roundId: fourWeeks?.roundId ?? '' }, 3),
    );
    expect(round.games).toHaveLength(3);
  });
});
