import { describe, expect, it } from 'vitest';
import {
  memoryTeams,
  ownerId,
  programAdminGrant,
  programAdminId,
  schedulerGrant,
  schedulerId,
  team,
  teamUuid,
} from '../memory-teams.test-helper.ts';
import { setTeamStatsVisibility } from './set-team-stats-visibility.ts';

const id = teamUuid(1);

describe('setTeamStatsVisibility', () => {
  it('sets who sees the numbers and logs it', async () => {
    const { db, deps, as } = memoryTeams({ teams: [team(1)] });
    expect(
      await setTeamStatsVisibility(
        as(ownerId),
        { teamId: id, version: 1, statsVisibility: 'staff' },
        deps,
      ),
    ).toEqual({ ok: true, value: { version: 2 } });
    expect(db.state.teams[0]?.statsVisibility).toBe('staff');
    expect(db.state.activity[0]).toMatchObject({
      action: 'teams.set_stats_visibility',
      details: { statsVisibility: 'staff' },
    });
  });

  it('changes nothing when it is already so', async () => {
    const { db, deps, as } = memoryTeams({ teams: [team(1)] });
    expect(
      await setTeamStatsVisibility(
        as(ownerId),
        { teamId: id, version: 1, statsVisibility: 'everyone' },
        deps,
      ),
    ).toEqual({ ok: true, value: { version: 1 } });
    expect(db.state.activity).toEqual([]);
  });

  it('refuses levels an admin cannot set yet, an old version, a missing team and non-admins', async () => {
    const { deps, as } = memoryTeams({ teams: [team(1)], grants: [schedulerGrant] });
    const base = { teamId: id, version: 1, statsVisibility: 'staff' };
    expect(
      await setTeamStatsVisibility(as(ownerId), { ...base, statsVisibility: 'team' }, deps),
    ).toMatchObject({
      error: { code: 'invalid-input' },
    });
    expect(await setTeamStatsVisibility(as(ownerId), { ...base, version: 3 }, deps)).toMatchObject({
      error: { code: 'changed-since-read' },
    });
    expect(
      await setTeamStatsVisibility(as(ownerId), { ...base, teamId: teamUuid(9) }, deps),
    ).toMatchObject({
      error: { code: 'team-not-found' },
    });
    expect(await setTeamStatsVisibility(as(schedulerId), base, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });

  describe('when the league has switched choosing off', () => {
    const off = {
      'teams.mayChooseStatsLevel': [
        { level: 'league' as const, document: { version: 1, value: false } },
      ],
    };
    const input = { teamId: id, version: 1, statsVisibility: 'staff' };

    it('still lets the owner change a team', async () => {
      const { db, deps, as } = memoryTeams({ teams: [team(1)], settings: off });
      expect(await setTeamStatsVisibility(as(ownerId), input, deps)).toMatchObject({ ok: true });
      expect(db.state.teams[0]?.statsVisibility).toBe('staff');
    });

    it('still lets an admin of the whole league change a team', async () => {
      const grant = { ...programAdminGrant, scope: { type: 'league' as const } };
      const { deps, as } = memoryTeams({ teams: [team(1)], grants: [grant], settings: off });
      expect(await setTeamStatsVisibility(as(programAdminId), input, deps)).toMatchObject({
        ok: true,
      });
    });

    it('refuses an admin limited to one program, and changes nothing', async () => {
      const { db, deps, as } = memoryTeams({
        teams: [team(1)],
        grants: [programAdminGrant],
        settings: off,
      });
      expect(await setTeamStatsVisibility(as(programAdminId), input, deps)).toMatchObject({
        error: { code: 'teams-may-not-choose' },
      });
      expect(db.state.teams[0]?.statsVisibility).toBe('everyone');
    });

    it('lets that admin change it again once choosing is back on', async () => {
      const { deps, as } = memoryTeams({ teams: [team(1)], grants: [programAdminGrant] });
      expect(await setTeamStatsVisibility(as(programAdminId), input, deps)).toMatchObject({
        ok: true,
      });
    });
  });
});
