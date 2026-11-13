// Reaching the database (T1 §1, T-28, T-61). Other workspaces use it only through
// this file, and get a handle and scopes, never the Kysely instance or a scope's
// transaction. The query files in ../queries are inside this package and reach those
// through kyselyOf and transactionOf on purpose; nothing outside the package can.
export { checkLoginRole } from './check-login-role.ts';
export { createDatabase, type DatabaseSource } from './create-database.ts';
export type { DatabaseHandle } from './database-handle.ts';
export type { AppScope, LeagueScope } from './transaction-scope.ts';
export { withTransaction, type AccountContext, type LeagueContext } from './with-transaction.ts';
