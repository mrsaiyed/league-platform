// How the games list is laid out (step 2.156, the using-it audit's H8): "Needs a result"
// first, every game past its start with no result, oldest first (as the command gives
// them); then "Today"; then "This week", a heading for each day. Each game is shown once:
// one that needs a result is not shown again under its day. Days are the league's own, as
// the commands work them out in its time zone.

/** What the layout reads of a game. */
type Placed = { readonly id: string; readonly day: string };

export type GamesSections<G extends Placed> = {
  readonly needsResult: readonly G[];
  readonly today: readonly G[];
  /** The days after today, soonest first, each with its games in the list's order. */
  readonly days: readonly { readonly day: string; readonly games: readonly G[] }[];
};

/**
 * Lays out the games that need a result and the week's games. A game of the week from
 * before today (one under way since last night, past the list's limit) is under Today: it
 * is being played now.
 */
export function gamesSections<G extends Placed>(
  needsResult: readonly G[],
  week: readonly G[],
  today: string,
): GamesSections<G> {
  const shown = new Set(needsResult.map((g) => g.id));
  const rest = week.filter((g) => !shown.has(g.id));
  const days = new Map<string, G[]>();
  for (const game of rest) {
    if (game.day <= today) continue;
    days.set(game.day, [...(days.get(game.day) ?? []), game]);
  }
  return {
    needsResult,
    today: rest.filter((g) => g.day <= today),
    days: [...days.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([day, games]) => ({ day, games })),
  };
}
