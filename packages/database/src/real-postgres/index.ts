// A throw-away PostgreSQL on this computer, for tests (step 2.202, record 092): what
// scripts/real-postgres.mjs does inside the server it starts. Used only through this
// file, by that script; not exported from the package, so nothing the app runs reaches
// it. The tests in tests/real-postgres import real-postgres.test-helper.ts instead: what
// a test is given (the two addresses and the authority's file) and the questions it asks.
export {
  connectionFileName,
  localAddress,
  prepareRealPostgres,
  realPostgresFolder,
  realPostgresNames,
  type PreparedRealPostgres,
  type RealPostgresServer,
} from './prepare-real-postgres.ts';
