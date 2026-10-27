# ADR-005: live stats storage behind one interface

**October 27, 2026 · Accepted**

## Context

The live stat tracker is going online. Supabase (PostgreSQL) is the first choice, but the product may later move to a document database such as Firestore or to another provider. Changing databases must not mean rewriting the tracker, its pages or the basketball rules.

## Decision

All live stats storage goes through `LiveStatsRepository` (`packages/database/src/live-stats/repository.ts`). The application layer (`apps/live-stats/service.ts`) validates input, applies the shared engine and computes season totals; it never sees SQL. The interface is shaped so a document database can implement it directly: whole-record reads and writes, no joins or aggregate queries, and one transaction callback for recording a scorer action, the pattern Firestore, DynamoDB and SQL databases share.

Adapters today:

- `PostgresRepository`: embedded PGlite locally, and any hosted PostgreSQL (Supabase first) through the `pg` driver.
- `MemoryRepository`: documents in memory, for tests and demos, showing nothing depends on SQL.

`tests/live-stats-storage.test.mjs` runs the same behaviour against every adapter, including PostgreSQL reached over the network the way a hosted database is. A new adapter is ready when it passes. `apps/live-stats/storage.ts` picks the adapter from the environment.

The browser never talks to the database. It talks to this app's server, so moving databases does not change the pages, and no database credentials reach a browser.

## Consequences

- Season totals are added up in the application from final games' lines rather than by a SQL aggregate. At a team's scale (tens of games, a few dozen players) this costs nothing; at league scale an adapter may compute them natively behind the same method.
- Provider features that bypass the server (Supabase Realtime, Firestore listeners, row-level security for direct client access) are not used yet. Adopting one later is a change to this decision, not a hidden coupling.
- Live updates come from the server that saved the play, so the hosted server runs as one instance until a shared channel is added.
