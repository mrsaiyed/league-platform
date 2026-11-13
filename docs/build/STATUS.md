# Build status

The one file that says where the build is. Every run reads it first and updates it after every step. How a run works: [RUNBOOK.md](RUNBOOK.md).

## Now

- **State:** `building`
- **Stage:** 1, foundations — [plan](STAGE-1.md). Stage 2 — [plan](STAGE-2.md) — fills spare lanes.
- **Branch:** `build/stage-1`
- **Gate:** `npm run verify`
- **Next step:** 1.26 Catch up with main, and at the same time every other step that can be opened ("Side by side" in the stage plan).
- **Lanes:** up to 6 at once (runbook, section 3). The founder confirmed on 2026-11-12 that many builders at once is what they want. Lower the number if this computer struggles with that many.
- **Merging to `main`:** not by a run, ever. The founder left this to the lead (2026-11-12). The lead's rule: a finished, checked stage is moved onto `main` by the lead in a session where someone is watching, when GitHub's checks are green on that exact commit and no Al-Hadi game is under way, because every push to `main` republishes the live tracker site. Nothing needs `main` before then: the build branch is on GitHub and checked there.
- **Pushing to GitHub:** allowed, for the build branch only (`git push origin build/stage-1`). The founder said yes on 2026-11-12 and confirmed that the repository being public is fine. Never push or merge to `main`: every push to `main` republishes the live Al-Hadi tracker site at `mrsaiyed.github.io/league-platform/`, which is in use for real games.

States: `building` (keep the lanes full) · `waiting-for-founder` (no step in any plan can be opened until the list below is answered). The end of a stage does not stop the build (runbook, section 9).

## In progress

One line per open lane, written before its builder starts: `- **<step>** — <lane folder> — reserved numbers — what is left`. A run that is cut off leaves this as the map for the next run.

Reserved so far: migration 0006 and decision record 012 / T-224 to 1.19 part 1; decision record 013 / T-225 to 1.13; decision record 014 / T-226 to 1.12; decision record 015 / T-227 to 1.18 part 1; decision record 016 / T-228 to 1.20 part 1. Next free: migration 0007, record 017, T-229. Check the folders before trusting these.

- **1.12 Access** — `.local/lanes/1.12-access` — record 014 / T-226 — whole step.
- **1.13 Sign-in interface and stand-in** — `.local/lanes/1.13-signin-interface` — record 013 / T-225 — whole step.
- **1.19 part 1** — `.local/lanes/1.19p1-queue-email` — migration 0006, record 012 / T-224 — queue and email interfaces, stand-ins, adapters, jobs table.
- **2.5 Season rules document** — `.local/lanes/2.5-season-rules` — none — whole step.
- **2.7 Standings and tiebreakers** — `.local/lanes/2.7-standings` — none — whole step.
- **2.8 Statistics totals and leaders** — `.local/lanes/2.8-stats` — none — whole step.

## Needs the founder

Nothing blocks the next steps. These are wanted before stage 1 can be called done:

- [ ] Turn on two-step sign-in for GitHub and the email account it recovers to (T-83).
- [x] Pushing: allowed, and public is fine (2026-11-12). The build branch is on GitHub and each run pushes after every step.
- [ ] Seeing the new product online: GitHub Pages cannot run it, because Pages only serves fixed files and the product needs a server and a database. It can be seen on this computer once the web app shell exists (step 1.17). An address other people can open needs the Supabase and Render accounts below, with a Supabase project of its own, separate from the Al-Hadi tracker's.
- [ ] League states (U-9), built as a simple version for you to confirm: owner can publish (draft→live), archive (live→archived) and un-archive; the owner cannot take a live league back to draft; only we can suspend, and lifting a suspension puts the league back to draft so the owner must publish again (recommended: this way a lift can never publish a league by surprise). Archived and suspended leagues are read-only. Also: are "mixed" leagues unlisted by default like youth (recommended yes)? And the offensive-words part of the blocked short-name list needs your word list or a go-ahead for ours.
- [ ] Access in read-only leagues (U-9): the build refuses inviting, re-sending and accepting invitations in archived and suspended leagues, but still lets an owner or admin cancel an invitation or remove someone (removing access must always work). Recommended: keep it that way. Tell us if you want it different.
- [ ] Vendor accounts (Supabase, Render, Cloudflare, Resend, a domain) — not needed until the stage report asks for them.
- [ ] Nothing to do now, but not yet checked: the league fence (step 1.7) assumes that the database user Supabase runs our migrations as is allowed to see past the fence, as it is on this computer. If it is not, some checks that must look at every league (is this short name free, does every league have its main program) will refuse to run rather than give a wrong answer, so nothing leaks, but leagues could not be created. One check settles it once a Supabase account exists; it goes on the stage report's checklist (record 008).

