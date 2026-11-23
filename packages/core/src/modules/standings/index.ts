// The standings module (T2 §3): standings rows and season player totals, worked out
// from results (T3 §9). Other modules and packages use only what is here.
export {
  addAdjustment,
  adjustmentLimits,
  type AddAdjustmentError,
} from './commands/add-adjustment.ts';
export {
  listAdjustments,
  type ListAdjustmentsError,
  type OverturnableGame,
  type LevelSet,
  type SeasonAdjustments,
} from './commands/list-adjustments.ts';
export { awardGame, type AwardGameError } from './commands/award-game.ts';
export { overturnResult, type OverturnResultError } from './commands/overturn-result.ts';
export { removeAdjustment, type RemoveAdjustmentError } from './commands/remove-adjustment.ts';
export { recordCoinFlip, type RecordCoinFlipError } from './commands/record-coin-flip.ts';
export { removeCoinFlip, type RemoveCoinFlipError } from './commands/remove-coin-flip.ts';
export { rebuildStandings, type RebuildStandingsError } from './commands/rebuild-standings.ts';
export {
  rebuildOnGameFinalized,
  rebuildOnGameReopened,
  standingsHandlers,
} from './on-game-result.ts';
export {
  clearLeagueOnSettingChanged,
  clearLeagueOnStatusChanged,
  clearPagesOnGameFinalized,
  clearPagesOnGameReopened,
  pageCacheClearJob,
  type PageCacheClearIds,
} from './clear-page-cache.ts';
export { levelDocument, readLevel, type LevelDocument } from './level-document.ts';
export { rebuildSeason, type SeasonRebuilt } from './rebuild-season.ts';
export { previewRulesChange, type RulesChangePreview } from './preview-rules-change.ts';
export { whatWouldMove, type MovedField, type TeamMove } from './what-would-move.ts';
export type {
  CoinFlipMethod,
  NewAdjustment,
  NewCoinFlip,
  SeasonAdjustment,
  SeasonCoinFlip,
  StandingsStore,
  StandingsTx,
  TableTeam,
} from './ports.ts';
export {
  readStandings,
  winPercentageOf,
  type LevelGroup,
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
export {
  readTeamsBeyondPublic,
  teamsBeyondPublicInput,
  type ReadTeamsBeyondPublicError,
} from './queries/read-teams-beyond-public.ts';
export type {
  DecidedGameLines,
  DecidedGameRecord,
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
  TeamOwnTurnoversRecord,
} from './read-ports.ts';
export type {
  PlayerName,
  StatEntry,
  StatisticsViewing,
  TeamTotals,
  VisiblePlayer,
} from './statistics-source.ts';
