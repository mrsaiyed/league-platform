# 05 - Reliability, scalability, quality, and operations

> Historical snapshot: this prospective-client initiative is inactive. Use the [active overall product plan](../../../../product/platform/README.md) for current direction. Earlier approval/customer statements below retain their historical context.

All figures below are proposed engineering targets and test envelopes, not measured capacity, purchased service guarantees, or contractual SLAs.

## 1. Launch objectives and measurable behavior

| Measure                          | Initial target                                                                            | Measurement / caveat                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Public/registration availability | 99.5% monthly target initially                                                            | Synthetic checks; define exclusions and reporting before promising an SLA                     |
| Critical game window             | Named operator available; no planned deployment during games                              | Offline/recovery procedure rehearsed; vendor uptime alone is insufficient                     |
| Read API latency                 | p95 under 500 ms within selected region/test envelope                                     | Excludes user network; split cache hits and misses                                            |
| Command acknowledgment           | p95 under 1 second for ordinary commands; scorer commit under 1 second on healthy network | Measure database commit, not optimistic UI update; payment provider completes asynchronously  |
| Scorer interaction               | Immediate local visual feedback, normally under 100 ms                                    | Must label pending versus committed state                                                     |
| Public live score freshness      | Within 10 seconds of accepted score event                                                 | Stale indicator if no recent update; official stats can remain final-only                     |
| Public page usability            | Target LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1 at representative mobile conditions              | Validate actual devices/network; these are our targets, not measured claims                   |
| Job lag                          | Normal operational messages enqueued immediately, processed within 60 seconds             | Provider delivery is separate; expose delayed/failing state                                   |
| Recovery point                   | Target ≤15 minutes for committed database data under chosen disaster-recovery setup       | Requires supported backup/replication plan and restore tests; unsynced device events excluded |
| Recovery time                    | Target ≤4 hours for pilot disaster restoration                                            | Depends on named staff and tested runbook; game-day fallback is separate                      |

**OPS-01 - Scale tiers.** Design tenant keys, indexes, queues, and quotas from day one. Validate capacity progressively:

| Tier            | Proposed test workload                                                                                                                                                  | Architectural response                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Pilot rehearsal | Two tenants, 28 synthetic participants per pilot-sized season, 1 live game; test 500 public viewers, 50 competing registration attempts, and two conflicting staff tabs | One app/DB; verify isolation, caching, payment/capacity races                                   |
| Early product   | 25 organizations, 5,000 active-season participants, 20 concurrent games, 2,000 public viewers                                                                           | Measure pool usage, queue lag, projection reads, per-tenant quotas                              |
| Growth review   | 250 organizations, 50,000 active-season participants, 100 concurrent games, 10,000 public viewers                                                                       | Load test first; consider dedicated workers, higher DB capacity, replicas/public cache strategy |

These are deliberately specified test cases, not forecasts. Specify event/write rate separately from viewer count: spectators read cached snapshots; scorers send events on actions, not every displayed second. Measure payload volume and fanout. Large media egress can dominate database cost.

**OPS-02 - Scale triggers.** Investigate when DB CPU/pool saturation, p95 latency, deadlock rate, queue lag, or cache miss load breaches target repeatedly. First optimize queries/indexes and bound work, then scale managed capacity/workers. Partition large event/audit tables when measured size/query behavior warrants it. Extract a service only with an ownership/scaling boundary that improves operations.

**OPS-03 - Fair use.** Enforce tenant quotas for batch size, files, messages, expensive generation jobs, exports, and concurrent background work. One large customer cannot starve another. Limits need a visible admin explanation and an operator override with a reason.

## 2. Backups and recovery

**OPS-04 - Coverage.** Back up database, object storage, configuration/migrations, identity/provider configuration, and the information needed to restore secrets safely. Database backups alone do not include uploaded Storage objects in Supabase; image and export objects need their own backup design. [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups).

**OPS-05 - Strategy.** Choose a plan supporting the approved RPO. Recommended: managed point-in-time recovery, daily independent encrypted logical export, separate asset backup with version/retention controls, and restricted backup credentials. Approve region, retention, recovery cost, and key custody. Verify backup completion alerts rather than assuming a paid plan is enough.

**OPS-06 - Restore drill.** Before launch and periodically thereafter: restore to an isolated environment, verify tenant counts and sampled relationships, compare official results/financial records, test logins and asset reads, replay privacy removals, reconcile provider payments since recovery point, and replay safe pending jobs without duplicate external effects. Record actual elapsed time and maximum data loss. Do not notify real users from a restored staging copy.

