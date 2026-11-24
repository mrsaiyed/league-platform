// Puts a box score back as it was before its game was last reopened (step 2.229, A-5,
// T-366): for an admin who reopened a box score and then saved the wrong thing (a final
// score only, a forfeit, a score within, or another sheet). The newest correction's
// "before" kept the game's lines, ids and numbers only (kept-sheet.ts, T-365); this
// writes every one of them back, with the result, how it was recorded and its overtime,
// and the game is decided again: the standings and totals follow (`games.finalized`).
//
// The game was decided, so changing its result writes a correction of its own in the
// same transaction (S-7; the database's guard, migration 0011), with a reason, whose
// "before" keeps the lines this replaces, if any. A correction already written is never
// changed (T-45). It is offered only while the newest correction is the reopen that kept
// the sheet and the game has been saved once since: once something newer is saved on
// the game (a put back is itself one; reopening it again writes a newer correction), it
// is refused in plain words. It carries the game's version (T-46), so a double tap or
// an old page is refused before anything is written. Who may: as for reopening a game
// (`games.correct`, the game's scope).
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { gameFinalized, type GameFinalized } from '../../../events/game-events.ts';
import { correctionReason, gameVersion, isDecided } from '../game-fields.ts';
import { sheetToKeep } from '../kept-sheet.ts';
import { gameScope, mayChangeGames } from '../policy.ts';
import type { TrackerTx } from '../ports.ts';

export type PutSheetBackError = {
  readonly code:
    | 'game-not-found'
    | 'changed-since-read'
    | 'not-allowed'
    | 'game-not-decided'
    | 'result-overturned'
    /** The newest correction kept no sheet (none, or the game had no lines when reopened). */
    | 'no-sheet-kept'
    /** Something newer was saved on the game after the save that followed the reopen. */
    | 'newer-save';
};

export const putSheetBack = defineCommand({
  name: 'games.put_sheet_back',
  permission: 'games.correct',
  input: z.object({ gameId: z.uuid(), version: gameVersion, reason: correctionReason }),
  allowed: async (context, input, tx: TrackerTx) =>
    mayChangeGames(context, tx, 'games.correct', await gameScope(tx, input.gameId)),
  run: async ({
    context,
    input,
    tx,
    emit,
  }): Promise<Result<{ version: number }, PutSheetBackError>> => {
    if (!(await tx.games.lockGame(input.gameId))) return fail({ code: 'game-not-found' });
    const game = await tx.games.find(input.gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    if (game.version !== input.version) return fail({ code: 'changed-since-read' });
    if (context.accountId === null) return fail({ code: 'not-allowed' });
    if (!isDecided(game.status)) return fail({ code: 'game-not-decided' });
    if (game.overturned === true) return fail({ code: 'result-overturned' });
    const newest = await tx.games.newestCorrection(game.id);
    if (newest === undefined) return fail({ code: 'no-sheet-kept' });
    // A reopen leaves the game undecided; a correction that leaves it decided is a put
    // back, saved after the save that followed the reopen.
    if (isDecided(newest.after.status)) return fail({ code: 'newer-save' });
    const kept = newest.before;
    if (kept.sheet === undefined || !isDecided(kept.status)) return fail({ code: 'no-sheet-kept' });
    const replaced = await sheetToKeep(tx, game);
    await tx.games.addCorrection({
      gameId: game.id,
      accountId: context.accountId,
      reason: input.reason,
      before: {
        version: 1 as const,
        status: game.status,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        ...(replaced === undefined ? {} : { sheet: replaced }),
      },
      after: {
        version: 1 as const,
        status: kept.status,
        homeScore: kept.homeScore,
        awayScore: kept.awayScore,
      },
    });
    await tx.games.replaceLines(
      game.id,
      kept.sheet.lines.map((line) => ({ gameId: game.id, ...line })),
    );
    const updated = await tx.games.setResult(
      game.id,
      {
        status: kept.status,
        homeScore: kept.homeScore,
        awayScore: kept.awayScore,
        decided: true,
        decidedBy: context.accountId,
        overtimePeriods: kept.sheet.overtimePeriods,
        captureMode: kept.sheet.captureMode,
      },
      input.version,
    );
    if (updated === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'games.put_sheet_back',
      target: { type: 'game', id: game.id },
    });
    const event: GameFinalized = {
      type: gameFinalized,
      leagueId: context.leagueId,
      gameId: game.id,
      seasonId: game.seasonId,
    };
    emit(event);
    return ok({ version: updated });
  },
});
