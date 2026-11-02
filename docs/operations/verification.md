# Concept verification — October 7, 2026

Completed locally against the repository source and generated portable artifact:

- JavaScript syntax, all 10 module references, required local assets, and the intentional no-network boundary passed.
- All 13 domain/fixture tests passed: box-score reconciliation, playing-time totals, zero-point appearances, DNP handling, standings, draft order/limits/duplicates, round robin, byes, and clock behavior.
- Formatting checks passed with the pinned Prettier version.
- The portable HTML opened and ran in installed Chrome with no external requests or JavaScript page errors.
- All 17 routes were checked at desktop width 1440 and phone width 390, with no horizontal page overflow. Tables and navigation may scroll within their intended containers.
- Browser interactions passed for simulated signup/payment, the pending applicant's personal page, application search and approval, draft selection/undo/reload, schedule generation/publication, scoring/undo/clock/substitution, optional navigation, notification read state, and email-preference persistence.
- A local HTTP check returned 200 and loaded the modular source, assets, and commissioner settings with no failed responses or page errors. The owned preview server was stopped afterward.
- Desktop and mobile presentation screenshots were visually inspected. A layout regression found during formatting was corrected by giving the commissioner layout a complete template and checking that page content belongs inside its main region.

These checks validate the concept, not production security, live payments, email delivery, school authorization, accessibility certification, database isolation, or production load. The initial source passed GitHub Actions and the owner subsequently published it on GitHub Pages. Current runs and deployment status are visible in the repository Actions tab.

## October 8 presentation update

The AHS photography and Around AHS route passed 18 desktop and 18 mobile route checks, existing interaction checks, all 13 domain tests, formatting, and the portable build. The presentation capture verifies that every image decodes before exporting eight screenshots. Real photographs remain separate from fictional player records. No production functionality was added.

The follow-up presentation revision changes the homepage and commissioner branding preview to the latest team photograph. The capture script now exports 12 images, including dedicated schedule, standings/results, and statistics crops. The v6 proposal has 11 pages, with website screenshots on pages 6-8.

## October 27 varsity scoring rehearsal

The separate local varsity app passed `npm run verify`: strict TypeScript, all 29 test assertions/subtests reported by Node, formatting, the preserved demo checks and its portable build. New scoring/database tests cover exact duration arithmetic, zero-point appearances, DNP, stat reversals, atomic rollback, idempotent retries, conflicting writers, workspace-scoped queries, practice exclusion, finalization/reopening and persistence after database close/reopen.

`npm run test:varsity:browser` passed in installed Edge with an isolated temporary database. It exercised roster entry, reload persistence, opponent setup, lineups, scoring, a committed response deliberately lost before acknowledgement, pending-action recovery after reload, finalization and automatic season totals. HTTP origin rejection and desktop/mobile overflow checks passed. Generated overview, scorer and mobile screenshots were visually inspected. The user preview retains an empty real roster and no fixtures; browser tests do not populate it.

The preserved intramural browser suite also passed 18 desktop and 18 mobile routes, critical interactions, reload recovery and its zero-external-request boundary. A documentation check found no broken links across 129 local links and no duplicate requirement headings in the active documents checked.

These results validate the local rehearsal only. They do not establish hosted authentication/RLS, a scorer lease/offline queue, TCSAAL rule certification, public-data approval, production load or backup/restore readiness. See the [current scope and release gate](../initiatives/alhadi-varsity/01-mvp-contract.md).

## October 27 hosted shared-SQL publication

The private scorer was deployed successfully at https://alhadi-varsity-scoring.fairstone8.chatgpt.site through Sites. The deployment uses project `appgprj_6ae0e7332aac81919a0be341d1d0e62b`, provider source commit `dc3fa21bf82ddc9e81c70fc983efde2d425cbabb`, saved version 1 and deployment `appgdep_6ae0ea9840b081918a8f8106e606e2a6`.

Live verification created a labeled practice game, saved two lineups, started the clock, recorded a two-point basket, replayed the identical command and paused. A fresh API read returned score 2 with revision 5; the exported log contained exactly 5 events. Independent native database inspection confirmed 5 event rows, 12 player stat rows and a total of 2 saved points. The real roster remains empty, and practice does not enter real season totals. No credential values are recorded here or in source.

The root suite now passes 30 tests/subtests plus TypeScript, formatting and the preserved demo build. The hosted app passes its own TypeScript check and production build. Its browser rehearsal against local Miniflare D1 confirmed that a fresh browser context with empty localStorage reads the same saved game. The hosted SQL test verifies event/state/stat rollback when a projection insert fails. CI includes the shared checks/browser suites and a separate hosted build job.

This proves online shared persistence for the initial owner-private module. It does not certify general staff permissions, public fan views, multitenant isolation, full sport rules, offline takeover, disaster recovery or production-scale workloads. The cross-computer handoff and current product specs preserve those boundaries.

## October 27 live stat tracker

The Faraj-style live stat tracker (`apps/live-stats`) passed `npm run verify` with 66 tests: 14 engine tests (scoring, fouls and −Foul, bonus per quarter or half, substitutions, minutes, clock set-back, undo/redo, period changes, final/reopen, reset), 19 storage tests (the same six behaviours run against the in-memory document adapter, embedded PostgreSQL and PostgreSQL reached over the network through `pg`, plus a PostgreSQL table check) and 3 server tests (refuses to start online without a passcode, sign-in, forged and expired sessions, wrong-passcode limit). GitHub Actions passed on `main` at commit `63e6ba9`.

