# Stage 1 plan — foundations

The goal and exit test are in the [build order](../specs/v1/technical/T10-build-order.md), stage 1. This file breaks the stage into steps small enough for one run to finish several. Do them in order unless a step's "needs" says otherwise. How to do a step is in the [runbook](RUNBOOK.md).

## What this machine can and cannot do

- **Node 24 and git are here. Docker, the Supabase command-line tool and the GitHub command-line tool are not.** Do not try to install them.
- **The local database is PGlite**, real PostgreSQL running inside Node, already a dependency of this repository. Migrations, row-level security and every database test run against it. The same SQL must also run on Supabase's PostgreSQL later, so use nothing PGlite-only.
- **There are no vendor accounts yet.** Supabase, Render, Cloudflare, Resend and Google sign-in each sit behind an interface in `packages/providers` with a local stand-in. The real adapter is written and unit-tested against recorded responses, and marked "not verified against the live service" until the founder supplies an account. That list goes into the stage report.

## Steps

Each step is done when its done test passes, the gate passes, the independent review is closed, and it is committed.

### A. Skeleton

- [ ] **1.1 Workspaces.** Turn the repository into npm workspaces as in T2 section 1: `apps/web`, `apps/worker`, `packages/core`, `site`, `ui`, `emails`, `providers`, `observability`, beside the existing `contracts`, `database`, `sports`. Empty packages with a `package.json`, `tsconfig.json` and an `index.ts`. The existing apps and every existing script keep working unchanged. _Spec: T2 §1–2, T-20. Done test: `npm run verify` passes; `npm ls --workspaces` lists them. Model: sonnet._
- [ ] **1.2 Strict TypeScript and the test runner.** One shared strict config (T-32). Add Vitest for the new packages; the existing `node --test` suites stay as they are. `npm run verify` runs both. _Spec: T1 §1, T9 §2. Done test: a sample test in `packages/core` runs in the gate. Model: sonnet._
- [ ] **1.3 Structure checks.** Automatic checks for: import directions (T-21), modules used only through `index.ts` (T-22), no league named in code (T-27), no SQL outside `packages/database`, no hand-written league addresses (T-34), no secrets in browser code (T-30). Each check has a test that proves it catches a planted violation. _Spec: T2 §2 and §6, T9 §3. Done test: planting each violation fails the gate. Model: opus._
- [x] **1.4 Settings and secrets in one place.** A config module read once at startup, checked against a Zod schema; the app refuses to start if a value is missing. `.env.example` lists every value with made-up contents. _Spec: T-30. Model: sonnet._

### B. The database and the league fence

- [x] **1.5 Migration runner.** Numbered SQL files in `supabase/migrations/`; a runner that applies them to PGlite for local work and tests, and can apply them to any PostgreSQL address later. A check rejects a migration that drops or renames in one step (T-183). _Spec: T3 §13, T-48, T-49. Model: opus._
- [x] **1.6 First tables.** `accounts`, `profiles`, `profile_access`, `leagues`, `league_slug_history`, `league_features`, `programs`, `seasons`, `role_grants`, `invitations`, `activity_log`, `support_access_log`, `command_receipts`, with the conventions of T-40 to T-47: `league_id` on every league table and in every link, UUID version 7 keys, UTC times, `deleted_at`, `version`. One default program per league. _Spec: T3 §1–5, §12. Done test: constraint tests for each rule in T3 §12 that applies to these tables. Model: opus._
- [ ] **1.7 Row-level security.** A restricted database role for the app (T-60). Policies on every league table keyed to the league set at the start of each transaction (T-61); account-keyed policies for personal tables (T-62). _Spec: T4 §2. Done test: as the restricted role, a query with no league set returns nothing; with league A set, league B's rows are invisible and cannot be written. Model: opus, high._
- [ ] **1.8 Typed queries.** Kysely over the schema, types generated from the migrations. Every function that touches league data requires a league ID (T-28). A transaction helper that sets league and account, used by everything. _Spec: T1 §1, T2 §6, T-61. Model: opus._
- [ ] **1.9 The two-league test harness.** A harness that creates two leagues and, for every registered command and query, tries league A's access against league B's records; any success fails the gate. New commands are picked up automatically from the registry. _Spec: T-65. Done test: a deliberately leaky command planted in a test is caught. Model: opus, high._

### C. Rules of the product

- [ ] **1.10 The command shape.** `command(context, input, deps) → result | error` with typed results, typed expected errors, permission check, one transaction, follow-up jobs recorded in the same transaction, and the log line of T-196. Events (T-24). The command registry the harness reads. _Spec: T2 §3, T-23 to T-26, T-74, T-196. Model: opus._
- [ ] **1.11 Leagues.** Module `leagues`: create a league (internal tool only for now), short-name rules and the blocked list (U-7), rename with forwarding, states draft, live, archived, suspended (U-9), the hidden default program (U-3, U-12), season records. _Spec: P2 §5–6, T3 §4. Model: sonnet._
- [ ] **1.12 Access.** Module `access`: the fixed roles and their permissions (A-3, O-7), role grants with scope, invitations (create, accept, re-send, cancel, expire), removing access takes effect at once (T-75), the activity log (A-6). A test of every role against every command (T4 §12). _Spec: P4 §4, T4 §4, T3 §5. Model: opus._

