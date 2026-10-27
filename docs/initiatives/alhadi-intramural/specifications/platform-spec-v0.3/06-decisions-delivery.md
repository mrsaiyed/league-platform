# 06 — Decisions, review, and delivery

> Historical snapshot: this prospective-client initiative is inactive. Use the [active overall product plan](../../../../product/platform/README.md) for current direction. Earlier approval/customer statements below retain their historical context.

[Back to specification map](README.md)

This chapter turns the draft into an approval and delivery process. Recommendations below are not recorded agreements. The founder owns product priorities; named school representatives approve their operating responsibilities; qualified advisers resolve legal and accounting questions; engineering owns implementation evidence and reports remaining risks.

## Decision register

Record the owner, decision date, rationale, affected requirement IDs, and revision whenever a row is resolved. “Before” identifies a dependency, not a promised delivery date.

| ID   | Decision                                               | Proposed starting position                                                                                                                                                                                                                         | Must resolve before                     |
| ---- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| D-01 | Platform customer and operating parties                | Organization owns its league workspace; our business licenses software and separately contracts any Al-Hadi operating services. Name the actual contracting entities.                                                                              | Contracts, organization ownership       |
| D-02 | Merchant, settlement recipient, jurisdiction, currency | Identify the legal merchant for this pilot, its payment account, refund liability, tax/receipt obligations, and USD approval. Do not infer these from “we collect.”                                                                                | Live checkout                           |
| D-03 | Pilot price and included services                      | Proposal says $75 and operator retains registration revenue. Approve inclusions, fees, discounts, cancellation treatment, and any tax treatment.                                                                                                   | Enrollment publication                  |
| D-04 | Paid waitlist policy                                   | Preserve founder direction: pay at application, including waiting applicants. Disclose that payment does not guarantee admission. Set maximum paid waiting places, release conditions, refund deadline, and who bears nonreturned processing fees. | Live checkout                           |
| D-05 | Priority and capacity allocation                       | Grade 9–12 phase followed by grade 8; verified payment processing obtains a server allocation sequence. Pending school review provisionally reserves a place. Decide review timeout and whether grade-8 applications/payments are accepted early.  | Registration transaction implementation |
| D-06 | Eligibility and rejected applicants                    | Authorized school reviewer verifies school/grade eligibility. Decide evidence, rejection reasons, appeal/override powers, review turnaround, and required refund workflow.                                                                         | Student applications                    |
| D-07 | Student, guardian, and payer relationships             | Verified account is separate from participant and payer. Determine age handling, required guardian authority/consent, and the actual privacy obligations for this school and our business.                                                         | Collecting real student data            |
| D-08 | Public student information and media                   | Approve permitted name format, roster/leaderboard visibility, headshot/photo/video permissions, withdrawal handling, and private participation options.                                                                                            | Public roster or media publication      |
| D-09 | Registration field list and policy text                | Collect only approved necessary information. Define each field, purpose, validation, visibility, retention, and required acknowledgments. Defer sensitive medical data unless there is a justified, separately designed need.                      | Final registration UI/schema            |
| D-10 | Staff roles and separation                             | Use commissioner, eligibility reviewer, finance, captain, and assigned scorekeeper presets. Decide who may issue refunds, reverse picks, correct final games, and publish student data.                                                            | Staff invitations                       |
| D-11 | Captain selection and draft format                     | Four captains occupy four of 28 roster places; 24 remaining players are drafted by a single host. Approve draft order, snake/linear format, selection rules, absence handling, and pick reversal policy.                                           | Team formation                          |
| D-12 | Basketball rules and participation                     | Approve periods, game-clock rules, overtime, timeouts, fouls, substitutions, score correction, and participation requirements. Check that the chosen format fits the proposed 45-minute game slots.                                                | Scorer and scheduler acceptance         |
| D-13 | Season competition and ranking                         | Decide regular-season fixtures, number of meetings, tie-breakers, forfeits, abandoned games, playoffs, seeding, and award eligibility.                                                                                                             | Schedule generation and standings       |
| D-14 | Calendar and facility constraints                      | School approves exact dates, closures, prayer breaks, court availability, staff coverage, and final-session deadline. The proposal calendar remains tentative.                                                                                     | Schedule publication                    |
| D-15 | Statistics scope and visibility                        | Pilot requires scores, player points, recorded minutes/appearances, games played, and PPG. Decide whether richer statistics are required at launch and how incomplete/manual records appear.                                                       | Scorer scope and public tables          |
| D-16 | External games and school fundraising                  | External games have separate classification and aggregation. Treat tickets/concessions as school operations initially; approve any future collection separately. Confirm whether recording external-game stats is a pilot requirement.             | External-event implementation           |
| D-17 | Customization depth                                    | Typed settings, supported rule presets, approved form fields, theme tokens, and content blocks; no arbitrary customer code or unlimited workflow builder. Identify the settings essential for client two.                                          | Admin UX and configuration schemas      |
| D-18 | Notifications and media                                | Website inbox plus selected transactional email. Approve sender, templates, reminder timing, recipients, media provider, moderation, and school communications policy. Native apps and web push are later.                                         | Real notifications/media                |
| D-19 | Stack, region, providers, budget                       | Evaluate proposed Next.js/TypeScript/PostgreSQL/Supabase stack and hosting/worker/payment/email/storage providers against region, contracts, operational skill, and a written monthly budget.                                                      | Production infrastructure purchase      |
| D-20 | Recovery, retention, and deletion                      | Approve backup plan and tested recovery targets, exact retention schedule by data class, deletion exceptions, and restore-time reapplication of deletions.                                                                                         | Real data and launch readiness          |
| D-21 | Courtside hardware and offline limits                  | Select supported tablets/browsers, scorekeeper training, Wi-Fi test, short-outage recovery protocol, and paper fallback. Do not promise indefinite offline operation.                                                                              | Scoring rehearsal                       |
| D-22 | Platform commercial model                              | Set buyer segment, subscription/per-season pricing hypothesis, service boundaries, support hours, billing owner, entitlements, and cancellation/export terms. Keep participation fees separate from platform revenue.                              | Selling beyond the pilot                |
| D-23 | Launch scope and accountability                        | Name delivery owner, security reviewer, payment/operations owner, and school approver. Approve phased release gates and what can be omitted without breaking the program.                                                                          | Implementation commitment               |
| D-24 | Reuse and intellectual property                        | Verify rights and engineering suitability before porting Faraj code. Confirm ownership/license policy and permitted use of school artwork and supplied photos.                                                                                     | Code or asset reuse in production       |

