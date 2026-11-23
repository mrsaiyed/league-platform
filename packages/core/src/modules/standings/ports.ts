// What the standings module needs from storage. packages/database supplies it, bound
// to one transaction for one league, so none of these take a league id (T-28).
import type { PlayerSeasonTotals, StandingsRow } from '@srleagues/sports';
import type { CommandTx } from '../../command/index.ts';
import type { AccessReader, ActivityLog } from '../access/index.ts';
import type { GamesStore, ScoringSessionsStore } from '../games/index.ts';

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
  /** Games played it adds: 1 for each half of a game awarded that was not played (S-85). */
  readonly gamesPlayed?: number;
  /** The other half's id, for the second half of an overturned or awarded game. */
  readonly pairedWith?: string | null;
  /** The game an overturn rules on, on both its halves; empty otherwise (S-85). */
  readonly gameId?: string | null;
};

/** An adjustment to add (S-10); at least one of the four changes is not zero. */
export type NewAdjustment = {
  readonly teamId: string;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly points: number;
  readonly reason: string;
  /** Who entered it: an id only (history keeps no copies of personal details). */
  readonly accountId: string;
  /** Games played it adds (0 or 1): a game awarded that was not played (S-85). */
  readonly gamesPlayed?: number;
  /** The first half's id, when this is the second half of a pair (T-307). */
  readonly pairedWith?: string;
  /** The game overturned, on both halves of an overturned result (S-85). */
  readonly gameId?: string;
};

export type StandingsStore = {
  /**
   * Holds the season's standings for the rest of the transaction, so two results
   * saved at once are worked out one after the other, the second seeing the first.
   */
  readonly lockSeason: (seasonId: string) => Promise<void>;
  /**
   * The season's teams not in the bin, and any in the bin with a final or forfeited result
   * in a game not in the bin (its opponents keep those results, A-17), in id order.
   */
  readonly listTeams: (seasonId: string) => Promise<readonly TableTeam[]>;
  /** The season's adjustments not in the bin, in id order. */
  readonly listAdjustments: (seasonId: string) => Promise<readonly SeasonAdjustment[]>;
  /** Adds an adjustment to the season's: its id. The team must be one of the season's. */
  readonly addAdjustment: (seasonId: string, adjustment: NewAdjustment) => Promise<string>;
  /**
   * Moves the season's adjustment to the bin (T-45), and the other half of its pair with
   * it (T-307): false if it is not there or already in it.
   */
  readonly binAdjustment: (seasonId: string, adjustmentId: string) => Promise<boolean>;
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
 * for results (T-22), the game's lock (T-111) so an overturn and a reopen of the same
 * game are worked out one after the other, and access and the activity log for the
 * rebuild command.
 */
export type StandingsTx = CommandTx & {
  readonly standings: StandingsStore;
  readonly games: Pick<GamesStore, 'findSeason' | 'listDecided' | 'listDecidedLines'>;
  readonly scoringSessions: Pick<ScoringSessionsStore, 'lockGame'>;
  readonly access: AccessReader;
  readonly activity: ActivityLog;
};
