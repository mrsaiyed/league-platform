# Build status

The one file that says where the build is. Every run reads it first and updates it after every step. How a run works: [RUNBOOK.md](RUNBOOK.md).

## Now

- **State:** `building`
- **Stage:** 1, foundations — [plan](STAGE-1.md)
- **Branch:** `build/stage-1`
- **Gate:** `npm run verify`
- **Next step:** 1.4 Settings and secrets in one place
- **Pushing to GitHub:** not allowed. The founder has not said yes.

States: `building` (take the next step) · `waiting-for-founder` (nothing can be done until the list below is answered) · `stage-review` (the stage is finished and waiting for the founder's check).

## Needs the founder

Nothing blocks the next steps. These are wanted before stage 1 can be called done:

- [ ] Turn on two-step sign-in for GitHub and the email account it recovers to (T-83).
- [ ] Say whether build branches may be pushed to GitHub, so the work is backed up off this computer and the automatic checks run there.
- [ ] Vendor accounts (Supabase, Render, Cloudflare, Resend, a domain) — not needed until the stage report asks for them.

## Log

Newest first. One line per step or event.

- 2026-11-12 — Step 1.3 done: six structure checks in scripts/structure/ (T-21, T-22, T-27, SQL location, T-34, T-30), run by `npm run check`, with planted-violation tests. Reviewer's 15 findings fixed (except two minor lexer/env-alias cases). Open: 1.4 may add a rule that the environment is read only in the config module; the built-bundle secret check (T-30) waits for a web build; the 4 legacy files in config.legacyFiles are a shrinking list; new `@srleagues/contracts|sports|database` imports need an index.ts first.
- 2026-11-12 — Step 1.2 done: shared tsconfig.base.json, Vitest 3.2.7 for new workspaces (`npm run test:units`, in the gate). Reviewer notes: packages/core `add` is a throwaway sample to remove when real code lands; Vitest globs skip packages/database/contracts/sports, so decide the runner for database tests at step 1.5. Overlapping typecheck was tidied.
- 2026-11-12 — Step 1.1 done: npm workspaces for all 11 packages/apps. Reviewer found: existing contracts/database/sports have no root index.ts (their code is under src/), so they declare no entry point yet; giving them one is left to when core first imports them. Per-package tsconfigs and declared package dependencies come with 1.2/1.3.

- 2026-11-12 — Build set up: runbook, stage 1 plan, this file, `CLAUDE.md`. Specification v1 committed on the build branch. No code written yet.
