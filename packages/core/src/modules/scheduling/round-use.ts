// Which rounds a game would still be in after the draft is published (step 2.160). The
// draft's own games are judged by the rules; this finds the others the rules never see:
// a game in the bin, one with no date yet, and one the draft removes (it goes to the bin
// and stays in its round). Such a round is never removed, so a draft that removes it
// cannot be saved or published.
import type { SchedulingTx } from './ports.ts';
import type { ScheduleState } from './rules/schedule-types.ts';

export async function roundsStillInUse(
  tx: SchedulingTx,
  seasonId: string,
  roundIds: readonly string[],
  result: ScheduleState,
): Promise<ReadonlySet<string>> {
  if (roundIds.length === 0) return new Set();
  const after = new Map(result.games.map((g) => [g.id, g]));
  const named = await tx.scheduling.gamesInRounds(seasonId, roundIds);
  return new Set(
    named
      .filter((g) => {
        const placed = after.get(g.id);
        return placed === undefined || placed.roundId === g.roundId;
      })
      .map((g) => g.roundId),
  );
}
