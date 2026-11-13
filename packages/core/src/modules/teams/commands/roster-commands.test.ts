// Tests of the roster commands (step 2.19) on the module's in-memory storage; the same
// commands run against the real database in packages/database. One file for the five
// because they share one fixture: a team, a few people and a roster.
import { describe, expect, it } from 'vitest';
import {
  entry,
  entryUuid,
  memoryTeams,
  ownerId,
  person,
  personUuid,
  programAdminGrant,
  programAdminId,
  schedulerGrant,
  schedulerId,
  team,
  teamUuid,
} from '../memory-teams.test-helper.ts';
import { addToRoster } from './add-to-roster.ts';
import { changeRosterEntry } from './change-roster-entry.ts';
import { listRoster } from './list-roster.ts';
import { markLeft } from './mark-left.ts';
import { reorderRoster } from './reorder-roster.ts';

const base = () => ({
  teams: [team(1)],
  people: [person(1), person(2), person(3)],
  grants: [schedulerGrant, programAdminGrant],
});

describe('addToRoster', () => {
  it('puts a person at the end of the roster with a number and a role', async () => {
    const { db, deps, as } = memoryTeams({ ...base(), roster: [entry(1)] });
    const result = await addToRoster(
      as(ownerId),
      { teamId: teamUuid(1), personId: personUuid(2), jerseyNumber: '00', role: 'captain' },
      deps,
    );
    expect(result.ok).toBe(true);
    expect(db.state.roster[1]).toMatchObject({
      personId: personUuid(2),
      jerseyNumber: '00',
      role: 'captain',
      sort: 1,
      leftOn: null,
    });
    expect(db.state.activity.map((a) => a.action)).toEqual(['teams.add_to_roster']);
  });

  it('refuses people in the bin or missing, and teams in the bin or missing', async () => {
    const { deps, as } = memoryTeams({
      teams: [team(1), team(2, { binned: true })],
      people: [person(1, true)],
    });
    const add = (teamN: number, personN: number) =>
      addToRoster(as(ownerId), { teamId: teamUuid(teamN), personId: personUuid(personN) }, deps);
    expect(await add(1, 1)).toMatchObject({ error: { code: 'person-not-found' } });
    expect(await add(1, 9)).toMatchObject({ error: { code: 'person-not-found' } });
    expect(await add(2, 1)).toMatchObject({ error: { code: 'team-not-found' } });
    expect(await add(9, 1)).toMatchObject({ error: { code: 'team-not-found' } });
  });

  it('refuses someone already on the team, but takes back one who left', async () => {
    const { deps, as } = memoryTeams({ ...base(), roster: [entry(1, { leftOn: '2026-11-01' })] });
    const add = () =>
      addToRoster(as(ownerId), { teamId: teamUuid(1), personId: personUuid(1) }, deps);
    expect((await add()).ok).toBe(true);
    expect(await add()).toMatchObject({ error: { code: 'already-on-team' } });
  });

  it('refuses a number that is worn, where the season asks for unique numbers', async () => {
    const { deps, as } = memoryTeams({
      ...base(),
      uniqueJerseys: true,
      roster: [entry(1, { jerseyNumber: '7' })],
    });
    expect(
      await addToRoster(
        as(ownerId),
        { teamId: teamUuid(1), personId: personUuid(2), jerseyNumber: '7' },
        deps,
      ),
    ).toMatchObject({ error: { code: 'jersey-taken' } });
  });

  it('refuses a bad number or role, and people without the roster permission', async () => {
    const { deps, as } = memoryTeams(base());
    const input = { teamId: teamUuid(1), personId: personUuid(1) };
    for (const bad of [{ jerseyNumber: '100' }, { jerseyNumber: '07' }, { role: 'owner' }]) {
      expect(await addToRoster(as(ownerId), { ...input, ...bad }, deps)).toMatchObject({
        error: { code: 'invalid-input' },
      });
    }
    expect(await addToRoster(as(schedulerId), input, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    // An admin of another program is checked at the team's own program.
    const other = memoryTeams({
      ...base(),
      teams: [team(1, { seasonId: '01900000-0000-7000-8000-0000000000c2' })],
    });
    expect(await addToRoster(other.as(programAdminId), input, other.deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});

describe('changeRosterEntry', () => {
  it('changes a number and a role, and takes a number away', async () => {
    const { db, deps, as } = memoryTeams({ ...base(), roster: [entry(1, { jerseyNumber: '5' })] });
    expect(
      await changeRosterEntry(
        as(ownerId),
        { rosterEntryId: entryUuid(1), version: 1, jerseyNumber: '12', role: 'coach' },
        deps,
      ),
    ).toEqual({ ok: true, value: { version: 2 } });
    expect(db.state.roster[0]).toMatchObject({ jerseyNumber: '12', role: 'coach' });
    await changeRosterEntry(
      as(ownerId),
      { rosterEntryId: entryUuid(1), version: 2, jerseyNumber: null },
      deps,
    );
    expect(db.state.roster[0]?.jerseyNumber).toBeNull();
    expect(db.state.activity.map((a) => a.action)).toEqual([
      'teams.change_roster_entry',
      'teams.change_roster_entry',
    ]);
  });

  it('refuses a stale version, one who left, a worn number and a missing entry', async () => {
    const { deps, as } = memoryTeams({
      ...base(),
      uniqueJerseys: true,
      roster: [
        entry(1, { jerseyNumber: '5' }),
        entry(2, { jerseyNumber: '6' }),
        entry(3, { leftOn: '2026-11-01' }),
      ],
    });
    const change = (n: number, version: number, jerseyNumber: string) =>
      changeRosterEntry(as(ownerId), { rosterEntryId: entryUuid(n), version, jerseyNumber }, deps);
    expect(await change(1, 4, '9')).toMatchObject({ error: { code: 'changed-since-read' } });
    expect(await change(3, 1, '9')).toMatchObject({ error: { code: 'already-left' } });
    expect(await change(1, 1, '6')).toMatchObject({ error: { code: 'jersey-taken' } });
    expect(await change(9, 1, '6')).toMatchObject({ error: { code: 'roster-entry-not-found' } });
  });

  it('refuses entries of a team in the bin and people without the permission', async () => {
    const { deps, as } = memoryTeams({
      ...base(),
      teams: [team(1, { binned: true })],
      roster: [entry(1)],
    });
    const input = { rosterEntryId: entryUuid(1), version: 1, role: 'coach' as const };
    expect(await changeRosterEntry(as(ownerId), input, deps)).toMatchObject({
      error: { code: 'roster-entry-not-found' },
    });
    expect(await changeRosterEntry(as(schedulerId), input, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});

describe('markLeft', () => {
  it('sets the leaving date and keeps the entry in the history (R-17)', async () => {
    const { db, deps, as } = memoryTeams({
      ...base(),
      roster: [entry(1, { jerseyNumber: '5', joinedOn: '2026-10-01' })],
    });
    expect(
      await markLeft(
        as(ownerId),
        { rosterEntryId: entryUuid(1), version: 1, leftOn: '2026-11-10' },
        deps,
      ),
    ).toEqual({ ok: true, value: { version: 2 } });
    expect(db.state.roster).toHaveLength(1);
    expect(db.state.roster[0]).toMatchObject({ leftOn: '2026-11-10', jerseyNumber: '5' });
    expect(db.state.activity.map((a) => a.action)).toEqual(['teams.mark_left']);
  });

  it('refuses leaving twice, before joining, on a stale version, and without permission', async () => {
    const { deps, as } = memoryTeams({
      ...base(),
      roster: [entry(1, { joinedOn: '2026-10-01' }), entry(2, { leftOn: '2026-11-01' })],
    });
    const leave = (n: number, version: number, leftOn: string, who = ownerId) =>
      markLeft(as(who), { rosterEntryId: entryUuid(n), version, leftOn }, deps);
    expect(await leave(2, 1, '2026-11-02')).toMatchObject({ error: { code: 'already-left' } });
    expect(await leave(1, 1, '2026-09-30')).toMatchObject({
      error: { code: 'left-before-joined' },
    });
    expect(await leave(1, 3, '2026-11-02')).toMatchObject({
      error: { code: 'changed-since-read' },
    });
    expect(await leave(1, 1, '2026-11-02', schedulerId)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(await leave(9, 1, '2026-11-02')).toMatchObject({
      error: { code: 'roster-entry-not-found' },
    });
  });
});

describe('reorderRoster', () => {
  it('puts the roster in the order given and leaves those who left after', async () => {
    const { db, deps, as } = memoryTeams({
      ...base(),
      roster: [entry(1), entry(2), entry(3, { leftOn: '2026-11-01', sort: 2 })],
    });
    expect(
      await reorderRoster(
        as(ownerId),
        { teamId: teamUuid(1), rosterEntryIds: [entryUuid(2), entryUuid(1)] },
        deps,
      ),
    ).toEqual({ ok: true, value: { count: 2 } });
    const sorts = Object.fromEntries(db.state.roster.map((e) => [e.id, e.sort]));
    expect(sorts).toEqual({ [entryUuid(2)]: 0, [entryUuid(1)]: 1, [entryUuid(3)]: 2 });
  });

  it('refuses a partial list, an entry of another team and a list with a repeat', async () => {
    const { deps, as } = memoryTeams({
      ...base(),
      teams: [team(1), team(2)],
      roster: [entry(1), entry(2), entry(3, { teamId: teamUuid(2) })],
    });
    const order = (ids: string[]) =>
      reorderRoster(as(ownerId), { teamId: teamUuid(1), rosterEntryIds: ids }, deps);
    expect(await order([entryUuid(1)])).toMatchObject({ error: { code: 'roster-incomplete' } });
    expect(await order([entryUuid(1), entryUuid(3)])).toMatchObject({
      error: { code: 'roster-entry-not-found' },
    });
    expect(await order([entryUuid(1), entryUuid(1)])).toMatchObject({
      error: { code: 'invalid-input' },
    });
    expect(
      await reorderRoster(
        as(schedulerId),
        { teamId: teamUuid(1), rosterEntryIds: [entryUuid(1), entryUuid(2)] },
        deps,
      ),
    ).toMatchObject({ error: { code: 'not-allowed' } });
  });
});

describe('listRoster', () => {
  it('lists everyone who is or was on the team, with leaving dates and no private fields', async () => {
    const { db, deps, as } = memoryTeams({
      ...base(),
      roster: [entry(1, { leftOn: '2026-11-01', sort: 0 }), entry(2, { sort: 1 })],
    });
    const result = await listRoster(as(ownerId), { teamId: teamUuid(1) }, deps);
    if (!result.ok) throw new Error('refused');
    expect(result.value.map((l) => [l.personId, l.leftOn])).toEqual([
      [personUuid(2), null],
      [personUuid(1), '2026-11-01'],
    ]);
    expect(Object.keys(result.value[0] ?? {})).not.toContain('birthDate');
    expect(db.state.activity).toEqual([]);
    expect(await listRoster(as(schedulerId), { teamId: teamUuid(1) }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(await listRoster(as(ownerId), { teamId: teamUuid(9) }, deps)).toMatchObject({
      error: { code: 'team-not-found' },
    });
  });
});
