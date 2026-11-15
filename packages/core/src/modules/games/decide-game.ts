// What recording a final score and recording a forfeit share: a game that has not been
// decided or cancelled becomes decided, under the rules it is played under (S-1): its
// own if it has them, else a copy of its season's, fixed from then on. The database
// stamps `finalized_at` and refuses a score a decided game may not have (T3 §12).
//
// A game the live tracker has recorded plays of is decided only in the tracker (S-46,
// P7 §5.2): two numbers or a forfeit typed by hand would end a game someone is scoring,
// and its plays would no longer explain its result. Every way of deciding a game by hand
// (a final score from the games area or a direct call, a score an import carried, a
// forfeit) opens it through openGameByHand, so none of them can.
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
    | 'team-not-in-game'
    | 'game-is-tracked';
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

/**
 * A game that can still be decided by hand, or the reason it cannot: openGame's, or that
 * the live tracker has recorded plays of it (`game-is-tracked`, S-46). "Plays" is the
 * store's own rule (`hasPlays`): plays since the game was last marked not started, never
 * the players added at its scorer's table. A game set to live tracking with none yet can
 * still be finished by hand.
 *
 * It takes the game's lock first, as the tracker's commands do (T-111), and reads the
 * game under it: a batch of plays in flight (which may change no `games` row, only add
 * lineups) commits first and is seen, and none can arrive until this one has decided.
 */
export async function openGameByHand(
  tx: GamesTx,
  gameId: string,
  /** The version the caller saw; the game's own, as read under the lock, when left out. */
  version: number | undefined,
): Promise<Result<GameRecord, DecideGameError>> {
  if (!(await tx.games.lockGame(gameId))) return fail({ code: 'game-not-found' });
  const found = await tx.games.find(gameId);
  const open = openGame(found, version ?? found?.version ?? 0);
  if (!open.ok) return open;
  if (await tx.games.hasPlays(open.value.id)) return fail({ code: 'game-is-tracked' });
  return open;
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
  /** How the game is now recorded, when deciding it changes that (a box score: `box`). */
  readonly captureMode?: 'final' | 'box' | 'live';
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
      ...(args.captureMode === undefined ? {} : { captureMode: args.captureMode }),
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
