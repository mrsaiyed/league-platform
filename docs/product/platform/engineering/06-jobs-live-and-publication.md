# 06 — Durable jobs, live scoring and consistent publication

[Engineering map](README.md) · Refines AT-03–04, GS-01–09, ME-01–08, RQ-02–04

## E-LIVE-01 — Transactional outbox and job lifecycle

When a command commits, its business state, audit and outbox event commit together. An outbox dispatcher inserts jobs using a unique `(handlerKind, eventId)` dedupe key, then marks the event dispatched in the same database transaction. A crash before commit safely repeats; a crash after commit finds the existing job. This is at-least-once processing with idempotent effects, not a claim of universal exactly-once delivery.

Job states: `ready → leased → succeeded`; retryable failure returns to `ready` with `available_at`; exhausted/permanent failure becomes `dead`; cancellation is explicit. Persist `attempts`, lease owner/epoch/expiry, payload version, dedupe key and safe error code. An expired lease can be reclaimed with a higher epoch. A worker completes a job only with its current epoch; a late worker cannot overwrite a newer worker's result.

Claim ready work using short `FOR UPDATE SKIP LOCKED` transactions ordered by priority and availability. Release database locks before network/CPU work. Proposed initial lease 60 seconds, heartbeat every 15 seconds, per-handler timeout below the lease unless heartbeats are active. Long imports/projections checkpoint at bounded units; do not hold a database transaction throughout the job. Job status/heartbeat SQL is bounded and included in the connection budget.

Default retry schedule: 5 seconds, 30 seconds, 2 minutes, 10 minutes, 30 minutes, 2 hours, then dead-letter, with jitter and provider `Retry-After` handling. Specialized handlers can override this deliberately: a stale reminder should expire rather than send hours late; financial uncertainty should enter reconciliation rather than blind retry. Dead-letter entries have an owner, dashboard and replay control using the original business identity.

## E-LIVE-02 — Job registry and fairness

| Job                                | Input identity                            | Idempotent effect / stale check                                            | Proposed execution budget                                |
| ---------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------- |
| `site.invalidate`                  | Site + release/visibility revision        | Update invalidation marker/purge safely; ignore old normal release request | 10 seconds                                               |
| `payment.create-checkout`          | Attempt ID                                | Provider key persists; reconcile unknown attempt                           | Provider timeout 15 seconds; no open DB transaction      |
| `payment.process-webhook`          | Inbox event ID                            | Provider-account identity + financial facts; tolerate out-of-order events  | 15 seconds then retry/reconcile                          |
| `payment.reconcile`                | Merchant + time window                    | Persist cursor/exceptions; never create new charge as repair               | 100 provider objects/checkpoint                          |
| `admission.expire-offers`          | Pool/time bucket                          | Lock reservation, compare deadline/state, release once                     | 100 due offers/batch                                     |
| `schedule.generate`                | Input hash + generator version + seed     | Produces proposal only; input revision checked before publication          | 30 seconds CPU per attempt; partial solution report      |
| `statistics.rebuild`               | Competition + target result revision      | Build complete version; activate only if current target matches            | 100 games/checkpoint, cancellation on superseding target |
| `notification.expand`              | Intent + audience version                 | Unique recipient/intent; check current access/subject relationship         | 100 recipients/batch                                     |
| `notification.deliver`             | Recipient + intent + channel              | Stable provider key where supported; recheck relevance/preferences         | Provider timeout 10 seconds                              |
| `media.process`                    | Asset ID + checksum + transformer version | Quarantine until safe derivative committed                                 | 30 seconds/asset initially                               |
| `import.apply` / `export.generate` | Run ID + cursor                           | Stable row IDs / authorized scope snapshot                                 | 100 rows/batch                                           |
| `privacy.erase`                    | Approved deletion-plan ID + step          | Idempotent steps and recovery-safe completion evidence                     | Bounded batch; retry until resolved/escalated            |

Start with two worker processes, each with eight concurrent tasks, as a proposed load-test deployment. Per-workspace maximum two ordinary jobs in flight; per-merchant payment serialization where needed. Reserve capacity for time-sensitive scoring projection/payment work so a large import cannot starve it. A dispatcher persists claim order or uses bounded workspace round-robin selection; a single tenant cannot repeatedly win all the earliest global jobs. CPU-heavy scheduling/media run in bounded execution lanes and can move to a separate worker process without splitting core domain ownership.

Measure queue depth and age by kind/workspace tier using controlled-cardinality metrics. Do not put unbounded customer IDs in every metric label. Jobs refer to private data by ID rather than copying sensitive records into payloads. Failed jobs do not log raw documents or provider bodies.

## E-LIVE-03 — Live basketball event protocol

