# Make a league on a real database

This is for the day the lead and the founder sit together and put a league on a real platform database: the demo league first, then the founder's own. It uses `npm run league:make` ([record 057](../architecture/decisions/057-making-a-league-from-this-computer.md)). For practice on this computer, see [run it locally](run-it-locally.md#make-a-league): there the tool needs no settings at all.

**Not yet run against a real database.** Everything the tool does is tested on made-up databases on this computer only (T-201). The first real run is on the test copy ("staging"), in a session the founder started, never on production, and never on the Al-Hadi tracker's database.

## What it does

It makes one league in draft, with its first season as the current one, in one step, the way our own staff would if there were a page for it (P3 §8). The owner needs no account yet: one is made for their email, and it becomes theirs the first time they sign in with that address. Before it makes anything it shows the whole plan, including exactly which database it reached, and asks.

On this computer it uses the local made-up database unless it is told otherwise, even when hosted settings are present. A hosted database needs `--hosted`, a person at a terminal, and the league's short name typed as the answer.

## The two logins

A hosted database is reached through two logins, each doing only what it must:

- **The app's own login** (`PLATFORM_DATABASE_URL`, the same restricted login the web app uses) runs every command that makes the league and its season, inside the league's fence, exactly as the web app would.
- **The migration login** (`MIGRATION_DATABASE_URL`, the login that applied the migrations and owns the tables) does only what nothing else may: reading the migration log, finding accounts by email, and adding the owner's and our staff member's accounts. The product has no other way to make an account ahead of a person: an invitation gives an existing account a role, but it cannot make one, and a league needs its owner's account the moment it is made.

Before the plan is shown, and again just before anything is made, the tool checks both: the app's login must pass the same login check the web app runs at start-up (not a superuser, not the tables' owner, not bypassing row-level security, a member of `app_user`), and must really switch to `app_user`; the migration login must be able to find and add accounts and read the migration log. Each refusal says what is wrong and what to use instead.

Both addresses go through the same guard against the tracker's database that the web app and the worker use. An address naming the tracker's Supabase project in any spelling is refused before anything connects, and so is one that takes its host, port, user, password, options or database name from what follows a `?`. Once connected, a database holding the tracker's own data (the `live_stats` schema) is refused before anything else is read, and the two logins must reach the same database.

## The checklist

Do these in order. Each one is a reason to stop if it does not hold.

1. **Read the project reference aloud.** Each address has a Supabase project reference in it (in `db.<reference>.supabase.co`, or after `postgres.` in the pooler's user name). Read it aloud and compare it with the one in `supabase/site.json`: they must be different, because the one in `site.json` is the tracker's. Nothing may come after a `?` in either address.
2. **Give the addresses for that one command only.** Type them in front of the command, never put them in `.env` (the tool refuses if `.env` names them), and close the terminal afterwards so they are gone. For example, in Git Bash: `MIGRATION_DATABASE_URL='…' PLATFORM_DATABASE_URL='…' MIGRATION_DATABASE_CA=./supabase-ca.crt npm run league:make -- --hosted …`
3. **Certificate checking on.** `MIGRATION_DATABASE_SSL` left out (it means `verify`) and `MIGRATION_DATABASE_CA` set to Supabase's certificate file, downloaded from the project's database settings. For a database that is not on this computer the tool refuses `off` and `no-verify`.
4. **Migrations fully applied, and both checks passing.** If the tool says the database is behind, ahead or different, or that a login may not do its part, stop and put that right first.
5. **"Confirm email" is on.** In the Supabase project's sign-in settings, "Confirm email" must be on. If it is off, the first person to sign up with the owner's address takes the league. Step 2.115's start-up check must have landed too.
6. **The owner's exact address.** The founder confirms the exact email address the owner will sign in with. A Google address written with different dots counts as a second account.
7. **Who plays, said aloud.** The founder says aloud who plays. A school league is **under-18s**. It decides how players' names are shown and whether the league finder lists the league, and nothing can change it afterwards yet.
8. **Read the whole plan** before typing the short name: the league, who plays, the listing, the owner, the season, and the "Where" line, which must say the right database, host and Supabase project, and "NOT on this computer".
9. **Look in the database afterwards.** One league in draft; one season, the current one; the activity log naming our staff for both; the owner's account with no sign-in link; and no role grants for our staff member's account.
10. **First a throwaway.** Make the first real league with a throwaway short name on the test copy, and know beforehand how a wrong league will be removed by hand.
11. **Press Ctrl+C at the question once,** to see that it stops cleanly and makes nothing.
12. **The rule, not the terminal.** "Typed at a terminal" does not stop an AI session whose tool gives it a terminal. What stops it is the rule: no unattended run ever passes `--hosted`.

## What it prints if something goes wrong

It never prints an address, a user name or a password. A connection that fails names the login and the likely cause (the user name or password, the database name, the host, the network, or the certificate file), then the usual causes to look at. If the league was refused, the accounts the run made are removed again, and it says so. If something unexpected stops it after the league was made, it says the league is there, whole, with its id.
