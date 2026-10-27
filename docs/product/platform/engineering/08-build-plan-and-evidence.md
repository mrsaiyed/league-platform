# 08 — Build sequence, traceability and remaining evidence

[Engineering map](README.md) · Refines the [product roadmap](../13-decisions-roadmap-validation.md)

## E-BUILD-01 — What has changed in the specification

The original active package is a product/behavior baseline. This engineering package turns “scalable, maintainable, secure and customizable” into proposed implementation contracts. It names files, module ownership, tables/fields, transaction locks, editor schemas, permissions, failure recovery, limits and tests. Those choices can now be reviewed and implemented without asking a developer to invent the entire architecture from a paragraph.

The repository contains a preserved static demo and a local SQL-backed varsity scorer. Neither certifies the production components described here. Do not create hundreds of empty files to make the plan look implemented. Build complete vertical slices and add the specified responsibilities as they become real.

## E-BUILD-02 — Foundation now versus capability later

| Concern               | Build into first relevant slice                                                    | Add only after its gate                                                      |
| --------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Tenant scope          | Workspace identity, composite references, restricted roles/RLS, safe DTOs          | Dedicated tenant database/routing tier                                       |
| Competition hierarchy | League/season/competition/entry keys; simple UI hides unnecessary selectors        | Institutional alignment, federation policies and appeals                     |
| Maintainable source   | Two app boundaries, shared contracts/core/adapters, import checks, one lockfile    | Service extraction or additional deployment languages                        |
| Customization         | Typed settings, page/block registry, draft/publish, version snapshots              | Broader layout catalog, advanced award criteria, approved extension SDK      |
| Authentication        | Verified identity, relationships, live grants, privileged MFA, recovery            | Enterprise SSO/SCIM and federated institutional identities                   |
| Money                 | Separate merchant/order model before any paid mode; durable attempt/reconciliation | Multi-party splits, installments, tax automation or additional providers     |
| Concurrency           | Idempotency/revisions/aggregate locks and constraints                              | Advanced distributed scheduling/locking if one database no longer suffices   |
| Live game records     | Durable event/session contracts and result coverage in data model                  | Courtside offline UI only after rehearsal; push fanout after measured demand |
| History               | Immutable result/config versions and export policy                                 | Complex cross-season/cross-institution official records                      |
| Operations            | Telemetry, bounded jobs, backup/restore, migration discipline                      | Multi-region failover/enterprise SLA commitments                             |

## E-BUILD-03 — Implementation work packages

The October 27 direction moves live stats to the front. Build **S0 local scoring rehearsal → S1 hosted team scoring**, then expand into the complete league lifecycle. S1 includes the relevant T0/T1 security foundations and T6 recovery requirements; it does not wait for registration, payments, a draft or a page builder. The T packages below remain reusable work packages rather than a strict numerical execution order. No calendar estimate is justified until dependencies and staffing are agreed.

| Immediate slice          | Deliverables                                                                                                                                              | Exit evidence                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| S0 — Local rehearsal     | Validated game commands, reusable basketball reducer, persistent SQL, roster/opponent setup, automatic final stats                                        | Arithmetic/rollback/idempotency/restart tests plus actual browser rehearsal; implemented locally under ADR-004                                       |
| S1 — Hosted team scoring | Production team-season/external-competition model, identity and game assignments, RLS, scorer leases/offline recovery, result publication, backup/restore | Actual-role denial tests, complete game and device-failure rehearsal, verified rules/minute correction, approved public fields and recovery evidence |

| Package                     | Concrete deliverables                                                                                                                                                                     | Exit evidence                                                                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T0 — Validated scaffold     | npm workspaces; strict TS; Next/React compatible versions; PostgreSQL/provider local/staging setup; CI; package import rules; provider/auth/pooler spike; deployment cost worksheet; ADRs | Reproducible install/build; verified SSR session refresh/MFA/revocation; transaction-local context survives pooling safely; no client server-secret imports |
| T1 — Identity and isolation | Accounts/workspaces/access scopes/grants/invites; people/relationships; SQL roles/RLS; create-workspace command; audit/receipts/outbox/job base                                           | Actual-role negative tests across two tenants and two people in one tenant; last-owner protection; retry-safe provisioning; revocation race                 |
| T2 — Self-service website   | League/season/competition setup; theme/page/block schemas; first editor and public renderer; draft/publish/history; safe public projection                                                | Two visually different websites from one release; stale-edit conflict; private asset rejected; keyboard/mobile publish journey                              |
| T3 — Basic complete season  | Teams/entries/rosters; round robin/single elimination; resources/manual schedule; score/box results; standings/player summaries; inbox/archive/export                                     | Six-team bracket with byes; multi-division shared resource conflict; full season plus correction/archival; mixed stats coverage                             |
| T4 — Registration           | Versioned forms; individual/team/invite flows chosen for release; eligibility/admission/capacity/waitlist; account-claim and portal states                                                | 100 concurrent requests for final places without overflow; no-login participant path; expiry/review/revocation; truthful status summaries                   |
| T5 — Paid workflows         | Approved merchant/charge model; hosted checkout; durable inbox/attempts/refunds; SaaS billing separated; reconciliation UI/runbook                                                        | Provider test-mode duplicate/out-of-order/crash cases; late payment after expired hold; simultaneous refund bounds; restore reconciliation                  |
| T6 — Live operations        | Draft leases; basketball rules/reducer; scorer controls; IndexedDB queue/recovery; clock/stints; result corrections; public live snapshots                                                | Full game rehearsals with Wi-Fi loss/crash/takeover; minutes conservation and zero-point appearance; ack loss replay; finalization gate                     |
| T7 — Engagement/modules     | Transactional email/reminders; approved media; awards module/registry; personal admin layouts; module migrations/disable                                                                  | Correct recipients after schedule/roster changes; module enable/disable/upgrade across two leagues; approved asset/privacy withdrawal                       |
| T8 — General release gate   | Supported combinations matrix, envelope B benchmark, recovery drill, security/accessibility review, support/exit/pricing policies                                                         | Recorded test report and real ownership of incidents, recovery and merchant obligations; explicit release approval                                          |
| T9 — Expansion              | Multi-program depth, affiliations/delegation, enterprise auth/integrations, additional sports as validated                                                                                | Network/governance/second-sport fixtures plus measured cost/load and contractual readiness; no customer-specific source fork                                |

