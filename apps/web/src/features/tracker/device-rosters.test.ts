import { describe, expect, it } from 'vitest';
import { deviceRosters } from './device-rosters.ts';

const home = '00000000-0000-4000-8000-0000000000d1';
const away = '00000000-0000-4000-8000-0000000000d2';
const player = (teamId: string, n: number, left = false) => ({
  teamId,
  personId: `00000000-0000-4000-8000-0000000000e${n}`,
  firstName: `First${n}`,
  lastName: `Last${n}`,
  jerseyNumber: n === 3 ? null : String(n),
  left,
});

describe('the rosters as the device keeps them', () => {
  it('puts each player under their team, in the order read, with the team’s name', () => {
    const kept = deviceRosters(
      {
        gameId: '00000000-0000-4000-8000-0000000000a1',
        homeTeamId: home,
        awayTeamId: away,
        players: [player(away, 1), player(home, 2), player(home, 3, true)],
      },
      { [home]: 'Made-up Home', [away]: 'Made-up Away' },
    );
    expect(kept).toEqual({
      home: {
        teamId: home,
        name: 'Made-up Home',
        players: [
          {
            personId: player(home, 2).personId,
            firstName: 'First2',
            lastName: 'Last2',
            jerseyNumber: '2',
            left: false,
          },
          {
            personId: player(home, 3).personId,
            firstName: 'First3',
            lastName: 'Last3',
            jerseyNumber: null,
            left: true,
          },
        ],
      },
      away: {
        teamId: away,
        name: 'Made-up Away',
        players: [
          {
            personId: player(away, 1).personId,
            firstName: 'First1',
            lastName: 'Last1',
            jerseyNumber: '1',
            left: false,
          },
        ],
      },
    });
  });

  it('keeps a team with no name known as an empty name, not a missing one', () => {
    const kept = deviceRosters(
      { gameId: 'g', homeTeamId: home, awayTeamId: away, players: [] },
      {},
    );
    expect(kept.home).toEqual({ teamId: home, name: '', players: [] });
  });
});
