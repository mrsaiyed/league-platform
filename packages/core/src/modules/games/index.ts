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
export { reopenGame, type ReopenGameError } from './commands/reopen-game.ts';
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
export type {
  GamePageTeam,
  GamePersonRecord,
  GamePlayerLine,
  GamesReadStore,
} from './read-ports.ts';
export { seasonResults, type SeasonResults } from './season-results.ts';
export type {
  GameInWindow,
  GamesWindow,
  GameLine,
  GameRecord,
  GameResultDocument,
  GameResultChange,
  GamesStore,
  GamesTx,
  NewGameCorrection,
} from './ports.ts';
