// The standings module's half of "an archived season is read-only" (O-12, step 2.130,
// T-387). Only a correction with a reason changes an archived season: an adjustment, an
// award and an overturn always carry one and pass; a rebuild changes no fact and passes;
// a coin flip, or taking an adjustment or a flip off, passes only when it is given its
// reason (the flip's note), and is refused with `season-archived` without one.
import type { StandingsTx } from './ports.ts';

export async function unexplainedInArchivedSeason(
  seasonId: string,
  reason: string | undefined,
  tx: { readonly games: Pick<StandingsTx['games'], 'seasonArchived'> },
): Promise<boolean> {
  return reason === undefined && tx.games.seasonArchived(seasonId);
}
