# Build status

The one file that says where the build is. Every run reads it first and updates it after every step. How a run works: [RUNBOOK.md](RUNBOOK.md).

## Now

- **State:** `building`
- **Stage:** 1, foundations — [plan](STAGE-1.md)
- **Branch:** `build/stage-1`
- **Gate:** `npm run verify`
- **Next step:** 1.1 Workspaces
- **Pushing to GitHub:** not allowed. The founder has not said yes.

States: `building` (take the next step) · `waiting-for-founder` (nothing can be done until the list below is answered) · `stage-review` (the stage is finished and waiting for the founder's check).

## Needs the founder

Nothing blocks the next steps. These are wanted before stage 1 can be called done:

- [ ] Turn on two-step sign-in for GitHub and the email account it recovers to (T-83).
- [ ] Say whether build branches may be pushed to GitHub, so the work is backed up off this computer and the automatic checks run there.
- [ ] Vendor accounts (Supabase, Render, Cloudflare, Resend, a domain) — not needed until the stage report asks for them.

## Log

Newest first. One line per step or event.

- 2026-11-12 — Build set up: runbook, stage 1 plan, this file, `CLAUDE.md`. Specification v1 committed on the build branch. No code written yet.