`npm run test:stats:browser` passed in installed Edge with its own throwaway database. It entered both rosters through the Players panel, picked lineups by tapping, scored through the player menus, substituted by tap and by drag, lost a saved response on purpose without double counting, watched a second page update live, used undo/redo and reload, set the clock, ended the game and checked the schedule and season totals. It checked desktop, phone portrait and phone landscape with no sideways page scrolling. In online mode it signed in, refused a wrong passcode, kept a tap made after the sign-in expired and sent it after signing in again, and confirmed watching needs no sign-in. Its screenshots were inspected.

By hand: the server was killed mid-game while the tracker kept scoring; after a restart (which cleared the stale lock by itself) every queued action landed once and earlier records were intact. A production-only install (no development packages) started in online mode and served the schedule and pages. The 2026–27 schedule was copied from the TCSAAL team page and each game page was opened to record its number and type.

Not yet verified: building the Docker image (no Docker on the build computer), a real Supabase database and host, a full real game on the scoring laptop, and TCSAAL's game format.

## November 2 live stats: game-ready and Supabase-ready

Two save gaps were found by driving the tracker in a browser and are fixed: a player typed into the Players panel without pressing Enter or Add was lost when **Done** was tapped, and a save request that never answered (as on weak gym Wi-Fi) left the tracker on "Saving…" forever with every later tap stuck behind it. Each now has a browser check. Requests give up after 12 seconds and retry; a tap is only dropped when the rules refuse it. Hosted database connections now time out instead of hanging, and broken ones are discarded.

`npm run verify` passed with 74 tests, including: the same storage tests against all three adapters, now with team and player game logs; a server killed with SIGKILL straight after a confirmed tap, restarted with nothing lost (run five times); Supabase's `anon` and `authenticated` roles locked out by privileges and by row-level security while a non-superuser owner, as Supabase's `postgres` is, keeps working; connection-string advice; and copying games up to PostgreSQL reached over the network through `pg` (teams matched by slug, a separately entered player matched by number and name, every recorded action and box score line carried over, then caught up, left alone when further along there, and conflicts refused unless `--replace`), and back down to a folder as a backup.

`npm run test:stats:browser` passed in Chromium with the new steps: quick-adding numbers, a player saved by **Done** alone, lineup picks kept across a reload, the pre-game prompt, a request that never answers being saved once, the play log's "all saved" count, and the team and player game logs. Screenshots were inspected, including the pre-game prompt at desktop and phone width.

By hand: `npm run stats:db-check` and `npm run stats:copy` were run against PostgreSQL over the network standing in for Supabase (placeholder password and missing URL rejected with advice; a game tracked through the local server copied up, a second run copying nothing; the tracker then served the copied game, record and game logs from it; and a backup copied down to a folder). The copy refused to run while the local tracker had its database open.

Not yet verified: a real Supabase project (none exists yet), the Docker image, a full real game on the scoring laptop, and TCSAAL's game format.

### Turnovers

Turnovers were added as a player stat (the **TO** option), shown as each team's total in its title with a per-player breakdown, and not on player tiles. `npm test` covers the engine (per player and team, taking one back, undo, no effect on score, fouls or bonus), every storage adapter (season totals and both game logs), a database made before turnovers gaining the column with earlier lines counting none, and turnovers copying up to a hosted database. The browser check taps TO, confirms the tile is unchanged and the team totals and breakdown are right, takes one back from the breakdown, and finds the TO column and totals on the game page and in a player's game log. Desktop and phone screenshots of the menu and breakdown were inspected.

## November 2 GitHub Pages site on Supabase

The live stats now run as a static site on GitHub Pages (`npm run build:pages`), saving to Supabase from the browser through database functions (`002-api.sql`), with the concept demo moved under `/demo/`. `supabase/setup.sql` sets a project up in one paste.

`npm test` passed with 85 tests, including: the full shared storage suite run against the Supabase adapter through a stand-in for Supabase's REST API (PostgreSQL as the `anon` role, named-argument function calls, API-key checks, `PTxxx` status codes); `setup.sql` being current, safe to run twice and setting up the same schedule as the server's own seeding; and passcode sessions (none set, wrong passcode, the 20-in-15-minutes limit, expired and unknown sessions refused with nothing written, a new passcode signing every device out, the passcode setter unreachable through the API, a wrong project key reported as such). A database user without permission to create functions in `public` still gets the tables.

`npm run test:pages:browser` passed in Chromium against the built site served under `/league-platform/`: the secret-key refusal, sign-in, rosters by name and by quick-add, a game tracked with baskets, a turnover, a foul and a substitution, the connection cut mid-game with two taps held and then saved once each, a signed-out phone following along by polling, reload, End game, the team and player game logs, the demo under `/demo/`, sign-out, and the "not connected yet" message without a project. Screenshots were inspected. The server-mode browser check still passes.

Not yet verified: a real Supabase project (the REST API and dashboard steps follow Supabase's documented conventions, but none exists yet), and a full game on the scoring device.

### Team turnovers

Turnovers charged to the team rather than a player (**+ Team turnover** in the team's turnover list, with − to take one back) count in the team's total, the box score total with a note, the play-by-play and the team game log, and never in a player's stats. They need no new column: they are plays in the game state, and the static site's game lists keep them. Tests: the engine (counting, taking back, undo, descriptions), the team game log on every storage adapter including Supabase, and both browser checks. The site can also take its Supabase address and public key from a committed `supabase/site.json`, with the secret-key refusal applying there too.
