// The standings module (T2 §3). Other modules and packages use only what is here.
export {
  readStandings,
  winPercentageOf,
  type ReadStandingsError,
  type Standings,
  type StandingsFootnote,
  type StandingsLine,
  type StandingsTable,
} from './queries/read-standings.ts';
export {
  readStatLeaders,
  statLeadersInput,
  type ReadStatLeadersError,
  type StatLeader,
  type StatLeaders,
} from './queries/read-stat-leaders.ts';
export {
  readStatisticsTable,
  type ReadStatisticsTableError,
  type StatisticsTable,
} from './queries/read-statistics-table.ts';
export {
  readTeamRecord,
  readTeamRecords,
  type ReadTeamRecordError,
  type ReadTeamRecordsError,
  type TeamStanding,
} from './queries/read-team-records.ts';
export type {
  PersonDisplayRecord,
  PlayerTeamLink,
  PlayerTotalsRecord,
  SeasonDivisionRow,
  SeasonTeamRow,
  StandingsAdjustmentWithReason,
  StandingsReadStore,
  StandingsRowRecord,
  StandingsSeasonRecord,
  TeamStatTotalRecord,
} from './read-ports.ts';
export type {
  PlayerName,
  StatEntry,
  StatisticsViewing,
  TeamTotals,
  VisiblePlayer,
} from './statistics-source.ts';
