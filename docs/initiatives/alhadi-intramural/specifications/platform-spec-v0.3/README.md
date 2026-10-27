# League platform: product and engineering specification

> Historical snapshot: this prospective-client initiative is inactive. Use the [active overall product plan](../../../../product/platform/README.md) for current direction. Earlier approval/customer statements below retain their historical context.

**Draft v0.3 | October 11, 2026 | Owner: founder | Approval: pending discussion**

This is a proposed specification for one configurable league-management platform. Al-Hadi is its first organization and operating example. The current website is a presentation prototype; it does not implement the authentication, database isolation, payments, recovery, or security controls described here.

## Read this first

**The product is an end-to-end league management platform that gives each league its own customizable public website and private administration dashboard, with shared core tools and optional features for its specific needs.**

Organizers can sign up, configure their website and league rules, and manage registration, payments, teams, schedules, live statistics, communications, and season history in one place.

**Intended range:** a small independent league; an operator running multiple leagues, divisions, and tournaments; and, over time, a sports governing body coordinating affiliated schools/clubs. Al-Hadi is the first implementation, not the definition of every customer's workflow. Individual payment, school approval, drafts, and detailed live scoring are selectable capabilities. A league can use an approved team-entry, free-entry, roster-import, or results-only path as those capabilities are released.

The [platform fit review](07-platform-fit-review.md) evaluates the complete draft against Faraj-, Filhoops-, RSportz-, and UIL-like scenarios. It records foundational gaps, corrections, evidence limits, and the expansion tests required. Its recommendations have been incorporated below and in the companion chapters; they are not claims of enterprise readiness.

An organization gets public league pages, a private participant portal, and a staff workspace. Our platform operators get a separate support and business console. Each organization uses the same maintained application. Themes, policies, rule presets, and enabled modules differentiate its experience.

We can draft the full structure now. We should approve it in sections before converting it into implementation tickets. This package contains concrete proposed behavior, data contracts, security boundaries, acceptance cases, and a review sequence. Exact screen wireframes, executable database migrations, full API schemas, and finalized legal/commercial terms remain subsequent deliverables.

### Authority and status

| Label             | Meaning                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Founder direction | Explicitly requested in this conversation; governs product intent                                 |
| Proposal baseline | Stated in the supplied Al-Hadi v4 PDF; not evidence of a signed agreement or approved launch date |
| Recommended       | Engineering/product choice proposed for agreement                                                 |
| Open              | Decision required; use the numbered decision register                                             |
| Later             | Deliberately deferred functionality with a defined extension point                                |

Unless explicitly identified as founder direction or proposal baseline, requirements in these documents are **recommended**. “Must” describes the proposed acceptance contract after approval, not an assertion that the founder has already agreed. Security and integrity requirements are recommended release gates, not optional theme settings.

This package becomes the current discussion baseline. It supersedes conflicting pilot assumptions in [v0.1](../school-pilot-spec-v0.1.md) and incorporates the direction in [accounts and notifications v0.2](../accounts-and-notifications-v0.2.md). Those documents remain historical references. The screenshots are design references, not requirements evidence for hidden functionality.

## Specification map

| Document                                                                        | Broad question                                       | Specific contents                                                                                                                                       |
| ------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [01 Product, configuration, and UI](01-product-configuration-ui.md)             | What is the product and how configurable is it?      | Tenant hierarchy, feature scope, settings catalog, versioning, roles, page inventory, branding, accessibility, onboarding                               |
| [02 League workflows](02-league-workflows.md)                                   | How does a league actually run?                      | Signup, eligibility, payments, capacity races, refunds, draft transactions, schedules, live clocks, durable minutes, corrections, communications, media |
| [03 Architecture, database, and APIs](03-architecture-data-api.md)              | What do we build and how do we keep it maintainable? | Proposed stack, module boundaries, repository skeleton, entity/field contracts, constraints, indexes, command APIs, concurrency, integration boundaries |
| [04 Security and privacy](04-security-privacy.md)                               | How do we protect customers, money, and students?    | Threat model, permission matrix, tenant isolation, authentication, school privacy, media consent, uploads, audit, incident response                     |
| [05 Reliability, quality, and operations](05-reliability-quality-operations.md) | How do we run and verify the product?                | Availability and latency targets, scale tiers, load scenarios, backups, restores, costs, testing, deployment, support, migration                        |
| [06 Decisions and delivery](06-decisions-delivery.md)                           | What do we settle and build first?                   | Decision register, dependencies, release gates, review workshops, acceptance scenarios, expansion triggers                                              |
| [07 Platform fit review](07-platform-fit-review.md)                             | Does the design fit the long-term product?           | Evidence, 14 gaps, ownership model, trophy extension, reference scenarios, phased corrections                                                           |

