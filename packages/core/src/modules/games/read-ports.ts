// What the public game page needs from storage (step 2.40). packages/database supplies
// it, bound to one league (T-28). Rows of words and numbers only (T-29, T-81).

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
        readonly finalizedAt: string | null;
        readonly binned: boolean;
      }
    | undefined
  >;
  readonly teams: (teamIds: readonly string[]) => Promise<readonly GamePageTeam[]>;
  /** The engine's saved state of the game (T3 §8), as stored, or undefined if it has none. */
  readonly state: (gameId: string) => Promise<unknown>;
  readonly lines: (gameId: string) => Promise<readonly GamePlayerLine[]>;
  readonly people: (personIds: readonly string[]) => Promise<readonly GamePersonRecord[]>;
  /** The date (YYYY-MM-DD) of the game's latest correction, never its reason (S-7). */
  readonly correctedOn: (gameId: string) => Promise<string | undefined>;
};