## Log

Newest first. One line per step or event.

- 2026-11-13 — Step 1.26 done (real merge): origin/main (24d8bfb) is in; tracker code and tests are main's, unchanged; legacyFiles gained live.ts and setup.sql (the one recorded exception); the tracker and the web app both read DATABASE_URL (a copied .env.example would point the tracker at the web app's made-up database: rename one later); nothing contacted the real Supabase project. Under several lanes at once the database tests exceed their 30 s limit; they pass alone.
- 2026-11-13 — Step 1.18 part 1 done: design document to CSS variables (packages/site), two starting designs (midnight-gold, clean-court), English message catalog with translator and plurals, right-to-left helpers. Reviewer's findings fixed. Open: no JSON catalogs, no scan for hard-coded text (part 2), 7 font keys, fonts not hosted.
- 2026-11-13 — Step 1.20 part 1 done: logging and error reporting in packages/observability (JSON logs with request ID, redaction of personal content and secrets, error reporter, local adapters, Sentry adapter over an injected client, unverified). Reviewer's findings fixed. To do when real Sentry is wired: sendDefaultPii off, beforeSend running redact, drop breadcrumbs/request data. Open: CommandLine is a copy of core's log-line shape; free-text names under harmless keys cannot be detected; health checks are part 2. Gate: under six concurrent lanes the database tests time out at 30 s (app-role.test.ts); they pass alone.

- 2026-11-12 — Founder: no more one step at a time; as many builders as realistic, on every stage that does not have to wait; the founder is away and the build needs no permission from them. Runbook rewritten: each step is built in its own lane (a private copy of the repository under `.local/lanes`), up to 5 at once, landed one at a time by the lead; the end of a stage no longer stops the build; later stages fill spare lanes (T-212 changed, record 011). A trial lane installed in 8 seconds and ran the gate in about two and a half minutes; one timing test in the migration runner failed under load and passed alone (flaky under load: make it sturdy).

- 2026-11-13 — Step 1.11 done: league commands (create league, rename short name with forwarding, set status along the U-9 table, create season, set current season) in packages/core/src/modules/leagues, database queries/stores, isolation cases. Reviewer's finding fixed: archived and suspended leagues are now read-only for name, short name and seasons. Open: new database queries are tested through the store tests, not one test file each; blocked short-name list has system words only (offensive words wait for the founder); create/set-current season emit no events; resolving an old short name for forwarding from the app side is a later routing step.

- 2026-11-12 — Founder: pushing allowed and public is fine. Build branch pushed to GitHub at d4ccb71. The Al-Hadi tracker stays where it is, at the root of the Pages site, untouched until its season ends; the new product is not put on GitHub Pages (it cannot run there). Pushing the build branch does not republish the Pages site; only a push to `main` does.

- 2026-11-12 — Founder's instructions: work side by side where steps do not have to wait for each other (runbook section 3 "Working side by side", lanes in the stage plan); pushing the build branch allowed but held until the public repository is made private or confirmed.

