// The admin Teams screens' stand-in: the real teams and people commands, run the way
// the screens' actions run them, over the made-up in-memory store (step 2.51).
import {
  addToRoster,
  createPerson,
  createTeam,
  listPeople,
  listRoster,
  markLeft,
  removePerson,
  reorderRoster,
  setTeamStatsVisibility,
  updateTeam,
  type AccessReader,
  type CommandContext,
} from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import {
  addToRosterInput,
  markLeftInput,
  movedOrder,
  newPersonInput,
  newTeamInput,
} from '../features/teams-area/form-input.ts';
import { addNewPerson, moveEntry } from '../features/teams-area/roster-changes.ts';
import { standInAdminTeams } from './stand-in-admin-teams.ts';

const leagueId = '01900000-0000-7000-8000-000000000001';
const ownerId = '01900000-0000-7000-8000-0000000000a1';
const strangerId = '01900000-0000-7000-8000-0000000000a4';

const access: AccessReader = {
  ownerAccountId: async () => ownerId,
  leagueStatus: async () => 'live',
  activeGrantsOf: async () => [],
};

function made(uniqueJerseys = false) {
  const ports = standInAdminTeams({
    accessOf: () => access,
    log: () => undefined,
    uniqueJerseys,
  });
  const as = (accountId: string | null): CommandContext => ({
    leagueId,
    accountId,
    requestId: 'request-1',
  });
  return { ports, owner: as(ownerId), stranger: as(strangerId) };
}

async function seasonOf(ports: ReturnType<typeof made>['ports']): Promise<string> {
  const season = await ports.currentSeason(leagueId);
  if (season === undefined) throw new Error('no season');
  return season.id;
}

/** The made-up team of ten, with numbers, as the screens' forms would build it. */
async function teamOfTen(m: ReturnType<typeof made>) {
  const seasonId = await seasonOf(m.ports);
  const made = await createTeam(
    m.owner,
    newTeamInput({ name: 'Blue Jays', useOwnColors: 'on' }, seasonId),
    m.ports.deps,
  );
  if (!made.ok) throw new Error(`team refused: ${made.error.code}`);
  const teamId = made.value.teamId;
  const entries: string[] = [];
  const people: string[] = [];
  for (let n = 1; n <= 10; n += 1) {
    const person = await createPerson(
      m.owner,
      newPersonInput({ firstName: `Player${n}`, lastName: 'Test' }),
      m.ports.deps,
    );
    if (!person.ok) throw new Error('person refused');
    people.push(person.value.personId);
    const added = await addToRoster(
      m.owner,
      addToRosterInput(
        { team: teamId, jerseyNumber: String(n), role: n === 1 ? 'captain' : '' },
        person.value.personId,
      ),
      m.ports.deps,
    );
    if (!added.ok) throw new Error(`add refused: ${added.error.code}`);
    entries.push(added.value.rosterEntryId);
  }
  return { teamId, entries, people };
}