The highest-impact initial decisions are D-01 through D-08. Registration, finance, permissions, and public pages all depend on them. Choosing a frontend library does not resolve those product contracts.

The platform fit review adds structural decisions that must be discussed before approving the first production schema, even when their full user interfaces ship later:

| ID   | Decision                                        | Proposed starting position                                                                                                                          | Must resolve before                                                           |
| ---- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| D-25 | Workspace, institution, and governing authority | Separate data-owning workspace from participating institution and administrative unit; explicit affiliation/delegation, no inherited blanket access | Base identity/ownership model; federation ADR before cross-workspace features |
| D-26 | Competition and entry boundaries                | Explicit competition under season; entry and roster scopes; one default competition hidden in the pilot UI                                          | First competition/registration schema                                         |
| D-27 | General-product enrollment and capture modes    | Support individual/team/invite/import paths incrementally; payment and draft optional; live events, box score, or final score capture               | Workflow schema; supported-mode list before independent-league sale           |
| D-28 | Website builder and first optional extension    | Approve block catalog, module lifecycle, request pricing/maintenance; discover exact Faraj trophy behavior                                          | Public editor/module implementation                                           |
| D-29 | Customer sequence and claims                    | Al-Hadi pilot → independent leagues/multi-program operators → affiliated networks → separately validated governing-body scope                       | Sales roadmap and engineering estimates                                       |
| D-30 | Enterprise workflows and integrations           | Discover policies, credentials/appeals, officials, SSO, imported systems, financial responsibility, and target load with actual buyer               | Network product commitment; no automatic claim of full UIL parity             |

## Review sequence

Review one coherent area at a time. For each meeting, record **approved**, **revise**, **defer**, or **reject** against requirements; do not treat an unanswered question as approval.

