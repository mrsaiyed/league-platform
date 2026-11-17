// Step 2.18's commands against the real database: each call is one transaction
// (commandTransaction), committed on success and rolled back on a refusal. Covers a
// team's short name being unique in its season, the lineage a new team gets, the bin,
// and a division refusing removal while teams are in it. Isolation cases are in ../isolation.
import type { PGlite } from '@electric-sql/pglite';
import {
  countTeamGames,
  createDivision,
  createTeam,
  removeDivision,
  removeTeam,
  setTeamStatsVisibility,
  updateTeam,
  type CommandDeps,
  type Job,
  type LeaguesTx,
  type TeamsTx,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import {
  freshSchema,
  newAccount,
  newLeague,
  newGame,
  newRound,
  newSeason,
  newStage,
  newTeam,
  one,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { divisionsStore } from './divisions-store.ts';
import { leaguesStore } from './leagues-store.ts';
import { teamsStore } from './teams-store.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let deps: CommandDeps<TeamsTx>;
let leaguesDeps: CommandDeps<LeaguesTx>;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  const transaction = commandTransaction(db, (scope) => ({
    jobs: { enqueue: async (_job: Job) => {} },
    leagues: leaguesStore(scope),
    divisions: divisionsStore(scope),
    teams: teamsStore(scope),
    access: accessStore(scope),
    activity: activityLogStore(scope),
  }));
  const rest = { events: [], log: () => {}, now: () => 0 };
  deps = { transaction, ...rest };
  leaguesDeps = { transaction, ...rest };
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

async function league() {
  const made = await newLeague(pglite);
  const seasonId = await newSeason(pglite, made.leagueId, made.defaultProgramId);
  return {
    ...made,
    seasonId,
    as: { leagueId: made.leagueId, accountId: made.ownerId, requestId: 'r-1' },
  };
}

function value<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`refused: ${result.error.code}`);
  return result.value;
}

const teamRow = (id: string) =>
  one<{
    name: string;
    slug: string;
    color: string | null;
    stats_visibility: string;
    lineage_id: string;
    deleted_at: Date | null;
    version: number;
  }>(
    pglite,
    'select name, slug, color, stats_visibility, lineage_id, deleted_at, version from teams where id = $1',
    [id],
  );

const hawks = { name: 'Hawks', shortName: 'hawks', statsVisibility: 'everyone' as const };