describe('the admin Teams screens over the stand-in', () => {
  it('builds a team of ten with numbers, then marks one as left', async () => {
    const m = made();
    const { teamId, entries } = await teamOfTen(m);

    const before = await listRoster(m.owner, { teamId }, m.ports.deps);
    expect(before.ok && before.value.map((line) => line.jerseyNumber)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
    ]);
    expect(before.ok && before.value[0]?.role).toBe('captain');

    const entry = before.ok ? before.value.find((line) => line.id === entries[3]) : undefined;
    const gone = await markLeft(
      m.owner,
      markLeftInput({
        entry: entries[3] ?? '',
        version: String(entry?.version),
        leftOn: '2026-11-13',
      }),
      m.ports.deps,
    );
    expect(gone.ok).toBe(true);

    const after = await listRoster(m.owner, { teamId }, m.ports.deps);
    if (!after.ok) throw new Error('list refused');
    expect(after.value.filter((line) => line.leftOn === null)).toHaveLength(9);
    const left = after.value.filter((line) => line.leftOn !== null);
    expect(left.map((line) => [line.firstName, line.leftOn])).toEqual([['Player4', '2026-11-13']]);
  });

  it('refuses to remove a person with an open roster entry, and allows it after they left (R-17)', async () => {
    const m = made();
    const { teamId, entries, people } = await teamOfTen(m);
    const refused = await removePerson(m.owner, { personId: people[0] }, m.ports.deps);
    expect(!refused.ok && refused.error.code).toBe('person-on-a-roster');

    const roster = await listRoster(m.owner, { teamId }, m.ports.deps);
    const entry = roster.ok ? roster.value.find((line) => line.id === entries[0]) : undefined;
    await markLeft(
      m.owner,
      markLeftInput({
        entry: entries[0] ?? '',
        version: String(entry?.version),
        leftOn: '2026-11-13',
      }),
      m.ports.deps,
    );
    const removed = await removePerson(m.owner, { personId: people[0] }, m.ports.deps);
    expect(removed.ok).toBe(true);
  });

  it('puts the roster in a new order, one place at a time', async () => {
    const m = made();
    const { teamId, entries } = await teamOfTen(m);
    const open = entries;
    const order = movedOrder(open, open[0] ?? '', 'down');
    const moved = await reorderRoster(m.owner, { teamId, rosterEntryIds: order }, m.ports.deps);
    expect(moved.ok).toBe(true);
    const roster = await listRoster(m.owner, { teamId }, m.ports.deps);
    expect(roster.ok && roster.value.slice(0, 2).map((line) => line.jerseyNumber)).toEqual([
      '2',
      '1',
    ]);
  });

  it('shows a team in the season list, with its division, and edits it', async () => {
    const m = made();
    const { teamId } = await teamOfTen(m);
    const seasonId = await seasonOf(m.ports);
    const teams = await m.ports.teams(leagueId, seasonId);
    expect(teams.map((team) => [team.name, team.slug, team.color])).toEqual([
      ['Blue Jays', 'blue-jays', null],
    ]);
    const renamed = await updateTeam(
      m.owner,
      { teamId, version: 1, name: 'Jays', color: '#112233' },
      m.ports.deps,
    );
    expect(renamed.ok).toBe(true);
    const after = await m.ports.teams(leagueId, seasonId);
    expect(after.map((team) => [team.name, team.color])).toEqual([['Jays', '#112233']]);
  });

  it('sets who sees the numbers, and refuses a stale page', async () => {
    const m = made();
    const { teamId } = await teamOfTen(m);
    const set = await setTeamStatsVisibility(
      m.owner,
      { teamId, version: 1, statsVisibility: 'staff' },
      m.ports.deps,
    );
    expect(set.ok).toBe(true);
    const stale = await setTeamStatsVisibility(
      m.owner,
      { teamId, version: 1, statsVisibility: 'everyone' },
      m.ports.deps,
    );
    expect(!stale.ok && stale.error.code).toBe('changed-since-read');
  });

  it('refuses a person who holds no role in the league', async () => {
    const m = made();
    const seasonId = await seasonOf(m.ports);
    const result = await createTeam(
      m.stranger,
      newTeamInput({ name: 'Nope' }, seasonId),
      m.ports.deps,
    );
    expect(!result.ok && result.error.code).toBe('not-allowed');
    expect(await m.ports.teams(leagueId, seasonId)).toEqual([]);
  });

  it('keeps one league apart from another', async () => {
    const m = made();
    await teamOfTen(m);
    const otherLeague = '01900000-0000-7000-8000-000000000002';
    const season = await m.ports.currentSeason(otherLeague);
    expect(season).toBeDefined();
    expect(await m.ports.teams(otherLeague, season?.id ?? '')).toEqual([]);
  });

  it('adds a new person to the roster, and leaves no orphan when the number is worn', async () => {
    const m = made(true);
    const { teamId } = await teamOfTen(m);
    const before = await listPeopleCount(m);
    const worn = await addNewPerson(m.owner, m.ports.deps, {
      team: teamId,
      firstName: 'Orphan',
      lastName: 'Test',
      jerseyNumber: '3',
      role: 'player',
    });
    expect(worn.answer).toEqual({
      kind: 'refused',
      command: 'teams.add_new_person',
      code: 'jersey-taken',
    });
    expect(await listPeopleCount(m)).toBe(before);

    const fine = await addNewPerson(m.owner, m.ports.deps, {
      team: teamId,
      firstName: 'Kept',
      lastName: 'Test',
      jerseyNumber: '33',
      role: 'player',
    });
    expect(fine.answer).toEqual({ kind: 'done', done: 'added' });
    expect(await listPeopleCount(m)).toBe(before + 1);
  });

  it('checks the role and number before it makes anyone', async () => {
    const m = made();
    const { teamId } = await teamOfTen(m);
    const before = await listPeopleCount(m);
    for (const bad of [{ jerseyNumber: '123' }, { role: 'wizard' }]) {
      const answer = await addNewPerson(m.owner, m.ports.deps, {
        team: teamId,
        firstName: 'Nobody',
        lastName: 'Test',
        ...bad,
      });
      expect(answer.answer).toMatchObject({ kind: 'refused', code: 'invalid-input' });
    }
    expect(await listPeopleCount(m)).toBe(before);
  });

  it('refuses to move someone who is not on the open roster, or from a stale page', async () => {
    const m = made();
    const { teamId, entries } = await teamOfTen(m);
    const open = entries.join(',');
    const stranger = await moveEntry(m.owner, m.ports.deps, {
      team: teamId,
      entry: 'not-an-entry',
      order: open,
    });
    expect(stranger.answer).toMatchObject({ kind: 'refused', code: 'roster-entry-not-found' });
    const stale = await moveEntry(m.owner, m.ports.deps, {
      team: teamId,
      entry: entries[0] ?? '',
      order: entries.slice(1).join(','),
    });
    expect(stale.answer).toMatchObject({ kind: 'refused', code: 'roster-incomplete' });
    const reordered = await moveEntry(m.owner, m.ports.deps, {
      team: teamId,
      entry: entries[0] ?? '',
      order: [...entries].reverse().join(','),
    });
    expect(reordered.answer).toMatchObject({ kind: 'refused', code: 'roster-incomplete' });
    const moved = await moveEntry(m.owner, m.ports.deps, {
      team: teamId,
      entry: entries[0] ?? '',
      order: open,
    });
    expect(moved.answer).toEqual({ kind: 'done', done: 'moved' });
  });
});

async function listPeopleCount(m: ReturnType<typeof made>): Promise<number> {
  const people = await listPeople(m.owner, { limit: 200 }, m.ports.deps);
  return people.ok ? people.value.length : -1;
}
