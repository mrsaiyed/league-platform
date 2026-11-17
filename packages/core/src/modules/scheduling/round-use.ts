// Which games outside the draft hold their round (steps 2.160 and 2.181). The draft's own
// games are judged by the rules; the store names the others that are in the rounds, and of
// those only a game with no date yet holds its round: it is not in the published schedule,
// so the draft cannot move it. A game in the bin does not hold its round (S-60), and the
// store never names one; nor does a game the draft removes, which publishing moves to the
// bin before it removes rounds. The grid shows the games with no date in their rounds, so
// the screen and this rule count the same games.
import type { GameInRound, SchedulingTx } from './ports.ts';
import type { ScheduleState } from './rules/schedule-types.ts';

/** The season's games with no date yet that are in any of these rounds. */
export async function undatedGamesIn(
  tx: SchedulingTx,
  seasonId: string,
  roundIds: readonly string[],
  published: ScheduleState,
): Promise<readonly GameInRound[]> {
  if (roundIds.length === 0) return [];
  const dated = new Set(published.games.map((g) => g.id));
  const named = await tx.scheduling.gamesInRounds(seasonId, roundIds);
  return named.filter((g) => !dated.has(g.id));
}

/**
 * The rounds a game would still be in after the draft is published that the draft cannot
 * see: such a round is never removed, so a draft that removes it cannot be saved or
 * published. A game of the draft still in its round is in `result` too, and is named here
 * as well, so the answer holds whatever the rules said.
 */
export async function roundsStillInUse(
  tx: SchedulingTx,
  seasonId: string,
  roundIds: readonly string[],
  published: ScheduleState,
  result: ScheduleState,
): Promise<ReadonlySet<string>> {
  if (roundIds.length === 0) return new Set();
  const held = new Set(
    result.games.flatMap((g) =>
      g.roundId !== null && roundIds.includes(g.roundId) ? [g.roundId] : [],
    ),
  );
  for (const g of await undatedGamesIn(tx, seasonId, roundIds, published)) held.add(g.roundId);
  return held;
}
