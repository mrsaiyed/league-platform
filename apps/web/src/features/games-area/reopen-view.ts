// What a final or forfeited game says about putting it right, to the person looking (step
// 2.154; P7 §5.5, S-36): "Correct this result" for whoever may reopen it, and who can for
// everyone else. Two doors reopen a game and the page offers the one that will accept:
//
// - a game its tracker ended goes through the tracker's own door
//   (games.reopen_tracked_game), whose answer is read before the tap
//   (games.read_reopen_offer, the read the tracker uses): someone who may correct games at
//   any time, the scorekeeper who ended it within the league's minutes;
// - any other decided game (a final score or a box score typed by hand, a forfeit) through
//   games.reopen_game, for someone who may correct games at its program;
// - the same game, for the scorekeeper who recorded it, within the league's minutes,
//   through games.reopen_own_result (step 2.177, S-52), whose answer is read before the
//   tap too (games.read_own_result_offer).
import type {
  BoxScoreSheet,
  GameReopenOffer as ReopenOffer,
  OwnResultOffer,
} from '@srleagues/core';

/** Which door reopens the game for this person. */
export type ReopenDoor = 'tracked' | 'by-hand' | 'own';

export type ReopenView =
  /** They may reopen it: by this door, and until this server time (ms) when it closes. */
  | { readonly kind: 'correct'; readonly door: ReopenDoor; readonly until: number | null }
  /** They may not: who can, and why not them. */
  | { readonly kind: 'who'; readonly because: 'admins' | 'time-over' | 'overturned' }
  /** Nothing to say: no door would accept anyone's reopening here. */
  | { readonly kind: 'none' };

/**
 * A result recorded by hand, for someone who may not correct games: their own door while
 * they recorded it and the league's minutes run, else who can (step 2.177, S-52).
 * `own` is games.read_own_result_offer's answer (undefined when it was not read).
 */
export function ownReopenViewOf(own: OwnResultOffer | undefined): ReopenView {
  const when = own?.reopen;
  if (when?.when === 'until') return { kind: 'correct', door: 'own', until: when.until };
  if (when?.when === 'always') return { kind: 'correct', door: 'own', until: null };
  if (when?.code === 'game-not-decided') return { kind: 'none' };
  if (when?.code === 'result-overturned') return { kind: 'who', because: 'overturned' };
  return { kind: 'who', because: when?.code === 'reopen-time-over' ? 'time-over' : 'admins' };
}

/**
 * `offer` is the tracker's answer for this person (undefined when it was not read),
 * `mayCorrect` whether they may correct games at the game's program (games.correct), and
 * `own` the answer for a result they recorded by hand (step 2.177).
 */
export function reopenViewOf(
  offer: ReopenOffer | undefined,
  mayCorrect: boolean,
  own?: OwnResultOffer,
): ReopenView {
  const when = offer?.reopen;
  if (when?.when === 'always') return { kind: 'correct', door: 'tracked', until: null };
  if (when?.when === 'until') return { kind: 'correct', door: 'tracked', until: when.until };
  if (when === undefined || when.code === 'not-ended-by-tracker') {
    // Decided by hand: the admin's door, for whoever may correct games.
    return mayCorrect ? { kind: 'correct', door: 'by-hand', until: null } : ownReopenViewOf(own);
  }
  if (when.code === 'game-not-decided') return { kind: 'none' };
  // Theirs to reopen, but an overturn rules on the result (S-85).
  if (when.code === 'result-overturned') return { kind: 'who', because: 'overturned' };
  return { kind: 'who', because: when.code === 'reopen-time-over' ? 'time-over' : 'admins' };
}

type SheetFacts = Pick<BoxScoreSheet, 'mayReopen' | 'mayCorrect' | 'locked'> & {
  readonly game: Pick<BoxScoreSheet['game'], 'status' | 'overturned'>;
};

/** Whether the game's page needs the tracker's read to know: a decided game locked as tracked. */
export function sheetNeedsOffer(sheet: SheetFacts): boolean {
  return (
    !sheet.mayReopen &&
    sheet.locked === 'tracked' &&
    (sheet.game.status === 'final' || sheet.game.status === 'forfeit')
  );
}

/**
 * What the game's own page (its reopen form) offers this person: the admin's door as the
 * sheet says; for a decided game locked as tracked, the tracker's answer, or, for one
 * decided by hand while it had plays, the admin's door to whoever may correct games
 * (games.reopen_game hands it back to its tracker, S-46); nothing for any other.
 */
export function sheetReopenViewOf(
  sheet: SheetFacts,
  offer: ReopenOffer | undefined,
  /** For a result recorded by hand, games.read_own_result_offer's answer (step 2.177). */
  own?: OwnResultOffer,
): ReopenView {
  const view: ReopenView = sheet.mayReopen
    ? { kind: 'correct', door: 'by-hand', until: null }
    : sheetNeedsOffer(sheet)
      ? reopenViewOf(offer, sheet.mayCorrect, own)
      : own === undefined
        ? { kind: 'none' }
        : ownReopenViewOf(own);
  // An overturn rules on the result: say where to go instead (S-85).
  return view.kind === 'correct' && sheet.game.overturned === true
    ? { kind: 'who', because: 'overturned' }
    : view;
}