Each document covers pilot behavior, the shared product boundary, failure cases, and expansion. Requirement prefixes are discussion handles: BIZ, CFG, UX, REG, PAY, DFT, SCH, GAM, STA, MSG, MED, ARC, DAT, API, SEC, PRI, OPS, QA, REL. They must remain stable when wording changes.

## Al-Hadi baseline and differences from earlier discussion

Source: **Al-Hadi-Intramural-Basketball-Proposal-v4.pdf**, supplied by the founder on October 11. Page references below refer to that nine-page document, not the later screenshot deck.

| Topic          | Current proposal baseline                                                           | Product implication                                                                             |
| -------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Participants   | 28 boys; four teams of seven, p.2                                                   | A season capacity and roster configuration; never a platform-wide constant                      |
| Eligibility    | Grades 9–12 get priority; remaining places open to grade 8 after a deadline, p.2    | Phased admission and school review; grade is not reliable proof of age                          |
| Period         | November 2026–February 2027; final calendar to follow school approval, pp.1–3       | Proposed dates, not automatic published fixtures; specific finish date remains open             |
| Sessions       | Mondays/Thursdays, 4:00–6:30 p.m.; separate game and training formats, p.3          | Session/event model supports games, practice, warmup, breaks, and dismissal                     |
| Game days      | Each team plays once; two game slots proposed, pp.2–3                               | Four-team scheduling constraints with buffers and venue availability                            |
| Fee            | $75 per student; our operators retain registration revenue, p.5                     | Replaces earlier approximate $50 assumption; USD and merchant identity still to approve         |
| Services       | Our team handles coaching, referees, equipment, logistics, media, and software, p.4 | This customer includes an operating-service package; SaaS customers can supply their own staff  |
| School role    | Facility and student eligibility, p.4                                               | School reviewers can have narrowly scoped approval access                                       |
| External games | $100 per school per game when arranged by our team, p.7                             | Separate event classification and charge category; exclude from intramural standings by default |
| Other leagues  | Al-Hadi handles leagues it joins itself, p.7                                        | External participation can be recorded without claiming we operate that league                  |
| Fundraising    | School retains ticket/concession proceeds, p.8                                      | Informational links initially; online ticketing, concessions, and raffles are separate scope    |
| Agreement      | Services and terms confirmed through engagement agreement, p.9                      | Enrollment requires approved policy and operating responsibilities                              |

Founder direction retained: individual signup; payment at application, including a paid waitlist; commissioner appoints captains; one draft host records picks during an external call; admin controls schedule generation; appearance and minutes must persist; public sports pages plus private contact/application information; accounts and an in-site notification area; scalable shared product.

**The operating package is not the platform business model.** At 28 registrations and $75, gross program receipts are $2,100 before refunds, processing fees, jerseys, staff, equipment, travel, media, and software costs. That is arithmetic under the proposal, not projected SaaS profit. Platform subscription revenue, participation fees, and optional operating services require separate accounting categories.

## Recommended technical direction

Use one modular application with Next.js, React, strict TypeScript, managed PostgreSQL/Supabase, individual authentication, explicit server commands, and a durable background worker. Start with one basketball rules engine. Keep the public read model separate from private operational records. Keep funds handling behind a payment adapter, with merchant setup decided before live collection.

The competition hierarchy is owning workspace → league/program → season → competition → entries, groups/stages, and games. Administrative units and participating institutions are separate relationships. The existing `organization_id` means the owning workspace; a participating school/club is not automatically a customer tenant. People, login accounts, payers, guardians, and sporting memberships are different concepts. Every protected operation checks both the actor and the resource scope; affiliation never grants blanket access to another workspace.

**Five foundational decisions to defend:**

1. No customer-specific code forks for normal onboarding.
2. No raw scripts, SQL, or arbitrary CSS in customer configuration.
3. No financial success inferred from a checkout redirect or client state.
4. No live statistics dependent on one browser's memory or an occasional save button.
5. No public data access built by exposing private operational tables and hiding columns in the UI.

## What admin freedom means

Admins should control the league's identity, pages, navigation, registration phases, capacity, pricing, approved forms, team structure, supported competition rules, schedule constraints, staffing, publication, and communication. They should get a preview, impact summary, and undo/revision tools wherever practical.

Admin freedom does not include silently rewriting charged prices, deleting official history, exposing private student records, changing another organization's data, bypassing eligibility without an authorized exception, or installing arbitrary code. Those limits make customization reliable.

## Draft completeness and next contract

This is a large-scale specification draft, not a claim of exhaustive implementation readiness. The next level for each approved workflow is: final wireframe → complete field dictionary and permission matrix → executable API schema → migrations and transaction design → threat/abuse cases → acceptance tests → implementation estimate.

The first review should settle the business/merchant boundary, pilot scope, and customization policy. Those decisions affect registration, accounts, finance, and architecture more than choosing a UI library does. See [the delivery and decision plan](06-decisions-delivery.md).
