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
// Games that still need a result, however old, and earlier games by round (step 2.156).
export {
  listGamesNeedingResult,
  needsResultLimit,
  type GamesNeedingResult,
} from './commands/list-games-needing-result.ts';
export {
  earlierRoundGamesLimit,
  earlierRoundsLimit,
  listEarlierGames,
  type EarlierGames,
  type EarlierRound,
} from './commands/list-earlier-games.ts';
// Every scheduled game after this week (step 2.56).
export {
  laterGamesDays,
  laterGamesLimit,
  listLaterGames,
  type LaterGames,
} from './commands/list-later-games.ts';
// Which of a public page's games the signed-in person may score (step 2.153).
export {
  listScoringOffers,
  scoringOffersLimit,
  type ScoringOffer,
  type ScoringOffers,
} from './commands/list-scoring-offers.ts';
export { needsResult, oldestFirst, type ResultFacts } from './needs-result.ts';
export { correctedMarkDate, type MarkCorrection, type MarkResult } from './corrected-mark.ts';
export { earlierRoundKey, parseEarlierRoundKey } from './earlier-round-key.ts';
export {
  earlierRoundsOf,
  inEarlierRound,
  isEarlierGame,
  type GameWithRound,
} from './earlier-rounds-of.ts';
export {
  unassignScorekeeper,
  type UnassignScorekeeperError,
} from './commands/unassign-scorekeeper.ts';
export { mayScoreGame } from './policy.ts';
export type { ScoringRule } from './scoring-access.ts';
// What a person may score, as the stores filter the lists before they cut (step 2.156).
export { inScoringReach } from './scoring-access.ts';
export { listPostponedGames, type PostponedGame } from './commands/list-postponed-games.ts';
// Admin → Games → Scorekeepers (step 2.56): a season's open games and who may score them.
export {
  listScorekeepers,
  type GameScorekeepers,
  type ListScorekeepersError,
  type PossibleScorekeeper,
  type SeasonScorekeepers,
} from './commands/list-scorekeepers.ts';
export { postponeGame, type PostponeGameError } from './commands/postpone-game.ts';
export {
  putBackReasons,
  putGameBack,
  type PutGameBack,
  type PutBackReason,
  type PutGameBackError,
} from './commands/put-game-back.ts';
export {
  maxOvertimePeriods,
  recordFinalScore,
  type RecordFinalScoreError,
} from './commands/record-final-score.ts';
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
// One answer for the columns of the statistics page and a game's box score (step 2.196).
export { statisticsKept } from './statistics-kept.ts';
// What the scoring screen offers and the server takes (S-93, step 2.241).
export { keptForScoring, statisticOfTap, tapNotKept } from './statistic-of-tap.ts';
// A team's own count, from the saved plays: in its Total and its season's (step 2.196).
export { teamOwnCounts, type TeamOwnCount, type TeamOwnCounts } from './team-own-counts.ts';
export { reopenGame, type ReopenGameError } from './commands/reopen-game.ts';
export { endTrackedGame, type EndTrackedGameError } from './commands/end-tracked-game.ts';
export { markNotStarted, type MarkNotStartedError } from './commands/mark-not-started.ts';
export { giveGameFormat, type GiveGameFormatError } from './commands/give-game-format.ts';
export { clearGameFormat, type ClearGameFormatError } from './commands/clear-game-format.ts';
export {
  readGameFormat,
  type GameFormatView,
  type ReadGameFormatError,
} from './commands/read-game-format.ts';
export type { FormatChange, FormatRefusal } from './game-format.ts';
export { hasPlaysPastMarker } from './plays-past-marker.ts';
export { reopenTrackedGame, type ReopenTrackedGameError } from './commands/reopen-tracked-game.ts';
export { readReopenOffer, type ReadReopenOfferError } from './commands/read-reopen-offer.ts';
export { reopenOwnResult, type ReopenOwnResultError } from './commands/reopen-own-result.ts';
export { putSheetBack, type PutSheetBackError } from './commands/put-sheet-back.ts';
export {
  readSheetPutBackOffer,
  type ReadSheetPutBackOfferError,
  type SheetPutBackOffer,
} from './commands/read-sheet-put-back-offer.ts';
export { resultDocumentOf } from './kept-sheet.ts';
export {
  readOwnResultOffer,
  type ReadOwnResultOfferError,
} from './commands/read-own-result-offer.ts';
export { readOwnResultOffers, type OwnResultWindow } from './commands/read-own-result-offers.ts';
export type { OwnResultNotOffered, OwnResultOffer } from './own-result-window.ts';
export type { HandResultFacts } from './ports.ts';
export type {
  ReopenNotOffered as GameReopenNotOffered,
  ReopenOffer as GameReopenOffer,
  ReopenWhen as GameReopenWhen,
} from './reopen-window.ts';
export { recordFinalScoreWithin } from './record-score-within.ts';
export type { DecideGameError } from './decide-game.ts';
export { isOverOrCalledOff, recordingOf } from './game-fields.ts';
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
  type TrackerCommandsApplied,
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
export { engineRulesOf, trackerEngineRulesOf, withoutMercyOrLastMinutes } from './engine-rules.ts';
export { namedInState, splitTableName } from './table-players.ts';
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
  LostScoringSession,
  ScoringSessionsStore,
  ScoringTx,
} from './ports.ts';
export type {
  GamePlayer,
  LiveGameLine,
  LiveGamesStore,
  NewGameEvent,
  NewTablePlayer,
  RefusedAdd,
  SavedGameState,
  TablePlayer,
  TablePlayerChange,
  TablePlayerRefusal,
  TrackerTx,
} from './ports.ts';
export type {
  EarlierRoundCount,
  EarlierRoundRef,
  GameAtSameTime,
  GameInWindow,
  GamesWindow,
  ScoringReach,
  GameLine,
  GameRecord,
  GameRosterEntry,
  GameRosterPlayer,
  NewGameLine,
  GameResultDocument,
  KeptLine,
  KeptSheet,
  StoredGameCorrection,
  GameResultChange,
  GamesStore,
  GamesTx,
  GameAssignment,
  NewGameCorrection,
  ScorekeepersTx,
  SeasonAssignments,
} from './ports.ts';
