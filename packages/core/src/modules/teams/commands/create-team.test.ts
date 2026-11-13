import { describe, expect, it } from 'vitest';
import {
  divisionId,
  memoryTeams,
  otherSeasonDivisionId,
  otherSeasonId,
  ownerId,
  programAdminGrant,
  programAdminId,
  schedulerGrant,
  schedulerId,
  seasonId,
  team,
} from '../memory-teams.test-helper.ts';
import { createTeam } from './create-team.ts';

const input = { seasonId, name: ' Hawks ', shortName: 'Hawks-1', statsVisibility: 'everyone' };

describe('createTeam', () => {
  it('adds a team with its own lineage and logs it', async () => {
    const { db, deps, as } = memoryTeams();
    const first = await createTeam(
      as(ownerId),
      { ...input, color: '#AABBCC', divisionId, statsVisibility: 'staff' },
      deps,
    );
    expect(first).toMatchObject({ ok: true });
    await createTeam(as(ownerId), { ...input, name: 'Owls', shortName: 'owls' }, deps);
    expect(db.state.teams[0]).toMatchObject({
      name: 'Hawks',
      slug: 'hawks-1',
      color: '#aabbcc',
      divisionId,
      statsVisibility: 'staff',
    });
    expect(db.state.teams[0]?.lineageId).not.toBe(db.state.teams[1]?.lineageId);
    expect(db.state.activity.map((a) => a.action)).toEqual([
      'teams.create_team',
      'teams.create_team',
    ]);
  });

  it('refuses a short name or name another team of the season has, not one in the bin or another season', async () => {
    const { deps, as } = memoryTeams({
      teams: [
        team(1, { slug: 'hawks', name: 'Hawks' }),
        team(2, { slug: 'old', name: 'Old', binned: true }),
        team(3, { seasonId: otherSeasonId, slug: 'elsewhere', name: 'Elsewhere' }),
      ],
    });
    expect(
      await createTeam(as(ownerId), { ...input, shortName: 'hawks', name: 'X' }, deps),
    ).toEqual({
      ok: false,
      error: { code: 'team-short-name-taken' },
    });
    expect(
      await createTeam(as(ownerId), { ...input, shortName: 'x', name: 'HAWKS' }, deps),
    ).toEqual({ ok: false, error: { code: 'team-name-taken' } });
    expect(
      await createTeam(as(ownerId), { ...input, shortName: 'old', name: 'Old' }, deps),
    ).toMatchObject({
      ok: true,
    });
    expect(
      await createTeam(as(ownerId), { ...input, shortName: 'elsewhere', name: 'Elsewhere' }, deps),
    ).toMatchObject({ ok: true });
  });

  it('refuses a missing season, and a division of another season', async () => {
    const { deps, as } = memoryTeams();
    expect(
      await createTeam(
        as(ownerId),
        { ...input, seasonId: '01900000-0000-7000-8000-0000000000ff' },
        deps,
      ),
    ).toMatchObject({ error: { code: 'season-not-found' } });
    expect(
      await createTeam(as(ownerId), { ...input, divisionId: otherSeasonDivisionId }, deps),
    ).toMatchObject({ error: { code: 'division-not-found' } });
  });

  it('refuses a short name that cannot be an address, and a missing numbers choice', async () => {
    const { deps, as } = memoryTeams();
    for (const bad of [
      { ...input, shortName: 'Has Space' },
      { ...input, shortName: '-x' },
      { ...input, shortName: '' },
      { ...input, shortName: 'a'.repeat(61) },
      { ...input, statsVisibility: 'members' },
      { ...input, statsVisibility: undefined },
    ]) {
      expect(await createTeam(as(ownerId), bad, deps)).toMatchObject({
        error: { code: 'invalid-input' },
      });
    }
  });

  it('lets the owner and an admin of its program in, and refuses others and an archived league (U-9)', async () => {
    const { db, deps, as } = memoryTeams({ grants: [programAdminGrant, schedulerGrant] });
    expect(await createTeam(as(programAdminId), input, deps)).toMatchObject({ ok: true });
    expect(
      await createTeam(
        as(programAdminId),
        { ...input, seasonId: otherSeasonId, shortName: 'b', name: 'B' },
        deps,
      ),
    ).toMatchObject({ error: { code: 'not-allowed' } });
    expect(
      await createTeam(as(schedulerId), { ...input, shortName: 'c', name: 'C' }, deps),
    ).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(await createTeam(as(null), input, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    db.state.status = 'archived';
    expect(
      await createTeam(as(ownerId), { ...input, shortName: 'd', name: 'D' }, deps),
    ).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
