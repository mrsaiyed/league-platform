# 09 — Communication, media, and engagement

[Specification map](README.md) · Status: proposed participant/public experience · Decisions: D-20–D-21

**Detailed engineering contract:** [Job and notification specification](engineering/06-jobs-live-and-publication.md), [media security](engineering/05-security-and-privacy.md) and [module contract](engineering/03-admin-and-customization.md) give the implementation detail.

## Account experience and communications

**ME-01 — Personal area.** Show the user's permitted applications, teams, upcoming published events, recent finalized report, inbox and preferences across authorized contexts. Public pages need no login unless that league's approved visibility policy requires it. A waitlisted participant does not receive a fictitious team assignment. Accounts are a secure access mechanism; public player identity and account visibility are separate.

**ME-02 — Notification model.** A committed domain event creates notification intent; recipient resolution applies current relationships and permission. Store intent, in-site item, channel job and delivery attempts separately. Deduplicate logical event/revision/recipient/channel; tolerate at-least-once processing. Provider acceptance, delivery and reading are different states. Unknown send outcomes need reconciliation where possible; do not claim universal exactly-once email delivery.

**ME-03 — Reminders and reports.** Choose limited configurable lead times initially. Rescheduling/cancellation invalidates stale jobs; recheck current fixture, roster, preference and suppression before send. Final-game reports link to the authoritative revision and display only known statistics. Material corrections may issue a correction notice under policy. Private reasons and sensitive financial data stay out of subject lines and preview snippets.

**ME-04 — Audience and consent.** Announcement composer chooses a supported audience such as workspace, competition, team or assigned staff and previews recipient count. Server resolves recipients; no browser-selected arbitrary contact list. Essential service notices and optional reminders/marketing have separate policies. Handle unsubscribe, bounces, complaints, suppression, sender authentication and tenant quotas. Email is an initial proposed channel; browser push, SMS and native apps need their own consent, cost and delivery scope.

## Media and optional identity

**ME-05 — Media.** Support metadata, approved thumbnail, associated competition/game, publication state and allowlisted video-provider identifiers. Templates can show full-game recordings and smaller highlight cards. Customer uploads/links do not promise filming services. Generate safe embeds rather than accepting arbitrary HTML. Hosted video processing is a later cost/moderation project. Photos/headshots require the applicable authority, validation and derivative lifecycle; absent images use a neutral fallback.

**ME-06 — Trophies and awards.** Optional module defines types, artwork, eligible recipient kinds, scope, manual or supported computed method and publication. Each grant records source result/revision where applicable, issuer, date and correction/revocation history. Cabinets can appear on approved player/team/competition pages. Automated awards are idempotent and respond to result corrections; editorial recognition cannot change official statistics. A second league must configure the same module differently without a customer-specific fork.

**ME-07 — Editorial and commercial blocks.** Optional rankings, sponsor blocks, announcements and history sections use supported content types and permissions. Editorial rankings are clearly distinct from calculated standings. Sponsor placement must satisfy the target market's approved content policy. Donations, ticketing, merchandise, ad networks, raffles and public comments are separate capabilities; their presence in a content request does not authorize financial or moderation workflows.

**ME-08 — Publication lifecycle.** Draft/review/publish, scheduled expiry and unpublish follow audience rules. Takedown removes managed public content/derivatives/caches and creates external-provider follow-up where needed. Downloaded copies and third-party reposts are outside automatic control. Archive retains legitimate history under the selected policy. Public search/social metadata must respect the same exposure boundary.

## Acceptance and next detail

Test a changed game with an already queued reminder, revoked guardian/team relationship before delivery, retried notification, withdrawn photo consent, disabled award module, and an official score correction affecting a computed trophy. No audience receives another player's private status or contact list.

The engineering contracts now define durable intent/delivery processing, audience rechecks, stale-reminder cancellation, media limits, upload/withdrawal controls and the awards module schema/lifecycle. Implementation completes transactional content, sender/domain setup, exact supported providers/award rules, moderation screens, archive UX and measured delivery costs.
