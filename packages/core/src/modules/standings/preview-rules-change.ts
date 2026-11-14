// Shows what changing a season's rules would do to its standings, saving nothing
// (S-1). The same calculation every result runs is done twice from the same results,
// under the rules now and under the new ones, and the two tables are compared.
import type { SeasonRules } from '@srleagues/contracts';
import { calculateSeason } from './rebuild-season.ts';
import type { StandingsStore } from './ports.ts';
import type { GamesStore } from '../games/index.ts';
import { whatWouldMove, type TeamMove } from './what-would-move.ts';

export type RulesChangePreview = {
  /** Whether a game has been decided: before the first, a change simply saves (S-1). */
  readonly gamesDecided: boolean;
  /** The teams that would move, in id order; empty when nothing would. */
  readonly moves: readonly TeamMove[];
};

type PreviewTx = {
  readonly standings: Pick<StandingsStore, 'listTeams' | 'listAdjustments'>;
  readonly games: Pick<GamesStore, 'findSeason' | 'listDecided' | 'listDecidedLines'>;
};

/** The preview, or undefined if the season is not here. */
export async function previewRulesChange(
  tx: PreviewTx,
  seasonId: string,
  rules: SeasonRules,
): Promise<RulesChangePreview | undefined> {
  const now = await calculateSeason(tx, seasonId);
  if (now === undefined) return undefined;
  const after = await calculateSeason(tx, seasonId, rules);
  if (after === undefined) return undefined;
  const rowsOf = (c: typeof now) => c.standings.tables.flatMap((table) => table.rows);
  return {
    gamesDecided: now.games.length > 0,
    moves: whatWouldMove(rowsOf(now), rowsOf(after)),
  };
}