After S1, T0–T3 can form a broader free league alpha. It is not the full end-to-end commercial promise until selected T4–T8 capabilities are delivered. If the launch offer requires live stats or payment on application, those gates cannot be deferred while advertising them as available.

## E-BUILD-04 — Capability combinations to prove

Do not claim all combinations of every toggle are supported simply because individual features work. Maintain a capability matrix in tests and product help; unsupported combinations fail setup readiness with a clear reason.

| Scenario                       | Formation / payment / results                                                                                  | Required path                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Team in an outside competition | Saved roster, external schedule references, live team-owned records                                            | One team season plus correction; no implied authority over external standings                 |
| Small casual league            | Manual teams, no payment, final scores                                                                         | Signup organizer → website → roster → schedule → official scores → standings → archive        |
| Individual draft league        | Individual signup, optional review, pay on application including explicitly enabled paid waiting, hosted draft | Capacity/hold/late payment/refund + one-host draft + portal notices                           |
| Team-entry tournament          | Manager roster, team fee, single elimination                                                                   | Participants without accounts; team capacity distinct from player cap; byes and qualification |
| Multi-program operator         | Several competitions/seasons sharing courts and some people                                                    | Scope-correct stats/rosters, valid multi-entry policy, resource/rest conflict prevention      |
| Live basketball                | Accepted lineup/clock events plus offline recovery                                                             | Minutes/appearance provenance, event replay, finalization and correction                      |
| Distinctive brand/trophies     | Different page layout, optional awards/media                                                                   | Same deploy/migrations; typed config; disable and history/export                              |
| Future affiliated network      | Explicit institution participation/delegation                                                                  | No implicit parent access; one official authority; revoke sharing                             |

## E-BUILD-05 — Acceptance tests with named evidence

These are planned production tests, not claims about the existing demo's test suite.

| Test ID | Required test / oracle                                                                                          | Requirement owner           |
| ------- | --------------------------------------------------------------------------------------------------------------- | --------------------------- |
| ENG-01  | Import graph rejects React/provider/DB access from core and private code from client entry                      | E-ARCH-02/05                |
| ENG-02  | Migration from empty and prior version; DB type/schema drift check                                              | E-DATA-09                   |
| ENG-03  | Actual DB roles reject cross-tenant insert/join/read/update/function paths                                      | E-DATA-01/07, E-SEC-01/04   |
| ENG-04  | Same-workspace participant cannot access peer contact/application/evidence or cache                             | E-SEC-02/03/07              |
| ENG-05  | Revocation ordered against in-flight write; new command denied after revoke commit                              | E-DATA-08, E-SEC-02         |
| ENG-06  | Same command twice produces one effect; changed payload same ID conflicts; dropped response replays             | E-API-04                    |
| ENG-07  | Final 3 places with 100 applicants: exactly 3 allocated under chosen policy                                     | E-DATA-04/08, E-API-05      |
| ENG-08  | Two hosts select same player or last roster slot: one succeeds, valid pick order/history                        | E-API-07                    |
| ENG-09  | Two schedule publications target same court/time: no overlap; losing proposal remains unpublished               | E-DATA-07/08                |
| ENG-10  | Duplicate/out-of-order provider events and crash after provider call do not duplicate charge/admission          | E-API-06                    |
| ENG-11  | Two partial refunds cannot reserve more than captured amount; unknown outcome does not free balance             | E-API-06                    |
| ENG-12  | Worker crash before/after job claim/external result; stale epoch cannot complete newer lease                    | E-LIVE-01/02                |
| ENG-13  | Deterministic game replay, clock pauses/substitutions/OT/corrections; sum accepted stints matches lineup time   | E-LIVE-03/04/06             |
| ENG-14  | Zero-point appearance vs DNP vs unknown; partial coverage never fabricates PPG                                  | E-LIVE-04                   |
| ENG-15  | Device offline/refresh/token expiry/takeover; acknowledged events preserved and divergent queue not auto-merged | E-LIVE-05                   |
| ENG-16  | Result corrected during rebuild; only matching target projection activates; no mixed standings rows             | E-LIVE-06                   |
| ENG-17  | Two editors race publish; malformed/unknown/private block cannot publish; rollback respects new privacy policy  | E-CONFIG-03/04/07           |
| ENG-18  | Two leagues use different themes/modules; upgrade/disable/re-enable without losing award history                | E-CONFIG-08/09              |
| ENG-19  | Scheduled reminder becomes stale after reschedule/revocation; no private notification sent                      | E-LIVE-08                   |
| ENG-20  | Malicious file/URL/export field and canary secret produce no execution/disclosure/log leak                      | E-SEC-06/07                 |
| ENG-21  | Restore DB + objects, replay deletion ledger, reconcile provider effects, measure actual RPO/RTO                | E-OPS-08                    |
| ENG-22  | Envelope B mixed load + large-tenant skew + unfair-import pressure pass latency/correctness/headroom            | E-OPS-01–04                 |
| ENG-23  | Keyboard, 360 px, 200% zoom, screen reader core flows and real courtside device rehearsal                       | E-CONFIG-02/03/10, E-OPS-05 |
| ENG-24  | Account/tenant export, closure, limited-plan access and domain cleanup do not leak/delete other tenants         | E-SEC-08, E-API-08          |

