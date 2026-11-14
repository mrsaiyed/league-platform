// The imports module (T2 §3). Other modules and packages use only what is here.
export {
  applyFixtureImport,
  type ApplyFixtureImportError,
  type FixtureImportApplied,
} from './apply-fixture-import.ts';
export { discardFixtureImport, type DiscardFixtureImportError } from './discard-fixture-import.ts';
export {
  getFixtureImport,
  previewGameLimit,
  type FixtureImportView,
  type GetFixtureImportError,
} from './get-fixture-import.ts';
export { maxReportBytes } from './import-documents.ts';
export type {
  ImportChange,
  ImportKind,
  ImportRecord,
  ImportScoresTx,
  ImportsSchedulingStore,
  ImportsStore,
  ImportsTx,
  ImportStatus,
  NewImport,
} from './ports.ts';
export {
  discardUnreadImport,
  importsRunJob,
  readFixtureImport,
  type ReadFixtureImportResult,
} from './read-fixture-import.ts';
export {
  fixtureFileLimits,
  readFixtureSheet,
  type DraftFixture,
  type FixtureReport,
  type RowProblem,
  type SeasonNames,
  type SeasonTeam,
  type SeasonVenue,
} from './read-fixtures.ts';
export {
  recordImportedScores,
  type ImportedScoresRecorded,
  type RecordImportedScoresError,
} from './record-imported-scores.ts';
export { startFixtureImport, type StartFixtureImportError } from './start-fixture-import.ts';
export {
  mayTransferTrackerGames,
  trackerTransferPermissions,
} from './may-transfer-tracker-games.ts';
export {
  planTrackerTransfer,
  type GameOutcome,
  type GameProblem,
  type PlannedGame,
  type PlannedPerson,
  type PlanOptions,
  type TransferPlan,
} from './plan-tracker-transfer.ts';
export {
  runTrackerTransfer,
  transferDeviceId,
  type TrackerTransferTx,
  type TransferReport,
  type TransferStop,
} from './run-tracker-transfer.ts';
export type { LineDifference } from './tracker-lines.ts';
export type {
  PlatformGameFact,
  RosterPersonFact,
  SeasonGameFact,
  SeasonTeamFact,
  TrackerData,
  TrackerTransferReads,
} from './tracker-transfer-data.ts';
export { describeTransferPlan, describeTransferReport } from './tracker-transfer-words.ts';
export { undoFixtureImport, type UndoFixtureImportError } from './undo-fixture-import.ts';
