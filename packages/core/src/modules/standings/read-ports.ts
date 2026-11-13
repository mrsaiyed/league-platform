// What the public standings and statistics reads need from storage (step 2.40).
// packages/database supplies it, bound to one league, so none of these take a league id
// (T-28). Every shape is a row of words and numbers: no contact field, birth date or
// account id can be in one (T-29, T-81).

/** A team of a season, not in the bin, with who may see its players' numbers (S-22). */
export type SeasonTeamRow = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly color: string | null;
  readonly divisionId: string | null;
  /** As stored; statsShown reads anything it does not know as "totals only". */
  readonly statsVisibility: string;
};

/** A division of a season, not in the bin. */
export type SeasonDivisionRow = {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
  readonly sort: number;
};

/** One team's row of the calculated standings table (T3 §9). */
export type StandingsRowRecord = {
  readonly teamId: string;
  readonly divisionId: string | null;
  readonly rank: number;
  readonly seed: number;
  readonly gamesPlayed: number;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly pointsFor: number;
  readonly pointsAgainst: number;
  readonly standingsPoints: number | null;
  readonly streakResult: string | null;
  readonly streakLength: number | null;
  /** What put the team where it is: a tiebreaker, 'still-tied', or nothing (its record). */
  readonly decidedBy: string | null;
};

/** An adjustment an admin entered, with its reason (S-10), not in the bin. Never who entered it. */
export type StandingsAdjustmentRecord = {
  readonly id: string;
  readonly teamId: string;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly points: number;
};

export type StandingsAdjustmentWithReason = StandingsAdjustmentRecord & { readonly reason: string };

/** A player's season totals as stored (T3 §9): the stats are a versioned document. */
export type PlayerTotalsRecord = {
  readonly personId: string;
  readonly gamesPlayed: number;
  readonly secondsPlayed: number;
  /** The games the minutes were recorded in. */
  readonly secondsGames: number;
  readonly stats: unknown;
};

/** A team a person has numbers or a roster place with in the season. */
export type PlayerTeamLink = { readonly personId: string; readonly teamId: string };

/** A decided game with the box score lines of some players: what a mixed-team player's totals are recomputed from. */
export type DecidedGameLines = {
  readonly gameId: string;
  readonly status: string;
  readonly captureMode: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly lines: readonly {
    readonly teamId: string;
    readonly personId: string;
    readonly played: boolean;
    readonly secondsPlayed: number | null;
    readonly stats: Readonly<Record<string, number>>;
  }[];
};

/** One stat of one team over its final games, summed over its players' lines. */
export type TeamStatTotalRecord = {
  readonly teamId: string;
  readonly statKey: string;
  readonly total: number;
  /** Final games in which any of the team's players had this stat recorded. */
  readonly gamesRecorded: number;
};

/** What the name function (T-81) needs to know about a person, and nothing more. */
export type PersonDisplayRecord = {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly isMinor: boolean | null;
  /** The person's own request (R-15, R-17), as stored. */
  readonly visibility: string;
};

export type StandingsSeasonRecord = {
  readonly id: string;
  readonly name: string;
  /** The rules as stored, whatever their version. */
  readonly rules: unknown;
};

export type StandingsReadStore = {
  /** A season not in the bin, or undefined if it is not in this league. */
  readonly findSeason: (seasonId: string) => Promise<StandingsSeasonRecord | undefined>;
  /** The statistics the season keeps, in its order; undefined if the season is not here. */
  readonly seasonStatKeys: (seasonId: string) => Promise<readonly string[] | undefined>;
  readonly teams: (seasonId: string) => Promise<readonly SeasonTeamRow[]>;
  readonly divisions: (seasonId: string) => Promise<readonly SeasonDivisionRow[]>;
  readonly standingsRows: (seasonId: string) => Promise<readonly StandingsRowRecord[]>;
  readonly adjustments: (seasonId: string) => Promise<readonly StandingsAdjustmentWithReason[]>;
  readonly playerTotals: (seasonId: string) => Promise<readonly PlayerTotalsRecord[]>;
  readonly playerTeams: (seasonId: string) => Promise<readonly PlayerTeamLink[]>;
  /** The season's decided games (not in the bin) with only these people's lines. */
  readonly decidedGamesOf: (
    seasonId: string,
    personIds: readonly string[],
  ) => Promise<readonly DecidedGameLines[]>;
  readonly teamStatTotals: (seasonId: string) => Promise<readonly TeamStatTotalRecord[]>;
  readonly people: (personIds: readonly string[]) => Promise<readonly PersonDisplayRecord[]>;
};
