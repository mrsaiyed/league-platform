// Whose were the commands the server took between two of its states (step 2.242,
// T-356, T-357)? Judged by command ID, never by counting: each command since is the
// device's own if it sent that ID, somebody else's otherwise. The state's `recent` lists
// the plays' IDs and its `changes` those of the changes of players, the adds the server
// refused included (each counts in the sequence). When the lists cannot account for
// every command since (more than they hold, or a state with no list of changes), the
// device cannot tell, and takes the safe side: somebody else may have scored.
import type { ServerState } from './tracker-server.ts';

export type CommandsSince =
  /** Every command since is one this device sent. */
  | 'own'
  /** At least one command since is not one this device sent. */
  | 'somebody-else'
  /** The lists do not name every command since: whose they were is not known. */
  | 'cannot-tell';

const idsOf = (s: ServerState): string[] =>
  [...s.state.recent, ...(s.changes ?? [])].map((id) => id.toLowerCase());

/**
 * Judges the commands the server took after `from` up to `now`. `own`: the command IDs
 * this device sent, lower case, taken, refused or still waiting.
 */
export function commandsSince(
  from: ServerState,
  now: ServerState,
  own: ReadonlySet<string>,
): CommandsSince {
  const count = now.sequence - from.sequence;
  const changesKnown = from.changes !== undefined && now.changes !== undefined;
  const plays = new Set(now.state.recent.map((id) => id.toLowerCase()));
  const before = new Set(idsOf(from));
  const since = new Set(idsOf(now).filter((id) => !before.has(id)));
  let unsure = false;
  for (const id of since) {
    if (own.has(id)) continue;
    // A change of players not in a state with no list of changes may be older than that
    // state: whose it is since is not known (review L1). A play is told by the plays.
    if (changesKnown || plays.has(id)) return 'somebody-else';
    unsure = true;
  }
  if (count === 0 && since.size === 0) return 'own';
  if (unsure || count < 0 || !changesKnown) return 'cannot-tell';
  return since.size === count ? 'own' : 'cannot-tell';
}
