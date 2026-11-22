// The made-up seed leagues (T-195): their data and the loader, and a made-up
// database in memory that holds them, for local work and the apps' tests.
export { demoLeague, type DemoLeague } from './demo-league-data.ts';
export {
  madeUpDatabase,
  madeUpLoginRole,
  type MadeUpDatabase,
  type MadeUpLeague,
  type MadeUpOptions,
} from './made-up-database.ts';
export { seedAllLeaguesInto, type SeedLoad } from './seed-all-leagues.ts';
export { seedLeagues, seedStaff, type SeedLeague } from './seed-data.ts';
export { seedLeaguesInto, type SeededLeague } from './seed-leagues.ts';
export { SeedPartlyLoaded } from './seed-partly-loaded.ts';
export {
  serveMadeUpDatabase,
  type MadeUpDatabaseServer,
  type MadeUpDatabaseServerOptions,
} from './serve-made-up-database.ts';
export {
  checkSimulatedLeague,
  reportLines as simulationReportLines,
  type Check as SimulationCheck,
  type SimulationReport,
} from './simulate-league-check.ts';
export {
  expectedBoxScore,
  expectedGame,
  expectedPlayerTotals,
  expectedTables,
} from './simulate-league-expected.ts';
export {
  planSimulation,
  simulatedOwner,
  simulationDefaults,
  simulationOptionNames,
  simulationOptionsFrom,
  simulationProblem,
  type SimulationOptions,
  type SimulationPlan,
} from './simulate-league-plan.ts';
export {
  rebuildSimulatedStandings,
  simulateLeagueInto,
  type PlayedLeague,
} from './simulate-league.ts';
