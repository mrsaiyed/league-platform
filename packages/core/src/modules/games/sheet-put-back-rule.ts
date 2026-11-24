// When "Put the sheet back as it was" is allowed (step 2.229, T-366): the one rule the
// command (games.put_sheet_back) and the read that offers it before the tap
// (games.read_sheet_put_back_offer) both follow, so no one types a reason and is then told
// it cannot be done. The game is decided, not overturned, and its newest correction is the
// reopen that kept a sheet: a correction that leaves the game decided is itself a put back,
// saved after the save that followed the reopen.
import { isDecided } from './game-fields.ts';
import type { StoredGameCorrection } from './ports.ts';

export type SheetPutBackRefusal =
  | 'game-not-decided'
  | 'result-overturned'
  /** The newest correction kept no sheet (none, or the game had no lines when reopened). */
  | 'no-sheet-kept'
  /** Something newer was saved on the game after the save that followed the reopen. */
  | 'newer-save';

/** Why the sheet cannot be put back now, or undefined when it can. */
export function sheetPutBackRefusal(
  game: { readonly status: string; readonly overturned?: boolean | undefined },
  newest: StoredGameCorrection | undefined,
): SheetPutBackRefusal | undefined {
  if (!isDecided(game.status)) return 'game-not-decided';
  if (game.overturned === true) return 'result-overturned';
  if (newest === undefined) return 'no-sheet-kept';
  if (isDecided(newest.after.status)) return 'newer-save';
  if (newest.before.sheet === undefined || !isDecided(newest.before.status)) return 'no-sheet-kept';
  return undefined;
}
