# 07 — Capacity targets, deployments and operational evidence

[Engineering map](README.md) · Refines RQ-01–07, EG-06–07, AT-04–06

## E-OPS-01 — Capacity is a tested envelope

The numbers below are **proposed engineering test targets**, not current capacity, a purchased infrastructure plan or an SLA. Dataset size, concurrent traffic, data skew and device conditions must all be recorded. A test of ten tiny leagues does not establish that a single huge competition performs well.

| Dimension                   | A: internal alpha gate                    | B: independent-league release gate                        | C: expansion investigation                     |
| --------------------------- | ----------------------------------------- | --------------------------------------------------------- | ---------------------------------------------- |
| Owning workspaces           | 10                                        | 100                                                       | 1,000                                          |
| Tenant person records total | 2,000                                     | 50,000                                                    | 500,000                                        |
| One large workspace         | 1,000 people / 20 competitions            | 20,000 people / 100 competitions                          | 100,000 people / 1,000 competitions            |
| Stored games / game events  | 2,000 / 500,000                           | 50,000 / 10 million                                       | 500,000 / 100 million                          |
| Simultaneously live games   | 5                                         | 50                                                        | 250                                            |
| Active private users        | 50                                        | 500                                                       | 2,000                                          |
| Concurrent public viewers   | 250                                       | 10,000                                                    | 50,000                                         |
| Aggregate mutation requests | 10/sec steady, 30/sec burst               | 60/sec steady, 150/sec burst                              | Establish after profiling B; no linear promise |
| Registration pressure       | 20 simultaneous attempts for final places | 100 simultaneous attempts against one capacity pool       | Reassess contention policy and admission UX    |
| Background workload         | 1,000 notifications + one import          | 10,000 notifications + five imports + projection rebuilds | Independent job-lane budgets required          |

Counts include archived data and tenant-skew fixtures; they are not minimum requirements for every customer. Fixtures must also include a six-team bracket, mixed capture coverage, concurrent seasons/cups and a highly customized site. The initial sport matrix does not claim all enterprise/governing-body functions merely because these row counts pass.

## E-OPS-02 — Service targets and measurement

| Metric                                   | Proposed target at the supported envelope              | Measurement                                                                                  |
| ---------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Public/registration monthly availability | 99.5% internal objective                               | External synthetic checks + request errors; incident windows included under a defined policy |
| Ordinary authorized mutation latency     | p95 < 1 s; p99 < 3 s                                   | Request accepted at service → durable commit/response; provider work async                   |
| Private paginated list API               | p95 < 500 ms service time                              | Warm and cold plans recorded; bounded page size                                              |
| Public cached JSON                       | p95 < 250 ms service/edge time                         | Include hit/miss rates and geography                                                         |
| Live score freshness                     | p95 < 10 s accepted event → observable public snapshot | Synthetic event markers checked by independent observer                                      |
| Normal notification dispatch lag         | p95 < 60 s                                             | Intent eligible → first provider attempt; delivery itself separately measured                |
| Standard standings rebuild               | p95 < 30 s for 1,000-game competition                  | Target revision → coherent active projection under mixed workload                            |
| Public mobile experience                 | LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1 at p75 target  | Controlled mobile runs first; field measurement once traffic exists                          |
| Recovery point / recovery time           | RPO <= 15 min, RTO <= 4 h                              | Destructive-loss simulation using selected backup plan and staffed recovery                  |

Web interaction thresholds are proposed product budgets. Measure real user journeys, not just empty endpoint responses. Report geographic/network/device assumptions. Async acceptance latency is not payment completion latency. Separate service errors from expected validation/conflict responses, while still monitoring an unexpected rise in conflicts as a usability issue.

## E-OPS-03 — Workload script and release pass conditions

Create a versioned load runner (recommended k6 or an equivalent maintained tool selected in the scaffold) and seed scripts. Use synthetic names/emails/provider stubs. No production record copy. Test from a separate machine/service so the load generator does not compete with the database.

At envelope B, mix public site/fixtures/standings/media reads, private lists, registration, draft/scoring and schedule changes. Model 50 games with one active scorer each, natural bursts and some retries, not 10,000 scorers writing at spectator rate. Ten thousand spectators polling every five seconds create about 2,000 edge requests/sec; coalesced per-game snapshots should reduce origin work substantially. Prove the actual miss/fanout ratio. Fifty games with a two-second snapshot refresh implies roughly 25 refreshes/sec under ideal sharing, not a guarantee across independent caches/regions/filters.

