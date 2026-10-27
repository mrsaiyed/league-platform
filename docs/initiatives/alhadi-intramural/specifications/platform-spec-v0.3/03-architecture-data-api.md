# 03 - Architecture, database, and API contracts

> Historical snapshot: this prospective-client initiative is inactive. Use the [active overall product plan](../../../../product/platform/README.md) for current direction. Earlier approval/customer statements below retain their historical context.

Status: proposed design. This is a schema and boundary specification, not executable production migrations. All versions, hosting plans, and deployment regions must be pinned and verified at implementation kickoff.

Fit-review amendment: `organization_id` is the owning workspace. Competition is an explicit scope beneath season. The catalog includes the pilot shape plus planned contracts; a default competition hides complexity in the school UI. Section 9 defines the expanded ownership, entry, module, and integration contracts and when their tables are needed.

## 1. Stack recommendation and tradeoffs

| Layer           | Recommendation                                                                                            | Why / tradeoff                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Application     | Next.js App Router + React + strict TypeScript                                                            | Shared public/staff product, server-rendered public pages, interactive scorer; caching boundaries require care |
| UI              | Tailwind and accessible primitives, with a maintained component layer                                     | Theme tokens and consistency; copied/generated components still need ownership and testing                     |
| Validation      | Zod or equivalent typed schemas                                                                           | Same shape for client help and server validation; client checks are never authoritative                        |
| Database        | Managed PostgreSQL through Supabase                                                                       | Transactions, constraints, indexes, RLS; managed convenience does not replace policy design                    |
| Auth            | Supabase Auth with individual users and privileged-user MFA                                               | Integrates with database identity; keep domain permissions in our schema                                       |
| Data access     | Supabase server client with caller identity for normal operations; narrow SQL commands for atomic changes | Preserves RLS context; generated DB types and explicit query modules rather than arbitrary browser writes      |
| Realtime        | Authorized channels for staff; public sanitized snapshots/polling first                                   | Database is source of truth; notifications can be missed and must reconnect by revision                        |
| Background jobs | Transactional PostgreSQL outbox, leased worker invoked on a reliable schedule                             | Fewer initial services; bounded serverless batches and monitoring required; runner replaceable later           |
| Hosting         | Commercially suitable managed Node hosting, Vercel proposed                                               | Fast deployment/public CDN; measure connection pooling, function runtime limits, regional latency, and costs   |
| Payment         | Stripe hosted checkout + verified webhooks; Connect when separate league merchants are introduced         | Avoid direct card handling; finance responsibilities still need agreement                                      |
| Email           | Resend proposed behind an adapter                                                                         | Domain verification, retry/delivery tracking; provider can change                                              |
| Images/files    | Object storage with separate private/published access policies                                            | Derivatives and backup required; object access does not inherit table privacy automatically                    |
| Observability   | Sentry or equivalent + structured logs and metrics                                                        | Scrub private data and set retention; no sensitive replay recordings                                           |
| Tests           | Vitest, Playwright, SQL/pgTAP or equivalent DB integration tests                                          | Domain correctness, browser journeys, RLS, real concurrency                                                    |
| Repository      | GitHub, lockfile, automated checks, migration review                                                      | One deployable application initially; package boundaries only when real code exists                            |

**ARC-01 - Architecture shape.** Modular monolith with a background execution path. Public pages, accounts, admin, and APIs share domain services. Database transactions enforce critical invariants. A worker processes committed external side effects. Do not start with Kubernetes, one service per domain, or one database per school without an evidenced requirement.

**ARC-02 - Vendor boundaries.** Keep payment, email, object storage, identity verification, observability, and job runner behind narrow adapters. Do not build a universal abstraction for all possible providers. Domain records use internal IDs plus provider references; replacing a provider must not change a team's identity or game's event history.

