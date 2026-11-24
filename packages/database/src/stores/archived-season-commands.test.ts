// Step 2.130 against the real database (PGlite, T-201): an archived season is read-only
// (O-12). A game in it changes only while an admin's correction with a reason is open on
// it (T-381); its divisions, its own settings, what of it is in the bin and imports into
// it are refused with `season-archived`, while the league's own settings stay open and the
// put back, itself a correction with a reason, is not refused for the season (T-380). The
// reads that tell a page which buttons to show say `season-archived` too.
import type { PGlite } from '@electric-sql/pglite';
import {
  applyFixtureImport,
  archiveSeason,
  clearSetting,
  putSheetBack,
  readGameFormat,
  readOwnResultOffer,
  readOwnResultOffers,
  recordFinalScore,
  recordImportedScores,
  removeDivision,
  reopenGame,
  reorderDivisions,
  restoreDivision,
  restoreGame,
  restoreTeam,
  setSetting,
  startFixtureImport,
  undoFixtureImport,
  updateDivision,
  type CommandDeps,
  type ImportScoresTx,
  type Job,
  type LeaguesTx,
  type RestoreGameTx,
  type TrackerTx,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import {
  freshSchema,
  newDivision,
  newGame,
  newLeague,
  newSeason,
  newStage,
  newTeam,
  one,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { binStore } from './bin-store.ts';
import { divisionsStore } from './divisions-store.ts';
import { gamesStore } from './games-store.ts';
import { importsStore } from './imports-store.ts';
import { leaguesStore } from './leagues-store.ts';
import { liveGamesStore } from './live-games-store.ts';
import { schedulingStore } from './scheduling-store.ts';
import { scoringSessionsStore } from './scoring-sessions-store.ts';
import { teamsStore } from './teams-store.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let deps: CommandDeps<LeaguesTx & TrackerTx & RestoreGameTx & ImportScoresTx>;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  deps = {
    transaction: commandTransaction(db, (scope) => ({
      jobs: { enqueue: async (_job: Job) => {} },
      leagues: leaguesStore(scope),
      divisions: divisionsStore(scope),
      games: gamesStore(scope),
      liveGames: liveGamesStore(scope),
      scoringSessions: scoringSessionsStore(scope),
      scheduling: schedulingStore(scope),
      imports: importsStore(scope),
      bin: binStore(scope),
      clock: { now: () => Date.now() },
      teams: teamsStore(scope),
      access: accessStore(scope),
      activity: activityLogStore(scope),
    })),
    events: [],
    log: () => {},
    now: () => 0,
  };
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const as = (leagueId: string, accountId: string) => ({ leagueId, accountId, requestId: 'r-1' });
const refused = { ok: false, error: { code: 'season-archived' } };
const versionOf = async (table: 'games' | 'seasons' | 'divisions', id: string) =>
  (await one<{ version: number }>(pglite, `select version from ${table} where id = $1`, [id]))
    .version;
const fixtures = 'Date,Time,Home,Away\n2027-01-02,18:00,Home,Away\n';

/** A current season with a division, two teams, a final game and a scheduled one. */
async function aSeason() {
  const league = await newLeague(pglite);
  const owner = as(league.leagueId, league.ownerId);
  const seasonId = await newSeason(pglite, league.leagueId, league.defaultProgramId, {
    isCurrent: true,
  });
  const divisionId = await newDivision(pglite, league.leagueId, seasonId, { name: 'East' });
  const home = await newTeam(pglite, league.leagueId, seasonId, { divisionId });
  const away = await newTeam(pglite, league.leagueId, seasonId);
  const stageId = await newStage(pglite, league.leagueId, seasonId);
  const game = (columns?: Record<string, unknown>) =>
    newGame(pglite, {
      leagueId: league.leagueId,
      seasonId,
      stageId,
      homeTeamId: home,
      awayTeamId: away,
      ...(columns === undefined ? {} : { columns }),
    });
  const final = await game({
    status: 'final',
    home_score: 50,
    away_score: 40,
    finalized_at: '2026-10-01T20:00:00Z',
  });
  const scheduled = await game();
  const archive = async () => {
    const done = await archiveSeason(
      owner,
      { seasonId, version: await versionOf('seasons', seasonId) },
      deps,
    );
    if (!done.ok) throw new Error(done.error.code);
  };
  return { league, owner, seasonId, divisionId, home, away, final, scheduled, game, archive };
}

describe('a game in an archived season changes only while a correction is open on it (T-381)', () => {
  it('refuses a game corrected before archiving, takes a result after a reopening with a reason, then refuses again', async () => {
    const s = await aSeason();
    const reason = 'Wrong score';
    // Corrected and decided again while the season ran.
    const before = await reopenGame(s.owner, { gameId: s.final, version: 1, reason }, deps);
    if (!before.ok) throw new Error(before.error.code);
    const again = await recordFinalScore(
      s.owner,
      { gameId: s.final, version: await versionOf('games', s.final), homeScore: 51, awayScore: 40 },
      deps,
    );
    if (!again.ok) throw new Error(again.error.code);
    await s.archive();
    const enter = async (homeScore: number) =>
      recordFinalScore(
        s.owner,
        { gameId: s.final, version: await versionOf('games', s.final), homeScore, awayScore: 40 },
        deps,
      );
    expect(await enter(52)).toEqual(refused);
    const reopened = await reopenGame(
      s.owner,
      { gameId: s.final, version: await versionOf('games', s.final), reason },
      deps,
    );
    expect(reopened.ok).toBe(true);
    expect((await enter(53)).ok).toBe(true);
    expect(await enter(54)).toEqual(refused);
    expect(
      await one(pglite, 'select status, home_score from games where id = $1', [s.final]),
    ).toEqual({ status: 'final', home_score: 53 });
  });
});

describe('the rest of an archived season is read-only (O-12)', () => {
  it('refuses division edits, removal, order and restore', async () => {
    const s = await aSeason();
    const binned = await newDivision(pglite, s.league.leagueId, s.seasonId, { name: 'Gone' });
    await pglite.query('update divisions set deleted_at = now() where id = $1', [binned]);
    await s.archive();
    const divisionId = s.divisionId;
    expect(await updateDivision(s.owner, { divisionId, version: 1, name: 'West' }, deps)).toEqual(
      refused,
    );
    expect(await removeDivision(s.owner, { divisionId }, deps)).toEqual(refused);
    expect(
      await reorderDivisions(s.owner, { seasonId: s.seasonId, divisionIds: [divisionId] }, deps),
    ).toEqual(refused);
    expect(await restoreDivision(s.owner, { divisionId: binned }, deps)).toEqual(refused);
    expect(await one(pglite, 'select name from divisions where id = $1', [divisionId])).toEqual({
      name: 'East',
    });
  });

  it("refuses a season's own settings, and leaves the league's open", async () => {
    const s = await aSeason();
    const key = 'games.scorekeeperReopenMinutes';
    await s.archive();
    const season = { level: 'season' as const, seasonId: s.seasonId };
    expect(await setSetting(s.owner, { ...season, key, value: 5, version: null }, deps)).toEqual(
      refused,
    );
    expect(await clearSetting(s.owner, { ...season, key, version: 1 }, deps)).toEqual(refused);
    const league = await setSetting(
      s.owner,
      { level: 'league', key, value: 5, version: null },
      deps,
    );
    expect(league.ok).toBe(true);
  });

  it('refuses bringing its team or game back from the bin', async () => {
    const s = await aSeason();
    const team = await newTeam(pglite, s.league.leagueId, s.seasonId);
    await pglite.query('update teams set deleted_at = now() where id = $1', [team]);
    const game = await s.game();
    await pglite.query('update games set deleted_at = now() where id = $1', [game]);
    await s.archive();
    expect(await restoreTeam(s.owner, { teamId: team }, deps)).toEqual(refused);
    expect(await restoreGame(s.owner, { gameId: game }, deps)).toEqual(refused);
  });

  it('refuses an import into it: starting, applying, recording its scores, undoing', async () => {
    const s = await aSeason();
    const started = await startFixtureImport(
      s.owner,
      { seasonId: s.seasonId, fileName: null, fileText: fixtures },
      deps,
    );
    if (!started.ok) throw new Error(started.error.code);
    const importId = started.value.importId;
    await s.archive();
    expect(
      await startFixtureImport(
        s.owner,
        { seasonId: s.seasonId, fileName: null, fileText: fixtures },
        deps,
      ),
    ).toEqual(refused);
    expect(await applyFixtureImport(s.owner, { importId, version: 1 }, deps)).toEqual(refused);
    expect(await recordImportedScores(s.owner, { importId }, deps)).toEqual(refused);
    expect(await undoFixtureImport(s.owner, { importId, version: 1 }, deps)).toEqual(refused);
  });

  it('does not refuse the put back for the season: it is a correction with a reason (T-380)', async () => {
    const s = await aSeason();
    await s.archive();
    // No reopen kept a sheet here, so the put back's own rule answers, not the season.
    expect(
      await putSheetBack(s.owner, { gameId: s.final, version: 1, reason: 'Wrong sheet' }, deps),
    ).toEqual({ ok: false, error: { code: 'no-sheet-kept' } });
  });
});

describe('the reads that offer a button say season-archived (O-12)', () => {
  it("offers neither a scorekeeper's own reopen nor the game's rules in an archived season", async () => {
    const s = await aSeason();
    const open = await readGameFormat(s.owner, { gameId: s.scheduled }, deps);
    expect(open).toMatchObject({ ok: true, value: { change: { may: true } } });
    await s.archive();
    expect(await readOwnResultOffer(s.owner, { gameId: s.final }, deps)).toMatchObject({
      ok: true,
      value: { reopen: { when: 'no', code: 'season-archived' } },
    });
    expect(await readOwnResultOffers(s.owner, { gameIds: [s.final] }, deps)).toEqual({
      ok: true,
      value: [{ gameId: s.final, reopen: { when: 'no', code: 'season-archived' } }],
    });
    expect(await readGameFormat(s.owner, { gameId: s.scheduled }, deps)).toMatchObject({
      ok: true,
      value: { change: { may: false, reason: 'season-archived' } },
    });
  });
});
