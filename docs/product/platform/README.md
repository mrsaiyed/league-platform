# League platform: product and engineering specifications

**Specification baseline v0.7 · October 27, 2026 · Shared product with stats-first delivery · Approval pending by section**

**The product is an end-to-end league management platform that gives each league its own customizable public website and private administration dashboard, with shared core tools and optional features for its specific needs.**

Organizers can sign up, configure their website and league rules, and manage registration, payments, teams, schedules, live statistics, communications, and season history in one place.

The immediate implementation use case is Al-Hadi varsity keeping its own basketball records in the externally operated TCSAAL competition. Intramurals follow later. This does not establish a school partnership contract, participation price, calendar, roster size or operating-services agreement. The platform serves league organizers; customers arrange the real-world operation of their programs unless a separate service agreement says otherwise.

## What this package is

This is the active specification set for the overall product. The thirteen product sections define behavior and business boundaries; the [detailed engineering package](engineering/README.md) specifies repository/files, database fields and constraints, admin/page-builder schemas, API transactions, security controls, durable scoring/jobs, capacity budgets and implementation evidence. It reuses lessons from earlier work while removing dependence on one customer's requirements. It is not a finished implementation, a fixed delivery estimate, or approval of every recommendation.

**For how we build the product, start with the [engineering specification](engineering/README.md) and the [current varsity implementation contract](../../initiatives/alhadi-varsity/02-engineering-contract.md).** It supplies concrete engineering recommendations rather than leaving scalability, maintainability and customization as general aspirations.

The [active varsity initiative](../../initiatives/alhadi-varsity/README.md) defines the first scoring slice. The [intramural initiative](../../initiatives/alhadi-intramural/README.md) is preserved separately for later. Its architectural lessons are carried forward through the coverage map in section 13. Active product requirements must be understandable without reading a customer proposal.

## Target range and release language

| Level                          | Product setting                                              | Design implication                                                                  |
| ------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Team in an outside competition | Team keeps roster, fixtures and its own game records         | External source references; team-owned records separated from host-official results |
| Independent league             | One organizer, a few teams, one season or bracket            | Quick setup, clear public pages, simple defaults, no enterprise clutter             |
| Multi-program operator         | Several leagues, divisions, venues, seasons, tournaments     | Concurrent competitions, recurring teams, shared resources, bulk administration     |
| Affiliated network             | Clubs/institutions participating in hosted competitions      | Scoped delegation, membership/eligibility, authorized data sharing                  |
| Governing body                 | Regions, classifications, qualification, institutional rules | Effective policies, appeals, integration, operational and contractual evidence      |

These levels define the long-term range. They are not a promise that every sport or every governance model is available in the first release. **Basketball remains the proposed first sport**, based on the product's origin and existing knowledge; its launch scope is a decision to confirm, not a customer requirement.

**Foundation** means a boundary that must be right when first implemented: ownership, identifiers, permissions, transactions, revisions, provider separation. **Core release** means a usable product for the chosen initial segment. **Expansion** means a later capability with a named dependency and acceptance gate. A feature does not become core merely because the architecture anticipates it.

## Section map

| Section | Document                                                                               | Specification work it owns                                                                         |
| ------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 01      | [Product, business, and scope](01-product-business-scope.md)                           | Users, product boundaries, packaging, commercial responsibilities, success measures                |
| 02      | [Domain model, ownership, and data](02-domain-ownership-data.md)                       | Workspace/institution model, competitions, entities, constraints, history, data lifecycle          |
| 03      | [Onboarding, configuration, and websites](03-onboarding-configuration-websites.md)     | Self-service setup, admin experience, page composition, themes, extensions, domains                |
| 04      | [Identity, permissions, security, and privacy](04-identity-security-privacy.md)        | Authentication, authorization, isolation, sensitive data, consent, abuse, incident controls        |
| 05      | [Registration, admission, and membership](05-registration-admission-membership.md)     | Individual/team/import paths, capacity, waitlists, eligibility, participant relationships          |
| 06      | [Billing, payments, and finance](06-billing-payments-finance.md)                       | SaaS billing, customer merchants, checkout, refunds, disputes, reconciliation                      |
| 07      | [Teams, competition, and scheduling](07-teams-competition-scheduling.md)               | Rosters, drafts, formats, qualification, venues, officials, schedule publication                   |
| 08      | [Game operations, results, and statistics](08-game-operations-results-statistics.md)   | Capture modes, live scoring, clocks/minutes, offline recovery, corrections, rankings               |
| 09      | [Communication, media, and engagement](09-communication-media-engagement.md)           | Accounts/inbox, notifications, announcements, video, awards, archives                              |
| 10      | [Architecture, APIs, and integrations](10-architecture-apis-integrations.md)           | Stack choices, module boundaries, repository shape, commands, jobs, provider contracts             |
| 11      | [Reliability, delivery, and quality](11-reliability-delivery-quality.md)               | Targets, backups, testing, deployment, monitoring, support, costs                                  |
| 12      | [Scale, governance, and enterprise](12-scale-governance-enterprise.md)                 | Network administration, policy authority, large workloads, integrations, enterprise gates          |
| 13      | [Decisions, roadmap, and specification completion](13-decisions-roadmap-validation.md) | Review order, open decisions, release slices, coverage map, reference fixtures, approval checklist |

## Rules for interpreting the draft

- The two opening product statements and the customer-independent direction are **founder direction**. Most implementation and sequencing details are **proposed** until explicitly approved.
- Requirements use new section-scoped IDs (`PB`, `DM`, `CW`, `SP`, `EN`, `FN`, `CP`, `GS`, `ME`, `AT`, `RQ`, `EG`). Historical v0.3 IDs retain their meanings only in the archived snapshot.
- “Must” specifies an intended acceptance condition after approval. Open choices stay visible in section 13; elapsed time or silence never means agreement.
- A prototype screen is a design reference. It does not prove authentication, persistence, merchant readiness, or permission enforcement.
- Customer templates can choose optional steps, fields, and modules. They cannot override access controls, authoritative financial records, or required policy constraints.

## Proposed planning order

Immediate order: reusable basketball scoring and persistent team records first; a private hosted SQL pilot now; full game-day resilience and self-service league setup/website customization afterward. Registration, payments and drafts are not dependencies for rehearsing this stat slice. The [build plan](engineering/08-build-plan-and-evidence.md) records the gates.

For the broader offer, agree product boundaries and the initial independent-league offer (01). Then settle ownership and permissions (02/04) alongside the onboarding/editor contract (03). Next specify enrollment/finance (05/06), competition and scoring (07/08), and communication (09). Architecture and operational review (10/11) run across those contracts rather than waiting until the end. Enterprise scenarios (12) test the model early; enterprise implementation follows actual demand and readiness gates. Section 13 records decisions and turns each approved workflow into a buildable contract.

The engineering package now defines the main screen/state map, entity field dictionary, request/event examples, transaction design, threat controls, editor contracts, workload targets and acceptance test plan. Executable schemas/migrations, detailed visual wireframes, complete sport fixtures, provider/budget evidence, market policies and estimates are tracked in its [build plan](engineering/08-build-plan-and-evidence.md). Writing the design does not establish that its production implementation or load targets have already passed.
