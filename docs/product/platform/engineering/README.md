# Engineering specification: how the platform will be built

**Revision 0.7 · October 27, 2026 · Proposed platform baseline with isolated local/hosted stat adapters**

[Product specification](../README.md) · [Business decisions](../13-decisions-roadmap-validation.md)

The product is an end-to-end league management platform that gives each league its own customizable public website and private administration dashboard, with shared core tools and optional features for its specific needs.

This package specifies the engineering mechanisms behind that promise. It supplements the 13 product sections with repository boundaries, database contracts, configuration schemas, transaction protocols, operational budgets and delivery evidence. The intramural demo remains a separate presentation example. The [varsity scoring slice](../../../initiatives/alhadi-varsity/README.md) implements shared schemas, pure basketball rules and SQL transactions. Its private hosted pilot uses Sites access and D1; the local adapter uses PGlite. These do not certify the full platform identity/roles, PostgreSQL RLS, offline, publication or capacity contracts described here.

## Decisions engineering is recommending now

| Decision               | Proposed implementation                                                                                   | Why                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Application shape      | Modular TypeScript monolith; separate web and worker processes from one repository/release                | Easy transactions and one supported product; workers can scale independently            |
| Public/admin UI        | Next.js App Router and React; shared accessible components; server rendering for public pages             | Public discovery and interactive editor/scorer without separate customer applications   |
| Persistence            | Managed PostgreSQL; Supabase is the first provider candidate; SQL migrations and typed query adapters     | Constraints, transactions, historical records and tenant isolation                      |
| Authentication         | Supabase Auth with its supported SSR flow; server-side identity checks plus live database authorization   | Avoid inventing passwords/MFA infrastructure; do not put authorization solely in tokens |
| Hosting shape          | Node web service, continuously running Node worker, regional database/pooler, object storage and CDN      | Jobs do not depend on a browser or a web request staying alive                          |
| Customer customization | Versioned typed settings, template/block editor, supported modules and role-scoped admin views            | Different leagues can look and operate differently while receiving the same upgrades    |
| Data isolation         | Shared schema with workspace keys, composite foreign keys, restricted DB roles and RLS                    | One deployment serves many leagues; application filtering is not the only boundary      |
| Async work             | PostgreSQL transactional outbox and durable leased jobs initially                                         | No lost handoff between committing a result and scheduling its notifications            |
| Initial delivery       | Persistent team scoring rehearsal, then secure hosted scoring, then broader self-service league lifecycle | Prove game-day correctness first; retain full lifecycle as the product destination      |
| Scale approach         | Bounded work, indexed queries, immutable public projections, caching and fair job dispatch                | Growth should not multiply expensive work for every viewer                              |

These are engineering recommendations, not questions the founder must answer by learning database internals. Engineering should change a recommendation when the implementation spike produces contrary evidence and record the reason in an ADR. Business decisions such as launch market, selling price, merchant responsibility and promised service level remain explicit founder decisions. Exact dependency versions and hosting plans are pinned by the first validated scaffold, not guessed in prose.

## What “scalable” means here

| Kind of growth              | Required mechanism                                                                 | Evidence                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| More independent leagues    | Tenant-bound keys, scoped authorization, no tenant-specific source forks           | Two-tenant negative tests; 100-workspace load fixture                              |
| One much larger league      | Competition-scoped queries, pagination, shared-resource locking, resumable imports | Large single-workspace fixture and query plans                                     |
| More spectators             | Published read models, CDN/cache, scoreboard snapshots                             | Read request count grows without equal growth in event-history queries             |
| Simultaneous administration | Expected revisions, atomic capacity, draft leases, booking constraints             | Deliberate conflicting requests produce one valid outcome                          |
| More customization          | Schema/version registries, bounded blocks, policy resolution and migrations        | Two very different sites and a trophy module use the same code                     |
| More product developers     | Explicit imports, small command units, shared contracts, CI boundaries             | A feature can be changed/tested without importing unrelated internals              |
| Years of records            | Immutable result/config versions, retention classes, exports, measured indexes     | Archived seasons remain reproducible after an upgrade                              |
| Additional sports/networks  | Sport interfaces; ownership separate from affiliation/authority                    | A second sport contract and network fixture fit without rewriting tenant ownership |

Scalability is not a folder count or a promise of unlimited traffic. [Capacity and operations](07-capacity-delivery-operations.md) gives proposed numeric workloads and gates. [Build plan](08-build-plan-and-evidence.md) states which foundations are required now and which systems wait for demand.

## Read in this order

| Document                                                                   | Build questions answered                                                                                   |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [01 Repository and boundaries](01-repository-and-boundaries.md)            | Which applications/packages/files exist? Where does each feature go? What imports are prohibited?          |
| [02 Database and integrity](02-database-and-integrity.md)                  | What tables/fields/keys exist? Which writes lock together? What is relational versus JSON?                 |
| [03 Admin and customization](03-admin-and-customization.md)                | What can an organizer change? What is the page document? How do preview, publish and modules work?         |
| [04 API and transaction contracts](04-api-and-transactions.md)             | What requests/responses/state transitions are implemented? How do retries and money work?                  |
| [05 Security and privacy controls](05-security-and-privacy.md)             | How are sessions, permissions, RLS, files, support and deletion enforced?                                  |
| [06 Jobs, live scoring and publication](06-jobs-live-and-publication.md)   | What survives crashes/offline use? How are game events, minutes, projections and notifications reconciled? |
| [07 Capacity, delivery and operations](07-capacity-delivery-operations.md) | What load is targeted? What limits, indexes, metrics, deployments and recovery drills are required?        |
| [08 Build plan and evidence](08-build-plan-and-evidence.md)                | What is built first? Which tests prove each promise? What still requires a decision or spike?              |

## Specification conventions

- `E-ARCH`, `E-DATA`, `E-CONFIG`, `E-API`, `E-SEC`, `E-LIVE`, `E-OPS`, and `E-BUILD` identify technical requirements. Product IDs retain their existing meaning.
- Code, SQL and JSON examples are design contracts, not production-ready files or applied migrations. Fragments explicitly omit unrelated columns or plumbing. Implementation must compile, migrate and test the complete version.
- A proposed numeric bound is a starting operating limit, enforced server-side and adjustable through reviewed deployment configuration. It is not an advertised paid-plan allowance or measured capacity.
- The product sections own behavior and business scope. These documents own implementation detail. If review reveals a conflict, update both and the decision log; do not ship two interpretations.
- Changes to existing orders, games, accepted terms or published seasons require their own commands. Changing a default in the editor cannot rewrite history.
- No specification requires an exact permanent number of files. The first-slice file inventory exists to make responsibilities concrete; split a file when it has multiple reasons to change, not to hit a count.

## Still required before production implementation is relied upon

The detailed design is now written; executable migrations, generated API artifacts, real device tests, provider integration evidence, exact market policies, a costed deployment and measured capacity are implementation outputs. Their absence is recorded in [the evidence plan](08-build-plan-and-evidence.md), not disguised as completed work.
