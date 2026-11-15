// GET /api/v1/leagues/{leagueId}/games/{game}/rosters (record 058, T-261): the game's two
// rosters for the scorekeeper's device, in the shape the tracker's page hands it when it
// opens the game (record 054), so the device can take a player added a minute ago, on
// another device or at another table, without opening the game again. A thin handler
// (T-25, T-26): who and which league from the context (T-23), the game from the
// address, and one read (games.read_tracker_rosters). The same rules as the tracker's
// other doors (record 039):
//
// - 200 with the rosters, never cached: a team that shows its players to staff only is
//   listed in full, names included.
// - 401 signed-out: no session cookie, or one that ended.
// - 403 not-allowed: may not score this game (mayScoreGame, read fresh).
// - 404 not-found: no such game in this league, one of another league asked for
//   through this one's address included.
//
// Each refusal is the contract's `TrackerRefusal` at its own status.
import {
  trackerRefusalStatus,
  type TrackerRefusal,
  type TrackerRosters,
} from '@srleagues/contracts';
import { readTrackerRosters } from '@srleagues/core';
import { commandContextOf, type LeagueRequestContext } from './context.ts';
import { isGameIdFormat, type ApiAnswer } from './league-api.ts';
import type { TrackerPorts } from './tracker-ports.ts';

const refuse = (body: TrackerRefusal): ApiAnswer => ({
  status: trackerRefusalStatus[body.error],
  body,
});

export async function trackerRostersRequest(
  context: LeagueRequestContext,
  game: string,
  ports: Pick<TrackerPorts, 'deps'>,
): Promise<ApiAnswer> {
  if (context.account === null) return refuse({ error: 'signed-out' });
  if (!isGameIdFormat(game)) return refuse({ error: 'not-found' });
  const result = await readTrackerRosters(commandContextOf(context), { gameId: game }, ports.deps);
  if (!result.ok) {
    return refuse({ error: result.error.code === 'not-allowed' ? 'not-allowed' : 'not-found' });
  }
  const { recording, players, ...rest } = result.value;
  const body: TrackerRosters = {
    ...rest,
    ...(recording === undefined ? {} : { recording }),
    players: players.map((p) => ({
      teamId: p.teamId,
      personId: p.personId,
      firstName: p.firstName,
      lastName: p.lastName,
      jerseyNumber: p.jerseyNumber,
      left: p.left,
    })),
  };
  return { status: 200, body, headers: { 'Cache-Control': 'private, no-store' } };
}
