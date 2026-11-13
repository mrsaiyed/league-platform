# 014 — Roles, invitations and the activity log

Date: 2026-11-13. Step 1.12; decides T-226 and narrows T-221 (record 008); carries out A-3, O-7, A-6, T-74, T-75. Decided by the lead (technical).

## What

- **Where:** `packages/core/src/modules/access/` (roles, permissions, scopes, the permission check, invitations, grants, the activity log), with its queries and stores in `packages/database` (`src/queries`, `src/stores/access-store.ts`, `src/stores/activity-log-store.ts`). No table changed: the tables are those of 0004.
- **Roles are data.** `roles.ts` names every permission (T4 §4) and which role holds which, from P4 §4. The owner is `leagues.owner_account_id`, not a grant, and holds everything; an admin holds everything but `league.payout`, `league.transfer_ownership` and `league.delete` (O-7). Every module's policy calls the one check, `hasPermission(context, tx, permission, scope)`, which reads the owner and the account's grants inside the command's own transaction on every call, so removed access is gone on the next command (T-75). The leagues module's settings commands now need `league.settings` instead of "is the owner".
- **Scope.** A grant is for the whole league or one program (clubs and teams once their tables exist). A league grant reaches everything; a program grant only its program. Managing access is itself scoped: a program's admin may invite to, and remove, that program's roles only.
- **Invitation links (T-226).** The link carries 32 random bytes (43 URL-safe characters). Only its SHA-256 is stored. The plain token goes into the job that emails the link (`access.send_invitation`, ids `invitationId` and `token`, sent by step 1.19), recorded in the same transaction: a credential the email needs, not content, so it is the one thing a job carries beyond ids (T-131). The link works for 14 days from sending. Re-sending makes a new token and a new 14 days, and the old link stops working. The link is the proof: any signed-in account that holds it may accept it, once, while it is pending; someone who already has that role keeps the grant they have.
- **Accepting needs no owner-run function.** The link is a league address (built by the address helper, T-34), so the app finds the league first (`find_league_by_slug`) and accepts inside that league's normal fence. A token from another league's link is simply not found. This takes "accepting an invitation" out of T-221's list; record 008 said it would need one.
- **Expiry is the database's clock.** Queries work out pending, expired, accepted or cancelled with `now()`, and accepting checks `expires_at > now()` in the same update, so no caller's clock decides and two people using one link at once cannot both get in.
- **The activity log (A-6).** Every command that changes a league's settings or who has access writes one entry in its own transaction: the actor, the command's name as `action`, the target, and `details` holding ids and fixed words only (history keeps no copies of personal details, 0004). `summary` holds a message key, `activity.<command name>`, which the page turns into words from the message files (T-187), so the log can be shown in any language later.
- **Reads for a screen use the command shape.** `access.list_access`, `access.list_activity` and `access.my_access` live in the module's `queries/` folder but are made with `defineCommand`, so each has the same permission check, transaction, log line and isolation case. They write nothing.
- **Tests.** The two-league harness has a case for every new query and command. `packages/database/src/stores/role-matrix.test.ts` runs every role against every command in the registry on the real database, with who may do what written out from the spec; a command with no row fails it (T4 §12).

## Considered

- **An owner-run function for accepting** (record 008's plan): needed only if the league were unknown, and it is not. A function that can see every league's invitations is a wider door than the fence we already have.
- **Making the send job issue a fresh token when it runs**, so no token sits in the job: it would need a command only the worker may run, and the command context cannot yet tell the worker from a visitor (both have no account). Revisit with the worker (1.19).
- **Accepting only from an account with the invited email:** safer against a forwarded link, but P4 §4 says the person signs in or creates an account and is in, and people often sign in with a different address. The link is single-use, expires, and can be replaced.
- **A separate read shape for queries:** nothing it would add yet; the command shape already gives the check and the log.

## Revisit if

- Step 1.19 keeps finished jobs: the token in a sent job's ids should be removed once the email is sent, or jobs kept unreadable to the app.
- The worker gets a context of its own: then the job can issue the token at send time and no job need hold one.
- The names on an access list are needed (the admin shell, 1.17): that still needs its owner-run function (record 008), which needs a migration number.
- An association asks for build-your-own roles (A-3).
