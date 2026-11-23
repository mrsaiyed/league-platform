# 092 — A real PostgreSQL on this computer, for tests

Date: 2026-11-17. Step 2.202 (T-292). Serves T-60, T-61, T-201, T9 §3 and the going-online audit ([going-online.md](../../build/audits/going-online.md), its case notes 6.2 and finding H1).

**Run on PostgreSQL 16.15 on a cloud machine of the Claude app (Linux, as root, so the server ran as the machine's `postgres` account). Not run on Windows or macOS, nor on GitHub's machines yet.**

## Problem

Every database test ran on PGlite: one session, no encryption, every statement as a superuser. What only a real server shows had never been tried by a test: many connections at once each keeping their own league, the server's certificate checked, and the roles as Supabase makes them, where the tables' owner is not a superuser and may not act as the roles it made. The lead met two of those for the first time on the test copy itself (2026-11-13), and the going-online audit met the rest by hand. The first time a fault of this kind showed would have been in front of the founder, at the first online session.

## What

- **`scripts/real-postgres.mjs start | stop | status | test`**, its rules in `real-postgres-rules.mjs` (tested without PostgreSQL in `tests/real-postgres-rules.test.mjs`) and its words in `real-postgres.messages.mjs`. `npm run test:real-postgres` runs `test`. Procedure: [real-postgres.md](../../operations/real-postgres.md).
- **From what the computer has.** PostgreSQL 16 or newer from `REAL_POSTGRES_BIN`, else `/usr/lib/postgresql/<version>/bin` (newest first), else `PATH`; openssl from `PATH`. Nothing is installed. Where a program is missing it fails naming it and where it looked, before anything starts; it never skips.
- **This computer only, encrypted only.** `listen_addresses = 'localhost'`, no socket file; `pg_hba.conf` holds only `hostssl` lines for `127.0.0.1` and `::1` with SCRAM passwords. The certificate names localhost and both loopback addresses and is signed by an authority made at each start with openssl, whose key is then removed.
- **The roles of a hosted database.** initdb's superuser makes the tables' owner, `postgres`, as the audit describes Supabase's (`nosuperuser createrole bypassrls`, nothing more), and its database, then its password is forgotten. The owner applies every migration with the repository's own runner (`connectPostgresDriver` with the authority's certificate, `applyMigrations`) and makes `app_login` as on 2026-11-13. That SQL is in `packages/database/src/real-postgres/prepare-real-postgres.ts`, because SQL lives only in `packages/database`; the folder's `index.ts` carries only that, for the script, which Node runs and which must not load a test's helper.
- **What a test gets.** `real-postgres.test-helper.ts`: `realPostgres()` returns the owner's address, `app_login`'s address and the authority's file, and nothing more; it refuses an address not on localhost and fails in plain words when no server runs. The probes beside it hold the SQL the tests ask.
- **The tests**, in `tests/real-postgres`, one file at a time (`vitest.config.ts` there): the logins (`checkLoginRole`, the catalog's powers and memberships, `set role`), the fence through `app_login` (no league set, two leagues, two connections at once, a connection reused), the planted fault (the fence off on `programs` makes the fence's tests fail as a run of their own, naming it), encryption and the migrations, and start, status and stop on a second server.
- **`stop`** stops the server, checks that no process is left working in its folder (on Linux each one's working folder shows it; a process that ended and was never collected, which a machine whose first process does not collect leaves behind, counts as gone), and removes the folder: git sees nothing.
- **Found on the first run, fixed with it:** `checkLoginRole` counted the owner's membership of `app_user` as enough. From PostgreSQL 16 on, the role that made `app_user` holds it with ADMIN only (`inherit false, set false`) and may not switch to it, so every transaction would be refused. It now names that fault too ("it is a member of app_user but may not switch to it (set role)"), with a PGlite case beside the others.
- **Found by the review on the real server, fixed in its fix round (2026-11-22):** `checkLoginRole` read only the login's own powers, so a login granted a role that bypasses row-level security passed and could then `set role` to it and see every league; owned tables were looked for in `public` only. It now follows every role the login may become or act as, at any depth (PostgreSQL 16's SET and ADMIN options read; on an older server any membership counts), and refuses each that is a superuser, bypasses the fence, may create roles or databases, may start replication or owns a table in any schema but the server's own, naming the way there and the one statement that takes it away; the login's own createrole, createdb and replication are refused too. It was the real server, not PGlite (where everything runs as a superuser), that showed the gap.

## Considered

- **A container image** (Docker's `postgres:16`). Closest to a clean server, but Docker is not on every computer here and installing it is not ours to do; this needs only what the computer has.
- **PGlite over a socket** (`@electric-sql/pglite-socket`, which the driver's own test uses). Still one session and a superuser: it cannot show what this step is for.
- **The test copy on Supabase.** The real thing, but only the lead may reach it, only in a session the founder started (T-201, CLAUDE.md); it cannot be a test any builder runs.
- **A server kept between runs.** Faster by a second or two, but its data would build up and its passwords would last; each `start` makes a fresh one, and the tests make their leagues under names no earlier run used, so a server left running by `start` serves them too.
- **The owner made with more powers** (making databases, replication), which Supabase's `postgres` may also have: not checked here, since it needs Supabase itself. No test needs them and the audit's description does not name them, so they are left out: a migration that needed one would fail here first, which is the side to fail on.

## Would make us revisit

- GitHub's check runs it (step 2.99, after lane 2.191): the job needs only `/usr/lib/postgresql/16/bin`, which GitHub's Ubuntu machines carry.
- Supabase's database is PostgreSQL 17: the newest installed version is chosen, so a computer with 17 runs on 17. If a difference between 16 and 17 matters, the tests say which version they ran on.
- The two-league harness (T-65) on the real server: its harness takes PGlite only. Moving it here is its own step; this server, the helper and the hosted path to make leagues are what it would use.
- A Windows or macOS computer that runs it: the script is written for them (program names, `REAL_POSTGRES_BIN`, Git Bash's paths) but has not been run there.
