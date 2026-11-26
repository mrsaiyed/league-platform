// The game's two rosters in the one shape the scorekeeper's device is given (record 054,
// record 058): the contract's `TrackerRosters`, from the staff read
// (games.read_tracker_rosters). The tracker's page and the rosters address
// (GET …/games/{game}/rosters) both hand it over through this, so the device never
// sees two shapes of the same rosters. The names are already those the scoring screens'
// rule gives (R-33, the games store's roster read): nothing else of a name is added here.
import type { TrackerRosters } from '@srleagues/contracts';
import type { TrackerRosters as RostersRead } from '@srleagues/core';

export function trackerRostersReply(read: RostersRead): TrackerRosters {
  const { recording, players, statistics, ...rest } = read;
  return {
    ...rest,
    statistics: [...statistics],
    ...(recording === undefined ? {} : { recording }),
    players: players.map((p) => ({
      teamId: p.teamId,
      personId: p.personId,
      firstName: p.firstName,
      lastName: p.lastName,
      ordinal: p.ordinal,
      jerseyNumber: p.jerseyNumber,
      left: p.left,
      addedAtGameId: p.addedAtGameId ?? null,
      toReview: p.needsReview ?? false,
    })),
  };
}
