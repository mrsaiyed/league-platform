# Varsity MVP: behavior and acceptance

[Initiative index](README.md) · Version 0.1 · October 27, 2026

## Product boundary

**VAR-01 — Team-managed participation.** The customer manages one team's records in an outside competition. TCSAAL is an external competition/source, not an assumed customer, workspace administrator or integration partner. Our team results must not claim to be governing-body official results. A team record can exist without controlling admissions, the opponent's organization or the competition schedule.

**VAR-02 — First outcome.** A scorekeeper prepares a game, records it on a computer, reloads without losing acknowledged work, reviews the final box score and sees consistent game/player/season totals without retyping statistics. This must work before website-builder expansion, registration, payments, a draft, awards, newsletters or a native app. Those remain platform capabilities with separate gates.

**VAR-03 — Roster and fixtures later.** The founder has deferred supplying actual players/numbers and the exact current-season team link. Do not substitute players identified from photographs, stale schedules, assumed dates or invented competition rules. A practice environment uses explicitly synthetic records. The existing team photograph is branding, not evidence of current eligibility or roster membership.

## Operator journey

| Stage         | Required behavior                                                         | Current rehearsal                                                              |
| ------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Team setup    | Persist names/numbers with stable IDs; later games reuse roster           | Implemented, 30-player bound; 0 and 00 distinct                                |
| Fixture setup | Opponent, tracked home/away side, date/time, venue, source reference      | Manual entry; missing dates remain unspecified                                 |
| Pregame       | Enter opponent jerseys; optionally names; snapshot rules and both rosters | Implemented; one opponent identity per game                                    |
| Lineups       | Choose distinct players on each side; identify bench                      | Implemented; 1–5 for rehearsal; live-game eligibility policy still to validate |
| Live scoring  | Select jersey, record +1/+2/+3 and personal foul, substitute              | Implemented; keyboard shortcuts plus buttons                                   |
| Clock         | Start/pause, bound at zero, next period/OT, controlled corrections        | Implemented; timing correction marks minutes for review                        |
| Review        | Compare team score to player points and confirm appearances               | Implemented; scorekeeper manually checks against official score                |
| Final record  | Freeze ordinary edits and include final record in season totals           | Implemented locally; reason required to reopen                                 |
| History       | Retain accepted commands and correction evidence                          | Implemented locally; production actor/result versioning still required         |
| Publication   | Safe public team/game/stat views with deliberate publication policy       | Deferred; local views are operator previews, not protected/public roles        |

The browser's clock mirrors the game clock, not a hardware scoreboard connection. The operator must pause for actual stoppages and confirm discrepancies. A browser tab being hidden does not pause a real game.

## Statistical contract

**VAR-04 — Initial stat catalogue.** Track points, made 1s/2s/3s, personal fouls, current-period team fouls, participation and playing duration for both sides. Match the reviewed Faraj baseline. Misses, shooting percentages, assists, rebounds, steals, blocks, turnovers, bonus, technical/team fouls and automatic foul-out enforcement are not implemented. Missing fields must not appear as measured zeros.

**VAR-05 — Points.** `PTS = 1s + 2 × 2s + 3 × 3s`. Each side's displayed score sums its player points. Only on-court players receive score/foul commands in the rehearsal. Undo appends a reversal of a specific basket/foul; repeated reversal fails. It does not erase the original database event. Team-only adjustments require a future explicit event type and reconciliation rule.

**VAR-06 — Appearance.** Starting the clock marks current on-court players as participants; substitutions and accepted player actions also record appearance. Merely selecting a pregame lineup does not count. Zero-point appearances count toward GP; bench-only players do not. Display DNP only after finalization. A roster member removed from later rosters retains prior game records.

**VAR-07 — Minutes.** Store integral milliseconds, not rounded whole minutes. Accrue time to each active player only during a running game-clock interval, capped at the period boundary. Substitute after accruing the outgoing stint. Add durations before rendering `MM:SS`. Conservation oracle: sum of player durations equals the integral of active lineup size across the captured clock intervals, separately for each side.

Manual midgame clock correction currently marks the entire game's minute quality `review-required`; points/appearances remain usable, but affected minutes are excluded from the season-minute sum and shown with a coverage marker. A future reviewer must be able to reconcile specific stints before marking minutes verified. Never silently infer correct minutes by shifting old event timestamps.

**VAR-08 — Season scope.** Rehearsal totals aggregate the current local workspace's finalized, non-practice tracked-team game lines with `appeared=true`. GP is appearance count; PPG is points/GP; no records display a dash. The preview has one implicit team season only. Do not enter a second season into the same data directory; production must introduce explicit team-season IDs and selectable scope before multiple seasons are supported. Opponent totals remain in each box score and are not merged across games by jersey/name.

**VAR-09 — Corrections.** Finalization requires a paused, started game and manual review. The preview allows early finalization and ties; it does not certify completion under TCSAAL rules. Reopening requires a reason, removes that game from season totals, allows correction, and then refinalization replaces its contribution once. Canceled, forfeited, suspended, incomplete and abandoned games need explicit production outcomes and coverage policy before use.

## Reliability and interaction

**VAR-10 — Acknowledgement.** Controls show saving state; a stable command ID is stored before transmission. An uncertain save blocks further scoring until retried or deliberately discarded after reviewing the server log. A repeated ID with identical payload has one effect; changed payload conflicts. A stale revision requires refresh/review, not a silent overwrite.

This preview keeps one pending command in browser storage; it does not promise disconnected scoring. The authoritative accepted records live in SQL. A device/browser failure can lose unsent work. Reload recovery is tested; long offline queues, scorer takeover and authentication expiry are future hosted-release requirements.

**VAR-11 — UI.** Keep burgundy accents, white panels, clear jersey targets and a quiet background. The scorer prioritizes scoreboard, clock, selected player and primary actions. Avoid unrelated registration/admin tools on the game-day screen. All user-provided labels must be escaped. Small screens may horizontally scroll a stats table but must not overflow the page. Announce saved/error state and ensure visible keyboard focus.

**VAR-12 — Practice.** Practice is permanently excluded from totals, even when finalized. Synthetic players never populate the saved varsity roster. Practice cannot be converted to a real game by changing its label. Tests use a separate disposable database.

## Production acceptance gate

Before making this the team's primary scorer, demonstrate all of the following on the actual scorer laptop:

1. Authenticated owner/scorer roles, assigned game scope, revocation and cross-tenant denial using real database roles.
2. A complete verified game format, overtime, substitution, zero-point appearance, injury/short lineup, correction and exceptional ending.
3. Refresh, tab sleep, server restart, connection loss, dropped acknowledgement and conflicting second device without missing or duplicate acknowledged plays.
4. Single scorer lease with controlled takeover; stale device submissions rejected and preserved for review.
5. Correct minutes or visibly incomplete coverage after every clock correction; review blocks unsupported official certification.
6. Team/season/game views all use the same accepted result revision. Official external score discrepancies are explicit.
7. Backup restore to a separate environment and a usable export/manual fallback, with measured recovery limits.
8. School-approved data visibility and photographer/identity permissions; operator-only data never exposed in public DTOs.

Actual roster, current season, game rules and source link are inputs needed before a real-game release, not blockers for the current practice workflow.
