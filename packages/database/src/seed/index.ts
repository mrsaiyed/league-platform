// The made-up seed leagues (T-195): their data and the loader, and a made-up
// database in memory that holds them, for local work and the apps' tests.
export {
  madeUpDatabase,
  madeUpLoginRole,
  type MadeUpDatabase,
  type MadeUpLeague,
} from './made-up-database.ts';
export { seedLeagues, seedStaff, type SeedLeague } from './seed-data.ts';
export { seedLeaguesInto, type SeededLeague } from './seed-leagues.ts';