| Review                               | Material to discuss                                                                           | Concrete output                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1. Business and pilot boundary       | Proposal, SaaS versus operating services, actors, launch scope, commercial responsibilities   | One-page service/product boundary; owners; approved launch outcomes                   |
| 2. People, applications, and money   | Account/participant/payer, school and guardian roles, capacity, paid waitlist, refunds        | Registration state diagram, final field inventory, enrollment/payment/refund policy   |
| 3. Competition and game operations   | Captains, draft, calendar, basketball clock, participation, finalization, corrections         | Approved rules preset, worked example season, complete scoring rehearsal script       |
| 4. Configuration and user experience | Settings catalog, public/player/staff navigation, forms, mobile layouts, publication          | Screen inventory and wireframes; setting defaults and change-impact rules             |
| 5. Data and security                 | Threat model, role matrix, entity dictionary, tenant isolation, public projections, retention | Reviewed schema/API contracts, access tests, vendor/data-handling decisions           |
| 6. Delivery and operations           | Budget, hosting, backups, support, tests, scale, release/rollback                             | Cost estimate, dependency-based backlog, named release approvers and launch checklist |

A decision that crosses sections must update all affected contracts. For example, changing captain eligibility can affect registration, draft pool membership, roster capacity, permissions, and notification wording.

## Delivery sequence and release gates

Build complete workflows with real authorization and persistence. Add planned folders/modules when used; empty scaffolding does not prove an architecture works. Dates and estimates follow approved scope, team capacity, and an implementation spike.

### Gate 0 — Agree on the launch contract

- Resolve the decisions necessary for the first production slice and record remaining blockers by activity.
- Establish the threat model, approved field list, permission matrix, and legal/commercial responsibility map.
- Review D-25–D-30 and the chapter 07 reference scenarios. Include competition/entry scope in the pilot schema and preserve workspace/identity boundaries; do not implement unused federation tables solely for this review.
- Create a small estimate/risk spike for authentication, scoped database access, payment setup, and courtside persistence.
- Keep the current demo as a design reference with fictional records.

**Exit evidence:** approved scope, owners, decision record, screen inventory, initial schema/command contracts, and budget range with stated assumptions.

### Gate 1 — Prove identity and organization isolation

- Implement verified identities, organization membership, participant relationships, staff invitations, and private application status.
- Create at least two isolated test organizations and two unrelated players within each. Test both cross-organization and same-organization access boundaries.
- Deliver the basic public league shell using an explicit approved public projection.
- Install audit, secrets management, staging, migrations, observability, and backup mechanisms required by this slice.

**Exit evidence:** passing database/API access tests; no real student data until the relevant privacy/security gates are satisfied.

### Gate 2 — Open safe paid registration

- Deliver eligibility review, priority phases, capacity allocation, paid waitlist, hosted payment, receipts, private status, and enrollment notifications.
- Implement webhook replay protection, reconciliation, refund requests/status, and support visibility.
- Exercise rejected applicants, late payments, duplicate requests, oversubscription, withdrawals, and full/partial refunds in the provider's test environment.
- Test restoration and the post-restore reconciliation workflow before relying on the system for money and applications.

**Exit evidence:** approved school/merchant policies; registration/payments acceptance cases; staff rehearsal; release approval for enrollment. Enrollment may open before later game features are released if the delivery dependency and fallback plan are explicitly approved.

### Gate 3 — Form teams and publish the season

- Deliver captain assignment, reviewed draft pool, host lease, atomic picks, pick correction, and roster publication.
- Deliver session and game scheduling, conflict checks, school calendar constraints, and revision-aware notifications.
- Preview standings/rules using fixtures that match the approved basketball preset.

**Exit evidence:** complete rehearsal from approved players to drafted teams and conflict-free published schedule, including duplicate-pick and simultaneous-edit cases.

### Gate 4 — Run and finalize a game reliably

- Deliver scorer authorization, game clock, lineups, durable events, short-outage handling, score/participation reconciliation, submission, and finalization.
- Deliver public statistics, results, and standings from approved finalized projections; live views clearly identify provisional data.
- Exercise correction after publication and the effect on averages, standings, notifications, and already seeded playoffs.
- Rehearse on the actual supported courtside device and venue network with the designated staff.

**Exit evidence:** an entire practice game with a network interruption, browser restart, scorer handover/conflict, finalization, correction, and paper fallback. Minutes and zero-point appearances match the game record.

### Gate 5 — Complete the season experience

