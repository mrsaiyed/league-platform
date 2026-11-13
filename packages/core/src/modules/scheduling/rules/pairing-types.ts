// The shapes of the pairings and the fairness report (P7 §4.1, §4.2; S-3). Pure data.
import type { ScheduleGame, ScheduleRound } from './schedule-types.ts';

/** A team as the pairings and the fairness report see it. `divisionId` is null when the season has no divisions. */
export type PairingTeam = { id: string; divisionId: string | null };

/** The fairness switches of P7 §4.1. Each is on or off; the admin chooses. */
export type FairnessRules = {
  noTeamTwiceInOneDay: boolean;
  spreadEarlyAndLateSlots: boolean;
  balanceHomeAndAway: boolean;
  avoidSameMatchupTwoWeeksRunning: boolean;
  /** On: teams play only within their division. Off: cross-division games are allowed. */
  keepGamesWithinDivision: boolean;
};

export type PairingsInput = {
  teams: readonly PairingTeam[];
  /** How many times each team plays each other team: a whole number from 1 to `maxTimesEachPair`. */
  timesEachPair: number;
  /** True: every team plays every other team of its own division. False: every other team in the league. */
  withinDivisions: boolean;
  /**
   * Which arrangement to produce. The same inputs and the same arrangement always give the same
   * pairings; another arrangement gives a different order of opponents ("generate again").
   * 0 keeps the teams in the order given. A whole number, 0 or more.
   */
  arrangement?: number;
};

/** One game of the pairings: who plays whom and who is at home. No date, time or court yet (step 2.73 places them). */
export type Pairing = { homeTeamId: string; awayTeamId: string };

/** One round of the pairings: every team plays at most once. `byes` lists the teams that do not play in it. */
export type PairingRound = { games: Pairing[]; byes: string[] };

export type PairingsError =
  | { code: 'invalid-times-each-pair'; value: number }
  | { code: 'invalid-arrangement'; value: number }
  | { code: 'duplicate-team'; teamId: string }
  /** Fewer than two teams to pair. With `withinDivisions`, `divisionId` names the division that is too small. */
  | { code: 'too-few-teams'; divisionId: string | null; count: number };

export type PairingsResult =
  | { ok: true; rounds: PairingRound[] }
  | { ok: false; error: PairingsError };

/** A team's day off it asked for ("Team A cannot play on October 12", P7 §4.1). */
export type TeamUnavailableDate = { teamId: string; date: string };

export type FairnessInput = {
  /** The teams the report is about, in the order the report lists them. */
  teams: readonly PairingTeam[];
  /** The schedule's rounds. Games with no round are grouped by their date. */
  rounds: readonly ScheduleRound[];
  games: readonly ScheduleGame[];
  rules: FairnessRules;
  /** When set, every pair that should meet (see `withinDivisions`) should meet exactly this many times. */
  timesEachPair?: number | null;
  /**
   * Which pairs `timesEachPair` counts, as the pairings were generated (`PairingsInput.withinDivisions`).
   * True: only teams of the same division should meet. False or absent: every pair in the league.
   * Separate from the `keepGamesWithinDivision` rule, which only flags cross-division games.
   */
  withinDivisions?: boolean;
  unavailableDates?: readonly TeamUnavailableDate[];
};

/** Per team (P7 §4.2). Postponed and cancelled games are not counted. */
export type TeamFairness = {
  teamId: string;
  games: number;
  home: number;
  away: number;
  /** Games at the earliest time used on their date, when that date has two or more times. */
  early: number;
  /** Games at the latest time used on their date, when that date has two or more times. */
  late: number;
  /** Weeks with games in which this team has none. */
  byes: number;
  /** Times this team met the same opponent in two weeks running. */
  backToBack: number;
};

/** A rule the schedule does not fully satisfy, with what the screen needs to say why. */
export type FairnessIssue =
  | { rule: 'no-team-twice-in-one-day'; teamId: string; date: string; gameIds: string[] }
  | {
      rule: 'spread-early-and-late-slots';
      teamId: string;
      slot: 'early' | 'late';
      count: number;
      /** The fewest and the most any team of the report has. */
      fewest: number;
      most: number;
    }
  | { rule: 'balance-home-and-away'; teamId: string; home: number; away: number }
  | {
      rule: 'avoid-same-matchup-two-weeks-running';
      teamIds: [string, string];
      /** The two games, in week order. */
      gameIds: [string, string];
    }
  | { rule: 'keep-games-within-division'; gameId: string; teamIds: [string, string] }
  | { rule: 'times-each-pair'; teamIds: [string, string]; expected: number; actual: number }
  | { rule: 'team-unavailable-date'; teamId: string; date: string; gameId: string };

export type FairnessReport = { teams: TeamFairness[]; issues: FairnessIssue[] };
