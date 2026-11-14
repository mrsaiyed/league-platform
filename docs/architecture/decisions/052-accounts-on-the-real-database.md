# 052 — Accounts on the real database: the sign-in link, the sign-in store and the account functions

Date: 2026-11-14. Step 2.92, migration 0012; carries out T-221 and T-230 and finding R9; decides T-256. Serves T-41, T-52, T-62, T-68, T-73, T-220; records 007, 008, 013 and 018. Decided by the builder of step 2.92 for the lead (technical), to be confirmed when the step lands.

**Not verified against a real PostgreSQL server or Supabase.** Everything below is tested on PGlite only (T-201). PGlite has one connection, so the parts that keep two requests at once apart (row locks, advisory locks) are shown to hold one after the other, not truly at once.

## Problem

The web app cannot run on a real database (finding R1). Record 008 gave the account work to owner-run functions "with steps 1.12 to 1.14", and record 018 needed a production store for the Supabase adapter; neither was built. Three questions had to be answered first:

1. **How a sign-in service's user becomes one of our accounts.** Supabase names a person by its own user id, a version 4 UUID it makes. Our ids are version 7 UUIDs we make (T-41), and an account may exist before its owner ever signs in (a league owner set up by hand, P3 §8; the seeded people). The sign-in service's `accountId` is today used as our account id directly, which only works with the stand-in.
2. **Where the adapter's store lives and who may reach it.** It holds sessions, counts and, for up to 15 minutes, the tokens of a live Supabase session. Its rows belong to no league and, before sign-in, to no known account, so neither fence of 0005 fits them, and the table conventions (version 7 `id`, `version`, `league_id`) do not either.
3. **What `app_user` may change on its own account** (R9): 0005 let it change every column, the email included, where T-73 wants an email change confirmed from the new address first.

## What

- **T-256: our account ids stay ours; the sign-in service's id is a link beside them.** `accounts.sign_in_id` (text, unique, empty until someone first signs in, emptied on erasure) holds the service's user id. Only owner-run functions write it; `app_user` cannot. Text rather than a UUID, so another sign-in vendor's ids fit too (T-6).
  - **Every signed-in request** turns the service's id into our account id with `public.account_of_sign_in(id)` (`findAccountOfSignIn`): one id at a time, the account id or nothing. It takes no email, so it cannot be asked whether an address has an account.
  - **Once the service has proved the mailbox** (a right code, Google, or a right password), the app calls `public.account_for_sign_in(id, email)` (`accountForSignIn`). It returns the account already linked to that user; else the account with that address, which it links (case-insensitively); else a new account it makes. It returns the id only and never says which of the three it was (T-68: "find an account by email for sign-in without saying whether it exists"). Two first sign-ins at once for one address are taken one after the other (an advisory lock on the address), so they make one account. An address whose account is already linked to a different user is refused, not moved: that happens only if the service made the person again, and is put right by hand. An address on `.invalid` (where erased accounts' placeholders live, record 007) is refused.
  - **The service's `accountId` is therefore the sign-in user id, not our account id.** The adapter and its store keep using it as they do; the web app maps it (step 2.93). With the stand-in it maps the same way. The name `accountId` in `packages/providers` is kept for now; renaming it is a follow-up for 2.93.
- **The sign-in store is in a schema of its own, reached by a role of its own.** Schema `sign_in` (0012) holds `users` (finished signing up, has a password), `devices`, `sessions`, `refresh_tokens`, `codes`, `proofs`, `code_requests`, `guesses` and `guess_locks`. The role `sign_in_store` (no login, no powers, member of nothing, put right if it exists, as `app_user` is in 0005) has usage on `sign_in` and the grants its methods need there, and nothing in `public`. `app_user` has no usage on `sign_in`. So a mistake in league code cannot reach a session, a count or a proof's tokens, and a mistake in the store cannot reach a league. Every `sign_in` table has row-level security forced with one policy, `TO sign_in_store USING (true) WITH CHECK (true)`, so a grant given there by mistake to any other role still shows nothing. The gate in `app-role.test.ts` checks all of this, and that Supabase's API roles get nothing there (T-64).
  - **`withSignInTransaction`** (`packages/database/src/db/sign-in-transaction.ts`) opens each store transaction and switches it to `sign_in_store`, with the same guards as `withTransaction` (no nesting, no second connection, a scope that dies with its transaction). The schema types include `sign_in` as `SignInDatabase`, so the store's queries are typed.
  - **`createDatabaseSignInStore({ db, now })`** (`packages/database/src/sign-in/`) is the production store. Each method is one such transaction, one query per file, so each is the one atomic step record 013 relies on: renewing tokens are marked used in one update; a proof is taken after its address is held (advisory lock), so of two takers one gets it; counts are checked and counted after the address and the network are held, always network first, so two waits cannot cross. Times come from `now`, as in the in-memory store. Its test runs the in-memory store's cases unchanged on PGlite, plus a restart (a new store on the same database sees everything), the guess limits, the sessions and the role it runs as.
  - **The store's shape is written twice.** `packages/database` may not import `packages/providers` (T-21) and providers may not write SQL, so `DatabaseSignInStore` repeats `SupabaseSignInStore`. The web app passes one where the other is asked for (2.93), and TypeScript checks there that they still fit. Both test files say to change the cases together.
  - **Guess counts are not kept apart by their numbers,** as the in-memory limiter is (one limiter per set of numbers): the adapter uses one set per scope.
  - **The app's login must be a member of `sign_in_store`** as well as of `app_user`. That grant is made by hand where the login is made (it is a secret's role, outside migrations): on staging, `grant sign_in_store to app_login;` by the migration role. Until then the store's first transaction fails with "permission denied to set role".
