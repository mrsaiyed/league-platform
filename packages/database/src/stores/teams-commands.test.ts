// Step 2.18's commands against the real database: each call is one transaction
// (commandTransaction), committed on success and rolled back on a refusal. Covers a
// team's short name being unique in its season, the lineage a new team gets, the bin,
// and a division refusing removal while teams are in it. Isolation cases are in ../isolation.
import type { PGlite } from '@electric-sql/pglite';
import {
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
import { freshSchema, newLeague, newSeason, one } from '../schema/schema.test-helper.ts';
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
