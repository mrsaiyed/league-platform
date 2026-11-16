# 075 — Reading kept emails

Date: 2026-11-16. Step 2.96 (T-279). Serves T-140 (outside production no email leaves the building), T-201 (made-up data only), T4 §10 (no code in a log), record 031 ("Reading the codes in local work"). Decided by the lead's builder of step 2.96, to be confirmed when the step lands.

## Problem

Outside production every email is captured, never sent (`emailSenderFor`, packages/providers). In local work the web app's capture was memory only, so a new address could not finish signing up on this computer, and no browser test could follow an emailed code or an invitation link. On the made-up database only the made-up member (who has a password) could sign in. The same question waits for the test copy ("staging"): how does the lead, in a session the founder started, read the test copy's codes and invitation links, with no email leaving and no code in a log line?

## What, in local work and tests (built)

- **Kept on disk, made-up addresses only.** On made-up data (APP_ENV local or test, the stand-in and the made-up database alike) the web app's capture also writes a copy of each email to `.local/captured-email/` in the working folder (`apps/web/src/server/kept-emails.ts`): git-ignored, in the same JSON shape the worker's capture writes (`EMAIL_CAPTURE_DIR`, record 012). Only an email to a name kept for made-up mail is written (`.test`, `.example`, `.invalid`, `.localhost`, example.com, .net and .org); any other stays in memory. The made-up people's own sign-ups at startup are not written. The folder is found by walking up from where the server runs to the folder whose `package.json` lists the workspaces; nothing serves it (the web app has no static folder; `/signin/kept-emails/<file>` is "not found").
- **One local page reads it:** `/signin/kept-emails` (T-140's viewer), newest 50 first: who it was to, the subject, a 6-digit code on its own, the links to this site's own address (`PUBLIC_BASE_URL`; no other address is made a link), and the plain words as text; an email's HTML is never drawn.
- **"Be this made-up person"** (`/signin/made-up-people`): the made-up people with what they are in which league, and one button each that signs the browser in. It makes no session of its own: the form sends a key; the server finds how that person signs in and runs the ordinary flows on the sign-in stand-in (`be-made-up-person.ts`): on the stand-in the made-up password through the password sign-in; on the made-up database, where nobody has a password, an emailed code asked for as the sign-up form asks it, read from the capture in memory, and given to the code screen's own step, so the browser lands on "Choose your password" as after any sign-up.
- **The gate is on the server, twice.** `runsOnMadeUpData(APP_ENV)` (`made-up-mode.ts`), now the one test startup and the stand-in use to choose made-up data, is asked first by both pages and the form's action, from the app's own settings, before the app's ports are asked for; outside local and test they answer Next.js's own "not found", the answer of an address that does not exist. Then only ports made on made-up data carry the tools (`localTools`); the database's ports carry none. No header, cookie or address takes part. Neither page is linked from any page a visitor sees.
- **No code in a log.** Nothing in the capture, the files or the pages logs what an email holds; a file that cannot be written is reported by its kind only. A unit test signs a new address up by the code read from the kept files, with the logger wired as the app wires it and the console watched, and finds neither the code, the address nor the session token in any line; the browser test checks the server's own output (at debug level) for the code, the address and an invitation token.

## The test copy (staging): options

1. **The same page on the test copy.** Refused: the test copy has a public address, so a page that shows codes would let anyone sign in as anyone there, and it would make the pages' gate depend on more than "local or test".
2. **Codes in a log line at debug level.** Refused by T4 §10, and hosting keeps logs where the lead cannot control who reads them.
3. **Files on the host** (`EMAIL_CAPTURE_DIR`, as the worker already can). Nothing leaves, but the host's disk is lost on every deploy and reading it needs a shell on the host, which the test copy's free plan does not offer as far as we know (T-270); the web app and the worker would each have a folder of their own.
4. **The vendor's admin instead of email.** The lead gives made-up test accounts a password in the Supabase test project's dashboard. It covers sign-in only, never an invitation link, and is a second way of making accounts.
5. **Kept in the test copy's own database.** The capture, on the test copy only, writes each email to a table of captured emails (made-up addresses only, the newest few hundred), readable by the table owner only, never by the app's login role; the lead reads it on this computer with a script run in the supervised session with `.env.staging`'s keys, as `league:make --hosted` already works, which prints one email's code or link to the terminal on request and never to a log.

## Choice

Option 5, built when the test copy first sends an email: today the web app refuses to start in staging (record 055) and nothing there sends one, so nothing is built for it now. Its rules are fixed here so it cannot drift: production never writes the table (`emailSenderFor` gives Resend there and the table's writer refuses APP_ENV production); the app's login role cannot read it; the script refuses any address but the test copy's (the tracker's database guard, record 055) and runs only at a terminal in a session the founder started (T-201); it prints to the terminal only. That step needs a migration, a store and the script; the supervised session then runs `node scripts/read-kept-emails.mjs --hosted --to <made-up address>` (the name to be confirmed by that step).

## Not done yet

- The test copy's table, store and script (option 5), with the first step that sends email from the test copy.
- Invitations cannot be sent on the made-up stand-in (its access store refuses them), so no screen makes a kept invitation email there yet; the browser test writes one itself. On the made-up database the invitation job runs in the worker, whose own capture folder is `EMAIL_CAPTURE_DIR`; pointing it at `.local/captured-email` (as `.env.example` suggests) puts its emails on the same page.
- The made-up stand-in's staff other than the owner, scheduler, scorekeeper, coach and member (the draft league's admin, registrar, editor and the others) have no sign-in, only a session cookie, so they are not offered.

## Revisit if

The test copy gets a host with a lasting disk and a shell (option 3 becomes enough), or a real mail-testing service is chosen for staging (it would be an outside service behind the email interface, and a cost the founder decides).
