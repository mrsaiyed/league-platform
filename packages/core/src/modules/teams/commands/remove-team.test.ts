import { describe, expect, it } from 'vitest';
import {
  memoryTeams,
  ownerId,
  schedulerGrant,
  schedulerId,
  team,
  teamUuid,
} from '../memory-teams.test-helper.ts';
import { removeTeam } from './remove-team.ts';

describe('removeTeam', () => {
  it('moves a team to the bin and keeps its row (A-5)', async () => {
    const { db, deps, as } = memoryTeams({ teams: [team(1)] });
    expect(await removeTeam(as(ownerId), { teamId: teamUuid(1) }, deps)).toEqual({
      ok: true,
      value: { teamId: teamUuid(1) },
    });
    expect(db.state.teams).toHaveLength(1);
    expect(db.state.teams[0]?.binned).toBe(true);
    expect(db.state.activity.map((a) => a.action)).toEqual(['teams.remove_team']);
  });

  it('refuses one already in the bin or missing, and people without teams.manage', async () => {
    const { deps, as } = memoryTeams({
      teams: [team(1, { binned: true }), team(2)],
      grants: [schedulerGrant],
    });
    expect(await removeTeam(as(ownerId), { teamId: teamUuid(1) }, deps)).toMatchObject({
      error: { code: 'team-not-found' },
    });
    expect(await removeTeam(as(ownerId), { teamId: teamUuid(9) }, deps)).toMatchObject({
      error: { code: 'team-not-found' },
    });
    expect(await removeTeam(as(schedulerId), { teamId: teamUuid(2) }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
