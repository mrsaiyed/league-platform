# 009 — Typed queries and the transaction helper

Date: 2026-11-13. Step 1.8; serves T-1 (Kysely), T-28, T-61. Decided by the lead (technical).

## What

- **Kysely 0.29.7**, pinned: the newest release at least two weeks old. One factory, `createDatabase`, for PGlite (our own small dialect, about 80 lines) and for real PostgreSQL (Kysely's `PostgresDialect` over `pg`).
- **The Kysely instance is hidden.** The factory returns an opaque handle; a scope's transaction is held in a private lookup. Other workspaces cannot write `db.selectFrom(...)` and so cannot dodge T-28 or the SQL-location check.
- **`withTransaction(db, {leagueId?, accountId?}, work)`** opens one transaction, runs `set local role app_user`, then `set_config('app.league_id', …, true)` and `set_config('app.account_id', …, true)`, always transaction-local, never session-wide. Ids must be UUIDs. A `LeagueScope` (only obtainable this way) is required by every league query, which also filters on `leagueId` itself on top of the database's own fence.
- **A guard around the driver** refuses any query sent after, or during, commit or rollback, waits for running ones, and refuses nested transactions and bare-handle queries inside the work. Without it a stray un-awaited query ran after COMMIT as the login role with no league set (found in review).
- **Types are generated** from the migrations by `npm run db:types` into a checked-in `schema-types.ts`; a test fails on drift. The generator refuses types it has no safe mapping for (bigint, date[]/jsonb[] arrays).
- **`date` is read as `YYYY-MM-DD` text** in both set-ups, to avoid time-zone shifts.
- **`checkLoginRole`** reports a login role that is a superuser, bypasses row-level security, or owns tables. It is not called yet; step 1.17 must call it at startup.

## Considered

- A third-party PGlite dialect: another dependency for 80 lines.
- Exposing the Kysely instance: simpler, but makes the league fence optional by convention.
- A session-level `set_config`: a pooled connection would carry one league into the next request.

## Revisit if

- Supabase's pooler does not allow `set local role` in a transaction, or the pg path misbehaves on a hosted database (not yet run against one).
- Streaming or savepoints (nested transactions) are needed.
