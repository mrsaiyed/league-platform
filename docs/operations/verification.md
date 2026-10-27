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