- Deliver remaining approved media, reports, notification preferences, archives, and customer exports.
- Review accessible/mobile behavior and consistent school branding across public and private surfaces.
- Review the support runbooks, retention jobs, tenant exit, storage restoration, and cost alerts.

**Exit evidence:** end-to-end season rehearsal, prioritized defect review, release notes, and named operational ownership. Pull any item needed earlier—such as a registration email—into its dependent gate.

### Gate 6 — Pilot learning and shared-product proof

- Run the approved pilot with monitored operations and log actual support work, errors, costs, and configuration requests.
- Onboard a second organization with meaningfully different branding, capacity, scheduling, and competition settings using configuration and supported presets.
- Before claiming independent-league readiness, pass X-01–X-04, X-07, and the self-service portion of X-08: six-team bracket, configured extension, concurrent competitions, team/import/free-entry modes, mixed capture, and setup without developer intervention. Enable only modes whose tests pass.
- Investigate any request requiring a customer-specific code branch; decide whether it merits a reusable capability or is outside the product.
- Revisit pricing, repeatability, backup/scale targets, and staffing before wider sale.

**Exit evidence:** second-organization onboarding without a code fork; tested isolation; measured cost/support profile; updated commercial and technical readiness decision. This is stronger evidence of a platform than a large list of unused features.

### Gate 7 — Affiliated networks and governing-body readiness

- Complete actual institutional discovery and scoped contracts; do not treat a public competitor page as a full feature specification.
- Implement approved affiliations/delegation, credential and eligibility/appeal workflows, policy locks, alignment/qualification, officials, and integrations required by that buyer.
- Pass X-05/X-06 and cross-workspace privacy/permission tests; validate legacy-data import, conflicting source corrections, revocation, and historical retention.
- Run one-large-workspace and many-small-workspace workloads from OPS-17; complete the operations, identity, migration, and commercial evidence in OPS-18.

**Exit evidence:** approved institutional scope, measured capacity/recovery, security assessment, supported integration contracts, staffed support, and buyer acceptance. This gate can be split by institutional customer type; no single synthetic exercise certifies UIL readiness or support for every sport.

## Foundation now, capability later

| Foundation to implement with its first workflow                                    | Capability that can wait                                         | How it expands                                                                                                    |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Workspace ownership, competition/entry scope, roles, explicit affiliation contract | Federation UI and cross-workspace workflows                      | Dedicated sharing/delegation commands; no automatic authority from hierarchy                                      |
| Versioned typed basketball rules                                                   | Additional sports                                                | Add sport adapters and sport-specific projections without changing payment/identity boundaries                    |
| Identity separate from participant/guardian/payer; entry/payment/capture modes     | Family packages and federation memberships                       | Team/import/free-entry modes before independent-league sale; later types use approved contracts                   |
| Tenant-safe payment adapter and financial ledger                                   | Automated SaaS billing, payouts for independent league merchants | Implement approved provider/account model and billing module; do not reuse participation orders for subscriptions |
| Outbox and notification preferences                                                | Native app, browser push, advanced campaigns                     | Add authorized channels without replacing business events                                                         |
| Approved page blocks/theme tokens and publication versions                         | More templates and custom domains                                | Extend template catalog and routing with the same authorization model                                             |
| Immutable final-result revisions and scoped aggregates                             | Cross-season records, analytics, richer awards                   | Build new read projections with provenance and retention rules                                                    |
| Durable game events and controlled ownership                                       | Longer offline operation or multiple concurrent scorers          | Separate, explicitly designed synchronization project with conflict semantics                                     |
| Private media storage and reviewed external links                                  | Hosted video processing and richer editing                       | Add sandboxed media jobs, moderation, quotas, and cost controls                                                   |

“Foundation now” does not mean building every future adapter. It means protecting the relevant boundary and avoiding identifiers, tables, or contracts that assume Al-Hadi is the only customer.

## Critical acceptance scenarios

These are release-test scenarios, not a substitute for the detailed acceptance criteria in each chapter. Implement them at the lowest reliable layer and exercise the key user journeys in a browser.

