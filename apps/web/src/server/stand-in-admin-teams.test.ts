// The admin Teams screens' stand-in: the real teams and people commands, run the way
// the screens' actions run them, over the made-up in-memory store (step 2.51).
import {
  addToRoster,
  changeRosterEntry,
  createPerson,
  createTeam,
  listPeople,
  listRoster,
  markLeft,
  putBackOnRoster,
  removePerson,
  removeTeam,
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
import { testWorld, withUniqueJerseys } from './stand-in-world.test-helper.ts';

const leagueId = '01900000-0000-7000-8000-000000000001';
const ownerId = '01900000-0000-7000-8000-0000000000a1';
const strangerId = '01900000-0000-7000-8000-0000000000a4';

const access: AccessReader = {
  ownerAccountId: async () => ownerId,
  leagueStatus: async () => 'live',
  activeGrantsOf: async () => [],
};

function made(uniqueJerseys = false) {
  const ports = standInAdminTeams(
    testWorld(() => access, undefined, uniqueJerseys ? withUniqueJerseys : undefined),
  );
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

  it('refuses a leaving date of next year, and puts back one marked as left by mistake', async () => {
    const m = made(true);
    const { teamId, entries } = await teamOfTen(m);
    const entry = entries[2] ?? '';
    const nextYear = `${new Date().getUTCFullYear() + 1}-06-01`;
    const early = await markLeft(
      m.owner,
      markLeftInput({ entry, version: '1', leftOn: nextYear }),
      m.ports.deps,
    );
    expect(early).toEqual({ ok: false, error: { code: 'left-after-today' } });
    value(
      await markLeft(
        m.owner,
        markLeftInput({ entry, version: '1', leftOn: '2026-11-13' }),
        m.ports.deps,
      ),
    );
    expect(
      await putBackOnRoster(m.owner, { teamId, rosterEntryId: entry, version: 1 }, m.ports.deps),
    ).toEqual({ ok: false, error: { code: 'changed-since-read' } });
    value(
      await putBackOnRoster(m.owner, { teamId, rosterEntryId: entry, version: 2 }, m.ports.deps),
    );
    const roster = value(await listRoster(m.owner, { teamId }, m.ports.deps));
    expect(roster.filter((line) => line.leftOn !== null)).toEqual([]);
    expect(roster.map((line) => line.jerseyNumber)).toEqual([
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
    // In a season of unique numbers, a number worn since keeps them off, as the database does.
    value(
      await markLeft(
        m.owner,
        markLeftInput({ entry, version: '3', leftOn: '2026-11-13' }),
        m.ports.deps,
      ),
    );
    const other = roster.find((line) => line.jerseyNumber === '4');
    value(
      await changeRosterEntry(
        m.owner,
        { rosterEntryId: other?.id ?? '', version: other?.version ?? 0, jerseyNumber: '3' },
        m.ports.deps,
      ),
    );
    expect(
      await putBackOnRoster(m.owner, { teamId, rosterEntryId: entry, version: 4 }, m.ports.deps),
    ).toEqual({ ok: false, error: { code: 'jersey-taken' } });
  });

  it("takes the league's today from the world's own clock, not the computer's", async () => {
    // The world's clock says March 2030, years after this computer's.
    const world = testWorld(
      () => access,
      () => new Date('2030-03-01T18:00:00Z'),
    );
    const m = { ...made(), ports: standInAdminTeams(world) };
    const { entries } = await teamOfTen(m);
    const leave = (n: number, leftOn: string) =>
      markLeft(
        m.owner,
        markLeftInput({ entry: entries[n] ?? '', version: '1', leftOn }),
        m.ports.deps,
      );
    expect(await leave(0, '2030-03-05')).toEqual({
      ok: false,
      error: { code: 'left-after-today' },
    });
    expect((await leave(0, '2029-12-01')).ok).toBe(true);
    expect((await leave(1, '2030-03-01')).ok).toBe(true);
  });

  it('puts back one waiting for review with their number, as the database does (0015)', async () => {
    // Pat Gorski (left, #8) was added at a scorer's table and waits for review; since then
    // Marcus Oyelaran wears 8, in a season that asks for a different number for each.
    const world = testWorld(
      () => access,
      undefined,
      (leagues) => {
        withUniqueJerseys(leagues);
        for (const league of leagues) {
          const id = (first: string) =>
            league.people.find((p) => p.firstName === first && p.lastName !== '')?.id;
          league.roster = league.roster.map((r) =>
            r.personId === id('Pat')
              ? { ...r, needsReview: true }
              : r.personId === id('Marcus')
                ? { ...r, jerseyNumber: '8' }
                : r,
          );
        }
      },
    );
    const m = { ...made(), ports: standInAdminTeams(world) };
    const read = await world.read(leagueId);
    const pat = read?.people.find((p) => p.firstName === 'Pat' && p.lastName === 'Gorski');
    const entry = read?.roster.find((r) => r.personId === pat?.id);
    if (entry === undefined) throw new Error('no Pat Gorski');
    expect(
      await putBackOnRoster(
        m.owner,
        { teamId: entry.teamId, rosterEntryId: entry.id, version: entry.version },
        m.ports.deps,
      ),
    ).toMatchObject({ ok: true });
    const after = value(await listRoster(m.owner, { teamId: entry.teamId }, m.ports.deps));
    expect(after.find((line) => line.id === entry.id)).toMatchObject({
      leftOn: null,
      jerseyNumber: '8',
    });
  });

  it('lets a player of a team in the bin be taken off the league list (A-16)', async () => {
    const m = made();
    const { teamId, people } = await teamOfTen(m);
    value(await removeTeam(m.owner, { teamId }, m.ports.deps));
    value(await removePerson(m.owner, { personId: people[0] }, m.ports.deps));
    // Their place on the binned team is kept as it was, with no leaving date.
    const roster = await m.ports.deps.transaction(m.owner, (tx) => tx.teams.listRoster(teamId));
    expect(roster.filter((line) => line.leftOn === null)).toHaveLength(10);
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
    // Beside the season's own made-up teams, by name.
    const teams = await m.ports.teams(leagueId, seasonId);
    expect(teams.map((team) => [team.name, team.slug, team.color])).toContainEqual([
      'Blue Jays',
      'blue-jays',
      null,
    ]);
    expect(teams.map((team) => team.name)).toEqual(teams.map((t) => t.name).sort());
    const renamed = await updateTeam(
      m.owner,
      { teamId, version: 1, name: 'Jays', color: '#112233' },
      m.ports.deps,
    );
    expect(renamed.ok).toBe(true);
    const after = await m.ports.teams(leagueId, seasonId);
    expect(after.map((team) => [team.name, team.color])).toContainEqual(['Jays', '#112233']);
    expect(after.map((team) => team.name)).not.toContain('Blue Jays');
    expect(after).toHaveLength(teams.length);
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
    const before = await m.ports.teams(leagueId, seasonId);
    const result = await createTeam(
      m.stranger,
      newTeamInput({ name: 'Nope' }, seasonId),
      m.ports.deps,
    );
    expect(!result.ok && result.error.code).toBe('not-allowed');
    expect(await m.ports.teams(leagueId, seasonId)).toEqual(before);
  });

  it('keeps one league apart from another', async () => {
    const m = made();
    await teamOfTen(m);
    const otherLeague = '01900000-0000-7000-8000-000000000002';
    const season = await m.ports.currentSeason(otherLeague);
    expect(season).toBeDefined();
    // The other league has its own teams, and none of this one's.
    const theirs = (await m.ports.teams(otherLeague, season?.id ?? '')).map((t) => t.name);
    expect(theirs).toEqual(['Comets', 'Meteors', 'Rockets']);
    expect(await m.ports.teams(otherLeague, await seasonOf(m.ports))).toEqual([]);
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
      moveDown: '',
    });
    expect(stranger.answer).toMatchObject({ kind: 'refused', code: 'roster-entry-not-found' });
    const stale = await moveEntry(m.owner, m.ports.deps, {
      team: teamId,
      entry: entries[0] ?? '',
      order: entries.slice(1).join(','),
      moveDown: '',
    });
    expect(stale.answer).toMatchObject({ kind: 'refused', code: 'roster-incomplete' });
    const reordered = await moveEntry(m.owner, m.ports.deps, {
      team: teamId,
      entry: entries[0] ?? '',
      order: [...entries].reverse().join(','),
      moveDown: '',
    });
    expect(reordered.answer).toMatchObject({ kind: 'refused', code: 'roster-incomplete' });
    const moved = await moveEntry(m.owner, m.ports.deps, {
      team: teamId,
      entry: entries[0] ?? '',
      order: open,
      moveDown: '',
    });
    expect(moved.answer).toEqual({ kind: 'done', done: 'moved' });
  });

  it('refuses a move post that names no direction, or both', async () => {
    const m = made();
    const { teamId, entries } = await teamOfTen(m);
    const post = { team: teamId, entry: entries[1] ?? '', order: entries.join(',') };
    for (const fields of [post, { ...post, moveUp: '', moveDown: '' }]) {
      const answer = await moveEntry(m.owner, m.ports.deps, fields);
      expect(answer.answer).toMatchObject({ kind: 'refused', code: 'invalid-input' });
    }
    const roster = await listRoster(m.owner, { teamId }, m.ports.deps);
    expect(roster.ok && roster.value.map((line) => line.id)).toEqual(entries);
  });

  it('says so truthfully when the new person cannot be taken off the list again', async () => {
    const m = made(true);
    const { teamId } = await teamOfTen(m);
    const before = await listPeopleCount(m);
    // The fourth transaction of addNewPerson is the undo (list, make, add, undo): it fails.
    let calls = 0;
    const deps = {
      ...m.ports.deps,
      transaction: (async (context, work) => {
        calls += 1;
        if (calls === 4) throw new Error('made-up outage');
        return m.ports.deps.transaction(context, work);
      }) as typeof m.ports.deps.transaction,
    };
    const answer = await addNewPerson(m.owner, deps, {
      team: teamId,
      firstName: 'Stuck',
      lastName: 'Test',
      jerseyNumber: '3',
      role: 'player',
    });
    expect(calls).toBe(4);
    expect(answer.answer).toEqual({
      kind: 'refused',
      command: 'teams.add_new_person',
      code: 'not-undone',
    });
    expect(await listPeopleCount(m)).toBe(before + 1);
  });
});

function value<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`refused: ${result.error.code}`);
  return result.value;
}

async function listPeopleCount(m: ReturnType<typeof made>): Promise<number> {
  const people = await listPeople(m.owner, { limit: 200 }, m.ports.deps);
  return people.ok ? people.value.length : -1;
}
