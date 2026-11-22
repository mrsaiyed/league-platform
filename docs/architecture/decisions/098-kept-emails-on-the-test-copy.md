# 098 — Kept emails on the test copy

Date: 2026-11-22. Step 2.204 (T-296). Builds [record 075](075-reading-kept-emails.md)'s option 5. Serves T-140 (outside production no email leaves the building), T-201 (made-up data only), T4 §10 (no code in a log). Decided by the builder of step 2.204, to be confirmed when the step lands.

## Problem

On the test copy ("staging") every email is captured, never sent, and the capture was the web server's memory: lost at every restart and readable by nobody. So the founder could not finish signing up there: the sign-up code never reached anyone.

## What is built

- **Migration 0023.** Schema `kept_emails`, outside `public`; table `kept_emails.emails` (to, in small letters; subject; the plain words; when). Only an address on record 075's list (`kept_emails.is_made_up_address`, the same list as `isMadeUpAddress` in packages/providers, held to the same answers by two tests), checked by the table itself as well as by the function. Row-level security on with no policy; Supabase's API roles get nothing.
- **One way in:** `public.keep_email(to, subject, text)`, owner-run, granted to `app_user` only. It refuses an address that is not made up (check_violation, the address not repeated), adds the row, removes every row past the newest 300, and returns nothing. The app's login, as itself or as `app_user`, cannot read, change or remove a row, nor use the schema, nor run the check itself.
- **The writer:** `keptEmailSender` (packages/providers) hands every email to the capture as before and keeps one to a made-up address through `keepEmail` (packages/database). It refuses to be made for any `APP_ENV` but staging. A failed keep never fails the email and is told by its kind only (`not-made-up`, `refused`, `fault`). The website on a real database (`apps/web/src/server/online-email.ts`, wired in `startup.ts`) and the worker (`wire-worker.ts`, which no longer writes `EMAIL_CAPTURE_DIR` files in staging) both use it.
- **The reader:** `node scripts/read-kept-emails.mjs --hosted --to <made-up address>` uses league:make's own source (`sourceFor`, make-league-source.mjs) and opening (`openLeagueMakingTarget`): `--hosted` only at a terminal (stdin and stdout both, so its answer is not piped into a file or a log), both logins for that one command and never in `.env`, the tracker's project and the tracker's database refused, the certificate checked. It reads as the migration login (the tables' owner) and prints the newest code, or else the newest link, and nothing else. How to use it: [docs/operations/reading-test-copy-codes.md](../../operations/reading-test-copy-codes.md).

## Choices made here

- **The plain words only, never the HTML.** Every email has them (T7 §6) and the code and links are in them.
- **300 kept.** A few days of a test copy's sign-ups and invitations; a fixed number in the function, changed by a migration.
- **The writer lowercases the address and the reader matches in small letters,** so `New.Owner@example.test` and `new.owner@example.test` are one.
- **The same two logins as league:make,** though the reader needs only the owner: one way of giving the test copy's addresses, one set of guards, and the check that both reach the same database.

## Not verified

Not run against the test copy itself (builders never use its keys): proved on PGlite and on step 2.202's throw-away PostgreSQL with the logins made as on the test copy. The whole sign-up walk in a browser on the test copy is the lead's, in a session the founder started.

## Revisit if

The test copy gets a mail-testing service (an outside service behind the email interface, a cost the founder decides), or a host with a lasting disk and a shell.
