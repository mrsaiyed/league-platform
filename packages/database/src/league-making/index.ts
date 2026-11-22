// Making a league from this computer (step 2.125 part 1, record 057), for
// scripts/make-league.mjs. Used only through the package's index.ts.
export {
  // Also the web app's start-up's (record 082): why the database refused it, by kind.
  connectCauseOf,
  openLeagueMakingTarget,
  // The release command's (step 2.95, record 101): the migration login alone, the same checks.
  openMigrationTarget,
  serverCodeOf,
  type ConnectCause,
  type LeagueMakingPlace,
  type LeagueMakingSource,
  type LeagueMakingTarget,
  type Login,
  type MigrationTarget,
  type MigrationTargetResult,
  type MigrationTargetSource,
  type OpenTargetProblem,
  type OpenTargetResult,
  type PostgresAddress,
} from './league-making-target.ts';
// The release command's (step 2.95, T-158): how many games are live, in every league.
export { countLiveGames, type LiveGamesCount } from './count-live-games.ts';
export { type LoginProblem, type MigrationLoginGap } from './probe-logins.ts';
export {
  makeLeague,
  previewNewLeague,
  type AccountsLeft,
  type AccountState,
  type MadeAccount,
  type MadeLeague,
  type MakeLeagueOptions,
  type MakeLeagueOutcome,
  type MakeLeagueProblem,
  type NewLeaguePreview,
  type TargetProblem,
} from './make-league.ts';
export { type MigrationState } from './migration-state.ts';
export { type MadeLeagueFacts } from './login-queries.ts';
// Removing a league made by mistake (step 2.150, record 063), for scripts/remove-league.mjs.
export {
  previewLeagueRemoval,
  removeLeague,
  type LeagueRemovalAnswer,
  type LeagueRemovalPreview,
  type LeagueRemovalRequest,
  type RemovalReadBack,
  type RemovedLeague,
  type RemoveLeagueOptions,
  type RemoveLeagueOutcome,
  type RemoveLeagueProblem,
} from './remove-league.ts';
export { type AccountKept, type OwnerAccountOutcome } from './owner-account.ts';
export { type LeagueToRemove, type PlatformLogEntry } from './removal-queries.ts';
