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
