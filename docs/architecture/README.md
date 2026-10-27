# Architecture decisions and production boundary

The active discussion baseline is the [product specification v0.7](../product/platform/README.md), with a [detailed engineering design](../product/platform/engineering/README.md) for repository/files, schema, customization, APIs, security and operating budgets. The active first slice is [Al-Hadi varsity scoring](../initiatives/alhadi-varsity/README.md); the broader platform remains shared and configurable. [ADR-004](decisions/004-varsity-scoring-slice.md) defines the local SQL rehearsal, private hosted SQL pilot and production migration boundary.

## ADR-001: retain a separate presentation example

**Status:** implemented for the concept, October 7, 2026.

The principal meeting needs a usable, branded demonstration before the production system is approved. The concept therefore lives under `examples/alhadi-school`, with native ES modules, explicit module imports, separated style files, fictional fixtures, and browser-local state. It has no runtime dependencies or external network calls.

The build produces both static hosting files and a single offline HTML artifact from the same sources. The portable build embeds the module graph through a standard import map, not copied alternative implementations. Formatting and browser tests operate on those sources and outputs.

This preserves the visual work without presenting its persistence as production infrastructure. `domain.js` belongs to the example and is deliberately not called the platform's production domain package. The sample scorer is not a complete basketball event engine, and local undo is not a production correction ledger.

## ADR-002: use a modular monolith for production

**Status:** proposed; see the [active architecture section](../product/platform/10-architecture-apis-integrations.md).

One Next.js application with strict TypeScript, modular business services, managed PostgreSQL/Supabase, and explicit server-side commands is the recommended starting point. Public pages, commissioner tools, and the player portal share a product and domain model.

Introduce this structure when implementing the actual first production slice:

```text
apps/web/                         Routes, views, authenticated server entry points
apps/worker/                      Durable job runner and handler wiring
packages/core/                    Authorized use cases, rules and adapter ports
packages/database/                Typed SQL, transactions and scoped DTO queries
packages/providers/               Auth, payments, email and storage adapters
packages/sports/                  Sport rules, reducers and stat definitions
packages/contracts/               Validated API, event and configuration contracts
packages/ui/                      Shared accessible components and theme tokens
packages/site/                    Supported page blocks and public rendering
packages/observability/           Redacted logging, metrics and tracing helpers
supabase/migrations/              Schema, RLS, grants, constraints and SQL functions
tests/integration/                Database isolation, concurrency, provider workflows
```

These folders are a plan, not a collection of empty stubs that implies finished engineering. The [repository contract](../product/platform/engineering/01-repository-and-boundaries.md) owns the exact package responsibilities and 40-file first-slice source inventory. Start with the reusable scoring slice: roster → game setup → accepted events → final record → season totals. Hosted game-day release requires verified organizer/workspace/game authority and safe publication. Then expand self-service competition setup and the website editor. Enrollment and paid workflows follow their approved release gates. Keep owning-workspace identity and scoped foreign keys from the first migration. Introduce explicit competition/entry scope with the first competition workflow. Institution affiliations and delegated governance are separate contracts; see the [scale and governance contract](../product/platform/12-scale-governance-enterprise.md).

## ADR-003: identity before engagement automation

**Status:** proposed in response to founder direction, October 7, 2026.

Signup creates or reuses an authentication identity through verified email. Account creation is separate from participant identity, any required eligibility review, playing-place allocation, payment, and permission. Returning applicants do not get duplicate identities; paying for a participant does not confer ownership of that participant's account.

A participant portal and inbox are proposed core experiences. Reminder scheduling, report emails, push, and a native app follow their selected release gates. See the [communication contract](../product/platform/09-communication-media-engagement.md) and [security/privacy contract](../product/platform/04-identity-security-privacy.md).

## Review gates before production

- Individual authentication and server-side scopes replace every simulated persona switch.
- RLS and transaction tests prove isolation between organizations and between two players in the same organization.
- Public DTOs contain approved sports data only; email, payment status, eligibility, notification content, and account links stay private.
- Shared secrets never enter browser code or a committed file.
- Payment webhooks and durable game events replace local simulation, with reconciliation and revision history.
- Browser clients cannot grant themselves membership, choose a notification recipient, confirm payment, or finalize a game without authority.
- Production data enters neither the demo nor preview environments.

Reusing Faraj means reviewing and porting specific interactions and domain behavior. It does not mean copying its shared-password admin model or broad public data policies. This repository contains no imported Faraj credentials, production database dumps, or live integrations.
