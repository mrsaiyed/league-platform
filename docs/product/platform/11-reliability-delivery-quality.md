# 11 — Reliability, delivery, and quality

[Specification map](README.md) · Status: proposed operational requirements · Decisions: D-24–D-26

**Detailed engineering contract:** [Capacity and operations specification](engineering/07-capacity-delivery-operations.md) defines numeric workloads, connection budgets, alerts, deployment and recovery; [build evidence](engineering/08-build-plan-and-evidence.md) names required tests.

## Targets and evidence

The following are starting engineering targets for discussion, not measured capacity, purchased guarantees or customer SLAs. Confirm scope, budget, region, devices and support coverage before commitment.

| Measure                        | Proposed starting target                       | Evidence                                                       |
| ------------------------------ | ---------------------------------------------- | -------------------------------------------------------------- |
| Public/enrollment availability | 99.5% monthly initial objective                | Synthetic checks and agreed definition/exclusions              |
| Ordinary command commit        | p95 below 1 second on healthy regional network | Database acknowledgment, not optimistic UI                     |
| Live-score freshness           | Within 10 seconds of accepted event            | Revision/staleness measurement                                 |
| Normal notification processing | Within 60 seconds of due time                  | Queue lag distinct from provider delivery                      |
| Database recovery point        | At most 15 minutes under selected backup setup | Purchased capability plus restoration/reconciliation test      |
| Disaster recovery time         | At most 4 hours for initial deployment         | Named staff and full runbook rehearsal; game fallback separate |

**RQ-01 — Observability and quotas.** Track release/request IDs, pseudonymous owner scope, latency/errors, auth failures, capacity/payment mismatches, queue age, scorer conflicts, public projection lag, storage and backup health. Avoid sensitive payloads. Enforce tenant quotas on messages/files/exports/imports and expensive jobs. Named alerts have severity, owner, expected response and escalation; game windows need actual coverage.

**RQ-02 — Recovery.** Back up database, objects, configuration and the information required to restore identity/providers safely. Select managed point-in-time recovery and independent encrypted exports where the approved objectives require them. Supabase database backups do not restore uploaded Storage objects themselves; plan object backup separately. [Supabase backups](https://supabase.com/docs/guides/platform/backups).

Restore into isolation; verify records/assets/auth, apply erasures/revocations, reconcile newer provider activity and restart jobs under deduplication controls. Do not send real notifications from a recovery test. Record actual elapsed time and loss boundary. Local unsynced scorer events are outside acknowledged-server recovery promises; maintain printable/manual fallback.

## Quality and deployment

**RQ-03 — Test layers.** Domain/property tests for rules, ranks, bracket byes, capacity and lineup time. Real PostgreSQL integration tests for scoped keys, RLS/grants, locks, migrations and races. Provider tests for signature/replay/reordered events and uncertain outcomes. Browser tests for setup, applicant/team entry, checkout, draft, schedule, scorer and correction. Manual accessibility/device checks supplement automation. Threat, restore and representative load tests gate relevant release claims.

**RQ-04 — Release pipeline.** Separate local/staging/production databases, identity, payments, storage and email routing. Preview data is synthetic. Pin dependencies and scan secrets/advisories. Required checks follow the change: code types/lint, meaningful tests, database migration compatibility, critical journeys and build. Documentation changes need documentation checks. Review exploitable high-risk issues before production data/money.

**RQ-05 — Migration and active sessions.** Use expand/backfill/contract with bounded jobs and tested upgrades from prior schema. App rollback does not undo a destructive migration or refund. Version game events and reducers so old active scorer queues remain supported or require safe synchronized transition. No force-refresh midgame. Deployment, schema repair and financial reconciliation have separate procedures.

**RQ-06 — Support tools.** Temporary audited access, redacted job diagnosis, safe retry, account/owner recovery, private export/deletion, and correction escalation. Required runbooks include paid-but-pending entry, stuck refund, draft/scorer takeover, incorrect result, stale schedule, media takedown, credential compromise, provider outage and full restore. No hidden universal administrator password or silent result edits.

**RQ-07 — Cost and exit.** Estimate hosting, database/storage/backups, auth/realtime, email, egress, monitoring, CI, provider charges, disputes/refunds borne by the business, support and independent review. Set dated budgets and spend alerts. Model revenue minus infrastructure/provider/support costs separately from one-time implementation services. Tenant export and termination must preserve authorized data access and explain retention. Do not assume public-video hosting is cheap or that provider migration is instant.

## Acceptance and next detail

Pass an empty/upgrade migration, permission/race suite, complete game recovery rehearsal, encrypted backup restore, deletion reapplication, webhook reconciliation and single-tenant export. Show the measured target results and unresolved risks for the actual release build.

The engineering operations contract now defines proposed workload/SLO budgets, query/connection limits, alerts, deployment/migration procedure and recovery steps. Implementation must supply the executable test harnesses, measured reports, environment/secret inventory, provider-backed backup plan, staff rota and cost/support commitments.
