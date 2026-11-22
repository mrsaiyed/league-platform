// The shapes standings maths reads and writes (P7 §1 and §6, T3 §9). Pure data:
// ids are plain strings, and nothing here knows about leagues, users or storage.
import type { SeasonRules } from '@srleagues/contracts';
import type { GameStatus } from '../game-status.ts';

export type { GameStatus };

/** A team in the season, and the division whose table it sits in (null: no divisions). */
export interface StandingsTeam {
  readonly teamId: string;
  readonly divisionId: string | null;
}

/** One game. Only `final` and `forfeit` games count (S-9, S-11, P7 §5.6). */
export interface StandingsGame {
  readonly gameId: string;
  readonly status: GameStatus;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  /** Whole numbers, 0 or more, for a final game. A forfeit's score is not read. */
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  /** Read only for a forfeit; a final game's winner comes from its score. */
  readonly winnerTeamId: string | null;
  /** When the game started (ISO 8601). Orders games for the streak. */
  readonly startsAt: string;
}

/** The tiebreakers an admin can put in order (P7 §1), as the season rules name them. */
export type Tiebreaker = SeasonRules['tiebreakers'][number];

/**
 * The part of the season rules document (step 2.5, `@srleagues/contracts`) that
 * standings read. A whole `SeasonRules` document can be passed as it is.
 */
export interface StandingsRules {
  readonly standings: Pick<
    SeasonRules['standings'],
    'rankBy' | 'pointsPerWin' | 'pointsPerTie' | 'pointsPerLoss'
  >;
  /** Applied in this order; an empty list leaves level teams level. */
  readonly tiebreakers: readonly Tiebreaker[];
  /** When false, a final game with level scores is still counted as a tie, and reported. */
  readonly allowTies: boolean;
  /** `countsInPointDifference: false`: a forfeit adds nothing to points for, against or difference. */
  readonly forfeit: SeasonRules['forfeit'];
}

/**
 * An admin's adjustment with its reason (S-10), as whole-number changes to the
 * team's record. It never changes games played, points for and against, the
 * streak or head-to-head, which come from games alone.
 *
 * - A result overturned by ruling: `wins: 1, losses: -1` for the team given the
 *   win, and `wins: -1, losses: 1` for the other team (two adjustments).
 * - A win awarded for a game that was never played: `wins: 1` (and `losses: 1`
 *   for the opponent, if it should count against them).
 * - A deduction: `points: -2`. Standings points exist only when the season ranks
 *   by points; in a win-percentage season a points change has no effect and is
 *   reported, not shown as a footnote.
 *
 * An adjustment that would take a team's wins, losses or ties below zero is left
 * out and reported.
 */
export interface StandingsAdjustment {
  readonly adjustmentId: string;
  readonly teamId: string;
  readonly wins?: number;
  readonly losses?: number;
  readonly ties?: number;
  readonly points?: number;
  readonly reason: string;
}

/** One coin flip the admin recorded by hand: the teams in the order it put them, winner first. */
export type CoinFlip = readonly string[];

export interface StandingsInput {
  readonly teams: readonly StandingsTeam[];
  readonly games: readonly StandingsGame[];
  readonly rules: StandingsRules;
  readonly adjustments?: readonly StandingsAdjustment[];
  /** In the order recorded; for a set of level teams the latest flip that covers them all applies. */
  readonly coinFlips?: readonly CoinFlip[];
}

/**
 * What decided a team's place: null when its record alone did, a tiebreaker when
 * that one separated it from teams level with it, and 'still-tied' when every
 * tiebreaker left it level (it shares its rank until the admin flips a coin).
 */
export type DecidedBy = Tiebreaker | 'still-tied' | null;

