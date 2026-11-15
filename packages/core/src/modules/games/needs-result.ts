// Which games still need a result (P4 line 22: "games finished without a final score";
// step 2.156, the using-it audit's H8): a game under way, whenever it started, and a game
// still scheduled whose start has come. A final, forfeited, postponed or cancelled game
// needs nothing more. The database's list (list-games-needing-result.ts) and the made-up
// stand-in ask the same thing of their own rows, by their own clock.

/** What the rule reads of a game. */
export type ResultFacts = { readonly status: string; readonly startsAt: string | null };

/**
 * Whether the game still waits for its result at `now` (milliseconds): it is live, or it
 * is scheduled and its start has passed. A live game counts however long ago it started,
 * so one that began before the league's midnight and is still being played after it is
 * never lost from the list. A scheduled game with no time yet waits for one, not a result.
 */
export function needsResult(game: ResultFacts, now: number): boolean {
  if (game.status === 'live') return true;
  if (game.status !== 'scheduled' || game.startsAt === null) return false;
  return Date.parse(game.startsAt) <= now;
}

/** Oldest start first; a game with no start (only a live one can be here) last; then by id. */
export function oldestFirst<G extends { readonly id: string; readonly startsAt: string | null }>(
  a: G,
  b: G,
): number {
  if (a.startsAt === null || b.startsAt === null) {
    if (a.startsAt !== b.startsAt) return a.startsAt === null ? 1 : -1;
  } else if (a.startsAt !== b.startsAt) {
    return a.startsAt < b.startsAt ? -1 : 1;
  }
  return a.id.localeCompare(b.id);
}
