import { describe, expect, it } from 'vitest';
import {
  game,
  gameUuid,
  memoryTeams,
  ownerId,
  schedulerGrant,
  schedulerId,
  seasonId,
  team,
  teamUuid,
} from '../memory-teams.test-helper.ts';
import { removeTeam } from './remove-team.ts';

/** A schedule draft that adds game n between two of the numbered teams. */
const draftAdding = (n: number, home: number, away: number) => ({
  version: 1,
  changes: [
    {
      kind: 'add-game',
      game: {
        id: gameUuid(n),
        roundId: null,
        date: '2026-12-01',
        time: null,
        venueId: null,
        court: null,
        homeTeamId: teamUuid(home),
        awayTeamId: teamUuid(away),
        status: 'scheduled',
      },
    },
  ],
});

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

describe('removeTeam: a team with games stays (A-17)', () => {
  it('refuses a team with games still to play, scheduled, postponed or live, and names how many', async () => {
    const { db, deps, as } = memoryTeams({
      teams: [team(1), team(2)],
      games: [
        game(1, 1, 2, 'scheduled'),
        game(2, 2, 1, 'postponed'),
        game(3, 1, 2, 'live'),
        game(4, 1, 2, 'scheduled', true),
      ],
    });
    expect(await removeTeam(as(ownerId), { teamId: teamUuid(1) }, deps)).toEqual({
      ok: false,
      error: { code: 'team-has-games-to-play', toPlay: 3 },
    });
    expect(db.state.teams[0]?.binned).toBe(false);
    expect(db.state.activity).toEqual([]);
  });

  it('refuses a team whose games to come are only in the schedule draft', async () => {
    const { db, deps, as } = memoryTeams({
      teams: [team(1), team(2)],
      drafts: { [seasonId]: draftAdding(1, 2, 1) },
    });
    expect(await removeTeam(as(ownerId), { teamId: teamUuid(1) }, deps)).toEqual({
      ok: false,
      error: { code: 'team-has-games-to-play', toPlay: 1 },
    });
    expect(db.state.teams[0]?.binned).toBe(false);
  });

  it('refuses a team with a final or forfeited result, said before its games to come', async () => {
    const { db, deps, as } = memoryTeams({
      teams: [team(1), team(2)],
      games: [
        game(1, 1, 2, 'final'),
        game(2, 2, 1, 'forfeit'),
        game(3, 1, 2, 'scheduled'),
        game(4, 1, 2, 'final', true),
      ],
    });
    expect(await removeTeam(as(ownerId), { teamId: teamUuid(1) }, deps)).toEqual({
      ok: false,
      error: { code: 'team-has-results', played: 2 },
    });
    expect(db.state.teams[0]?.binned).toBe(false);
  });

  it('moves a team whose games are only cancelled, or in the bin, as before', async () => {
    const { db, deps, as } = memoryTeams({
      teams: [team(1), team(2)],
      games: [game(1, 1, 2, 'cancelled'), game(2, 2, 1, 'scheduled', true)],
    });
    expect(await removeTeam(as(ownerId), { teamId: teamUuid(1) }, deps)).toEqual({
      ok: true,
      value: { teamId: teamUuid(1) },
    });
    expect(db.state.teams[0]?.binned).toBe(true);
  });

  it('moves a team with no games at all, whatever the other teams have', async () => {
    const { db, deps, as } = memoryTeams({
      teams: [team(1), team(2), team(3)],
      games: [game(1, 2, 3, 'final'), game(2, 3, 2, 'scheduled')],
      drafts: { [seasonId]: draftAdding(3, 2, 3) },
    });
    expect(await removeTeam(as(ownerId), { teamId: teamUuid(1) }, deps)).toMatchObject({
      ok: true,
    });
    expect(db.state.teams[0]?.binned).toBe(true);
  });
});
