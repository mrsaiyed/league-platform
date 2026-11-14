// packages/sports: the rules of each sport, standings maths and stat formulas (T2 §2).
// Used only through this file. The Al-Hadi tracker and its tests still read the
// basketball engine (src/basketball) by path, as they did before stage 1.
export { calculateStandings } from './src/standings/index.ts';
export type {
  CoinFlip,
  DecidedBy,
  GameStatus,
  StandingsAdjustment,
  StandingsGame,
  StandingsInput,
  StandingsProblem,
  StandingsProblemReason,
  StandingsResult,
  StandingsRow,
  StandingsRules,
  StandingsTable,
  StandingsTeam,
  Streak,
  Tiebreaker,
} from './src/standings/index.ts';
export { leaders, seasonTotals, teamTotals } from './src/stats/index.ts';
export type {
  CaptureMode,
  Leader,
  LeaderBoardOptions,
  LeaderMeasure,
  PlayerGameLine,
  PlayerSeasonTotals,
  SeasonTotalsOptions,
  StatsGame,
  StatTotal,
  TeamSeasonTotals,
} from './src/stats/index.ts';
// The live basketball engine (T6 §1), for the platform's server (step 2.29). Re-exported
// as it is: the Al-Hadi tracker still reads it by path, and nothing about it changes.
export * as basketball from './src/basketball/live.ts';
