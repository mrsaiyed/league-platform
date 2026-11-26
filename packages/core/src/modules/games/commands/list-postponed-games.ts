// The games waiting to be rescheduled (P7 §5.6), soonest first, of one season or all.
// It changes nothing, but runs in the same shape as a command (record 014).
//
// Since step 2.227 (T-473) it answers by what the holder may see: a game only when they
// hold `schedule.read` at its season's program, the rule a season's draft is read by
// (maySeeSchedule), so a scheduler limited to one program gets only that program's
// postponed games, and a season not public yet is never named to someone who may not
// see it. The owner and anyone holding it league-wide get every one, as before.
import { z } from 'zod';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { accessOfAccount, allows } from '../../access/index.ts';
import { recordingOf } from '../game-fields.ts';
import { mayReadGames, seasonScope } from '../policy.ts';
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
  run: async ({ context, input, tx }): Promise<Result<readonly PostponedGame[], never>> => {
    const holder =
      context.accountId === null ? undefined : await accessOfAccount(tx, context.accountId);
    if (holder === undefined) return ok([]);
    const waiting = await tx.games.listPostponed(input.seasonId);
    const seen = new Map<string, boolean>();
    for (const seasonId of new Set(waiting.map((game) => game.seasonId))) {
      seen.set(seasonId, allows(holder, 'schedule.read', await seasonScope(tx, seasonId)));
    }
    return ok(waiting.filter((game) => seen.get(game.seasonId) === true).map(view));
  },
});
