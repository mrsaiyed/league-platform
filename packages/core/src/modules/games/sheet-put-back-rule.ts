// When "Put the sheet back as it was" is allowed, and which sheet it puts back (step 2.229,
// T-366, T-368): the one rule the command (games.put_sheet_back) and the read that offers
// it before the tap (games.read_sheet_put_back_offer) both follow, so no one types a
// reason and is then told it cannot be done.
//
// The game is decided, not overturned, and has no plays: a reopened box score is
// scheduled, so it may be scored live on the tracker, and the old lines written over a
// game that keeps its plays would disagree with them (`scored-live`). The rule looks back
// through the game's corrections, newest first (T-368): it puts back the sheet of the
// newest correction that keeps one, as long as no save since recorded player lines or
// plays. A correction is truthful: its "before" is what the game held then, never a copy
// carried forward. So a reopen whose "before" kept no sheet shows the save before it
// recorded no lines (a final score only, a score within, a forfeit), and the look goes on
// past it; a put back is itself a newer save, so the look stops there (`newer-save`). The
// save that followed the newest correction may be anything, another sheet too (T-366); one
// that recorded lines closes every older correction (`newer-save`).
import { isDecided } from './game-fields.ts';
import type { GameResultDocument, KeptSheet, StoredGameCorrection } from './ports.ts';

export type SheetPutBackRefusal =
  | 'game-not-decided'
  | 'result-overturned'
  /** The game has plays: it was scored live since the reopen (or is tracked). */
  | 'scored-live'
  /** No correction kept a sheet (none, or the game had no lines when reopened). */
  | 'no-sheet-kept'
  /** Something newer was saved on the game: a put back, or a reopen not yet saved again. */
  | 'newer-save';

/** The result and sheet to put back: what the game held before the reopen that kept it. */
export type SheetToPutBack = GameResultDocument & { readonly sheet: KeptSheet };

export type SheetPutBackRuling =
  | { readonly refusal: SheetPutBackRefusal }
  | { readonly refusal?: undefined; readonly restore: SheetToPutBack };

/** Whether the sheet can be put back now, from the game's corrections newest first. */
export function sheetPutBackRuling(
  game: { readonly status: string; readonly overturned?: boolean | undefined },
  saved: { readonly hasPlays: boolean; readonly hasLines: boolean },
  correctionsNewestFirst: readonly StoredGameCorrection[],
): SheetPutBackRuling {
  if (!isDecided(game.status)) return { refusal: 'game-not-decided' };
  if (game.overturned === true) return { refusal: 'result-overturned' };
  if (saved.hasPlays) return { refusal: 'scored-live' };
  for (const [index, correction] of correctionsNewestFirst.entries()) {
    // Looking past the newest: the game's own save since then recorded lines.
    if (index > 0 && saved.hasLines) return { refusal: 'newer-save' };
    // A correction that leaves the game decided is a put back: a newer save.
    if (isDecided(correction.after.status)) return { refusal: 'newer-save' };
    const { sheet } = correction.before;
    if (sheet !== undefined && isDecided(correction.before.status)) {
      return { restore: { ...correction.before, sheet } };
    }
  }
  return { refusal: 'no-sheet-kept' };
}
