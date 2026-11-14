# 053 — The worker starts, and who makes pg-boss's tables

Date: 2026-11-14. Step 2.94; answers Stage 1 report finding R2 and record 012's open question "who creates pg-boss's schema"; serves T7 §1 and §9, T8 §7, T-30, T-60, T-142. Decided by the lead (technical). T-257.

## Problem

The worker's parts existed (the queues, the job handlers, the heartbeat and its health page) but nothing started them: it read no settings, never checked its database login, never took a job and never said it was alive (R2). Outside the tests, an invitation email or an import left for it would wait forever.

Record 012 also left open who makes pg-boss's own tables. pg-boss makes its `pgboss` schema and tables the first time it starts, and keeps making tables while it runs (a partition of its statistics table each day, a table per queue when asked, index work on upgrade). That needs a login allowed to create things, which T-60 forbids the app's login: it may change no schema.

## What

**Who makes pg-boss's tables (T-257).**

- **The release makes the schema; pg-boss makes its own tables inside it.** A migration (not yet written, see "Not done") makes a role `queue_owner` with no login and no powers, and the schema `pgboss` owned by it, open to nobody else. The worker's login is a member of both `app_user` and `queue_owner`; the web app's login is a member of `app_user` only, so it cannot reach pg-boss's tables at all.
- **pg-boss is started with `createSchema: false` on a hosted database**, so the worker never creates a schema, and with its own migrations on (the default), so its tables always match the pinned pg-boss version and an upgrade of pg-boss upgrades them on the next start. Our migrations do not carry pg-boss's SQL: it changes with each pg-boss version, and pg-boss makes tables while running anyway, so a copy in our migrations would not be enough.
- **The worker checks it at start-up** (`checkQueueSchema`, before pg-boss starts): no `pgboss` schema, or a login that may not use it or make tables in it, stops the start with plain words naming the missing release step.
- **T-60 still holds for the app's own tables.** The worker's login owns nothing in `public` and cannot change the schema the app's data lives in (`checkLoginRole` checks that, as for the web app). What it may change is pg-boss's schema, which holds job ids only (T-131) and which `app_user` cannot use.
- On PGlite (local work and tests) pg-boss makes the schema itself, as before: there is no release there.

**How the worker starts** (`apps/worker/src/start-worker.ts`, run by `npm run start:worker` through `src/main.ts`):

1. **Settings** are read once, by `apps/worker/src/config.ts` (the file the T-30 check names), and checked by `config-schema.ts`. A problem names the setting, never its value. The worker shares the web app's names (`APP_ENV`, `LOG_LEVEL`, `DATABASE_URL`, `PUBLIC_BASE_URL`, `EMAIL_FROM`, `RESEND_API_KEY`) and has two of its own: `WORKER_HEALTH_PORT` (default 3001) and `EMAIL_CAPTURE_DIR`. `DATABASE_URL` is required in staging and production, `RESEND_API_KEY` in production only. `WORKER_HEALTH_PORT` may be 0 (any free port) only in tests, and `PUBLIC_BASE_URL` must be only a scheme and host, as the web app's addresses are (it has no base path).
2. **The database.** Staging and production open `DATABASE_URL`. Local work and tests never open an address (T-201): they run on a made-up database in memory (`madeUpDatabase` in `packages/database`), with every migration and the seed leagues, used as a login that is a member of `app_user` and nothing more, so every check below passes there for the same reasons it must on a hosted database.
3. **The login role** is checked (`checkLoginRole`, T-60), then, with pg-boss on a hosted database, pg-boss's schema (`checkQueueSchema`). A database that cannot be reached stops the start; the driver's message, which may hold the address, is not repeated.
4. **The health check** listens on `WORKER_HEALTH_PORT` (T8 §7). It answers 503 until the queue has looked at the jobs table once, then 200 while each look keeps working: the queues tell the worker after every look that worked (`onPolled`, the heartbeat), and a look that failed is not a beat. Beyond 60 seconds without one it answers 503 again.
5. **The queue starts** with the job handlers.
6. **Logs** go through the observability logger (T-196, T-86), one JSON line each: `worker.started`, each job's outcome (`worker.job`: ids, outcome and error code; a failed job at error level), a queue fault (`worker.queue_error`: its kind and a fixed code, replacing `reportQueueError`), `worker.stopping`, `worker.stopped`. A field is never called `email`, `code` or the like: the logger hides those.
7. **Stopping.** SIGTERM or SIGINT, as a host sends when it stops or replaces the service, stops taking jobs, waits for the ones in hand (T7 §9), closes the health check and the database, and exits 0. If that takes more than 25 seconds it logs `worker.stop_timeout` and exits 1. Any problem at start-up closes what was opened and exits 1. The program sets its exit code and ends once nothing is left open, so the last log line is never cut off.

## Considered

- **Our migrations install pg-boss's tables with its own install SQL** (`getConstructionPlans`), and the worker runs pg-boss with its migrations off and table rights only. Rejected: pg-boss also makes tables while it runs (daily statistics partitions, per-queue tables), which table rights do not allow, and every pg-boss upgrade would need its SQL copied into a migration of ours by hand.
- **The worker's login creates the schema itself** (rights to create in the database). Rejected: more power than it needs, and on a hosted database the same right lets it create any schema.
- **The worker logs in as the migration login.** Rejected: that login owns the app's tables, which T-60 exists to keep out of the running app.
- **The worker in local work opens `DATABASE_URL` as staging does.** Rejected: nobody has a local PostgreSQL, the web app in local work never opens one either, and an address is one step from a real database (T-201). The cost: in local work the web app and the worker do not share jobs; each runs on its own made-up data.

## Not done, and open

- **The migration is not written in this step** (another lane holds the next number); it is step 2.112, which step 2.95 waits for. It is: make `queue_owner` if missing, with `nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls`; `create schema if not exists pgboss authorization queue_owner`; `revoke all on schema pgboss from public`. Granting `queue_owner` and `app_user` to the worker's login is a step of setting up a hosted database, done by hand with the login's password, which never goes in a file (to be written in the hosting procedures, step 2.95). Until both are done, the worker refuses to start in staging and production, with the reason.
- **The jobs waiting and the age of the oldest (T-142)** are not in the health answer. Counting them across leagues needs an owner-run function like `take_jobs`, returning counts only: a migration, for a later step. The alert itself (T-159) needs the outside checker.
- **Reaching the health check from outside.** T1 (T-9) runs the worker as Render's "background worker" type, which, as far as we know, takes no requests from outside; an outside uptime check (T8 §7) would then need the worker run as a web service on `WORKER_HEALTH_PORT`, or a check from inside. For step 2.95 to settle; not verified.
- **The web app does not yet check that its own login is not a member of `queue_owner`.** Step 2.112 adds it with the migration.
- **Not verified:** anything on a hosted PostgreSQL; that Supabase's migration login may create a role and give it a schema; pg-boss's own migrations running as a member of `queue_owner` rather than the schema's owner (PostgreSQL makes the tables owned by the login, which is allowed here); signals on Windows, where a stop ends the program at once; the SSL setting for a hosted database (the worker uses the default, verify against the system's authorities, as the web app does: step 2.95).

## Revisit if

- pg-boss's own migrations need more than the right to make tables in its schema.
- Several workers start at once on a new pg-boss version (pg-boss locks its migrations; not tested here).
- The worker gets a login role of its own for `take_jobs` (record 012's later hardening): `queue_owner` is the natural place for it.