**OPS-07 - Game continuity.** Keep pregame roster/rules snapshots and a printable/manual fallback. Staff know how to pause software use, record scores/appearances safely, and enter a manual-provenance result after recovery. Never claim offline events survived if they were not acknowledged or exported. Sync local queues before browser/application updates.

## 3. Observability and support

**OPS-08 - Signals.** Structured logs include request ID, release, tenant pseudonymous identifier, command, latency, result code, and safe entity references. Metrics include API error/latency, auth failures, DB connections, payment inbox age, reconciliation mismatches, refund age, queue depth/retries, scorer conflicts, projection lag, storage failures, and backup health. Avoid raw student/contact/payment payloads.

**OPS-09 - Alerts.** Page the designated operator for inability to save game events, widespread auth/write failures, suspected disclosure, and payment inconsistencies. Lower-priority alerts cover delayed email, old drafts, and media processing. Define severity, owner, response expectation, escalation contact, and quiet-hour exceptions. An alert without an owner is not an operating plan.

**OPS-10 - Support tools.** Authorized staff can inspect a redacted failed job, retry a specific safe operation, request a scoped export, revoke a staff session, and view audit history. Support cannot silently impersonate a student or change a final score. Customer-visible statuses distinguish application error from provider outage.

**OPS-11 - Runbooks.** Required before relevant launch: payment succeeded/application pending; refund stuck; draft host lost; scorer offline/takeover; incorrect final result; schedule publication mistake; student media takedown; account/owner recovery; database restore; provider outage; suspected security incident.

## 4. Testing strategy

**QA-01 - Domain tests.** Property/example tests cover schedule constraints, draft order/capacity, stats formulas, zero-point appearances, period timing, lineup stints, score corrections, and rounding. Persist reducer version and deterministic fixtures. Compare event replay with stored projections.

**QA-02 - Database integration.** Use a real isolated PostgreSQL instance with production-like roles/policies. Test foreign keys, RLS, grants, transactions, race conditions, lock ordering, unique command IDs, and migrations. Mocking the database cannot prove tenant isolation or capacity atomicity.

**QA-03 - Provider integration.** Exercise signed webhook validation, duplicate/reordered events, delayed payments, unknown API outcomes, duplicate refunds, insufficient refund balance, provider timeouts, and reconciliation. Use separate provider test accounts/keys; live secrets never enter preview environments.

**QA-04 - Browser journeys.** Applicant verification → signup → checkout test flow → pending review → approval → roster → schedule → inbox. Commissioner setup → draft → publish schedule → assign scorer → finalize → correction. Include keyboard-only, mobile registration, screen reader smoke checks, and stale-session errors.

**QA-05 - Game rehearsal.** Run a full simulated game on the intended courtside hardware with clock pauses, substitutions, zero-point appearances, period transitions, overtime policy, browser background/reload, intermittent network, device takeover, and finalization. Reconcile player time and points. Do not accept a happy-path click demo as proof.

**QA-06 - Recovery/load/security.** Perform restore and privacy deletion drills; controlled load at each approved tier; targeted injection/upload/permission tests; independent review of high-risk paths. Automated accessibility checks supplement manual checks, not replace them.

**QA-07 - Evidence.** Each release requirement links to a test or documented manual check, tested build, result, and owner. No claim of target performance/security/compliance without corresponding evidence. Fix critical/high exploitable issues before real student data or money; document lower-risk exceptions with expiry.

## 5. Releases, migrations, and maintenance

**REL-01 - Environments.** Separate local, staging, and production databases, storage, auth, payment accounts, and email routing. Use synthetic fixtures in previews. Version configuration and migrations in Git. Keep the existing static demo isolated.

**REL-02 - CI.** Proposed gates: lockfile install, lint/types, formatting, unit tests, database migrations from empty and representative previous schema, RLS/concurrency tests, critical browser journeys, secret/dependency scanning, build. Only appropriate checks run for documentation changes. Protected production releases require review and successful relevant checks.

**REL-03 - Schema evolution.** Use expand/migrate/contract: add compatible structure, deploy code that supports both, backfill in bounded jobs, verify, then remove obsolete fields in a later release. App rollback cannot undo a destructive migration or an already issued refund. Backups and forward repair are part of the migration plan.

