// The rosters as the device keeps them (T-115), from the one shape the server hands the
// device (`TrackerRosters`, record 058): the tracker's page when it is drawn, and the
// rosters address when the device refreshes them (a player added a minute ago on another
// device), with the teams' names the league shows.
import type { TrackerRosters } from '@srleagues/contracts';
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
          addedAtGameId: p.addedAtGameId,
          toReview: p.toReview,
        }),
      ),
  });
  return {
    home: team(rosters.homeTeamId),
    away: team(rosters.awayTeamId),
    uniqueJerseys: rosters.uniqueJerseys,
    allowTies: rosters.allowTies,
    statistics: rosters.statistics,
    // The server names players by the scoring screens' rule (R-33): marked, so a copy
    // stored before step 2.226 is told apart (T-484).
    scoringNames: true,
  };
}

/**
 * Whether the scoring screen offers turnovers (S-93, step 2.241): only when the season
 * keeps them. Rosters an older page stored name no statistics: offered, as before; the
 * server still refuses a turnover the season does not keep, and the tap is set aside.
 */
export const keepsTurnovers = (rosters: DeviceRosters): boolean =>
  rosters.statistics === undefined || rosters.statistics.includes('turnovers');

/**
 * The rosters the address gave, kept as the device keeps them, with the teams' names it
 * already holds (the address does not repeat them).
 */
export const refreshedRosters = (kept: DeviceRosters, rosters: TrackerRosters): DeviceRosters =>
  deviceRosters(rosters, {
    [kept.home.teamId]: kept.home.name,
    [kept.away.teamId]: kept.away.name,
  });
