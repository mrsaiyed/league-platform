# League Platform — School Pilot & Product Foundation

**Working specification v0.1 · October 6, 2026**

**Status:** Ready for discussion and revision. Confirmed requirements come from the founder's instructions. Architecture, defaults, targets, and sequencing are recommendations unless explicitly marked confirmed. This document is a proposed implementation contract, not a claim that the product is built or that every decision has been approved.

**First customer:** An unnamed private school running an internal basketball league for grades 9–12.
**Product ambition:** A shared, hosted league-management product that gives each organization its own configurable operations and attractive public website, beginning with basketball.
**Reference implementation:** Faraj League, reviewed at commit b00384eda873bc33052e5efdac62cb9d447d71c0.
**Unresolved naming:** Product name, school name, legal business name, production domain, and commercial arrangements.

## 1. How to use this specification

Every feature must answer three questions: what does this school need, how could other leagues use it, and what structure must we put in place now?

The labels used throughout are:

| Label | Meaning |
|---|---|
| CONFIRMED | The founder stated this requirement or corrected an earlier proposal to establish it. |
| PROPOSED | A recommended product, technical, or operational decision for review. |
| OPEN | Information or a decision is still needed. A linked decision identifies when it becomes necessary. |
| LATER | A future capability. Build only the named foundation now. |

Priority is separate from approval: a proposed requirement can be essential to safe implementation while still requiring discussion. “Launch” means needed before the relevant pilot activity, such as opening paid registration or running the draft.

Requirement identifiers are stable discussion handles. Decisions can change without losing their rationale. A feature is complete only after its observable behavior, permission rules, data changes, failure handling, and acceptance checks are satisfied.

## 2. Business and product definition

**CONFIRMED direction:** Provide software for league organizers to run and publish their leagues. The commissioner configures the league. Players register themselves. The client supplies game-operation staff and Wi-Fi.

**PROPOSED business structure:** One maintained software product, with optional paid onboarding, migration, branding setup, and training. Optional services and general-market pricing remain unapproved. Each new customer should normally be onboarded through configuration, not a separate code fork.

The operator buying the service, the person using it, the person paying a participation fee, and the recipient of that fee can be different parties. Store these relationships separately.

For this pilot, the company intends to collect student payments directly. Approximately $50 per student was suggested. This is not yet a finalized price, an agreed revenue split, or a confirmed merchant arrangement. At 24–28 paying students and exactly $50, total collections would be $1,200–$1,400 before refunds, processing costs, and any other obligations.

The long-term pricing model may include organization subscriptions, season fees, participant-based charges, payment fees, or services. Do not implement all pricing models for the pilot. Keep product entitlements, organization billing, and player registration charges separate so one model does not dictate the others.

**Product promise:** An organizer can move from registration through team formation, scheduling, game recording, results, communication, and season history using connected information. The public site gives participants a clear place to find their league.

Success hypotheses to validate:

- Players can find their next game and team with minimal navigation.
- A commissioner can configure and operate a season without a developer changing code.
- Staff enter game information once; schedules, rosters, scores, and statistics reflect it consistently.
- The draft and scoring interfaces work under actual event conditions.
- A second organization can use the same application while remaining isolated from the school.
- A pilot confirms usability and operational value; external willingness to pay still needs validation.

## 3. Confirmed school brief and unresolved settings

| Item | Pilot value | Status |
|---|---|---|
| Sport | Basketball | CONFIRMED |
| Eligibility | Students in grades 9–12 at the school | CONFIRMED |
| Teams | Four | CONFIRMED current brief |
| Roster size | Six to seven players per team | CONFIRMED range |
| Total players | 24–28 implied by the roster range | Derived; exact cap OPEN |
| Captains | Appointed by commissioner | CONFIRMED |
| Captain roster slot | Captain counts among the six to seven players | PROPOSED; D-03 |
| Signup | Individual self-service registration | CONFIRMED |
| Verification | Manual school approval suitable for pilot | Working pilot choice; method OPEN |
| Payment | Collected at application, including waitlisted applicants | CONFIRMED |
| Fee | Approximately $50 per student | OPEN exact price |
| Waitlist refunds | Can be issued after the season starts | CONFIRMED capability; trigger OPEN |
| Draft | One host records captains' choices during an external call | CONFIRMED |
| Draft order | Snake, repeating, or custom order | OPEN |
| Open gym | Publish scouting-session information | CONFIRMED |
| Schedule | Admin enters requirements and generates/adjusts schedule | CONFIRMED |
| Game format | Periods, clock, overtime, fouls, and playoffs | OPEN |
| Game staffing | Supplied by client, with Wi-Fi | CONFIRMED |
| Participation | Derived from live lineups/substitutions and playing time, persisted to database | CONFIRMED |
| Stats | Final scores, individual points, appearances, season totals, PPG | CONFIRMED |
| Awards | Possible; definitions and launch necessity undecided | OPEN |
| Public access | No login for published information, names, teams, schedules, results, standings, scoring leaders | CONFIRMED |
| Private information | Registration/contact information remains private | CONFIRMED |
| Launch dates | Not yet known; dates are configured by commissioner | OPEN |

The school is a configuration of the product. Grades, four teams, roster sizes, price, labels, and dates must never become global constants.

## 4. Scope and expansion map

| Domain | Deliver for school pilot | Foundation implemented now | Broader product / later work |
|---|---|---|---|
| Organizations | School workspace and staff accounts | Organization identifiers, memberships, isolation, tenant-aware routes | Self-service organization creation; multiple operators |
| League structure | Basketball league with recurring seasons | Organization → league → season → stages/groups | More leagues, divisions, conferences, tournaments |
| Branding | Logo, colors, description, ordered homepage blocks | Validated theme tokens and reusable page components | Theme catalog; richer layouts; custom domains |
| Registration | Individual signup and private status page | Versioned form, registration state, eligibility decisions | Team signup, families, memberships, complex eligibility |
| Verification | Manual approval; verified contact email | Evidence type, review status, reviewer, decision history | Domain rules, roster matching, school SSO/SIS |
| Payments | Upfront checkout and staff-controlled refund capability | Orders, attempts, refunds, webhook inbox, merchant configuration | Connected league accounts, fees, installments |
| Draft | One host; board, order, picks, undo, rosters | Draft sessions, immutable actions, transactions, host lease | Captain-operated drafts, trades, auctions |
| Scheduling | Round-robin generation, manual edits, published revisions | Courts, availability, constraints, deterministic generator interface | Optimization engine, travel, shared-coach constraints |
| Games | Staff operate live basketball tracker | Game-specific roster snapshots, ruleset version, event log | Additional basketball stats; other sport engines |
| Public experience | Mobile public league home and season views | Public projections, cache rules, visibility controls | League discovery, public profiles, embeds |
| Messaging | Transactional email and admin announcements | Outbox, delivery records, templates, preferences | SMS, push, integrations |
| History | Completed seasons and corrections | Season-specific teams, game versions, retention controls | Career history and cross-season comparisons |
| Platform operations | Small operator console and manual school setup | Provisioning routine, capability flags, exports, metrics | Subscription plans, enterprise support, richer reporting |

Pilot scope excludes built-in calling/video conferencing, native app releases, public social feeds, video hosting, automated scouting, betting, an arbitrary workflow programming language, and full student-information-system integrations. These exclusions do not prevent the named future capabilities where foundations are explicitly included.

## 5. Recommended technical architecture

**PROPOSED architecture:** A modular monolith: one web application with clearly separated business modules and a managed PostgreSQL database. Public pages, commissioner tools, registration, and live scoring share domain rules. This is simpler to operate initially while allowing modules to become separate services if measured demand justifies it.

| Layer | Proposed choice | Purpose and boundary |
|---|---|---|
| Web application | Next.js App Router, React, TypeScript strict mode | Server-rendered public pages; interactive admin, draft, and tracker screens |
| UI | Tailwind CSS and accessible component primitives, initially shadcn/ui | Consistent mobile layouts, keyboard behavior, and theme tokens |
| Validation | Zod shared schemas | Validate request payloads and versioned configuration; server validation is authoritative |
| Database | Supabase-managed PostgreSQL | Relational consistency, transactions, constraints, and row-level security |
| Authentication | Supabase Auth using individual accounts | Email verification, sessions, invitations, recovery, staff MFA |
| Application API | Next.js Route Handlers with shared domain services | Authentication, permission checks, input validation, provider adapters |
| Atomic mutations | Explicit PostgreSQL functions with restricted execution | Capacity allocation, draft picks, event batches, finalization |
| Database access | Supabase client with caller identity for normal requests | Preserve database authorization; generated TypeScript database types |
| Live synchronization | Supabase Realtime for authorized staff; cached public snapshot polling initially | Realtime is a delivery mechanism; database state remains authoritative |
| Payments | Stripe-hosted Checkout and verified webhooks | Cards/wallets initially; merchant topology resolved before live collection |
| Email | Resend with a verified sending domain | Transactional mail, delivery webhooks, suppression management |
| Background work | PostgreSQL outbox + scheduled Supabase Edge Function worker | Durable notifications, reconciliation, scheduled tasks; bounded batches |
| Hosting | Vercel commercial plan for the web app; Supabase for backend services | Managed deployments and CDN; colocate server and database regions |
| Error monitoring | Sentry with private-data scrubbing | Server/client failures, release attribution, actionable alerts |
| Tests | Vitest, Playwright, database SQL/pgTAP tests | Domain behavior, real user journeys, isolation, concurrency |
| Repository / CI | GitHub and GitHub Actions; pnpm lockfile | Reproducible builds, review, migration checks, deployment gates |

Exact package versions must be pinned in the implementation lockfile after checking compatibility at kickoff. Use maintained stable releases; do not treat “latest” as a reproducible dependency declaration. Database engine choice is the supported version available in the selected Supabase project, not a requirement to chase the newest PostgreSQL release.

Supabase is proposed because Faraj already uses it and the new product needs its core relational and identity capabilities. Reuse domain logic and UX patterns selectively. A new platform application avoids coupling school privacy and multi-organization access to Faraj's shared admin password or permissive public tables.

