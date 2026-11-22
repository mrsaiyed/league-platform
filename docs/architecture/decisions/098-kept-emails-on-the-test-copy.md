# 098 — Kept emails on the test copy

Date: 2026-11-22. Step 2.204 (T-296). Builds [record 075](075-reading-kept-emails.md)'s option 5. Serves T-140 (outside production no email leaves the building), T-201 (made-up data only), T4 §10 (no code in a log). Decided by the builder of step 2.204, to be confirmed when the step lands.

## Problem

On the test copy ("staging") every email is captured, never sent, and the capture was the web server's memory: lost at every restart and readable by nobody. So the founder could not finish signing up there: the sign-up code never reached anyone.

## What is built

- **Migration 0023.** Schema `kept_emails`, outside `public`; table `kept_emails.emails` (to, in the form the check sees: `kept_emails.kept_form`, trimmed, one final dot dropped, A to Z in small letters, the same as `keptAddressOf`; what it carries, `code` or `link`; subject; the plain words; when). Only an address on record 075's list (`kept_emails.is_made_up_address`, the same rule as `isMadeUpAddress` in packages/providers: trimmed as JavaScript's `trim()` trims, no whitespace inside, `[A-Za-z0-9.-]` tested before lowercasing), checked by the table itself as well as by the function. The two are held to the same answers by one shared list of spellings, `packages/providers/src/email/made-up-address-cases.json`, which both tests (and the real-PostgreSQL test) read. Row-level security on with no policy; Supabase's API roles get nothing.
- **One way in:** `public.keep_email(to, kind, subject, text)`, owner-run, granted to `app_user` only. Before the insert it refuses an unknown kind, an email too long for the table (string_data_right_truncation) and an address that is not made up (check_violation), none of these errors carrying a value, so no refused row's DETAIL line (with a code in it) reaches the server's log. It adds the row, removes every row past the newest 300 (`keep_count`) or older than 3 days (`keep_days`), and returns nothing. The app's login, as itself or as `app_user`, cannot read, change or remove a row, nor use the schema, nor run the check itself.
- **The writer:** `keptEmailSender` (packages/providers) hands every email to the capture as before and keeps one to a made-up address through `keepEmail` (packages/database). It refuses to be made for any `APP_ENV` but staging. A failed keep never fails the email and is told by its kind only (`not-made-up`, `refused`, `fault`). The website on a real database (`apps/web/src/server/online-email.ts`, wired in `startup.ts`) and the worker (`wire-worker.ts`, which no longer writes `EMAIL_CAPTURE_DIR` files in staging) both use it.
- **The reader:** `node scripts/read-kept-emails.mjs --hosted --to <made-up address>` uses league:make's own source (`sourceFor`, make-league-source.mjs) and opening (`openLeagueMakingTarget`): `--hosted` only at a terminal (stdin and stdout both, so its answer is not piped into a file or a log), both logins for that one command and never in `.env`, the tracker's project and the tracker's database refused, the certificate checked. It reads as the migration login (the tables' owner) and prints, of the newest email kept for the address (`--to` in `keptAddressOf`'s form), its code when it is a code email, else its first link, chosen by the kind kept with it (`EmailMessage.carries`: the sign-in code email says `code`, invitations and notices `link`), and nothing else. It does not look at `APP_ENV` and does not itself refuse the platform's production database: it reuses `league:make --hosted`'s guards ([record 057](057-making-a-league-from-this-computer.md)), which refuse the tracker's project and database. Production's table stays empty because the writer, `keptEmailSender`, refuses to be made for any `APP_ENV` but staging. How to use it: [docs/operations/reading-test-copy-codes.md](../../operations/reading-test-copy-codes.md).

## Choices made here

- **The plain words only, never the HTML.** Every email has them (T7 §6) and the code and links are in them.
- **300 kept, for 3 days at most.** A few days of a test copy's sign-ups and invitations, and no code or invitation link waits at rest longer than that for newer emails to push it out; two named constants in the function (`keep_count`, `keep_days`), changed by a migration.
- **One form of an address, for keeping and for reading,** so `New.Owner@example.test.` and `new.owner@example.test` are one.
- **The same two logins as league:make,** though the reader needs only the owner: one way of giving the test copy's addresses, one set of guards, and the check that both reach the same database.

## Not verified

Not run against the test copy itself (builders never use its keys): proved on PGlite and on step 2.202's throw-away PostgreSQL with the logins made as on the test copy, including the whole sign-up with the real sign-in adapter on the fake Supabase Auth: the kept code, read as the owner, typed back in, makes the account. The whole sign-up walk in a browser on the test copy is the lead's, in a session the founder started.

## Revisit if

The test copy gets a mail-testing service (an outside service behind the email interface, a cost the founder decides), or a host with a lasting disk and a shell.
