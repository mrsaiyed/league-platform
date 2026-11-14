// Step 2.25 against the real database: a rules change after a game is decided shows
// what moves and saves nothing until confirmed (S-1), and adjustments (S-10) change
// the standings in their own transaction. Isolation cases are in ../isolation.
import type { PGlite } from '@electric-sql/pglite';
import {
  addAdjustment,
  eventHandlers,
  previewSeasonRules,
  recordFinalScore,
  removeAdjustment,
  setSeasonRules,
  type CommandDeps,
  type GamesTx,
  type Job,
  type LeaguesTx,
  type StandingsTx,
} from '@srleagues/core';
import { defaultSeasonRules } from '@srleagues/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import {
  freshSchema,
  newGame,
  newLeague,
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
import { standingsStore } from './standings-store.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let deps: CommandDeps<GamesTx & LeaguesTx & StandingsTx>;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  deps = {
    transaction: commandTransaction(db, (scope) => ({
      jobs: { enqueue: async (_job: Job) => {} },
      leagues: leaguesStore(scope),
      divisions: divisionsStore(scope),
      games: gamesStore(scope),
      standings: standingsStore(scope),
      access: accessStore(scope),
      activity: activityLogStore(scope),
    })),
    events: eventHandlers,
    log: () => {},
    now: () => 0,
  };
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

/** Three teams that each won once in a circle, so head-to-head cannot separate them. */
async function playedSeason() {
  const l = await newLeague(pglite);
  const seasonId = await newSeason(pglite, l.leagueId, l.defaultProgramId);
  const teams = [
    await newTeam(pglite, l.leagueId, seasonId),
    await newTeam(pglite, l.leagueId, seasonId),
    await newTeam(pglite, l.leagueId, seasonId),
  ] as const;
  const stageId = await newStage(pglite, l.leagueId, seasonId);
  const ctx = { leagueId: l.leagueId, accountId: l.ownerId, requestId: 'r-1' };
  const results = [
    [0, 1, 60, 50],
    [1, 2, 100, 60],
    [2, 0, 61, 60],
  ] as const;
  for (const [n, [home, away, homeScore, awayScore]] of results.entries()) {
    const gameId = await newGame(pglite, {
      leagueId: l.leagueId,
      seasonId,
      stageId,
      homeTeamId: teams[home],
      awayTeamId: teams[away],
      columns: { starts_at: `2026-12-0${n + 1}T18:00:00Z` },
    });
    const done = await recordFinalScore(ctx, { gameId, version: 1, homeScore, awayScore }, deps);
    expect(done.ok).toBe(true);
  }
  return { ctx, seasonId, teams };
}

const rankOf = async (seasonId: string, teamId: string) =>
  (
    await one<{ rank: number }>(
      pglite,
      'select rank from standings_rows where season_id = $1 and team_id = $2',
      [seasonId, teamId],
    )
  ).rank;
const seasonRow = (seasonId: string) =>
  one<{ rules: unknown; version: number }>(
    pglite,
    'select rules, version from seasons where id = $1',
    [seasonId],
  );
const activityCount = async (leagueId: string) =>
  (
    await one<{ n: number }>(
      pglite,
      "select count(*)::int as n from activity_log where league_id = $1 and action like 'leagues.set_season_rules'",
      [leagueId],
    )
  ).n;

describe('changing the rules after a game is decided (step 2.25)', () => {
  it('lists the teams that move, saves nothing unconfirmed, and saves when confirmed', async () => {
    const s = await playedSeason();
    const rules = defaultSeasonRules();
    rules.tiebreakers = ['head-to-head', 'points-scored'];
    const before = await seasonRow(s.seasonId);
    expect(await rankOf(s.seasonId, s.teams[0])).toBe(2);

    const shown = await previewSeasonRules(s.ctx, { seasonId: s.seasonId, rules }, deps);
    expect(shown).toMatchObject({ ok: true, value: { gamesDecided: true } });
    if (!shown.ok) return;
    expect(shown.value.moves.map((m) => m.teamId).sort()).toEqual([s.teams[0], s.teams[2]].sort());

    const input = { seasonId: s.seasonId, version: before.version, rules };
    expect(await setSeasonRules(s.ctx, input, deps)).toMatchObject({
      error: { code: 'confirmation-needed' },
    });
    expect(await seasonRow(s.seasonId)).toEqual(before);
    expect(await rankOf(s.seasonId, s.teams[0])).toBe(2);
    expect(await activityCount(s.ctx.leagueId)).toBe(0);

    expect(await setSeasonRules(s.ctx, { ...input, confirmed: true }, deps)).toMatchObject({
      ok: true,
    });
    expect((await seasonRow(s.seasonId)).rules).toEqual(rules);
    expect(await rankOf(s.seasonId, s.teams[0])).toBe(3);
    expect(await rankOf(s.seasonId, s.teams[2])).toBe(2);
    expect(await activityCount(s.ctx.leagueId)).toBe(1);
  });
});

describe('standings adjustments (step 2.25)', () => {
  it('adds one, shows it in the standings, and removes it again', async () => {
    const s = await playedSeason();
    const added = await addAdjustment(
      s.ctx,
      {
        seasonId: s.seasonId,
        teamId: s.teams[2],
        wins: -1,
        losses: 1,
        reason: 'Ineligible player',
      },
      deps,
    );
    expect(added).toMatchObject({ ok: true });
    if (!added.ok) return;
    const row = (teamId: string) =>
      one<{ wins: number; losses: number }>(
        pglite,
        'select wins, losses from standings_rows where season_id = $1 and team_id = $2',
        [s.seasonId, teamId],
      );
    expect(await row(s.teams[2])).toEqual({ wins: 0, losses: 2 });

    // One the calculation would leave out is refused and leaves nothing behind.
    const refused = await addAdjustment(
      s.ctx,
      { seasonId: s.seasonId, teamId: s.teams[2], wins: -1, reason: 'Again' },
      deps,
    );
    expect(refused).toMatchObject({ error: { code: 'adjustment-not-counted' } });
    const kept = await one<{ n: number }>(
      pglite,
      'select count(*)::int as n from standings_adjustments where season_id = $1',
      [s.seasonId],
    );
    expect(kept.n).toBe(1);

    const gone = await removeAdjustment(
      s.ctx,
      { seasonId: s.seasonId, adjustmentId: added.value.adjustmentId },
      deps,
    );
    expect(gone).toMatchObject({ ok: true });
    expect(await row(s.teams[2])).toEqual({ wins: 1, losses: 1 });
  });
});
