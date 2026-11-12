# 006 — Migration runner and the one-step-drop check

Date: 2026-11-12. Carries out T-48, T-49, T-183 (step 1.5). Decided by the lead (technical).

## What

- Numbered files `NNNN_name.sql` in `supabase/migrations/`, no gaps. Runner in `packages/database/src/migrations/`: PGlite for local work and tests, a `pg` adapter for any Postgres address (direct connection, not a transaction-mode pooler).
- Each file runs with its log row in one transaction; checksums (line endings normalised) are recorded in `migration_log.applied`; an edited or missing applied file stops the run; one run at a time via an advisory lock with a bounded wait; lock and statement timeouts per transaction.
- Transaction-control statements inside a file are rejected. A database that is ahead of the folder (after a reversed release) is allowed.
- The T-183 check in `npm run check` always rejects drops and renames (except index, policy, trigger, constraint and default/not-null on a column), TRUNCATE, and EXECUTE/format(. The only way past is an entry in `migrationDropsAllowed` tied to the file's checksum, with a reason.

## Considered

A marker comment to allow a drop: rejected, too easy to paste in. A full SQL parser: heavier than needed for now.

## Revisit if

The regexp check is bypassed in practice, or we want DROP POLICY/DEFAULT treated as breaking too.
