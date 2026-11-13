// Typed queries (T1 §1). Each takes the scope withTransaction opened; one that
// touches league data takes a LeagueScope (T-28). Used only through this file.
export { findProgramBySlug } from './find-program-by-slug.ts';
export { listPrograms } from './list-programs.ts';
export type { ProgramSummary } from './program-summary.ts';
