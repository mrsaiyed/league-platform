# 055 — The web app on the database, part 1: its own setting, the made-up database, and who the signed-in person is

Date: 2026-11-14. Step 2.93 part 1; answers Stage 1 report finding R8 and carries out record 052's "wiring" for the requests every page makes; serves T2 §4, T-30, T-60, T-201, T-256. Decided by the builder of step 2.93 for the lead (technical), to be confirmed when the step lands.

**Not verified against a real PostgreSQL server or Supabase.** Everything below runs on the made-up database (PGlite) only.

## Problem

The web app's every page reads through `WebPorts` (`apps/web/src/server/ports.ts`), and only the made-up stand-in filled them (finding R1). Step 2.93 moves them onto the database area by area, which needs a way to run the app on a database before every area has moved. Two settings traps stood in the way too (R8): the web app read the tracker's setting name `DATABASE_URL`, and demanded a session secret and two Stripe keys nothing used.

## What

- **The platform's database is `PLATFORM_DATABASE_URL`** in the web app and the worker, never `DATABASE_URL`, which stays the tracker's. A settings file made for one cannot point the other at its database; a test in each app checks that `DATABASE_URL` is ignored. It is required in staging and production only, as are `SUPABASE_URL` and `SUPABASE_SECRET_KEY`; `RESEND_API_KEY` in production only. `SESSION_SECRET`, `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are optional until the step that first uses them makes them required where used; given now, they are still checked.
- **`LOCAL_DATA`** (local and test only; set anywhere else, the app refuses to start) chooses what local work runs on: `stand-in` (the default, unchanged) or `made-up-database`, the made-up database in memory that the worker already uses (`madeUpDatabase`: every migration, the seed leagues, a login that is a member of `app_user` and nothing more). Its login role is checked at start as a hosted one is (T-60). People sign in on the same sign-in stand-in as before (`standInSignIn`, split out of `stand-in-ports.ts` with its refusals), and the made-up member is made the same way. The stand-in's made-up people and their tokens do not exist there.
- **`databasePorts`** (`apps/web/src/server/database-ports.ts`) fills `WebPorts` from the database. Moved in this part: finding a league by its short name (`findLeagueByShortName`, no league set) and by its id (`findCurrentLeague`, that league set), who the signed-in person is, and what they hold in a league (`myAccess` over `accessStore`, the same code the stand-in answers through). packages/database is handed in, not imported, so Next.js never bundles it (container.ts).
- **Who the signed-in person is** (record 052, T-256): `identify` asks the sign-in service, whose `accountId` is its own user id, then turns that into our account id: `findAccountOfSignIn` for a user seen before, else `accountForSignIn` with the email the service holds for the session. That is the app's only call of `accountForSignIn`. It is safe there because the service has just proved the session, and it makes a session only after proving the mailbox (a right code, Google or a right password); the email never comes from the request. An address whose account is linked to another sign-in user makes `identify` throw, so the request fails rather than acting as anyone; that is put right by hand (record 052).
- **Areas not yet moved refuse.** Each area's ports throw `NotOnTheDatabaseYet` the moment any part of them is reached, so such a page shows the error page, never made-up data that is not in the database. `liveFeed` is null and `publishPlays` refuses until the tracker moves.
- **Staging and production still refuse to start** after the login check, as before: they must not serve until every area has moved.

## Considered

- **Mixing: the database for what has moved, the stand-in for the rest.** The stand-in's leagues and ids are not the database's, so its pages would show leagues that do not exist next to ones that do.
- **Linking accounts in the sign-in screens, right after each proof** (the code, the password, Google). Three call sites, each to review, and a session renewed or made another way would still need the lookup. `identify` sees every session once, whichever way it began.
- **Turning a link conflict into "signed out".** The person could then never sign in, silently. A failure is seen and put right.

## Not done here, and where it goes (step 2.93's later parts)

- **Part 2, staging and production:** the Supabase adapter (`createSupabaseSignIn`) with 2.92's store (`createDatabaseSignInStore`), where TypeScript checks the two store shapes still fit; checking at start that the login is a member of `sign_in_store` (and, on PostgreSQL 16 and later, not inherited, record 052); the health check asking the database; renaming the providers' `accountId` to say it is the sign-in user id.
- **Then each area in its own part:** public schedule, standings and statistics, teams, Admin → Teams, league settings, the schedule grid, fixture import, the games area, the tracker (with the live hub). Once all have moved, `startup.ts` stops refusing staging.
- `run-it-locally.md` describes `LOCAL_DATA`; the browser checks still run on the stand-in only.

## Revisit if

- An area cannot move without the stand-in's made-up people (the made-up database has its own seed staff, record 048).
- Linking in `identify` shows up as slow: it is one extra query per signed-in request, and a write only the first time.