Use property-based tests for brackets, standings comparators, capacity/refund sequences and deterministic reducers, with small independently calculated fixtures as oracles. Real database tests prove constraints/permissions/concurrency. Provider contract tests prove adapters. Browser/device tests prove recovery and usability. Load/recovery tests prove operational claims. No one test layer substitutes for another.

## E-BUILD-06 — Technical recommendations versus open business decisions

Engineering can proceed with the recommended modular structure, typed contracts, tenant keys, versioned editor, atomic commands, outbox and security boundaries without asking the founder how to write SQL. Track these proposed ADRs during T0–T2:

| ADR topic           | Starting decision                                                              | Revisit only if                                                               |
| ------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Stack/runtime       | Next/React + strict TypeScript, Node 24 compatibility baseline, npm workspaces | Supported-version/provider spike fails or materially better verified tradeoff |
| SQL/data access     | Managed PostgreSQL, SQL migrations, typed query adapters                       | Provider constraint/pooling/performance evidence conflicts                    |
| Auth/session        | Supabase Auth supported SSR/PKCE + live DB grants/MFA                          | Required assurance/recovery/region/enterprise need cannot be met              |
| Editor              | Typed semantic tokens and block registry, draft/publish                        | Real product requirement needs a reviewed new composition primitive           |
| Async               | PostgreSQL outbox/jobs, independently scaled workers                           | Measured database/job contention or delivery requirement warrants extraction  |
| Public live updates | Cached polling snapshots initially                                             | Freshness/cost/access evidence justifies scoped push                          |
| Extensions          | Platform-owned reusable modules with typed config                              | A viable external developer ecosystem warrants sandbox/API investment         |

Founder/product decisions still needed: first market/age groups and supported sport modes; subscription/package price; organizer versus platform merchant responsibilities; paid-waitlist/refund policy; default publication policy; operating/support hours and promises; launch budget; which capabilities must be in the first sellable release. Engineering owns producing a recommended provider/region/cost assessment from those constraints. Legal/commercial policy cannot be manufactured by a technical spec.

## E-BUILD-07 — Definition of ready for an implementation issue

Each issue links product IDs and engineering IDs and includes: actor/outcome; supported configuration; schema and migration changes; command/query contract; permission/field scope; transaction locks/retry behavior; UI states; telemetry; acceptance test IDs; rollout/rollback; and dependencies. Add exact fields/edge cases where the feature introduces details not already defined here. A developer should not have to choose refund liability, redefine GP or invent tenant ownership while implementing a button.

An issue is done only when code, tests, migrations, operational changes and documentation agree and evidence is recorded. `docs/architecture/decisions` records accepted deviations. An unavailable requirement is marked unavailable in setup/help; it is not silently simulated with localStorage. Keep customer-specific proposals in `docs/initiatives` and reusable behavior in the product/module contracts.

## E-BUILD-08 — Specification maturity and residual work

Completed in this revision: recommended package/file topology; module boundaries; main entity field/constraint dictionary; baseline permission/field model; website/block/settings schemas; command inventory and transaction protocols; live/offline/job/projection design; performance/recovery budgets; delivery/test traceability.

Still to produce during implementation: compiled shared schemas and full OpenAPI, executable migrations/policies/helper functions, detailed wireframes for each nontrivial form/error state, complete sport preset/event catalogue with test fixtures, exact supported provider versions/plans, region/merchant/legal policy choices, measured cost/load/recovery reports, staffing/estimates and independent security review scope. These are named deliverables with gates, not reasons to leave the architecture vague. Do not claim every future enterprise workflow is specified to implementation depth; add its contracts before building or selling it.
