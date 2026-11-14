// GET /api/v1/leagues/{leagueId}/games/{game}/state (T6 §1, §3; T-113; record 049,
// T-253): the engine's state as the server holds it, for the scorekeeper's device to
// load when it opens the game and to reload after a refused tap. A thin handler (T-25,
// T-26): who and which league from the context (T-23), the game from the address, and
// one read (games.read_tracker_state). The same rules as the tracker's other doors
// (record 039):
//
// - 200 with the state and its sequence number, never cached: it names every player
//   by id, a team that shows its numbers to staff only included.
// - 401 signed-out: no session cookie, or one that ended.
// - 403 not-allowed: may not score this game.
// - 404 not-found: no such game in this league, one of another league asked for
//   through this one's address included.
import type { TrackerGameState } from '@srleagues/contracts';
import { readTrackerState } from '@srleagues/core';
import { commandContextOf, type LeagueRequestContext } from './context.ts';
import { isGameIdFormat, type ApiAnswer } from './league-api.ts';
import type { TrackerPorts } from './tracker-ports.ts';

const notFound: ApiAnswer = { status: 404, body: { error: 'not-found' } };

export async function trackerStateRequest(
  context: LeagueRequestContext,
  game: string,
  ports: Pick<TrackerPorts, 'deps'>,
): Promise<ApiAnswer> {
  if (context.account === null) return { status: 401, body: { error: 'signed-out' } };
  if (!isGameIdFormat(game)) return notFound;
  const result = await readTrackerState(commandContextOf(context), { gameId: game }, ports.deps);
  if (!result.ok) {
    return result.error.code === 'not-allowed'
      ? { status: 403, body: { error: 'not-allowed' } }
      : notFound;
  }
  const body: TrackerGameState = result.value;
  return { status: 200, body, headers: { 'Cache-Control': 'private, no-store' } };
}
