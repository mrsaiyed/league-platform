// What ending and reopening a tracked game share (step 2.30, T6 §7 and §8). Ending is
// taken two ways: the tracker's own End game tap, in the batch that carries it
// (apply_tracker_commands), and games.end_tracked_game. Either way, in the one
// transaction that saved the end: the box score lines are settled, the game becomes
// final with its scores (the database works out the winner), it is written to the
// activity log, and `games.finalized` is announced, so the standings and season totals
// are worked out again by their handlers in the same transaction (step 2.24). If any
// of it fails, none of it is saved.
//
// Reopening a tracked game (games.reopen_game) hands it back to the tracker: the
// engine's own reopen is applied, so the event log shows it, the game is live again
// with the score its plays give, and the lines are what the plays give, without the
// did-not-play lines, until it is ended again. The game's lock is held throughout by
// the command (T-111).
import { basketball } from '@srleagues/sports';
import type { SeasonRules } from '@srleagues/contracts';
import { recordActivity } from '../access/index.ts';
import type { CommandContext } from '../../command/index.ts';
import { gameFinalized, type GameFinalized } from '../../events/game-events.ts';
import {
  changedLines,
  linesByPerson,
  linesOf,
  readState,
  rosterOf,
  scoreOf,
  settledLines,
} from './live-game.ts';
import type { GameRecord, LiveGameLine, SavedGameState, TrackerTx } from './ports.ts';

/** The action ending a tracked game is logged under, whichever way it was taken. */
export const endTrackedGameAction = 'games.end_tracked_game';

/** Where a game's status and score stand while its tracker has it (not final). */
export function liveResultOf(state: basketball.GameState) {
  if (state.status === 'scheduled') {
    return { status: 'scheduled', homeScore: null, awayScore: null } as const;
  }
  const score = scoreOf(state);
  return { status: 'live', homeScore: score.home, awayScore: score.away } as const;
}

/** Writes the lines that differ from those saved, and takes out those no longer there. */
async function saveLinesAs(
  tx: TrackerTx,
  gameId: string,
  wanted: ReadonlyMap<string, LiveGameLine>,
): Promise<void> {
  const changed = changedLines(linesByPerson(await tx.liveGames.lines(gameId)), wanted);
  if (changed.lines.length > 0 || changed.removed.length > 0) {
    await tx.liveGames.saveLines(gameId, changed.lines, changed.removed);
  }
}

/**
 * Settles a game whose saved state the engine has just ended: its lines, its final
 * result, the log and the announcement. `game` is as read after the lock, at
 * `game.version`; `rules` are the ones the game is played under, fixed on it now if
 * it has none of its own (S-1). The new version of the game.
 */
export async function finishTrackedGame(args: {
  readonly context: CommandContext;
  readonly tx: TrackerTx;
  readonly emit: (event: GameFinalized) => void;
  readonly game: GameRecord;
  readonly state: basketball.GameState;
  readonly rules: SeasonRules;
}): Promise<number> {
  const { context, tx, game, state } = args;
  if (state.status !== 'final') throw new Error('Only an ended game is settled.');
  const players = await tx.liveGames.players(game.id);
  await saveLinesAs(tx, game.id, settledLines(game, players, state));
  const score = scoreOf(state);
  const updated = await tx.games.setResult(
    game.id,
    {
      status: 'final',
      homeScore: score.home,
      awayScore: score.away,
      decided: true,
      ...(game.format === null ? { format: args.rules } : {}),
    },
    game.version,
  );
  // The game is locked and was read after the lock: it cannot have moved on.
  if (updated === undefined) throw new Error('A locked game changed while it was ended.');
  await recordActivity(tx, context, {
    action: endTrackedGameAction,
    target: { type: 'game', id: game.id },
  });
  args.emit({
    type: gameFinalized,
    leagueId: context.leagueId,
    gameId: game.id,
    seasonId: game.seasonId,
  });
  return updated;
}

/**
 * Hands a decided game that has a saved state back to its tracker: the engine's
 * reopen applied and logged as an event of the account reopening it (when the state
 * had ended; a game decided by hand while its tracker was live keeps its state), the
 * did-not-play lines taken out, and the result the game goes back to. Writing the
 * result, with its correction, is the reopening command's.
 */
export async function handBackTrackedGame(
  tx: TrackerTx,
  game: GameRecord,
  saved: SavedGameState,
  accountId: string,
  commandId: string,
): Promise<ReturnType<typeof liveResultOf>> {
  let state = readState(saved.state);
  if (state.status === 'final') {
    const now = tx.clock.now();
    state = basketball.apply(state, { type: 'reopen' }, { id: commandId, now });
    const seq = saved.seq + 1;
    await tx.liveGames.addEvents([
      { gameId: game.id, seq, commandId, type: 'reopen', payload: {}, tappedAt: now, accountId },
    ]);
    await tx.liveGames.saveState(game.id, seq, state);
  }
  const roster = rosterOf(await tx.liveGames.players(game.id));
  await saveLinesAs(tx, game.id, linesOf(game, roster, state));
  return liveResultOf(state);
}