describe('teams', () => {
  it('adds a team with its own lineage, edits it and sets who sees its numbers', async () => {
    const l = await league();
    const a = value(
      await createTeam(l.as, { ...hawks, seasonId: l.seasonId, color: '#ABCDEF' }, deps),
    );
    const b = value(
      await createTeam(
        l.as,
        { ...hawks, seasonId: l.seasonId, name: 'Owls', shortName: 'owls' },
        deps,
      ),
    );
    const first = await teamRow(a.teamId);
    expect(first).toMatchObject({ slug: 'hawks', color: '#abcdef', stats_visibility: 'everyone' });
    expect(first.lineage_id).not.toBe((await teamRow(b.teamId)).lineage_id);

    value(
      await updateTeam(l.as, { teamId: a.teamId, version: 1, name: 'Falcons', color: null }, deps),
    );
    value(
      await setTeamStatsVisibility(
        l.as,
        { teamId: a.teamId, version: 2, statsVisibility: 'staff' },
        deps,
      ),
    );
    expect(await teamRow(a.teamId)).toMatchObject({
      name: 'Falcons',
      color: null,
      stats_visibility: 'staff',
      version: 3,
    });
    const log = await pglite.query<{ action: string }>(
      'select action from activity_log where league_id = $1 and action like $2',
      [l.leagueId, 'teams.%'],
    );
    expect(log.rows.map((r) => r.action).sort()).toEqual([
      'teams.create_team',
      'teams.create_team',
      'teams.set_stats_visibility',
      'teams.update_team',
    ]);
  });

  it("keeps a team's short name unique in its season, outside the bin", async () => {
    const l = await league();
    const otherSeason = await newSeason(pglite, l.leagueId, l.defaultProgramId);
    const a = value(await createTeam(l.as, { ...hawks, seasonId: l.seasonId }, deps));
    expect(await createTeam(l.as, { ...hawks, name: 'Other', seasonId: l.seasonId }, deps)).toEqual(
      { ok: false, error: { code: 'team-short-name-taken' } },
    );
    expect(
      await createTeam(
        l.as,
        { ...hawks, shortName: 'x', name: 'HAWKS', seasonId: l.seasonId },
        deps,
      ),
    ).toEqual({ ok: false, error: { code: 'team-name-taken' } });
    // Another season may reuse both.
    value(await createTeam(l.as, { ...hawks, seasonId: otherSeason }, deps));
    // A team in the bin lets them go.
    value(await removeTeam(l.as, { teamId: a.teamId }, deps));
    expect((await teamRow(a.teamId)).deleted_at).not.toBeNull();
    value(await createTeam(l.as, { ...hawks, seasonId: l.seasonId }, deps));
    // Changing a short name to one a team has is refused and leaves the team as it was.
    const c = value(
      await createTeam(l.as, { ...hawks, shortName: 'c', name: 'C', seasonId: l.seasonId }, deps),
    );
    expect(
      await updateTeam(l.as, { teamId: c.teamId, version: 1, shortName: 'hawks' }, deps),
    ).toEqual({
      ok: false,
      error: { code: 'team-short-name-taken' },
    });
    expect((await teamRow(c.teamId)).slug).toBe('c');
  });

  it('refuses removing a division while a team not in the bin is in it', async () => {
    const l = await league();
    const { divisionId } = value(
      await createDivision(l.as, { seasonId: l.seasonId, name: 'Gold' }, leaguesDeps),
    );
    const { teamId } = value(
      await createTeam(l.as, { ...hawks, seasonId: l.seasonId, divisionId }, deps),
    );
    expect(await removeDivision(l.as, { divisionId }, leaguesDeps)).toEqual({
      ok: false,
      error: { code: 'division-has-teams' },
    });
    value(await removeTeam(l.as, { teamId }, deps));
    value(await removeDivision(l.as, { divisionId }, leaguesDeps));
  });
});

describe('a team with games stays out of the bin (A-17)', () => {
  /** A league's two teams and a stage, and a game between them in a state. */
  async function twoTeams() {
    const l = await league();
    const stageId = await newStage(pglite, l.leagueId, l.seasonId);
    const a = await newTeam(pglite, l.leagueId, l.seasonId, { slug: 'a', name: 'A' });
    const b = await newTeam(pglite, l.leagueId, l.seasonId, { slug: 'b', name: 'B' });
    const game = (status: string, home = a, away = b, columns: Record<string, unknown> = {}) =>
      newGame(pglite, {
        leagueId: l.leagueId,
        seasonId: l.seasonId,
        stageId,
        homeTeamId: home,
        awayTeamId: away,
        columns: {
          status,
          ...(status === 'final' || status === 'forfeit'
            ? { home_score: 50, away_score: 40, finalized_at: new Date().toISOString() }
            : {}),
          ...columns,
        },
      });
    return { ...l, a, b, game };
  }
  const binned = async (teamId: string) => (await teamRow(teamId)).deleted_at !== null;

  it('counts the games to play and the results, leaving out cancelled ones and the bin', async () => {
    const l = await twoTeams();
    const roundId = await newRound(pglite, l.leagueId, l.seasonId, 4);
    // A day in the league's own zone and the round's number; a game with neither last.
    await l.game('scheduled', l.a, l.b, { starts_at: '2026-12-06T18:00:00Z', round_id: roundId });
    await l.game('postponed', l.b, l.a);
    await l.game('final');
    await l.game('cancelled');
    await l.game('scheduled', l.a, l.b, { deleted_at: new Date().toISOString() });
    expect(await countTeamGames(l.as, { teamId: l.a }, deps)).toEqual({
      ok: true,
      value: {
        played: 1,
        toPlay: 2,
        removedInDraft: 0,
        which: [
          { date: '2026-12-06', round: 4 },
          { date: null, round: null },
        ],
      },
    });
  });

  it('refuses a team with a game still to play, and names how many', async () => {
    const l = await twoTeams();
    await l.game('scheduled');
    await l.game('postponed', l.b, l.a);
    expect(await removeTeam(l.as, { teamId: l.a }, deps)).toEqual({
      ok: false,
      error: { code: 'team-has-games-to-play', toPlay: 2 },
    });
    expect(await binned(l.a)).toBe(false);
  });

  it("refuses a team whose game to come is only in its season's schedule draft", async () => {
    const l = await twoTeams();
    const changes = {
      version: 1,
      changes: [
        {
          kind: 'add-game',
          game: {
            id: 'draft-game-1',
            roundId: null,
            date: '2026-12-01',
            time: null,
            venueId: null,
            court: null,
            homeTeamId: l.b,
            awayTeamId: l.a,
            status: 'scheduled',
          },
        },
      ],
    };
    await pglite.query(
      'insert into schedule_drafts (league_id, season_id, changes) values ($1, $2, $3)',
      [l.leagueId, l.seasonId, JSON.stringify(changes)],
    );
    expect(await removeTeam(l.as, { teamId: l.a }, deps)).toEqual({
      ok: false,
      error: { code: 'team-has-games-to-play', toPlay: 1 },
    });
    expect(await binned(l.a)).toBe(false);
  });

  it('refuses a team with a final or forfeited result', async () => {
    const l = await twoTeams();
    await l.game('final');
    await l.game('forfeit', l.b, l.a);
    expect(await removeTeam(l.as, { teamId: l.a }, deps)).toEqual({
      ok: false,
      error: { code: 'team-has-results', played: 2 },
    });
    expect(await binned(l.a)).toBe(false);
  });

  it('moves a team whose only games are cancelled, as before', async () => {
    const l = await twoTeams();
    await l.game('cancelled');
    value(await removeTeam(l.as, { teamId: l.a }, deps));
    expect(await binned(l.a)).toBe(true);
  });
});

