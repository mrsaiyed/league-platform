// The games module (T2 §3). Other modules and packages use only what is here.
export {
  gameFinalized,
  gameReopened,
  type GameFinalized,
  type GameReopened,
} from '../../events/game-events.ts';
export { assignScorekeeper, type AssignScorekeeperError } from './commands/assign-scorekeeper.ts';
export { cancelGame, type CancelGameError } from './commands/cancel-game.ts';
export { listMyGames, type MyGame, type MyGames } from './commands/list-my-games.ts';
export {
  unassignScorekeeper,
  type UnassignScorekeeperError,
} from './commands/unassign-scorekeeper.ts';
export { mayScoreGame } from './policy.ts';
export type { ScoringRule } from './scoring-access.ts';
export { listPostponedGames, type PostponedGame } from './commands/list-postponed-games.ts';
export { postponeGame, type PostponeGameError } from './commands/postpone-game.ts';
export { recordFinalScore, type RecordFinalScoreError } from './commands/record-final-score.ts';
export { recordForfeit, type RecordForfeitError } from './commands/record-forfeit.ts';
export {
  setBoxScore,
  type BoxScoreLineInput,
  type SetBoxScoreError,
} from './commands/set-box-score.ts';
export {
  getBoxScoreSheet,
  type BoxScoreSheet,
  type GetBoxScoreSheetError,
} from './commands/get-box-score-sheet.ts';
export { boxScoreColumns } from './box-score-columns.ts';
export { reopenGame, type ReopenGameError } from './commands/reopen-game.ts';
export { endTrackedGame, type EndTrackedGameError } from './commands/end-tracked-game.ts';
export { recordFinalScoreWithin } from './record-score-within.ts';
export type { DecideGameError } from './decide-game.ts';
export { recordingOf } from './game-fields.ts';
export {
  readGamePage,
  type BoxScore,
  type BoxScorePlayer,
  type GamePage,
  type GameViewing,
  type PlayLine,
  type PlayerRef,
  type ReadGamePageError,
} from './queries/read-game-page.ts';
export {
  liveMessageOf,
  readGameSnapshot,
  type ReadGameSnapshotError,
} from './queries/read-game-snapshot.ts';
export type {
  GamePageTeam,
  GamePersonRecord,
  GamePlayerLine,
  GameSnapshotStore,
  GamesReadStore,
} from './read-ports.ts';
export { seasonResults, type SeasonResults } from './season-results.ts';
export {
  openScoringSession,
  type OpenScoringSessionError,
} from './commands/open-scoring-session.ts';
export {
  renewScoringSession,
  type RenewScoringSessionError,
} from './commands/renew-scoring-session.ts';
export {
  releaseScoringSession,
  type ReleaseScoringSessionError,
} from './commands/release-scoring-session.ts';
export { takeOverScoring, type TakeOverScoringError } from './commands/take-over-scoring.ts';
export {
  applyTrackerCommands,
  batchReaders,
  type ApplyTrackerCommandsError,
} from './commands/apply-tracker-commands.ts';
export {
  readTrackerState,
  type ReadTrackerStateError,
  type TrackerGameState,
} from './commands/read-tracker-state.ts';
export {
  readTrackerRosters,
  type ReadTrackerRostersError,
  type TrackerRosters,
} from './commands/read-tracker-rosters.ts';
export { engineRulesOf } from './engine-rules.ts';
export { rulesOfGame } from './season-rules-of.ts';
export {
  leaseMs,
  sessionStanding,
  type ScoringHolder,
  type ScoringSessionReply,
} from './scoring-session.ts';
export { systemClock } from './system-clock.ts';
export type {
  Clock,
  NewScoringSession,
  ScoringSession,
  ScoringSessionsStore,
  ScoringTx,
} from './ports.ts';
export type {
  GamePlayer,
  LiveGameLine,
  LiveGamesStore,
  NewGameEvent,
  SavedGameState,
  TrackerTx,
} from './ports.ts';
export type {
  GameInWindow,
  GamesWindow,
  GameLine,
  GameRecord,
  GameRosterPlayer,
  NewGameLine,
  GameResultDocument,
  GameResultChange,
  GamesStore,
  GamesTx,
  NewGameCorrection,
} from './ports.ts';
