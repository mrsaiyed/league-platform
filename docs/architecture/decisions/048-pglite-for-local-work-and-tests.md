# 048 — PGlite for local work and tests

Date: 2026-11-14. Step 1.24 (records). Records the T1 section 6 local-environment choice as stage 1 built it, and a decision made along the way. Decided by the lead (technical).

## What

- **PGlite 0.5.12, pinned**, is real PostgreSQL running inside Node (`@electric-sql/pglite`, in the root `dependencies`). It is the local database for the whole stack (T1 §6: "the whole stack runs locally, including the database").
- **It is used in four places:**
  1. The migration runner's `pgliteDriver` (record 006). Database tests and `npm run seed` apply every migration with it.
  2. `createDatabase({ kind: 'pglite' })` (record 009), for the typed queries and transactions in tests.
  3. The live stat tracker's embedded database, in `.local/live-stats/` when no `DATABASE_URL` is set (`apps/live-stats/storage.ts`).
  4. `npm run seed` writes two made-up leagues into `.local/seed-db`, a PGlite folder (`packages/database/scripts/seed-leagues.ts`).
- **The web app's local mode uses no database at all.** With `APP_ENV` set to `local` or `test`, `apps/web/src/server/stand-in-ports.ts` holds made-up leagues and people in memory. Nothing in the web app reads `.local/seed-db` yet.
- **Known limits**: PGlite has one connection, so it cannot show two workers racing for jobs, lock contention or a connection pool (record 012). pg-boss runs on PGlite as the production queue would (record 012).

## Considered

- A third-party PGlite dialect for Kysely was rejected: about 80 lines of our own is less to depend on (record 009).
- PGlite as the queue's test database was accepted because pg-boss supports it (record 012).
- Running a full PostgreSQL server for local work is not recorded as considered. The spec's local environment assumes the database runs on the developer's machine, which PGlite does without a separate install.

## Revisit if

- A bug appears that only shows with real concurrency, which PGlite cannot exercise. Then local tests need a real PostgreSQL server.
- PGlite's behavior changes for a feature we rely on (migrations, transactions, pg-boss), at a version upgrade.
