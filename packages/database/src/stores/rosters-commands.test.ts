// Step 2.19's commands against the real database: each call is one transaction
// (commandTransaction), committed on success and rolled back on a refusal. Covers the
// unique-jersey refusal (0008 trigger) in plain words, a player who left staying in
// the history with their games, and people in the bin or merged away being refused.
// Isolation cases are in ../isolation.
import type { PGlite } from '@electric-sql/pglite';
import {
  addToRoster,
  changeRosterEntry,
  listRoster,
  markLeft,
  putBackOnRoster,
  reorderRoster,
  removePerson,
  removeTeam,
  type CommandDeps,
  type Job,
  type PeopleTx,
  type TeamsTx,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import {
  freshSchema,
  newGame,
  newLeague,
  newPerson,
  newRound,
  newSeason,
  newStage,
  newTeam,
  one,
} from '../schema/schema.test-helper.ts';
import { accessStore } from './access-store.ts';
import { activityLogStore } from './activity-log-store.ts';
import { peopleStore } from './people-store.ts';
import { teamsStore } from './teams-store.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let deps: CommandDeps<TeamsTx>;
let peopleDeps: CommandDeps<PeopleTx>;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  const transaction = commandTransaction(db, (scope) => ({
    jobs: { enqueue: async (_job: Job) => {} },
    teams: teamsStore(scope),
    people: peopleStore(scope),
    access: accessStore(scope),
    activity: activityLogStore(scope),
  }));
  const rest = { events: [], log: () => {}, now: () => 0 };
  deps = { transaction, ...rest };
  peopleDeps = { transaction, ...rest };
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

async function league(uniqueJerseys = false) {
  const made = await newLeague(pglite);
  const seasonId = await newSeason(pglite, made.leagueId, made.defaultProgramId);
  if (uniqueJerseys) {
    await pglite.query(
      `update seasons set rules = jsonb_set(rules, '{rosters}', '{"uniqueJerseys": true}'::jsonb) where id = $1`,
      [seasonId],
    );
  }
  const teamId = await newTeam(pglite, made.leagueId, seasonId);
  return {
    ...made,
    seasonId,
    teamId,
    as: { leagueId: made.leagueId, accountId: made.ownerId, requestId: 'r-1' },
  };
}

function value<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`refused: ${result.error.code}`);
  return result.value;
}

const entryRow = (id: string) =>
  one<{
    jersey_number: string | null;
    role: string;
    left_on: string | null;
    sort: number;
    version: number;
  }>(
    pglite,
    `select jersey_number, role, to_char(left_on, 'YYYY-MM-DD') as left_on, sort, version
     from roster_entries where id = $1`,
    [id],
  );