**REL-04 - Long-running scorers.** Version event contracts and reducers. A new deployment must understand the old active game's pending events or explicitly defer upgrade until synchronized. Do not force-refresh a scorer midgame. Immutable rules/reducer versions prevent replay meaning from changing after a library update.

**REL-05 - Dependency ownership.** Pin supported stable versions, track end-of-support dates and security advisories, update on a planned cadence, and expedite important security patches. Do not choose package versions in prose as substitutes for a tested lockfile. Minimize unused dependencies and platform-specific code outside adapters.

**REL-06 - Change quality.** Short reviewed changes, domain naming consistent with the glossary, clear API boundaries, useful code comments explaining invariants, decision records for consequential choices, and no hidden customer-specific conditionals. Assign owners to payment, scoring, privacy, and platform operations even on a small team.

## 6. Cost and commercial viability

**OPS-12 - Cost model.** Estimate and measure application hosting, DB compute/storage/PITR, auth, Realtime traffic, image storage/egress, email, monitoring, CI, domains, payment processing/refunds/disputes, support labor, and independent review. Integrated video adds a distinct upload/transcode/delivery cost model and is deferred.

```text
Monthly software contribution
  = subscription/season revenue + earned platform transaction revenue
    - infrastructure - provider charges borne by us - support labor - refunds/credits borne by us

Al-Hadi operating contribution
  = participation and external-game receipts
    - coaching/referees/jerseys/equipment/media/travel
    - processing/refunds - allocated software/support cost
```

No current vendor prices or margin percentages are asserted. Obtain a dated plan/region/usage quote before purchase. Set an approved monthly cap, spend alerts at agreed thresholds, and an owner for overages. Log per-tenant usage sufficiently to understand cost without invasive student analytics.

**OPS-13 - Viability gate.** Before broadly selling, demonstrate that a second customer can onboard with settings, core workflows need little manual repair, staff support time is measurable, and pricing covers software cost plus support. Physical program services can be profitable separately but must not conceal an unviable SaaS support burden.

## 7. Expansion and exit

**OPS-14.** Import/export data using documented versioned formats, preserving source IDs and provenance. Rehearse a tenant export, not only a whole-database backup. A customer should be able to retrieve authorized people/rosters/schedules/results/financial summaries without receiving another tenant's records.

**OPS-15.** Keep a vendor exit inventory: DB dumps/migrations, stored objects and metadata, identity migration constraints, provider reference mapping, domain/DNS configuration, job/event offsets, and operational runbooks. Portability is tested effort; do not promise instantaneous provider switching.

**OPS-16.** Future sports implement supported rule/event/stat interfaces and their own tests. Team membership, billing, calendar, and privacy remain shared. Cricket should not be forced into basketball points/period assumptions; the basketball adapter is the first implementation, not the universal sports schema.

## 8. Governing-body scale and enterprise readiness

**OPS-17 - Workload dimensions.** The initial OPS-01 tiers test many modest customers; they do not demonstrate governing-body readiness. Maintain separate load scenarios for one large workspace and many small workspaces. Record participants, entries, retained seasons/events, simultaneous competitions, scoring writes/second, administrators, public views/fanout, imports/exports, qualification recomputation, notification bursts, asset egress, and backup/restore volume. Publish the hardware/provider plan, dataset shape, write/read mix, cold/warm cache behavior, p95/p99, error rates, queue lag, and recovery results. Test large-tenant resource fairness, indexed delegated-scope queries, batch publication, canceled jobs, and failure during a large import. Structural fixture X-06 is not a capacity benchmark. Set enterprise targets from measured customer needs before quoting a service level.

**OPS-18 - Enterprise commercial gate.** Before selling an affiliated-network or statewide deployment, agree migration/cutover, directory/SSO needs, contracts/data responsibilities, accessibility evidence, security assessment, region/retention, incident notification, support staffing/hours, peak competition coverage, recovery objectives, data export, provider dependencies, and service-level remedies. Assign owners and budget. Customers with justified isolation/residency requirements may use a supported dedicated deployment/database tier from the same code and migrations; this is a deployment product with upgrade/restore costs, not a code fork or a pilot requirement. Avoid promising certifications, unlimited volume, or availability unsupported by evidence.

**OPS-19 - Extension economics.** Measure support and maintenance cost per optional module/integration as well as per tenant. Customer-funded development needs an agreed acceptance contract, maintenance funding, security owner, supported versions, deprecation path, and export behavior. Track one-time setup/migration revenue separately from recurring subscription margin. Keep the independent-league offer viable without underwriting unpriced enterprise workflow support.
