# 04 — API, state transitions and transaction contracts

[Engineering map](README.md) · Refines AT-02–05, EN-01–06, FN-01–06, CP-02–08

## E-API-01 — Transport conventions

Use JSON REST endpoints under `/api/v1`. Route handlers and any server actions call the same exported use cases; no alternate less-protected mutation path. HTTP GET is side-effect free. Customer identity, role, entitlement, amount, merchant and ownership are resolved server-side, not trusted from hidden form fields.

Every mutating command carries `commandId` (UUID) and an expected revision for an existing mutable aggregate. Revisions are decimal strings. Creation commands lack an expected existing revision but still require idempotency. Server request IDs are separate from command IDs. Use the same command ID for retrying the same intent; a changed intent gets a new command ID.

```json
{
  "commandId": "9de664e9-e7ce-42db-8c56-570d7eeb6342",
  "expectedRevision": "17",
  "input": {
    "personId": "a279ad01-40a9-49a7-a9e4-c14e51086b86",
    "entryId": "dfd82c22-2965-43c3-a656-88567da07ce7",
    "leaseEpoch": "4"
  }
}
```

Success returns `{data, revision, commandId, requestId}`. An asynchronous operation returns HTTP 202 with a stable operation ID and authorized status URL. “Accepted” means durably queued, not completed. A status query cannot reveal another user's command response.

