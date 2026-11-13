// Typed queries (T1 §1). Each takes the scope withTransaction opened; one that
// touches league data takes a LeagueScope (T-28). Used only through this file.
export { findCurrentLeague, type CurrentLeague } from './find-current-league.ts';
export { findProgramBySlug } from './find-program-by-slug.ts';
export { findProgramId } from './find-program-id.ts';
export { insertJob } from './insert-job.ts';
export { insertLeague, type InsertLeagueRefusal, type NewLeagueRows } from './insert-league.ts';
export { insertSeason, type NewSeasonRow } from './insert-season.ts';
export { listPrograms } from './list-programs.ts';
export { renameLeagueSlug } from './rename-league-slug.ts';
export { setCurrentSeason } from './set-current-season.ts';
export { settleJob, type JobSettlement } from './settle-job.ts';
export { takeJobs, type NoLeagueScope, type TakenJob } from './take-jobs.ts';
export { updateLeagueName } from './update-league-name.ts';
export { updateLeagueStatus } from './update-league-status.ts';
export type { ProgramSummary } from './program-summary.ts';
