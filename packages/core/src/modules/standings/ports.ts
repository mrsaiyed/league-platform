// What the standings module needs from storage. packages/database supplies it, bound
// to one transaction for one league, so none of these take a league id (T-28).
import type { PlayerSeasonTotals, StandingsRow } from '@srleagues/sports';
import type { CommandTx } from '../../command/index.ts';
import type { AccessReader, ActivityLog } from '../access/index.ts';
import type { GamesStore } from '../games/index.ts';

/** A team of the season, not in the bin, and the division whose table it sits in. */
export type TableTeam = { readonly teamId: string; readonly divisionId: string | null };

/** An admin's adjustment not in the bin (S-10), as standings_adjustments holds it. */
export type SeasonAdjustment = {
  readonly id: string;
  readonly teamId: string;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly points: number;
  readonly reason: string;
};

export type StandingsStore = {
  /**
   * Holds the season's standings for the rest of the transaction, so two results
   * saved at once are worked out one after the other, the second seeing the first.
   */
  readonly lockSeason: (seasonId: string) => Promise<void>;
  /** The season's teams not in the bin, in id order. */
  readonly listTeams: (seasonId: string) => Promise<readonly TableTeam[]>;
  /** The season's adjustments not in the bin, in id order. */
  readonly listAdjustments: (seasonId: string) => Promise<readonly SeasonAdjustment[]>;
  /** Makes the season's standings rows exactly these: one per team, others removed. */
  readonly replaceRows: (seasonId: string, rows: readonly StandingsRow[]) => Promise<void>;
  /** Makes the season's player totals exactly these: one per person, others removed. */
  readonly replaceTotals: (
    seasonId: string,
    totals: readonly PlayerSeasonTotals[],
  ) => Promise<void>;
};

/**
 * The transaction standings work in: its own store, the games module's store to ask
 * for results (T-22), and access and the activity log for the rebuild command.
 */
export type StandingsTx = CommandTx & {
  readonly standings: StandingsStore;
  readonly games: Pick<GamesStore, 'findSeason' | 'listDecided' | 'listDecidedLines'>;
  readonly access: AccessReader;
  readonly activity: ActivityLog;
};
