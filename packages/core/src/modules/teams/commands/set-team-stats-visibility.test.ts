import { describe, expect, it } from 'vitest';
import {
  memoryTeams,
  ownerId,
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
});
