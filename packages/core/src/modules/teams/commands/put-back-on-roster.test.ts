// Tests of putting a player marked as left by mistake back on the roster (step 2.161), on
// the module's in-memory storage; the same command runs against the real database in
// packages/database (rosters-commands.test.ts, the two-league harness, the role matrix).
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
import { listRoster } from './list-roster.ts';
import { markLeft } from './mark-left.ts';
import { putBackOnRoster } from './put-back-on-roster.ts';

const base = () => ({
  teams: [team(1), team(2)],
  people: [person(1), person(2), person(3)],
  grants: [schedulerGrant, programAdminGrant],
});

const putBack = (
  deps: ReturnType<typeof memoryTeams>['deps'],
  as: ReturnType<typeof memoryTeams>['as'],
  n: number,
  version = 1,
  who: string | null = ownerId,
  teamId = teamUuid(1),
) => putBackOnRoster(as(who), { teamId, rosterEntryId: entryUuid(n), version }, deps);

describe('putBackOnRoster', () => {
  it('clears the leaving date of the same entry, so no "left" line stays (R-17)', async () => {
    const { db, deps, as } = memoryTeams({
      ...base(),
      roster: [entry(1, { jerseyNumber: '5', joinedOn: '2026-10-01', role: 'captain' })],
    });
    const left = await markLeft(
      as(ownerId),
      { rosterEntryId: entryUuid(1), version: 1, leftOn: '2026-11-10' },
      deps,
    );
    expect(left.ok).toBe(true);
    expect(await putBack(deps, as, 1, 2)).toEqual({
      ok: true,
      value: { version: 3, numberDropped: null },
    });
    // One entry, the same one, as it was: number, role, joining date and place kept.
    expect(db.state.roster).toEqual([
      entry(1, { jerseyNumber: '5', joinedOn: '2026-10-01', role: 'captain', version: 3 }),
    ]);
    const roster = await listRoster(as(ownerId), { teamId: teamUuid(1) }, deps);
    expect(roster.ok && roster.value.filter((line) => line.leftOn !== null)).toEqual([]);
    expect(db.state.activity.map((a) => a.action)).toEqual([
      'teams.mark_left',
      'teams.put_back_on_roster',
    ]);
    expect(db.state.activity[1]).toMatchObject({
      actorAccountId: ownerId,
      targetType: 'team',
      targetId: teamUuid(1),
      details: { personId: personUuid(1), numberDropped: null },
    });
  });

  it('refuses an entry with no leaving date, a stale version, and one that is not there', async () => {
    const { db, deps, as } = memoryTeams({
      ...base(),
      roster: [entry(1), entry(2, { leftOn: '2026-11-01' })],
    });
    expect(await putBack(deps, as, 1)).toEqual({ ok: false, error: { code: 'not-left' } });
    expect(await putBack(deps, as, 2, 4)).toEqual({
      ok: false,
      error: { code: 'changed-since-read' },
    });
    expect(await putBack(deps, as, 9)).toEqual({
      ok: false,
      error: { code: 'roster-entry-not-found' },
    });
    expect(db.state.roster[1]?.leftOn).toBe('2026-11-01');
    expect(db.state.activity).toEqual([]);
  });

  it("refuses an entry of another team than the one named, and a team's in the bin", async () => {
    const { db, deps, as } = memoryTeams({
      ...base(),
      teams: [team(1), team(2), team(3, { binned: true })],
      roster: [
        entry(1, { leftOn: '2026-11-01' }),
        entry(2, { teamId: teamUuid(3), leftOn: '2026-11-01' }),
      ],
    });
    expect(await putBack(deps, as, 1, 1, ownerId, teamUuid(2))).toEqual({
      ok: false,
      error: { code: 'roster-entry-not-found' },
    });
    expect(await putBack(deps, as, 2, 1, ownerId, teamUuid(3))).toEqual({
      ok: false,
      error: { code: 'roster-entry-not-found' },
    });
    expect(db.state.roster.map((e) => e.leftOn)).toEqual(['2026-11-01', '2026-11-01']);
  });

  it('refuses one who is on the team again, or no longer in the league list', async () => {
    const { deps, as } = memoryTeams({
      ...base(),
      people: [person(1), person(2, true)],
      roster: [
        entry(1, { leftOn: '2026-11-01' }),
        // Added again since, as a new entry.
        entry(3, { personId: personUuid(1) }),
        entry(2, { leftOn: '2026-11-01' }),
      ],
    });
    expect(await putBack(deps, as, 1)).toEqual({ ok: false, error: { code: 'already-on-team' } });
    expect(await putBack(deps, as, 2)).toEqual({ ok: false, error: { code: 'person-not-found' } });
  });

  it('puts back with no number one whose number is worn since, where numbers are unique (R-32)', async () => {
    const roster = [
      entry(1, { jerseyNumber: '7', leftOn: '2026-11-01' }),
      entry(2, { jerseyNumber: '7' }),
    ];
    const strict = memoryTeams({ ...base(), uniqueJerseys: true, roster });
    expect(await putBack(strict.deps, strict.as, 1)).toEqual({
      ok: true,
      value: { version: 2, numberDropped: '7' },
    });
    expect(strict.db.state.roster[0]).toMatchObject({ leftOn: null, jerseyNumber: null });
    expect(strict.db.state.roster[1]).toMatchObject({ jerseyNumber: '7' });
    expect(strict.db.state.activity[0]?.details).toEqual({
      personId: personUuid(1),
      numberDropped: '7',
    });
    // Where two may wear the same number, they keep theirs.
    const loose = memoryTeams({ ...base(), uniqueJerseys: false, roster });
    expect(await putBack(loose.deps, loose.as, 1)).toEqual({
      ok: true,
      value: { version: 2, numberDropped: null },
    });
    expect(loose.db.state.roster[0]).toMatchObject({ jerseyNumber: '7' });
  });

  it('puts back one waiting for review with their number: the number rule waits for the review (0015)', async () => {
    const { db, deps, as } = memoryTeams({
      ...base(),
      uniqueJerseys: true,
      waitingForReview: [entryUuid(1)],
      roster: [
        entry(1, { jerseyNumber: '7', leftOn: '2026-11-01' }),
        entry(2, { jerseyNumber: '7' }),
      ],
    });
    expect(await putBack(deps, as, 1)).toEqual({
      ok: true,
      value: { version: 2, numberDropped: null },
    });
    expect(db.state.roster[0]).toMatchObject({ jerseyNumber: '7', leftOn: null });
  });

  it('puts back a player who is on another team of the season too: a season does not limit it', async () => {
    const { deps, as } = memoryTeams({
      ...base(),
      roster: [
        entry(1, { leftOn: '2026-11-01' }),
        entry(2, { personId: personUuid(1), teamId: teamUuid(2) }),
      ],
    });
    expect((await putBack(deps, as, 1)).ok).toBe(true);
  });

  it('is for those who may mark a player as left: refused to others and in a read-only league', async () => {
    const roster = [entry(1, { leftOn: '2026-11-01' })];
    const scheduler = memoryTeams({ ...base(), roster });
    expect(await putBack(scheduler.deps, scheduler.as, 1, 1, schedulerId)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
    expect(await putBack(scheduler.deps, scheduler.as, 1, 1, null)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
    // An admin of the team's own program may.
    const admin = memoryTeams({ ...base(), roster });
    expect((await putBack(admin.deps, admin.as, 1, 1, programAdminId)).ok).toBe(true);
    for (const status of ['archived', 'suspended']) {
      const shut = memoryTeams({ ...base(), roster, status });
      expect(await putBack(shut.deps, shut.as, 1)).toEqual({
        ok: false,
        error: { code: 'not-allowed' },
      });
      expect(shut.db.state.roster[0]?.leftOn).toBe('2026-11-01');
    }
  });

  it('refuses input that is not a roster place', async () => {
    const { deps, as } = memoryTeams(base());
    const result = await putBackOnRoster(
      as(ownerId),
      { teamId: teamUuid(1), rosterEntryId: 'nope', version: 1 },
      deps,
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });
});
