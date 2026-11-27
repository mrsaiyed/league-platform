// What the public game page needs from storage (step 2.40). packages/database supplies
// it, bound to one league (T-28). Rows of words and numbers only (T-29, T-81).
import type { MarkResult } from './corrected-mark.ts';

export type GamePageTeam = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly color: string | null;
  /** As stored; statsShown reads anything it does not know as "totals only". */
  readonly statsVisibility: string;
};

/** One player's line in the game (T3 §8). `stats` is an object of counts as stored. */
export type GamePlayerLine = {
  readonly teamId: string;
  readonly personId: string;
  readonly jerseyNumber: string | null;
  readonly played: boolean;
  readonly secondsPlayed: number | null;
  readonly stats: unknown;
};

/** What the name function needs to know about a person, and nothing more. */
export type GamePersonRecord = {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly isMinor: boolean | null;
  /** Present, and true, only for a walk-up of unknown age (S-136): showName's `walkUp`. */
  readonly walkUp?: true;
  readonly visibility: string;
};

export type GamesReadStore = {
  /** The game, in the bin or not; undefined if it is not in this league. */
  readonly findGame: (gameId: string) => Promise<
    | {
        readonly id: string;
        readonly seasonId: string;
        readonly homeTeamId: string;
        readonly awayTeamId: string;
        readonly startsAt: string | null;
        readonly status: string;
        readonly captureMode: string;
        readonly homeScore: number | null;
        readonly awayScore: number | null;
        /** A final game's overtime periods (P7 §5.6); null when not known or not final. */
        readonly overtimePeriods: number | null;
        readonly finalizedAt: string | null;
        readonly binned: boolean;
        /** The rules it is played under, as stored: its own once fixed (`format`), else
         * its season's; null or undefined when neither is stored (the starting set). */
        readonly rules: unknown;
      }
    | undefined
  >;
  /**
   * What a season keeps ("Statistics kept", P7 §1), as the statistics page reads it: the
   * statistics it names itself, in its order (empty when it names none, record 070), and
   * its rules as stored. Undefined when the season is not here. Only the game's page asks
   * for it (step 2.196): its box score's columns are the season's, as it is today.
   */
  readonly seasonStatistics: (
    seasonId: string,
  ) => Promise<{ readonly statKeys: readonly string[]; readonly rules: unknown } | undefined>;
  readonly teams: (teamIds: readonly string[]) => Promise<readonly GamePageTeam[]>;
  /** The engine's saved state of the game (T3 §8), as stored, or undefined if it has none. */
  readonly state: (gameId: string) => Promise<unknown>;
  readonly lines: (gameId: string) => Promise<readonly GamePlayerLine[]>;
  readonly people: (personIds: readonly string[]) => Promise<readonly GamePersonRecord[]>;
  /** The date (YYYY-MM-DD) of the game's latest correction, never its reason (S-7). */
  readonly correctedOn: (gameId: string) => Promise<string | undefined>;
  /**
   * The result as it stood while the game is being corrected: what its open reopen took
   * back (S-47, step 2.159); undefined when no reopen is open (resultBeingCorrected).
   */
  readonly resultBeingCorrected: (gameId: string) => Promise<MarkResult | undefined>;
};

/**
 * What a game's snapshot reads (step 2.32, T-118): the game page's reads, and the
 * saved state with the number of the last event it applied, read together so the
 * snapshot's sequence and its state always agree.
 */
export type GameSnapshotStore = GamesReadStore & {
  readonly savedState: (
    gameId: string,
  ) => Promise<{ readonly seq: number; readonly state: unknown } | undefined>;
};