### D. Sign-in

- [ ] **1.13 The sign-in interface and local stand-in.** An interface in `packages/providers` for: start sign-up with an emailed code, set a password, sign in, sign out, sign out everywhere, list sessions, reset by code. A local stand-in for development and tests only, clearly marked as not for production. _Spec: T-6, T-14, T-67 to T-71, T-85. Model: opus, high._
- [ ] **1.14 Sign-in flows in the web app.** Sign up (email, code, password), sign in, forgotten password, Google button behind the interface, the session cookie (T-69), no time limit (T-70), the password again for sensitive actions, the new-device email, the device list with "sign out everywhere" (T-71), identical behavior whether or not an account exists (T-68), attempt limits (T-85). _Spec: P6 §2 and §5, T4 §3. Needs: 1.17, 1.19. Model: opus, high._
- [ ] **1.15 The Supabase adapter.** The real adapter for the same interface, unit-tested against recorded responses. Marked not verified against the live service. _Spec: T-5, T-6. Model: opus._

### E. The web app and the worker

- [ ] **1.16 Address builder and request context.** One function that builds every league address, and `server/context.ts` as the only place a request becomes "who, which league" (T-34, T4 §2 fence 1). _Model: opus._
- [ ] **1.17 Web app shell.** Next.js app in `apps/web` with the folders of T2 §4: our own pages, `[league]` public shell, `[league]/admin` shell with its navigation and empty areas, the tracker route as a placeholder. Typing an admin address without access shows "you do not have access" (U-6). Unpublished leagues are visible only to their admins. _Spec: T2 §4, P2 §4, P4 §3. Model: sonnet._
- [ ] **1.18 Design values and message files.** A league's design document turned into CSS variables once per page (T-90); header, menu, footer with the "Powered by SR Leagues" mark (U-8); two visibly different starting designs. All interface text from message files (T-187). Right-to-left text renders correctly (T-188). _Spec: T5 §1, P5 §2. Model: sonnet._
- [ ] **1.19 The worker and the queue.** A queue interface with jobs recorded in the same transaction as their cause (T-130), carrying identifiers only (T-131), safe to run twice (T-137). The pg-boss adapter for real PostgreSQL. If pg-boss cannot run against PGlite, write the decision record and use a small table-backed stand-in for local work and tests behind the same interface. An email interface with a capture adapter, so no email leaves the machine (T-140), and the Resend adapter unverified. One real job: the invitation email. _Spec: T7 §1 and §5–6, T-7, T-11. Model: opus._
- [ ] **1.20 Logging and errors.** Structured logs with a request ID (T-196), no personal content (T-86), an error-reporting interface with a local adapter and the Sentry adapter unverified. A health check for web and worker. _Spec: T8 §7, T4 §10. Model: sonnet._

### F. Proving it

- [ ] **1.21 Seed leagues.** Two made-up leagues with different designs, admins and members, loaded by one command. No real people. _Spec: T-195. Model: haiku._
- [ ] **1.22 Browser tests for the exit test.** In a real browser: two leagues at two addresses with different looks; a person signs in, closes the browser, returns and is still signed in; an admin of the first is refused everywhere in the second; an invitation email is captured and its link works. Accessibility checks on each screen (T-186). _Spec: T10 stage 1, T9 §2. Model: sonnet._
- [ ] **1.23 CI.** The GitHub workflow runs the new gate. Nothing is pushed by a run; this only edits the file. _Model: haiku._
- [ ] **1.24 Records.** A decision record for each choice in T1 that stage 1 used, and for every decision made along the way. `docs/operations/` gets "run it locally" and "apply migrations". _Spec: T9 §5. Model: haiku to draft, lead to check._
- [ ] **1.25 Whole-stage review and report.** As in the runbook, section 7. The report's founder checklist includes at least: turn on two-step sign-in for the business accounts (T-83); create the Supabase, Render, Cloudflare and Resend accounts and a domain; set up the shared password vault (T-166); then one supervised session to connect staging, switch on continuous backup, ship a release and reverse it. _Model: opus, xhigh._

## What stage 1 cannot finish without the founder

Staging and production, the release and reverse-release rehearsal, continuous backup, uptime checks, real Google sign-in and real email all need vendor accounts. Everything up to them is built and tested locally in this stage. They become the founder's checklist in the stage report, and stage 1 is called done only after that supervised session.
