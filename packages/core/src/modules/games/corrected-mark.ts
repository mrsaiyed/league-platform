// When a game reads "Corrected" in public (S-81, S-8; step 2.56). Every reopen is a
// correction row and stays in the activity log, but the public mark is S-8's own test:
// it shows only when the result at the NEXT final differs from the result the reopen
// took back (the score, or how it was decided: a final against a forfeit). So a
// scorekeeper's slip undone within their reopen window, ended again with the same score,
// carries no mark, and neither does a reopen that is still open: the game is not final,
// so there is nothing yet to compare.
//
// The corrections come oldest first. The result at the next final after one correction is
// the result the next correction took back (it reopened that final), or, for the latest,
// the game's own result if it is decided now. The mark is dated by the latest correction
// that changed something; earlier ones that did still count when a later reopen changed
// nothing.
//
// A put back of the sheet (games.put_sheet_back, step 2.229, S-98) is a correction that
// leaves the game decided: it undoes the save that followed the reopen before it. It is
// read as the end of that reopen: the reopen's next final is the result the put back left,
// and the put back marks nothing of its own. So a put back that returns the result to what
// it was before the reopen leaves no mark from that reopen, while an earlier correction that
// did change the result keeps its mark and date. A put back restores the sheet of the
// newest reopen that kept one, looking back past reopens whose save kept no lines (T-368):
// it ends that reopen, and the reopens between are part of the slip and mark nothing.
// Where no correction says whether it kept a sheet, the put back ends the reopen before it.
// Where they do say and no earlier reopen kept a sheet, a correction that left the game
// decided cannot be a put back (one always restores a kept sheet): it is an ordinary
// correction of the result, read as before step 2.229.
import { isDecided } from './game-fields.ts';

/** A game's result as a correction keeps it, or as the game holds it now. */
export type MarkResult = {
  readonly status?: string | null | undefined;
  readonly homeScore?: number | null | undefined;
  readonly awayScore?: number | null | undefined;
};

export type MarkCorrection = {
  /** The date the public reads, already in the league's time zone. */
  readonly on: string;
  /** The result the reopen took back. */
  readonly before: MarkResult;
  /** The result the correction left: undecided for a reopen, decided for a put back (S-98). */
  readonly after?: MarkResult | undefined;
  /** Whether its "before" kept a sheet (T-365): the reopen a later put back restores. */
  readonly keptSheet?: boolean | undefined;
};

const isPutBack = (correction: MarkCorrection) =>
  correction.after !== undefined && isDecided(correction.after.status ?? '');

const sameResult = (a: MarkResult, b: MarkResult) =>
  (a.status ?? null) === (b.status ?? null) &&
  (a.homeScore ?? null) === (b.homeScore ?? null) &&
  (a.awayScore ?? null) === (b.awayScore ?? null);

/** The date the game reads "Corrected" on, or undefined when no correction changed its result. */
export function correctedMarkDate(
  corrections: readonly MarkCorrection[],
  game: MarkResult & { readonly status: string },
): string | undefined {
  // Each put back ends the reopen it undid; it and the reopens between mark nothing.
  const endedBy = new Map<number, MarkResult | undefined>();
  const part = new Set<number>();
  const told = corrections.some((correction) => correction.keptSheet !== undefined);
  corrections.forEach((correction, at) => {
    if (!isPutBack(correction)) return;
    let undid = at - 1;
    while (undid >= 0) {
      const earlier = corrections[undid];
      if (earlier !== undefined && !isPutBack(earlier) && earlier.keptSheet === true) break;
      undid -= 1;
    }
    if (undid < 0 && told) return;
    if (undid < 0) undid = at - 1;
    for (let k = undid + 1; k <= at; k += 1) part.add(k);
    if (undid >= 0) endedBy.set(undid, correction.after);
  });
  let marked: string | undefined;
  corrections.forEach((correction, index) => {
    if (part.has(index)) return;
    const next = corrections[index + 1];
    const nextFinal = endedBy.has(index)
      ? endedBy.get(index)
      : next === undefined
        ? isDecided(game.status)
          ? game
          : undefined
        : next.before;
    if (nextFinal !== undefined && !sameResult(correction.before, nextFinal))
      marked = correction.on;
  });
  return marked;
}