Run 10-minute warmup, 30-minute steady workload and a 10-minute burst; run a four-hour soak before a capacity-changing release. Include one customer consuming its maximum import/job quota while others score live. Simulate latency, dropped responses, webhook duplicates, worker termination, expired leases and cache misses. Run correctness queries afterward: zero duplicate active picks, zero over-capacity allocations, no over-refunds, no missing acknowledged events, no cross-tenant rows and no conflicting confirmed bookings.

Release gate: targets met, no correctness violations, no unbounded queue/memory growth, database CPU/connection/storage headroom documented, p95 queue age returns to target after burst, and per-operation cost measured. Save test revision, seed, infrastructure size, query plans, graphs and pass/fail notes. A bigger instance without rerunning the workload is not capacity evidence.

## E-OPS-04 — Database and connection budget

Place web/worker/database in a compatible primary region with low inter-service latency; region choice follows market/data-residency and provider validation. Use the provider's supported pooling mode and test transaction-local context and prepared-statement behavior. No assumptions about connection capacity from a marketing plan name.

Illustrative deployment if the chosen database exposes 100 usable backend connections:

| Client                                           | Maximum allocation |
| ------------------------------------------------ | ------------------ |
| Up to 4 web instances, private pool 8 each       | 32                 |
| Up to 4 web instances, public reader pool 2 each | 8                  |
| 2 worker instances, domain pool 8 each           | 16                 |
| 2 worker dispatch pools, 2 each                  | 4                  |
| Migrations/operations reserved                   | 15                 |
| Unallocated emergency headroom                   | 25                 |
| Total                                            | 100                |

This is a budget example, not confirmation of a Supabase plan's limits. Pooler frontend connections are not necessarily dedicated database backends; measure both. Autoscaling must honor a global database connection budget—adding web replicas cannot multiply pools without bound. Initial proposed query timeout 3 seconds for request reads, 5 seconds for ordinary commands, lock timeout 1 second and idle-in-transaction timeout 5 seconds. Job batches can have reviewed longer limits. Return retryable errors for lock contention and keep the same command identity. Timeouts must cancel/rollback safely.

Use `EXPLAIN (ANALYZE, BUFFERS)` on staging-sized fixtures for the main lists, permission checks and projections. No unbounded public `SELECT *`, per-row roster query or full event scan per page. Query-count budgets: public page <= 5 batched DB queries, ordinary list <= 3 plus bounded authorization, command <= 15 statements unless justified by the aggregate contract. Batch block queries by competition/type; cap dynamic data blocks at 12 per page initially. Measure query count and total rows read, not just returned rows.

Add partitioning to append-only event/audit/job history only when measured index/storage/maintenance costs justify it. Keep uniqueness and retention behavior correct across partitions. Do not shard person/competition ownership first. Read replicas require explicit stale-read handling for read-after-write and revocation; authoritative commands remain on the primary.

## E-OPS-05 — Browser and rendering budgets

Public hero assets use responsive sizes, explicit dimensions and an optimized derivative; proposed mobile hero budget <= 300 KiB, desktop <= 600 KiB. Lazy-load below-fold galleries and video players; a thumbnail loads before third-party video scripts. Bundle approved fonts locally where practical and limit weights. Site templates share assets/components; customer branding does not ship a second UI framework.

Proposed route-owned compressed JavaScript budgets: public page <= 150 KiB beyond measured framework baseline; editor/scorer <= 300 KiB initially, with feature chunks loaded on use. CI reports total transfer and changes, because excluding framework bytes must not hide a slow experience. Scorer must work without loading the editor, finance dashboards or media-processing code. Use pagination/virtualization only when needed and preserve keyboard/table semantics.

