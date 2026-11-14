# 046 — PostgreSQL on Supabase as the hosted target, reached by a direct connection

Date: 2026-11-14. Step 1.24 (records). Records how T-4 and T-5 are used in code during stage 1. Decided by the lead (technical).

## What

- **The database is PostgreSQL**, one database for all leagues (T-4). The hosted target is Supabase's PostgreSQL (T-5). Stage 1 writes code for any PostgreSQL address; it has not yet been run against a hosted database.
- **The app reaches it through one function** (`createDatabase` in `packages/database/src/db/create-database.ts`) with a `postgres://` address from `DATABASE_URL`. The pool is `pg` (node-postgres) with SSL checked against the certificate by default.
- **The migration runner needs a direct, session-level connection.** Its driver (`packages/database/src/migrations/postgres-driver.ts`) holds one connection for a whole run, so the run lock and each transaction's limits stay on it. A transaction-mode pooler (Supabase port 6543) is refused by its documentation. Record 006 covers the runner.
- **The app logs in as a restricted role**, `app_user` (T-60). At startup, staging and production call `checkLoginRole`, which stops the start if the login is a superuser, bypasses row-level security or owns the tables (record 009). Staging and production then still refuse to serve until sign-in on the real service is wired (record 020, steps 1.14 and 1.15).
- **The live stat tracker** uses the same variable for its own Supabase connection. `.env.example` tells the founder to use Supabase's Session pooler on port 5432, not the transaction pooler. This tracker is separate from the platform's tables and must not change behavior (T-16).
- **Not verified**: nothing above has been run against a hosted Supabase database. Record 012 names the first run as a gate before the first staging use, and it lists what PGlite cannot show (concurrent workers, pooler behavior).

## Considered

The spec gives the reasons: relational data (T-4), and Supabase as one vendor for database, sign-in, files and live updates at low cost, with standard PostgreSQL so the database can move later (T-5). Firebase and document databases were considered and rejected in the spec (T1 §3). No other hosted PostgreSQL is recorded as an alternative.

## Revisit if

- The first run against a hosted database (the gate in record 012) shows a difference from PGlite, such as the pooler refusing `set local role` (record 009).
- Supabase's pooler or connection rules change, or only a transaction-mode pooler is available for the app.
- Staging or production need a different login role model.
