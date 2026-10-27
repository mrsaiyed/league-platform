# 02 - League workflows and failure behavior

> Historical snapshot: this prospective-client initiative is inactive. Use the [active overall product plan](../../../../product/platform/README.md) for current direction. Earlier approval/customer statements below retain their historical context.

All implementation choices here are recommended; [the master](README.md) distinguishes founder requirements and proposal terms. This document defines observable behavior. [The data contract](03-architecture-data-api.md) defines how to preserve it.

Scope rule: Al-Hadi uses the paid individual-application and hosted-draft path below. Other supported presets can select team entry, authorized import, invitation, free entry, no draft, or a lighter result-capture mode. Sections 11–13 define these shared-product contracts and release boundaries; they do not automatically add every path to the school pilot.

## 1. Account, participant, and application

**REG-01 - Identity.** Self-service applicant signup creates or reuses an individual verified login account. A participant entered by an authorized guardian, team manager, or import may exist without their own login; later claiming/linking access requires verification. Default account recommendation: email code/link, with MFA for privileged staff. Creating an account, paying, receiving school approval, receiving a playing place, and joining a team are independent events. A public player profile is not a login identity.

**REG-02 - Applicant flow.** Show eligibility, price, included services, priority phase, capacity/waitlist behavior, refund policy, and publication choices before checkout. Flow: verify account → participant details → eligibility claims and required acknowledgments → review → checkout → private status. Preserve an incomplete application and clearly identify missing steps. A parent payer may be different from the student; guardian account access requires a verified relationship.

**REG-03 - Minimal fields.** Pilot fields: participant name, preferred/public name subject to policy, grade, verified contact route, school eligibility claim, jersey size if operationally required, relevant acknowledgments, and optional profile photo after consent. Guardian and emergency contact fields require an agreed school process and narrow access. Do not collect full date of birth, health records, or student IDs simply because a form builder permits it.

**REG-04 - Duplicate handling.** Unique active application per organization/person/competition scope. Reuse a verified account without merging students by name. Suspected duplicate person records go to staff review. A parent using one email for two children must not accidentally merge them. Identity merges are an audited workflow with payment/roster impact review.

**REG-05 - Independent status axes.**

| Axis             | Proposed states                                                                     | Important rule                                             |
| ---------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Application      | draft, submitted, withdrawn, closed                                                 | Closing does not erase money/history                       |
| Identity contact | unverified, verified                                                                | Email control does not prove school attendance             |
| Eligibility      | pending, needs_information, approved, rejected, expired                             | Private reason separate from public status                 |
| Admission        | unallocated, priority_hold, reserved_pending_review, admitted, waitlisted, released | Allocation controlled transactionally                      |
| Payment summary  | unpaid, processing, paid, partially_refunded, refunded, disputed                    | Derived from financial records; multiple attempts possible |
| Placement        | unassigned, assigned, released                                                      | Team placement only after eligibility/admission policy     |

The UI translates these axes into understandable messages: “Payment received; school approval pending” or “Paid waitlist; no place allocated.” Do not compress all axes into one status enum.

## 2. Al-Hadi eligibility, priority, and capacity

**REG-06 - Pilot phases.** Proposed initial phase accepts grades 9–12. A later phase opens remaining places to grade 8. Store an exact deadline in the league's approved timezone. Whether grade-8 students can submit and pay before that phase opens is OPEN; recommended default is no early grade-8 payment until the policy is decided. Age handling is independent of grade.

**REG-07 - Review.** School reviewer sees only information needed for eligibility. Each decision records actor, time, source/method, policy version, outcome, and restricted reason. Email-domain match is evidence of control of an address, not conclusive student/grade verification. Later roster imports/SSO become additional verification providers without changing admission/payment states.

