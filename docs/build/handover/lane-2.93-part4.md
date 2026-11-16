# Lane 2.93 part 4: Season settings and the schedule admin on the database

- **What it is:** on the database, Admin → League settings, Admin → Season settings ("Who can see this season") and Admin → Schedule (the grid: drafts, games, rounds, publishing) now run on packages/database's own stores instead of refusing. A new query, `listLeagueSeasons`, lists every season staff may be told of, and the port applies `mayListSeason`, reading the holder again for the league it lists. The seed's Lakeside gains a second program, Summer Camp, and a scheduler limited to it. No migration.
- **Proofs:** the query has its unit test and a two-league case, each shown to fail with the league filter removed. `database-admin-ports.test.ts` runs every command these screens send, through the database ports, for eight people. Hiding a season takes it off every public read, and showing it puts it back.
- **Reviews:** the independent code review and the area 5 lead's review are both closed, and their one round of fixes is done (commits 7fd936f7, a11123e2, ec943a23, 603eb626). GitHub passed 603eb626 twice.
- **Last merge (c03dec2d)** with build/stage-1, after steps 2.187, 2.103 and 2.36:
  - `database-ports.ts`: the build branch's league-sites import, with `DesignReport` and `reportDesign`, is kept, and this lane's admin-settings and schedule-admin ports stay in their alphabetical places.
  - `seed-leagues.ts`: the seed leagues' designs (step 2.187) are kept, along with this lane's second program, written inside the league's own transaction. The header comment now says both.
  - The checks, the typecheck and the four named test files passed after the merge.
- **Left:** GitHub twice on c03dec2d, then landing.
- **Left after that:** the browser journey on the seeded database. It needs the seed's owner and staff able to sign in there, which waits for step 2.96.
