// The standings read store on plain objects, for core's tests of the public reads.
import { defaultSeasonRules } from '@srleagues/contracts';
import type { StandingsReadStore } from './read-ports.ts';

export const leagueId = '01900000-0000-7000-8000-000000000001';
export const seasonId = '01900000-0000-7000-8000-0000000000c1';
export const divisionId = '01900000-0000-7000-8000-0000000000d1';
export const openTeam = '01900000-0000-7000-8000-0000000a0001';
export const staffTeam = '01900000-0000-7000-8000-0000000a0002';
export const openPlayer = '01900000-0000-7000-8000-00000000f001';
export const staffPlayer = '01900000-0000-7000-8000-00000000f002';
export const hiddenPlayer = '01900000-0000-7000-8000-00000000f003';

export function memoryStandingsRead(): StandingsReadStore {
  return {
    findSeason: async (id) =>
      id === seasonId ? { id, name: 'Fall', rules: defaultSeasonRules() } : undefined,
    seasonStatKeys: async (id) => (id === seasonId ? ['points', 'fouls'] : undefined),
    teams: async () => [
      {
        id: openTeam,
        name: 'Open Team',
        slug: 'open',
        color: '#111111',
        divisionId,
        statsVisibility: 'everyone',
      },
      {
        id: staffTeam,
        name: 'Staff Team',
        slug: 'staff',
        color: null,
        divisionId,
        statsVisibility: 'staff',
      },
    ],
    divisions: async () => [{ id: divisionId, name: 'North', color: null, sort: 0 }],
    standingsRows: async () => [
      {
        teamId: staffTeam,
        divisionId,
        rank: 1,
        seed: 1,
        gamesPlayed: 2,
        wins: 2,
        losses: 0,
        ties: 0,
        pointsFor: 100,
        pointsAgainst: 80,
        standingsPoints: null,
        streakResult: 'won',
        streakLength: 2,
        decidedBy: 'head-to-head',
      },
      {
        teamId: openTeam,
        divisionId,
        rank: 2,
        seed: 2,
        gamesPlayed: 2,
        wins: 0,
        losses: 2,
        ties: 0,
        pointsFor: 80,
        pointsAgainst: 100,
        standingsPoints: null,
        streakResult: 'lost',
        streakLength: 2,
        decidedBy: null,
      },
    ],
    adjustments: async () => [
      { id: 'a1', teamId: staffTeam, wins: 0, losses: 0, ties: 0, points: -2, reason: 'Late' },
      { id: 'a2', teamId: openTeam, wins: -1, losses: 1, ties: 0, points: 0, reason: 'Ruling' },
    ],
    playerTotals: async () => [
      {
        personId: openPlayer,
        gamesPlayed: 2,
        secondsPlayed: 0,
        secondsGames: 0,
        stats: { version: 1, stats: { points: { total: 14, gamesRecorded: 2 } } },
      },
      {
        personId: staffPlayer,
        gamesPlayed: 2,
        secondsPlayed: 0,
        secondsGames: 0,
        stats: { version: 1, stats: { points: { total: 99, gamesRecorded: 2 } } },
      },
      {
        // Linked to no team at all: cannot be checked, so never shown.
        personId: hiddenPlayer,
        gamesPlayed: 2,
        secondsPlayed: 0,
        secondsGames: 0,
        stats: { version: 1, stats: { points: { total: 77, gamesRecorded: 2 } } },
      },
    ],
    playerTeams: async () => [
      { personId: openPlayer, teamId: openTeam },
      { personId: staffPlayer, teamId: staffTeam },
    ],
    teamStatTotals: async () => [
      { teamId: openTeam, statKey: 'points', total: 80, gamesRecorded: 2 },
      { teamId: staffTeam, statKey: 'points', total: 100, gamesRecorded: 2 },
    ],
    people: async (ids) =>
      ids.map((id) => ({
        id,
        firstName: id === openPlayer ? 'Olive' : 'Sam',
        lastName: 'Player',
        isMinor: false,
        visibility: 'none',
      })),
  };
}
