// The games waiting to be rescheduled (P7 §5.6), soonest first, of one season or all.
// It changes nothing, but runs in the same shape as a command (record 014).
import { z } from 'zod';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { recordingOf } from '../game-fields.ts';
import { mayReadGames } from '../policy.ts';
import type { GameRecord, GamesTx } from '../ports.ts';

/** A waiting game as the list shows it. */
export type PostponedGame = {
  readonly id: string;
  readonly seasonId: string;
  readonly divisionId: string | null;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  /** When it was to be played, if it had a date. */
  readonly startsAt: string | null;
  readonly recording: ReturnType<typeof recordingOf>;
  readonly version: number;
};

const view = (game: GameRecord): PostponedGame => ({
  id: game.id,
  seasonId: game.seasonId,
  divisionId: game.divisionId,
  homeTeamId: game.homeTeamId,
  awayTeamId: game.awayTeamId,
  startsAt: game.startsAt,
  recording: recordingOf(game.captureMode),
  version: game.version,
});

export const listPostponedGames = defineCommand({
  name: 'games.list_postponed_games',
  permission: 'schedule.read',
  input: z.object({ seasonId: z.uuid().optional() }),
  allowed: (context, _input, tx: GamesTx) => mayReadGames(context, tx, 'schedule.read'),
  run: async ({ input, tx }): Promise<Result<readonly PostponedGame[], never>> =>
    ok((await tx.games.listPostponed(input.seasonId)).map(view)),
});