**ARC-03 - Routing is not authorization.** Pilot path: `/l/{organizationSlug}/{leagueSlug}/{seasonSlug}`. Hostnames later resolve to the same tenant identifier after domain ownership verification. Validate host aliases; never derive permission solely from `Host`, slug, or browser organization state. Next.js supports multi-tenant application patterns; our isolation design remains our responsibility. [Next.js multi-tenant guide](https://nextjs.org/docs/app/guides/multi-tenant).

## 2. Runtime and dependency direction

```text
Public visitor -> public route -> published projection -> tenant/version cache
Participant/staff -> authenticated server command -> permission + validation
                -> DB transaction -> domain state + audit + outbox
Scorer -> durable local queue -> same command boundary -> event log + projection
Provider -> signed webhook -> durable inbox -> idempotent processing
Worker -> leased inbox/outbox jobs -> provider adapter -> delivery/reconciliation state
```

**ARC-04.** Domain packages cannot import React, Next.js, Supabase SDK, or payment/email SDKs. Database commands own persistence invariants. UI imports public contracts and invokes commands; it cannot decide official totals or eligibility. Shared schemas do not make all database fields public.

**ARC-05.** Use append-only event records for games, draft actions, audit, and financial facts where history matters. Ordinary profile/config drafts use relational CRUD and revisions. Do not event-source the entire product unnecessarily.

**ARC-06.** Realtime delivery carries revision/reference, not unrestricted private row payloads. Clients refetch an authorized snapshot on reconnect or sequence gaps. Public live-score transport is separately permissioned from staff event transport.

### Proposed repository skeleton

```text
apps/web/
  app/(public)/                 Published league pages
  app/(account)/                Participant portal
  app/(staff)/                  Commissioner and scorer screens
  app/(platform)/               Restricted operator console
  app/api/v1/                   Thin request/response boundaries
  features/                     Screens grouped by workflow
  server/auth/                  Session, tenant context, authorization
  server/commands/              Domain orchestration
  server/queries/               Explicit private/public DTO queries
  server/adapters/              Providers and job runner
packages/domain/
  organizations/ registration/ payments/ rosters/
  drafts/ scheduling/ games/ publishing/ notifications/
packages/sports/basketball/     Rules, event validation, reducers, stat definitions
packages/contracts/            Validated request/event/config/public schemas
packages/ui/                   Theme tokens and reusable accessible components
supabase/migrations/            Tables, constraints, indexes, grants, RLS, commands
supabase/functions/             Thin worker entry points if this runner is chosen
workers/                        Provider jobs and outbox consumers; chosen runner adapter
tests/integration/              Database, transactions, providers, policy matrix
tests/e2e/                     Real workflow and recovery tests
docs/architecture/decisions/    Accepted choices, alternatives, consequences
docs/runbooks/                 Deployment, outage, restore, privacy, payments
examples/alhadi-school/         Existing isolated concept
```

Use one package manager and lockfile. The existing demo currently uses npm; switching the production workspace to pnpm is an optional deliberate migration, not a reason to maintain two competing locks. Create packages when implementing a real slice, not an empty forest of folders. Isolate pure worker-shared code from Node-only dependencies if using an Edge runtime.

## 3. Universal data conventions

**DAT-01.** Opaque UUID identifiers; do not rely on unpredictability for permission. Tenant-owned rows include non-null `organization_id` identifying the owning workspace. Season/competition-bound records validate league, season, competition, group, and entry ownership using scoped keys. Cross-workspace affiliation/sharing uses a dedicated authorized bridge; it never changes the tenant ID of an existing row or bypasses ordinary policies.

**DAT-02.** Timestamps for instants use UTC `timestamptz`. Recurring local rules additionally retain local date/time and IANA zone. Money uses integer minor units and currency. Playing time uses integral duration units; choose milliseconds for event/stint precision and derive display seconds. Ratios use explicit formulas/rounding, not stored floating-point money.

**DAT-03.** Mutable aggregate roots carry monotonically increasing `revision`. Immutable records carry server-assigned sequence/revision and creation time. Each payload/config uses a schema version, bounded length, and validation. Important relationships, searchable states, and constraints use columns, not undifferentiated JSON.

**DAT-04.** Common metadata: `created_at`, `created_by`, and where mutable `updated_at`, `updated_by`. System actors are explicit. Soft deletion is not a substitute for privacy erasure. Financial/official history uses restricted deletion and explicit archive/correction workflows.

**DAT-05.** Schema names: identity/private operations separated from narrowly exposed API/public projection schemas. Explicit grants and RLS on exposed tables. A projection contains only approved publishable fields. Anonymous users cannot traverse foreign keys to private person/account records.

## 4. Entity and field catalog

Common metadata/scoping columns above apply throughout; the table lists additional required design fields. `?` means nullable by an explicit state, not unspecified. Exact SQL types and every length/check belong in the migration design deliverable.

### Ownership, identity, and settings

| Entity                    | Key fields                                                                                                       | Invariants / access                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| organizations             | slug, legal_customer_reference, display_name, timezone, lifecycle_state                                          | Platform creates; unique active slug; legal/billing fields private                    |
| leagues                   | organization_id, slug, name, sport_code, visibility                                                              | Unique org/slug; sport module supported                                               |
| seasons                   | league_id, slug, title, state, proposed_dates?, current_config_version_id?                                       | Date ordering; active/published readiness distinct                                    |
| config_versions           | scope_type, scoped_parent_id, schema_version, revision, state, payload, effective_at?, published_by?             | Approved scope shape; immutable activated version                                     |
| memberships               | auth_user_id, status, invited_by?, accepted_at?, revoked_at?                                                     | Unique organization/user; revocation invalidates authority                            |
| role_assignments          | membership_id, role_key, scope_kind, league_id?, season_id?, competition_id?, entry_id?, game_id?                | Valid typed scope shape; cannot exceed grantor authority; federation delegation later |
| people                    | display_name, lifecycle_state, public_profile_id?                                                                | Organization-local identity; no automatic global student directory                    |
| person_private            | person_id, legal_name?, approved_contact_fields, restricted_school_reference?                                    | Own/delegated/staff scope; never anonymous                                            |
| person_account_links      | person_id, auth_user_id, relationship, verification_method, verified_at, revoked_at?                             | Account != player != payer; guardian link requires evidence                           |
| public_profiles           | public_id, approved_display_name, published_photo_asset_id?, visibility, consent_revision                        | No email, payment, age evidence, or auth IDs                                          |
| consent_records           | subject_person_id, purpose, document_version, actor_id, authority_type, accepted_at, withdrawn_at?               | Immutable acceptance fact; separate purpose per use                                   |
| assets                    | object_key, media_type, size_bytes, checksum, owner_scope, scan_state, publication_state, derivative_of?         | No user-chosen arbitrary storage path; assets may be private                          |
| page_versions             | workspace/league/season/competition or approved profile scope, blocks_json, schema_version, state, published_at? | Supported safe blocks; scoped queries and module dependencies                         |
| organization_entitlements | plan_key, capability, quota?, effective_from, effective_to?                                                      | Platform managed; unrelated to resource access permissions                            |

### Registration and finance

| Entity                     | Key fields                                                                                                                             | Invariants / access                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| registration_form_versions | competition_id, entry_mode, fields_schema, policy_version, published_at                                                                | Historical submissions reference exact form                                                                     |
| registrations              | competition_id, subject_kind, person_id? or team_application_id?, submitter_user_id, form_version_id, independent state axes, revision | Typed subject constraint; one active application per approved eligibility scope; team path added when supported |
| registration_answers       | registration_id, typed_answers_json                                                                                                    | Private; immutable original submission plus permitted amendment history                                         |
| verification_decisions     | registration_id, method, outcome, source_ref?, reviewer, restricted_reason?, decided_at                                                | Append history; current outcome projected                                                                       |
| capacity_pools             | competition/group scope, capacity_unit, playing_limit, waitlist_limit, policy_version, allocation_counter                              | Team and participant slots distinct; limits locked for allocation                                               |
| allocations                | pool_id, registration_id, kind, priority_class, sequence, active_from, released_at?                                                    | Unique active allocation per application/pool; counters reconcile                                               |
| checkout_holds             | pool_id, registration_id, attempt_id, expires_at, state                                                                                | Optional; expiry distinct from paid reservation                                                                 |
| merchant_configs           | provider, provider_account_id, legal_seller_ref, beneficiary_ref, mode, state                                                          | Platform/organization ownership explicit; no secret key in row                                                  |
| orders                     | billable_subject_id, charge_category, merchant_config_id?, amount_minor, currency, pricing_snapshot, policy_version, state             | Typed subject; immutable charged terms; processor checkout requires merchant; external/no-fee states explicit   |
| payment_attempts           | order_id, provider_account_id, session_id?, payment_intent_id?, idempotency_key, amount_minor, state                                   | Unique provider/account/object; retry key stable                                                                |
| financial_entries          | order_id, entry_kind, amount_minor, currency, provider_reference, effective_at                                                         | Append facts: collection, refund, fee, transfer, dispute, adjustment; not a claimed general accounting system   |
| refund_requests            | payment_attempt_id, amount_minor, reserved_amount_minor, reason, actor, state, provider_refund_id?                                     | Pending refund reservations included in available balance check                                                 |
| disputes                   | payment_attempt_id, provider_id, amount_minor, state, response_due_at?                                                                 | Finance access; reconcile before closing                                                                        |
| provider_inbox             | provider, provider_account_id, event_id, object_ref, payload_version, state, attempts, next_attempt_at                                 | Unique event identity; bounded/redacted raw payload retention                                                   |

### Competition, schedules, and games

| Entity                  | Key fields                                                                                                                                                             | Invariants / access                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| competition_groups      | competition_id, parent_id?, kind, name, sort_order                                                                                                                     | No cycles; bounded depth; not administrative permission hierarchy                        |
| competition_stages      | competition_id, kind, rules_version_id, aggregation_policy, state                                                                                                      | Stage graph and qualification edges under DAT-11; explicit result scope                  |
| teams                   | league_id, stable_name?                                                                                                                                                | Optional continuity across seasons                                                       |
| season_teams            | season_id, team_id?, name, roster_min/max, colors, logo_asset_id?                                                                                                      | Season roster identity; game competitors use competition entries                         |
| roster_memberships      | season_team_id, person_id, registration_id?, jersey, valid_from/to, change_reason?                                                                                     | Season roster source; competition eligibility/exclusivity enforced on entry memberships  |
| captain_assignments     | competition_entry_id, person_id, start/end                                                                                                                             | Captain eligible on entry roster; pilot one captain/team                                 |
| draft_sessions          | competition_id, rules_snapshot, pool_snapshot, state, cursor, revision, host_id?, fencing_token, lease_expiry?                                                         | One active host; target competition entries; immutable active order                      |
| draft_actions           | session_id, sequence, command_id, action_type, person_id?, entry_id?, reverses_action_id?                                                                              | Append-only; active picks/entry rosters updated transactionally                          |
| venues/courts           | organization_id, venue_name, public_location, timezone; court name/status                                                                                              | Private staff contacts stored separately                                                 |
| calendar_sessions       | season_id, type, title, start/end, venue/court?, published_state                                                                                                       | Training/open gym do not generate game appearances                                       |
| schedule_versions       | season_id, competition_scope, revision, state, generator_version, input_snapshot, seed?, validation_report                                                             | One current publication per declared scope; cross-competition resource conflicts         |
| schedule_entries        | version_id, game/session_id, start/end, court_id?, locked, state                                                                                                       | Draft alternatives are not actual bookings                                               |
| resource_bookings       | resource_type/id, event_id, occupied_range, state                                                                                                                      | Prevent published overlapping bookings including buffers                                 |
| games                   | competition_id, stage_id?, classification, home_entry_id?, away_entry_id?, external_opponent_id?, rules_version_id, capture_mode, state, revision, official_result_id? | Distinct valid competitors; supported external-opponent shape; one owner/official result |
| game_participants       | game_id, person_id, competition_entry_id, jersey_snapshot, entry_roster_ref?, eligibility_snapshot                                                                     | Unique game/person; roster and authority at game time retained                           |
| staff_assignments       | game/session_id, user_id, duty, status                                                                                                                                 | Scorer access from assignment or explicit staff scope                                    |
| scorer_sessions         | game_id, actor_id, device_id, fencing_token, lease_expiry, last_ack_sequence                                                                                           | One authoritative writer at a time                                                       |
| game_events             | game_id, sequence, command_id, session_id, type, schema_version, clock_context, payload, received_at, supersedes?                                                      | Unique game/sequence and game/command; no overwrite                                      |
| lineup_stints           | game_id, participant_id, period, start_elapsed_ms, end_elapsed_ms?, source_revision                                                                                    | Rebuildable; open stints close on transitions/finalization                               |
| game_projections        | game_id, revision, last_sequence, reducer_version, clock_anchor, lineup, score                                                                                         | Rebuildable cache; write only with command transaction                                   |
| result_versions         | game_id, version, state, home_score, away_score, source_event_sequence?, provenance, reason?, finalized_by                                                             | Official pointer references an immutable version                                         |
| player_game_totals      | result_version_id, participant_id, appeared?, points?, milliseconds_played?, fouls?, completeness                                                                      | Missing is not zero/DNP; fields required according to capture-mode contract              |
| season_stat_projections | season/competition/stage/group, public_player_id, source_revision, known_gp, known_points, point_record_gp, known_minutes, metric_coverage                             | Explicit aggregation and capture coverage; no live/final mixing                          |
| standings_projections   | competition/stage/group, entry_id, result_set_revision, record, tiebreak_values                                                                                        | Revision consistent; no accidental joining of independent competition rankings           |
| awards                  | award_type_id, competition/season scope, typed recipient, method, explanation, source_revision?, published_at?                                                         | Optional module; grant and revision contract expanded in DAT-12                          |

### Communication, publication, and platform operations

| Entity                   | Key fields                                                                                                   | Invariants / access                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| media_items              | season/game?, title, thumbnail_asset, provider, external_video_id, visibility, publication_revision          | Allowlisted providers; approved publication                  |
| notification_events      | domain_event_id, type, source_entity/revision, minimal_payload                                               | Event reference unique; sensitive payload minimized          |
| user_notifications       | recipient_user_id, event_id, organization_id, read_at?, destination_reference                                | Recipient-specific authorization even within tenant          |
| notification_preferences | user_id, organization_id, category, channel, enabled                                                         | Essential/optional channel semantics defined                 |
| delivery_jobs            | event_id, recipient_id, channel, scheduled_at, source_revision, dedupe_key, state, attempts                  | Revalidate relationship/preferences/source before send       |
| delivery_attempts        | job_id, provider_message_id?, state, failure_code?, occurred_at                                              | Accepted != delivered != read                                |
| outbox                   | event_id, event_type, aggregate_id/revision, payload_reference, status, available_at, lease_until?, attempts | Atomic with business commit; idempotent consumer             |
| audit_events             | actor, tenant, scope, action, target, reason?, before/after redacted diff, request_id, time                  | Users cannot alter; sensitive payloads excluded              |
| idempotency_records      | organization_id, actor/scope, key, request_hash, response_reference, expiry?                                 | Same key + different payload conflicts                       |
| export_deletion_jobs     | requester, organization/scope, type, policy_version, state, object_ref?, expires_at                          | No public download; track propagation and legal holds        |
| support_grants           | platform_actor, organization_id, approved_scope, reason, start/expiry, revoked_at?                           | Temporary audited support access                             |
| usage_counters           | organization_id, metric, period, quantity, source                                                            | Entitlement/cost reporting, no unnecessary student analytics |

## 5. Integrity and indexing contract

**DAT-06 - Scoped foreign keys.** A competition entry exposes a unique `(organization_id, competition_id, id)` key. Competition rosters and game competitors reference that tuple so an entry from another competition cannot be attached even inside the same season/tenant. Competition itself has a scoped foreign key to season; recurring team and season-team references retain their own scopes. Carry sufficient scope through draft picks, results, admission, and rule versions. Nullable alternatives need explicit check constraints, not a generic `entity_id` with no validation.

Illustrative shape, not a complete migration:

```sql
UNIQUE (organization_id, competition_id, id)
FOREIGN KEY (organization_id, competition_id, competition_entry_id)
  REFERENCES competition_entries (organization_id, competition_id, id)
CHECK (roster_min >= 0 AND roster_max >= roster_min)
```

**DAT-07 - Uniqueness.** Use unique constraints/indexes for provider event IDs, draft active picks, game command IDs, sequence numbers, active application scope, and allowed active roster scope. Where interval overlap matters, enforce it with an appropriate exclusion constraint or a consistently locked command, not only a preflight query. Model reinstatement carefully; a unique active row alone does not prevent overlapping historical ranges.

**DAT-08 - Capacity.** Team/pool capacity is a cross-row invariant, requiring a parent lock or serialized allocation mechanism plus constraints. Lock shared objects in stable order. Retry deadlocks/serialization failures with the original idempotency key and a bounded retry policy.

**DAT-09 - Indexes.** Begin with tenant-prefixed indexes matching actual queries: registrations by `(organization_id, competition_id, admission_state, submitted_at)`; published schedule entries by owner/publication/start time, joined to games indexed by `(organization_id, competition_id, state)`; events `(organization_id, game_id, sequence)`; entry roster `(organization_id, competition_id, person_id)` with separately enforced eligibility-scope exclusivity; inbox `(organization_id, recipient_user_id, created_at DESC)` with an unread partial index; queue by pending state/available time; audit by tenant/time and target. Add covering/partial indexes from query plans, not speculation.

**DAT-10 - Publication.** Public DTOs allowlist fields. Published version contains safe name/photo, team, game result, and public stats with capture coverage. Never return `SELECT *` and remove private fields in JavaScript after delivery. Consent withdrawal changes projection and invalidates relevant caches.

## 6. Commands and API conventions

**API-01 - Envelope.** Business endpoints use `/api/v1`. Writes carry `commandId`, `expectedRevision` where mutable state matters, and operation payload. Server response includes `requestId`, committed revision, result/status, and safe error details. Return 401 for unauthenticated, 403/404 under a documented existence-hiding policy, 409 for revision/conflict, 422 for rule validation, and 429 with retry guidance for rate limits.

```json
{
  "commandId": "client-generated-uuid",
  "expectedRevision": 18,
  "payload": { "personId": "opaque-id", "competitionEntryId": "opaque-id" }
}
```

**API-02 - Authorization order.** Authenticate → resolve trusted tenant → validate input limits → load resource through scope → verify permission and state → execute transaction → return public/private DTO as appropriate. Validate every nested reference. Do not trust a role, amount, recipient, or published flag sent by the browser.

| Command/route                       | Authorized actor                              | Transaction/result                                       |
| ----------------------------------- | --------------------------------------------- | -------------------------------------------------------- |
| `GET /public/...`                   | Anonymous if published                        | Sanitized revisioned DTO; bounded pagination             |
| `POST /registrations`               | Verified applicant/delegate                   | Link participant, freeze form version, prevent duplicate |
| `POST /registrations/{id}/checkout` | Own application/authorized assistant          | Server-priced order and idempotent attempt               |
| `POST /registrations/{id}/review`   | School reviewer/commissioner scope            | Decision history plus admission reconciliation           |
| `POST /registrations/{id}/promote`  | Admissions permission                         | Locked capacity allocation, audit, outbox                |
| `POST /refunds`                     | Finance permission + fresh auth when required | Reserve refundable balance; async provider job           |
| `POST /webhooks/stripe`             | Verified provider signature                   | Durable deduplicated inbox                               |
| `POST /drafts/{id}/claim-host`      | Commissioner/delegate                         | Lease/fencing token and current state                    |
| `POST /drafts/{id}/picks`           | Current host                                  | Pick + roster + cursor + audit + outbox                  |
| `POST /drafts/{id}/reverse`         | Authorized host/commissioner                  | Append reversal after downstream checks                  |
| `POST /schedules/generate`          | Scheduler                                     | Versioned candidate and constraint report                |
| `POST /schedules/{id}/publish`      | Scheduler/publisher                           | Conflict validation, published pointer, bookings, outbox |
| `POST /games/{id}/claim-scorer`     | Assigned scorer/commissioner                  | Lease/fencing and latest revision                        |
| `POST /games/{id}/events`           | Current scorer                                | Atomic bounded batch, sequence and projection            |
| `POST /games/{id}/submit`           | Current scorer                                | Completeness/reconciliation validation                   |
| `POST /games/{id}/finalize`         | Finalizer                                     | Immutable result + consistent official publication       |
| `POST /games/{id}/correct`          | Commissioner with correction permission       | New result revision + affected aggregates                |
| `POST /settings/{scope}/publish`    | Scope owner/publisher                         | Version check, impact validation, publish                |
| `POST /announcements/{id}/publish`  | Communicator                                  | Server-resolved audience, outbox jobs                    |
| `POST /notifications/{id}/read`     | Recipient only                                | Own notification state; cannot choose another recipient  |
| `POST /exports`                     | Scoped export permission                      | Async private expiring export                            |

**API-03 - Pagination and limits.** Cursor paginate variable lists. Proposed starting limits: 100 rows/page, 100 game events/batch, 256 KB ordinary JSON commands, and bounded preview results. Tune through rehearsals. Reject oversized/deep inputs before expensive work. Use stable ordering and revision-aware queries for tables changing during a draft.

**API-04 - Idempotency.** Bind key to tenant, actor/operation scope, and canonical request hash. Matching retry returns prior outcome; differing payload conflicts. Financial and game-event object uniqueness outlives any short-lived request cache. A timeout must not encourage a new key that repeats the effect.

**API-05 - Workers.** Claim pending jobs in a short transaction using a lease and row locking; release transaction before network I/O. Record outcome and retry with exponential backoff/jitter. Expired leases are recoverable. Consumers tolerate at-least-once execution. Unknown provider outcomes are reconciled, not blindly repeated as fresh operations.

**API-06 - Database functions.** Prefer invoker identity. Any elevated function fixes `search_path`, fully qualifies tables, revokes broad execution, checks caller/resource permission, and accepts only supported inputs. Webhook/worker principals use narrowly reviewed system paths; the broad service key is not the general application database identity.

## 7. Caching, public reads, and future scale

**ARC-07.** Cache keys include tenant, league, season, publication revision, and all relevant filters. Private portal/admin responses use private/no-store semantics as appropriate. Never cache a user-specific server render into a tenant-wide/public key. Invalidation follows committed domain events; emergency unpublish can purge caches immediately.

**ARC-08.** Serve public standings/stats from materialized tables or cached projections, not repeated scans of raw game events for every visitor. Keep official updates revision consistent; rebuild projections from source if necessary. Do not add Redis until measured cache/queue requirements justify another store.

**ARC-09.** Keep the database portable: versioned SQL migrations, export formats, documented extensions, and restore rehearsal. Supabase Auth and Realtime have platform-specific integration cost; document an exit plan rather than pretending migration is free.

## 8. Faraj and concept reuse

Earlier repository notes inspected Faraj at commit `b00384eda873bc33052e5efdac62cb9d447d71c0`; this draft does not claim a new audit of its current production deployment. Reuse its navigation, visual patterns, draft interactions, and basketball behavior only after reviewing the exact source and tests to be ported.

Before reuse: check ownership/license, dependency compatibility, data assumptions, mobile accessibility, security boundaries, and correct persistence of minutes/appearances. The earlier review recorded shared-password access and a minutes-save gap as items to replace, not accepted platform architecture. Preserve any useful reducer behind a tested sport interface; rebuild persistence/authorization boundaries.

No demo fixture, sample headshot/name pairing, browser-local session, persona switch, or stored mock payment becomes production data. The first production slice must be verified identity → tenant membership → private registration, tested against a second tenant.

## 9. Shared-product contracts added by the fit review

**ARC-10 - Ownership and institutions.** An owning workspace is the tenant boundary; institution records identify participating clubs/schools and can exist without a workspace/login. Administrative units inside a workspace form a bounded validated tree for delegation. Affiliation across workspaces is an explicit effective-dated relationship with agreed resource/purpose/field scopes; it grants no default access. Each competition has one owner, each game one official-result authority. A submitted roster is a recipient-owned competition snapshot with provenance and retention rules, not a cross-tenant join exposing the source's entire person record. Decide and record this authority model before federation functionality; the pilot implements the local workspace path only.

**DAT-11 - Competition foundation.** Introduce explicit competitions and entries with the first competition schema. Season is a time period in a program; competition is a contest with entry, rules, and result boundaries. Stable team identity, season-team roster, competition entry, entry roster, and game participant snapshot have different purposes. Entries initially reference teams; an individual-event adapter is future scope with typed competitor constraints, not a fake one-person basketball team. A player's exclusivity scope is configurable and enforced transactionally; uniqueness on `(organization_id, season_id, person_id)` must not universally forbid participation in two permitted competitions. Indexes alone do not define eligibility.

| Contract/entity                               | Essential fields and invariant                                                                                                 | Implementation boundary                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| competitions                                  | workspace, league/season scoped reference, sport/variant, type, rules_version, admission_policy, capture_mode, state, revision | Pilot: one default competition; references present from first production competition migration     |
| competition_entries                           | competition_id, supported competitor reference, institution_ref?, category/seed, admission state, source_ref?, revision        | Pilot team entry created during placement; team-submitted enrollment follows                       |
| entry_roster_memberships                      | entry_id, person_id, valid range, source_season_roster_ref?, eligibility revision, state                                       | Snapshot/membership scoped to competition; historical ranges preserved                             |
| teams and season_teams                        | stable team identity and separate season roster identity; school/club reference optional                                       | Returning-team continuity supported without copying old eligibility or payments                    |
| competition_categories and alignment_versions | typed dimensions, criteria/version, effective period, assigned institutions/entries                                            | Simple category in pilot; governance realignment later                                             |
| stage_nodes and qualification_edges           | format/rule version, seed source, source outcome/target slot, official source revision, state                                  | Pilot presets; later cross-competition edges explicitly authorized                                 |
| admission_policies                            | supported subject/entry mode, eligibility scope, capacity unit, payment requirement, placement method, version                 | Pilot individual/upfront/draft values; fields not hard-coded to school workflow                    |
| order_items and billable_subjects             | typed registration/team-entry/membership/service references, quantity, amount/currency, immutable price snapshot               | First payment design separates order from individual application; add subject types when supported |

Game competitors, standings, application scopes, draft targets, and published queries must carry competition/entry scope even when the UI shows only one league. A season-wide dashboard is a derived aggregate, not permission to combine unrelated rankings. A result can feed several explicitly defined views; it has one authoritative source and deduplication identity.

**DAT-12 - Module records.** First optional extension requires a module catalog/version manifest and scoped module installation/configuration. An award module uses award_types, award_grants, grant_revisions, artwork assets, and cabinet blocks. Typed recipient references and scope checks prevent an award targeting another workspace's person/team. Automated grants deduplicate by rule/source revision/recipient and handle result corrections. Keep editorial rankings separate from official standings. Choose concrete SQL constraints when implementing the module; no unrestricted entity-attribute-value store for arbitrary customer code.

**DAT-13 - Federation extensions.** Later schemas cover institutions, administrative_units, affiliation_agreements, scoped_delegations, sporting_memberships, credentials, eligibility_cases, decisions/appeals, and sharing_receipts. Each includes issuer/owner, resource scope, effective period, state/revision, and restricted evidence references where needed. Membership here means sporting membership, distinct from existing `memberships` login access; name production tables unambiguously. Do not create these unused tables solely to suggest readiness, but document and review their relationship to pilot identities before approving the base model.

**API-07 - Integration contract.** Imports and future provider adapters use stable external-ID mappings `(provider, provider_account, object_type, external_id)` scoped to the data owner, staging/dry-run, idempotent commands, and error/reconciliation reports. Each integration declares direction, field authority, frequency, credential scope, corrections, conflict policy, retention, quotas, and exit/export behavior. Bulk imports cannot bypass permission/capacity/eligibility rules. Machine access later uses dedicated revocable service principals with explicit scopes; never reuse a commissioner's session or disclose a service key. Public API/webhook products add documented versioning, signed delivery, retry/replay and deprecation contracts before sale. An external results feed cannot silently overwrite an approved local correction.
