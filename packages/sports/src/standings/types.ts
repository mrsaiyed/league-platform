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