**REG-08 - Allocation rule.** Recommended pilot rule: within the eligible priority phase, successful payment reserves a place pending school review; approval confirms admission. Rejection releases that reservation and creates a refund task under the approved policy. Reservations awaiting school review have a staff SLA; a timeout does not confiscate money or silently remove a student. Rank by server-assigned allocation sequence when a verified successful payment is processed. This is a disclosed rule, not a claim to perfectly order simultaneous bank completions.

**REG-09 - Capacity transaction.** Lock the capacity pool, check phase/eligibility/payment conditions, enforce unique active allocation, allocate if available, otherwise assign paid waitlist status, and write audit/outbox records in one transaction. Never count existing rows and insert outside a lock/constraint boundary. Paid waitlist enrollment needs a configured maximum and cutoff; avoid unlimited refundable liabilities.

**REG-10 - Checkout holds.** A short checkout reservation can reduce checkout surprises but is not the same as a paid playing place. If implemented, give it a server expiry and release it safely. Late successful payment after a hold expires is reconciled into a remaining place or paid waitlist according to disclosed policy; it must never overfill the pool. Payment must remain visible even if application processing fails.

**REG-11 - Promotions.** Promotion selects the first eligible candidate in the applicable priority class and recorded sequence. Staff exceptions require authority, reason, and audit. If acceptance is required, give an offer expiry and retain waitlist history. For the paid pilot there is no second charge for promotion. Declining a place triggers the configured withdrawal/refund path.

**REG-12 - Final readiness.** Captains and draftable players must be admitted, eligible, and financially cleared or explicitly waived. A refund, dispute, or later eligibility reversal creates a review task for roster consequences; do not erase sporting history automatically.

## 3. Payments, refunds, and reconciliation

Founder requirement for Al-Hadi: take payment when students apply, including waitlisted applicants. Proposal baseline: $75 participation fee. Merchant identity, currency, fee absorption, rejection/withdrawal rules, and refund deadline still require agreement before real checkout. PAY-11 defines other supported payment modes; the Al-Hadi policy is not compulsory for all customers.

**PAY-01 - Three money streams.** Keep participation orders, platform subscription invoices, and optional operating-service/external-game charges separate. Al-Hadi's proposed $100 per school per external game does not become another player registration fee. Record school ticket/concession arrangements as information initially; digital fundraising is not implied.