A scorer first loads the authorized game snapshot, approved roster, frozen rule version, current sequence and lease. Proposed lease TTL 30 seconds; heartbeat every 10 seconds while connected. The current lease includes account, device/session ID and monotonically increasing epoch. A deliberate takeover increments epoch and records actor/reason. Heartbeats cannot extend a revoked user's authority.

Example batch:

```json
{
  "commandId": "9de664e9-e7ce-42db-8c56-570d7eeb6342",
  "expectedRevision": "120",
  "leaseEpoch": "7",
  "sessionId": "f91a1d5c-7a24-401b-9d89-cd6d2265a06f",
  "events": [
    {
      "clientEventId": "a279ad01-40a9-49a7-a9e4-c14e51086b86",
      "type": "basketball.shot-recorded",
      "schemaVersion": 1,
      "period": 2,
      "clockMs": 248000,
      "payload": {
        "personId": "b4a885e3-4696-4e40-8909-c15ce76ad03d",
        "entryId": "dfd82c22-2965-43c3-a656-88567da07ce7",
        "value": 2,
        "made": true
      }
    }
  ]
}
```

The client event ID is a stable correlation value; canonical uniqueness is game/command/batch offset, with an additional game/clientEventId uniqueness check to catch accidental rebatching. The server validates roster, period/rule bounds, lease and expected revision, runs the deterministic reducer and assigns contiguous sequence numbers in one transaction. That transaction also updates the compact current game state and its allowed public scoreboard fields in `published.game_summaries`; live freshness does not wait behind an ordinary 60-second notification queue or a season-statistics rebuild. A batch is entirely accepted or rejected. The response includes committed revision, accepted event IDs, sequence range, clock anchor, state checksum and server time.

Store events append-only. Undo is a new correction/reversal command with a target event and reason; it cannot delete financial/game evidence. Not every event can be independently reversed: correcting a substitution/clock event can affect later minutes and requires a rebuild/impact preview. A final official correction uses result-version workflow rather than silently changing a live projection.

## E-LIVE-04 — Clock, participation and minutes

Persist clock transition events: period start, start, pause, adjustment, end and overtime creation. A running anchor stores period, remaining time at start, server start time and running status. Browser display interpolates from the server anchor with a monotonic local timer; do not write the database each second. Refresh/backgrounding cannot create a fresh full period or implicitly pause the game.

Every scoring/substitution event includes the game clock position. Validate against accepted clock segments and bounded drift; discrepant timestamps require correction/review rather than silently negative minutes. Server wall-clock elapsed time is a synchronization aid, not proof that a scorekeeper's incorrectly running clock matched real play. Staff adjustments are explicit events with reasons.

Lineup stints use elapsed game milliseconds within a period. On substitution, close outgoing stints and open incoming stints at one accepted clock instant. At pause, elapsed playing time stops accumulating. Period end closes all active stints. Rebuild stints from accepted events; sum integer durations before rounding. For a completely tracked five-player basketball segment, summed team-player time equals five times elapsed game time. A rules exception for fewer active players uses the actual accepted lineup size, never manufactured minutes to meet that equation.

Keep separate facts: `appeared` (entered accepted lineup or authorized appearance record), `points`, `minutesKnown`, and `pointsKnown`. A zero-point appearance counts toward GP when documented; DNP does not; unknown participation remains unknown. A positive stint can prove an appearance, but an appearance may have zero measured milliseconds at a boundary, so `minutes > 0` cannot be the only GP rule. Manual box scores can record appearance without known minutes.

Player averages use explicit coverage. If all appearances have points known, PPG = total points / appearances. Otherwise show points per recorded game with recorded-game count, not a misleading season PPG. Team final scores from untracked games do not generate zero-valued player lines. Live provisional stats and official season totals have distinct labels and revisions.

## E-LIVE-05 — Offline and reconnect behavior

Store pending scorer commands in IndexedDB under account/workspace/game/session, including base server revision, lease epoch, stable command IDs and bounded event data. Proposed bound: 2,000 pending events or 5 MiB per game. Show an explicit persistent pending counter and last server acknowledgment. If storage fails or the bound is reached, stop promising local durability and instruct the operator to use the approved fallback; never silently discard the oldest events.

While disconnected, local display can continue provisionally but cannot claim committed league results. Leases expire on the server. On reconnect, first reauthenticate and fetch current lease/revision:

- Same authority/state with a valid renewed lease: send a reviewed batch using its original command identities after checking server duplicates.
- Lease expired but no other writer changed state: request explicit session reacquisition with a new epoch, reconcile base revision and submit through the recovery command that records the old/new epoch relationship.
- Another writer advanced or took over: freeze automatic replay, show local versus server event summaries, and require authorized recovery selection. Do not merge two independently running clocks automatically.
- Server committed a batch but acknowledgment was lost: receipt/event IDs identify already accepted events; mark them acknowledged without reapplying.

