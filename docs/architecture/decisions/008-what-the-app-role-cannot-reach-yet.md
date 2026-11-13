# 008 — What the app's database role cannot reach yet, and how it will

Date: 2026-11-12. Decides T-221 (step 1.7, migration 0005); serves T-60 to T-64, T-68. Decided by the lead (technical).

## Problem

Migration 0005 puts every table behind row-level security. The app's role, `app_user`, sees only the rows of the league set for the transaction (T-61) and the personal rows of the account set for it (T-62), and owns nothing (T-60). That is the point, but a few things the product needs happen before a league or an account is known, or need to see a little past the account's own rows:

1. **Finding a league from the short name in a public address**, before any league is set.
2. **Creating an account and its own profile** at sign-up, and erasing one (T-220). `app_user` has no INSERT or DELETE on `accounts`, `profiles` or `profile_access`.
3. **Finding an account by email before anyone is signed in** (sign-in, sign-up, a forgotten password), without the screen telling a stranger whether the account exists (T-68).
4. **Accepting an invitation by its token** when the person arrives from an email link and no league is set yet.
5. **Listing the names on a league's access list.** A league's admins see its `role_grants`, but each grant points at another account, and the fence lets an account see only its own `accounts` row.

## What

- **Done in 0005:** item 1 is `public.find_league_by_slug(name)`: one name at a time, returns the league's id, current short name, status, whether it is in the bin and whether the name only forwards. It cannot list leagues.
- **Everything else goes through narrow owner-run functions, added with the step that needs them**, not by widening a table grant or a policy:
  - account and own-profile creation, and erasure: with sign-in, steps 1.13 and 1.14;
  - finding an account by email: steps 1.13 and 1.14. It answers only what the sign-in flow needs, never whether an address has an account;
  - accepting an invitation: not needed after all (record 014, T-226). The link names the league, so the app sets the league first and accepts inside its fence;
  - names on an access list: step 1.12. It returns the display names of the accounts holding grants in the league that is set, and nothing else about them.
- **The rules for every such function** (SECURITY DEFINER, so it runs as the role that owns the tables):
  - it does one job, takes only what that job needs and returns the fewest columns;
  - `set search_path = pg_catalog, pg_temp`, every name written in full;
  - it is in the reviewed list in `packages/database/src/schema/app-role.test.ts`, which fails on any owner-run function not listed;
  - `EXECUTE` is granted to `app_user` by name; nothing in `public` is open to PUBLIC;
  - if it must see every league to be right, it calls `public.require_view_of_every_league()` first, so it refuses rather than passes if its owner were ever fenced.
- A new grant to `app_user` on a personal table, instead of a function, needs this record changed first. A policy keyed to the account is not enough on its own: an account inserting a `profile_access` row for itself could name anyone's profile.

## Considered

- **Policies that let `app_user` see other accounts** (for the access list): every query on `accounts` would then reach past the account, including ones that forget to ask for less.
- **A second, more powerful app role** for sign-in and invitations: one bug in the code that uses it reaches every league. A function reaches only what it was written to return.
- **Doing it all through the sign-in vendor's own tables**: ties the fence to the vendor (T-6) and still needs a way to reach our own `accounts`.

## Revisit if

- The role that runs migrations on Supabase turns out not to bypass row-level security. 0005 assumes it does: the owner-run checks refuse to run otherwise. This is not yet checked against a live Supabase project (see `docs/build/STATUS.md`).
- The list of owner-run functions grows past about a dozen, or one needs to return rows of more than one league.
- The sign-in vendor (step 1.15) needs to write to our tables directly.
