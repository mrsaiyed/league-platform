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
// are listed and marked, as the box score grid lists them (R-17). It says how the game is
// recorded, as only a game recorded live is scored in the tracker. It changes nothing,
// but runs in the same shape as a command (record 014).
//
// Step 2.117 (record 058) added what the Players panel needs: whether the season wants
// unique numbers, and for each player whether they were added at a scorer's table, at
// which game, and whether they still wait for an admin's review (only then may the table
// rename them or take them off, S-45).
//
// Step 2.37 (S-73) added whether a level score may end the game: the device refuses End
// game at a level score at once, with or without a signal, when it may not. It is read
// from the rules the game is played under, the same ones the End tap is judged by
// (games.apply_tracker_commands), which stays the judge.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { recordingOf } from '../game-fields.ts';
import { mayScoreGame } from '../policy.ts';
import type { GameRosterPlayer, GamesTx } from '../ports.ts';
import { lowerId } from '../scoring-session.ts';
import { effectiveRulesOf, seasonRulesOf } from '../season-rules-of.ts';
import { keptForScoring } from '../statistic-of-tap.ts';
import { scoringNameSettingsOf } from '../queries/read-scoring-name-view.ts';

/** The game's two teams and their players, by team, roster order and name. */
export type TrackerRosters = {
  readonly gameId: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  /** How the game is recorded: only a game recorded live opens in the tracker. */
  readonly recording: ReturnType<typeof recordingOf>;
  /** Where the game stands (scheduled, live, final...): a game over is not entered again. */
  readonly status: string;
  /** The game's season wants unique numbers on a team (S-37). */
  readonly uniqueJerseys: boolean;
  /** A level score may end the game: the rules it is played under allow ties (S-73). */
  readonly allowTies: boolean;
  /** The statistics the season keeps, as the server takes taps (S-93, step 2.241). */
  readonly statistics: readonly string[];
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
    const players = await tx.games.listRoster(game.id, await scoringNameSettingsOf(tx));
    const { uniqueJerseys } = (await seasonRulesOf(tx, game.seasonId)).rosters;
    const { allowTies } = await effectiveRulesOf(tx, game);
    const statistics = keptForScoring((await tx.games.findSeason(game.seasonId))?.rules);
    return ok({
      gameId: game.id,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      recording: recordingOf(game.captureMode),
      status: game.status,
      uniqueJerseys,
      allowTies,
      statistics,
      players,
    });
  },
});
