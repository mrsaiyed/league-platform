// What the games module tells others about a season's results (T-22): the rules its
// games are judged by, its decided games and their box score lines. Standings and
// season totals are worked out from this alone (S-9, S-11), never from a copy.
import type { SeasonRules } from '@srleagues/contracts';
import type { GameLine, GameRecord, GamesStore } from './ports.ts';
import { seasonRulesOf } from './season-rules-of.ts';

export type SeasonResults = {
  /** The season's rules: its stored document, or the starting set while it has none. */
  readonly rules: SeasonRules;
  /** Final and forfeit games not in the bin. */
  readonly games: readonly GameRecord[];
  /** The box score lines of those games. */
  readonly lines: readonly GameLine[];
};

type ResultsTx = {
  readonly games: Pick<GamesStore, 'findSeason' | 'listDecided' | 'listDecidedLines'>;
};

/** The season's results, or undefined if the season is not in this league. */
export async function seasonResults(
  tx: ResultsTx,
  seasonId: string,
): Promise<SeasonResults | undefined> {
  if ((await tx.games.findSeason(seasonId)) === undefined) return undefined;
  // One after another: they share the transaction's one connection.
  const rules = await seasonRulesOf(tx, seasonId);
  const games = await tx.games.listDecided(seasonId);
  const lines = await tx.games.listDecidedLines(seasonId);
  return { rules, games, lines };
}
