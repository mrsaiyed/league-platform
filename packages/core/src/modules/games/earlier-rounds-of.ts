// "Earlier games" by round (step 2.156), worked out from a league's games in memory: the
// same counting the database does in SQL (list-earlier-rounds.ts), for the made-up
// stand-in and core's tests. A game is earlier when it is in no bin, started before the
// league's today, and is decided or called off (isOverOrCalledOff); every other game from
// before today still needs a result and is listed there instead.
import { isOverOrCalledOff } from './game-fields.ts';
import type { EarlierRoundCount, EarlierRoundRef, GameInWindow } from './ports.ts';

/** A game with the round it is in, if any. */
export type GameWithRound = GameInWindow & {
  readonly round: {
    readonly id: string;
    readonly number: number;
    readonly label: string | null;
  } | null;
};

/** Whether the game is one of the earlier games, before the league's `today` (YYYY-MM-DD). */
export function isEarlierGame(entry: GameWithRound, today: string): boolean {
  return (
    !entry.game.binned &&
    entry.game.startsAt !== null &&
    entry.day < today &&
    isOverOrCalledOff(entry.game.status)
  );
}

/** Whether an earlier game is in the round named. */
export function inEarlierRound(entry: GameWithRound, ref: EarlierRoundRef): boolean {
  return 'roundId' in ref
    ? entry.round?.id === ref.roundId
    : entry.round === null && entry.game.seasonId === ref.seasonId;
}

/**
 * The rounds of the earlier games, latest played first (then by season, round number and
 * id), with how many games each has and how many of them are the account's.
 */
export function earlierRoundsOf(
  entries: readonly GameWithRound[],
  today: string,
  limit: number,
): readonly EarlierRoundCount[] {
  const rounds = new Map<string, EarlierRoundCount>();
  for (const entry of entries) {
    if (!isEarlierGame(entry, today)) continue;
    const key = entry.round?.id ?? `season:${entry.game.seasonId}`;
    const known = rounds.get(key);
    rounds.set(key, {
      seasonId: entry.game.seasonId,
      programId: entry.programId,
      roundId: entry.round?.id ?? null,
      number: entry.round?.number ?? null,
      label: entry.round?.label ?? null,
      firstDay: known === undefined || entry.day < known.firstDay ? entry.day : known.firstDay,
      lastDay: known === undefined || entry.day > known.lastDay ? entry.day : known.lastDay,
      games: (known?.games ?? 0) + 1,
      assigned: (known?.assigned ?? 0) + (entry.assigned ? 1 : 0),
    });
  }
  return [...rounds.values()]
    .sort(
      (a, b) =>
        b.lastDay.localeCompare(a.lastDay) ||
        a.seasonId.localeCompare(b.seasonId) ||
        (a.number ?? Infinity) - (b.number ?? Infinity) ||
        (a.roundId ?? '').localeCompare(b.roundId ?? ''),
    )
    .slice(0, limit);
}
