// The games module (T2 §3). Other modules and packages use only what is here.
export { cancelGame, type CancelGameError } from './commands/cancel-game.ts';
export { listPostponedGames, type PostponedGame } from './commands/list-postponed-games.ts';
export { postponeGame, type PostponeGameError } from './commands/postpone-game.ts';
export { recordFinalScore, type RecordFinalScoreError } from './commands/record-final-score.ts';
export { recordForfeit, type RecordForfeitError } from './commands/record-forfeit.ts';
export { reopenGame, type ReopenGameError } from './commands/reopen-game.ts';
export { gameFinalized, gameReopened, type GameFinalized, type GameReopened } from './events.ts';
export { recordingOf } from './game-fields.ts';
export { seasonResults, type SeasonResults } from './season-results.ts';
export type {
  GameLine,
  GameRecord,
  GameResultDocument,
  GameResultChange,
  GamesStore,
  GamesTx,
  NewGameCorrection,
} from './ports.ts';
