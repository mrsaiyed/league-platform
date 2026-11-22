# 082 — How the test copy starts, and what it refuses

Date: 2026-11-17. Step 2.93, the last part (T-286). Carries out T-270 (the first online test copy), T-30, T-60, T-140, T-201 and step 2.115's check as the start of the real sign-in; finishes what records [018](018-the-supabase-sign-in-adapter.md), [052](052-accounts-on-the-real-database.md), [055](055-the-web-app-on-the-database.md) and [075](075-reading-kept-emails.md) left to this part. Decided by the builder of the last part for the lead (technical), to be confirmed when the step lands.

**Not verified against the real service or a real PostgreSQL server.** Everything below runs on this computer against the made-up seed database served as a PostgreSQL server on 127.0.0.1 and a fake of Supabase Auth served over HTTP, with made-up keys (T-201). What only the real test copy can show is the list at the end, for the founder's supervised session.

## Problem

In staging mode start-up refused ("sign-in on the real service is not wired yet"), the Supabase adapter was built and tested against a fake but not wired into the app, the sign-in store in our own database (step 2.92) was not used, and nothing told search engines to stay away from a copy that is not production. So the first online test copy could not start at all, and when it could, it would have been open to indexing.

## What

### Start-up, in order (`apps/web/src/server/startup.ts`)

Each problem stops the start before the app serves anyone, in one plain sentence, never with a key, password, address or the service's own words.

