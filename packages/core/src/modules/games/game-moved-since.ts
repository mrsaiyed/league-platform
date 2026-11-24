// "Send these plays" (S-43, T-335): whether a game moved since plays listed as not
// saved were made. The device names the sequence it last had from the server while it
// held the game (`notSavedSince`), and the server bounds it by where it last answered
// that session itself (`heard`): a device never names a later one. The game has not
// moved if every event the server took after it is explained: one of these very plays,
// whoever recorded it (a batch whose answer was lost, a second send, or an uploaded copy
// of the device's, T-370), an End or a reopen by the sender (step 2.148: an End and a
// reopen by the scorekeeper are not "someone recorded something in between"), or an
// event up to `sent`, which the server writes only up to where the events were already
// explained (T-372), so it is looked past whoever recorded it.
// Anything else, a play from another device, a change of players, a marking not
// started, or too many events to look through, and it moved: each play is entered
// again. Sending the same plays twice adds nothing: their command ids are taken.
import type { TrackerTx } from './ports.ts';

/** Ends and reopens by the same scorekeeper looked past, beside the plays themselves. */
export const endsAndReopensLookedPast = 20;

const scorekeepersOwn = new Set(['end', 'reopen']);

export type GameMovedSinceInput = {
  readonly gameId: string;
  /** The sequence the device says the plays were made on. */
  readonly since: number;
  /** The game's last sequence now. */
  readonly last: number;
  /** The plays' own command ids, in lower case. */
  readonly own: ReadonlySet<string>;
  /** The account sending them: the lost session's own. */
  readonly accountId: string;
  /** Where the server last heard the lost session while it held the game (T-335). */
  readonly heard: number;
  /** How far, in order, this list's earlier batches had the events explained (T-372). */
  readonly sent?: number;
};

/**
 * How far, in order, the events after `since` are explained (T-372): the sequence of the
 * last of an unbroken run of them, `last` when the game has not moved; null when the
 * device names a sequence the server cannot vouch for, so nothing is explained.
 */
export async function explainedUpTo(
  tx: TrackerTx,
  input: GameMovedSinceInput,
): Promise<number | null> {
  const { gameId, since, last, own, accountId, heard, sent } = input;
  // The server, not the device, says where the plays can have been made: never after it
  // last answered their session while it held the game, and never a sequence the game
  // never reached.
  if (since > heard || since > last) return null;
  // Up to `sent` everything was explained when it was written: looked past as it is.
  let upTo = sent !== undefined && sent > since ? Math.min(sent, last) : since;
  if (upTo === last) return last;
  // At most as many as can be looked past: a longer run is the next batch's to explain.
  const events = await tx.liveGames.eventsAfter(gameId, upTo, own.size + endsAndReopensLookedPast);
  const sender = accountId.toLowerCase();
  for (const event of events) {
    if (event.seq !== upTo + 1) break;
    // One of these very plays (an answer lost, a second send, or a copy of the device's
    // uploaded, T-370), whoever recorded it: its id is taken, so it answers duplicate and
    // stays as it was recorded. Naming another's play as one's own counts nothing twice
    // and drops nothing; it only lets in plays any scorekeeper could send by taking over.
    // Otherwise only an End or a reopen by the sender.
    const explained =
      own.has(event.commandId.toLowerCase()) ||
      (event.accountId?.toLowerCase() === sender && scorekeepersOwn.has(event.type));
    if (!explained) break;
    upTo = event.seq;
  }
  return upTo;
}

/** Whether the game moved since the plays were made: not every event since is explained. */
export async function gameMovedSince(tx: TrackerTx, input: GameMovedSinceInput): Promise<boolean> {
  return (await explainedUpTo(tx, input)) !== input.last;
}
