// Step 2.130 against the real database (PGlite, T-201): "Start a new season" copies the
// last season's setup and, by one choice, its teams (with their lineage) and rosters; the
// new season is hidden and not current; "Archive" makes a season read-only (O-12): the
// writes into it are refused with `season-archived`, and only an admin's correction with
// a reason changes a game in it. Another league can neither start nor archive here.
import type { PGlite } from '@electric-sql/pglite';
import { defaultSeasonRules } from '@srleagues/contracts';
import {
  addToRoster,
  archiveSeason,
  markNotStarted,
  recordFinalScore,
  reopenGame,
  reopenOwnResult,
  setCurrentSeason,
  startSeason,
  updateSeason,
  updateTeam,
  type CommandDeps,
  type GamesTx,
  type Job,
  type LeaguesTx,
  type TeamsTx,
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
  newProgram,
  newPerson,
  newRosterEntry,
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
import { liveGamesStore } from './live-games-store.ts';
import { scoringSessionsStore } from './scoring-sessions-store.ts';
import { teamsStore } from './teams-store.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let deps: CommandDeps<LeaguesTx & TeamsTx & GamesTx & TrackerTx>;
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
const count = async (sql: string, params: unknown[]) =>
  Number((await one<{ n: number | string }>(pglite, sql, params)).n);

/** A league whose current season has rules, a setting, a division, two teams and rosters. */
async function lastSeason() {
  const league = await newLeague(pglite);
  const owner = as(league.leagueId, league.ownerId);
  const seasonId = await newSeason(pglite, league.leagueId, league.defaultProgramId, {
    isCurrent: true,
  });
  // A season that ran, shown to visitors (a hidden one cannot be archived, T-388).
  await pglite.query(
    `update seasons set status = 'active', rules = $2::jsonb, stat_keys = $3 where id = $1`,
    [seasonId, JSON.stringify(defaultSeasonRules()), ['points']],
  );
  await pglite.query(
    `insert into setting_values (league_id, level, season_id, key, value)
     values ($1, 'season', $2, 'madeup.key', '{"version":1,"value":3}')`,
    [league.leagueId, seasonId],
  );
  const divisionId = await newDivision(pglite, league.leagueId, seasonId, { name: 'East' });
  const home = await newTeam(pglite, league.leagueId, seasonId, { divisionId });
  const away = await newTeam(pglite, league.leagueId, seasonId);
  const stays = await newPerson(pglite, league.leagueId);
  const left = await newPerson(pglite, league.leagueId);
  await newRosterEntry(pglite, league.leagueId, home, stays, { jersey: '7' });
  const gone = await newRosterEntry(pglite, league.leagueId, home, left);
  await pglite.query(`update roster_entries set left_on = '2026-10-01' where id = $1`, [gone]);
  return { league, owner, seasonId, home, away, stays };
}

const start = (
  owner: ReturnType<typeof as>,
  slug: string,
  carry: 'nothing' | 'teams' | 'teams-and-rosters',
) => startSeason(owner, { slug, name: 'Winter 2027', startsOn: '2027-01-05', carry }, deps);

describe('starting a new season (step 2.130)', () => {
  it('carries the teams with their lineage and leaves the rosters behind, hidden and not current', async () => {
    const { owner, seasonId, home } = await lastSeason();
    const started = await start(owner, 'winter-2027', 'teams');
    if (!started.ok) throw new Error(started.error.code);
    expect(started.value.copiedFromSeasonId).toBe(seasonId);
    expect(started.value.copied).toEqual({ divisions: 1, teams: 2, rosterEntries: 0 });
    // Its settings stay behind: only the settings commands write one (record 065).
    expect(
      await count('select count(*) as n from setting_values where season_id = $1', [
        started.value.seasonId,
      ]),
    ).toBe(0);
    const made = await one<{
      status: string;
      is_current: boolean;
      rules: unknown;
      stat_keys: string[];
    }>(pglite, 'select status, is_current, rules, stat_keys from seasons where id = $1', [
      started.value.seasonId,
    ]);
    expect(made).toEqual({
      status: 'draft',
      is_current: false,
      rules: defaultSeasonRules(),
      stat_keys: ['points'],
    });
    const carried = await one<{ lineage_id: string; division: string | null }>(
      pglite,
      `select t.lineage_id, d.name as division from teams t
       left join divisions d on d.id = t.division_id
       where t.season_id = $1 and t.lineage_id = (select lineage_id from teams where id = $2)`,
      [started.value.seasonId, home],
    );
    expect(carried.division).toBe('East');
    expect(
      await count(
        `select count(*) as n from roster_entries r join teams t on t.id = r.team_id
         where t.season_id = $1`,
        [started.value.seasonId],
      ),
    ).toBe(0);
  });

  it('carries the rosters too when asked, without the player who left', async () => {
    const { owner, stays } = await lastSeason();
    const started = await start(owner, 'winter-2027', 'teams-and-rosters');
    if (!started.ok) throw new Error(started.error.code);
    expect(started.value.copied.rosterEntries).toBe(1);
    const entry = await one<{ person_id: string; jersey_number: string }>(
      pglite,
      `select r.person_id, r.jersey_number from roster_entries r join teams t on t.id = r.team_id
       where t.season_id = $1`,
      [started.value.seasonId],
    );
    expect(entry).toEqual({ person_id: stays, jersey_number: '7' });
  });

  it('starts fresh with nothing carried, and in a league with no current season copies nothing', async () => {
    const { owner } = await lastSeason();
    const fresh = await start(owner, 'fresh', 'nothing');
    if (!fresh.ok) throw new Error(fresh.error.code);
    expect(fresh.value.copied.teams).toBe(0);
    const empty = await newLeague(pglite);
    const first = await start(as(empty.leagueId, empty.ownerId), 'first', 'teams-and-rosters');
    if (!first.ok) throw new Error(first.error.code);
    expect(first.value).toMatchObject({
      copiedFromSeasonId: null,
      copied: { divisions: 0, teams: 0, rosterEntries: 0 },
    });
    expect((await start(owner, 'fresh', 'nothing')).ok).toBe(false);
  });

  it("starts the season in the program it names, copying that program's current season and teams", async () => {
    const { league, owner, seasonId } = await lastSeason();
    const programB = await newProgram(pglite, league.leagueId);
    const seasonB = await newSeason(pglite, league.leagueId, programB, { isCurrent: true });
    await newTeam(pglite, league.leagueId, seasonB);
    const before = await pglite.query(
      'select id, status, is_current from seasons where program_id = $1 order by id',
      [league.defaultProgramId],
    );
    const started = await startSeason(
      owner,
      { programId: programB, slug: 'b-next', name: 'B next', carry: 'teams' },
      deps,
    );
    if (!started.ok) throw new Error(started.error.code);
    expect(started.value.copiedFromSeasonId).toBe(seasonB);
    expect(started.value.copied.teams).toBe(1);
    expect(
      await one(pglite, 'select program_id from seasons where id = $1', [started.value.seasonId]),
    ).toEqual({ program_id: programB });
    // The default program's seasons are as they were: none added, its current one kept.
    expect(
      (
        await pglite.query(
          'select id, status, is_current from seasons where program_id = $1 order by id',
          [league.defaultProgramId],
        )
      ).rows,
    ).toEqual(before.rows);
    expect(await one(pglite, 'select is_current from seasons where id = $1', [seasonId])).toEqual({
      is_current: true,
    });
  });

  it('lets another league neither start a season in this program nor archive this season', async () => {
    const { league, seasonId } = await lastSeason();
    const other = await newLeague(pglite);
    const stranger = as(other.leagueId, other.ownerId);
    const started = await startSeason(
      stranger,
      { programId: league.defaultProgramId, slug: 'theirs', name: 'Theirs', carry: 'teams' },
      deps,
    );
    expect(started).toEqual({ ok: false, error: { code: 'program-not-found' } });
    expect(await archiveSeason(stranger, { seasonId, version: 1 }, deps)).toEqual({
      ok: false,
      error: { code: 'season-not-found' },
    });
    expect(
      await count('select count(*) as n from seasons where league_id = $1', [league.leagueId]),
    ).toBe(1);
  });
});

describe('an archived season is read-only (O-12)', () => {
  async function archived() {
    const made = await lastSeason();
    const stageId = await newStage(pglite, made.league.leagueId, made.seasonId);
    const game = (columns?: Record<string, unknown>) =>
      newGame(pglite, {
        leagueId: made.league.leagueId,
        seasonId: made.seasonId,
        stageId,
        homeTeamId: made.home,
        awayTeamId: made.away,
        ...(columns === undefined ? {} : { columns }),
      });
    const scheduled = await game();
    const final = await game({
      status: 'final',
      home_score: 50,
      away_score: 40,
      finalized_at: '2026-10-01T20:00:00Z',
    });
    const live = await game({ status: 'live' });
    const archivedNow = await archiveSeason(
      made.owner,
      {
        seasonId: made.seasonId,
        version: (
          await one<{ version: number }>(pglite, 'select version from seasons where id = $1', [
            made.seasonId,
          ])
        ).version,
      },
      deps,
    );
    if (!archivedNow.ok) throw new Error(archivedNow.error.code);
    return { ...made, scheduled, final, live, seasonVersion: archivedNow.value.version };
  }
  const refused = { ok: false, error: { code: 'season-archived' } };

  it('refuses a result, a scorekeeper reopen, mark not started, team, roster and season edits', async () => {
    const s = await archived();
    expect(
      await recordFinalScore(
        s.owner,
        { gameId: s.scheduled, version: 1, homeScore: 1, awayScore: 0 },
        deps,
      ),
    ).toEqual(refused);
    expect(
      await reopenOwnResult(s.owner, { gameId: s.final, version: 1, reason: 'Wrong card' }, deps),
    ).toEqual(refused);
    expect(await markNotStarted(s.owner, { gameId: s.live, sequence: 0 }, deps)).toEqual(refused);
    expect(
      await updateTeam(s.owner, { teamId: s.home, version: 1, name: 'New name' }, deps),
    ).toEqual(refused);
    const person = await newPerson(pglite, s.league.leagueId);
    expect(await addToRoster(s.owner, { teamId: s.home, personId: person }, deps)).toEqual(refused);
    expect(
      await updateSeason(
        s.owner,
        { seasonId: s.seasonId, version: s.seasonVersion, name: 'X' },
        deps,
      ),
    ).toEqual(refused);
    // Being current is a mark, not content (S-99).
    expect(
      (await setCurrentSeason(s.owner, { seasonId: s.seasonId, version: s.seasonVersion }, deps))
        .ok,
    ).toBe(true);
  });

  it("changes a game only by an admin's correction with a reason, then takes its result again", async () => {
    const s = await archived();
    const reopened = await reopenGame(
      s.owner,
      { gameId: s.final, version: 1, reason: 'Wrong score' },
      deps,
    );
    if (!reopened.ok) throw new Error(reopened.error.code);
    const { version } = await one<{ version: number }>(
      pglite,
      'select version from games where id = $1',
      [s.final],
    );
    const entered = await recordFinalScore(
      s.owner,
      { gameId: s.final, version, homeScore: 51, awayScore: 40 },
      deps,
    );
    expect(entered.ok).toBe(true);
    expect(
      await one(pglite, 'select status, home_score from games where id = $1', [s.final]),
    ).toEqual({ status: 'final', home_score: 51 });
  });
});

describe('a hidden season cannot be archived (T-388)', () => {
  it('refuses season-hidden and leaves it hidden from visitors', async () => {
    const league = await newLeague(pglite);
    const owner = as(league.leagueId, league.ownerId);
    const hidden = await newSeason(pglite, league.leagueId, league.defaultProgramId);
    const row = await one<{ status: string; version: number }>(
      pglite,
      'select status, version from seasons where id = $1',
      [hidden],
    );
    expect(row.status).toBe('draft');
    expect(await archiveSeason(owner, { seasonId: hidden, version: row.version }, deps)).toEqual({
      ok: false,
      error: { code: 'season-hidden' },
    });
    expect(await one(pglite, 'select status from seasons where id = $1', [hidden])).toEqual({
      status: 'draft',
    });
  });
});
