# Varsity engineering: code, data and growth path

[Initiative index](README.md) · October 27, 2026 · Read with the [platform engineering contracts](../../product/platform/engineering/README.md)

## Repository responsibilities implemented now

| Path                                       | Responsibility                                             | Forbidden coupling                                   |
| ------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------- |
| `apps/varsity-preview/server.ts`           | Loopback HTTP, input/error handling, adapter wiring        | No production auth claims or public binding          |
| `apps/varsity-preview/public/`             | Operator pages, controls, pending-command UI               | No direct SQL, provider keys or authoritative totals |
| `packages/contracts/src/varsity.ts`        | Strict Zod schemas and inferred command types              | No browser framework/database dependencies           |
| `packages/sports/src/basketball/scorer.ts` | Pure clock, lineup, scoring and correction rules           | No HTTP, SQL, school name or global clock reads      |
| `packages/database/src/varsity/`           | Local SQL schema, atomic commands and scoped queries       | No browser state as source of truth                  |
| `tests/varsity-*.test.mjs`                 | Independent arithmetic, persistence, races and scope tests | No real athlete fixtures                             |
| `scripts/check-varsity-browser.mjs`        | Isolated browser/HTTP rehearsal and screenshots            | No shared user database                              |

The app uses strict TypeScript, native Node 24 TypeScript execution, parameterized SQL and one pinned lockfile. Vanilla browser modules keep this narrowly scoped rehearsal simple. The future Next.js app consumes extracted contracts/reducer behavior; do not copy customer-specific business logic into a separate source fork. The preview adapter is intentionally separate from future production migrations/RLS.

## PostgreSQL recommendation

Use managed PostgreSQL for the product; Supabase remains the first hosting/auth candidate, pending provider/security/cost validation. Transactions, relational constraints and repeatable aggregation directly fit rosters, games, results, payments and scoped ownership. Firestore could implement these workflows, but would require a different denormalization, transaction and reconciliation design. Do not maintain two authoritative databases for this slice.

