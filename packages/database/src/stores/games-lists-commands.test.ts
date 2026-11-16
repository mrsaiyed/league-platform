// Step 2.156 against the real database: the games that still need a result, however old;
// a game under way since before the league's midnight still on the scorekeeper's list
// after it; and the earlier games by round, a round at a time, in a league with 300 past
// games, each list held to its limit. Each call is one transaction (commandTransaction).
// The isolation cases are in ../isolation, the roles in role-matrix.test.ts.
import type { PGlite } from '@electric-sql/pglite';
import {
  earlierRoundGamesLimit,
  earlierRoundsLimit,
  listEarlierGames,
  listGamesNeedingResult,
  listMyGames,
  listScoringOffers,
  needsResultLimit,
  setSetting,
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
  newAccount,
  newGame,
  newLeague,
  newProgram,
  newRound,
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

/** A role in the league for a new made-up account: its id. */
async function grant(
  leagueId: string,
  role: string,
  programId: string | null = null,
  existing?: string,
) {
  const accountId = existing ?? (await newAccount(pglite));
  await pglite.query(
    `insert into role_grants (league_id, account_id, role, scope_type, scope_id)
     values ($1, $2, $3, $4, $5)`,
    [leagueId, accountId, role, programId === null ? 'league' : 'program', programId],
  );
  return accountId;
}

const asAccount = (leagueId: string, accountId: string) => ({
  leagueId,
  accountId,
  requestId: 'r-1',
});

// The review's H1: the query keeps the person's own games first, then cuts.
describe('the games that need a result, for a person who scores only some, on the database', () => {
  it('never pushes their games out with more than a list of games they do not score', async () => {
    const l = await league();
    // More old unscored games of the first program than the list holds.
    await pglite.query(
      `insert into games (league_id, season_id, stage_id, home_team_id, away_team_id,
         starts_at, status, capture_mode)
       select $1, $2, $3, $4, $5, now() - interval '60 days' + k * interval '1 hour',
         'scheduled', 'final'
       from generate_series(1, $6::integer) k`,
      [l.leagueId, l.seasonId, l.stageId, l.home, l.away, needsResultLimit + 1],
    );
    // The newest of the first program's, assigned to a scorekeeper of the whole league.
    const assignedGame = await l.gameAt({ starts_at: l.at(-10 * day) });
    const scorekeeper = await grant(l.leagueId, 'scorekeeper');
    await pglite.query(
      'insert into game_assignments (league_id, game_id, account_id) values ($1, $2, $3)',
      [l.leagueId, assignedGame, scorekeeper],
    );
    // Yesterday's unscored game of a second program, and its own scorekeeper.
    const other = await newProgram(pglite, l.leagueId);
    const otherSeason = await newSeason(pglite, l.leagueId, other);
    const otherStage = await newStage(pglite, l.leagueId, otherSeason);
    const theirs = await newGame(pglite, {
      leagueId: l.leagueId,
      seasonId: otherSeason,
      stageId: otherStage,
      homeTeamId: await newTeam(pglite, l.leagueId, otherSeason),
      awayTeamId: await newTeam(pglite, l.leagueId, otherSeason),
      columns: { starts_at: l.at(-day + 18 * 60) },
    });
    const programScorekeeper = await grant(l.leagueId, 'scorekeeper', other);

    const needs = (accountId: string) =>
      listGamesNeedingResult(asAccount(l.leagueId, accountId), {}, deps);
    const owner = await needs(l.ownerId);
    expect(owner.ok && owner.value.games).toHaveLength(needsResultLimit);
    expect(owner.ok && owner.value.more).toBe(true);
    const program = await needs(programScorekeeper);
    expect(program.ok && program.value.games.map((g) => g.id)).toEqual([theirs]);
    expect(program.ok && program.value.more).toBe(false);

    const chosen = await setSetting(
      l.as(),
      { level: 'league', key: 'games.whoMayScore', value: 'assignedOnly', version: null },
      deps,
    );
    expect(chosen.ok).toBe(true);
    const mine = await needs(scorekeeper);
    expect(mine.ok && mine.value.games.map((g) => g.id)).toEqual([assignedGame]);
    expect(mine.ok && mine.value.games[0]?.assignedToMe).toBe(true);
    expect(mine.ok && mine.value.more).toBe(false);
  });
});

// Every branch of the filter (inReachOf) on the database: the assigned games of one
// program only, and two branches joined (one person with two roles), for both lists.
describe('the lists for people who score only some games, every branch, on the database', () => {
  it("keeps a program's assigned games only, and joins a person's two roles", async () => {
    const l = await league();
    const other = await newProgram(pglite, l.leagueId);
    const otherSeason = await newSeason(pglite, l.leagueId, other);
    const otherStage = await newStage(pglite, l.leagueId, otherSeason);
    const otherHome = await newTeam(pglite, l.leagueId, otherSeason);
    const otherAway = await newTeam(pglite, l.leagueId, otherSeason);
    const otherGame = (columns: Record<string, unknown>) =>
      newGame(pglite, {
        leagueId: l.leagueId,
        seasonId: otherSeason,
        stageId: otherStage,
        homeTeamId: otherHome,
        awayTeamId: otherAway,
        columns,
      });
    const firstRound = await newRound(pglite, l.leagueId, l.seasonId, 1);
    const otherRound = await newRound(pglite, l.leagueId, otherSeason, 1);
    // Waiting for a result: one assigned and one not in the first program, and one of the
    // other program assigned to the same people (not their program, for the first).
    const assigned = await l.gameAt({ starts_at: l.at(-3 * day) });
    const unassigned = await l.gameAt({ starts_at: l.at(-2 * day) });
    const elsewhere = await otherGame({ starts_at: l.at(-day) });
    // Earlier games, the same three ways, each program's in its own round.
    const assignedFinal = await l.gameAt({ ...final(l.at(-10 * day)), round_id: firstRound });
    await l.gameAt({ ...final(l.at(-10 * day + 60)), round_id: firstRound });
    const elsewhereFinal = await otherGame({ ...final(l.at(-9 * day)), round_id: otherRound });

    // A scorekeeper of the first program; and a scorekeeper there who schedules the other.
    const keeper = await grant(l.leagueId, 'scorekeeper', l.programId);
    const both = await grant(l.leagueId, 'scorekeeper', l.programId);
    await grant(l.leagueId, 'scheduler', other, both);
    for (const [account, games] of [
      [keeper, [assigned, assignedFinal, elsewhere, elsewhereFinal]],
      [both, [assigned, assignedFinal]],
    ] as const) {
      for (const game of games) {
        await pglite.query(
          'insert into game_assignments (league_id, game_id, account_id) values ($1, $2, $3)',
          [l.leagueId, game, account],
        );
      }
    }
    const chosen = await setSetting(
      l.as(),
      { level: 'league', key: 'games.whoMayScore', value: 'assignedOnly', version: null },
      deps,
    );
    expect(chosen.ok).toBe(true);

    const needs = async (account: string) => {
      const r = await listGamesNeedingResult(asAccount(l.leagueId, account), {}, deps);
      return r.ok ? r.value.games.map((g) => g.id) : r.error.code;
    };
    const rounds = async (account: string) => {
      const r = await listEarlierGames(asAccount(l.leagueId, account), {}, deps);
      if (!r.ok) throw new Error(r.error.code);
      return r.value.rounds.map((round) => [round.roundId, round.games]);
    };
    const shown = async (account: string) => {
      const all = await listEarlierGames(asAccount(l.leagueId, account), {}, deps);
      const key = all.ok ? all.value.rounds.find((r) => r.roundId === firstRound)?.key : '';
      const r = await listEarlierGames(asAccount(l.leagueId, account), { round: key ?? '' }, deps);
      return r.ok ? r.value.shown?.games.map((g) => g.id) : r.error.code;
    };

    // Only their program's assigned games: never the unassigned one, nor the other program's.
    expect(await needs(keeper)).toEqual([assigned]);
    expect(await rounds(keeper)).toEqual([[firstRound, 1]]);
    expect(await shown(keeper)).toEqual([assignedFinal]);
    // Their assigned games of the first program, or every game of the one they schedule.
    expect(await needs(both)).toEqual([assigned, elsewhere]);
    expect(await rounds(both)).toEqual([
      [otherRound, 1],
      [firstRound, 1],
    ]);
    expect(await shown(both)).toEqual([assignedFinal]);
  });
});

// The review's M1: the rounds are counted from the person's own games, then cut.
describe('the earlier rounds, for a person who scores only one program, on the database', () => {
  it('never pushes their older round out with more rounds than the limit of another program', async () => {
    const l = await league();
    // More newer rounds of the first program than are offered, one final game each.
    await pglite.query(
      `with r as (
         insert into rounds (league_id, season_id, number)
         select $1, $2, n from generate_series(1, $6::integer) n returning id, number)
       insert into games (league_id, season_id, stage_id, round_id, home_team_id, away_team_id,
         starts_at, status, capture_mode, home_score, away_score, format, finalized_at)
       select $1, $2, $3, r.id, $4, $5, t, 'final', 'final', 50, 40, $7, t
       from r, lateral (select now() - interval '300 days' + r.number * interval '1 day' as t) s`,
      [l.leagueId, l.seasonId, l.stageId, l.home, l.away, earlierRoundsLimit + 1, gameRules],
    );
    // An older round of a second program, and its own scorekeeper.
    const other = await newProgram(pglite, l.leagueId);
    const otherSeason = await newSeason(pglite, l.leagueId, other);
    const otherStage = await newStage(pglite, l.leagueId, otherSeason);
    const otherRound = await newRound(pglite, l.leagueId, otherSeason, 1);
    const theirs = await newGame(pglite, {
      leagueId: l.leagueId,
      seasonId: otherSeason,
      stageId: otherStage,
      homeTeamId: await newTeam(pglite, l.leagueId, otherSeason),
      awayTeamId: await newTeam(pglite, l.leagueId, otherSeason),
      columns: { ...final(l.at(-400 * day)), round_id: otherRound },
    });
    const programScorekeeper = await grant(l.leagueId, 'scorekeeper', other);

    const owner = await listEarlierGames(l.as(), {}, deps);
    expect(owner.ok && owner.value.rounds).toHaveLength(earlierRoundsLimit);
    expect(owner.ok && owner.value.moreRounds).toBe(true);
    const program = await listEarlierGames(asAccount(l.leagueId, programScorekeeper), {}, deps);
    if (!program.ok) throw new Error(program.error.code);
    expect(program.value.rounds.map((r) => [r.roundId, r.games])).toEqual([[otherRound, 1]]);
    expect(program.value.moreRounds).toBe(false);
    const shown = await listEarlierGames(
      asAccount(l.leagueId, programScorekeeper),
      { round: program.value.rounds[0]?.key ?? '' },
      deps,
    );
    expect(shown.ok && shown.value.shown?.games.map((g) => g.id)).toEqual([theirs]);
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
    const everything = { every: 'all', assigned: 'all' } as const;
    const counted = await withTransaction(db, as, (scope) =>
      listEarlierRounds(scope, l.ownerId, everything, 5),
    );
    expect(counted.map((r) => r.number)).toEqual([30, 29, 28, 27, 26]);
    const round = await withTransaction(db, as, (scope) =>
      listEarlierRound(scope, l.ownerId, everything, { roundId: fourWeeks?.roundId ?? '' }, 3),
    );
    expect(round.games).toHaveLength(3);
  });
});

// Step 2.153 on the database: which of a public page's games the person may score.
describe("a page's games the person may score, on the database", () => {
  it('offers open games only, by the scoring rule, and nothing of a game in the bin', async () => {
    const l = await league();
    const live = await l.gameAt({ starts_at: l.at(60), capture_mode: 'live' });
    // 23:50 tonight in the league's zone, whenever the test runs (S-70: offered all day).
    const box = await l.gameAt({ starts_at: l.at(day - 10), capture_mode: 'box' });
    const decided = await l.gameAt(final(l.at(-day)));
    const binned = await l.gameAt({ starts_at: l.at(day), deleted_at: new Date().toISOString() });
    const keeper = await grant(l.leagueId, 'scorekeeper');
    await pglite.query(
      'insert into game_assignments (league_id, game_id, account_id) values ($1, $2, $3)',
      [l.leagueId, box, keeper],
    );
    const offered = async (account: string) => {
      const r = await listScoringOffers(
        asAccount(l.leagueId, account),
        { gameIds: [decided, box, live, binned] },
        deps,
      );
      return r.ok ? r.value.games : r.error.code;
    };
    expect(await offered(keeper)).toEqual([
      { gameId: box, recording: 'box-score' },
      { gameId: live, recording: 'live' },
    ]);
    const chosen = await setSetting(
      l.as(),
      { level: 'league', key: 'games.whoMayScore', value: 'assignedOnly', version: null },
      deps,
    );
    expect(chosen.ok).toBe(true);
    expect(await offered(keeper)).toEqual([{ gameId: box, recording: 'box-score' }]);
    expect(await offered(l.ownerId)).toHaveLength(2);
    // Someone who scores nowhere here is refused, and so told nothing of any game.
    expect(await offered(await grant(l.leagueId, 'editor'))).toBe('not-allowed');
  });

  it("offers a game from the start of its own day in the league's zone until it has a result (S-70)", async () => {
    // The league keeps America/Chicago, whose day is not UTC's: its days are read by the
    // database's clock in that zone, as the games list reads them.
    const l = await league();
    const tonight = await l.gameAt({ starts_at: l.at(day - 10), capture_mode: 'live' });
    const tomorrow = await l.gameAt({ starts_at: l.at(day + 10), capture_mode: 'live' });
    const yesterday = await l.gameAt({ starts_at: l.at(-day + 19 * 60), capture_mode: 'final' });
    const ahead = await l.gameAt({ starts_at: l.at(3 * day), capture_mode: 'live' });
    const noDate = await l.gameAt({ starts_at: null, capture_mode: 'live' });
    const r = await listScoringOffers(
      l.as(),
      { gameIds: [tonight, tomorrow, yesterday, ahead, noDate] },
      deps,
    );
    expect(r.ok && r.value.games.map((g) => g.gameId)).toEqual([tonight, yesterday]);
  });
});
