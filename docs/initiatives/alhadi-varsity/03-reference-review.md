# Faraj and schedule reference review

[Initiative index](README.md) · Inspected October 27, 2026

## Faraj behavior reviewed

Reference: [mrsaiyed/faraj-league](https://github.com/mrsaiyed/faraj-league), fetched `origin/main` at commit `38b18f0446837e916dca1243a2c961db6b205a26`. The reference checkout's working tree was not reset. Review used that commit's files rather than assuming the older local checkout represented the current scorer.

| Source                                         | Observed behavior                                                                                     | Decision for the platform                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `lib/game-tracker.js`                          | Event-derived score, five-player lineups, substitutions, clock, fouls, made 1s/2s/3s, playing seconds | Reimplement pure rules with explicit schemas and deterministic tests                 |
| Tracker saved stat values                      | Points, `1s_made`, `2s_made`, `3s_made`, fouls, rounded whole minutes                                 | Preserve this initial stat scope; persist integral durations before display rounding |
| `lib/game-rules.js`                            | Rule/preset behavior separate from interface                                                          | Keep format snapshot per game; do not assume Faraj presets are TCSAAL rules          |
| `admin/js/autosave.js`                         | Serialized saves, retries and local recovery                                                          | Keep explicit save feedback; add transactional idempotent server commands            |
| `admin/js/game-log-store.js` and migration 013 | Durable game log support in current source                                                            | Acknowledge existing log persistence; new platform uses ordered accepted events      |
| Admin game stats save path                     | Individual stat upserts followed by score update                                                      | Commit event, score and line projections together; no partially updated record       |
| Undo and clock correction                      | Undo cursor/redo tail; clock changes can restamp event timing                                         | Append reversals and preserve original accepted evidence; flag affected minutes      |
| Public polling                                 | Frequent score refresh and slower broader state refresh                                               | Start with bounded snapshots; scale spectator distribution separately                |

Faraj already saves minutes and supports game logs. The new design improves precision, ownership, transaction consistency and recovery rather than claiming those functions do not exist. Rebounds/assists/steals/blocks/turnovers and shooting attempts were not part of the reviewed tracker catalogue; they are later additions, not claimed copied functionality.

The new rehearsal covers the central scoring interaction but is not complete Faraj parity: full undo/redo, bonus/advanced foul rules, roster editing within a started game, historic minute repair and public fan pages are not implemented. Shared-password admin patterns, service credentials and existing database data were not imported.

## Current schedule evidence

**Update, October 27, 2026:** at the founder's direction the 2026–27 schedule was copied from the [Al-Hadi varsity boys team page](https://texascharter.org/tc_team/26-27-al-hadi-school-varsity-boys-basketball/) (division ETXBBVB5, ten games) into the [live stat tracker](04-live-stats.md). The review below describes the earlier state.

The official [TCSAAL schedule page](https://texascharter.org/league-schedules/) supports region/sport/division/season/team filters. The initial generic page did not establish a current Al-Hadi team-specific schedule. The [school basketball page](https://www.alhadi.com/athletic/basketball.html) describes TCSAAL participation but contains historical season information; it is not a current roster source. Search also surfaced a prior-season Vensport competition, which was not imported.

The founder will supply/enter confirmed details later. The mock therefore links to the official schedule and accepts manual dates/venue/source URL; it does not claim automatic synchronization. Before adding an adapter, verify exact current-season team identity, allowed access, stable external IDs, time zone and cancellation/rescheduling semantics. Save source/provenance and require review of imported changes. Never let a subsequent feed overwrite a started game's reviewed roster or locally corrected result.
