# Make a league on a real database

This page is for the day the lead and the founder sit together and put a league on a real platform database. The tool is `npm run league:make` ([record 057](../architecture/decisions/057-making-a-league-from-this-computer.md)). To practise on this computer, see [run it locally](run-it-locally.md#make-a-league): there the tool needs no settings at all.

**It has not yet been run against a real database.** Everything it does is tested on made-up databases on this computer only (T-201). The first real run is on the test copy ("staging"), in a session the founder started. It is never run on production, and never on the Al-Hadi tracker's database.

**A wrong league can be removed only while it is still exactly as this tool made it.** `npm run league:remove` removes a league that is in draft and has no games, no people and no roles but its owner's (see "Remove a league made by mistake" below). Once anything at all is added to it, or it is published, this tool does not remove it: that is step 2.133, not built yet. So read the plan carefully before you answer, and if something is wrong, remove the league straight away.

## What it does

It makes one league in draft. The league's first season is made in the same step and is the current one. It does this the way our own staff would if there were a page for it (P3 §8).

The owner needs no account yet. One is made for their email address, and it becomes theirs the first time they sign in with that address. **The tool sends nothing to anyone.** Tell the owner yourself to sign up with exactly that address.

Nothing can publish the league yet: it stays in draft until part 2 of step 2.125 is built.

Before it makes anything it shows the whole plan, including exactly which database it reached, and asks. Afterwards it reads back what it made from the database and prints it, so nobody has to query the database by hand.

On this computer it uses the local made-up database unless it is told otherwise, even when hosted settings are present. A hosted database needs three things: `--hosted`, a person at a terminal, and the league's short name typed as the answer.

## Who types, and where the addresses come from

**The founder types, at their own terminal.** The two addresses contain passwords, so they never pass through an AI session: not in chat, not in a file the session can read, not in a command the session runs. "Typed at a terminal" does not stop an AI session whose tool gives it a terminal. Only the rule does: no AI session and no unattended run ever passes `--hosted`.

Both addresses come from the test copy's project in the Supabase dashboard:

- **The migration login** (`MIGRATION_DATABASE_URL`) is the connection string that applied the migrations. It owns the tables (Supabase's `postgres` user). It is used only for what nothing else may do: reading the migration log, finding accounts by email, and adding the owner's and our staff member's accounts. The product has no other way to make an account ahead of a person. An invitation gives an existing account a role, but it cannot make an account, and a league needs its owner's account the moment it is made.
- **The app's own login** (`PLATFORM_DATABASE_URL`) is the same restricted login the web app uses. It runs every command that makes the league and its season, inside the league's fence, exactly as the web app would.
- **The certificate** (`MIGRATION_DATABASE_CA`) is Supabase's certificate file, downloaded from the project's database settings.

`--as` is **your own** email address as SR Leagues staff: the founder's own, the one they sign in with. It is the name the activity log records as the person who made the league.

## The checks the tool makes

Before the plan is shown, and again just before anything is made, it checks both logins:

- The app's login must pass the same login check the web app runs at start-up: not a superuser, not the tables' owner, not bypassing row-level security, and a member of `app_user`. It must also really switch to `app_user`.
- The migration login must be able to find and add accounts and read the migration log.

Each refusal says what is wrong and what to use instead.

Both addresses go through the same guard against the tracker's database that the web app and the worker use. These are refused before anything connects:

- an address naming the tracker's Supabase project, in any spelling;
- an address with anything at all after a `?`;
- any setting in the address that would change how the connection is encrypted (`ssl`, `sslmode`, `sslnegotiation` and the rest).

Once connected, a database holding the tracker's own data (the `live_stats` schema) is refused before anything else is read, and the two logins must reach the same database.

A database counts as "on this computer" only when its address names `localhost`. A tunnel that brings a hosted database to `localhost` defeats this check and the certificate check that goes with it: never use one. Connecting gives up after 15 seconds and says which of the usual causes to look at.

## The steps, in the order they happen

### Before the day

1. **Know beforehand how a wrong league will be removed.** Read "Remove a league made by mistake" below. It works only while nothing has been added to the league.
2. **Check "Confirm email" is on.** In the test copy project's sign-in settings, "Confirm email" must be on. If it is off, the first person to sign up with the owner's address takes the league. Step 2.115's start-up check must have landed too.
3. **Apply the migrations fully** to the test copy ([applying migrations](apply-migrations.md)).

### A practice run on the test copy

4. **Run it once with a throwaway short name**, such as `practice-1`, following steps 6 to 11 below. Look at what it prints at the end. Then **remove that practice league** with `npm run league:remove`, following "Remove a league made by mistake" below, so the removal has been tried once before the real run.
5. **Press Ctrl+C at the question once**, on a second run, to see that it stops cleanly and makes nothing. Ctrl+C is honoured at every question. While it is connecting or making the league it is not: if the window is closed or the computer stops part-way, run the tool again with the same answers and it will say what exists (step 12).

### The real run

6. **Read the project reference aloud.** Each address has a Supabase project reference in it: in `db.<reference>.supabase.co`, or after `postgres.` in the pooler's user name. Read it aloud. It must be the same as the test copy's reference in the Supabase dashboard, and it must be different from the one in `supabase/site.json`, which is the tracker's. Nothing may come after a `?` in either address.
7. **Give the addresses for that one command only, without them showing or being saved.** Never put them in `.env`; the tool refuses if `.env` names them, in any capitals. Typed commands are saved to a history file in both Git Bash and PowerShell, passwords included, so do not type an address into the command itself. Read each one into a variable that is not shown on the screen, use the variables for the one command, then clear them.

   In **Git Bash**:

   ```sh
   read -rs MIGRATION_DATABASE_URL; echo; read -rs PLATFORM_DATABASE_URL; echo
   MIGRATION_DATABASE_URL="$MIGRATION_DATABASE_URL" PLATFORM_DATABASE_URL="$PLATFORM_DATABASE_URL" MIGRATION_DATABASE_CA=./supabase-ca.crt npm run league:make -- --hosted --as founder@example.test
   unset MIGRATION_DATABASE_URL PLATFORM_DATABASE_URL
   ```

   Paste each address when the cursor waits after `read`; nothing shows. Only the variable names are saved to the history.

   In **PowerShell**:

   ```powershell
   $env:MIGRATION_DATABASE_URL = [Net.NetworkCredential]::new('', (Read-Host -AsSecureString 'Migration login address')).Password
   $env:PLATFORM_DATABASE_URL = [Net.NetworkCredential]::new('', (Read-Host -AsSecureString 'App login address')).Password
   $env:MIGRATION_DATABASE_CA = '.\supabase-ca.crt'; npm run league:make -- --hosted --as founder@example.test
   Remove-Item Env:MIGRATION_DATABASE_URL, Env:PLATFORM_DATABASE_URL, Env:MIGRATION_DATABASE_CA
   ```

   `Read-Host -AsSecureString` shows stars and keeps the address out of the history. The variables last only for that PowerShell window: close it afterwards.

8. **Certificate checking on.** Leave `MIGRATION_DATABASE_SSL` out (it then means `verify`) and set `MIGRATION_DATABASE_CA` to Supabase's certificate file. For a database that is not on this computer the tool refuses `off` and `no-verify`.
9. **Both checks passing, and the migrations right.** If the tool says the database is behind, ahead or different, or that a login may not do its part, stop and put that right first.
10. **The owner's exact address, and who plays.** The founder confirms the exact email address the owner will sign in with: a Google address written with different dots counts as a second account. The founder also says aloud who plays. A school league is **under-18s**. That choice decides how players' names are shown and whether the league finder lists the league, and nothing can change it afterwards yet. If it turns out wrong, remove the league at once, before anything is added to it, and make it again.
11. **Read the whole plan, then answer.** Check the league, who plays, the listing, the owner, the season, and the "Where" line. "Where" must name the right database, host and Supabase project, and say "NOT on this computer". Right above the question the tool shows the Supabase project reference again: check it against the dashboard. Then type the league's short name. The question does not print it for you.
12. **Read what it prints at the end.** It reads back from the database and prints:
    - one league, in draft;
    - one season, the current one;
    - two lines in the activity log, both naming our staff member;
    - the owner's account, with no sign-in link yet;
    - no role grants for our staff member's account.

    Anything not as it should be is marked "NOT as it should be".

### If it stops part-way

It never prints an address, a user name or a password. What it says depends on where it stopped:

- **A failed connection.** It names the login and the likely cause (the user name or password, the database name, the host, the network, a time limit, or the certificate file), then the usual causes to look at.
- **The league was refused.** The accounts the run made are removed again, and it says so.
- **It stopped after the league was made.** It says the league is there, whole, with its id.
- **It could not tell whether the league was made** (a dropped connection, say). It says so. It says the accounts it made are still there and may belong to the league, and that nothing should be removed. Do not remove anything: run the tool again with the same answers, and it will say what exists.

## Remove a league made by mistake

This is for the day a league was just made on a real database with a wrong short name, a wrong "who plays", or for the wrong owner. The tool is `npm run league:remove` ([record 063](../architecture/decisions/063-removing-a-league-made-by-mistake.md)). It has the same checks as `npm run league:make`, the same two addresses, and the same rule: **the founder types, at their own terminal**, and no AI session ever passes `--hosted`.

What it removes, and nothing else: a league still in draft, exactly as `league:make` left it, with its first season, its default program and the two lines its making wrote in the league's own activity log. The owner's account goes too, but only if nobody has ever signed in with it and nothing else uses it. One line stays, in the platform's own log: which league, who removed it and when.

What it refuses, with nothing removed: a league with any game, any person, any role given to anyone (even one that has ended), an invitation, a setting saved, anything in its bin, anything changed since it was made, or one that is published, archived or suspended. It says what it found. Removing a league like that is step 2.133, not this tool.

1. **Run it as soon as you see the mistake**, before anyone adds anything to the league.
   **One terminal only**: never leave its question waiting, and never make or remove a league in another window meanwhile. (If the league was removed and made again elsewhere while a question waited, the tool now refuses, but do not count on it.)
2. **Give the addresses the same way as for making**, for that one command only (step 7 above), with `npm run league:remove -- --hosted --short-name <the league's short name> --as founder@example.test` in place of the `league:make` command. On this computer, to practise, leave out `--hosted`.
3. **Check the certificate and both checks**, as in steps 8 and 9 above. If the tool says a login may not run the removal, stop: the migration login must be the one that applied the migrations.
4. **Read the whole plan.** Check the league's name and short name, when it was made (the date, the time and how long ago) and by whom, its season, what it says about the owner's account (removed too, or kept and why), and the "Where" line, exactly as in step 11 above. **Stop if this league was not made today, by you.** Stop too if it says "Its owner has already signed in" and you did not expect that: ask the lead first.
5. **Type the league's short name** to remove it. The question does not print it for you. Anything else, even "yes", removes nothing. If its owner has already signed in, it then asks for the owner's email address too: type it exactly as the plan shows it.
6. **Read what it prints at the end.** It reads back from the database and prints:
   - the league gone, with nothing of it left in any table;
   - its short name free again;
   - one line in the platform's log, naming our staff member;
   - the owner's account gone, or kept, with the reason (for example "it has signed in before").

   Anything not as it should be is marked "NOT as it should be".

7. **Run it a second time** if you are unsure: it says no league has that short name.
8. **If its owner had already signed in, tell the owner yourself** that the league was removed, and why. The tool sends nothing to anyone.

**After any refusal**, whatever it says: stop. Change nothing by hand in the Supabase dashboard. Tell the lead exactly what the tool printed. The league stays in draft, which only its own staff can see, until it is put right.

If it stops part-way, it says whether the league is still there. Removing is one step: the league is either all there or all gone, never half. If it cannot tell, run it again with the same answers and it will say.

**Reading the platform's log afterwards.** The line about a removed league is kept in the table `platform.activity_log`. No page shows it yet, and the app's own login cannot read it. Only the migration login can: in the test copy's Supabase dashboard, open the SQL editor (which runs as that login) and run `select at, league_slug, league_name, details from platform.activity_log order by at desc;`. It shows which league, when, who removed it, who made it and when, and who played in it. No line there can be changed or removed.

## Before a real school's league

These are still missing before this is used for a real league with real children's data:

- step 2.115 landed (the start-up check that "Confirm email" is on);
- a restore of the database, tried once;
- the release procedure;
- the removal tried once on the test copy (step 4 of the practice run does it);
- part 2 of step 2.125, so "who plays" can be corrected and the league published;
- step 2.133: until it is built, a league that has been used in any way cannot be deleted by anyone, its owner included;
- step 2.114: until it is built, a person on a roster cannot be erased;
- the founder's legal sign-off on holding children's data.

The two steps above are duties about children's data: a family that asks for their child's details, or a school's whole league, to be removed must be able to have that done.