1. **Settings** (`config-schema.ts`), as before, and two new ones (below). A missing or wrong one is named with a fixed reason.
2. **The database**, `PLATFORM_DATABASE_URL`, through `pg`: over SSL with the server's certificate checked, unless it is on this computer (`PLATFORM_DATABASE_SSL`, below). Not reached: "the database could not be reached to check its login role."
3. **The login role** (T-60), as before: a superuser, a role that bypasses row-level security, the tables' owner, or not a member of `app_user` stops it.
4. **The sign-in store's role** (record 052), new: the login must be a member of `sign_in_store` and able to switch to it (`checkSignInStoreLogin`, packages/database), or the first sign-in would fail with "permission denied to set role". The sentence says what to run: `grant sign_in_store to <the app's login>;` as the migration login.
5. **The real sign-in service**: Supabase's adapter (`createSupabaseSignIn`, record 018) is made with the store in our own database (`createDatabaseSignInStore`, record 052), our own email service for its codes (T4 §3), our own origin as the one place Google may send a browser back to, and plain http only to a service on this computer (a fake in a test). A fault in its settings is said in fixed words, as before.
6. **Email confirmation** (step 2.115), unchanged and asked of that very adapter before anyone is signed in through it: `off` and `unknown` stop it, each in its sentence; `unknown` says which kind.
7. **Staging serves** on the database ports (`databasePorts`) with no local tools, so both local pages answer "not found" and every request is answered. Every email is captured, never sent (T-140): in staging, in the server's memory, the newest 1,000.
8. **Production stops here**, after every check has passed: "every check passed, but "production" does not serve anyone yet: only the test copy ("staging") is opened in this stage (record 082), because fixture import does not run on the database yet and youth leagues' pages are not yet marked "do not index" there (step 2.60)." Step 2.93's line opens staging only; opening production is a release of its own.

The database connection stays open for as long as the server runs; on any refusal it is closed. A connection the pool loses while idle is replaced, and said in the log by its kind only.

### Two settings: how the database is reached

Supabase's database certificate is signed by Supabase's own authority, which no system knows, so with the certificate checked against the system's authorities the real test copy could not connect (league:make already asks for it: `MIGRATION_DATABASE_CA`).

- **`PLATFORM_DATABASE_CA`**: the server's certificate as PEM text (public; from the project's database settings). Optional; a value that is not a certificate is refused.
- **`PLATFORM_DATABASE_SSL`**: `verify` (the default: SSL, the certificate checked against `PLATFORM_DATABASE_CA` when given, else the system's authorities) or `off` (no SSL), allowed only for a database on this computer, an address naming `localhost` (as league:make rules; staging and production refuse an IP address as the host, record 055). There is no way to use SSL without checking the certificate. The address cannot change any of this: its ssl settings are taken out (`create-database.ts`).

### The health check asks the database

`GET /api/v1/health` (T8 §7) answers whether the app started and whether its database answers now: one guarded transaction as the app's role with no league set, reading no table (`databaseAnswers`), with a three-second limit, so a database gone away or hanging shows as `down` (503) within seconds. On the made-up stand-in, which has no database, it says `none`. Fixed words only.

### Core's event handlers from one place

Every database port's commands are given core's event handlers from `database-event-handlers.ts`, and each port's command transaction holds the stores they use (the standings, the games module's results, access, the activity log). Part 4's ports gave theirs an empty list; harmless while only game results raise events, but the day a setting or a schedule change must re-rank a table the database would silently do less than the made-up world. `database-event-handlers.test.ts` walks every area of the ports that runs commands (so one added later is covered unnamed), opens each one's transaction, and reads every database port's source, so a list written by hand, an empty one above all, fails.

### "Do not index" outside production

Before the test copy is opened to anyone, every answer of a copy that is not production tells search engines to leave it out, three ways (`do-not-index.ts`):

- **The header** `X-Robots-Tag: noindex`, set by the proxy on every answer it passes on (pages, API answers, error pages) and on its own plain page; the few files the proxy never sees (Next.js's scripts and images, the icon, the two stylesheets) get it from `next.config.ts` in every mode, as they are files and never pages. A header is the one mark search engines read on an answer that is not a page.
- **The page's own mark** in every page's head, `<meta name="robots" content="noindex, nofollow">`, from the root layout, read when the page is drawn (every page is drawn on request; none is built ahead). It holds where a host or a cache might drop a header.
- **`/robots.txt`**: every robot, nowhere. A robot that obeys it never fetches the pages at all; the header and the mark cover the robots that do not, and an address found from a link elsewhere.

Failing closed: settings that cannot be read count as not production. **Production answers none of the three**: what production lets search engines show, a youth league's pages above all (T4 §7), is step 2.60's; until then production does not start.

## How it is proved here

- `container.test.ts` starts the real wiring of `container.ts` (settings from the environment, packages/database loaded as the app loads it, Supabase's adapter over HTTP to the fake), with every stand-in the app has made to throw if reached; it was seen to fail when start-up was made to fall back to one. In staging a person signs up by the code, chooses a password and signs in, their sessions are listed by device, one signs out, the rest everywhere, and a restart signs nobody out. Production stops in its sentence. Each refusal is met for real: no database, no SSL where it is asked for, a superuser login, a login without the sign-in store, email confirmation off, the key refused, the service not reached, a setting missing, and wrong ones.
- `tests/browser/test-copy-test.mjs` starts the built app in staging mode the same way and, in a real browser, signs a new person up by the code, shows their device, signs out and in again from two browsers, signs out everywhere; the seed league's owner, whose account was made in advance, signs up with its address and opens their admin area. It checks the health check, "do not index" on a page, two error pages, two API answers, three files and `robots.txt`, and compares `/signin/kept-emails`, `/signin/made-up-people` and the posted "be this person" action byte for byte with `/signin/no-such-page` (status, every header but the date, markup and page data; record 075's "not done"). A control run in test mode shows the very same post signs the person in where the tools exist. Production with the same world stops and nothing answers. The server's output at debug level holds no code, key, password, database address or email.
- The settings, the sign-in store check, the health check and the marks have unit tests of their own.

## Considered

- **Turning SSL off by itself for an address on `localhost`.** Shorter, but a setting nobody chose; the explicit `off`, refused anywhere else, says what is happening.
- **SSL without checking the certificate** (`no-verify`, as league:make allows by name). Left out: there is a certificate to check, and the setting would be one word from a connection anyone on the path could read.
- **Letting production start too**, so the local pages could be compared over HTTP in production mode as well. Refused: step 2.93's line opens staging only, and production would serve without step 2.60's rule for youth leagues. Production instead refuses after every check; its pages cannot be requested at all, which leaves less open than "not found". The functions it would run are the same as staging's (`local-only.test.ts` runs them under both).
- **The header from `next.config.ts` alone.** Its rules are fixed when the app is built, and one build runs in every mode; only the files the proxy never sees take it from there.
- **`robots.txt` alone.** It stops robots that obey it from fetching a page, but an address linked from elsewhere can still be listed; the header and the mark are what keep a page out.

## For the founder's supervised session on the real test copy, in order

Nothing here can be proved on this computer. Do them in this order; none is to be shortened.

1. **Before starting it:** "Confirm email" on in the test project (Authentication, then Sign In / Providers, then Email); `grant sign_in_store to <the app's login>;` run as the migration login; every migration applied ([applying migrations](../../operations/apply-migrations.md)); the database's certificate downloaded from the project's database settings and given as `PLATFORM_DATABASE_CA`.
2. **Its settings on the host** (T-270): `APP_ENV=staging`; `PUBLIC_BASE_URL` the host's own https address (an http one is refused at start-up in staging and production, except for localhost: the going-online audit's P9); `TRUSTED_PROXY` as the host's proxy really behaves (record 031: `one` only if exactly one proxy appends the address it was reached from: check Render's `X-Forwarded-For` first); `PLATFORM_DATABASE_URL` the app's own login; `SUPABASE_URL` and `SUPABASE_SECRET_KEY` the test project's; `EMAIL_FROM`. Never `RESEND_API_KEY`, `DATABASE_URL` or any `LOCAL_` setting there.
3. **It starts**, and its log names no refusal. Start it once without `PLATFORM_DATABASE_CA`: it must refuse with "the database’s certificate could not be checked" (the certificate is really checked); then with it. The start-up tells three refusals apart, each in its own sentence, by the driver's error code only (never its message, which may hold the address): the certificate could not be checked (set `PLATFORM_DATABASE_CA`), the password or login was refused (check the login in `PLATFORM_DATABASE_URL`), the database could not be reached (address, port, running); a database that will not take SSL has a fourth.
4. **Which of Supabase's connection addresses the app uses** (direct, or the pooler in session or transaction mode): the app sets its league and role per transaction only, and `pg` sends unnamed statements; check that sign-in, a public page and a saved result all work through the address chosen.
5. **The health check** from outside: 200 with `"database":"ok"`; with the project paused, 503 `down` within a few seconds.
6. **Record 018's "To check on staging", items 1 to 13, in full**, first among them Supabase's per-network limits (item 4: every call comes from the host's one address) and the timing of a wrong password (item 8).
7. **Signing up by a code cannot be done on the test copy yet**: its emails are captured in the server's memory and nothing can read them (record 075 chose a table of captured emails and a script, option 5, not built: it needs a migration). Until it is built, nobody can finish a sign-up there.
8. **Do not index:** ask a page, an API answer and an address that does not exist with the headers shown (`curl -sI`): each says `X-Robots-Tag: noindex`; a page's source has the robots mark; `/robots.txt` says `Disallow: /`. Check the host adds nothing that drops or overrides them.
9. **The local-only pages** on the real host: `/signin/kept-emails`, `/signin/made-up-people` and the posted "be this person" form answer exactly as `/signin/no-such-page`.
10. **The lists already on step 2.93's line for real PostgreSQL** (parts 3, 4, 5 and 6, and step 2.187's), in full, now that the test copy serves.

## Not done here, and where it goes

- **Reading the test copy's emails** (record 075, option 5): a migration, a store and a script; until then no one can sign up there (item 7 above).
- **The migration record 055 asks for** (`account_for_sign_in` comparing addresses without `lower()` folding, so an account made by hand with a non-ASCII address cannot be linked to the plain address it folds into): not built in this part, which needs no migration; today such accounts are made only by our own staff.
- **The membership of `sign_in_store` made not inherited** (record 052, PostgreSQL 16 and later): to be tried on Supabase in the supervised session; `checkSignInStoreLogin` would check it.
- **Production**, which still stops (above), and fixture import on the database (parked until after Test 2).
- Renaming the providers' `accountId` to say it is the sign-in user's id (record 055).

## Revisit if

- The supervised session finds a difference from the fake: fix the adapter and the fake together (record 018).
- The host keeps a disk and a shell (record 075's option 3), or a mail-testing service is chosen for staging.
- Step 2.60 builds production's indexing rule: production's refusal above loses one of its two reasons.