Next.js documents shared-application tenant routing; Supabase documents server-side authentication and PostgreSQL authorization. The architecture here is our design proposal, not a vendor guarantee. [Next.js tenant guide](https://nextjs.org/docs/app/guides/multi-tenant), [Supabase server clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

### 5.1 Runtime flow

~~~text
Browser
  ├─ Published league pages → Next.js public projection/cache → PostgreSQL
  ├─ Account/admin requests → validated API → permissioned domain command → transaction
  └─ Live scorer → local IndexedDB queue → event batch API → persisted log/projection

Database transaction → audit event + durable outbox
Outbox worker → email / cache invalidation / allowed realtime notifications
Stripe → signed webhook inbox → idempotent payment reconciliation → registration update
~~~

Third-party failures must not silently roll back an otherwise valid league action. Store the action and its outgoing work together; retry notification delivery separately.

### 5.2 Repository skeleton

~~~text
apps/web/
  app/                         public, account, staff, and platform routes
  components/                  shared UI and league page blocks
  features/                    registration, draft, schedule, scorer screens
  server/                      request auth, domain orchestration, adapters
packages/domain/
  organizations/ identity/ registration/ payments/
  competitions/ rosters/ drafts/ scheduling/
  games/ statistics/ publishing/ communications/
packages/sports/
  basketball/                  rule validation, event reducer, stat formulas
packages/contracts/            request schemas, events, public DTOs
packages/ui/                   theme tokens and accessible primitives
supabase/
  migrations/                  schema, policies, functions, grants
  functions/outbox-worker/     scheduled/retry work
  tests/                       isolation and transaction tests
tests/e2e/                     pilot journeys and recovery exercises
docs/                          decisions, runbooks, API contracts
~~~

One deployable web app; shared packages define boundaries without creating microservices. Shared code used by an Edge worker must remain compatible with that runtime.

## 6. Organizations, identity, and permissions

**ORG-01 — Tenant identity.** Every league-owned row carries organization_id. Seasons and games additionally carry league_id/season_id as needed for integrity and indexing. Composite foreign keys prevent a record from referencing another organization's child record.

**ORG-02 — Person versus account.** A participant is an organization-scoped person record. An authentication account can be linked to it, but is not the participant itself. This permits imported players, payer/guardian relationships later, and account recovery without rewriting sports history. There is no automatic cross-organization exposure or global player directory.

**ORG-03 — Memberships.** One account can hold different roles in different organizations. Authorization checks organization membership and the required scope for every mutation. A URL slug or client-provided organization_id alone never grants access.

**ORG-04 — Pilot provisioning.** Platform staff provision the school and first commissioner using a reusable, idempotent onboarding command. Create a second synthetic organization in staging and test isolation before launch. General self-service onboarding is later.

| Action | Visitor | Applicant/player | Captain | Assigned scorekeeper | Commissioner | Platform finance/support |
|---|---|---|---|---|---|---|
| View published league data | Yes | Yes | Yes | Yes | Yes | Yes |
| View own private application/payment status | No | Own linked record | Own linked record | Own linked record | Authorized league applicants | Explicit support/finance scope |
| Review private applications / approve eligibility | No | No | No | No | Yes | Explicit support grant only |
| View approved draft pool | No by default | No by default | Authorized pool fields | No | Yes | Explicit support grant |
| Enter draft picks | No | No | No in pilot | No | Current draft host | No by default |
| Edit team roster | No | No | View own roster; edit later | No | Yes | Explicit support grant |
| Enter game events | No | No | No | Assigned game | Yes | No by default |
| Finalize game | No | No | No | Submit for finalization by default | Yes | No by default |
| Correct finalized results | No | No | No | No by default | Yes, reason required | Explicit support grant |
| Generate/publish schedule | No | No | No | No | Yes | Explicit support grant |
| Request refund | No | Own registration request | Own request | Own request | Request/review | Yes |
| Execute refund | No | No | No | No | Only if finance permission granted | Finance role |
| Change payment destination/provider secrets | No | No | No | No | No in pilot | Platform finance/admin |
| Manage staff permissions | No | No | No | No | Within delegated ceiling | Platform administration |

Separate permission keys from role names. Initial roles are fixed presets; later custom roles can reuse the same keys. A commissioner cannot grant a power they lack, and a captain title is linked to a person/membership rather than stored as a name string.

**AUTH-01 — Proposed sign-in.** Email one-time codes for applicants and invited staff, with a normal verified account/session. Confirm school email delivery before relying on it. OAuth/SSO can be added through identity mappings.

**AUTH-02 — Staff security.** Require MFA for commissioners and finance/platform administrators. Scorekeeper MFA requirement is configurable and should be tested for courtside practicality. Enforce permissions server-side and in database procedures; hiding a button is insufficient.

**AUTH-03 — Sessions.** Private pages and responses are never shared-cacheable. Validate the session on the server, protect cookie-authenticated writes against cross-site requests, support logout/revocation, and rate-limit sign-in and verification attempts. Never log login codes or session tokens.

## 7. League setup, configuration, and branding

**CFG-01 — Setup wizard.** Collect league name, sport, timezone, season label, visibility, team/roster structure, registration policy, fee, draft mode, game rules, and scheduling availability. Save progress. Show incomplete required decisions before activating the affected feature.

**CFG-02 — Typed configuration.** Store stable entities and relationships in relational tables. Use validated, schema-versioned JSON only for bounded settings such as theme tokens, field definitions, and sport rules. Avoid a free-form key/value store for payment, draft picks, permissions, or authoritative game state.

**CFG-03 — Versioning.** Editing an unpublished configuration creates a draft version. Activating a version records actor and timestamp. A registration references the form/payment-policy version shown at application. A game references the ruleset and roster snapshot used. Later edits do not rewrite past transactions.

**CFG-04 — Change impact.** Before lowering capacity below confirmed registrations, changing roster limits, changing scoring rules after play, or editing a published schedule, show consequences. Require an explicit resolution rather than silently removing players or changing history.

**CFG-05 — Pilot branding.** Name, logo, two accessible accent colors, light/dark presentation choice if implemented consistently, description, contact link, and homepage block order. Navigation uses familiar task labels. Draft and preview changes before publishing.

**CFG-06 — Content blocks.** Pilot blocks: league introduction, next games, announcements, standings, scoring leaders, rules, open gym, optional awards and sponsor strip. Only enabled blocks appear. Empty optional areas do not clutter navigation.

**CFG-07 — Future boundaries.** Theme packs, custom domains, additional competition formats, and sport rules can be added through explicit modules/configuration versions. Arbitrary customer JavaScript, arbitrary database expressions, and a general visual workflow language are outside v0.1.

**CFG-08 — Capabilities.** Feature availability and purchased entitlements are separate from user permissions. An organization having a draft feature does not authorize every member to operate it.

## 8. Registration, verification, and capacity

### 8.1 Signup experience

**REG-01 — Entry.** A public registration page explains eligibility, fee, available-place/waitlist conditions, approval, refund policy, and application dates before checkout. Payment does not by itself guarantee eligibility or a confirmed playing place.

**REG-02 — Proposed pilot fields.** Legal/preferred name as needed by school approval, public display name, grade (9–12), verified contact email, and acceptance of the published league rules and payment/refund policy version. Jersey number is optional and can be assigned later. Phone, student ID, date of birth, emergency/medical information, and documents are not collected by default; add only if the school establishes a specific need and access policy.

**REG-03 — Payer separation.** A parent or another person may pay for a student. Store payer receipt contact separately from participant identity. A payment does not automatically give the payer access to all student information.

**REG-04 — Account and duplicate handling.** Applicant verifies their contact email, creates/submits the application, and enters checkout. One active registration per person per season/division scope. Matching email alone must not merge two different children or people. School staff can resolve suspected duplicate records with an audit entry.

**REG-05 — Payment timing, CONFIRMED.** Payment is collected during application, including when the applicant is waitlisted. This replaces the earlier approval-before-payment proposal. An unpaid or failed checkout is incomplete and cannot enter the paid draft pool.

**REG-06 — Private status page.** Show application, verification, placement, payment, and team-assignment status separately. Show the amount received, refund progress, next action, and support contact. Public URLs never disclose private status.

### 8.2 Independent states

| State dimension | Proposed values | What it controls |
|---|---|---|
| Application | draft, submitted, withdrawn, closed | Whether an application exists and remains active |
| Verification | pending, approved, rejected, needs_information | Eligibility decision |
| Admission | unallocated, reserved_pending_review, confirmed, waitlisted, released | Capacity allocation |
| Payment | unpaid, processing, paid, refund_pending, partially_refunded, refunded, disputed | Financial state derived from provider records |
| Team assignment | unassigned, assigned | Roster membership, derived rather than separately editable text |

Allow only meaningful transitions. A refunded registration is not draft-eligible by default. A dispute triggers finance review; it does not silently erase a student's sports history.

### 8.3 Admission and fairness

**REG-07 — PROPOSED ordering rule.** Successful payments establish registration priority using provider payment time plus a deterministic ID tie-breaker. Staff review speed should not silently reorder students. The school must approve this rule under D-02.

**REG-08 — PROPOSED reservations.** The earliest paid applications up to the configured capacity hold provisional places pending school review. Others are waitlisted. A reservation is not approval. Rejection, withdrawal, or an explicit staff action releases it; review reminders flag stalled applications. No automatic reservation expiry until a school policy is configured.

**REG-09 — Transactional allocation.** Capacity changes lock the relevant season/division capacity row. Recompute eligibility and available places, update allocation, and write audit/outbox entries in one transaction. Concurrent payments cannot create extra confirmed places.

**REG-10 — Waitlist payment race.** If a place fills during checkout, preserve the successful payment and assign the applicant to the paid waitlist under the disclosed policy. When a finite paid waitlist limit is configured, reserve an application slot during checkout; if a late payment succeeds after the slot expires and no permissible place remains, flag it for immediate refund handling. Never leave a charge with no linked registration.

**REG-11 — Promotion.** Commissioner can promote an eligible, paid waitlisted student when a slot is available. Proposed default: promote by queue order with explicit confirmation, then notify the student. Overrides require a reason. No second payment is collected for an already fully paid registration.

**REG-12 — Capacity controls.** Distinguish playing capacity, team roster maximum, and optional waitlist capacity. Increasing playing capacity does not automatically add a team. Lowering capacity never silently removes admitted students. Rostering beyond a configured maximum requires an explicit policy change or tracked exception.

**REG-13 — Manual additions.** Normal signup is self-service. A commissioner may assist with a registration or import a player under a documented reason. This does not silently bypass payment, eligibility, or consent requirements. Fee waivers and offline payments require explicit finance authority.

### 8.4 Verification

**VER-01 — Pilot.** School staff manually approve/reject registrations and grade eligibility. Store decision, reviewer, timestamp, and a private reason where necessary.

**VER-02 — Evidence distinction.** Verified contact email, allowed school domain, current enrollment, grade, and permission to play are separate facts. Email-domain control alone does not establish all of them.

**VER-03 — Future.** Add verification adapters for authorized roster imports, school SSO, or approved SIS integrations. Each adapter returns named claims, source, scope, validity period, and verification time. The eligibility policy decides which claims suffice.

**VER-04 — Data minimization.** A future integration should retrieve the minimum required eligibility attributes. Do not mirror an entire school information system into the platform merely to determine whether a student can register.

**Pilot acceptance:** A paid student can remain pending approval; an approved waitlisted student cannot be drafted; a confirmed eligible student can; payment/queue retries do not create duplicate places.

## 9. Payment collection, refunds, and reconciliation

**PAY-01 — Checkout.** Use Stripe-hosted Checkout with server-created order amounts. Initial proposal: USD, card and supported card-wallet payments, full capture at application. Price, currency, policy version, registration ID, and merchant configuration are snapshotted on the order. Never trust a client-submitted price.

**PAY-02 — Source of truth.** The browser success page is informational. Verified payment notifications and provider reconciliation establish payment success. Store provider event IDs in a webhook inbox with a unique constraint and process idempotently. Support duplicate, delayed, and out-of-order events. [Stripe Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment.md?payment-ui=stripe-hosted), [Stripe webhooks](https://docs.stripe.com/webhooks).

**PAY-03 — Attempts.** One registration can have several failed/expired attempts but only its intended paid balance. Reusing a checkout request uses an idempotency key. An additional successful payment is an overpayment case for finance review/refund, not a second roster place.

**PAY-04 — Merchant choice, OPEN.** Collection by the company is intended; the legal recipient, service agreement, beneficiary, revenue allocation, and responsibility for refunds/disputes must be settled before live payments. Model merchant account/provider account identifiers from day one. Choose either the company's own collection arrangement or an appropriate connected-account flow based on that decision; do not build a fictitious revenue split. [Stripe Connect charge models](https://docs.stripe.com/connect/charges).

**PAY-05 — Refund capability, CONFIRMED.** Remaining waitlisted students can be refunded after the season starts. Exact timing, automatic versus staff-triggered execution, full versus partial policy, and school-rejection/withdrawal/cancellation treatment are OPEN.

**PAY-06 — Proposed default pending D-01.** Authorized finance staff review the remaining paid waitlist after an admin-configured cutoff and issue refunds. No automatic refunds are enabled merely because a start date passes. A preview lists recipients, amounts, reasons, and remaining admitted players.

**PAY-07 — Refund integrity.** Create a refund request with unique idempotency key; reserve its amount against the refundable balance transactionally; call the provider; reconcile asynchronous outcome. Concurrent requests cannot exceed the amount collected. Pending requests count against remaining refundable balance until resolved. A refund request is not displayed as completed before provider confirmation.

**PAY-08 — Financial history.** Preserve original charges, fee allocation, refund attempts/results, dispute state, actor, and timestamps. Never overwrite a paid amount to make a refund appear as though no transaction occurred. Registration cancellation, slot release, and refund are coordinated actions with separate records.

**PAY-09 — Refund economics.** Refund policies must account for processor costs and available balances. Stripe currently states that original processing fees are not returned and that some refunds may remain pending for insufficient balance. This is a reason to configure a policy and monitor it, not an assumption that students bear those costs. [Stripe refunds](https://docs.stripe.com/refunds).

**PAY-10 — Reconciliation.** Scheduled job compares recent unresolved orders/refunds with provider state; staff can retry reconciliation. Finance export separates gross collected, refunded, processor fees, platform revenue allocation, payable balances where applicable, and net cash. Unsettled commercial allocations are marked unclassified.

**PAY-11 — Safety.** Card numbers and security codes never touch application storage. Webhook routes validate signatures over the raw request body. Test/live keys and provider account IDs are separated. Financial logs omit sensitive payment/contact payloads.

**Future:** Installments, scholarships/discounts, team payments, organization subscriptions, and connected league payouts extend the payment module. No global $50 constant; no assumption every organization pays the platform through player charges.

## 10. Open gym, captain assignment, and hosted draft

**DRF-01 — Open gym.** Commissioner publishes date/time, location, description, attendance instructions, and changes. Scheduling a scouting session does not create a league game or affect statistics. Public and private session notes are separate.

**DRF-02 — Draft pool.** Only active, verified, admitted participants meeting the configured payment requirement enter the eligible pool. Private contact/payment information is excluded from the board. Proposed visible fields: approved display name, grade if school authorizes it, and an optional private-to-captains scouting note.

**DRF-03 — Captains.** Commissioner selects a participant for each team and links a captain membership. Proposed default: captains are preassigned, consume roster capacity, and are removed from the remaining player pool. Validate D-03 before the draft.

**DRF-04 — One host, CONFIRMED.** Commissioner or delegated host conducts an external call and enters picks. The product supplies a screen-share-friendly board; built-in calling is unnecessary. Captains may receive read-only board access. Captain-driven picking is later.

**DRF-05 — Board.** Show available players, team rosters, remaining slots, current pick/team/round, previous picks, and optional countdown. Search/filter the pool without changing pick order. Provide click/tap selection as well as drag-and-drop; mobile and keyboard users must not depend on dragging.

**DRF-06 — Draft order.** Support a validated explicit pick-order list in the data model. Pilot UI proposes snake and repeating order plus commissioner reordering before start. A generated order is stored as a snapshot. Choice and tie/uneven-roster rules remain OPEN.

**DRF-07 — Limits.** Under the proposed captain-slot rule, team maximum includes its captain. With uneven enrollment, show the proposed distribution before starting; do not fabricate picks for nonexistent players. Commissioner selects whether to stop at equal rosters or allow the configured one-player difference. Draft rounds are derived from remaining slots and the chosen distribution.

**DRF-08 — Pick transaction.** Lock the draft session, check host lease/version, check eligible participant and team capacity, append pick, create roster membership, advance cursor, and record audit/outbox together. Repeated submission of the same command returns its original result. A player cannot occupy two current rosters in the same competition.

**DRF-09 — Host ownership.** One active editing host/session per draft. Store host_user_id, lease expiry, and incrementing fencing token. Proposed heartbeat every 10 seconds, lease expiry after 45 seconds. Commissioner can take over with an explicit action; stale hosts' writes are rejected even if their browser still shows an editable board.

**DRF-10 — Recovery.** Each confirmed pick is durable before the board calls it saved. Reopening retrieves current server state. Draft picks require connectivity; a dropped connection disables new authoritative picks until ownership/state is reconciled. A host may continue discussion on the call.

**DRF-11 — Pause/timer.** Pause/resume and optional countdown. Proposed expiration behavior: alert the host; never auto-select a player or silently skip the team. Timer state survives reload through a stored deadline/remaining duration.

**DRF-12 — Corrections.** “Undo last pick” records a reversal linked to the original pick and updates the roster transactionally. Earlier-pick changes require an impact preview and commissioner authority. History remains visible to authorized staff. Roster reassignment after the draft is a separate action with a reason.

**DRF-13 — Completion.** Commissioner reviews rosters, resolves unassigned players, confirms completion, and publishes team assignments. Sending assignments is a separate publish action; repeated clicks do not resend identical notifications.

**Future foundation:** Pick actions and ownership are reusable for multiple host models. Do not store authoritative draft progress in generic content blocks or rely on client-only roster changes.

**Acceptance:** Double-clicking one pick creates one pick; two open host tabs cannot create conflicting histories; a full team rejects another pick; undo restores availability; a restart preserves order and rosters.

## 11. Competition setup and schedule generation

**SCH-01 — Inputs.** Season timezone; date range; playable weekdays and start/end windows; venues/courts; blackout dates; game duration and turnover buffer; desired games per team or round-robin repetitions; minimum rest; maximum games per team per day; and optional playoff dates.

**SCH-02 — Pilot generator, PROPOSED.** Deterministic round-robin pairing with constrained placement into court/time slots. Support an odd number of teams with byes even though the pilot has four. Explicitly identify unsupported combinations. Advanced optimization/AI is later.

**SCH-03 — Hard versus soft constraints.** Hard: no court overlap, no team overlap, court availability, season bounds, configured minimum rest. Soft: balance early/late games and distribute byes. Explain any unmet preference. Never label an invalid schedule successful.

**SCH-04 — Feasibility.** Calculate required game slots before generation and report capacity shortfall, impossible rest requirements, or indivisible game-count requests. Offer concrete options for the commissioner to change; never quietly drop games.

**SCH-05 — Reproducibility.** Save generator name/version, inputs, optional deterministic seed, requested constraints, generated schedule version, and validation report. Given the same inputs/version, reproduce the result for debugging.

**SCH-06 — Draft editing.** Commissioner reviews a calendar and list view, moves games, locks selected games, and regenerates only the unlocked portion. Games already played are fixed. An explicit valid manual schedule/import remains possible.

**SCH-07 — Publication.** A schedule draft becomes public only through publish. Store a published version and a change set. Public schedule and team pages change together. Notify only affected participants/staff for subsequent revisions; default to a reviewed batch.

**SCH-08 — Changes.** Reschedule, postpone without a replacement time, cancel, or move a court. Preserve old time/location and reason. A postponed game has a clear TBD display. Calendar feeds retain stable event IDs and increment revisions.

**SCH-09 — Time.** Store absolute game times as UTC timestamps and the organization's IANA timezone separately. Recurring availability is local to the venue timezone. Resolve daylight-saving ambiguity explicitly; never depend on a server's local timezone.

**SCH-10 — Conference/group structure.** An optional group tree represents division/conference labels. A school may use one table for all four teams. Published rules define cross-group play and standings scope. Advanced multi-division scheduling can be enabled later without altering core game identity.

**SCH-11 — Playoffs.** Proposed pilot support: configurable qualifying count and single-elimination bracket. Exact format OPEN. Bracket entries can reference a seed or an upstream winner. Seeding uses a frozen approved standings version. A correction after downstream play creates a commissioner review task; it must not silently replace teams in a game already played.

**SCH-12 — Forfeits and cancellations.** Distinguish an administrative win, played result, abandoned game, and cancelled game. Forfeit win/loss treatment and any assigned score must be explicit in the ruleset. No invented individual points or appearances from an administrative forfeit.

**Future foundation:** Generator interface accepts typed competition, resource, and constraint inputs. Later a dedicated solver can replace the placement algorithm without changing schedules, games, or public URLs.

## 12. Basketball game operations and durable live tracking

### 12.1 Rules and preparation

**GAM-01 — Configurable ruleset.** Court players per team, minimum players, period count/type, regulation duration, overtime duration, clock behavior, foul-out threshold, team-foul reset/bonus rules, and stat visibility. Proposed starting preset mirrors the relevant Faraj behavior, but school rules require D-04. Store the ruleset version on every game.

**GAM-02 — Game roster snapshot.** Before tip-off, create the game's eligible participant/team list from current roster memberships. Store team_id at game time. Changes to future rosters do not alter past game membership, scores, or statistics. Jersey numbers and public names can have game snapshots where required.

**GAM-03 — Staff assignment.** Assign one primary scorer per game and allow authorized commissioner takeover. Captain viewing does not grant write access. A scorekeeper can operate only assigned games/scopes.

**GAM-04 — Player presence.** Pregame roster availability and on-court lineup are separate. Select starters, mark absent players, then start the game. Merely selecting a lineup while the game is still scheduled does not count as participation.

### 12.2 Event and clock model

**GAM-05 — Canonical event log.** Store accepted scoring, foul, lineup, substitution, clock, period, pause/resume, correction, and finalization events durably. The browser computes immediate feedback; server validation and the persisted log determine accepted state.

**GAM-06 — Event fields.** Each event carries organization_id, season_id, game_id, event_id, client_command_id, server_sequence, event_type, schema_version, actor_user_id, scorer_session_id, fencing_token, period, effective elapsed_play_seconds, client_occurred_at, server_received_at, and a validated typed payload. Corrections reference the affected event/revision. Do not include private registration answers in payloads.

**GAM-07 — Consistency.** Lock the game revision during each submitted batch. Validate the scorer's authority and expected revision; insert commands once; append sequences; recompute or incrementally update projections; audit and enqueue public invalidation in one database transaction. A uniqueness key on game_id/client_command_id prevents retry duplication.

**GAM-08 — Clock.** Store period, remaining clock at an anchor, whether running, anchor timestamp, and cumulative elapsed playing time. Public clients interpolate display without writing every second. The authoritative scorer records starts/stops/corrections. A suspended laptop or large clock drift prompts reconciliation; silently inferring hours of playing time is unacceptable.

**GAM-09 — Minutes, CONFIRMED.** Derive time from on-court stints and actual elapsed playing time, including a player's currently open stint at save/finalization. Store seconds played as a nonnegative integer per game/participant. Display minutes and seconds or decimal minutes from that value; display rounding never changes participation.

**GAM-10 — Appearance.** Automatically set participated when a player enters a live game or has a valid credited in-game action. Keep this explicit derived fact alongside seconds played. This covers brief/dead-ball appearances with zero recorded seconds. A player who never enters is DNP. Authorized corrections require a reason.

**GAM-11 — Event correction.** Undo/revise creates a recorded correction with its own sequence. The reducer applies the corrected effective timeline without deleting the original event. Clock corrections adjust the affected stints consistently. Rebuild from the log must produce the same points, seconds, appearances, lineups, and period state as the current projection.

**GAM-12 — Rules validation.** A player cannot be both on court and benched, appear twice in one lineup, or belong to both teams in a game. A substitution removes an on-court player and adds an eligible bench player. A foul-out warning follows the configured rules; commissioner exceptions are explicit.

### 12.3 Saving, connectivity, and scorer ownership

**GAM-13 — Local durability.** Persist pending commands in IndexedDB immediately with game/account/organization scope. Show “saved,” “syncing,” “offline with N pending actions,” or “needs reconciliation.” Local storage is a recovery aid, never the only retained record.

**GAM-14 — Online sync.** Submit event batches promptly, proposed maximum one-second debounce for scoring/substitution actions and a five-second recovery checkpoint while the clock runs. Acknowledged data is visible from another authorized device. Retries use the same command IDs.

**GAM-15 — Short outages.** The original scorer can continue locally during a brief network interruption with a visible warning. On reconnect, reconcile authority and last acknowledged sequence before accepting the queue.

**GAM-16 — Ownership and takeover.** Use a scorer session lease/fencing token. Reconnection after lease expiry can renew ownership only if there has been no takeover or conflicting revision. If another scorer took over, quarantine the stale queue for commissioner reconciliation; never merge it silently or overwrite newer game data.

**GAM-17 — Recovery on another device.** Load acknowledged event log, projection, and checkpoint. Make possible unsynced changes from the previous device explicit. No promise is made to recover browser-only changes from a destroyed device.

**GAM-18 — Game states.** scheduled → live ↔ intermission/suspended → awaiting_final → final. Administrative alternatives include cancelled and forfeited. Postponement belongs to scheduling. Each transition has permission/validation rules; corrected finals produce a new result version.

### 12.4 Review and finalization

**GAM-19 — End-game review.** Show points by player/team, participation, seconds, DNPs, score discrepancies, unresolved events, and pending sync. Complete open stints. Require every participant to have a resolved appearance/DNP status before official finalization.

**GAM-20 — Score reconciliation.** Separate recorded player points, any explicitly unassigned team points, and the official result. Normal finalization requires reconciliation. An authorized override for a paper-score correction must state the reason and identify unassigned points; do not fabricate player points to force a match.

**GAM-21 — Finalization transaction.** Confirm no unresolved command queue/conflict, validate the roster and ruleset, freeze a result revision, calculate official game/season projections, audit, and publish notifications/cache invalidation together. Proposed default: scorekeeper submits and commissioner finalizes; delegated finalization can be enabled.

**GAM-22 — Later correction.** Commissioner reopens/corrects with a reason; preserve previous result versions and notify affected users when material. Recompute affected standings and leaders. Downstream playoff consequences require explicit resolution.

**GAM-23 — Fallback entry.** Commissioner may enter a final box score from a paper record. Participation must be supplied; time may be unknown, represented as null rather than invented zero. Mark provenance “manual box score.” Unknown minutes still permit a known appearance and valid GP.

**Future:** Additional basketball events and sport engines implement a versioned interface for validation, projection, stat definitions, and finalization. Avoid a single universal sports-event schema with hundreds of nullable columns.

## 13. Statistics, standings, awards, and history

**STA-01 — Official statistics.** Games played counts participated=true in qualifying finalized games. DNP does not count. Zero-point appearances do count. Live figures are labeled provisional and excluded from official season aggregates until finalization.

**STA-02 — Formulas.** Season points = sum of credited points in qualifying finalized games. PPG = season points / games played. GP=0 displays “—”; GP>0 and zero points displays 0.0. Calculate at full precision and round only for display. Store source counts, not only a rounded average.

**STA-03 — Minutes.** Sum known seconds and flag any unknown-time games. Do not display a complete season minutes total as authoritative when manual records contain unknown time. Minutes do not determine whether a player who entered briefly receives an appearance.

**STA-04 — Competition scope.** Regular-season and playoff statistics have separate filters/defaults. Proposed default: regular-season leaders, explicit playoff/all-games views. The organization configures ranking eligibility such as minimum appearances; no Faraj-specific attendance threshold is hard-coded.

**STA-05 — Player visibility.** Show confirmed, published participants even when they have zero points; represent no games versus zero-scoring games correctly. Whether never-played players appear on a leader table is a configurable display choice, with roster access always available.

**STA-06 — Historical team attribution.** Attribute a game's contribution to the saved team-at-game-time. Show transfer history if applicable. Future roster changes and new seasons cannot remove or reassign historical contributions.

**STA-07 — Standings.** W/L, games played, points for/against, differential, and optional win percentage. Tiebreak sequence is versioned and visible with the rules. Proposed supported initial rules: wins or win percentage, head-to-head where applicable, point differential, then points for; unresolved ties remain tied or require an explicit seeding decision.

**STA-08 — Multiway ties.** Specify whether head-to-head uses only the tied teams and whether the sequence restarts after breaking part of a tie. Until configured, do not invent an arbitrary sporting tie-breaker. Alphabetical sorting can provide stable display without claiming higher competitive rank.

**STA-09 — Awards, conditional launch.** Configurable award definitions with weekly/season scope, recipient type (person/team), label, description, optional image, and publication state. Pilot may use manual awards if desired. Voting, nominations, and automatic awards are later. An award's snapshot remains attributable even if a player changes teams.

**STA-10 — Power rankings.** Editorial rankings, if enabled, are separate from computed standings and explicitly labeled. They do not determine playoff seeds unless the competition rules specifically permit that.

**STA-11 — Archives.** Completed seasons remain browsable with season-specific teams, names/logos where snapshotted, results, rules, and awards. Archive is read-only by default; authorized corrections create a revision. Duplication of a season copies chosen structure, not old registrations, payments, game results, or consent records.

## 14. Public website and interface requirements

**WEB-01 — Routes.** Proposed initial public URL: /o/{organizationSlug}/l/{leagueSlug}/s/{seasonSlug}. A current-season shortcut redirects consistently. Admin routes include an organization scope; public and private URLs do not share cached responses. Custom domain mapping is a later domain-alias feature.

**WEB-02 — Homepage.** League name/identity, active season, registration action when open, next scheduled games, latest results, key announcement, standings preview, and optional scoring/awards blocks. A visitor should identify the next game from the first relevant screen without signing in.

**WEB-03 — Navigation.** Home, Schedule, Teams, Standings, Stats, Rules/About. Open Gym, Awards, Media, and Sponsors appear only when enabled and populated. Preserve consistent labels and mobile navigation across themes.

**WEB-04 — Schedule.** Filter by date/week/team, show venue/court/timezone, clearly label postponed/cancelled/final/live states, and link to game detail. Calendar subscription and shareable filtered links are proposed launch conveniences.

**WEB-05 — Team pages.** Captain, approved roster names/numbers, upcoming games, results, and team record. No private registration answers or player email/phone. Team colors/logos are validated assets.

**WEB-06 — Game page.** Teams, time/location, state, score, public box score, appearances, and minutes where configured. Provisional live values are visibly distinct from final results. Public draft board is off by default; authorized captain viewing is separate.

**WEB-07 — Registration pages.** Eligibility, price, waitlist/refund conditions, form, payment handoff, receipt/status, and recovery after interrupted checkout. A returning applicant can access their status through a verified account.

**WEB-08 — Information pages.** League overview, rules, open-gym details, contact route, announcements, and approved policy text. Rich text is sanitized; no arbitrary scripts or hidden embeds.

**WEB-09 — Mobile/accessibility targets.** Responsive at 360 CSS pixels without horizontal page scrolling except intentionally scrollable tables. Keyboard-operable controls; visible focus; labeled forms; meaningful error messages; sufficient contrast; reduced-motion support; accessible alternatives to dragging. Target WCAG 2.2 AA as a design/testing goal, not an unverified compliance claim.

**WEB-10 — Data presentation.** Loading, empty, error, stale/offline, and permission-denied states are designed explicitly. Public pages never flash a private response before access checks complete. Game updates do not close an open dialog or reset a user's scroll/filter unexpectedly.

**WEB-11 — Assets.** Proposed image limits: 5 MB uploaded file, server-enforced type/size checks, resize to suitable variants, remove unnecessary metadata, descriptive alternative text. Separate public-approved assets from private uploads. Video uploads are later; allow approved external links where needed.

**WEB-12 — Discoverability.** School pages are shareable without login as requested. Search-engine indexing is a separate setting; proposed school default is noindex until the school chooses otherwise. Noindex is not access control. Public-name format/publication authority is resolved under D-06.

## 15. Communications and administration

**COM-01 — Required notifications.** Application/payment acknowledgment, needs-information request, approval/rejection, confirmed place/waitlist, waitlist promotion, team assignment publication, published schedule changes, announcements, and refund status.

**COM-02 — Channels.** Proposed launch channel: email plus the account status page. SMS, push notifications, team chat, and marketing campaigns are later and require their own preferences/cost controls.

**COM-03 — Delivery.** Store notification intent in the same transaction as the triggering action. Worker uses a deduplication key per recipient/template/entity-version. Provider response records accepted/delivered/bounced/failed status; acceptance is not proof of inbox delivery. Retry transient failures with backoff and flag persistent failures. [Resend webhooks](https://resend.com/docs/webhooks/introduction).

**COM-04 — Recipient privacy.** Send individually or using an appropriate privacy-preserving delivery method; never expose the registration list in a CC field. Templates expose only information the recipient may access.

**COM-05 — Preferences.** Separate operational notices from optional announcements/marketing. Preference changes cannot silently prevent the account page from showing essential payment or placement status. Define allowed suppression behavior explicitly.

**ADM-01 — Commissioner dashboard.** Setup checklist; registration/verification queues; paid/waitlisted counts; unresolved payments/refunds; roster completeness; draft readiness; schedule draft/publish state; assigned upcoming games; games awaiting finalization; notification failures.

**ADM-02 — Bulk operations.** Filter and select registrations for approval, roster assignment, messages, or refund requests. Preview changes and exceptions. Financial execution requires finance permission. Batch failures are per-item and retryable without redoing successful items.

**ADM-03 — Staff access.** Invite/revoke named users; assign role and scope; show last meaningful access/action; revoke active drafting/scoring authority on removal. Membership changes affect API and realtime access, not just the navigation.

**ADM-04 — Data export.** Commissioner can export authorized league records; finance permission is required for payment details. CSV exports neutralize spreadsheet formula injection. Export jobs are tenant-scoped, logged, and available through expiring authorized download links.

**ADM-05 — Import.** CSV player/roster import uses a preview, field mapping, duplicate report, validation, and idempotent batch ID. It cannot silently mark an unpaid record paid or invent eligibility evidence.

**ADM-06 — Support access.** Platform support has no default permission to browse private school records. Use explicit scoped support access with purpose, expiry, and audit. Platform finance handles merchant operations without granting unrestricted school administration.

## 16. Data model and field-level contract

**Status:** Proposed relational design. Names may change in implementation while the stated ownership, separation, and invariants remain. This is a schema contract, not executable migration SQL.

### 16.1 Universal conventions

- UUID primary keys generated server-side; UTC timestamptz for instants; IANA timezone on season/venue.
- Organization-owned tables include organization_id, created_at, updated_at where mutable, and created_by/updated_by where meaningful.
- Referenced parents expose a unique (organization_id, id) pair; child composite foreign keys preserve tenant identity. Season-scoped parents additionally validate season ownership.
- Money uses integer minor units plus a currency code. Percentages/ratios use explicit numeric precision; no floating-point money.
- Mutable command targets carry a revision integer. Immutable logs carry sequence and received timestamp.
- Public slugs have scoped uniqueness; stable IDs survive renaming. Store old-slug redirects when required.
- No blanket cascade delete across registrations, payments, published game history, or audit records. Use restrict/archive and explicit erasure workflows.
- JSON payloads have a schema_version, size limit, and server-side validation. Searchable relationships remain columns.

### 16.2 Organizations and people

| Table | Important fields | Constraints / notes |
|---|---|---|
| organizations | id, slug, name, timezone, status, public_settings_version_id | Unique slug; status active/suspended/archived |
| leagues | id, organization_id, slug, name, sport_code, visibility | Unique org/slug; explicit sport module |
| seasons | id, organization_id, league_id, slug, label, state, starts_at, ends_at, registration_open_at, registration_close_at, current_config_version_id | Unique league/slug; invalid date ranges rejected |
| season_config_versions | id, season_id, version, status, schema_version, rules_json, registration_policy_json, standings_policy_json, published_at | Immutable after activation; bounded schemas |
| people | id, organization_id, display_name, status | Durable person identity within organization; public projection is separate |
| person_private | person_id, organization_id, legal_name, contact_email, contact_phone_optional, school_reference_optional | Strictly private; avoid unnecessary fields |
| person_account_links | organization_id, person_id, auth_user_id, relationship, verified_at | Explicit own/delegated relationship; future guardian link |
| organization_memberships | id, organization_id, auth_user_id, status | Unique org/user; invitation then active/revoked |
| role_assignments | membership_id, organization_id, role_key, scope_type, league_id?, season_id?, team_id?, game_id? | Allowed scope shape validated; one canonical scope per row |
| verification_decisions | id, organization_id, registration_id, method, status, reviewer_id?, claim_json, source_reference?, decided_at, expires_at?, private_reason? | Append decision history; current result projected |
| domain_aliases | id, organization_id, hostname, verification_status, verified_at | LATER table/migration when custom domains launch; routing interface exists now |

### 16.3 Registration and payments

| Table | Important fields | Constraints / notes |
|---|---|---|
| registration_forms | id, organization_id, season_id, version, field_schema, published_at | Versions immutable after applications |
| registrations | id, organization_id, season_id, division_id?, person_id, form_version_id, policy_version_id, application_state, verification_state, admission_state, priority_at?, submitted_at?, revision | Unique active person/competition scope; financial state projected |
| registration_private_answers | registration_id, organization_id, answers_json | Private; grade stored here or in a typed eligibility claim |
| policy_acceptances | id, organization_id, registration_id, policy_type, policy_version, accepted_by, accepted_at | Preserve text/hash reference and actual actor; no invented consent |
| capacity_pools | id, organization_id, season_id, division_id?, playing_limit, waitlist_limit?, revision | Allocation transaction locks pool; limit nullable only by policy |
| capacity_allocations | id, organization_id, pool_id, registration_id, allocation_type, priority_at, allocated_at, released_at? | One active allocation per registration/pool |
| orders | id, organization_id, registration_id, merchant_config_id, amount_minor, currency, pricing_snapshot, status | Amount and recipient immutable once charged |
| payment_attempts | id, organization_id, order_id, provider, provider_account_id, checkout_session_id?, payment_intent_id?, idempotency_key, amount_minor, status, paid_at? | Unique provider/account/object IDs; multiple attempts supported |
| payment_entries | id, organization_id, order_id, provider_object_id, entry_type, amount_minor, currency, occurred_at | Append-only collection/refund/fee/adjustment facts; reconcile rather than overwrite |
| refund_requests | id, organization_id, payment_attempt_id, amount_minor, reason, requested_by, idempotency_key, state, provider_refund_id?, resolved_at? | Lock/validate refundable balance including pending requests |
| payment_disputes | id, organization_id, payment_attempt_id, provider_dispute_id, amount_minor, state, due_at? | Unique provider dispute; restricted finance access |
| provider_event_inbox | provider, provider_account_id, event_id, received_at, processing_state, attempts, object_reference, encrypted_or_redacted_payload? | Unique provider/account/event; bounded sensitive retention |
| merchant_configs | id, organization_id_or_platform_scope, provider_account_reference, mode, status, beneficiary_reference | Secret keys remain in secret manager, not rows; commercial mode OPEN |

### 16.4 Competition and drafting

| Table | Important fields | Constraints / notes |
|---|---|---|
| competition_groups | id, organization_id, season_id, parent_id?, kind, name, sort_order | No cycles; division/conference labels configurable |
| competition_stages | id, organization_id, season_id, kind, name, rules_version_id, state | regular/playoff/custom supported kinds |
| teams | id, organization_id, league_id, stable_name_optional | Optional continuity identity across seasons |
| season_teams | id, organization_id, season_id, team_id?, group_id?, name, colors, logo_asset_id?, roster_min, roster_max | Actual roster/game references use season team |
| roster_memberships | id, organization_id, season_id, season_team_id, person_id, registration_id?, jersey_number?, valid_from, valid_to?, reason? | At most one active team per person in pilot competition; historical intervals retained |
| captain_assignments | id, organization_id, season_team_id, person_id, membership_id?, active_from, active_to? | Pilot one active captain/team; person must be rostered |
| draft_sessions | id, organization_id, season_id, state, order_snapshot, rules_snapshot, cursor, host_user_id?, lease_expires_at?, fencing_token, revision | One active draft per configured competition |
| draft_actions | id, organization_id, draft_session_id, sequence, command_id, action_type, team_id?, person_id?, reverses_action_id?, actor_id, payload, created_at | Unique session/sequence and session/command; immutable |
| draft_current_picks | draft_session_id, organization_id, person_id, season_team_id, action_id | Transactional projection; unique active pick/person |
| scouting_sessions | id, organization_id, season_id, title, starts_at, ends_at, venue_id?, public_description, state | Informational event; does not create GP |

### 16.5 Scheduling and games

| Table | Important fields | Constraints / notes |
|---|---|---|
| venues | id, organization_id, name, address_public, timezone | No private contact data in public DTO |
| courts | id, organization_id, venue_id, name, enabled | Venue ownership enforced |
| availability_windows | id, organization_id, court_id, local_day_or_date, local_start, local_end, timezone, recurrence_end? | Materialize real UTC slots for generator |
| blackout_windows | id, organization_id, scope_type, resource_reference, starts_at, ends_at, reason | Typed scope; validated boundaries |
| schedule_versions | id, organization_id, season_id, number, status, generator_version, inputs_snapshot, validation_report, published_at | One current published version; prior versions retained |
| schedule_entries | id, organization_id, schedule_version_id, game_id, starts_at?, ends_at?, court_id?, locked, status | Draft/published placement per version |
| games | id, organization_id, season_id, stage_id, home_season_team_id?, away_season_team_id?, rules_version_id, state, revision, official_result_version_id? | Teams differ; TBD bracket entries resolved before live state |
| game_assignments | game_id, organization_id, user_id, duty, active | Unique assignment scope; revoke on staff removal |
| game_participants | id, organization_id, game_id, person_id, season_team_id, roster_membership_id?, jersey_snapshot, display_name_snapshot, eligibility_snapshot | Unique game/person; immutable team-at-game-time after final |
| scorer_sessions | id, organization_id, game_id, user_id, state, fencing_token, lease_expires_at, last_acked_sequence | Unique active authority/game; takeover increments token |
| game_events | id, organization_id, game_id, sequence, command_id, scorer_session_id, actor_id, type, schema_version, period, elapsed_play_seconds, payload, received_at, supersedes_event_id? | Unique game/sequence and game/command; append-only |
| game_state_projections | game_id, organization_id, revision, last_event_sequence, clock_anchor_json, lineup_json, score_json, reducer_version | Rebuildable from log; private write path |
| game_player_totals | organization_id, game_id, game_participant_id, result_version, participated, seconds_played?, points, fouls, provenance | Separate live/final projection scope; nonnegative values |
| game_result_versions | id, organization_id, game_id, version, state, home_score, away_score, unassigned_points_json, outcome, finalized_by, finalized_at, reason? | Frozen official result; corrections append a version |
| bracket_entries | id, organization_id, stage_id, game_id, side, source_kind, source_reference, resolved_team_id? | Seed/winner source; no cyclic dependencies |
| season_stat_projections | organization_id, season_id, stage_scope, person_id, gp, points, known_seconds, unknown_time_games, source_revision | Rebuildable; unique grouping scope |
| standings_projections | organization_id, season_id, stage_id, group_scope, season_team_id, wins, losses, pf, pa, source_revision | Rebuildable; rank follows versioned policy |

### 16.6 Publishing and operations

| Table | Important fields | Constraints / notes |
|---|---|---|
| theme_versions | id, organization_id, version, validated_tokens, state | Published version referenced by public site |
| content_pages / page_blocks | organization_id, league_id, season_id?, slug/type, sanitized_content, ordering, version, published_at | Explicit visibility and publication |
| assets | id, organization_id, storage_key, mime, bytes, visibility, checksum, alt_text | Private paths never made public through filename guessing |
| award_definitions / award_grants | organization_id, season_id, definition, recipient_type/id, scope, snapshot, state | Optional module with explicit publication |
| announcements | id, organization_id, season_id?, audience, body, published_at, revision | Publication separate from notification dispatch |
| notification_outbox | id, organization_id, event_type, entity_reference, version, payload_reference, available_at, state, attempts | Durable job intent and unique dedupe key |
| notification_deliveries | id, organization_id, outbox_id, recipient_reference, template_version, provider_id?, state, last_error_redacted | Unique message/recipient/version |
| audit_events | id, organization_id, actor_id, action, entity_type/id, before_redacted, after_redacted, reason, request_id, occurred_at | Append-only; sensitive fields redacted |
| support_access_grants | id, organization_id, platform_user_id, scope, reason, expires_at, approved_by | Explicit temporary access |
| import_batches / export_jobs | organization_id, actor_id, kind, state, report, asset_reference?, expires_at? | Tenant-scoped and auditable |

Build tables only when their launch module is implemented. Listed future-only tables do not justify unused services. All table/API migration work must preserve the ownership and historical boundaries above.

### 16.7 Indexes and integrity

- Tenant-first indexes for organization/status/date lists; season/game indexes for schedules and statistics.
- Game event index (organization_id, game_id, sequence); unique command keys.
- Partial indexes for active memberships, current allocations, unresolved payments/refunds, and ready outbox jobs.
- Unique active roster membership within a competition; explicit historical membership intervals.
- Draft/team roster-limit checks run inside the locked transaction; a client count alone is insufficient.
- Court/team schedule conflict detection uses transactional validation and suitable range/exclusion constraints or a normalized resource-allocation table. Cross-row capacity cannot be enforced by a simple row CHECK.
- Use keyset pagination for long lists and bounded query limits; avoid public endpoints returning every row in a tenant.
- Every read projection has a source revision/reducer version to support deterministic rebuilding.

PostgreSQL constraints and row locks provide implementation mechanisms for these proposed invariants. [Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html), [locking](https://www.postgresql.org/docs/current/explicit-locking.html).

## 17. API and transaction contracts

**API-01 — Route convention.** Version business endpoints under /api/v1. Public endpoints resolve the organization/league/season from a validated route. Private commands independently validate account membership and resource ownership.

**API-02 — Write envelope.** Commands include commandId and expectedRevision where applicable. Server responses include the committed revision, result, and requestId. Return 409 for stale versions/conflicting ownership, 422 for rule violations, 401/403 for access failures, and 429 for rate limits. Error text contains an actionable explanation without exposing another organization's identifiers.

**API-03 — Idempotency.** Critical commands return the original committed result when retried with the same command ID. A reused ID with different input is rejected. Bound retention/cleanup while preserving financial and event uniqueness.

**API-04 — Permission checks.** Normal application reads use the caller's authenticated database context. Database mutation functions are the sole write path for protected workflows. Where elevated functions are necessary, fix the search path, fully qualify tables, revoke default public execution, check auth.uid and scoped permissions inside the function, validate all tenant/resource relationships, and allow only the named command. Service credentials remain server-only and limited to reviewed system jobs.

| Endpoint / command | Actor | Required behavior |
|---|---|---|
| GET public season/team/schedule/game | Anyone if published | Public DTO only; bounded response; revision/cache headers |
| POST registration drafts | Applicant | Create/link person and versioned application; duplicate checks |
| POST registrations/{id}/checkout | Own applicant or permitted assistant | Server-priced order/session; disclosed waitlist policy |
| GET registrations/{id} | Own linked user or authorized staff | Private states and allowed next actions |
| POST registrations/{id}/verification | Commissioner | Append decision; transactional capacity reconciliation |
| POST registrations/{id}/promote | Commissioner | Capacity/payment/eligibility check; audit |
| POST refunds | Finance-permitted actor | Reserve refundable amount; idempotent provider workflow |
| POST webhooks/stripe | Verified provider signature | Persist inbox, dedupe, acknowledge, process/retry |
| POST draft/{id}/claim-host | Commissioner/delegate | Lease/token issuance, takeover history |
| POST draft/{id}/picks | Active host | Atomic pick + roster + cursor update |
| POST draft/{id}/reverse-pick | Active authorized host | Append correction; impact validation |
| POST seasons/{id}/schedule/generate | Commissioner | Draft version, constraints report, no automatic publication |
| POST schedules/{id}/publish | Commissioner | Validate, commit version, enqueue targeted messages |
| POST games/{id}/claim-scorer | Assigned scorer/commissioner | Lease/fencing and current state |
| POST games/{id}/events | Active scorer | Idempotent batch + revision + projection transaction |
| POST games/{id}/submit | Scorer | Resolve pending sync; review state |
| POST games/{id}/finalize | Authorized finalizer | Validate/reconcile, append final result, update projections |
| POST games/{id}/corrections | Commissioner | New revision and audit; downstream impact review |
| POST announcements/{id}/publish | Commissioner | Audience resolution and deduplicated notifications |
| POST seasons/{id}/archive | Commissioner | Completion checks and historical publication |

External provider calls cannot participate in a database transaction. Use a durable request state plus reconciliation instead of assuming a database rollback can undo a successful external charge or refund.

## 18. Security, privacy, and school data

**SEC-01 — Default-private storage.** Base registration, contact, eligibility, payment, and staff tables deny anonymous access. Public pages receive deliberately constructed public DTOs/projections. No private field is made safe merely by hiding it in the frontend.

**SEC-02 — Tenant isolation.** Database RLS, grants, and restricted command functions enforce scope. Test organization A against organization B's IDs across reads, writes, exports, assets, jobs, and realtime subscriptions. Cross-tenant foreign keys are impossible by schema.

**SEC-03 — Public projections.** Published data contains only approved names, team/season identity, games, allowed stats, and public content. Use explicit column lists. A database view needs deliberate security treatment; do not assume views automatically inherit intended RLS behavior. [Supabase authorization guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

**SEC-04 — Private channels.** Staff draft/scoring subscriptions are permissioned by organization and resource. Recheck/revoke on membership or host changes. Public viewers poll a sanitized projection rather than subscribe to private mutation payloads. [Supabase realtime authorization](https://supabase.com/docs/guides/realtime/authorization).

**SEC-05 — Secrets.** Keep database service credentials, provider secrets, webhook signing secrets, and email credentials in deployment secret managers. Separate test/staging/production values. Client-visible publishable keys are paired with restrictive policies; they are not admin credentials.

**SEC-06 — Input and content.** Validate length, type, range, enum, ownership, and allowed state transition on the server. Parameterize queries. Sanitize rich text; use a restrictive content security policy; prevent cross-site request forgery for session-backed writes. Validate external URLs and uploaded content.

**SEC-07 — Abuse controls.** Rate-limit authentication, registration, checkout creation, exports, public polling, and write commands using a shared durable control, not process memory alone. Add a bot challenge only where abuse warrants it. Key throttles by appropriate account/IP/organization combinations with privacy-conscious retention.

**SEC-08 — Audit and monitoring.** Record actor, scope, entity, action, revision, reason, and request ID. Redact secrets, unnecessary contact data, and private answers from application logs and monitoring. Restrict access to financial/eligibility audit details.

**SEC-09 — School decisions.** Before public launch, school and business approve the public-name format, permitted data fields, participant/guardian process where needed, retention policy, support contacts, and responsibilities. This document does not assert compliance with a particular legal regime; those decisions require the applicable school/business review.

**SEC-10 — Retention proposal.** Keep public season history while authorized. Proposed operational logs: 30 days; redacted job/provider diagnostics: 90 days. Private registration details and financial record retention remain policy decisions; no destructive purge is enabled until rules are approved. Deletion must address public projections, search indexing where controllable, exports, object storage, and backup expiry behavior.

**SEC-11 — Recovery and account changes.** Account email changes require re-verification. Removing an account does not cascade-delete game or payment history. Separate account unlinking, public anonymization, private-record erasure, and required financial retention.

**SEC-12 — Environments.** Synthetic data in development/staging by default. Production records never enter preview deployments casually. Preview search indexing is disabled and private environments are access-controlled.

**SEC-13 — Dependencies.** Lock dependencies; scan changes for known vulnerabilities and leaked secrets in CI; review automated dependency updates. Document patching ownership. Shared infrastructure does not make school admins platform admins.

## 19. Performance, scale, and measurable targets

All numbers below are PROPOSED engineering targets, not a claim of measured capacity or a contractual SLA.

| Measure | Pilot target | Early broader-product validation target |
|---|---|---|
| Organizations | School + isolated synthetic test tenant | 100 organizations |
| Participants | 24–28 confirmed; test 100 applications including waitlist | 25,000 participant-season records |
| Concurrent public viewers | 100 | 5,000 across leagues |
| Simultaneous scored games | Test two | Test 20 |
| Public page usability | LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 on representative mobile conditions | Same goal under representative load |
| Ordinary admin command | p95 ≤1s excluding external checkout/email completion | p95 ≤1s at validated workload |
| Online event acknowledgment | p95 ≤2s on stable client connection | Same target with batch tuning |
| Public live update freshness | Within 10s of server acceptance under normal conditions | Same target with scalable fan-out/cache |
| Private draft-view update | Within 2s of commit under stable connections | Measured per active room |
| Four-team schedule generation | Within 2s for supported feasible inputs | Larger jobs asynchronous and explicitly bounded |
| Availability objective | 99.5% monthly internal target during pilot | Reassess before commercial SLA commitments |

**PER-01 — Cached reads.** Public home/schedule/standings use tenant-and-season-specific cache keys. Private responses are no-store. Invalidate on approved publication/finalization. Never cache a response containing session-specific data under a public key.

**PER-02 — Live public reads.** Proposed initial polling interval five seconds, response cache no more than a few seconds, ETag/revision support, backoff for background tabs, and stop polling completed games. Cache key includes game and projection version where appropriate. Public latency target includes polling delay.

**PER-03 — Write scaling.** Keep requests stateless; batch scorer events; pool connections; index hot paths; use bounded workers. Do not broadcast an entire season's data on every basket.

**PER-04 — Growth triggers.** Investigate when database CPU/connections, lock wait, event latency, notification backlog, or provider usage exceed budgets. First improve queries/batching/cache and capacity; later consider dedicated worker processes, separate public read storage, replicas, or a scheduling service.

**PER-05 — Multi-sport growth.** Reuse organization, accounts, registration, payments, venues, publishing, and communications. Add a sport module with its own rules/events/stat reducers. Team-based competition is the present structural assumption; individual racing or judged events require a separately designed competition model.

**PER-06 — Cost visibility.** Track storage, realtime messages, database load, API traffic, email volume, and live-game activity by organization. Rate limits and entitlements prevent one large customer from exhausting shared resources.

## 20. Backups, recovery, and operating costs

**OPS-01 — Proposed production backup posture.** Use paid managed database backups with point-in-time recovery before storing live payments and authoritative season records. Proposed database recovery-point objective: ≤15 minutes; recovery-time objective: ≤4 hours, subject to an actual restore drill. These are internal targets pending infrastructure confirmation.

**OPS-02 — Independent copies.** Maintain encrypted daily logical exports in a separately controlled backup location, with a documented 30-day rotation proposal. Provider project deletion or account loss must not eliminate every recovery path.

**OPS-03 — File backups.** Back up uploaded assets separately with a manifest/checksum and proposed ≤24-hour recovery point. Database backups cover object metadata, not the stored files themselves. Exact retention follows the approved privacy policy.

**OPS-04 — Restore testing.** Restore into an isolated environment before launch and quarterly thereafter; verify registrations, payment references, event logs, game projections, policies, and assets. A backup is not validated merely because a job says “completed.”

**OPS-05 — Disaster procedure.** Freeze affected writes, preserve logs, restore to a selected point, reconcile provider payments/refunds that occurred after it, rebuild projections, reconcile any client pending queues, verify access controls, then reopen. Restoring a database does not undo real-world provider transactions.

Supabase documents daily paid-plan backups, a PITR add-on, and the exclusion of object-storage files from database backups. At review time its seven-day PITR add-on is approximately $100/month and requires suitable compute. Its documented example totals $130/month for one Pro/Small/PITR configuration after compute credit. These are source prices, not a quote for our full system. [Backup capabilities](https://supabase.com/docs/guides/platform/backups), [PITR usage example](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery).

**OPS-06 — Planning budget.** Reserve roughly $150–$250/month for an initial production configuration with PITR, commercial web hosting, modest mail/monitoring, and small usage. This is an illustrative planning allowance, not validated total cost. Staging compute, extra developer seats, domains, backups, larger usage, tax, payment fees, and labor can add to it. Reprice before purchase. [Supabase pricing](https://supabase.com/pricing), [Vercel Pro](https://vercel.com/docs/plans/pro-plan).

**OPS-07 — Cost decision.** If the budget cannot support the recovery target, explicitly choose and document a weaker recovery objective and alternative backups. Do not claim minute-level recovery while relying solely on daily snapshots.

**OPS-08 — Support.** Name an on-call owner for registration opening, the draft, and game windows. Define a school escalation contact, response expectations, and a manual continuity procedure. Client-provided Wi-Fi/staff does not remove our responsibility to explain saving errors clearly.

**OPS-09 — Alerts.** Alert on payment webhook failures, unresolved paid registrations, failed refunds, scorer sync/revision conflicts, long outbox backlog, backup failure, and elevated server errors. Notifications must avoid private student details.

## 21. Faraj reuse and migration plan

Source inspection used [Faraj League commit b00384e](https://github.com/mrsaiyed/faraj-league/tree/b00384eda873bc33052e5efdac62cb9d447d71c0). The deployed system/database were not audited or modified.

| Existing area | Evidence | Proposed treatment |
|---|---|---|
| Public league experience | Public navigation, teams, standings, awards, media | Reuse information architecture and selected visual patterns; make branding/content configurable |
| Hosted drafting | Draft timer/order, drag-and-drop player assignment | Port tested interaction logic; replace generic content-state persistence with draft transactions/history |
| Live tracker | Event reducer, lineups, substitutions, clock corrections, undo/redo | Adapt as basketball domain logic; persist events and time server-side |
| Minutes | Calculated from elapsed playing time; existing test explicitly excludes minutes from saved stat values | Add durable seconds/appearance projection and complete open stints at finalization |
| Game appearance | Manual Save infers appeared players and DNP | Carry behavior forward with final-result participation semantics and resilient persistence |
| Stats aggregation | Points/GP and public PPG display | Correct zero-point visibility and current-roster dependence; separate live/final and stage scopes |
| Authentication | Shared ADMIN_PASSWORD token identity | Replace with individual authenticated memberships and scoped permissions |
| Public database policies | Broad public SELECT on sports tables | Replace with explicit public projections; new private records never inherit these policies |
| Seasons | Existing season support | Preserve concept; place beneath organization/league and retain config versions |
| Registration / money | No complete signup/waitlist/payment workflow found in inspected implementation | Build dedicated modules as specified |

Sources: [draft controls](https://github.com/mrsaiyed/faraj-league/blob/b00384eda873bc33052e5efdac62cb9d447d71c0/admin/js/draft-timer.js), [tracker reducer](https://github.com/mrsaiyed/faraj-league/blob/b00384eda873bc33052e5efdac62cb9d447d71c0/lib/game-tracker.js), [minutes-save test](https://github.com/mrsaiyed/faraj-league/blob/b00384eda873bc33052e5efdac62cb9d447d71c0/tests/game-tracker.test.js#L455), [tracker save](https://github.com/mrsaiyed/faraj-league/blob/b00384eda873bc33052e5efdac62cb9d447d71c0/admin/js/live-tracker.js#L1038), [stat aggregation](https://github.com/mrsaiyed/faraj-league/blob/b00384eda873bc33052e5efdac62cb9d447d71c0/lib/stats.js), [admin auth](https://github.com/mrsaiyed/faraj-league/blob/b00384eda873bc33052e5efdac62cb9d447d71c0/supabase/functions/auth-login/index.ts).

**MIG-01 — Implementation strategy.** Build the platform in a separate repository/project with new environment credentials. Port reviewed modules and tests. Faraj remains the product reference until a separate migration is requested and planned.

**MIG-02 — Imported data.** Use a mapping table from source IDs to platform IDs; dry-run imports into staging, show counts/differences, and make reruns idempotent. Preserve game/team/season relationships.

**MIG-03 — Missing history.** Existing browser-only minutes/events may not be recoverable from the database. Import missing values as unknown with provenance. Never infer historical minutes from points or turn every zero into DNP.

**MIG-04 — Validation.** Compare source and imported season scores, team records, player totals, and counts. Resolve discrepancies explicitly. Any live-site migration requires its own freeze/cutover/rollback plan.

## 22. Development, deployment, and change management

**DEV-01 — Environments.** Local development, isolated staging, and production. Separate Supabase projects and provider modes. Staging uses synthetic students and payment test mode.

**DEV-02 — Database migrations.** Version-control schema, grants, policies, and command functions together. Test a fresh install and upgrade from the previous release. Use expand/backfill/contract changes where data exists. Do not make undocumented production schema edits.

**DEV-03 — CI checks.** Typecheck, lint, domain tests, database permission/integrity tests, key end-to-end flows, secret scanning, dependency review, and production build. Dependency lockfiles are committed.

**DEV-04 — Preview deployments.** Preview uses staging/test services, access protection, no live-payment keys, and no real school data. Environment variables are validated at startup.

**DEV-05 — Release.** Apply compatible database migration, deploy application, smoke-test registration and public reads, then enable the relevant capability for the school. Feature flags control rollout; they are not a substitute for permissions.

**DEV-06 — Rollback.** Application rollback must work with the expanded schema. Destructive data rollback is a recovery procedure, not an automatic deployment step. Retain event/payment reconciliation state across rollback.

**DEV-07 — Observability.** Request IDs connect UI errors, API requests, command IDs, outbox events, and provider references. Log structured redacted metadata. Expose staff-visible recovery actions for failed jobs.

**DEV-08 — Configuration rollout.** Ruleset, form, theme, notification template, and reducer versions are independently identifiable. Changing a package must not silently reinterpret all old events without a migration/rebuild plan.

## 23. Acceptance and verification plan

These are meaningful behavioral checks to implement with the product. They have not been executed against a completed platform.

| ID | Scenario | Required outcome |
|---|---|---|
| AT-01 | Visitor opens public school site on phone | Finds next games, teams, rules, and standings without login |
| AT-02 | Visitor requests registration/contact data directly | Access denied; public responses contain none of it |
| AT-03 | Student submits and pays before approval | Paid + pending approval shown; no false confirmed place |
| AT-04 | Student pays when playing capacity is full | Paid waitlist state and disclosed policy preserved |
| AT-05 | Two payments arrive for the last playing place | Capacity policy yields one place and the appropriate waitlist outcome |
| AT-06 | Same webhook/checkout command delivered repeatedly | One intended payment/application allocation; no duplicate message |
| AT-07 | Checkout success page is visited without payment success | Registration remains unpaid/processing |
| AT-08 | School rejects a paid application | Admission released; configured refund workflow applies; history retained |
| AT-09 | Paid waitlisted student is promoted | No additional charge; roster eligibility updated once |
| AT-10 | Refund API response is lost and request retried | One provider refund; pending state reconciles correctly |
| AT-11 | Two staff refund the same balance concurrently | Reserved/processed refunds never exceed collected amount |
| AT-12 | Captain attempts a draft pick | Rejected in one-host pilot mode |
| AT-13 | Host double-submits a pick | One pick and one roster membership |
| AT-14 | Host selects an already drafted player/full team | Clear rejection; no partial roster/cursor update |
| AT-15 | Host reloads or commissioner takes over | Durable board recovered; old host writes fenced out |
| AT-16 | Host undoes a pick | Availability, roster, cursor, and recorded history agree |
| AT-17 | Schedule constraints cannot be satisfied | Explain conflict/shortfall; no silently missing games |
| AT-18 | Commissioner publishes a schedule revision | Public pages update; only affected recipients notified once |
| AT-19 | Time crosses a daylight-saving change | Stored/visible times match configured local intent |
| AT-20 | Player plays 15 seconds and scores zero | Appearance counted; 15 seconds saved; zero points shown |
| AT-21 | Player is rostered but never enters | DNP; no GP increase |
| AT-22 | Starting lineup chosen but game never starts | No official appearance/statistics |
| AT-23 | Starter is never substituted | Full open stint included at finalization |
| AT-24 | Player has several stints and clock is corrected | Event replay produces correct total seconds and points |
| AT-25 | Scorer refreshes/changes device after acknowledgment | Acknowledged minutes/events restored from database |
| AT-26 | Brief Wi-Fi interruption and retry | Pending actions persist locally and are accepted once if authority unchanged |
| AT-27 | Another scorer takes over during outage | Old queue quarantined; no silent overwrite or duplicate scoring |
| AT-28 | Commissioner corrects a finalized basket/appearance | Result version, GP/PPG, standings, and audit history update consistently |
| AT-29 | Player transfers after a game | Historical game team/points/appearance remain unchanged |
| AT-30 | Recorded player points differ from official score | Finalization requires reconciliation or explicit documented override |
| AT-31 | Score change affects a bracket already underway | Commissioner impact review; no silent replacement of played teams |
| AT-32 | Season is duplicated/archived | Structure can copy; payments/results/consents do not; history remains intact |
| AT-33 | Organization A uses organization B's IDs or asset paths | Denied across API, database, realtime, jobs, and exports |
| AT-34 | Staff role is revoked during a session | Subsequent writes/subscriptions fail appropriately |
| AT-35 | Email provider times out | League action remains committed; message retries without duplicate delivery intent |
| AT-36 | Database restored to an earlier point | Payments reconciled externally; projections rebuilt; assets checked |
| AT-37 | Scorer uses keyboard/touch without dragging | Can select/substitute/score and operate draft alternatives |
| AT-38 | Synthetic pilot and growth load profiles run | Measured targets reported; bottlenecks and costs documented |

Use unit tests for reducers/formulas; database integration tests for tenant isolation, transaction locks, unique keys, and permissions; end-to-end tests for critical school journeys; payment sandbox tests for webhooks/refunds; manual usability sessions with commissioner and scorekeeper for event-day operation.

## 24. Delivery sequence and future roadmap

Calendar estimates remain OPEN because team size, engineering budget, and target dates are unknown. Deliver in dependency order with explicit exit criteria.

| Milestone | Deliverable | Exit criterion |
|---|---|---|
| M0 — Resolve launch policies | Payment merchant/fee/refund arrangements, registration priority, public fields, roles | Configuration values and policy text ready for the relevant release |
| M1 — Product foundation | Repository, environments, organization model, auth/roles, RLS, audit/outbox, public shell | Two tenants demonstrably isolated; commissioner can access own workspace |
| M2 — Paid registration | Form/account, manual verification, upfront checkout, allocations, paid waitlist, refunds, confirmations | AT-02 through AT-11 pass in payment test mode; live-payment business gate resolved |
| M3 — Teams and draft | Open gym, captains, one-host board, durable picks, limits, undo, publish assignments | Rehearsal with four teams completes and recovers from a host restart |
| M4 — Scheduling and public league | Generator/editor, publication, calendar/game pages, announcements | School commissioner creates and edits a valid season without developer changes |
| M5 — Live games and statistics | Adapted Faraj tracker, durable events/minutes, appearances, finalization, standings/PPG | Full mock game including outage, substitutions, zero-point appearance, correction |
| M6 — Pilot readiness | Training, backups/restore drill, monitoring, load check, support plan | Launch checklist signed off by product and school operators |
| M7 — Pilot learning | Observe registration/draft/game operations and collect support effort | Prioritized fixes and evidence for the next customer segment |

Registration can launch before all game-day features only if the delivery commitment and timing are agreed. Selling access to features that cannot be ready by the event is a product decision, not a technical shortcut.

### Expansion after the school

1. **More basketball leagues:** self-service onboarding, organization billing, multiple active leagues/seasons, additional themes, team signup, configurable refund/payment timing.
2. **Richer basketball operations:** additional box-score categories, captain-operated drafts, tournament formats, referee assignments, sponsor/award tools, advanced scheduling.
3. **Institutional capabilities:** roster verification adapters, school SSO, guardian workflows, deeper delegated roles, private leagues, enterprise reporting.
4. **Other sports:** validate a real second-sport customer and implement that sport's rules/events/scoring while retaining shared operations.
5. **Higher volume:** dedicated workers/solver/read scaling when measurements justify them.

Do not promise all of these in the school contract. The foundations in this specification make them evolutions of one product, with separate design and validation still required.

## 25. Decision register for discussion

| ID | Decision | Current recommendation / known fact | Needed by |
|---|---|---|---|
| D-01 | Waitlist refund trigger and amounts | Capability confirmed; staff-triggered refunds proposed; automatic cutoff unconfirmed | Published registration/payment policy |
| D-02 | Capacity and first-come priority | Exact cap 24–28 OPEN; successful-payment order with pending-review reservations proposed | Registration opening |
| D-03 | Captain slot and draft rules | Captain included in roster proposed; pick order/uneven distribution OPEN | Draft rehearsal |
| D-04 | Basketball rules and playoffs | Configurable; exact school settings OPEN | Schedule publication / mock game |
| D-05 | Who legally collects and retains funds | Company intends collection; merchant/service/revenue arrangement OPEN | Live payment activation |
| D-06 | Public names and school approval process | Public names requested; exact format/authority and school process OPEN | Public roster publication |
| D-07 | Exact price/currency/withdrawal/rejection/cancellation refunds | Approximately $50 proposed; all policy details OPEN | Registration opening |
| D-08 | Finalization and refund permissions | Commissioner finalizes; finance permission executes refunds proposed | Staff onboarding |
| D-09 | Launch dates and staffing/budget | Unknown; schedule dates admin-configured; engineering delivery dates still needed | Delivery commitment |
| D-10 | Production stack and operational spend | Next.js/TypeScript/Supabase/Stripe/Resend/Vercel proposed | Implementation kickoff / purchases |
| D-11 | Backup target and retention | PITR, independent exports, asset backups proposed; private/financial retention OPEN | Production data collection |
| D-12 | Branding breadth and domains | Curated blocks/tokens proposed; custom domains later | UI implementation |
| D-13 | Awards/media/sponsors at launch | Core public priorities confirmed; optional modules remain OPEN | Public-site scope freeze |
| D-14 | Account and payer/guardian experience | Verified email accounts; payer separate from participant proposed | Registration UX |
| D-15 | Broader-product pricing and next buyer segment | Shared platform direction; commercial packaging OPEN | General-market launch |
| D-16 | Game-time and public-stat presentation | Persist seconds/appearance confirmed; display format/minimum leader eligibility OPEN | Stats UI acceptance |

Unresolved decisions remain visible. They do not block writing the specification or implementing independent foundations. Each becomes a gate only when its dependent functionality would otherwise behave ambiguously.

## 26. Proposed school configuration example

This example communicates shape and ownership. Nulls intentionally represent unresolved choices. It is not production-ready configuration.

~~~json
{
  "schemaVersion": 1,
  "organization": {
    "type": "school",
    "name": null,
    "timezone": null
  },
  "league": {
    "sport": "basketball",
    "publicSiteEnabled": true,
    "searchIndexing": false
  },
  "season": {
    "label": null,
    "startsAt": null,
    "endsAt": null
  },
  "registration": {
    "mode": "individual",
    "allowedGrades": [9, 10, 11, 12],
    "verificationMethod": "manual_school_review",
    "contactEmailVerification": true,
    "playingCapacity": null,
    "waitlistEnabled": true,
    "waitlistCapacity": null,
    "priorityRule": "payment_completed_at_proposed"
  },
  "payments": {
    "timing": "on_application",
    "chargeWaitlistedApplicants": true,
    "amountMinor": null,
    "currency": "USD",
    "merchantConfiguration": null,
    "waitlistRefundMode": null,
    "waitlistRefundCutoff": null
  },
  "teams": {
    "count": 4,
    "rosterMinimum": 6,
    "rosterMaximum": 7,
    "captainAppointedBy": "commissioner",
    "captainConsumesRosterSlot": true
  },
  "draft": {
    "mode": "single_host",
    "pickOrder": null,
    "captainBoardAccess": "read_only",
    "timerExpiryBehavior": "notify_host"
  },
  "competition": {
    "regularSeasonFormat": null,
    "gamesPerTeam": null,
    "playoffFormat": null,
    "rulesetVersionId": null
  },
  "statistics": {
    "trackPoints": true,
    "trackFouls": true,
    "persistPlayingSeconds": true,
    "deriveParticipationFromLiveTracker": true,
    "officialAggregatesUseFinalizedGames": true,
    "allowManualBoxScoreFallback": true
  },
  "communications": {
    "emailEnabled": true,
    "smsEnabled": false
  }
}
~~~

An implementation schema will use valid enum values and separate proposed status from actual settings; “payment_completed_at_proposed” here is a document marker, not an API value. The exact USD currency and captain-slot defaults remain proposed. Unknown money values must prevent paid registration activation.

## 27. Discovery evidence and boundaries

The product began from dissatisfaction with league-site appearance and navigation, with Faraj League as the founder's reference. Earlier discovery found that registration, scheduling, payments, live scoring, and branded sites are already offered in different combinations. This supports evaluating ease of use, connected workflows, data reliability, onboarding, and identity as competitive hypotheses rather than claiming an empty feature market.

Examples reviewed: [Faraj public site](https://farajleague.org/), [LeagueLineup's Filhoops site](https://www.leaguelineup.com/welcome.asp?url=filhoops), [IMLeagues offerings](https://www.imleagues.com/solutions), [UIL basketball reporting](https://www.uiltexas.org/basketball/forms), [Fastbreak basketball tools](https://www.fastbreak.ai/amateur-youth-sports/best-tournament-management-software/basketball), [Exposure features](https://basketball.exposureevents.com/features), [LeagueApps basketball](https://leagueapps.com/sport/basketball/), [GameChanger basketball](https://gc.com/basketball), [RecLeague pricing/features](https://www.recleague.net/pricing).

These were public-site/documentation reviews, not comprehensive authenticated product tests. No market-size estimate, acquisition forecast, legal compliance certification, measured new-platform performance, or firm implementation timeline is asserted.

### Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-06 | First integrated school specification and broader-product foundation; includes founder corrections on payment-at-application, one-host draft, and participation derived from Faraj live tracking with database persistence. |
