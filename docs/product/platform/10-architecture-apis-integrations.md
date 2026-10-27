# 10 — Architecture, APIs, and integrations

[Specification map](README.md) · Status: proposed engineering approach · Decisions: D-22–D-23

**Detailed engineering contract:** [Repository specification](engineering/01-repository-and-boundaries.md) defines the exact recommended package boundaries and first-slice files; [API specification](engineering/04-api-and-transactions.md) defines transport and commands.

## Stack and application shape

Recommend a modular monolith: one maintained application with explicit business modules, a relational database and durable background execution. Start with the simplest deployment that meets measured requirements. Dedicated tiers or service extraction require evidence and operational ownership.

| Layer                | Proposed choice                                                               | Decision criteria                                                     |
| -------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Web                  | Next.js, React, strict TypeScript                                             | Public rendering, interactive admin/scorer, private-cache correctness |
| UI/contracts         | Accessible primitives, theme tokens, typed validation such as Zod             | Owned component quality, schema consistency, server validation        |
| Persistence/identity | Managed PostgreSQL and Supabase Auth/storage as candidate                     | RLS/grants, transactions, recovery, regional/vendor constraints       |
| Jobs                 | Transactional outbox/inbox and leased worker                                  | Durable retries, bounded runtime, queue lag, replaceable runner       |
| Providers            | Hosted payment with connected merchants; email/storage/observability adapters | Actual contracts, costs, data handling and supported regions          |
| Quality              | Unit/property tests, PostgreSQL integration tests, Playwright                 | Domain invariants, real permissions/races, browser/recovery evidence  |
| Source/delivery      | GitHub, one package manager/lockfile, reviewed migrations and CI              | Reproducibility, dependencies, release and rollback                   |

No version or vendor plan is frozen by this table. Pin supported versions after a tested implementation spike. Next.js documents multi-tenant patterns; routing does not establish our data isolation. [Next.js multi-tenant guide](https://nextjs.org/docs/app/guides/multi-tenant).

**AT-01 — Dependencies.** Pure domain/sport rules cannot import UI frameworks or provider SDKs. Request adapters authenticate/validate and invoke authorized commands. Persistence owns transactions/constraints; DTO queries declare fields and scope. Keep domain-specific events where history matters without event-sourcing ordinary editable profile/content drafts unnecessarily.

```text
apps/web/                public, account, staff, scorer, platform console, API adapters
apps/worker/             leased job runner and handler wiring
packages/core/           authorized use cases, pure rules and adapter ports
packages/database/       typed SQL repositories, transactions and scoped DTO queries
packages/providers/      auth, payments, email and storage adapters
packages/sports/         supported sport rules, reducers and stat definitions
packages/contracts/      validated command/event/config/public schemas
packages/ui/             accessible components and theme tokens
packages/site/           registered page blocks and public renderer
packages/observability/  redacted logs, metrics and tracing helpers
supabase/migrations/     candidate provider's SQL, grants, RLS, functions, indexes
tests/                   unit, database integration, browser, recovery and load scenarios
docs/architecture/       accepted decisions and data-flow contracts
examples/                isolated fictional presentation references
```

Create structure when a real slice uses it. The existing demo is not a production domain library; reuse requires source/license, persistence, security, accessibility and test review.

## Commands, events, and integrations

**AT-02 — Command contract.** Version endpoints; writes carry command ID and expected revision where applicable. Authenticate → resolve trusted owner/scope → validate bounded inputs → check permission and workflow → transact → return committed revision and safe result/error. Scope must include every referenced resource. Common errors distinguish unauthenticated, denied/not-found under an existence policy, conflict, invalid rule and retryable limits. A timeout does not prove a command failed.

**AT-03 — Atomicity and replay.** Commit business state, audit and outbox together. Bind idempotency key to owner, actor/action scope and canonical payload hash. Matching retries return the prior result; changed payload conflicts. Financial/event uniqueness persists beyond a short request cache. Worker claims a lease in a short transaction, releases locks before network calls, records outcome, and retries with bounded backoff/jitter. Reconcile uncertain external effects instead of repeating them as fresh commands.

**AT-04 — Read/realtime boundary.** Public projections contain approved fields; private responses use appropriate private/no-store handling. Cache by owner, competition, publication revision and filters. Realtime is a notification of versioned state, not the source of truth or unrestricted row broadcast. Reconnect fetches authorized snapshots and repairs gaps. Public score fanout should not repeatedly scan raw event history.

**AT-05 — Integration authority.** Imports/provider adapters specify direction, object/field ownership, credential scope, schedule, corrections, retention and limits. Maintain provider/account/object/external-ID mapping and provenance. Stage/dry-run imports with row errors and resumable idempotent execution. External feeds use the same reviewed domain commands; they cannot bypass capacity/eligibility or silently overwrite official corrections. Future public API/webhooks need scoped machine principals, signed deliveries, version/deprecation and retry/replay contracts.

**AT-06 — Portability.** Own migrations, schema contracts, domain IDs and exports. Keep provider-specific code near adapters. Auth, realtime and storage replacement has real migration cost; document constraints and rehearse a tenant export. One lockfile and clear module ownership are preferable to unsupported stacks per customer.

## Acceptance and next detail

Test repeated commands across a timeout, mismatched idempotency payload, event replay, expired worker lease, stale cache, revoked machine scope, interrupted bulk import and conflicting provider correction. Verify server authorization even when UI controls are hidden.

The [engineering package](engineering/README.md) now specifies repository dependency rules and first-slice files, typed command/event examples, database privileges, connection/runtime budgets, integration boundaries and migration strategy. Implementation delivers accepted stack/hosting ADRs, compiled contracts/OpenAPI, executable SQL and a complete vertical slice proving the selected infrastructure.

## AT-09 — Local scoring rehearsal boundary

[ADR-004](../../architecture/decisions/004-varsity-scoring-slice.md) implements a local Node/PGlite adapter for the first varsity scoring slice. Managed PostgreSQL remains the product recommendation. The pure sport reducer and shared schemas are reusable; the preview HTTP/UI adapter has no hosted identity boundary and must not be publicly deployed. The next production slice adds team/external-competition ownership, real authorization/RLS, leases/offline reconciliation and publication before broader website work.
