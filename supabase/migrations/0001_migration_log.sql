-- 0001: the migration log (T-48).
--
-- The runner (packages/database/src/migrations) records every applied file in
-- migration_log.applied, with its checksum, and creates that table itself before
-- the first file runs. This file makes the schema private: it is bookkeeping for
-- the runner, not something the app or the hosted API reads.
--
-- Files in this folder run in number order, each in one transaction, and are never
-- edited once applied. Dropping or renaming in one step is rejected by the gate
-- (T-183): see scripts/structure/migration-safety.mjs.

create schema if not exists migration_log;

revoke all on schema migration_log from public;

comment on schema migration_log is
  'Bookkeeping for the migration runner: one row per applied file in supabase/migrations.';
