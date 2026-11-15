// Making a league from this computer (step 2.125 part 1, record 057), for
// scripts/make-league.mjs. Used only through the package's index.ts.
export {
  openLeagueMakingTarget,
  type ConnectCause,
  type LeagueMakingPlace,
  type LeagueMakingSource,
  type LeagueMakingTarget,
  type Login,
  type OpenTargetProblem,
  type OpenTargetResult,
  type PostgresAddress,
} from './league-making-target.ts';
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
