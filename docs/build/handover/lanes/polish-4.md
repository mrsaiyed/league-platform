# Lane polish-4: tables cut off at the right edge on a phone (handover)

## Finished (2026-11-23)

- Standings and the home page's small standings (same component): the last column in view (PCT, or the points) is `--ui-last-col`, wide enough for five figures in the table's own face plus the fade's width (`5ch + 6 * step-1`, a registered `@property` so headings in the small face do not work out a narrower one); it no longer grows by 4 px and stands half out of the box. GP, left out of its place on a phone, is now drawn a second time straight after PCT (`ui-moved`, shown only below 30rem), one scroll away instead of not drawn at all. Files: packages/ui/src/standings-table/standings-table.tsx, packages/ui/src/styles/table-css.ts.
- Statistics: in a table that goes on, number cells keep the fade's width clear at their end (figures step-4, headings step-3, taking step-1 from the start so "PTS ▼" fits), chosen by `--ui-too-many`/`--ui-few`, so 3PM is whole and unfaded. table-css.ts; page-pieces.test.ts accepts that pick between two steps (still only steps).
- Admin game page: below 48rem each count column is 76 (box at its start, step-4 clear after it) and the name column's least is 6rem, so Player, Played, MIN and PTS are whole at rest and PTS's box is not under the fade. apps/web/src/app/[league]/admin/staff-pages.css.
- Check added: tests/browser/simulated-league-test.mjs `clippedCells` — at 390 on home, standings, statistics and the admin's typed game page, every cell is on the screen or in a box that scrolls; none half in view at that box's edge at rest; none with words or a text box within 12 px of the edge while the box goes on (the fade). It failed on standings and home before the fix.
- Pictures: scripts/first-look/look.mjs takes 28c-admin-divisions-phone.jpg and 28d-admin-venues-phone.jpg (sim mode, phone); both entries with captions in scripts/first-look/index.html.
- polish.md: line 61 removed; the home line keeps only its "next matchups" part.

## What I ran

- Passed: npm run check, typecheck, prettier on changed files, vitest page-pieces (44), simulated-league (83), web-exit (332), public-pages-on-database (108), demo-league-on-database (322), true-notes (253), saves-keep (102), one-world (27); `look.mjs sim` once, nothing skipped.
- Looked at (390): statistics before, standings, admin game page, divisions, venues after. Statistics not looked at after the fix (measured: 3PM 313–373, clear of the fade).

## Left

- At 390 the standings' team column is about 12 px narrower than before, and two long one-word names now break inside the word ("Glimmerston/e", "Marrowbroo/k"). Worth a look: a narrower place column, or hyphens.
- The venues page on a phone is 29,000 px tall (one whole form per venue, as the roster was): its own polish line.
- The home card now goes on to GP too (the fade and arrow show); nothing was merged from build/stage-1 and nothing was pushed (the lead pushes).

## Fix round

- Team column on a phone: never below `11ch` plus its shield and paddings (`--ui-name-least`, registered); too narrow for that (320, 360 here), the percentage (or points) joins the scroll at the box's edge, the column before it keeps the fade's room (`ui-next-to-last`) and the name takes the rest; number columns 36 (step-6 + step-1), place 48 (step-7). Names wrap only between words. The home card leaves GP off on a phone (`narrow: 'wide-only'`), so at 390 it fits with no scroll.
- simulated-league-test: home, standings, statistics must have a table; `clippedCells` at 320, 360 and 390 (and the admin game page at all three); new `brokenNames` check (no word of a team name over two lines) on standings and home at 320/360/390. It failed on the old CSS (Marrowbrook etc. broken at all three widths) and passes on the new. web-exit's long-name share at 320 raised from 50% to 55% (the name keeps the percentage's room).
- Ran, all passed: vitest page-pieces (45) and schedule-pages, npm run check, typecheck, prettier on changed files, simulated-league (116), public-pages-on-database (108), web-exit (332). Looked at standings 320 and 390, home 390.
