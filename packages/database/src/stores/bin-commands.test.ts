// Step 2.76's bin against the real database: listing what was removed, restoring it, and
// the nightly emptying with a clock the test controls. Isolation cases are in ../isolation.
import type { PGlite } from '@electric-sql/pglite';
import {
  addToRoster,
  createPerson,
  createTeam,
  emptyBin,
  listBin,
  listRoster,
  removePerson,
  removeTeam,
  restoreGame,
  restorePerson,
  restoreTeam,
  type BinTx,
  type CommandDeps,
  type Job,
  type PeopleTx,
  type TeamsTx,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { freshSchema, newLeague, newSeason, one } from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { binStore } from './bin-store.ts';
import { peopleStore } from './people-store.ts';
import { teamsStore } from './teams-store.ts';

type Tx = BinTx & TeamsTx & PeopleTx;

let pglite: PGlite;
let db: DatabaseHandle;
let deps: CommandDeps<Tx>;
let run: ReturnType<typeof commandTransaction<Tx>>;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  run = commandTransaction(db, (scope) => ({
    jobs: { enqueue: async (_job: Job) => {} },
    bin: binStore(scope),
    teams: teamsStore(scope),
    people: peopleStore(scope),
    access: accessStore(scope),
    activity: activityLogStore(scope),
  }));
  deps = { transaction: run, events: [], log: () => {}, now: () => 0 };
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

const hawks = { name: 'Hawks', shortName: 'hawks', statsVisibility: 'everyone' as const };
const day = 24 * 60 * 60 * 1000;
const now = new Date('2026-06-30T12:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * day).toISOString();

const age = (
  table: 'teams' | 'people' | 'venues' | 'courts' | 'divisions',
  id: string,
  days: number,
) => pglite.query(`update ${table} set deleted_at = $2 where id = $1`, [id, daysAgo(days)]);

const exists = async (table: string, id: string) =>
  (await pglite.query(`select 1 from ${table} where id = $1`, [id])).rows.length === 1;

/** The nightly job's own step for one league: no account, the clock it was given. */
const nightly = (l: { leagueId: string }, at: Date) => {
  const context = { leagueId: l.leagueId, accountId: null, requestId: 'job-1' };
  return run(context, (tx) => emptyBin(tx, context, at));
};

describe('the bin: restoring', () => {
  it('brings back a team with its roster, and lists it while it is in the bin', async () => {
    const l = await league();
    const { teamId } = value(await createTeam(l.as, { ...hawks, seasonId: l.seasonId }, deps));
    const { personId } = value(
      await createPerson(l.as, { firstName: 'Sam', lastName: 'Player' }, deps),
    );
    value(await addToRoster(l.as, { teamId, personId, jerseyNumber: '7' }, deps));
    value(await removeTeam(l.as, { teamId }, deps));

    const listed = value(await listBin(l.as, {}, deps));
    expect(listed.items.map((i) => [i.kind, i.id, i.name])).toEqual([['team', teamId, 'Hawks']]);
    expect(listed.keepDays).toBe(30);

    value(await restoreTeam(l.as, { teamId }, deps));
    expect(value(await listBin(l.as, {}, deps)).items).toEqual([]);
    const roster = value(await listRoster(l.as, { teamId }, deps));
    expect(roster.map((r) => [r.personId, r.jerseyNumber])).toEqual([[personId, '7']]);
  });

  it('says plainly when the short name was taken meanwhile, and leaves the team in the bin', async () => {
    const l = await league();
    const { teamId } = value(await createTeam(l.as, { ...hawks, seasonId: l.seasonId }, deps));
    value(await removeTeam(l.as, { teamId }, deps));
    value(await createTeam(l.as, { ...hawks, name: 'Other', seasonId: l.seasonId }, deps));
    expect(await restoreTeam(l.as, { teamId }, deps)).toEqual({
      ok: false,
      error: { code: 'team-short-name-taken' },
    });
    expect(value(await listBin(l.as, {}, deps)).items).toHaveLength(1);
  });

  it('says plainly when another team of the season now carries on the same team', async () => {
    const l = await league();
    const { teamId } = value(await createTeam(l.as, { ...hawks, seasonId: l.seasonId }, deps));
    value(await removeTeam(l.as, { teamId }, deps));
    const other = value(
      await createTeam(
        l.as,
        { ...hawks, name: 'Other', shortName: 'other', seasonId: l.seasonId },
        deps,
      ),
    ).teamId;
    await pglite.query(
      'update teams set lineage_id = (select lineage_id from teams where id = $1) where id = $2',
      [teamId, other],
    );
    expect(await restoreTeam(l.as, { teamId }, deps)).toEqual({
      ok: false,
      error: { code: 'team-lineage-taken' },
    });
    expect(value(await listBin(l.as, {}, deps)).items.map((i) => i.id)).toEqual([teamId]);
  });

  it('brings back a person, and a game nobody played, but never a played one', async () => {
    const l = await league();
    const { personId } = value(
      await createPerson(l.as, { firstName: 'Sam', lastName: 'Player' }, deps),
    );
    value(await removePerson(l.as, { personId }, deps));
    value(await restorePerson(l.as, { personId }, deps));
    expect(value(await listBin(l.as, {}, deps)).items).toEqual([]);

    const a = value(await createTeam(l.as, { ...hawks, seasonId: l.seasonId }, deps)).teamId;
    const b = value(
      await createTeam(
        l.as,
        { ...hawks, name: 'Owls', shortName: 'owls', seasonId: l.seasonId },
        deps,
      ),
    ).teamId;
    const stage = await one<{ id: string }>(
      pglite,
      `insert into stages (league_id, season_id, type, name) values ($1, $2, 'regular', 'Regular') returning id`,
      [l.leagueId, l.seasonId],
    );
    const game = (status: string, finalScores: string) =>
      one<{ id: string }>(
        pglite,
        `insert into games (league_id, season_id, stage_id, home_team_id, away_team_id, status,
           capture_mode, ${finalScores ? 'home_score, away_score, finalized_at, format,' : ''} deleted_at)
         values ($1, $2, $3, $4, $5, $6, 'final', ${finalScores ? `5, 4, now(), '{"version": 1, "periods": 2}',` : ''} now())
         returning id`,
        [l.leagueId, l.seasonId, stage.id, a, b, status],
      );
    const planned = await game('scheduled', '');
    const played = await game('final', 'x');
    // The purge never removes a game, so the bin gives it no date to go.
    expect(
      value(await listBin(l.as, {}, deps)).items.map((i) => [i.id, i.removedForGoodAt]),
    ).toEqual([[planned.id, null]]);
    value(await restoreGame(l.as, { gameId: planned.id }, deps));
    expect(await restoreGame(l.as, { gameId: played.id }, deps)).toMatchObject({
      error: { code: 'game-not-restorable' },
    });
  });
});

describe('the bin: the nightly emptying', () => {
  it('removes only what is 30 days old or older, and only in its own league', async () => {
    const a = await league();
    const b = await league();
    const makeTeam = async (l: Awaited<ReturnType<typeof league>>, shortName: string) =>
      value(
        await createTeam(
          l.as,
          { ...hawks, name: shortName, shortName, seasonId: l.seasonId },
          deps,
        ),
      ).teamId;
    const oldA = await makeTeam(a, 'old-a');
    const youngA = await makeTeam(a, 'young-a');
    const liveA = await makeTeam(a, 'live-a');
    const oldB = await makeTeam(b, 'old-b');
    for (const [id, days] of [
      [oldA, 31],
      [youngA, 29],
      [oldB, 400],
    ] as const) {
      await age('teams', id, days);
    }

    const counts = await nightly(a, now);
    expect(counts).toMatchObject({ teams: 1 });
    expect(await exists('teams', oldA)).toBe(false);
    expect(await exists('teams', youngA)).toBe(true);
    expect(await exists('teams', liveA)).toBe(true);
    // Another league's old team is left for its own run.
    expect(await exists('teams', oldB)).toBe(true);
    expect(
      (await pglite.query(`select action from activity_log where league_id = $1`, [a.leagueId]))
        .rows,
    ).toEqual(expect.arrayContaining([{ action: 'leagues.empty_bin' }]));

    expect(await nightly(b, now)).toMatchObject({ teams: 1 });
    expect(await exists('teams', oldB)).toBe(false);
    // A second run does no harm.
    expect(await nightly(b, now)).toMatchObject({ teams: 0 });
  });

  it('takes a team with its roster entries, and children before parents', async () => {
    const l = await league();
    const { teamId } = value(await createTeam(l.as, { ...hawks, seasonId: l.seasonId }, deps));
    const { personId } = value(
      await createPerson(l.as, { firstName: 'Sam', lastName: 'Player' }, deps),
    );
    value(await addToRoster(l.as, { teamId, personId }, deps));
    const venue = await one<{ id: string }>(
      pglite,
      `insert into venues (league_id, name, address) values ($1, 'Gym', '1 Street') returning id`,
      [l.leagueId],
    );
    const court = await one<{ id: string }>(
      pglite,
      `insert into courts (league_id, venue_id, name) values ($1, $2, 'Court 1') returning id`,
      [l.leagueId, venue.id],
    );
    const parent = await one<{ id: string }>(
      pglite,
      `insert into divisions (league_id, season_id, name) values ($1, $2, 'Gold') returning id`,
      [l.leagueId, l.seasonId],
    );
    const child = await one<{ id: string }>(
      pglite,
      `insert into divisions (league_id, season_id, parent_division_id, name) values ($1, $2, $3, 'Sub') returning id`,
      [l.leagueId, l.seasonId, parent.id],
    );
    await age('teams', teamId, 40);
    await age('courts', court.id, 40);
    await age('venues', venue.id, 40);
    await age('divisions', parent.id, 40);
    await age('divisions', child.id, 40);

    expect(await nightly(l, now)).toEqual({
      courts: 1,
      venues: 1,
      teams: 1,
      divisions: 2,
      people: 0,
    });
    expect(
      (await pglite.query(`select 1 from roster_entries where team_id = $1`, [teamId])).rows,
    ).toEqual([]);
    // The person is live, so they stay.
    expect(await exists('people', personId)).toBe(true);
  });

  it('leaves what history still points at: a person who played, a venue a game uses', async () => {
    const l = await league();
    const { personId } = value(
      await createPerson(l.as, { firstName: 'Sam', lastName: 'Player' }, deps),
    );
    const { teamId } = value(await createTeam(l.as, { ...hawks, seasonId: l.seasonId }, deps));
    value(await addToRoster(l.as, { teamId, personId }, deps));
    await pglite.query(`update roster_entries set left_on = current_date where person_id = $1`, [
      personId,
    ]);
    value(await removePerson(l.as, { personId }, deps));
    const loose = value(
      await createPerson(l.as, { firstName: 'Lee', lastName: 'Gone' }, deps),
    ).personId;
    value(await removePerson(l.as, { personId: loose }, deps));
    await age('people', personId, 90);
    await age('people', loose, 90);
    // The bin says beforehand which of them the purge leaves.
    const listed = value(await listBin(l.as, {}, deps)).items;
    expect(listed.find((i) => i.id === personId)?.removedForGoodAt).toBeNull();
    expect(listed.find((i) => i.id === loose)?.removedForGoodAt).toBe(
      new Date(Date.parse(daysAgo(90)) + 30 * day).toISOString(),
    );

    expect(await nightly(l, now)).toMatchObject({ people: 1 });
    expect(await exists('people', personId)).toBe(true);
    expect(await exists('people', loose)).toBe(false);
  });
});