/** One team in one step of separating level teams: where that tiebreaker put it, and why. */
export interface TiebreakPlace {
  readonly teamId: string;
  /**
   * 1 for the first; teams the tiebreaker left level with each other share a number, so
   * every team has 1 when it left them all level or could not apply.
   */
  readonly place: number;
  /**
   * The team's figure under the tiebreaker: its point difference, points scored or points
   * allowed (fewer is better). Null for head-to-head and a coin flip.
   */
  readonly value: number | null;
  /**
   * Head-to-head only: the team's wins, losses and ties in the games among the teams of
   * this step, also when head-to-head could not apply. Null for the other tiebreakers.
   */
  readonly record: {
    readonly wins: number;
    readonly losses: number;
    readonly ties: number;
  } | null;
}

/** One of the season's tiebreakers, tried on a set of teams level with each other. */
export interface TiebreakStep {
  readonly tiebreaker: Tiebreaker;
  /**
   * False when it could not apply to these teams and was passed over: head-to-head when one
   * of them has played none of the others, a coin flip when none recorded covers them all.
   */
  readonly applied: boolean;
  /** The teams it was tried on, best first as it left them. */
  readonly teams: readonly TiebreakPlace[];
}

/**
 * The teams a team was level with on the table's measure, and how the season's
 * tiebreakers ordered them (P7 §1, S-74), told the same way on each of their rows.
 * `steps` are in the order they were tried: on all of them first, tiebreaker after
 * tiebreaker, until one puts some ahead of others; teams it leaves level with each other
 * then start the list again among themselves only, and their steps follow, for each such
 * set in the table's order. It is added to the order and never changes it.
 */
export interface LevelTeams {
  /** Two or more teams, this one among them, in the table's order. */
  readonly teamIds: readonly string[];
  readonly steps: readonly TiebreakStep[];
}

export interface Streak {
  readonly result: 'won' | 'lost' | 'tied';
  readonly length: number;
}

export interface StandingsRow {
  readonly teamId: string;
  readonly divisionId: string | null;
  /** Place in the table; teams still tied share one. */
  readonly rank: number;
  /** 1 to n with no repeats, for brackets. */
  readonly seed: number;
  /** Final and forfeit games actually played; adjustments do not change it. */
  readonly gamesPlayed: number;
  /** Wins, losses and ties include adjustments. */
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly pointsFor: number;
  readonly pointsAgainst: number;
  readonly pointDifference: number;
  /** Over wins, losses and ties (with adjustments); a tie is half a win; 0 with none. */
  readonly winPercentage: number;
  /** Standings points; null when the season ranks by win percentage. */
  readonly points: number | null;
  /** From counted games only, latest first; null before any game. */
  readonly streak: Streak | null;
  readonly decidedBy: DecidedBy;
  /** The teams it is level with and how they were ordered; null when its record alone placed it. */
  readonly level: LevelTeams | null;
  /** Adjustments that changed this row, for the footnote under the table (S-10). */
  readonly adjustments: readonly { readonly adjustmentId: string; readonly reason: string }[];
}

export interface StandingsTable {
  readonly divisionId: string | null;
  readonly rows: readonly StandingsRow[];
}

export type StandingsProblemReason =
  // Left out of the tables:
  | 'duplicate-team-id'
  | 'duplicate-game-id'
  | 'team-listed-twice'
  | 'same-team-twice'
  | 'unknown-team'
  | 'missing-score'
  | 'invalid-score'
  | 'forfeit-without-winner'
  | 'winner-not-in-game'
  | 'duplicate-adjustment-id'
  | 'invalid-adjustment'
  | 'adjustment-has-no-effect'
  | 'adjustment-makes-count-negative'
  // Counted, but worth the admin's attention:
  | 'tie-not-allowed'
  | 'invalid-start-time'
  | 'points-ignored-in-win-percentage-season';

/** Input that could not be counted, or was counted but looks wrong. */
export interface StandingsProblem {
  readonly kind: 'game' | 'adjustment' | 'team';
  readonly id: string;
  readonly reason: StandingsProblemReason;
  /** True when the game, adjustment or team is not in the tables at all. */
  readonly leftOut: boolean;
}

export interface StandingsResult {
  readonly tables: readonly StandingsTable[];
  readonly problems: readonly StandingsProblem[];
}
