// Records a game's final score inside a transaction that is already open, for a command
// of another module that brings results in (the fixture import, step 2.22). It judges the
// score as record_final_score does: a tie is refused unless the game's rules allow ties,
// and a game already decided or cancelled is left alone. It does not check permission:
// the calling command has done that for the game's season. A reopened box score game
// finalized here with two numbers only loses its old lines, as record_final_score does
// (S-27), so they no longer count in totals.
import { fail, type CommandContext, type Result } from '../../command/index.ts';
import { decideGame, openGame, type DecideGameError } from './decide-game.ts';
import type { GameFinalized } from '../../events/game-events.ts';
import type { GamesTx } from './ports.ts';
import { effectiveRulesOf } from './season-rules-of.ts';

export async function recordFinalScoreWithin(args: {
  readonly context: CommandContext;
  readonly tx: GamesTx;
  readonly emit: (event: GameFinalized) => void;
  readonly gameId: string;
  /** The version the caller saw; the game's current one when left out. */
  readonly version?: number;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly action: string;
}): Promise<Result<{ version: number }, DecideGameError>> {
  const { context, tx, emit } = args;
  const found = await tx.games.find(args.gameId);
  const version = args.version ?? found?.version ?? 0;
  const open = openGame(found, version);
  if (!open.ok) return open;
  const game = open.value;
  if (args.homeScore === args.awayScore) {
    const rules = await effectiveRulesOf(tx, game);
    if (!rules.allowTies) return fail({ code: 'tie-not-allowed' });
  }
  const wasBox = game.captureMode === 'box';
  if (wasBox) await tx.games.replaceLines(game.id, []);
  return decideGame({
    context,
    tx,
    emit,
    game,
    version,
    action: args.action,
    status: 'final',
    homeScore: args.homeScore,
    awayScore: args.awayScore,
    ...(wasBox ? { captureMode: 'final' as const } : {}),
  });
}