| Scenario                       | Expected evidence                                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-01 Tenant and peer isolation | Another organization's IDs and another student's IDs fail through pages, APIs, direct database access, downloads, realtime, and caches                         |
| A-02 Last available place      | Concurrent paid applications cannot exceed approved capacity; allocation and waitlist outcomes are recorded and explained                                      |
| A-03 Payment uncertainty       | Closing checkout, late webhook delivery, retries, and reordered events produce one correct financial outcome and an honest UI state                            |
| A-04 Refund uncertainty        | Repeated refund requests, provider failure, partial refunds, and webhooks cannot refund more than the remaining allowable amount                               |
| A-05 School review             | Verification, rejection, promotion, and authorized exceptions update admission appropriately without exposing private review information                       |
| A-06 Draft contention          | Two commands for the same player/pick, stale hosts, and retries produce one valid selection; roster limits hold                                                |
| A-07 Schedule conflicts        | Published court bookings cannot overlap within the protected scope; school closures, breaks, and revision notifications behave correctly                       |
| A-08 Participation accuracy    | Zero points with an appearance counts as played; missing a game does not; unknown minutes stay unknown; lineup intervals conserve the applicable court time    |
| A-09 Scorer recovery           | Acknowledged events survive refresh; queued offline work is visible; expired ownership cannot silently overwrite another scorer's work                         |
| A-10 Final correction          | Correcting a finalized result produces a new revision, attributable audit, consistent aggregates, and explicit handling of downstream competition effects      |
| A-11 Notification safety       | Private content goes only to authorized recipients; changed/canceled fixtures invalidate old reminder jobs; retries do not create uncontrolled duplicates      |
| A-12 Publication and media     | Only approved public fields/assets appear; revoked publication removes them from managed public views and caches according to policy                           |
| A-13 Restore                   | Database and assets restore within the accepted measured target; financial reconciliation, deletion reapplication, and controlled job restart are demonstrated |
| A-14 Mobile and accessibility  | Registration, own status, schedule lookup, scoring, and key admin actions work on supported devices with keyboard/screen-reader checks                         |
| A-15 Shared product            | A second organization configures and operates its season without receiving a copied application or access to Al-Hadi's records                                 |

## Proposal traceability

| Proposal coverage                                | Specification owners                | Key validation                                      |
| ------------------------------------------------ | ----------------------------------- | --------------------------------------------------- |
| Participants, eligibility, teams, pp.2/4         | REG, DFT, SEC, PRI                  | A-01, A-02, A-05, A-06                              |
| Weekly calendar and game/training format, pp.2–3 | CFG, SCH, GAM                       | A-07, A-08, A-09                                    |
| Staff operations and communications, p.4         | BIZ, MSG, OPS                       | A-09, A-11, A-13                                    |
| Participation payment, p.5                       | PAY, REG, SEC                       | A-02, A-03, A-04                                    |
| Public website and statistics, p.6               | UX, STA, MED, PRI                   | A-10, A-12, A-14                                    |
| External games and future sports, p.7            | SCH, STA, ARC                       | Separate game scope; future adapter contract        |
| School fundraising, p.8                          | BIZ, configuration scope            | Informational scope only unless separately approved |
| Engagement and launch, p.9                       | Decision register and release gates | Named approval and operating responsibilities       |

## What makes an approved feature implementation-ready

For each feature, complete the following contract before assigning a final estimate:

1. Actor, business outcome, workflow state diagram, prerequisites, and scope exclusions.
2. Wireframes for desktop/mobile as relevant, including empty, loading, error, pending, denied, and recovery states.
3. Field dictionary: type, enum, unit, bounds, required/default rules, validation, sensitivity, ownership, and retention.
4. Permissions for reads, writes, exports, publication, exceptions, and support access.
5. Data model, migrations, scoped foreign keys, unique constraints, transaction locks, and indexes.
6. Command/query schema, error contract, idempotency, expected revision, pagination, and rate/size limits.
7. Side effects, outbox messages, provider handling, audit entries, and public projection/caching behavior.
8. Acceptance cases, race/retry/failure cases, accessibility checks, and tests appropriate to the risk.
9. Monitoring, backup/restore implications, runbook, rollback/compatibility plan, and support ownership.
10. Dependency-based estimate, approved release gate, and explicit unresolved decisions.

Maintain a traceable backlog from these approved contracts. Revisit the draft when a decision changes; do not allow implementation assumptions to silently become customer policy.
