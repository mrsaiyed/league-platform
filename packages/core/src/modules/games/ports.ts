// What the games module needs from storage. packages/database supplies it, bound to
// one transaction for one league, so none of these take a league id (T-28).
import type { SeasonRules } from '@srleagues/contracts';
import type { CommandTx } from '../../command/index.ts';
import type { AccessReader, ActivityLog } from '../access/index.ts';

/** A game of a season, in or out of the bin (T3 §8). */
export type GameRecord = {
  readonly id: string;
  readonly seasonId: string;
  readonly divisionId: string | null;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly startsAt: string | null;
  /** scheduled, live, final, postponed, cancelled or forfeit. */
  readonly status: string;
  /** How the database spells it: final, box or live (see recordingOf). */
  readonly captureMode: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  /** The rules the game is played under; null while it follows its season's. */
  readonly format: unknown;
  readonly finalizedAt: string | null;
  readonly binned: boolean;
  readonly version: number;
};

/**
 * What a result change sets: the status and scores, whether the game now counts as
 * decided (the database stamps `finalized_at` itself), and the rules it is played
 * under when it has none yet.
 */
export type GameResultChange = {
  readonly status: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly decided: boolean;
  /** Set only if the game has none; a game that has rules keeps them. */
  readonly format?: SeasonRules;
};

/** A result as a correction keeps it: a versioned document of words and numbers only (T-220). */
export type GameResultDocument = {
  readonly version: 1;
  readonly status: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
};

/** One player's box score line in one game (T3 §8 `player_game_stats`). */
export type GameLine = {
  readonly gameId: string;
  readonly teamId: string;
  readonly personId: string;
  readonly played: boolean;
  /** Null when minutes were not recorded. */
  readonly secondsPlayed: number | null;
  /** Counts keyed by stat; a missing key means the stat was not recorded. */
  readonly stats: Readonly<Record<string, number>>;
};

/** One reopening, with numbers only, never names (T-220). */
export type NewGameCorrection = {
  readonly gameId: string;
  readonly accountId: string;
  readonly reason: string;
  readonly before: GameResultDocument;
  readonly after: GameResultDocument;
};

export type GamesStore = {
  /** The game with this id, in the bin or not, or undefined if it is not in this league. */
  readonly find: (gameId: string) => Promise<GameRecord | undefined>;
  /**
   * Changes a game not in the bin if it is still at `version` (T-46): the new
   * version, or undefined if it is not there or moved on.
   */
  readonly setResult: (
    gameId: string,
    change: GameResultChange,
    version: number,
  ) => Promise<number | undefined>;
  /** Writes the correction row (S-7) in this transaction; the database needs it to change a decided game. */
  readonly addCorrection: (correction: NewGameCorrection) => Promise<void>;
  /** Postponed games not in the bin, soonest first, of one season or all. */
  readonly listPostponed: (seasonId?: string) => Promise<readonly GameRecord[]>;
  /** A season's decided games (final or forfeit) not in the bin, in id order. */
  readonly listDecided: (seasonId: string) => Promise<readonly GameRecord[]>;
  /** The box score lines of a season's decided games not in the bin, by game and person. */
  readonly listDecidedLines: (seasonId: string) => Promise<readonly GameLine[]>;
  /** The program a season belongs to and its rules as stored, or undefined if it is not here. */
  readonly findSeason: (
    seasonId: string,
  ) => Promise<{ readonly programId: string; readonly rules: unknown } | undefined>;
};

/** A games command's transaction: its store, the access reader and the activity log (A-6). */
export type GamesTx = CommandTx & {
  readonly games: GamesStore;
  readonly access: AccessReader;
  readonly activity: ActivityLog;
};