- 2026-11-13 — Step 1.10 done: command shape in packages/core/src/command (defineCommand, registry, ports), example `leagues.set_name`, database adapter commandTransaction, harness runs commands (jobs scanned, refusal fails control), coverage scan over all of core; record 010 / T-223. Reviewer's 10 findings fixed. Open: jobs not in a real database transaction until 1.19; harness runs no event handlers yet (a check trips at the first); zod not declared in packages/core/package.json; PGlite only.
- 2026-11-13 — Step 1.9 done: two-league harness in packages/database/src/isolation (test helpers; runs each registered case as control, app, code-only, no-league and both-leagues, each also compared with the other league's rows deleted; snapshots all tables incl. accounts/profiles; recursive coverage scan fails on a new uncovered query). Reviewer's findings fixed. Step 1.10 must decide how command cases run (a command opening its own transaction is refused as nested), normalise new ids/times in the comparison, and add its folders to the scan. Open: not run on real PostgreSQL; A's own rows not compared; driver error detail fields not scanned; helpers ~680 lines.
- 2026-11-13 — Step 1.8 done: Kysely 0.29.7 typed queries in packages/database/src/db (hidden handle, PGlite + pg dialects, generated schema-types with drift test, withTransaction with transaction-local league/account, guarded driver refusing stray queries after commit, checkLoginRole) and src/queries examples; record 009 / T-222. Reviewer's 7 findings fixed. Open: pg path only run against PGlite, not a hosted database; checkLoginRole must be called at startup in step 1.17; no streaming/savepoints.
- 2026-11-13 — Step 1.7 done: migration 0005 row-level security (restricted `app_user`, one forced policy per table, league and account fences). Reviewer's findings fixed: strict one-policy gate with planted-violation tests, WITH CHECK proven, decision record 008 / T-221 written, role-exists safe, encoding. Step 1.8 must set the league one-transaction-only.
- 2026-11-12 — Step 1.6 done: migrations 0002-0004 (uuid_v7, version/updated_at trigger, 13 tables, cross-league composite keys, slug/default-program/current-season rules, append-only history, support-visit rules) with 58+ constraint tests in packages/database/src/schema; record 007 (history erasure and purge, T-220). Reviewer findings fixed except: TRUNCATE not blockable (1.7 must not grant it to the app role; the app role must not own tables), caller-settable created_at, no test on PostgreSQL 15-17 (PGlite is 18.6), slug history expiry has no upper cap, activity_log.target_id has no foreign key, seasons.logo waits for assets.
- 2026-11-12 — Step 1.5 done: migration runner in packages/database/src/migrations (PGlite + pg adapter, checksums, advisory lock, one transaction per file) and the T-183 check in the gate; record: architecture/decisions/006. Reviewer's 14 findings fixed. Open: DROP POLICY/DEFAULT still allowed; no release command yet (needs config wiring); pg adapter not run against a hosted database; one unexplained one-off node test failure during a verify run (passed in 3 reruns), watch for flakiness. Also fixed a flaky varsity-database test (jsonb key order).
- 2026-11-12 — Step 1.4 done: apps/web/src/server/config-schema.ts (Zod, names every missing/invalid setting, never prints values) and config.ts (the only process.env read, enforced by the T-30 check via settingsReaderFiles), `.env.example` with made-up values and a test tying it to the schema. Reviewer's findings fixed except: startup wiring (assertConfig has no caller until the web app has an entry point, step 1.17); no production-vs-localhost cross-check (optional); `secret` flag only used in tests for now.
- 2026-11-12 — Step 1.3 done: six structure checks in scripts/structure/ (T-21, T-22, T-27, SQL location, T-34, T-30), run by `npm run check`, with planted-violation tests. Reviewer's 15 findings fixed (except two minor lexer/env-alias cases). Open: 1.4 may add a rule that the environment is read only in the config module; the built-bundle secret check (T-30) waits for a web build; the 4 legacy files in config.legacyFiles are a shrinking list; new `@srleagues/contracts|sports|database` imports need an index.ts first.
- 2026-11-12 — Step 1.2 done: shared tsconfig.base.json, Vitest 3.2.7 for new workspaces (`npm run test:units`, in the gate). Reviewer notes: packages/core `add` is a throwaway sample to remove when real code lands; Vitest globs skip packages/database/contracts/sports, so decide the runner for database tests at step 1.5. Overlapping typecheck was tidied.
- 2026-11-12 — Step 1.1 done: npm workspaces for all 11 packages/apps. Reviewer found: existing contracts/database/sports have no root index.ts (their code is under src/), so they declare no entry point yet; giving them one is left to when core first imports them. Per-package tsconfigs and declared package dependencies come with 1.2/1.3.

- 2026-11-12 — Build set up: runbook, stage 1 plan, this file, `CLAUDE.md`. Specification v1 committed on the build branch. No code written yet.
