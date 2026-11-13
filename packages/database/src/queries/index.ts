// Typed queries (T1 §1). Each takes the scope withTransaction opened; one that
// touches league data takes a LeagueScope (T-28), except the few T-221 lookups that
// must answer before a league is known. Used only through this file.
export { findCurrentLeague, type CurrentLeague } from './find-current-league.ts';
export { findLeagueByShortName, type LeagueByShortName } from './find-league-by-short-name.ts';
export { findProgramBySlug } from './find-program-by-slug.ts';
export { findProgramId } from './find-program-id.ts';
export { insertLeague, type InsertLeagueRefusal, type NewLeagueRows } from './insert-league.ts';
export { insertSeason, type NewSeasonRow } from './insert-season.ts';
export { listPrograms } from './list-programs.ts';
export { renameLeagueSlug } from './rename-league-slug.ts';
export { setCurrentSeason } from './set-current-season.ts';
export { updateLeagueName } from './update-league-name.ts';
export { updateLeagueStatus } from './update-league-status.ts';
export type { ProgramSummary } from './program-summary.ts';
