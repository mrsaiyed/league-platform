# 057 — Making a league from this computer

Date: 2026-11-14. Step 2.125 part 1, migration 0014; answers finding H1 of the 2.105 audit (`docs/build/audits/nothing-left-out.md`); serves P3 §8 (line 116), T10 line 31, U-9, U-10, T-77, T-201; records 008 and 052. Decides T-260. Decided by the builder of step 2.125 part 1 for the lead (technical), to be confirmed when the step lands.

**Not verified against a real PostgreSQL server or Supabase.** Everything below is tested on PGlite only (T-201).

## Problem

T10 line 31 promises "leagues created by an internal tool" and P3 §8 says we make each league ourselves with an internal version of the four steps until self-serve sign-up. The commands existed (`createLeague`, `createSeason`, `setCurrentSeason`), but only the seed called them, so the demo league and Faraj's could not be put on a platform database. Three things were missing:

1. **Something to run**, which shows what it will make and asks first.
2. **An owner who has no account yet.** `createLeague` needs the owner's account id; an organizer we set up by hand has not signed up.
3. **The city.** P3 §1 step 2 asks "Where": a city and a time zone. The leagues table had the time zone and the contact email, not the city; `createLeague` took neither the contact email nor the city.

## What

- **`npm run league:make`** (`scripts/make-league.mjs`, words in `scripts/make-league.messages.mjs`) takes the league's name, short name, sport, who plays, city, time zone, contact email, the owner's email, the first season's name (suggested from today, "Fall 2026") and `--as`, the email of the member of our staff running it. Anything not given is asked for; the time zone defaults to the computer's, the sport to basketball. It shows the whole plan, with where it will make it, and makes nothing unless `yes` is typed at a terminal: there is no option to skip the question.
- **Checking the answers is core's** (`planNewLeague` in `packages/core/src/modules/leagues/rules/new-league-plan.ts`): every problem is told at once; the short name follows U-7 and the blocked list; "who plays" maps adults, under-18s and both to adult, youth and mixed, and the league is listed in `/find` by U-10's default (adults only), which the owner changes later (part 2). The commands check everything again.
- **Where it makes the league.** `--db <folder>` names a local PGlite folder (which must already hold a database; the tool never makes one). Otherwise the migration login's settings: `MIGRATION_DATABASE_URL`, with `MIGRATION_DATABASE_SSL` (`verify`, the default, `no-verify` or `off`) and `MIGRATION_DATABASE_CA` (a certificate file), read from the environment or `.env`. With neither, the local test database in `.local/seed-db`. The plan shows the host and database name, never the user or password. These setting names are new here; step 2.95's release command should use the same ones.
- **Why the migration login.** Two things need its powers: adding an account (`app_user` may not insert into `accounts`, 0005 and 0012) and picking a league id and checking a short name across leagues (record 008). The commands themselves still run as `app_user` inside the league's fence, as every command does (`withTransaction` sets the role), so the login must be allowed to `set role app_user`. On Supabase that is the `postgres` login, which made the role; not verified.
- **T-260: accounts first, by email, then the product's own commands** (`makeLeague` in `packages/database/src/league-making/`):
  1. It checks the database has migration 0014 and that no league holds the short name or still forwards from it (`find_league_by_slug`), so a refusal makes nothing, not even an account.
  2. It finds the staff member's and the owner's accounts by email, whatever the capitals, and makes any that is missing with no name and no sign-in link, under the same per-address lock `account_for_sign_in` takes. The owner's first sign-in with that email links that account (record 052), so whoever signs up with it owns the league: the owner is `leagues.owner_account_id`, not a grant (O-7).
  3. `createLeague`, as our staff: the staff member is named as platform staff for this run only (`leaguesStore`'s `platformStaff`), and holds nothing in the league afterwards (T-77).
  4. `createSeason` in the default program, then `getSeason` and `setCurrentSeason`, as the owner: our staff hold no league permissions, and these are the owner's own steps (P3 §1 step 4), taken for them as the seed does. The activity log therefore shows the league made by our staff and the season by its owner.
  - Each command is its own transaction. A refusal part-way says which step refused and, once the league exists, its id; nothing is undone, and the rest is finished by hand. Between the short-name check and `createLeague` another league could take the name; the owner's account would then stay, unused, until its first sign-in.
- **Migration 0014** adds `leagues.city` (text, empty until given, 1 to 100 characters with no spaces around it). `createLeague` now also takes the optional `contactEmail` and `city`; T3 §4 lists the column.

## Not done here

- Part 2 of step 2.125: League settings → Profile, and Publish, Archive and Un-archive.
- A league's second program, divisions, teams or look: the tool makes only what P3's steps 2 and 4 ask.
- The tool has not been run against a hosted database. On a hosted database its first use is in a session the founder started, on the test copy, never production (T-201).

## Migration number

0014 was reserved for this step while 0013 belonged to step 2.113, not yet landed. The runner refuses a gap, so this lane's database tests pass only once 0013 is in the folder: the lane was tested with a stand-in 0013 that was never committed.
