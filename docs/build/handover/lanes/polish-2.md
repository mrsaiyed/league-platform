# Lane polish-2: what a league's owner winces at on a phone (handover)

## Finished (2026-11-22, 2bf213e)

- Fixed the web-exit-test failure: a statistics table on a phone takes fixed 60-wide columns only when its number columns do not all fit beside the name (at 44 or more each); a table that fits shares the room out, with no scroll and no "goes on" sign (table-css.ts, `--ui-share`).
- Admin box score at 390: every count column 64, the name column takes the leftover (`mod`), so Player, Played, MIN, PTS are whole at rest and nothing is half cut (staff-pages.css; seen in a picture).
- Passed one by one: web-exit (332), true-notes (253), public-pages-on-database (108), demo-league-on-database (322), people-screens (97), first-test-walk (47), saves-keep (102); check, format, typecheck, vitest page-pieces. Pictures at 390 (standings, stats, home) and 1280 (standings) looked at; 1280 unchanged.

- P1 done (e6298e6): at 390 every division's table shows place, team (wraps to two lines), W, L, PCT (the points in a points table) with no scroll; GP is left to the wide layout; PF, PA, DIFF, STRK scroll inside the box from its edge, team column fixed; every division has the same columns in the same places (a tie anywhere gives every table T). Home small tables: place, team, W, L, PCT, nothing cut. Rule follows the page width (<=480), so 1280 is unchanged. Unit test in packages/ui/src/page-pieces.test.ts.
- P2 done in the same commit, BUT see "Not finished": number columns one width (60) and the name column 40% of the box plus the leftover, so name, GP, PTS and 3PM are whole at 390 and nothing half cut. The uncommitted follow-up (sortable-stats-table.tsx `--ui-cols`, table-css.ts `max(...)`) lets a table whose columns all fit give the name the rest.
- P3 done (2c66fb6): admin box-score grid names wrap instead of "…" (staff-pages.css). NOT seen in a picture (signing in as the made-up owner in my picture script did not work; see .local/p2-shots.mjs). The "last column clipped" was not looked at.
- P4 done (114d14f): "1 game to play" / "Games to play" (plural message), and "Waiting for a new date" over a list of only postponed games; tests in build-home-numbers.test.ts and home-lists.test.ts.
- P5 done (696245f): "On <team>" with links "Its page in Teams" and "Its public page"; picker "Add to another team" ("Add to a team" when on none), starts on "Choose a team", required; one full stop after "Marcus O.". people-screens-test updated to the new words and checks the picker.
- P6 done (008d53a): empty league list says "Nobody is in the league's list yet. Add a new player with the form above." No test of its own; not seen in a picture.
- Pictures (git-ignored): .local/shots/polish-2/ in the lane folder (before-standings, after-standings, after-home, after-stats at 390). Admin pages not pictured.

## Not finished (the lane hit its 80-command limit)

- web-exit-test FAILS: "the sign that a table goes on shows only while columns are out of sight" needs at least one table that fits at 390 on /harbor-city/standings or /harbor-city/stats; now all three go on. Cause: P2's fixed 60-wide number columns (and/or P1's scrolled PF..STRK). Fix to try: in the @container 30rem `.ui-stats` block use a narrower `--ui-num-col` (48) or apply the fixed widths only when `--ui-cols` columns do not fit; or have the standings table drop the fixed widths when it has no scrolled columns. Re-run web-exit-test.
- Not run because web-exit-test failed first in the chain: true-notes-test, public-pages-on-database-test, demo-league-on-database-test, people-screens-test. Nothing was pushed.
- Ran and passed: npm run check, format:check, typecheck (before the last uncommitted change), vitest page-pieces, display, game-pieces, build-standings, stats-pages, home-lists, build-home-numbers, stand-in-admin-teams, packages/site/src/messages. Merge of origin/build/stage-1: already up to date.

## Seen at 390

- /larkvale/standings: the level-teams notes under each table are long paragraphs; readable but heavy.
