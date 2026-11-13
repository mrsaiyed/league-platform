import { describe, expect, it } from 'vitest';
import {
  divisionId,
  memoryTeams,
  otherSeasonDivisionId,
  ownerId,
  schedulerGrant,
  schedulerId,
  team,
  teamUuid,
} from '../memory-teams.test-helper.ts';
import { updateTeam } from './update-team.ts';

const id = teamUuid(1);

describe('updateTeam', () => {
  it('changes the fields given, bumps the version and logs which', async () => {
    const { db, deps, as } = memoryTeams({ teams: [team(1, { color: '#111111' })] });
    const result = await updateTeam(
      as(ownerId),
      { teamId: id, version: 1, name: 'Hawks', shortName: 'Hawks', color: null, divisionId },
      deps,
    );
    expect(result).toEqual({ ok: true, value: { version: 2 } });
    expect(db.state.teams[0]).toMatchObject({
      name: 'Hawks',
      slug: 'hawks',
      color: null,
      divisionId,
    });
    expect(db.state.activity[0]).toMatchObject({
      action: 'teams.update_team',
      details: { changed: 'name,shortName,color,division' },
    });
  });

  it('can take a team out of its division', async () => {
    const { db, deps, as } = memoryTeams({ teams: [team(1, { divisionId })] });
    await updateTeam(as(ownerId), { teamId: id, version: 1, divisionId: null }, deps);
    expect(db.state.teams[0]?.divisionId).toBeNull();
  });

  it('changes nothing and logs nothing when nothing differs', async () => {
    const { db, deps, as } = memoryTeams({ teams: [team(1)] });
    expect(await updateTeam(as(ownerId), { teamId: id, version: 1, name: 'Team 1' }, deps)).toEqual(
      {
        ok: true,
        value: { version: 1 },
      },
    );
    expect(db.state.activity).toEqual([]);
  });

  it('refuses an old version, a taken short name or name, and a division of another season', async () => {
    const { deps, as } = memoryTeams({
      teams: [team(1), team(2, { slug: 'taken', name: 'Taken' })],
    });
    expect(
      await updateTeam(as(ownerId), { teamId: id, version: 5, name: 'X' }, deps),
    ).toMatchObject({
      error: { code: 'changed-since-read' },
    });
    expect(
      await updateTeam(as(ownerId), { teamId: id, version: 1, shortName: 'taken' }, deps),
    ).toMatchObject({ error: { code: 'team-short-name-taken' } });
    expect(
      await updateTeam(as(ownerId), { teamId: id, version: 1, name: 'TAKEN' }, deps),
    ).toMatchObject({
      error: { code: 'team-name-taken' },
    });
    expect(
      await updateTeam(
        as(ownerId),
        { teamId: id, version: 1, divisionId: otherSeasonDivisionId },
        deps,
      ),
    ).toMatchObject({ error: { code: 'division-not-found' } });
  });

  it('refuses a team in the bin or missing, an empty change, and people without teams.manage', async () => {
    const { deps, as } = memoryTeams({
      teams: [team(1, { binned: true })],
      grants: [schedulerGrant],
    });
    expect(
      await updateTeam(as(ownerId), { teamId: id, version: 1, name: 'X' }, deps),
    ).toMatchObject({
      error: { code: 'team-not-found' },
    });
    expect(
      await updateTeam(as(ownerId), { teamId: teamUuid(9), version: 1, name: 'X' }, deps),
    ).toMatchObject({
      error: { code: 'team-not-found' },
    });
    expect(await updateTeam(as(ownerId), { teamId: id, version: 1 }, deps)).toMatchObject({
      error: { code: 'invalid-input' },
    });
    expect(
      await updateTeam(as(schedulerId), { teamId: id, version: 1, name: 'X' }, deps),
    ).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
