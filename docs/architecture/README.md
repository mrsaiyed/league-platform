# Architecture decisions and production boundary

## ADR-001: retain a separate presentation example

**Status:** implemented for the concept, October 7, 2026.

The principal meeting needs a usable, branded demonstration before the production system is approved. The concept therefore lives under `examples/alhadi-school`, with native ES modules, explicit module imports, separated style files, fictional fixtures, and browser-local state. It has no runtime dependencies or external network calls.

The build produces both static hosting files and a single offline HTML artifact from the same sources. The portable build embeds the module graph through a standard import map, not copied alternative implementations. Formatting and browser tests operate on those sources and outputs.

This preserves the visual work without presenting its persistence as production infrastructure. `domain.js` belongs to the example and is deliberately not called the platform's production domain package. The sample scorer is not a complete basketball event engine, and local undo is not a production correction ledger.

## ADR-002: use a modular monolith for production

**Status:** proposed; see specification section 5.

One Next.js application with strict TypeScript, modular business services, managed PostgreSQL/Supabase, and explicit server-side commands is the recommended starting point. Public pages, commissioner tools, and the player portal share a product and domain model.

Introduce this structure when implementing the actual first production slice:

```text
apps/web/                         Routes, views, authenticated server entry points
packages/domain/                  Organization, registration, payment, draft, schedule
packages/sports/basketball/        Typed events, rules, reducers, projections
packages/contracts/               Validated API and event contracts
packages/ui/                      Shared accessible components and theme tokens
supabase/migrations/              Schema, RLS, grants, constraints, transactions
supabase/functions/               Reviewed background workers
tests/integration/                Database isolation, concurrency, provider workflows
```

These folders are a plan, not a collection of empty stubs that implies finished engineering. Start with one complete vertical slice: verified account → organization membership → registration → private status. Keep organization identity and scoped foreign keys from the first migration.

## ADR-003: identity before engagement automation

**Status:** proposed in response to founder direction, October 7, 2026.

Signup creates or reuses an authentication identity through verified email. Account creation is separate from participant identity, school approval, playing-place allocation, payment, and permission. Returning applicants do not get duplicate identities; paying for a student does not confer ownership of that student's account.

A basic player portal is part of the pilot foundation. An inbox can start small. Game reminder scheduling, report emails, web push, and a native app are progressively added capabilities. See the [detailed contract](../product/accounts-and-notifications-v0.2.md).

## Review gates before production

- Individual authentication and server-side scopes replace every simulated persona switch.
- RLS and transaction tests prove isolation between organizations and between two players in the same organization.
- Public DTOs contain approved sports data only; email, payment status, eligibility, notification content, and account links stay private.
- Shared secrets never enter browser code or a committed file.
- Payment webhooks and durable game events replace local simulation, with reconciliation and revision history.
- Browser clients cannot grant themselves membership, choose a notification recipient, confirm payment, or finalize a game without authority.
- Production data enters neither the demo nor preview environments.

Reusing Faraj means reviewing and porting specific interactions and domain behavior. It does not mean copying its shared-password admin model or broad public data policies. This repository contains no imported Faraj credentials, production database dumps, or live integrations.