The working local mock uses [PGlite](https://pglite.dev/docs/), an embedded PostgreSQL engine with [Node filesystem persistence](https://pglite.dev/docs/filesystems). This proves SQL-backed workflow behavior without inventing cloud credentials. It does **not** prove hosted PostgreSQL throughput, multiple server connections, RLS, backup service or operational readiness.

## Executable local schema

`001-preview.sql` is the source of truth for exact local columns/checks. All tables are namespaced under `varsity_preview`. This is a preview schema, not the final multitenant production schema.

| Table               | Identity and important fields                                                                                                             | Integrity/use                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `workspace`         | UUID, name, roster revision                                                                                                               | Local singleton; injected workspace IDs in tests                                         |
| `roster`            | UUID, workspace UUID, name, jersey text, active                                                                                           | Composite workspace/ID key; unique active jersey per workspace                           |
| `games`             | UUID, workspace UUID, creation command/hash, opponent, tracked side, optional schedule/venue/source, practice flag, revision, state JSONB | Unique creation command per workspace; frozen game roster/rules in state                 |
| `game_events`       | UUID, workspace/game, sequence, command ID, payload hash, command JSONB, accepted time, resulting status                                  | Scoped FK; unique game sequence and command ID; accepted records append only through API |
| `player_game_lines` | Workspace/game/player, snapshot name/jersey, tracked flag, appeared, points, made baskets, fouls, integer milliseconds, minute quality    | Scoped game FK; one line per player/game; nonnegative stats; point formula check         |
| `roster_audit`      | Workspace, revision, accepted time, player count                                                                                          | Records roster-save revisions; not a full production actor/field audit                   |

Game snapshots intentionally remain independent of subsequent active-roster edits. Removing a player archives their roster record; re-adding as a new row creates a new identity. The preview has no identity merge/recovery UI; do not use remove/re-add to rename a returning player. Opponents use per-game UUIDs; sharing a jersey never implies the same person.

## Atomic command protocol

`POST /api/games/:id/commands` accepts `{commandId, expectedRevision, input}`. Schemas reject unknown keys, invalid UUIDs and unsupported commands. Preview revisions are bounded nonnegative safe integers; the production contract retains bigint/string revisions and versioned envelopes.

In one transaction:

1. Select the workspace-scoped game `FOR UPDATE`; return not found across workspace boundaries.
2. Check the command receipt first. Same ID/hash returns current accepted game state without applying again; mismatched payload is a conflict.
3. Compare expected revision; reject stale requests.
4. Advance the saved clock to server time, validate and reduce the command.
5. Insert the immutable event, update state/status/revision, and upsert all player game lines.
6. Commit, then acknowledge. Any exception rolls back all steps.

The API has no SQL endpoint; the browser cannot select workspace scope, create its own event sequence or write totals. Production adds authenticated actor, live grants, scorer lease/fencing and transactional outbox to this boundary. Local application filtering tests are not a substitute for actual production-role/RLS tests.

`PUT /api/roster` locks workspace and compares roster revision before replacing active entries. `POST /api/games` uses a creation command/hash for idempotence and snapshots roster/rules. A creation request lost after commit should be checked in Games before retrying through the current UI, which does not yet retain its creation key across reload. Scoring requests do retain their key.

## Read models and automatic propagation

Live scores derive from the accepted state; game summaries and boxes use the same game revision. The local browser polls its current game every five seconds and animates the clock locally between server anchors. It does not write per clock tick. Finalization changes game status within the same transaction as player lines; SQL season queries join only finalized, non-practice tracked appearances. Reopening immediately withdraws the game, and refinalization contributes once.

The local dashboard returns at most 100 recent game summaries, but season stat aggregation covers all finalized records in the workspace. Therefore the overview's record is a recent-list demonstration, not a complete multi-season analytical report. Production must provide independently scoped aggregate summaries plus cursor pagination; never silently truncate an advertised season record. Local full event JSON is bounded at 10,000 accepted actions per game. The production read path must serve compact snapshots rather than replaying full event histories per spectator.

## Production model additions required before hosted migration

Implement these as reusable platform entities, not Al-Hadi-named tables:

| Entity/change                | Required contract                                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `team_seasons`               | Workspace-scoped UUID linking stable team and season; every team record belongs to an explicit scope                                                           |
| `external_competitions`      | Workspace/ID, display name, provider key, optional external ID/HTTPS source; descriptive reference only, no implied admin grant                                |
| `team_season_participations` | Scoped team-season + external competition reference; optional later approved hosted-entry link                                                                 |
| `team_game_records`          | Workspace/team-season/participation, tracked home/away side, opponent snapshot, source, expected rules, status/revision; independent of a host's official game |
| `team_game_participants`     | Frozen jersey/name/side; optional scoped own-roster identity; opponent identity per game unless explicitly linked                                              |
| `result_versions` / events   | Immutable finalized revisions, actor/reason, completeness/authority flags, ordered events, accepted scorer session                                             |
| Hosted link                  | Explicit audited link from team record to hosted game; uniqueness/scope validation; approval determines which source feeds official standings                  |

Separate `team_record` from `host_official` authority in DTOs and projections. Do not weaken existing hosted-game constraints by inserting fake competition entries, giving schools an external host workspace, or allowing arbitrary cross-workspace FKs. A team may keep its view of a game while another team/host has separate records; an approved reconciliation/link command resolves discrepancies without silently overwriting evidence.

Backfill team/season and stable roster mappings during migration. Export preview input/events with stable IDs, validate/replay into staging, reconcile scores/appearance/durations, and explicitly approve an import. No automatic migration is implemented. Immutable source export should remain available until verified import and retention decisions are complete.

## Local security and known limits

The server binds only to `127.0.0.1`, validates Host/Origin and cross-site request metadata, accepts bounded JSON bodies, uses strict schemas/parameterized SQL, escapes labels and serves a restrictive CSP without third-party scripts. No secrets are required. Data and locks live in gitignored `.local/`; game export contains player names and should be handled as private data.

There is no local login, authenticated actor, server role separation, RLS, encryption key management, rate limit service, monitored backup or automatic offline queue. Anyone with access to this computer/session can use the app. Never tunnel it publicly or change the bind address to expose it. Deploying a static build cannot supply those controls.

## Evidence and next work

Unit tests verify zero-point GP, DNP, point reconciliation, duplicate/wrong-side player rejection, substitution minute conservation, period caps, correction flags and final-state restrictions. Persistent PGlite tests verify rollback, replay conflicts, simultaneous stale writes, workspace query isolation, practice exclusion, finalization/reopening and close/reopen persistence. Browser tests exercise actual setup/scoring UI, lost-response recovery after reload, season totals and small screens, plus origin rejection.

Next implement hosted identity/isolation and production mappings, lease/offline recovery, immutable result publication, verified basketball rules and minute repair, then backup/device drills. Preserve the larger platform's customization, registration, finance, draft and governing-body roadmap; none is needed to validate this local stat workflow first.

## Hosted SQL pilot addendum

The founder explicitly requires shared database persistence after each scoring action. `apps/varsity-hosted` now provides an owner-private Sites/Vinext API backed by managed D1 SQL. It uses the same validated commands, basketball reducer and UI. A D1 atomic batch commits compare-and-swap game state, immutable event/receipt and player stat lines. Browser-only persistence is not an acceptable substitute. The local PGlite implementation above remains a separate rehearsal adapter. See [hosted operations](../../operations/varsity-hosting.md) for schema, access, verification and PostgreSQL migration boundaries.
