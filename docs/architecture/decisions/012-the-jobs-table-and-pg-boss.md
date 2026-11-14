# 012 — The jobs table and pg-boss

Date: 2026-11-13. Step 1.19, part 1; carries out T-7, T-130, T-131, T-137, T-140; answers record 010's "revisit if jobs are written in the real transaction". Decided by the lead (technical). T-224.

## What

- **Every job is recorded in our own `jobs` table** (migration 0006), through `tx.jobs` in the command's transaction (`jobsStore`), in every environment. So T-130 holds by our own SQL, and the table sits behind the league fence like every other league table: a transaction records and sees only its own league's jobs.
- **Ids only, enforced by the database** (T-131), so a name, an email address or a phone number cannot be stored even by mistake:
  - `type` is one of the job types of T7 §2 (core's `jobTypes`); a new type comes with a migration that replaces `jobs_type_known`.
  - `ids` is a flat object of at most ten lower-case UUIDs under camelCase keys; a key ending in `Date`, `Day` or `On` holds a real `YYYY-MM-DD` date instead.
  - `dedupe_key`, optional, is one to ten such ids joined by `:`; it records a job once per league and type.
  - `last_error` is one of a fixed list of codes (core's `jobErrorCodes`), never an error's message (T-86).
  - The app's role may insert only what a job is (`league_id`, `type`, `ids`, `dedupe_key`, `run_after`), never its progress.
  - Core checks the same before writing (`jobProblem`), so a mistake fails in the command that made it. Tests fail when core's lists and the migration's differ.
- **The worker's one look across leagues is `take_jobs`**, an owner-run function (T-221's pattern, guarded by `require_view_of_every_league`) that leases up to 50 due jobs for at most an hour and returns their ids. It refuses any transaction with a league or an account set, which every request's and command's transaction has, and its TypeScript caller (`takeJobs`) takes a `NoLeagueScope`, which a league scope cannot satisfy. Both apps act as `app_user`, so this is a check rather than a wall: **a role of the worker's own, the only one given `take_jobs`, is the later hardening** (noted in record 008). Settling a job (done, retry later, failed, handed over) is an update in a transaction for the job's own league, through the fence, and only by the lease that holds it (T-137). A lease that runs out lets another worker take the job again, with the same id; after the last attempt it goes to the failed list.
- **Two queues behind core's `WorkQueue` port**, both in `packages/database/src/queue/`:
  - _Table queue_ (local work and tests): runs jobs straight from the table, one at a time; `runDue()` runs what is due and returns, so tests need no timers. Retries about five times over an hour (2, 5, 15, 40 minutes), then fails.
  - _pg-boss queue_ (staging and production, T-7): hands each due job over to pg-boss under the job's own id, holding it for a 60-second lease meanwhile, and pg-boss runs it (leases, retries with backoff, the failed list, several workers). A repeated handover is ignored by pg-boss (one job per id), so a crash between handing over and marking is harmless. pg-boss is given the league and ids only.
- **pg-boss runs on PGlite.** pg-boss 12.38.0 supports PGlite as a backend of its own, so the production queue is tested here on PGlite, sharing the database with the app's connection. Not verified against a hosted PostgreSQL.
- **pg-boss lives in `packages/database`, not `packages/providers`.** It is not an outside service but tables in our own database, and the structure check treats importing it as writing SQL (`databaseLibraries`). Its tables are in its own `pgboss` schema, which app_user cannot use (the gate test still holds).
- **Ports in core** (T2 §2: core states what it needs): `WorkQueue`, `JobHandler`, `QueuedJob`, the retry schedule and `afterFailure`; and the email port (`EmailSender`, `EmailMessage`, `EmailSendError`). `packages/providers` supplies the email adapters: capture (keeps the newest 1000 emails in memory and optionally writes each to a folder; one per idempotency key; **for made-up data only**, T-201, as everything outside production is) and Resend (unverified; `Idempotency-Key` header; never calls the network in tests). `emailSenderFor` gives Resend only in production; local, test and staging capture (T-140).
- **New dependency (T-191): `pg-boss` 12.38.0**, pinned, released 2026-10-13. It is the queue T-7 names. It brings `cron-parser`, `rrule-temporal`, `serialize-error` and `@opentelemetry/api` (no-op without an SDK).

## Considered

- **pg-boss alone, its job written in the command's transaction** (`send(..., { db })` through our transaction). One table fewer, but app_user would need rights in pg-boss's schema, whose tables have no league column or fence: every league's jobs readable by every request. The gate test forbids any schema but `public` to app_user. Rejected.
- **Our table alone in production too.** It already leases, retries and fails. Kept for local work only: T-7 chose pg-boss for what it adds at scale (several workers, maintenance, schedules, monitoring). Revisit if the handover turns out to be the weak point.
- **The table queue as a stand-in only because pg-boss could not run on PGlite.** It can; the table queue stays for deterministic tests and local work without pg-boss's own tables.

## Not done, and open

- Fairness between leagues and priority classes (T-138), the alert on waiting or failed jobs (T-142), timers (`reminders.plan` every 15 minutes) and clearing old jobs: later steps.
- In pg-boss mode, retries follow pg-boss's own backoff (2-minute base, doubling, at most 40 minutes, five attempts), close to but not the same as the table queue's waits.
- **Open: who creates pg-boss's schema.** pg-boss creates `pgboss` and its tables on first start, which needs a login allowed to create a schema. That conflicts with T-60 (the app's login owns nothing and creates nothing; `checkLoginRole` checks only `public` today). The likely answer is a separate worker login that owns `pgboss` and nothing in `public`, or the schema made by the role that runs migrations with pg-boss's own install SQL. Decide when the hosted database exists (T-216), before the first staging run. _Answered in [record 053](053-the-worker-starts-and-who-makes-pg-boss-tables.md) (T-257): the release makes `pgboss` for a no-login role `queue_owner`, which the worker's login is granted; pg-boss makes its own tables there._
- **Not verified:** anything on a hosted PostgreSQL. PGlite has one connection, so these tests never run two workers at once: `for update skip locked` in `take_jobs`, leases racing, pg-boss's own locking, the pooler (Supavisor) and a pool of several connections are untested. So are Resend's real answers, and the 409 and 401 handling written from its documentation.
- **Queue faults are reported** to stderr as one JSON line with the error's kind and a fixed code (`reportQueueError` in apps/worker), until the logging library (step 1.20) replaces it. _Replaced in step 2.94 (record 053): queue faults and job outcomes go through the observability logger._
- The capture "viewer" is a folder of `.json` and `.html` files; no page lists them yet.

## Revisit if

- The hosted PostgreSQL, its pooler, or pg-boss's own migrations behave differently from PGlite.
- A job needs to run sooner than the handover's poll (one second) allows.
