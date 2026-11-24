// "Send these plays" (S-43, T-335): whether a game moved since plays listed as not
// saved were made. The device names the sequence it last had from the server while it
// held the game (`notSavedSince`), and the server bounds it by where it last answered
// that session itself (`heard`): a device never names a later one. The game has not
// moved if every event the server took after it is the sender's own and one of these
// very plays (a batch whose answer was lost, or a second send), a play of an earlier
// batch of the same list (`sent`), or an End or a reopen (step 2.148: an End and a
// reopen by the scorekeeper are not "someone recorded something in between").
// Anything else, a play from another device, a change of players, a marking not
// started, or too many events to look through, and it moved: each play is entered
// again. Sending the same plays twice adds nothing: their command ids are taken.
import type { TrackerTx } from './ports.ts';

/** Ends and reopens by the same scorekeeper looked past, beside the plays themselves. */
export const endsAndReopensLookedPast = 20;

const scorekeepersOwn = new Set(['end', 'reopen']);

export async function gameMovedSince(
  tx: TrackerTx,
  input: {
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
    /** The game's sequence after the last batch of these kept plays the server took. */
    readonly sent?: number;
  },
): Promise<boolean> {
  const { gameId, since, last, own, accountId, heard, sent } = input;
  // The server, not the device, says where the plays can have been made: never after it
  // last answered their session while it held the game, and never a sequence the game
  // never reached.
  if (since > heard || since > last) return true;
  if (since === last) return false;
  const sentBefore = sent ?? since;
  const limit = Math.max(sentBefore - since, 0) + own.size + endsAndReopensLookedPast;
  // More events since than can be looked past: it moved, without reading them all.
  if (last - since > limit) return true;
  const events = await tx.liveGames.eventsAfter(gameId, since, limit);
  if (events.length !== last - since) return true;
  const sender = accountId.toLowerCase();
  return events.some((event) => {
    // Only the sender's own: another account's play with one of these ids is not theirs.
    if (event.accountId?.toLowerCase() !== sender) return true;
    // One of these very plays (an answer lost, or a second send), an End or a reopen by
    // the sender, or a play of an earlier batch of this same list the server took.
    return !(
      own.has(event.commandId.toLowerCase()) ||
      scorekeepersOwn.has(event.type) ||
      (sent !== undefined && event.seq <= sent)
    );
  });
}
