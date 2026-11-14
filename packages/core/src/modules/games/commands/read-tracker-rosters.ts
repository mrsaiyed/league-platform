// The two teams' rosters for the scorekeeper's device (T6 §4, T-115; record 054, T-258):
// which team is home and which away, and the players of each, with their names and
// numbers, stored on the device when the scorekeeper opens the game so the tracker can
// show them with no signal. The engine's state (games.read_tracker_state) names players
// by id only; this is where the names come from.
//
// It is a staff read, like the state: a team that shows its players to staff only
// (S-22) is listed in full, so only whoever may score the game may read it
// (`games.score`, mayScoreGame, read fresh, T-75). Only names and numbers are read,
// never birth dates or contact details (R-16). Players who have left the team since
// are listed and marked, as the box score grid lists them (R-17). It changes nothing,
// but runs in the same shape as a command (record 014).
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayScoreGame } from '../policy.ts';
import type { GameRosterPlayer, GamesTx } from '../ports.ts';
import { lowerId } from '../scoring-session.ts';

/** The game's two teams and their players, by team, roster order and name. */
export type TrackerRosters = {
  readonly gameId: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly players: readonly GameRosterPlayer[];
};

export type ReadTrackerRostersError = { readonly code: 'game-not-found' };

export const readTrackerRosters = defineCommand({
  name: 'games.read_tracker_rosters',
  permission: 'games.score',
  input: z.object({ gameId: lowerId }),
  allowed: (context, input, tx: GamesTx) => mayScoreGame(context, tx, input.gameId),
  run: async ({ input, tx }): Promise<Result<TrackerRosters, ReadTrackerRostersError>> => {
    const game = await tx.games.find(input.gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    const players = await tx.games.listRoster(game.id);
    return ok({
      gameId: game.id,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      players,
    });
  },
});
