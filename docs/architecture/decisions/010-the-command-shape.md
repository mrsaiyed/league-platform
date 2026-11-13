# 010 — The command shape

Date: 2026-11-13. Step 1.10; carries out T-23 to T-26, T-74, T-75, T-196. Decided by the lead (technical).

## What

- **Where:** `packages/core/src/command/` (shared shape), `packages/core/src/commands.ts` (the registry), modules under `packages/core/src/modules/<name>/`. Core defines ports; `packages/database` implements them and imports `@srleagues/core`. Core never imports the database.
- **`defineCommand({name, input, allowed, run})`** gives `command(context, input: unknown, deps)` returning a typed result or a typed expected error. Names are `module.action`, the format `command_receipts` accepts.
- **Order:** input checked by Zod (before any transaction; errors keep paths and codes, never values) → one transaction → permission check inside it → run → event handlers (same transaction) → commit. An expected error rolls everything back; anything thrown rolls back and is rethrown.
- **Context** (`leagueId`, `accountId|null`, `requestId`) comes from the caller, never the input; ids are lower-cased once.
- **Jobs** are recorded through the transaction object (`tx.jobs`), so a job can only be written in the same transaction as its cause, and a job for another league is refused. Event handlers all run inside the transaction; work that can wait becomes a job.
- **Log line (T-196):** one per call, ids and a fixed error code only. A throwing log or clock can never change the outcome.
- **Harness:** each command is registered in the two-league harness; the harness gives it a transaction port that reuses the open scope. A coverage scan over all of core fails on any command without a case or not in the registry.

## Considered

- A separate `deps.jobs` port: lets a job be written outside the transaction. Rejected.
- After-commit event handlers: lose the all-or-nothing guarantee. Rejected for now.

## Revisit if

- Account-level commands (sign-up) need a context with no league (step 1.13/1.14).
- Jobs written in the real database transaction (step 1.19) show the port needs to change. Not verified until then.
- The first event handler lands: the harness must then run it (a coverage check trips).
