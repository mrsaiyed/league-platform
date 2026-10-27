# 08 — Game operations, results, and statistics

[Specification map](README.md) · Status: proposed sporting-record contract · Decisions: D-18–D-19

**Detailed engineering contract:** [Live operations specification](engineering/06-jobs-live-and-publication.md) defines event batches, clock/stints, offline recovery, result versions and projection activation.

## Capture modes and authority

**GS-01 — Supported modes.** Competition/game configuration selects final score, submitted box score, live event capture, or an explicitly approved external provider. For hosted competitions, every mode produces an official result through the same reviewed revision boundary. In team-managed external-competition mode, it produces a reviewed team record with explicit provenance; it cannot certify the external host's official result. Require only fields justified by that mode. A score-only match can count in standings while player appearances/minutes remain unknown. A feed cannot silently replace an approved correction; field authority and provenance are explicit.

**GS-02 — Game lifecycle.** Proposed states: scheduled, ready, live, submitted, finalized; postponed, canceled, abandoned and forfeited have explicit sporting effects. Pregame snapshots record rules/capture version, competitors, roster eligibility and staff assignment. Submission validates completeness and discrepancies; finalization is a separate permission. Results retain official revision, actor, source, timing and reason for corrections.

## Live basketball contract

**GS-03 — Events.** Validated envelopes include game, command ID, expected revision, scorer session/fencing token, event schema/type, clock context and payload. Server assigns sequence and receipt time. Bounded batches commit atomically with projections, audit/outbox and unique event identities. Retries return the previous outcome; mismatched payload under one key conflicts. Do not sort authoritative history using device timestamps.

**GS-04 — Clock.** Persist running/paused anchors, period, remaining/elapsed time and revision at transitions, not a database write every second. Display reconciles monotonic elapsed time against authoritative anchors. Backgrounding a browser is not a real-game pause. Detect invalid timing and require controlled review. Period/clock corrections preserve source values and reconcile affected stints. Exact clock, timeout, foul and overtime rules belong to the selected basketball preset.

**GS-05 — Appearance and minutes.** Track lineup stints and integral game-clock duration. Validate distinct eligible on-court players, supported lineup size, nonnegative elapsed time, transitions and period bounds. Sum known intervals before rounding. Player time reconciles with active lineup size over recorded play, including logged short-handed segments. A zero-point appearance counts; a missed game is DNP; unknown minutes are null. A brief appearance with zero rounded minutes is still an appearance.

**GS-06 — Durability and handover.** Show device-pending, server-acknowledged and public projection status separately. A single authoritative scorer lease/fencing token prevents competing tabs from mutating the game. Short offline periods can use a bounded persistent local queue after online authorization; device loss/storage clearing can still lose unsynced work. On reconnect, validate lease and contiguous sequence. If another scorer took over, preserve rejected work for review; never merge it silently. Require all pending work to resolve before official finalization. Provide a controlled export/manual fallback and avoid forced app updates during scoring.

## Results and derived records

**GS-07 — Finalization/correction.** For complete point-capture modes, team score reconciles with player points plus explicit supported team adjustments. In partial modes, mark gaps rather than fabricate data. Commit immutable result revision and consistent official projections or a versioned publication snapshot. Corrections append reason and new revision, refresh tables/reports/caches, and create downstream qualification tasks where automatic propagation is unsafe.

**GS-08 — Statistical definitions.** GP counts verified eligible appearances. Points/averages aggregate a declared season/competition/stage/category and source set. With complete point data, PPG is points/GP; zero GP displays a dash. With mixed coverage, show known GP, point-recorded GP and coverage; average only records with the required metric and label it accordingly. Do not divide incomplete point totals by all appearances or present unknown as zero. Distinguish live provisional totals, finalized records and editorial rankings.

**GS-09 — Standings and archive.** Version outcome points, ordered tiebreakers, tied-group head-to-head rules, caps and special outcomes. Publish the rule used. Archive retains configurations, participant snapshots and result provenance while supporting authorized correction and privacy takedown. Cross-season records require consistent identity links and metric coverage. New-season templates copy selected structure, not old consents, payments or eligibility approvals.

## Acceptance and next detail

Rehearse a whole game with substitution, zero points, overtime, clock correction, background/reload, outage, takeover, submission and correction. Separately ingest a score-only result and confirm it adds no fake player GP or minutes. Test a two-appearance player with point records for only one game: the UI cannot show the incomplete total as a complete two-game average.

The engineering live contract now defines event envelopes, clock/lease rules, local queue bounds, reconciliation, lineup conservation, immutable results and projection publication. Implementation completes the full basketball event/rules catalog, compiled reducers, device UI and special-outcome/stat fixtures, then proves them in full game rehearsals. Additional sports require dedicated adapters and tests.

## GS-10 — First stat slice and authority coverage

The active [varsity MVP](../../initiatives/alhadi-varsity/01-mvp-contract.md) implements the central Faraj-style points/made-baskets/fouls/lineups/duration workflow before the complete website and enrollment product. Its local database prototype proves a limited behavior set, not every production GS requirement above. Hosted permission, lease/offline recovery, immutable public result revisions, verified rules and clock/minute repair remain release gates.

The reviewed Faraj tracker already persists minutes, but rounds to whole minutes. Preserve exact durations in the new core. Do not invent tracked rebounds/assists/attempts that the initial catalogue does not capture. Player/season projections must disclose scope, source authority and metric coverage; external team records stay separate from host-official standings.
