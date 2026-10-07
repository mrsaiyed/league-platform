# Accounts and personal notifications — v0.2 proposal

**Date:** October 7, 2026. **Status:** founder-requested direction; the implementation choices and release placement below are proposed for discussion. This supplements the v0.1 school specification without silently approving unrelated decisions.

The founder wants signup to create an account naturally, with a personal website notification area, upcoming-game reminders, last-game reports, and possible email delivery. A native app is not required for a personal website inbox.

## Recommended release split

| Scope        | Build in the first production foundation                                                  | Extend when justified                                              |
| ------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Account      | Verified email signup/sign-in, existing-account reuse, recovery, own registration status  | Additional identity providers and approved school SSO              |
| Player home  | Application/payment/placement status, assigned team, schedule, latest finalized game link | Cross-season history and richer personalized reports               |
| Inbox        | Recipient-owned notifications, unread count, read actions, approved team/schedule updates | More event categories, bulk read/history tools                     |
| Email        | Existing registration and schedule-change confirmations from v0.1                         | Configurable upcoming-game reminders and finalized-game summaries  |
| Browser push | No pilot requirement; keep a delivery-channel boundary                                    | Explicit opt-in, service-worker subscriptions, permission recovery |
| Native app   | No pilot requirement                                                                      | Later only if usage justifies separate distribution and support    |

Identity and authorization should not be postponed. Report generation and additional delivery channels can be.

## Account behavior

**ACC-01 — One signup journey.** Explain that applying creates or connects the student's league account. Ask for a contact email and verify control through a short-lived, single-use code or link. Successful verification creates the session. This can happen within the registration journey before private account access and checkout. Payment is still collected at application, before school eligibility approval.

**ACC-02 — Existing accounts.** Use the identity provider's verified user ID as the account key. Resolve an existing authenticated account rather than creating a duplicate for each season. Avoid public responses that expose whether an arbitrary email address already belongs to an account.

**ACC-03 — Pending identity is not access.** Entering an email, receiving a payment, or creating an unverified provider record does not establish account ownership. Do not allow a pre-created account, guessed email, checkout receipt, or unverified identity-link request to claim another participant. Expired or replayed verification tokens fail safely.

**ACC-04 — Distinct relationships.** An account can link to organization-scoped people through explicit relationships. The school participant, account holder, payer, and future guardian may differ. Staff import does not create a reusable password or silently grant access to the imported person's private records. Claiming an imported record requires verified linking and, where ambiguous, school review.

**ACC-05 — Scope.** A player reads and changes only their permitted profile, preferences, registrations, and notifications. A captain has only the separate scopes granted for their team/draft. A commissioner role is an explicit organization membership and cannot be selected during student signup.

**ACC-06 — Sessions and recovery.** Enforce server-validated sessions, rate limits, allowed redirects, secure cookie handling, logout, revocation, and verified email changes. Recheck scope on every sensitive request. Re-authenticate for sensitive account changes. Recovery must not use public player name, jersey, or team knowledge as proof of identity.

