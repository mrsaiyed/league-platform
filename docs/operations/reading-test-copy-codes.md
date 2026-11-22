# Reading the test copy's sign-in codes

On the test copy ("staging") no email is ever sent (T-140). Each email to a made-up address (ending in `.test`, `.example`, `.invalid` or `.localhost`, or at `example.com`, `example.net` or `example.org`) is kept in the test copy's own database instead, the newest 300 ([record 098](../architecture/decisions/098-kept-emails-on-the-test-copy.md)). An email to any other address is not kept anywhere: always sign up on the test copy with a made-up address.

Only the lead reads them, in a session the founder started, at a terminal on this computer. Never an unattended run, never a builder.

## How to read a code

1. On the test copy, ask for the code (sign up, or "email me a code") with a made-up address, for example `founder.owner@example.test`.
2. At a terminal in the repository's top folder, give the test copy's two logins for this one command only (never in `.env`), exactly as for `npm run league:make -- --hosted` ([make-a-league.md](make-a-league.md)): `MIGRATION_DATABASE_URL`, `PLATFORM_DATABASE_URL`, and `MIGRATION_DATABASE_CA` with the certificate's file.
3. Run:

   ```bash
   node scripts/read-kept-emails.mjs --hosted --to founder.owner@example.test
   ```

   It prints one line: the newest 6-digit code sent to that address, or, when the newest email has no code, its link (an invitation). Type the code into the code screen. It works for the minutes the email said.

It refuses, with nothing opened: an address that is not made up; a run that is not at a terminal (it is never piped into a file or a log); an address in `.env`; the tracker's project or database; a database elsewhere whose certificate is not checked. "No email is kept for that address" means none arrived: ask for a code again and run it again.

## The way out if this fails

If no code can be read (the script refuses, or the test copy does not keep the email), the lead gives a made-up test account a password in the Supabase test project's dashboard (Authentication, Users), and signs in with that password. This signs in, but tests no sign-up and no invitation link: say so in what is reported (record 075, option 4).

## What it never does

It changes nothing, and it prints no address, no code and no link anywhere but that one line in the terminal. The web app and the worker log an email not kept by its kind only (`email not kept`, `worker.email_not_kept`), never what it held.