Error envelope:

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "This draft changed. Refresh before making the next pick.",
    "fieldErrors": [],
    "currentRevision": "18",
    "retryable": false
  },
  "requestId": "req_example"
}
```

| Status        | Code families                                                                       | Client behavior                                                                       |
| ------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 400 / 413     | Invalid JSON, unsupported content type, excessive body                              | Fix request; do not retry unchanged                                                   |
| 401           | Session missing/expired                                                             | Preserve safe local work, reauthenticate, retry same command only if intent unchanged |
| 403           | Authorized resource is known but action is denied/MFA required                      | Explain next step without revealing private fields                                    |
| 404           | Missing or inaccessible resource                                                    | Same existence policy for guessed IDs across workspaces                               |
| 409           | Stale revision, idempotency payload mismatch, capacity/booking conflict, lease lost | Fetch current state and require explicit resolution                                   |
| 422           | Valid shape but invalid rule/workflow/configuration                                 | Display actionable field or policy violation                                          |
| 429           | Rate/operating limit                                                                | Respect `Retry-After`; do not create new command IDs automatically                    |
| 503 / timeout | Dependency unavailable or unknown response                                          | Query/retry using same identity; do not assume no commit                              |

No stack traces, SQL fragments, provider payloads or PII in client errors. Unknown properties are rejected for command/config schemas. Optional fields distinguish absent from explicit null; PATCH handlers use allowlisted fields.

## E-API-02 — Bounds and query contract

Default list size 25, maximum 100. Use keyset cursors bound to resource scope, filters, stable sort and last key; HMAC-sign cursors or strictly validate decoded fields. Never accept cursor-generated SQL. Sort/filter keys come from an allowlist. Export jobs handle larger datasets. Lists return an optional approximate count only when affordable; no mandatory exact count over a huge joined dataset on every request.

Ordinary write body limit: 64 KiB; site drafts: 512 KiB document within a 768 KiB request; event batch: 100 events and 256 KiB, whichever is reached first. Upload bytes use signed storage transfer, not these JSON endpoints. Initial import maximum: 5,000 rows, staged in a private file and processed in 100-row resumable batches. Check limits before expensive parsing where possible and validate nested depth after parse.

All private endpoints send `Cache-Control: private, no-store`. Public query caches include workspace, competition/site, visibility revision, projection revision, locale and validated filters. A slug lookup resolves the owning ID before data access. Never share an authenticated rendered response through a public cache.

## E-API-03 — Endpoint inventory

The prefix `W` below means `/api/v1/w/{workspaceId}`. Nested resource IDs are verified against that workspace and their immediate parent. This inventory states command granularity; exact OpenAPI is generated from implemented schemas.

| Method / path                               | Permission / relationship                                      | Payload and result                                                                |
| ------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `POST /api/v1/workspaces`                   | Verified account; creation rate limit                          | Name, slug, timezone, command ID → owner workspace and provisioning status        |
| `POST W/leagues`                            | `league.create`                                                | Name/sport/template → league, draft season/competition IDs                        |
| `POST W/invitations`                        | `access.invite` plus authority to grant selected actions       | Email, role, typed scope, expiry → invitation status; no raw token in logs        |
| `POST W/grants/{id}/revoke`                 | `access.manage`                                                | Expected revision/reason → new access revision                                    |
| `GET W/settings/effective`                  | `settings.read` at scope                                       | Scope/family → resolved values, sources, locks and impact                         |
| `PATCH W/settings/{scopeId}/{family}`       | Family-specific configure permission                           | Typed overrides/revision → validated draft configuration                          |
| `GET/PATCH W/sites/{siteId}/draft`          | `website.edit`                                                 | Draft schema/revision → saved revision or conflict                                |
| `POST W/sites/{siteId}/publish`             | `website.publish`                                              | Expected draft revision → release ID/publication revision                         |
| `POST W/sites/{siteId}/restore-release`     | `website.edit`                                                 | Source release/current draft revision → new draft; publish separate               |
| `POST W/competitions/{id}/applications`     | Self/verified dependent or `registration.submitFor`            | Form version, subject, answers, accepted terms → application/order status         |
| `GET W/applications/{id}`                   | Applicant relationship or scoped staff field permissions       | Explicit private DTO; finance/evidence fields independently checked               |
| `POST W/applications/{id}/review`           | `registration.review`                                          | Approve/reject eligibility, reason, revision → eligibility state                  |
| `POST W/applications/{id}/offer`            | `registration.admit`                                           | Pool/deadline/revision → reservation and offer status                             |
| `POST W/applications/{id}/withdraw`         | Applicant or `registration.manage`                             | Reason/revision → withdrawal plus separate refund task status                     |
| `POST W/orders/{id}/checkout`               | Payer relationship / permitted assisted checkout               | Command ID only for authoritative amount → operation ID, later hosted URL         |
| `POST W/orders/{id}/refunds`                | `finance.refund`, MFA/reauth                                   | Bounded amount/reason/revision → reserved refund and async status                 |
| `POST /api/v1/webhooks/payments/{provider}` | Provider signature, not browser session                        | Raw verified event → durable inbox acknowledgment                                 |
| `POST W/entries/{id}/roster`                | `roster.manage`                                                | Person, role, dates, revision → effective membership                              |
| `POST W/drafts/{id}/lease`                  | `draft.host`                                                   | Expected revision/takeover reason → epoch/expiry                                  |
| `POST W/drafts/{id}/picks`                  | Current host plus `draft.pick`                                 | Person/entry/epoch/revision → committed pick/roster revision                      |
| `POST W/competitions/{id}/schedule-jobs`    | `schedule.generate`                                            | Constraints/input revision/seed → job ID                                          |
| `POST W/schedules/{id}/publish`             | `schedule.publish`                                             | Expected input/draft revisions → coherent published schedule revision             |
| `POST W/games/{id}/scoring-lease`           | Assigned scorer or authorized takeover                         | Session/expected state → epoch/expiry                                             |
| `POST W/games/{id}/events`                  | Current game lease plus `game.score`                           | Bounded ordered events/expected revision → sequence range/state checksum          |
| `POST W/games/{id}/submit-result`           | `game.score` or `result.submit`                                | Score/box data/coverage/source revision → submitted result                        |
| `POST W/games/{id}/finalize`                | `result.finalize`                                              | Expected revision/review confirmation → official result version                   |
| `POST W/games/{id}/corrections`             | `result.correct`                                               | Reason/replacement data/impact acknowledgment → new result version/rebuild status |
| `POST W/media/uploads`                      | `media.upload`                                                 | File type/size/purpose → bounded upload authorization                             |
| `POST W/media/{id}/publish`                 | `media.publish`                                                | Approval evidence/revision → public-safe derivative/link                          |
| `POST W/announcements/{id}/publish`         | `communications.publish`                                       | Audience/version → intent/status; recipients server-resolved                      |
| `POST W/exports`                            | Record-specific export permission, reauth for sensitive export | Scope/format → operation and expiring download                                    |
| `GET /api/v1/public/leagues/{slug}/...`     | Public projection only                                         | Supported pages/fixtures/standings/leaders/media; no private filters              |

A generic “update any table” endpoint is prohibited. Commands describe allowed business operations, which makes permissions, audit and concurrency reviewable.

## E-API-04 — Idempotent transaction algorithm

1. Authenticate and resolve requested workspace/resource. Check current permission before returning even a prior response.
2. Parse/bound input. Calculate canonical payload hash including action, target, expected revision and normalized validated fields. Do not hash raw JSON key ordering.
3. Begin transaction and establish transaction-local account/workspace context. Acquire the shared access guard and recheck live grants.
4. Insert/lock receipt identified by workspace, actor, action and command ID. Concurrent same-key insertion waits for the other transaction's result. Hash mismatch returns conflict. Matching committed result is returned without rerunning effects.
5. Lock aggregates in documented order; compare expected revisions; validate all referenced resources and domain rules.
6. Write business records, revisions, safe audit and outbox; store the safe response in the receipt; commit.
7. Return committed response. A dropped response can be retried with the same identity. Never send email or charge a card before this transaction commits.

Failed transactions leave no successful receipt. Rejected commands can be logged as safe security/diagnostic events without pretending they committed. Proposed receipt retention: 30 days for ordinary requests; permanent domain uniqueness and retained provider identities protect financial/game operations beyond receipt expiry. A retry older than the documented replay window must query current state before creating a new intent. Never silently run an expired financial command as a new charge.

## E-API-05 — Enrollment state machine

Do not implement one `registered: true` flag. The application read model exposes independent axes:

| Axis             | States / transition authority                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Application      | `draft → submitted → withdrawn` or `closed`; actor-owned draft, submitted amendments audited                               |
| Contact identity | `unverified → verified`; verified account/contact workflow                                                                 |
| Eligibility      | `notRequired`, `pending → approved/rejected`, `expired`; reviewer or supported evidence adapter                            |
| Admission        | `unallocated → waitlisted/offered → allocated`, `released`; capacity transaction                                           |
| Payment          | `notRequired`, `pending → paid/failed`, `partiallyRefunded/refunded/disputed`; provider evidence or labeled offline record |
| Placement        | `unassigned → assigned → transferred/released`; roster workflow                                                            |

Submitting freezes form/terms/pricing versions. The same participant can have records in multiple competitions when allowed. Duplicate detection is scoped to competition and configured entry identity, not global name/email matching. An applicant sees a plain-language summary generated from these axes (“Payment received; eligibility review pending”), not a misleading single green badge.

Atomic place allocation: lock pool → expire due holds under the same lock → lock application → validate eligibility/payment/admission policy → acquire or consume reservation → update counters → state/audit/outbox. All commands releasing/expiring/moving a place use this protocol. Counter checks plus allocation uniqueness prohibit oversubscription; nightly reconciliation compares counters to records and raises an exception instead of silently rewriting history.

For payment on application, proposed checkout reservation is 30 minutes subject to provider support and configured admission policy. Reserve capacity first when available. An optional paid waitlist is a separate disclosed path with no playing-place reservation. If the provider confirms payment after a hold expired, reacquire under the pool lock only if policy/capacity allow; otherwise record `paid + unallocated/waitlisted` and trigger the disclosed refund/review path. Never oversubscribe to make payment status look successful.

For payment on offer, create a bounded offer/reservation and checkout deadline; expiry releases the hold and advances the queue using an idempotent job. Simultaneous expiry/payment handling serializes against the same allocation. The resulting state must be deterministic and explainable. No eligibility rejection or withdrawal automatically means a refund succeeded.

## E-API-06 — Payments and refunds with uncertain providers

The initial recommendation is hosted checkout with a connected organizer merchant where the selected market/provider arrangement supports the agreed business model. Currency/country/charge flow must be approved before live paid launch. A platform subscription uses separate customer/product/order identifiers. No browser handles raw card details on our domain.

Checkout request commits an order/attempt intent and job. The worker calls the provider with a stored idempotency key, then records provider object/URL. A repeated browser request returns the same current attempt or its operation status, not another payment. If the worker crashes after provider creation, it reconciles using that identity before retrying. If the provider's idempotency window has elapsed, query/reconcile or escalate; do not blindly create a new charge.

Verify webhook signatures over the raw body with the endpoint's secret and bounded timestamp tolerance supported by the provider. Persist the verified event with a unique provider/account/event key before acknowledging receipt. Process asynchronously. Do not assume event order; fetch authoritative provider state when an event is stale/ambiguous, then apply monotonic financial facts. A success redirect is an untrusted UX signal.

Stripe documents signature verification, duplicate delivery and ordering considerations; integration tests must exercise them rather than treating webhooks as once-only ordered messages. [Stripe webhook reference](https://docs.stripe.com/webhooks).

Refund request: lock order → compute `captured - refunded - refund_reserved` → reserve requested positive amount → create refund intent/job → commit. Worker calls provider with stable key. On success move reserved to refunded; on definite failure release reservation; on unknown outcome keep reservation until provider reconciliation resolves it. Multiple refunds cannot reserve more than captured balance. Restrict refunds to the correct merchant/payment attempt and currency. A disputed payment needs its own provider-state rules, not a negative refund row.

Reconciliation runs daily and after restore/provider outage. It compares orders, provider charges/refunds/disputes and settlement reports by merchant/currency/time window, reports differences, and tracks authorized resolution. Never “fix” external money by editing a local paid flag.

## E-API-07 — Draft, schedule and result transactions

Draft selection checks active host lease/epoch, draft revision, pick order, approved pool membership, already-picked status and destination roster cap in one transaction. Concurrent host tabs cannot both spend the same pick. Removing/reversing a pick is a named audited command; reversing an earlier pick returns an impact preview and requires resolving later dependencies. Team assignment becomes visible only after commit.

Schedule generation is a bounded job over an immutable input snapshot: entries, format, resources, availability, rest/travel constraints, locked fixtures and seed. It produces a proposal, explicit violations and unscheduled games. Hard constraints cannot be silently downgraded. Publish rechecks input revision/resource reservations inside a short transaction and switches the published schedule only when all intended bookings succeed. Deterministic seed and generator version allow investigation/reproduction.

Game results follow `scheduled → ready → live (if supported) → submitted → finalized`; special states include postponed, cancelled, abandoned and forfeit with explicit outcome rules. Corrections create a new official version and preserve the earlier one. A corrected result affecting a played downstream bracket game requires an impact decision, not automatic deletion/reassignment. Projection freshness is visible while rebuild runs. Detailed scoring and projection protocols are in [section 06](06-jobs-live-and-publication.md).

## E-API-08 — Import/export and future integration boundary

Imports validate a staged private file, map columns to registered fields and show row-level errors before committing. Every row has stable `(importRunId, rowNumber, inputHash)` identity. Retries resume without duplicate people/orders/games. Resolve duplicates through user review; never merge people solely by a matching name. Import commands enforce the same permissions/invariants as interactive commands.

Exports use a durable job, authorized scope snapshot and current access recheck before generating and downloading. Default safe CSV encoding escapes spreadsheet formula prefixes and preserves numeric fields intentionally. Restricted exports use short-lived private downloads and audit. No signed URL is posted publicly or embedded in notification logs.

Future API clients get revocable scoped principals with separate credentials and rate budgets. Outbound webhooks include event ID/type/schema version, timestamp and signature; consumers must deduplicate. Public integration support requires documented authority per field, version/deprecation policy and dead-letter/replay operations before marketing it as available.