Measure 360 px phones, 768 px tablets, 1440 px desktop, 200% zoom, reduced motion and slow/mobile network scenarios. Verify all applicable WCAG 2.2 AA criteria, including reflow at 320 CSS px and text/zoom cases beyond these representative screenshots; passing three viewport sizes is not an accessibility certification. Public pages emphasize schedule/status/registration with stable navigation. Admin surfaces show real task queues. Accessibility and calm presentation are reusable component requirements, not individual-customer fixes. [WCAG 2.2 standard](https://www.w3.org/TR/WCAG22/).

## E-OPS-06 — Observability and operational limits

Structured events carry request ID, command ID, action, safe aggregate reference, outcome, duration and build version. Use redacted tenant identifiers where diagnostics require them; avoid high-cardinality metric labels. Trace web → transaction → outbox/job → provider with correlation IDs. Logs cannot contain auth tokens, private form answers or full provider payloads.

Dashboards/alerts require an owner and runbook:

| Signal                           | Initial trigger / action                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Mutation error rate              | > 2% unexpected errors for 5 minutes with sufficient volume; investigate/revert                        |
| Scoring acknowledgment/freshness | p95 misses target for 5 minutes during live games; prioritize live lane, notify operators if necessary |
| Database pools                   | > 80% allocated usage or growing wait time for 10 minutes; inspect slow queries/instance cap           |
| Queue age                        | Time-sensitive oldest ready job > 60 seconds for 5 minutes; inspect worker/provider health             |
| Financial discrepancy            | Any unexplained duplicate/amount/merchant mismatch; freeze affected automation and reconcile           |
| Backup/restore                   | Missing scheduled backup or failed restore drill; block reliance on recovery claim                     |
| Security scope violation         | Any confirmed unauthorized disclosure/privilege bypass; contain immediately                            |
| Media/import growth              | Quota exceeded or malformed-file spike; throttle/quarantine without starving games                     |

Initial rate limits are tunable deployment policies: public reads 120/min/IP baseline with CDN/shared-network tuning; login requests 5/min/account destination plus 20/min/IP with escalating abuse checks; ordinary authenticated mutations 120/min/account; scorer batches 120/min/session and bounded event rate; exports 2 concurrent/workspace. Do not block an entire school/venue after a few legitimate shared-IP requests. Add account/session/workspace dimensions and accessible retry messages. Provider webhooks have separate authenticated limits and durable backlog behavior.

## E-OPS-07 — Deployment and migration procedure

Maintain development, staging and production isolation. CI runs type/lint/import checks, domain tests, real PostgreSQL migrations/RLS/race tests, generated schema drift checks, build and key browser journeys. Preview deployments have synthetic fixtures and no production payment/email destinations. Secrets are environment-specific. Build one immutable artifact and promote it after checks; do not rebuild different dependency trees for production.

Deploy sequence: database expand migration → compatible web/worker release → smoke checks → resumable backfill → validate → later contract migration after compatibility window. Migration runner uses a single deployment lock. Application startup validates schema compatibility. Deploys cannot force active scorers to reload and lose queued work. Support current and prior client/event schema during a defined rollout window (proposed seven days or until no active prior scorer session, whichever is longer, with a bounded explicit sunset policy). Reject unsupported clients with recovery/export guidance, not silent data loss.

Rollback restores prior compatible app/worker artifact and disables unsafe features if needed. Do not roll a destructive DB migration backward over new user data. Correct with a forward migration/restore decision and incident owner. Feature flags gate unfinished behavior; they do not bypass authentication or replace configuration schema migrations.

## E-OPS-08 — Backups and recovery

Choose a database plan whose tested point-in-time recovery supports the RPO objective. Proposed starting retention: seven days PITR plus daily independent encrypted exports retained 35 days, subject to security/market review. Database backups do not establish recoverability of uploaded object bytes; maintain an independently tested object backup/versioning policy and asset manifest/checksums. Supabase explicitly distinguishes stored object metadata from backed-up object bytes; verify the selected plan and custom-role recovery procedure. [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups). External provider money is reconciled, not restored by replaying charges.

Recovery drill steps: declare incident and isolate writes → select recovery point → restore into isolated environment → validate schema/counts/constraints and representative records → restore/verify objects → replay deletion/withdrawal/revocation obligations → disable outbound jobs temporarily → reconcile payments/provider deliveries since the recovery point → rebuild public projections → verify identities/scoring/outbox state → reopen in controlled stages → measure actual loss/time. Duplicate external effects after restore must be detected through provider identities and reconciliation.

Perform a restore before real records are entrusted to the system and repeat at least quarterly and after major backup changes. Assign a primary and backup operator, game-time coverage and contact path. RTO cannot be promised without people available to execute the runbook. Document regional outage handling separately; a single-region start is not multi-region disaster tolerance.

## E-OPS-09 — Cost and scaling decisions

Track monthly base cost plus unit costs per active workspace, game, live hour, 1,000 notifications, GB media stored and GB delivered. Budget worksheet inputs: database/storage/backups, web instance hours, worker hours, auth active users, email volume, payment/provider charges, CDN requests/egress, observability and support labor. Use actual provider quotes and measured workload before pricing; no fabricated dollar estimate is approved here.

Scaling order: inspect query plans/indexes and N+1 work → reduce/cap/cache duplicate reads → increase appropriate worker lanes/instance capacity within DB budget → resize database/storage or add justified read models → isolate high-cost media/scheduling → consider partitioning/read replicas/dedicated enterprise tier. Each step records bottleneck, target improvement, recurring cost, rollback and validation.

Dedicated enterprise deployments, if later needed, use the same code and migrations with a routing/provisioning contract. Separate physical infrastructure does not justify feature forks. Cross-region writes and statewide governance are separate engineering programs with their own authority, recovery and contract evidence.
