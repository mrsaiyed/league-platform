// The rosters as the device keeps them (T-115), from the staff read of the game's rosters
// (games.read_tracker_rosters, T-258) and the teams' names the league shows. Worked out
// on the server when the tracker's page is drawn; the page hands them to the device.
import type { TrackerRosters } from '@srleagues/core';
import type { DevicePlayer, DeviceRosters, DeviceTeam } from './opened-game-storage.ts';

export function deviceRosters(
  rosters: TrackerRosters,
  teamNames: Readonly<Record<string, string>>,
): DeviceRosters {
  const team = (teamId: string): DeviceTeam => ({
    teamId,
    name: teamNames[teamId] ?? '',
    players: rosters.players
      .filter((p) => p.teamId === teamId)
      .map(
        (p): DevicePlayer => ({
          personId: p.personId,
          firstName: p.firstName,
          lastName: p.lastName,
          jerseyNumber: p.jerseyNumber,
          left: p.left,
        }),
      ),
  });
  return { home: team(rosters.homeTeamId), away: team(rosters.awayTeamId) };
}
