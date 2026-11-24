// "Send these plays" (S-43, T-335): whether a game moved since plays listed as not
// saved were made. The device names the sequence the server's game stood at when they
// were made (`notSavedSince`); the game has not moved if every event the server took
// after it is either one of these very plays (a batch whose answer was lost, or a
// second send) or an End or a reopen by the same account (step 2.148: an End and a
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
    /** The sequence the game stood at when the plays were made. */
    readonly since: number;
    /** The game's last sequence now. */
    readonly last: number;
    /** The plays' own command ids, in lower case. */
    readonly own: ReadonlySet<string>;
    /** The account sending them. */
    readonly accountId: string;
  },
): Promise<boolean> {
  const { gameId, since, last, own, accountId } = input;
  // A sequence the game never reached is no game this device saw.
  if (since > last) return true;
  if (since === last) return false;
  const limit = own.size + endsAndReopensLookedPast;
  // More events since than can be looked past: it moved, without reading them all.
  if (last - since > limit) return true;
  const events = await tx.liveGames.eventsAfter(gameId, since, limit);
  if (events.length !== last - since) return true;
  const sender = accountId.toLowerCase();
  return events.some(
    (event) =>
      !own.has(event.commandId.toLowerCase()) &&
      !(scorekeepersOwn.has(event.type) && event.accountId?.toLowerCase() === sender),
  );
}