describe('rosters', () => {
  it('adds people with numbers and roles, changes a number and reorders', async () => {
    const l = await league();
    const [a, b, c] = [
      await newPerson(pglite, l.leagueId),
      await newPerson(pglite, l.leagueId),
      await newPerson(pglite, l.leagueId),
    ] as [string, string, string];
    const first = value(
      await addToRoster(
        l.as,
        { teamId: l.teamId, personId: a, jerseyNumber: '00', role: 'coach' },
        deps,
      ),
    );
    const second = value(
      await addToRoster(l.as, { teamId: l.teamId, personId: b, jerseyNumber: '0' }, deps),
    );
    const third = value(await addToRoster(l.as, { teamId: l.teamId, personId: c }, deps));
    expect(await entryRow(first.rosterEntryId)).toMatchObject({
      jersey_number: '00',
      role: 'coach',
      sort: 0,
    });
    expect(await entryRow(third.rosterEntryId)).toMatchObject({
      jersey_number: null,
      role: 'player',
      sort: 2,
    });

    value(
      await changeRosterEntry(
        l.as,
        { rosterEntryId: second.rosterEntryId, version: 1, jerseyNumber: '12', role: 'captain' },
        deps,
      ),
    );
    expect(await entryRow(second.rosterEntryId)).toMatchObject({
      jersey_number: '12',
      role: 'captain',
      version: 2,
    });

    const reordered = value(
      await reorderRoster(
        l.as,
        {
          teamId: l.teamId,
          rosterEntryIds: [third.rosterEntryId, first.rosterEntryId, second.rosterEntryId],
        },
        deps,
      ),
    );
    // The database moved every touched entry's version; the result carries the new ones.
    for (const v of reordered.versions) {
      expect((await entryRow(v.rosterEntryId)).version).toBe(v.version);
    }
    const firstNow = reordered.versions.find((v) => v.rosterEntryId === first.rosterEntryId);
    expect(
      await changeRosterEntry(
        l.as,
        { rosterEntryId: first.rosterEntryId, version: 1, role: 'player' },
        deps,
      ),
    ).toEqual({ ok: false, error: { code: 'changed-since-read' } });
    value(
      await changeRosterEntry(
        l.as,
        { rosterEntryId: first.rosterEntryId, version: firstNow?.version ?? 0, role: 'player' },
        deps,
      ),
    );
    const listed = value(await listRoster(l.as, { teamId: l.teamId }, deps));
    expect(listed.map((e) => e.id)).toEqual([
      third.rosterEntryId,
      first.rosterEntryId,
      second.rosterEntryId,
    ]);
    expect(listed[0]).toMatchObject({ firstName: 'Made-up', joinedOn: null, leftOn: null });
    expect(Object.keys(listed[0] ?? {})).not.toContain('birthDate');

    const log = await pglite.query<{ action: string }>(
      'select action from activity_log where league_id = $1 and action like $2',
      [l.leagueId, 'teams.%'],
    );
    expect(log.rows.filter((r) => r.action === 'teams.add_to_roster')).toHaveLength(3);
  });

  it('refuses a duplicate jersey with a plain message where the season asks for unique numbers', async () => {
    const l = await league(true);
    const [a, b] = [await newPerson(pglite, l.leagueId), await newPerson(pglite, l.leagueId)] as [
      string,
      string,
    ];
    const first = value(
      await addToRoster(l.as, { teamId: l.teamId, personId: a, jerseyNumber: '7' }, deps),
    );
    const refused = await addToRoster(
      l.as,
      { teamId: l.teamId, personId: b, jerseyNumber: '7' },
      deps,
    );
    expect(refused).toEqual({ ok: false, error: { code: 'jersey-taken' } });
    // Nothing was kept of the refused try, and another number is fine.
    const count = await one<{ n: string }>(
      pglite,
      'select count(*) as n from roster_entries where team_id = $1',
      [l.teamId],
    );
    expect(Number(count.n)).toBe(1);
    const second = value(
      await addToRoster(l.as, { teamId: l.teamId, personId: b, jerseyNumber: '8' }, deps),
    );
    // Changing to a worn number is refused too, and leaves the number as it was.
    expect(
      await changeRosterEntry(
        l.as,
        { rosterEntryId: second.rosterEntryId, version: 1, jerseyNumber: '7' },
        deps,
      ),
    ).toEqual({ ok: false, error: { code: 'jersey-taken' } });
    expect((await entryRow(second.rosterEntryId)).jersey_number).toBe('8');
    // Once the first player leaves, the number is free.
    value(
      await markLeft(
        l.as,
        { rosterEntryId: first.rosterEntryId, version: 1, leftOn: '2026-11-10' },
        deps,
      ),
    );
    value(
      await changeRosterEntry(
        l.as,
        { rosterEntryId: second.rosterEntryId, version: 1, jerseyNumber: '7' },
        deps,
      ),
    );
  });

  it('allows the same number twice where the season does not ask for unique ones', async () => {
    const l = await league(false);
    for (let i = 0; i < 2; i += 1) {
      value(
        await addToRoster(
          l.as,
          { teamId: l.teamId, personId: await newPerson(pglite, l.leagueId), jerseyNumber: '7' },
          deps,
        ),
      );
    }
  });

  it('keeps a player who left in the team history with every game they played (R-17)', async () => {
    const l = await league();
    const personId = await newPerson(pglite, l.leagueId);
    const { rosterEntryId } = value(
      await addToRoster(
        l.as,
        { teamId: l.teamId, personId, jerseyNumber: '5', joinedOn: '2026-10-01' },
        deps,
      ),
    );
    // A game the team played; it points at the team, which the roster entry stays on.
    const stageId = await newStage(pglite, l.leagueId, l.seasonId);
    await newRound(pglite, l.leagueId, l.seasonId, 1);
    const opponentId = await newTeam(pglite, l.leagueId, l.seasonId);
    const gameId = await newGame(pglite, {
      leagueId: l.leagueId,
      seasonId: l.seasonId,
      stageId,
      homeTeamId: l.teamId,
      awayTeamId: opponentId,
    });

    expect(await markLeft(l.as, { rosterEntryId, version: 1, leftOn: '2026-09-01' }, deps)).toEqual(
      { ok: false, error: { code: 'left-before-joined' } },
    );
    value(await markLeft(l.as, { rosterEntryId, version: 1, leftOn: '2026-11-10' }, deps));

    expect(await entryRow(rosterEntryId)).toMatchObject({
      left_on: '2026-11-10',
      jersey_number: '5',
    });
    const listed = value(await listRoster(l.as, { teamId: l.teamId }, deps));
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ personId, leftOn: '2026-11-10', jerseyNumber: '5' });
    expect(
      (
        await one<{ n: number }>(pglite, 'select count(*)::int as n from games where id = $1', [
          gameId,
        ])
      ).n,
    ).toBe(1);
    // They are no longer on a roster now, so their record can go to the bin; the
    // entry is still there.
    value(await removePerson(l.as, { personId }, peopleDeps));
    expect(await entryRow(rosterEntryId)).toMatchObject({ left_on: '2026-11-10' });
    // They can join again later, as a new entry.
    const again = await addToRoster(l.as, { teamId: l.teamId, personId }, deps);
    expect(again).toEqual({ ok: false, error: { code: 'person-not-found' } });
  });

  it("refuses a leaving date after the league's today, by its own time zone", async () => {
    const l = await league();
    const personId = await newPerson(pglite, l.leagueId);
    const { rosterEntryId } = value(await addToRoster(l.as, { teamId: l.teamId, personId }, deps));
    const { today, tomorrow } = await one<{ today: string; tomorrow: string }>(
      pglite,
      `select to_char(now() at time zone time_zone, 'YYYY-MM-DD') as today,
              to_char(now() at time zone time_zone + interval '1 day', 'YYYY-MM-DD') as tomorrow
       from leagues where id = $1`,
      [l.leagueId],
    );
    for (const leftOn of [tomorrow, '2099-01-01']) {
      expect(await markLeft(l.as, { rosterEntryId, version: 1, leftOn }, deps)).toEqual({
        ok: false,
        error: { code: 'left-after-today' },
      });
    }
    expect((await entryRow(rosterEntryId)).left_on).toBeNull();
    value(await markLeft(l.as, { rosterEntryId, version: 1, leftOn: today }, deps));
    expect((await entryRow(rosterEntryId)).left_on).toBe(today);
  });

  it('puts a player marked as left by mistake back, keeping every game line (step 2.161)', async () => {
    const l = await league(true);
    const personId = await newPerson(pglite, l.leagueId);
    const { rosterEntryId } = value(
      await addToRoster(l.as, { teamId: l.teamId, personId, jerseyNumber: '5' }, deps),
    );
    const stageId = await newStage(pglite, l.leagueId, l.seasonId);
    await newRound(pglite, l.leagueId, l.seasonId, 1);
    const gameId = await newGame(pglite, {
      leagueId: l.leagueId,
      seasonId: l.seasonId,
      stageId,
      homeTeamId: l.teamId,
      awayTeamId: await newTeam(pglite, l.leagueId, l.seasonId),
    });
    await pglite.query(
      `insert into player_game_stats (league_id, game_id, team_id, person_id, played, stats)
       values ($1, $2, $3, $4, true, '{"points": 9}'::jsonb)`,
      [l.leagueId, gameId, l.teamId, personId],
    );
    value(await markLeft(l.as, { rosterEntryId, version: 1, leftOn: '2026-11-10' }, deps));
    const put = (version: number, teamId = l.teamId) =>
      putBackOnRoster(l.as, { teamId, rosterEntryId, version }, deps);
    expect(await put(1)).toEqual({ ok: false, error: { code: 'changed-since-read' } });
    // Another team's page cannot name it.
    expect(await put(2, await newTeam(pglite, l.leagueId, l.seasonId))).toEqual({
      ok: false,
      error: { code: 'roster-entry-not-found' },
    });
    expect(await put(2)).toEqual({ ok: true, value: { version: 3 } });
    expect(await entryRow(rosterEntryId)).toMatchObject({ left_on: null, jersey_number: '5' });
    const listed = value(await listRoster(l.as, { teamId: l.teamId }, deps));
    expect(listed.map((line) => [line.id, line.leftOn])).toEqual([[rosterEntryId, null]]);
    expect(
      (
        await one<{ n: number }>(
          pglite,
          'select count(*)::int as n from player_game_stats where person_id = $1',
          [personId],
        )
      ).n,
    ).toBe(1);
    expect(await put(3)).toEqual({ ok: false, error: { code: 'not-left' } });
    const logged = await one<{ n: number }>(
      pglite,
      `select count(*)::int as n from activity_log where league_id = $1 and action = 'teams.put_back_on_roster'`,
      [l.leagueId],
    );
    expect(logged.n).toBe(1);
  });

  it('refuses putting back a number worn since, a person on the team again, and a binned team', async () => {
    const l = await league(true);
    const [left, wearer, again] = [
      await newPerson(pglite, l.leagueId),
      await newPerson(pglite, l.leagueId),
      await newPerson(pglite, l.leagueId),
    ];
    const first = value(
      await addToRoster(l.as, { teamId: l.teamId, personId: left, jerseyNumber: '7' }, deps),
    );
    value(
      await markLeft(
        l.as,
        { rosterEntryId: first.rosterEntryId, version: 1, leftOn: '2026-11-10' },
        deps,
      ),
    );
    value(await addToRoster(l.as, { teamId: l.teamId, personId: wearer, jerseyNumber: '7' }, deps));
    expect(
      await putBackOnRoster(
        l.as,
        { teamId: l.teamId, rosterEntryId: first.rosterEntryId, version: 2 },
        deps,
      ),
    ).toEqual({ ok: false, error: { code: 'jersey-taken' } });
    expect((await entryRow(first.rosterEntryId)).left_on).toBe('2026-11-10');

    const old = value(await addToRoster(l.as, { teamId: l.teamId, personId: again }, deps));
    value(
      await markLeft(
        l.as,
        { rosterEntryId: old.rosterEntryId, version: 1, leftOn: '2026-11-10' },
        deps,
      ),
    );
    value(await addToRoster(l.as, { teamId: l.teamId, personId: again }, deps));
    expect(
      await putBackOnRoster(
        l.as,
        { teamId: l.teamId, rosterEntryId: old.rosterEntryId, version: 2 },
        deps,
      ),
    ).toEqual({ ok: false, error: { code: 'already-on-team' } });

    value(await removeTeam(l.as, { teamId: l.teamId }, deps));
    expect(
      await putBackOnRoster(
        l.as,
        { teamId: l.teamId, rosterEntryId: old.rosterEntryId, version: 2 },
        deps,
      ),
    ).toEqual({ ok: false, error: { code: 'roster-entry-not-found' } });
  });

  it('puts back one waiting for review with their number, as the trigger skips them (0015)', async () => {
    const l = await league(true);
    const [walkUp, wearer] = [
      await newPerson(pglite, l.leagueId),
      await newPerson(pglite, l.leagueId),
    ];
    // As a player added at a scorer's table is: named by the game, waiting for review; then
    // marked as left by mistake, and their number taken by someone else since.
    const gameId = await newGame(pglite, {
      leagueId: l.leagueId,
      seasonId: l.seasonId,
      stageId: await newStage(pglite, l.leagueId, l.seasonId),
      homeTeamId: l.teamId,
      awayTeamId: await newTeam(pglite, l.leagueId, l.seasonId),
    });
    const first = {
      rosterEntryId: (
        await one<{ id: string }>(
          pglite,
          `insert into roster_entries
             (league_id, team_id, person_id, jersey_number, left_on, added_at_game_id, needs_review)
           values ($1, $2, $3, '9', '2026-11-10', $4, true) returning id`,
          [l.leagueId, l.teamId, walkUp, gameId],
        )
      ).id,
    };
    value(await addToRoster(l.as, { teamId: l.teamId, personId: wearer, jerseyNumber: '9' }, deps));
    const { version } = await entryRow(first.rosterEntryId);
    value(
      await putBackOnRoster(
        l.as,
        { teamId: l.teamId, rosterEntryId: first.rosterEntryId, version },
        deps,
      ),
    );
    expect(await entryRow(first.rosterEntryId)).toMatchObject({
      left_on: null,
      jersey_number: '9',
    });
  });

  it('does not hold a person by a place on a team in the bin (A-16)', async () => {
    const l = await league();
    const [first, second, elsewhere] = [
      await newPerson(pglite, l.leagueId),
      await newPerson(pglite, l.leagueId),
      await newPerson(pglite, l.leagueId),
    ];
    const otherTeamId = await newTeam(pglite, l.leagueId, l.seasonId);
    for (const personId of [first, second]) {
      value(await addToRoster(l.as, { teamId: l.teamId, personId }, deps));
    }
    // The third is on both teams: the place on the team still there holds them.
    value(await addToRoster(l.as, { teamId: l.teamId, personId: elsewhere }, deps));
    value(await addToRoster(l.as, { teamId: otherTeamId, personId: elsewhere }, deps));
    expect(await removePerson(l.as, { personId: first }, peopleDeps)).toEqual({
      ok: false,
      error: { code: 'person-on-a-roster' },
    });
    value(await removeTeam(l.as, { teamId: l.teamId }, deps));
    value(await removePerson(l.as, { personId: first }, peopleDeps));
    expect(await removePerson(l.as, { personId: elsewhere }, peopleDeps)).toEqual({
      ok: false,
      error: { code: 'person-on-a-roster' },
    });
    // The binned team's roster is kept as it was, with no leaving dates.
    const rows = await pglite.query<{ person_id: string; left_on: string | null }>(
      'select person_id, left_on from roster_entries where team_id = $1 order by sort',
      [l.teamId],
    );
    expect(rows.rows.map((r) => [r.person_id, r.left_on])).toEqual([
      [first, null],
      [second, null],
      [elsewhere, null],
    ]);
  });

  it('refuses people in the bin or merged into another, and teams in the bin', async () => {
    const l = await league();
    const binned = await newPerson(pglite, l.leagueId);
    await pglite.query('update people set deleted_at = now() where id = $1', [binned]);
    const keeper = await newPerson(pglite, l.leagueId);
    const merged = await newPerson(pglite, l.leagueId);
    await pglite.query('update people set merged_into_id = $1 where id = $2', [keeper, merged]);
    for (const personId of [binned, merged]) {
      expect(await addToRoster(l.as, { teamId: l.teamId, personId }, deps)).toEqual({
        ok: false,
        error: { code: 'person-not-found' },
      });
    }
    const onTeam = value(await addToRoster(l.as, { teamId: l.teamId, personId: keeper }, deps));
    expect(await addToRoster(l.as, { teamId: l.teamId, personId: keeper }, deps)).toEqual({
      ok: false,
      error: { code: 'already-on-team' },
    });
    value(await removeTeam(l.as, { teamId: l.teamId }, deps));
    expect(
      await addToRoster(
        l.as,
        { teamId: l.teamId, personId: await newPerson(pglite, l.leagueId) },
        deps,
      ),
    ).toEqual({ ok: false, error: { code: 'team-not-found' } });
    expect(
      await markLeft(
        l.as,
        { rosterEntryId: onTeam.rosterEntryId, version: 1, leftOn: '2026-11-10' },
        deps,
      ),
    ).toEqual({ ok: false, error: { code: 'roster-entry-not-found' } });
  });
});
