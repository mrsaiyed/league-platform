# Build status

The one file that says where the build is. Every run reads it first and updates it after every step. How a run works: [RUNBOOK.md](RUNBOOK.md).

## Now

- **State:** `building`
- **Stage:** 1, foundations — [plan](STAGE-1.md)
- **Branch:** `build/stage-1`
- **Gate:** `npm run verify`
- **Next step:** 1.9 The two-league test harness
- **Pushing to GitHub:** not allowed. The founder has not said yes.

States: `building` (take the next step) · `waiting-for-founder` (nothing can be done until the list below is answered) · `stage-review` (the stage is finished and waiting for the founder's check).

## Needs the founder

Nothing blocks the next steps. These are wanted before stage 1 can be called done:

- [ ] Turn on two-step sign-in for GitHub and the email account it recovers to (T-83).
- [ ] Say whether build branches may be pushed to GitHub, so the work is backed up off this computer and the automatic checks run there.
- [ ] Vendor accounts (Supabase, Render, Cloudflare, Resend, a domain) — not needed until the stage report asks for them.
- [ ] Nothing to do now, but not yet checked: the league fence (step 1.7) assumes that the database user Supabase runs our migrations as is allowed to see past the fence, as it is on this computer. If it is not, some checks that must look at every league (is this short name free, does every league have its main program) will refuse to run rather than give a wrong answer, so nothing leaks, but leagues could not be created. One check settles it once a Supabase account exists; it goes on the stage report's checklist (record 008).

## Log

Newest first. One line per step or event.

- 2026-11-13 — Step 1.8 done: Kysely 0.29.7 typed queries in packages/database/src/db (hidden handle, PGlite + pg dialects, generated schema-types with drift test, withTransaction with transaction-local league/account, guarded driver refusing stray queries after commit, checkLoginRole) and src/queries examples; record 009 / T-222. Reviewer's 7 findings fixed. Open: pg path only run against PGlite, not a hosted database; checkLoginRole must be called at startup in step 1.17; no streaming/savepoints.
- 2026-11-13 — Step 1.7 done: migration 0005 row-level security (restricted `app_user`, one forced policy per table, league and account fences). Reviewer's findings fixed: strict one-policy gate with planted-violation tests, WITH CHECK proven, decision record 008 / T-221 written, role-exists safe, encoding. Step 1.8 must set the league one-transaction-only.
- 2026-11-12 — Step 1.6 done: migrations 0002-0004 (uuid_v7, version/updated_at trigger, 13 tables, cross-league composite keys, slug/default-program/current-season rules, append-only history, support-visit rules) with 58+ constraint tests in packages/database/src/schema; record 007 (history erasure and purge, T-220). Reviewer findings fixed except: TRUNCATE not blockable (1.7 must not grant it to the app role; the app role must not own tables), caller-settable created_at, no test on PostgreSQL 15-17 (PGlite is 18.6), slug history expiry has no upper cap, activity_log.target_id has no foreign key, seasons.logo waits for assets.
- 2026-11-12 — Step 1.5 done: migration runner in packages/database/src/migrations (PGlite + pg adapter, checksums, advisory lock, one transaction per file) and the T-183 check in the gate; record: architecture/decisions/006. Reviewer's 14 findings fixed. Open: DROP POLICY/DEFAULT still allowed; no release command yet (needs config wiring); pg adapter not run against a hosted database; one unexplained one-off node test failure during a verify run (passed in 3 reruns), watch for flakiness. Also fixed a flaky varsity-database test (jsonb key order).
- 2026-11-12 — Step 1.4 done: apps/web/src/server/config-schema.ts (Zod, names every missing/invalid setting, never prints values) and config.ts (the only process.env read, enforced by the T-30 check via settingsReaderFiles), `.env.example` with made-up values and a test tying it to the schema. Reviewer's findings fixed except: startup wiring (assertConfig has no caller until the web app has an entry point, step 1.17); no production-vs-localhost cross-check (optional); `secret` flag only used in tests for now.
- 2026-11-12 — Step 1.3 done: six structure checks in scripts/structure/ (T-21, T-22, T-27, SQL location, T-34, T-30), run by `npm run check`, with planted-violation tests. Reviewer's 15 findings fixed (except two minor lexer/env-alias cases). Open: 1.4 may add a rule that the environment is read only in the config module; the built-bundle secret check (T-30) waits for a web build; the 4 legacy files in config.legacyFiles are a shrinking list; new `@srleagues/contracts|sports|database` imports need an index.ts first.
- 2026-11-12 — Step 1.2 done: shared tsconfig.base.json, Vitest 3.2.7 for new workspaces (`npm run test:units`, in the gate). Reviewer notes: packages/core `add` is a throwaway sample to remove when real code lands; Vitest globs skip packages/database/contracts/sports, so decide the runner for database tests at step 1.5. Overlapping typecheck was tidied.
- 2026-11-12 — Step 1.1 done: npm workspaces for all 11 packages/apps. Reviewer found: existing contracts/database/sports have no root index.ts (their code is under src/), so they declare no entry point yet; giving them one is left to when core first imports them. Per-package tsconfigs and declared package dependencies come with 1.2/1.3.

- 2026-11-12 — Build set up: runbook, stage 1 plan, this file, `CLAUDE.md`. Specification v1 committed on the build branch. No code written yet.
