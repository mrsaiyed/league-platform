// The tracker's database guard (record 055), shared by the web app's and the worker's
// settings checks. Used only through the package's index.ts.
export {
  databaseCertificateFrom,
  type CertificateFileReader,
  type DatabaseCertificate,
} from './database-certificate.ts';
export {
  addressOnThisComputer,
  isIpLiteral,
  platformDatabaseProblem,
  platformServiceProblem,
  trackerProjectProblem,
  type TrackerGuardFacts,
} from './platform-database-guard.ts';
export { trackerProjectFor, trackerProjectOf } from './tracker-project.ts';
