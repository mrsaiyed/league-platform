import type { TrackerRosters } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { deviceRosters, keepsTurnovers, refreshedRosters } from './device-rosters.ts';

const home = '00000000-0000-4000-8000-0000000000d1';
const away = '00000000-0000-4000-8000-0000000000d2';
const gameId = '00000000-0000-4000-8000-0000000000a1';
const player = (teamId: string, n: number, left = false) => ({
  teamId,
  personId: `00000000-0000-4000-8000-0000000000e${n}`,
  firstName: `First${n}`,
  lastName: `Last${n}`,
  ordinal: null,
  jerseyNumber: n === 3 ? null : String(n),
  left,
  addedAtGameId: null,
  toReview: false,
});
/** Added at this game's table by number only, waiting for review (record 058). */
const walkUp = {
  teamId: away,
  personId: '00000000-0000-4000-8000-0000000000e9',
  firstName: '',
  lastName: '',
  ordinal: null,
  jerseyNumber: '12',
  left: false,
  addedAtGameId: gameId,
  toReview: true,
};
const rostersOf = (players: TrackerRosters['players'], uniqueJerseys = false): TrackerRosters => ({
  gameId,
  homeTeamId: home,
  awayTeamId: away,
  recording: 'live',
  status: 'scheduled',
  uniqueJerseys,
  allowTies: false,
  statistics: ['points', 'fouls'],
  players,
});
const kept = ({ teamId, ...p }: TrackerRosters['players'][number]) => p;

describe('the rosters as the device keeps them', () => {
  it('keeps the place of a player the number and name do not tell apart (R-33)', () => {
    const nameless = { ...player(home, 3), firstName: '', lastName: '', ordinal: 1 };
    const device = deviceRosters(rostersOf([nameless]), {});
    expect(device.home.players[0]?.ordinal).toBe(1);
    expect(JSON.stringify(device)).not.toContain('Last3');
  });

  it('puts each player under their team, in the order read, with the team’s name', () => {
    const rosters = deviceRosters(
      rostersOf([player(away, 1), player(home, 2), player(home, 3, true)]),
      { [home]: 'Made-up Home', [away]: 'Made-up Away' },
    );
    expect(rosters).toEqual({
      home: {
        teamId: home,
        name: 'Made-up Home',
        players: [kept(player(home, 2)), kept(player(home, 3, true))],
      },
      away: { teamId: away, name: 'Made-up Away', players: [kept(player(away, 1))] },
      uniqueJerseys: false,
      allowTies: false,
      statistics: ['points', 'fouls'],
    });
  });

  it('offers turnovers only when the season keeps them; rosters stored before name none (S-93)', () => {
    const names = { [home]: 'Made-up Home', [away]: 'Made-up Away' };
    const standard = deviceRosters(rostersOf([player(home, 2)]), names);
    expect(keepsTurnovers(standard)).toBe(false);
    const told = { ...rostersOf([player(home, 2)]), statistics: ['points', 'turnovers'] };
    expect(keepsTurnovers(deviceRosters(told, names))).toBe(true);
    const older = { home: standard.home, away: standard.away, uniqueJerseys: false };
    expect(keepsTurnovers(older)).toBe(true);
  });

  it('keeps whether a level score may end the game, so End game is refused on the device at once (S-73)', () => {
    const told = { ...rostersOf([player(home, 2)]), allowTies: true };
    expect(deviceRosters(told, {}).allowTies).toBe(true);
    expect(deviceRosters(rostersOf([player(home, 2)]), {}).allowTies).toBe(false);
  });

  it('keeps what the Players panel needs: unique numbers, and who was added at a table to review (record 058)', () => {
    const rosters = deviceRosters(rostersOf([player(home, 2), walkUp], true), {});
    expect(rosters.uniqueJerseys).toBe(true);
    expect(rosters.away.players).toEqual([kept(walkUp)]);
    expect(rosters.home.players[0]).toMatchObject({ addedAtGameId: null, toReview: false });
  });

  it('takes the rosters address’s answer as the page’s, keeping the teams’ names it holds', () => {
    const before = deviceRosters(rostersOf([player(home, 2)]), {
      [home]: 'Made-up Home',
      [away]: 'Made-up Away',
    });
    const after = refreshedRosters(before, rostersOf([player(home, 2), walkUp]));
    expect(after.home.name).toBe('Made-up Home');
    expect(after.away).toEqual({ teamId: away, name: 'Made-up Away', players: [kept(walkUp)] });
  });

  it('keeps a team with no name known as an empty name, not a missing one', () => {
    const rosters = deviceRosters(rostersOf([]), {});
    expect(rosters.home).toEqual({ teamId: home, name: '', players: [] });
  });
});