Supabase supports email codes/links and can create a new account during passwordless sign-in; authentication still requires the verification step. This is a proposed implementation fit, not an already connected feature. [Supabase passwordless authentication](https://supabase.com/docs/guides/auth/auth-email-passwordless).

## Personal experience

**ACC-07 — My league.** A top-of-site account control leads to a personal home: current registration states, team assignment, next published game, latest finalized game report, and notification inbox. A new paid waitlisted applicant sees their actual pending/waitlist states rather than a fabricated team or game.

**ACC-08 — Guest behavior.** Published league information remains available without signing in. Opening a private notification link requires authentication and recipient authorization; a login redirect alone is not authorization. Do not put private notification content into public page metadata or shared caches.

**NTF-01 — Website inbox.** Display a personal unread count, newest-first items, category, event timestamp, read state, and an authorized destination. Inbox display does not request browser notification permission. Mark-read and mark-all-read endpoints affect only the caller's eligible records.

**NTF-02 — Channels.** An in-site item, email delivery, and future push delivery are separate records from the same domain event. Reading a message and email delivery are different facts. Disabling a reminder email does not erase the website's authoritative game or registration status.

**NTF-03 — Reminders.** Proposed reminder policy: a commissioner-configured lead time, initially a day before a published game; exact timing remains open. Resolve the actual current roster and published schedule. Use UTC for job execution and the league timezone for display. Cancel or supersede obsolete jobs when a game moves, is cancelled, or a player changes teams. Recheck eligibility and notification preferences immediately before delivery.

**NTF-04 — Last-game report.** Generate from a finalized result revision, with team result, the player's points, participation, known playing time, and a link to the box score. DNP differs from a zero-point appearance; unknown minutes remain unknown. Do not invent a narrative, playing-time estimate, or student performance judgment. Later corrections update the report and can trigger a clearly labeled correction notice.

**NTF-05 — Reliable delivery.** A committed event inserts durable notification intent. Deduplicate by organization, event/revision, recipient, and channel. Workers use bounded retries and a failure queue. Record provider delivery state without treating a successful send request as proof of inbox delivery. Do not resend all reminders after a worker restart.

**NTF-06 — Recipient privacy.** Resolve recipients on the server from current, authorized relationships. Never accept a caller-supplied recipient ID as sufficient authority. RLS/grants restrict notification reads and updates to the owning account plus any narrowly approved support scope. Realtime channels and unread counters have the same boundary. Revoke access when the governing relationship ends, while preserving only the historical access permitted by policy.

**NTF-07 — Content and preferences.** Keep email subject lines, push previews, logs, and notification payloads minimal. Emails should not contain private eligibility or payment details intended for the authenticated portal. Separate operational notices from optional updates. No student contact lists in CC. The school must resolve any parent/guardian delivery policy before implementation.

**NTF-08 — Push later.** Browser/OS notifications are an additional permissioned channel and require supported secure browser infrastructure. Request permission only after an intentional opt-in, explain fallback to website/email, and support revocation. Do not treat denied browser permission as an account failure. [MDN Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API).

## Data additions to v0.1

| Entity                   | Key fields / invariants                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| account_profiles         | auth_user_id, display preferences, status; no student membership inferred from a name/email string                                                                        |
| notification_events      | organization_id, event_id, entity/revision, category, occurred_at, redacted payload/reference; durable event uniqueness                                                   |
| user_notifications       | id, organization_id, recipient_auth_user_id, event_id, authorized entity reference, created_at, read_at?, expires_at?; unique event/recipient; recipient-only read/update |
| notification_preferences | organization_id, auth_user_id, category, channel, enabled, updated_at; permissions independent of delivery preference                                                     |
| notification_jobs        | event_id, recipient_id, channel, scheduled_for, source_revision, dedupe_key, state, attempts; invalidated on relevant changes                                             |
| notification_deliveries  | Extend existing v0.1 table with channel and revision-aware deduplication; do not create a competing second mail system                                                    |
| push_subscriptions       | LATER: account/organization scope, endpoint, keys, opt-in, revoked_at, last_success_at; private and access-controlled                                                     |

Index inbox queries by `(organization_id, recipient_auth_user_id, created_at desc)` and unread queries by the same scope with `read_at is null`. Use cursor pagination. A server determines recipient identity from the session, not from an arbitrary URL parameter. Purging private accounts or retiring membership must account for notifications, queued deliveries, subscriptions, and retained audit references.

## Acceptance cases to add

1. A new signup verifies email and gains access to exactly its own application; a returning user reuses an account.
2. A paid-but-unverified identity receives no private account access; a verified-but-school-unapproved student still sees pending eligibility.
3. Account A cannot fetch or mark account B's notifications read, including within the same school.
4. A payer cannot claim the student account using only a payment receipt.
5. A revoked membership cannot retain private access through a cached response or realtime channel.
6. Moving or cancelling a game invalidates the old reminder; retries create one intended delivery per recipient/version/channel.
7. A report excludes unfinalized statistics and correctly distinguishes DNP, zero-point appearances, and unknown minutes.
8. Correcting a final result updates its report without silently presenting conflicting official totals.
9. Opting out of a reminder channel respects preferences while leaving the personal schedule visible.
10. Ignoring or rejecting browser-push permission does not block website or email access.

These are planned production checks. The current demo merely illustrates the interface and contains no authenticated identity provider or private backend.