The normal endpoint rejects old epochs. The recovery command requires explicit permission, locks game/lease, checks no conflicting accepted work or presents an impact review, and records reconciliation provenance. Rebatching with a new epoch does not change the identity of already committed events.

Keep acknowledged events locally only as long as needed for the active session; purge after verified completion/logout under the documented device policy. Warn before logout if unsent work exists. Shared devices cannot show another scorer's pending queue. An authenticated logout cannot guarantee erasure of a compromised device; minimize stored data to roster IDs/display labels and game events, never contact/payment/eligibility information.

Before finalization require an explicit scorer reconciliation acknowledgment that known pending work is resolved. The server cannot discover a disconnected second device's private queue; lease history plus operator confirmation and incident handling are part of the operational contract. Support paper/manual final-score or box-score recovery with coverage/provenance preserved. Rehearse Wi-Fi drop, browser crash, tab close, device sleep, token expiry and takeover on actual target devices before live scoring is sold.

## E-LIVE-06 — Snapshots, official versions and projection consistency

Persist `app.game_live_states` at every accepted batch for constant-cost current-state reads; keep historical replay checkpoints separately every 100 accepted events or period boundary, tagged with engine/rule version, through-sequence and checksum. The exact checkpoint interval can change after profiling. Current state and checkpoints accelerate access but events/results remain authoritative. An engine upgrade must reproduce fixture checksums or run an explicit versioned migration; old games do not silently replay using changed rules.

Submitting a result freezes a candidate from an acknowledged event sequence or validated manual box score. Finalize validates score consistency, lineup/coverage exceptions and authorization, then appends an immutable official result version and advances the competition's result revision. It emits a rebuild request. A correction adds a new version with reason and dependency impact; never edit the only historical result in place.

Projection protocol:

1. A rebuild reads official active results at an explicit competition result revision (consistent transaction snapshot or captured immutable result IDs).
2. Build standings/player summaries into rows tagged with a new projection revision. Process larger datasets in bounded batches over that captured input set.
3. Validate totals/coverage and finish the complete projection.
4. In a short transaction, activate it only if the competition target revision still matches. A stale build may remain diagnostic history but cannot replace a newer result.
5. Public queries use one active projection revision for the whole table. Announce/cache invalidation only after the switch.

During rebuild, retain the previous coherent table with “Updating after a result change” and its as-of revision/time. A newly finalized game summary may be newer than standings, but the difference is visible. Do not mix rows from old/new standings without indication. Privacy withdrawals take effect immediately at origin through visibility policy even while a statistics rebuild is pending; priority purge and the 60-second maximum person-bearing cache lifetime govern already cached public content.

## E-LIVE-07 — Live delivery and cache design

Initial delivery recommendation: compact public game snapshots polled every five seconds while a game is live, served through a coalescing CDN/application cache with at most two-second normal freshness and an ETag/revision. Back off for hidden tabs and non-live games. This is deliberately simpler than one direct database subscription per spectator. Cache only approved score/team/player fields. The proposed freshness target is 10 seconds p95 under the tested workload.

Admin/draft clients may poll an authorized compact revision endpoint initially. If measured needs require push, add a scoped realtime adapter that broadcasts revision/invalidation envelopes, not unrestricted database rows. On reconnect or sequence gap, fetch the authorized snapshot. Private channels require current authorization and revocation handling. Push is a delivery optimization; it is not the record of truth.

Cache keys include workspace, game/competition/site, data revision, visibility revision and allowed filter. To avoid unbounded keys, enforce finite filter combinations and TTL/size budgets. Cache stampede protection allows one rebuild per key with bounded waiters. Public snapshot production reads a current compact state, not an event-history aggregation for each viewer. Referee/scorer authoritative commands bypass the public cache.

## E-LIVE-08 — Notifications and schedule changes

A committed business event creates one intent per purpose/version. The expansion job resolves authorized recipients in pages and inserts unique inbox/delivery records. Recheck account access, guardian relationship, relevant team assignment and preferences before actual delivery. A schedule-change notification refers to the changed published fixture revision; a newer change supersedes unsent older notices. Never send “game tomorrow” for a cancelled/rescheduled game because the job payload was stale.

Inbox acknowledgment/read state is distinct from provider delivery. Email accepted by a provider is not proof of mailbox delivery or reading. External exactly-once delivery cannot be guaranteed when a provider accepts a message and the acknowledgment is lost; use provider idempotency where available, store provider IDs and surface rare uncertainty. Essential operational messages and optional promotional/media digests have separate preference and applicable-policy treatment.

Email previews contain minimal public-safe information and link to the authenticated portal for private detail. Unsubscribe preferences cannot suppress required security notices, and “essential” cannot be used as a blanket bypass for marketing. The initial product needs inbox and selected transactional email; mobile push/native apps require a later permission/token/device contract.
