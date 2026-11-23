import { describe, expect, it } from 'vitest';
import {
  memoryTeams,
  ownerId,
  schedulerGrant,
  schedulerId,
  team,
  teamUuid,
} from '../memory-teams.test-helper.ts';
import { markTeamLeft } from './mark-team-left.ts';
import { undoTeamLeft } from './undo-team-left.ts';

const id = teamUuid(1);

describe('a team that has left the league (S-87)', () => {
  it('is marked, then the mark is taken off, each logged', async () => {
    const { db, deps, as } = memoryTeams({ teams: [team(1)] });
    expect(await markTeamLeft(as(ownerId), { teamId: id, version: 1 }, deps)).toEqual({
      ok: true,
      value: { version: 2 },
    });
    expect(db.state.teams[0]?.left).toBe(true);
    expect(await undoTeamLeft(as(ownerId), { teamId: id, version: 2 }, deps)).toEqual({
      ok: true,
      value: { version: 3 },
    });
    expect(db.state.teams[0]?.left).toBe(false);
    expect(db.state.activity.map((a) => a.action)).toEqual([
      'teams.mark_team_left',
      'teams.undo_team_left',
    ]);
  });

  it('changes nothing when it is already so', async () => {
    const { db, deps, as } = memoryTeams({ teams: [team(1)] });
    expect(await undoTeamLeft(as(ownerId), { teamId: id, version: 1 }, deps)).toEqual({
      ok: true,
      value: { version: 1 },
    });
    expect(db.state.activity).toEqual([]);
  });

  it('is refused on an old version or a team that is not there', async () => {
    const { deps, as } = memoryTeams({ teams: [team(1)] });
    expect(await markTeamLeft(as(ownerId), { teamId: id, version: 9 }, deps)).toMatchObject({
      ok: false,
      error: { code: 'changed-since-read' },
    });
    expect(
      await markTeamLeft(as(ownerId), { teamId: teamUuid(7), version: 1 }, deps),
    ).toMatchObject({ ok: false });
  });

  it('is not for someone who may not edit the team', async () => {
    const { db, deps, as } = memoryTeams({ teams: [team(1)], grants: [schedulerGrant] });
    const made = await markTeamLeft(as(schedulerId), { teamId: id, version: 1 }, deps);
    expect(made.ok).toBe(false);
    expect(db.state.teams[0]?.left).toBe(false);
  });
});
