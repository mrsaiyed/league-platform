// What the "edit box score" grid of a live-tracked game shows (step 2.65, T6 §8): each
// player's line as the game's plays give it (the engine's state, which is its event log
// replayed), both teams' rosters on the game's day with no line yet as zeros, the number
// of the game's last event (handed back with the save, games.correct_tracked_box_score)
// and whether the grid may be saved now: reopened with a reason, that reopen still open.
// Minutes are the clock's, shown and never typed. For whoever may correct the game.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { isDecided } from '../game-fields.ts';
import { settledLines, readState } from '../live-game.ts';
import { gameScope, mayChangeGames } from '../policy.ts';
import type { TrackerTx } from '../ports.ts';

export type TrackedGridRow = {
  readonly teamId: string;
  readonly personId: string;
  readonly jerseyNumber: string | null;
  readonly secondsPlayed: number;
  readonly points: number;
  readonly fg1: number;
  readonly fg2: number;
  readonly fg3: number;
  readonly fouls: number;
  readonly turnovers: number;
};

export type TrackedBoxScore = {
  readonly gameId: string;
  readonly sequence: number;
  /** Reopened with a reason and not ended again: the save is taken. */
  readonly correctable: boolean;
  /** Why not, when it is not: still final, never ended, or not live at all. */
  readonly notCorrectable?: 'game-final' | 'reason-needed' | 'game-not-live';
  readonly lines: readonly TrackedGridRow[];
};

export type ReadTrackedBoxScoreError = { readonly code: 'game-not-found' | 'not-tracked' };

const n = (stats: Readonly<Record<string, number>>, key: string) => stats[key] ?? 0;

export const readTrackedBoxScore = defineCommand({
  name: 'games.read_tracked_box_score',
  permission: 'games.correct',
  input: z.object({ gameId: z.uuid() }),
  allowed: async (context, input, tx: TrackerTx) =>
    mayChangeGames(context, tx, 'games.correct', await gameScope(tx, input.gameId)),
  run: async ({ input, tx }): Promise<Result<TrackedBoxScore, ReadTrackedBoxScoreError>> => {
    const gameId = input.gameId.toLowerCase();
    const game = await tx.games.find(gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    const saved = await tx.liveGames.findState(gameId);
    if (saved === undefined || !(await tx.games.hasPlays(gameId))) {
      return fail({ code: 'not-tracked' });
    }
    const sequence = Math.max(saved.seq, await tx.liveGames.lastEventSeq(gameId));
    const [newest] = await tx.games.correctionsNewestFirst(gameId);
    const notCorrectable = isDecided(game.status)
      ? ('game-final' as const)
      : game.status !== 'live'
        ? ('game-not-live' as const)
        : newest === undefined || newest.after.status !== 'live'
          ? ('reason-needed' as const)
          : undefined;
    const players = await tx.liveGames.players(gameId);
    const lines = [...settledLines(game, players, readState(saved.state)).values()].map(
      (line): TrackedGridRow => ({
        teamId: line.teamId,
        personId: line.personId,
        jerseyNumber: line.jerseyNumber,
        secondsPlayed: line.secondsPlayed ?? 0,
        points: n(line.stats, 'points'),
        fg1: n(line.stats, 'fg1'),
        fg2: n(line.stats, 'fg2'),
        fg3: n(line.stats, 'fg3'),
        fouls: n(line.stats, 'fouls'),
        turnovers: n(line.stats, 'turnovers'),
      }),
    );
    return ok({
      gameId,
      sequence,
      correctable: notCorrectable === undefined,
      ...(notCorrectable === undefined ? {} : { notCorrectable }),
      lines,
    });
  },
});