**PAY-02 - Merchant boundary.** The legal seller and provider account are recorded on each order. If our business is the approved operator selling the Al-Hadi program, a platform-owned merchant account may fit this pilot. Independent leagues collecting their own fees need an approved connected-account arrangement before launch. Do not mix customer funds in one ordinary account by default. Stripe charge type affects whose balance pays refunds/disputes; select it with the commercial agreement. [Stripe Connect charge types](https://docs.stripe.com/connect/charges).

**PAY-03 - Pricing.** Server calculates amount from the accepted price version, quantity, approved discount/waiver, and fee policy. Use integer minor currency units. Store a price/disclosure snapshot. A client-supplied amount, currency, merchant ID, or coupon value is never trusted. Support no-charge waivers as explicit authorized adjustments, not fake successful Stripe charges.

**PAY-04 - Checkout.** Create/reuse an order and idempotent checkout attempt. Persist provider IDs. UI redirects are navigation only. Show processing until a verified provider state is reconciled. Retry creation using the same attempt key after a network timeout; do not create a second charge just because the response was lost.

**PAY-05 - Webhooks.** Verify signature on raw payload with endpoint secret; persist an inbox record with provider/account/event uniqueness, then acknowledge after durable receipt. Process in bounded retries. Bind the event to a known order, merchant account, currency, and expected amount. Quarantine mismatches. Providers may redeliver and reorder events; payment state must reconcile facts without regressing because an older event arrived late. [Stripe webhook guidance](https://docs.stripe.com/webhooks).

**PAY-06 - Refund lifecycle.** Staff request a full/partial refund with reason. Transaction reserves the refundable amount including existing pending refunds. Worker sends an idempotent provider request. States include requested, submitted, pending_provider, succeeded, failed, and needs_review. A submitted refund is not a completed refund. Preserve original collection, refund, processor fee, and transfer facts. Do not represent reversal by deleting a payment.

**PAY-07 - Paid waitlist cleanup.** Before enrollment opens, approve the waitlist cutoff and refund date/rule. At cutoff, preview the paid unplaced list, exclude already-promoted and already-refunded cases, reserve refunds, and execute with retries. Recommended pilot: staff-approved bulk refund, not an unattended “season started” trigger. Display individual outcomes and unresolved provider failures.

**PAY-08 - Reconciliation.** At least daily, and before closing a season, compare provider settled charges/refunds/disputes against orders, allocation outcomes, and ledger entries. Alert on paid-but-unallocated cases, duplicate paid attempts, wrong amount, unresolved refund, and provider events stuck in inbox. Reconciliation repairs local status without charging again. Recovery after a database restore must rerun it.

**PAY-09 - Disputes and receipts.** Restricted finance users get deadlines and evidence tasks; players see a safe status message. Payment receipts distinguish fee collection from acceptance. Payer receives the receipt; access to student data comes from verified relationships, not possession of receipt details.

**PAY-10 - End conditions.** Program cancellation, student rejection, injury/withdrawal, late entry, unpaid manual entry, scholarship, and staff fee waiver each need a policy before enabled. These are configuration and finance processes, not assumptions buried in checkout code.

## 4. Teams, open gym, and hosted draft

**DFT-01 - Team setup.** Commissioner creates season teams, roster bounds, colors, captain assignments, and placement mode. Recommended captain rule: occupies one of seven places. In Al-Hadi's four-team proposal, that leaves 24 non-captain draft selections if all 28 spots are filled.

**DFT-02 - Pool.** Publish open-gym details as calendar events. Captains see the approved draft pool's authorized sports fields; contact info, payment status, rejection reasons, and school verification evidence remain private. Private scouting notes, if needed, have a separate audience and retention policy.

**DFT-03 - One host.** The commissioner or delegate controls the draft during the external call. Captains need read-only access initially. Store ordered teams, snake/repeating/manual strategy, roster limits, eligible pool snapshot, and draft rules version. Exact pilot strategy is OPEN.

**DFT-04 - Atomic pick.** Host submits command ID, expected draft revision, host fencing token, person, and target competition entry. Transaction validates permission, active host, turn, pool membership, eligibility/admission, remaining team capacity, and no existing active pick/roster conflict; writes pick, roster membership, cursor, audit, and outbox together. Two tabs cannot both select the same player.

**DFT-05 - Recovery and undo.** Board reloads from durable state. Last-pick reversal is an appended action if it has no incompatible downstream effect. Earlier-pick corrections require an impact preview and explicit correction workflow. Completed draft can be reopened only by authorized staff with a reason. Never clear all picks as a casual reset.

**DFT-06 - Host takeover.** A time-limited lease plus increasing fencing token prevents an old tab writing after another host takes over. Takeover shows the current revision and pending/conflicting actions. Lost connection pauses authoritative picks; a local board is not proof a pick committed.

**DFT-07 - After draft.** Notify players only when assignments are published. Transfers preserve effective dates and historical game rosters. Late admission uses an explicit placement rule and current capacity, not an invisible retroactive draft pick.

## 5. Sessions, competition, and scheduling

**SCH-01 - Separate event types.** Training/open gym are calendar sessions, not scored games. A game day can contain check-in, warmup, two games, breaks, and dismissal. Prayer breaks and school closures are blocked windows. Participation at practice is not basketball GP.

**SCH-02 - Generator input.** Versioned inputs: season dates/timezone, competition scope, eligible entries/groups, pair counts, stage, court availability, game slot length, transition buffers, locked fixtures, blackouts, maximum games per team/day, minimum rest, home/away policy, and approved priority objectives. Proposed Al-Hadi template assigns each team once per game day. Exact playing-time rules need validation against the proposed 45-minute slots; overtime contingency must be explicit.

**SCH-03 - Determinism.** Persist generator version and random seed if used. Same inputs produce the same candidate schedule. Hard constraints cannot be traded away for a prettier schedule. Soft constraints show scores/explanations. If infeasible, return specific conflicts and possible relaxed inputs; never silently schedule through a blackout.

**SCH-04 - Publication.** Generate a draft → staff edit/lock → validate → show conflict/notification preview → publish a revision. Updating a draft does not change the live calendar. A published change records who changed it and why. Notifications include the new published revision and are cancelled/replaced if superseded before delivery.

**SCH-05 - Conflicts.** Check team overlap, court overlap, required staff overlap, minimum rest, and buffers. Published venue occupancy is enforced against actual active bookings across seasons in the same organization. For a shared venue managed by multiple organizations, a separately authorized booking service is later scope; matching addresses must not give cross-tenant access.

**SCH-06 - Time.** Store UTC instants plus IANA zone and original local intent for recurring rules. Explicitly resolve daylight-saving gaps/ambiguities. Display the league zone; calendar exports use correct timezone semantics. Postponed/cancelled states persist history. Browser locale cannot alter authoritative schedule meaning.

**SCH-07 - Playoffs.** Use a supported bracket preset with explicit seeds, tiebreaker policy, byes, and advancement rules. Confirm seeds before bracket publication. A correction that changes a seed after a later game starts is blocked from automatic propagation and escalated for staff resolution.

**SCH-08 - External games.** Permit an external opponent reference without creating a customer account for that school. Flag game classification and aggregation scope. External results appear separately by default and never change internal standings unless an explicit competition rule says so. Linked outside-league information must state source and provenance.

## 6. Live basketball tracking

**GAM-01 - Pregame.** In live event-capture mode, assigned scorekeeper loads game, rules version, roster snapshot, active players, jersey numbers, and starting lineup. Verify connection and synchronize before start. The Al-Hadi preset supports points, appearance, substitutions, playing time, period/clock changes, team score, and required foul handling. Rebounds/assists/steals are separate feature scope. Other competition presets can use GAM-14 result modes without running this scorer.

**GAM-02 - State machine.** scheduled → ready → live → submitted → finalized. paused/suspended are controlled live conditions. cancelled and forfeit are distinct outcomes with approved stat policies. Finalized results require a correction command to change. A game can be publicly live while season averages still use finalized results only.

**GAM-03 - Event command.** Each command includes unique command ID, game ID, session/device ID, fencing token, expected game revision, event schema version, period and clock context, type, payload, and client occurrence time. Server receipt time and authoritative sequence are assigned on commit. Supported events include start/pause/resume clock, score, foul, substitution, period transition, clock correction, and reversal/correction. No client writes totals directly.

**GAM-04 - Atomic event batch.** Validate ordered events against the current state; append events and update score/lineup/minute projection/audit together. Duplicate command with matching payload returns the prior acknowledgment; changed payload under the same key is rejected. A stale revision produces a conflict with authoritative state. Event ordering follows accepted sequence, not wall-clock timestamp sorting.

**GAM-05 - Clock.** Do not persist a write each second. Persist running/paused anchor, period, remaining/elapsed time, and clock revision at transitions. The display uses elapsed monotonic time while active, reconciled to authoritative anchors. Screen sleep/tab background is not a real-game pause; on return, reconcile. Clock corrections preserve prior values and affected stints. Define a conservative operator-review path for invalid/skewed timing.

**GAM-06 - Minutes and appearance.** Track lineup stints in integer milliseconds or another explicitly chosen integral resolution; publish seconds/minutes with documented rounding. Close/open stints on substitution, pause, period end, and finalization. A player can have zero points and a valid appearance, including a zero-rounded-minute stint. Missed games are DNP; unknown minutes are null, not zero. Never derive participation only from scoring events.

**GAM-07 - Reconciliation.** Within valid recorded segments, aggregate player time must equal active lineup size multiplied by elapsed game-clock time, allowing explicitly logged short-handed play and corrections. Validate nonnegative time, allowable lineup size, distinct on-court players, and plausible period totals. Aggregate known stints before display rounding.

**GAM-08 - Durability UI.** Show separate counts/status for pending device events, server-acknowledged events, and published projection revision. “Saved to server” is only shown after database commit acknowledgment. Publish an obvious stale/live indicator on public scores. Notifications do not substitute for synchronization.

**GAM-09 - Offline boundary.** Recommended pilot: one designated scoring device per game, preloaded after online authorization. Queue bounded events in IndexedDB during short Wi-Fi interruptions. Local data is not guaranteed backup: quota, clearing browser data, private mode, device loss, or abrupt storage failure can lose unsynced events. Provide a controlled emergency event export and a paper/manual reconstruction procedure. Require online synchronization before finalization.

**GAM-10 - Lease and offline conflict.** An offline scorer may queue tentative events while its lease expires. Reconnection must revalidate authority. If no competing accepted events/takeover exist, server can validate and accept a contiguous batch under renewed authority. If another scorer took over, old fencing tokens cannot mutate the game; preserve the rejected batch for commissioner review. Never silently discard or automatically merge conflicting scores/minutes.

**GAM-11 - Submission.** Scorekeeper reviews final score, points reconciliation, appearance, minutes completeness, open stints, and unsynced events. All pending events must resolve. If complete tracking failed, authorized staff may enter a result with explicit manual/partial provenance; known values stay known and unknown minutes stay null. Paper fallback must not manufacture a precise event timeline.

**GAM-12 - Finalization.** Authorized finalizer commits an immutable result revision and atomically updates official projections or publishes a versioned consistent snapshot. In complete individual-scoring modes, player points reconcile with team score except explicitly supported attributed team adjustments; unexplained differences block finalization. In score-only/partial modes, mark individual coverage unavailable/incomplete rather than fabricate player totals to satisfy reconciliation. Result-based messages publish after commit.

**GAM-13 - Corrections.** Append reasoned correction and new official revision; retain prior result. Recompute affected player aggregates/standings, invalidate public cache, and refresh reports. Freeze automatic bracket changes if downstream competition has begun. Scorekeeper cannot erase audit records or silently edit finalized totals.

## 7. Statistics, standings, and archives

**STA-01 - Definitions.** GP counts verified finalized eligible appearances; DNP does not count as a zero-point game. With complete point records, PPG = points / GP at the agreed display precision; GP=0 shows a dash. With mixed capture, unknown appearances and points remain unknown. A points average may use only appearances with complete point records, must say that it covers recorded games, and must show that denominator/coverage alongside known GP. Never divide a partial points total by all appearances or imply an incomplete total is the full season total. Stats scopes explicitly identify season, competition, stage, division, capture coverage, and internal/external classification.

**STA-02 - Provenance.** Each displayed statistic has source/revision and completeness state. Imported score-only games can show results without fabricated individual stats. Do not label incomplete minutes “average minutes” without a coverage explanation. Career aggregates later must follow person-link privacy rules and resolve historical completeness.

**STA-03 - Standings.** Configure win/loss/tie/forfeit treatment and an ordered tiebreaker list. Basketball ties default to the selected overtime rule; do not assume every competition supports ties. Head-to-head mini-tables, tied groups, absent games, and point-difference caps need deterministic rules. Publish the tiebreaker explanation used.

**STA-04 - Awards.** Optional manual awards with category, recipient, season, explanation, and publication state. Automated awards require a published eligibility/minimum-games rule and approved calculation. Awards do not modify underlying stats.

**STA-05 - Archive.** Archive fixes season configuration and snapshots while permitting controlled corrections and privacy takedowns. New season duplication copies chosen rules/branding/team identities, not payments, consents, roster eligibility, or stale staff assignments.

## 8. Notifications, email, and personal area

**MSG-01 - Player home.** Show own application states, team, next published game, latest finalized game/report, and unread inbox count. No account required for public league pages. No fabricated team assignment for a waitlisted participant.

**MSG-02 - Event-based delivery.** Domain transaction records durable notification intent. Resolve recipients from authorized current relationships; store in-site item and channel deliveries separately. Deduplicate event/revision/recipient/channel. Keep private reasons and sensitive payment details out of email subjects and push previews.

**MSG-03 - Reminders.** Recommended initial reminder: one configurable lead time, such as 24 hours before a published game. Reschedule/cancel supersedes old jobs. Recheck current schedule, roster, preferences, and suppression at send time. A provider outage displays a delivery issue; it never changes the authoritative game time.

**MSG-04 - Reports.** Link to the last finalized game. Personal report includes result, own points, appearance, and known minutes. Corrections update revision and, when material, issue a correction notice. No generated performance judgments are required.

**MSG-05 - Channel policy.** Separate essential transactional notices from optional reminders/marketing. Support unsubscribe/suppression for optional email, sender domain authentication, bounces, complaints, and rate limits. The website inbox needs no browser-push permission. Native app, SMS, and browser push are later channels, not prerequisites.

## 9. Media, profiles, and publication

**MED-01 - Initial media.** Full-game recording card spans the media grid; highlights occupy smaller cards. Store title, thumbnail, approved provider URL, duration if known, associated game, publishing time, and visibility. Weekly coverage is an operational deliverable; the software cannot guarantee recordings exist.

**MED-02 - Safe embedding.** Accept approved video providers through parsed identifiers and generated embeds, not pasted arbitrary HTML. Use click-to-load embeds when appropriate. Avoid server-side fetching arbitrary user URLs. Integrated uploads/transcoding require a separate cost, moderation, and processing design.

**MED-03 - Headshots.** Store an optional approved photo with consent/authorization record and crop/focal settings. Default to initials when absent or not authorized. Public names and image visibility follow school policy. Simulated deck photos/names must not be imported as verified production player identity.

**MED-04 - Takedown.** Withdrawal/unpublish removes the item from public projections, assets, derivatives, and controlled caches according to the defined process. External provider copies require a tracked external takedown task; do not promise control over downloaded screenshots or third-party reposts.

## 10. Workflow acceptance examples

1. Two eligible applicants pay for the last spot: at most one active playing allocation; both payments remain recorded; the other gets disclosed paid-waitlist/refund behavior.
2. Payment succeeds while our worker is down: durable provider reconciliation eventually updates the application without a second charge.
3. A refunded student remains in an archived game box score if permitted, but their current participation status is reviewed.
4. Two draft tabs select the same person: exactly one pick/roster assignment commits.
5. A generation request cannot fit all games: it returns conflicts, not hidden rule violations.
6. A scoring device disconnects, reloads, and reconnects: acknowledged events do not duplicate; queued events remain distinguishable and recoverable where storage survives.
7. A commissioner takes over while the first device is offline: old events require reconciliation and cannot overwrite the new scorer.
8. A zero-point player enters briefly: appearance counts; DNP and unknown minutes remain distinct.
9. Correcting a final score updates standings and the public report from the same official revision.
10. Moving a game invalidates the old reminder and does not expose recipient contact lists.

## 11. Enrollment, membership, and finance across league types

**REG-13 - Enrollment modes.** Competition setup selects supported entry method: individual application with placement, team application with roster submission, approved invitation, or staged administrative import. Payment requirement and draft strategy are separate choices. Team application belongs to an authorized submitter and a competition entry; player eligibility/consent can remain pending independently of team admission. Track separate team-slot and player/roster capacity pools. Team-fee refunds follow the accepted team order; removing one player does not imply refunding the entire team. A manager cannot accept another person's personal consent without documented authority. Implement the chosen Al-Hadi mode first; validate these boundaries before the general-league release.

**REG-14 - Continuing relationships.** Login account, local person, club/school affiliation, sporting membership, credential, season roster, and competition entry have distinct IDs and lifetimes. Later membership modules store issuer, category, effective/expiry dates, renewal, state, and evidence scope. Expiry can block future participation under a ruleset while preserving historic eligibility snapshots and results. A returning team can retain identity with a new roster. Transfers have effective dates and approval rules. Cross-workspace person matching requires explicit verified linkage and sharing authority; never create a global searchable athlete file by matching names/emails.

**REG-15 - Governed eligibility.** For network releases, checks can depend on age-category date, affiliation, credential validity, transfer/roster deadlines, and a versioned governing policy. Separate evidence, decision, expiry, authorized exception, and appeal. Each case records restricted attachments, assigned reviewers, stage/deadline, reason, and decision history. A commissioner cannot waive a rule outside their authority. Prefer recording an authorized determination and minimal evidence over importing entire academic/medical files. Exact jurisdictional rules and any automated eligibility decisions require dedicated review; the platform does not declare a student eligible merely because a custom checkbox was checked.

**PAY-11 - Configurable payment requirement.** Supported product modes are no fee, pay with application, pay after acceptance/offer, and authorized recording of external/offline payment; release only tested modes. `not_required` is distinct from paid, waived, and externally recorded. A free league needs no merchant checkout. Team/institution orders reference their billable subject and line items, not a fabricated student application. Preserve price/currency/merchant snapshots and distinguish verified processor facts from staff attestations with evidence/audit. Installments, multi-beneficiary allocations, recurring sporting membership dues, tax handling, and organization invoicing are later explicit finance capabilities, not generic untyped order metadata. Subscription bills remain separate from sporting fees.

## 12. Multiple competitions and qualification

**SCH-09 - Competition and stage contract.** A season can hold concurrent independent competitions. Each owns its entries, admission/rules version, categories, stage structure, standings scope, and publication. A stage declares supported format, competitors, seed source, round/match structure, completion condition, and advancement. Qualification edges form an acyclic dependency graph. Six teams in an eight-slot single-elimination draw produce two seed-assigned byes; byes advance entries without fake wins, appearances, or scored games. Start with validated round-robin/single-elimination presets. Double elimination, series, pool-to-bracket, consolation, and cross-competition qualification require their own contract/tests before enabling.

**SCH-10 - Qualification and alignment.** Later qualification links record source competition/stage/rank or winner, destination entry slot, rule version, source official revision, state, and confirming authority. Support ties, pending results, disqualification, withdrawal/replacement, and approved reseeding. Recompute candidates before downstream locking; once downstream play begins, produce an impact case rather than rewriting the bracket automatically. Version school/classification/district assignments by sport and effective period; old competitions keep the alignment they used. The display name “conference” can mean different things in different organizations; it is not a hard-coded authorization level.

**SCH-11 - Resource and officials management.** Across competitions in one workspace, scheduling includes team/participant overlap where policy requires, shared coaches, court availability, official availability, rest/travel buffers, and priority rules. Later officials workflows cover qualification/status, invitation, acceptance/decline, replacement, assignments, and separately scoped compensation. Authorized cross-workspace resource booking requires a shared booking contract or provider; matching a facility name/address is insufficient. Large generation jobs are cancellable background work with progress, bounded search budget, feasibility report, saved versions, and lockable manual fixtures. Partial candidates are never automatically published.

## 13. Result capture and mixed data sources

**GAM-14 - Capture mode.** Each competition/game rules snapshot selects live event capture, submitted box score, or final score only; integrated provider capture is another explicitly approved source. The mode controls required fields and permitted completeness. A score-only game may count for team standings but cannot add invented player appearances, zeros, minutes, or PPG. Mixed-source player statistics publish eligible-game coverage and capture scope. A submitted/imported result enters review under its source authority; it cannot silently replace an official result. Map external IDs, retain provenance, handle replay and corrections, and determine the authoritative writer for each field. Switching modes midgame requires reconciliation, not deletion of accepted events. All modes use the same finalization/revision boundary.
