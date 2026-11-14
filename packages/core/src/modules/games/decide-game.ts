// What recording a final score and recording a forfeit share: a game that has not been
// decided or cancelled becomes decided, under the rules it is played under (S-1): its
// own if it has them, else a copy of its season's, fixed from then on. The database
// stamps `finalized_at` and refuses a score a decided game may not have (T3 §12).
import { recordActivity } from '../access/index.ts';
import { fail, ok, type CommandContext, type Result } from '../../command/index.ts';
import { gameFinalized, type GameFinalized } from '../../events/game-events.ts';
import { isDecided } from './game-fields.ts';
import type { GameRecord, GamesTx } from './ports.ts';
import { seasonRulesOf } from './season-rules-of.ts';

export type DecideGameError = {
  readonly code:
    | 'game-not-found'
    | 'changed-since-read'
    | 'game-already-decided'
    | 'game-cancelled'
    | 'tie-not-allowed'
    | 'team-not-in-game';
};

/** A game that can still be decided, or the reason it cannot. */
export function openGame(
  game: GameRecord | undefined,
  version: number,
): Result<GameRecord, DecideGameError> {
  if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
  if (game.version !== version) return fail({ code: 'changed-since-read' });
  if (isDecided(game.status)) return fail({ code: 'game-already-decided' });
  if (game.status === 'cancelled') return fail({ code: 'game-cancelled' });
  return ok(game);
}

export async function decideGame(args: {
  readonly context: CommandContext;
  readonly tx: GamesTx;
  readonly emit: (event: GameFinalized) => void;
  readonly game: GameRecord;
  readonly version: number;
  readonly action: string;
  readonly status: 'final' | 'forfeit';
  readonly homeScore: number;
  readonly awayScore: number;
}): Promise<Result<{ version: number }, DecideGameError>> {
  const { context, tx, game } = args;
  const rules = await seasonRulesOf(tx, game.seasonId);
  const updated = await tx.games.setResult(
    game.id,
    {
      status: args.status,
      homeScore: args.homeScore,
      awayScore: args.awayScore,
      decided: true,
      ...(game.format === null ? { format: rules } : {}),
    },
    args.version,
  );
  if (updated === undefined) return fail({ code: 'changed-since-read' });
  await recordActivity(tx, context, {
    action: args.action,
    target: { type: 'game', id: game.id },
  });
  args.emit({
    type: gameFinalized,
    leagueId: context.leagueId,
    gameId: game.id,
    seasonId: game.seasonId,
  });
  return ok({ version: updated });
}
