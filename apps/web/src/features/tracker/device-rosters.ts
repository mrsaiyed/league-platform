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

/**
 * A fresh answer wins for names (T-487): the rosters just fetched, with players of the
 * copy kept before laid over only where the server does not know them yet, a player
 * added at the table whose change still waits (`waitingAdds`, their ids, step 2.118).
 * A player the server knows keeps the server's name and number, whatever the kept copy
 * says: an admin's switch or a person's own request reaches the device at its next fetch.
 */
export function freshOverKept(
  fresh: DeviceRosters,
  kept: DeviceRosters,
  waitingAdds: ReadonlySet<string>,
): DeviceRosters {
  const side = (team: DeviceTeam, keptTeam: DeviceTeam): DeviceTeam => {
    const known = new Set(team.players.map((p) => p.personId.toLowerCase()));
    const unknown = keptTeam.players.filter((p) => {
      const id = p.personId.toLowerCase();
      return !known.has(id) && waitingAdds.has(id);
    });
    return unknown.length === 0 ? team : { ...team, players: [...team.players, ...unknown] };
  };
  return { ...fresh, home: side(fresh.home, kept.home), away: side(fresh.away, kept.away) };
}