- **R9: `app_user` may change only `display_name`, `phone` and `last_seen_at`** on its own account (column grants; the table-wide UPDATE is revoked). The email, the sign-in link and `version` cannot be set by the app. An email change waits for T-73's confirmed change, which is not built; it will be an owner-run function of its own.
- **The other account functions of record 008**, each `SECURITY DEFINER` with `search_path = pg_catalog, pg_temp` and every name written in full, `EXECUTE` to `app_user` only, in the reviewed list:
  - **`create_own_profile(first, last, birth date)`** (`createOwnProfile`): the own profile of the account set for the transaction, once (a second answers "already has one" and changes nothing). The account is made at sign-up with no profile, because the sign-up screens ask only for an address; see "Questions for the founder".
  - **`erase_account()`** (`eraseAccount`): erases the account set for the transaction, at its own request (T-52, T-220). Its row stays, emptied in place (the email becomes `{id}@erased.invalid`; name, phone, last seen and the sign-in link emptied), so history keeps valid links. Its own profile and each child profile no other account reaches are removed; one another guardian still reaches stays with that guardian. Its grants in every league end now (revoked by itself). Its rows in the sign-in store go. It answers `owns-a-league` and changes nothing while the account owns a league, and `profile-in-a-league` while one of those profiles is still linked to a league's person: each league treats its person first, inside its own fence (T-52, T-63). Asking for the password again (T-70) and deleting the user at the sign-in service are the caller's.
  - **`access_list_names()`** (`listAccessNames`): the display name of each account holding a grant in force in the league set for the transaction, and of its owner, and nothing else; nothing with no league set. Who may read it is `access.manage`, checked by the access module before. It is in the two-league harness.
  - The functions that must see every account or league to be right (`account_for_sign_in`, `erase_account`) call `require_view_of_every_league()` first; the others, fenced, find nothing, which is safe.

## Considered

- **Our account id is the Supabase user id.** No mapping at all, but our ids would be the vendor's (T-6), version 4 (T-41), and an account made before its owner first signs in could never be linked: its id is already in every table that points at it.
- **A table of links** (several sign-in ids per account). Supabase links Google and a password under one user with the same address, so one id per account is enough; a table can come with a second vendor.
- **The store as owner-run functions in `public`.** It needs about 27 operations: record 008 says to revisit once the list passes a dozen, and each would see past every fence.
- **The store's tables in `public`.** They would break the table conventions (version 7 `id`, `version`, `league_id`) and the one-fence rule, and `app_user` would at least see their names.
- **Giving `app_user` the store's tables.** Then any league query's mistake reaches live Supabase tokens.

## Not done here, and where it goes

- **Wiring:** the web app's database ports, the per-request mapping, `account_for_sign_in` after a sign-in, and passing this store to the adapter are step 2.93. Checking at startup that the login is a member of `sign_in_store` belongs there too (`checkLoginRole` does not check it yet).
- **Ending the Supabase sessions of proofs that run out or are dropped** (record 018). This store forgets them with their tokens, as the in-memory one does; a sweep would need the tokens kept in a queue the worker drains, which keeps live tokens longer if nothing drains it. It comes with a worker job and an adapter call.
- **Matching the Supabase users that exist when the store starts** (record 018): a one-time import, run by the lead, before the adapter is switched on.
- **Removing ended sessions and used renewing tokens after a while**: a retention job (T-86).
- **The adapter's own tests against this store** (record 018's "revisit if"): providers cannot import the database; a test in the web app can, with 2.93.
- **Names on the Admins page:** `list-access.ts` in core still says the names are not built; 2.97 shows them.

## Questions for the founder (product, not decided here)

1. **When is a person asked their name?** Sign-up asks only for an address and a password, but an account's own profile needs a first and last name. Built so either works: the account is made at sign-up, and its profile when the name is first given. Options: ask right after the password, or at the first registration.
2. **Erasing an account that owns a league:** refused until the league is handed over. Should the owner be offered a hand-over, or should the league go to the bin?
3. **A child's profile when the parent's account is erased:** removed if no other guardian reaches it, kept with the other guardian if one does. And a person's own profile that a parent also manages: kept with the parent. Is that right?
4. **A name on the Admins page for an account that has none yet** (it signed up but gave no name): the function returns no name; the page could show "no name yet" or the address it was invited at.

## Revisit if

- A second sign-in vendor is added, or Supabase stops linking Google and password users by address: a table of links.
- The tests run against a real PostgreSQL server and the locks do not hold as on PGlite.
- The store needs to be reached by the worker (the sweep above): it acts as `sign_in_store` too, through the same transaction.