describe("the league's statistics-level settings on the database (S-22, S-23, S-24)", () => {
  const setLeagueValue = (leagueId: string, key: string, value: unknown) =>
    pglite.query(
      `insert into setting_values (league_id, level, key, value) values ($1, 'league', $2, $3)`,
      [leagueId, key, JSON.stringify({ version: 1, value })],
    );

  it("starts a new team at its own league's level, not another league's", async () => {
    const a = await league();
    const b = await league();
    await setLeagueValue(a.leagueId, 'teams.startingStatsLevel', 'staff');
    const inA = value(
      await createTeam(a.as, { name: 'Hawks', shortName: 'hawks', seasonId: a.seasonId }, deps),
    );
    const inB = value(
      await createTeam(b.as, { name: 'Hawks', shortName: 'hawks', seasonId: b.seasonId }, deps),
    );
    expect((await teamRow(inA.teamId)).stats_visibility).toBe('staff');
    expect((await teamRow(inB.teamId)).stats_visibility).toBe('everyone');
  });

  it("refuses a program's admin when choosing is off in that league only, never the owner", async () => {
    const a = await league();
    const b = await league();
    await setLeagueValue(a.leagueId, 'teams.mayChooseStatsLevel', false);
    const teamA = value(await createTeam(a.as, { ...hawks, seasonId: a.seasonId }, deps));
    const teamB = value(await createTeam(b.as, { ...hawks, seasonId: b.seasonId }, deps));
    const adminId = await newAccount(pglite);
    await pglite.query(
      `insert into role_grants (league_id, account_id, role, scope_type, scope_id, granted_by_account_id)
       values ($1, $2, 'admin', 'program', $3, $4)`,
      [a.leagueId, adminId, a.defaultProgramId, a.ownerId],
    );
    const programAdmin = { ...a.as, accountId: adminId };
    const change = (teamId: string) => ({ teamId, version: 1, statsVisibility: 'staff' as const });
    expect(await setTeamStatsVisibility(programAdmin, change(teamA.teamId), deps)).toMatchObject({
      error: { code: 'teams-may-not-choose' },
    });
    expect(await setTeamStatsVisibility(a.as, change(teamA.teamId), deps)).toMatchObject({
      ok: true,
    });
    expect(await setTeamStatsVisibility(b.as, change(teamB.teamId), deps)).toMatchObject({
      ok: true,
    });
  });
});
