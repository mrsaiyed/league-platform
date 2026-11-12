# 007 — History tables, account erasure and league purge

Date: 2026-11-12. Decides T-220 (step 1.6); serves T-45, T-51, T-52. Decided by the lead (technical).

## Problem

History tables (`activity_log`, `command_receipts`, `support_access_log`) refuse every change and removal (T-45), yet they link to `leagues` and `accounts`. Deleting an account (T-52) or purging a league from the bin (T-51) would break those links, so neither could happen.

## What

- **Erasing an account overwrites its `accounts` row in place.** The row and its id stay; the email becomes a placeholder on the reserved `.invalid` domain, and the name, phone and last-seen time are emptied. History keeps the id and nothing else, so every link stays valid and points at nothing personal. The rule that follows: history rows name accounts and people by id, never by copying a name or email into `summary`, `details` or a receipt's `result`. Names are looked up when the history is shown.
- **A league purged from the bin loses its history through one sanctioned path:** `public.purge_league_history(league)` (migration 0004). It refuses unless the league has been in the bin for 30 days, sets `srleagues.history_purge` to that league's id for its own transaction, removes the three tables' rows for that league, and clears the setting. The history trigger lets a removal through only when the setting names the row's league and the role removing it owns the table. No `SECURITY DEFINER`; `EXECUTE` on the function is revoked from everyone but the owner.
- The app's role (step 1.7) owns no table and has no `TRUNCATE`, so it can neither call the purge nor fake it by setting the value itself. Removing the league's other rows and the league itself is the purge job's work (step 1.11 onwards).

## Considered

Nullable links set to empty on erasure: would mean changing history, the thing T-45 forbids. `ON DELETE CASCADE` from leagues: one mistaken delete would wipe history silently. A `SECURITY DEFINER` purge callable by the app: widens what a bug in the app can reach.

## Revisit if

The purge job needs history removed in pieces rather than per league, a history table is added without `league_id`, or the table owner turns out to be a role that day-to-day tools also use.
