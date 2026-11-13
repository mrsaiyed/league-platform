// Inputs and outputs of the statistics calculations (P7 §5.6, §6, §8; S-11; T6 §9).
// Pure data in, pure data out: no database, no league names.
import type { GameStatus } from '../game-status.ts';

/** The game statuses of T3 §8, shared with the standings. Only `final` games count here (S-11). */
export type { GameStatus };

/** How a game was recorded (T3 §8 `games.capture_mode`). */
export type CaptureMode = 'final' | 'box' | 'live';

/**
 * One player's line in one game (T3 §8 `player_game_stats`). A stat that is missing
 * from `stats` was not recorded for this game; a stat that is present with 0 was
 * recorded and the player did nothing. `secondsPlayed` is null when minutes were not
 * recorded.
 */
export type PlayerGameLine = {
  teamId: string;
  personId: string;
  played: boolean;
  secondsPlayed: number | null;
  stats: Readonly<Record<string, number>>;
};

/** One game as the statistics see it. `lines` is empty for a final-score-only game. */
export type StatsGame = {
  gameId: string;
  status: GameStatus;
  captureMode: CaptureMode;
  homeTeamId: string;
  awayTeamId: string;
  lines: readonly PlayerGameLine[];
};

/** A total over the games where the stat was recorded, and the average over those games. */
export type StatTotal = {
  total: number;
  /** Games in which this stat was recorded. The only games the average is worked over. */
  gamesRecorded: number;
  /** total / gamesRecorded. 0 only for the `seconds` entry of a player whose minutes were never recorded. */
  average: number;
};

export type PlayerSeasonTotals = {
  personId: string;
  /** Every team the player played for in a counted game, sorted. */
  teamIds: string[];
  gamesPlayed: number;
  /** Time on court, in seconds, over the games where it was recorded. */
  seconds: StatTotal;
  stats: Record<string, StatTotal>;
};

export type TeamSeasonTotals = {
  teamId: string;
  /**
   * Final games the team was in, however they were recorded (S-9). Forfeits,
   * cancelled and postponed games are not counted.
   */
  finalNonForfeitGames: number;
  /** Stat totals over the team's players; gamesRecorded counts games with the stat on any line. */
  stats: Record<string, StatTotal>;
};
