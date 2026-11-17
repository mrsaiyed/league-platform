import { describe, expect, it } from 'vitest';
import {
  game,
  memoryTeams,
  ownerId,
  programAdminGrant,
  programAdminId,
  schedulerGrant,
  schedulerId,
  team,
  teamUuid,
  otherSeasonId,
} from '../memory-teams.test-helper.ts';
import { countTeamGames } from './count-team-games.ts';

describe('countTeamGames', () => {
  const games = [
    game(1, 1, 2, 'final'),
    game(2, 2, 1, 'forfeit'),
    game(3, 1, 2, 'scheduled'),
    game(4, 1, 2, 'postponed'),
    game(5, 2, 1, 'cancelled'),
    game(6, 1, 2, 'final', true),
  ];

  it('says how many games a team has played, and which have no result yet (A-17)', async () => {
    const { deps, as } = memoryTeams({ teams: [team(1), team(2)], games });
    expect(await countTeamGames(as(ownerId), { teamId: teamUuid(1) }, deps)).toEqual({
      ok: true,
      value: {
        played: 2,
        toPlay: 2,
        removedInDraft: 0,
        which: [
          { date: '2026-12-03', round: 3 },
          { date: '2026-12-04', round: 4 },
        ],
      },
    });
  });

  it('reads a team in the bin too, and changes nothing', async () => {
    const { db, deps, as } = memoryTeams({ teams: [team(1, { binned: true }), team(2)], games });
    expect(await countTeamGames(as(ownerId), { teamId: teamUuid(1) }, deps)).toMatchObject({
      value: { played: 2, toPlay: 2 },
    });
    expect(db.state.activity).toEqual([]);
  });

  it('is for those who may remove the team: not a scheduler, nor an admin of another program', async () => {
    const { deps, as } = memoryTeams({
      teams: [team(1), team(2, { seasonId: otherSeasonId })],
      games,
      grants: [schedulerGrant, programAdminGrant],
    });
    expect(await countTeamGames(as(schedulerId), { teamId: teamUuid(1) }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(await countTeamGames(as(programAdminId), { teamId: teamUuid(1) }, deps)).toMatchObject({
      ok: true,
    });
    expect(await countTeamGames(as(programAdminId), { teamId: teamUuid(2) }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });

  it('refuses a team that is not there', async () => {
    const { deps, as } = memoryTeams({ teams: [team(1)] });
    expect(await countTeamGames(as(ownerId), { teamId: teamUuid(9) }, deps)).toMatchObject({
      error: { code: 'team-not-found' },
    });
  });
});
