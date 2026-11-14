// The shapes of placing a season's games into dates, times and courts (P7 §4.1, §4.2; S-3).
import type {
  FairnessIssue,
  FairnessReport,
  FairnessRules,
  Pairing,
  PairingTeam,
  PairingsError,
  TeamUnavailableDate,
} from './pairing-types.ts';
import type { ScheduleGame, ScheduleRound, ScheduleState } from './schedule-types.ts';

/** A court games can be played on. `court` is the canonical court name, compared exactly. */
export type SeasonCourt = { venueId: string | null; court: string };

export type PlacementInput = {
  teams: readonly PairingTeam[];
  /** How many times each team plays each other team, as for the pairings. */
  timesEachPair: number;
  /**
   * The fairness switches. `keepGamesWithinDivision` also decides the pairings: on, every
   * team plays every other team of its own division; off, every other team in the league.
   */
  rules: FairnessRules;
  /** The season's first and last dates, YYYY-MM-DD. */
  firstDate: string;
  lastDate: string;
  /** The days of the week games are played: 0 is Sunday, 6 is Saturday. */
  playingDays: readonly number[];
  /** The time slots on each playing day, HH:MM (24-hour). */
  times: readonly string[];
  /** The venues and courts, in the order they are filled. */
  courts: readonly SeasonCourt[];
  /** Holidays and closures: no game is placed on them. */
  skipDates?: readonly string[];
  /** Team requests ("Team A cannot play on October 12"). */
  unavailableDates?: readonly TeamUnavailableDate[];
  /**
   * Which arrangement to produce ("generate again"). The same inputs and the same arrangement
   * always give the same schedule. 0 keeps the teams in the order given. A whole number, 0 or more.
   */
  arrangement?: number;
  /** The schedule as it stands, when generating again. Only its locked games are kept. */
  current?: ScheduleState;
  /** The games of `current` the admin locked: they stay exactly where they are. */
  lockedGameIds?: readonly string[];
  /**
   * The name of a new round, given its number in the season (1 for the first). Interface text
   * lives in message files, so the caller supplies it. Rounds kept from `current` keep their names.
   */
  roundLabel: (roundNumber: number) => string;
};

export type PlacementError =
  | PairingsError
  | { code: 'invalid-date'; value: string }
  | { code: 'season-ends-before-it-starts'; firstDate: string; lastDate: string }
  | { code: 'season-too-long'; days: number }
  | { code: 'invalid-playing-day'; value: number }
  | { code: 'no-playing-days' }
  | { code: 'invalid-arrangement'; value: number }
  | { code: 'invalid-time'; value: string }
  | { code: 'no-times' }
  | { code: 'no-courts' }
  | { code: 'empty-court-name' }
  | { code: 'unknown-locked-game'; gameId: string };

export type PlacementResult =
  | {
      ok: true;
      /** The kept rounds and the new ones, in date order. */
      rounds: ScheduleRound[];
      /** The locked games, unchanged, and the new games, in date, time and court order. */
      games: ScheduleGame[];
      /**
       * Games of the pairings that could not be placed without breaking a strict rule (no
       * room left in the season, team requests, locked games in the way). The admin adds them
       * by hand or changes the inputs; the fairness report lists the pairs as meeting too few times.
       */
      unplaced: Pairing[];
      report: FairnessReport;
    }
  | { ok: false; error: PlacementError };

/** Rules the generator never breaks with a game it places, when switched on (see `placeSchedule`). */
export type StrictRule = Extract<
  FairnessIssue['rule'],
  | 'no-team-twice-in-one-day'
  | 'avoid-same-matchup-two-weeks-running'
  | 'keep-games-within-division'
  | 'team-unavailable-date'
>;
