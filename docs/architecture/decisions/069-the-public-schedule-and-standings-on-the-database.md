# 069 — The web app on the database, part 2: the public schedule and the standings

Date: 2026-11-15. Step 2.93 part 2 (T-273); follows record 055 (part 1). Serves T2 §4, T-30, T-60. Decided by the builder of step 2.93 part 2 for the lead (technical), to be confirmed when the part lands.

**Not verified against a real PostgreSQL server or Supabase.** Everything below runs on the made-up database (PGlite) only.

## Problem

On the database (`LOCAL_DATA=made-up-database` today, staging and production once they may serve), the public home, schedule and standings pages refused with `NotOnTheDatabaseYet`. The lead split step 2.93 (2026-11-15): part 2 is the public schedule and the standings, which show teams only and no person; part 3 the statistics and the team pages, which show names and must read who sees them from the league itself (step 2.126, T-81). The two ports these pages use do not follow that line: `publicStats` serves both the standings and the statistics, and the home page reads the leaders (people) beside the standings.

## What

- **`publicSchedule` is database-backed** (`apps/web/src/server/database-public-schedule.ts`): `clockOf` reads the league's time zone (`findLeagueTimeZone`, new) and works out its today with core's own `dayIn`, at the ports' clock; `scheduleOf` is `listPublicSchedule` (step 2.39); `gameFactsOf` is `findPublicGameFacts` (new), one row as the port asks. An id that is not a UUID is no row and is asked of no database.
- **`publicStats` is database-backed for the standings only** (`database-public-stats.ts`): `seasonsOf` is `listPublicSeasons`, which now also gives each season's id; `readStoreOf` answers the five reads the standings and a team's record make (season, teams, divisions, standings rows, adjustments) through packages/database's `standingsReadStore`, each in a transaction set to the page's league. The six statistics reads and `settingsOf` (the name policy and audience) refuse with `NotOnTheDatabaseYet` until part 3. The home page already leaves its leaders out when their read fails, so on the database it shows its games, numbers and standings without leaders; the statistics and team pages show the error page as before.
- **The members' start page is database-backed** (`database-public-teams.ts`): the league home reads it before anything else (`start-redirect.ts`), so the home page needs it. `startPageOf` reads the league's own `members.startPage` value (`listSettingValues`, already in the two-league test) through core's `lookupSetting`, as the stand-in does. The team pages' `rosterOf` and `teamIdsOfAccount` show people and refuse until part 3; for a visitor the home page never asks for them, and a league whose start page is "my team" sends a member to a team page, which still shows the error page.
- **No port changed shape.** `NotOnTheDatabaseYet` moved to its own file (`not-on-the-database-yet.ts`) so both new files can refuse without importing `database-ports.ts`; `database-ports.ts` still exports it.
- **What a visitor sees matches the stand-in:** only running and finished seasons, never one in set-up or in the bin; no game in the bin; a game's facts only in its own public season. Each new query carries the league id and is in the two-league test.
- **The made-up database can hold seasons under way.** `madeUpDatabase({ underWay: true })` (`packages/database/src/seed/seed-season-under-way.ts`) opens each seed league's current season and, through the product's own commands as the league's owner, publishes a schedule (in each division a game a week ago and one a week on, by the league's own today), records the played game's final score and lets the standings handler rebuild the table. The web app's local mode on the made-up database asks for it, so its pages have something to show; every other user of `madeUpDatabase` keeps the season in set-up as before.
- **Browser test:** `tests/browser/public-pages-on-database-test.mjs` starts the built app with `LOCAL_DATA=made-up-database` and reads the home, schedule and standings pages of both seed leagues; the stand-in's pages stay covered by the existing browser tests.

## Considered

- **Moving all of `publicStats` now, statistics included.** The statistics need the name policy read from the league's own settings and audience (2.108's note on step 2.93); that is part 3's.
- **Writing games and standings rows into the seed by hand (SQL).** Rows the product's own commands and handlers make are the ones the pages must read; hand-written standings could disagree with how they are rebuilt.
- **Putting every seed season under way by default.** Many database tests start from the seeded season in set-up; an option keeps them as they are.

## Revisit if

- Part 3 moves the statistics and the team pages: `settingsOf`, the six reads, `rosterOf` and `teamIdsOfAccount` move, and the home page's leaders appear on the database.
- The seed leagues gain venues or rounds: the seeded games could use them.
