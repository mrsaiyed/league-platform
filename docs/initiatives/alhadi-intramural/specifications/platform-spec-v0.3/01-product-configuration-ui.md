# 01 - Product, configuration, and UI

> Historical snapshot: this prospective-client initiative is inactive. Use the [active overall product plan](../../../../product/platform/README.md) for current direction. Earlier approval/customer statements below retain their historical context.

Status: recommended specification unless explicitly marked. Read [the master](README.md) for the proposal baseline and status rules.

## 1. Business and product boundaries

**BIZ-01 - Shared service.** A league customer receives an organization workspace, public league experience, participant portal, and supported operational modules. Branding and settings are records in the product. A tenant can have multiple staff and seasons without another deployment.

**BIZ-02 - Separate commercial relationships.** Record the software customer, legal contracting entity, operating-service provider, participation-fee merchant, payer, participant, and financial beneficiary separately. A school may be the customer while our operating business collects participation fees. A different league may collect fees itself.

**BIZ-03 - Entitlements.** A plan controls product capabilities and quotas, not database authorization. Paying for a plan never grants access to another customer's data. Launch with a manually assigned pilot plan; do not build a general subscription billing engine before pricing is agreed. Prepare organization-level feature flags and metering interfaces.

**BIZ-04 - Provisioning.** Platform staff can assist Al-Hadi through the same repeatable creation/configuration commands future self-service onboarding uses. Select a preset, establish a verified owner, and validate readiness. Onboarding a synthetic second organization must require no source edits. Assistance is the pilot delivery method; independent organizer signup is an explicit general-product release gate under BIZ-07.

**BIZ-05 - Lifecycle.** Organization states: provisioning, active, limited, suspended, archived. Define action restrictions per state. A billing problem must not silently destroy access to exports or interrupt an already-running game; establish a contractual grace policy and separate abuse suspension from billing restrictions.

**BIZ-06 - Business measurements.** Track organization activation, completed registration rate, staff hours per season, support minutes per league, games finalized without repair, refund backlog, retention, and contribution margin. Track time from organization creation to first published season. Pilot operating-service margin and software margin are distinct reports.

## 2. Product hierarchy

Separate the customer workspace that owns data from institutions that participate and administrative units that delegate responsibility. `organization_id` currently names the owning workspace. One school/club may be represented locally, have its own workspace, and/or enter competitions hosted elsewhere through explicit agreements. Neither an affiliation nor a position in a hierarchy grants automatic access to private records. See ARC-10 and the [fit review](07-platform-fit-review.md).

| Concept                   | Meaning                                                                     | Al-Hadi example                    | Expansion                                                            |
| ------------------------- | --------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| Organization              | Owning customer workspace / tenant; separate from participating institution | Al-Hadi program workspace          | Operator or governing-body workspace; explicit affiliated workspaces |
| League                    | Continuing sport/program identity                                           | Boys intramural basketball         | Multiple leagues in one organization                                 |
| Season                    | Time period within a continuing program                                     | 2026–27 season                     | Concurrent competitions; historical configuration preserved          |
| Group                     | Typed division/conference/pool within a competition                         | One default group                  | Competitive grouping; distinct from administrative authority         |
| Stage                     | Competition phase with format and qualification contract                    | Regular season; playoffs           | Pools, brackets, supported qualification transitions                 |
| Season team               | Season roster linked to a stable team when applicable                       | Four teams; seven slots each       | Team enters one or more permitted competitions                       |
| Event/session             | Calendar activity                                                           | Game day, training, open gym       | Meeting, travel note, external match                                 |
| Game                      | Scored contest between competition entries                                  | Internal basketball game           | External opponent or supported sport adapter                         |
| Competition               | Independent contest with entry/rules/result scope                           | One default intramural competition | Age division, tournament, cup, championship                          |
| Institution / affiliation | Participating school/club and its authorized relationship                   | School associated with the program | May be a local record or linked separate workspace                   |

**CFG-01.** Every screen identifies its relevant workspace, program, season, and competition context. Hide redundant selectors for a simple one-competition league; use an all-program overview where appropriate. Switching workspace clears private query caches; active scorer work requires sync/recovery before leaving. No globally selected tenant hidden in an unverified browser variable.

## 3. Customization contract

Configuration resolution checks platform safety and entitlements, then any explicitly applicable governing policy, then workspace/program/season/competition/stage defaults and permitted game overrides. Governance policy is effective-dated and may mark individual fields locked or locally editable. Policy authority comes from a recorded assignment/agreement, not the customer's ability to edit a theme. Contradictory mandatory policies block publication with an explanation. Historical games retain their effective rules snapshot; no later parent-policy change silently rewrites it.

Every setting has a typed schema, allowed values, default, owner role, scope, dependency, mutation rule, effective date, audit classification, and migration strategy. The UI shows why a setting is unavailable.

| Setting family | Pilot controls                                                                             | Later controls                                                                  | Change boundary                                                         |
| -------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Brand          | Logo, school/league name, approved accent palette, hero photo and crop, typography preset  | Theme library, custom domain, localization                                      | Preview/publish; accessible contrast validated                          |
| Pages          | Toggle/reorder supported pages and blocks; rules, FAQ, contact, announcements              | Additional supported block types                                                | Cannot hide essential payment/policy disclosures                        |
| Registration   | Opens/closes, capacity, paid waitlist, grade phases, school review, approved custom fields | Team/invite/import paths in independent-league release; family/membership later | Version policies/forms; school fields apply only to school preset       |
| Price          | Amount, currency, approved discounts/waivers, fee disclosure                               | Installments, scholarships, bundles                                             | Paid orders retain original price; future applications use new version  |
| Teams          | Names, colors, roster bounds, captain selection, placement mode                            | Transfers, trades, team entry                                                   | Published rosters retain history; over-cap changes blocked              |
| Competition    | Games per pair, groups, playoff preset, tiebreaker order                                   | Supported pools/conferences, larger brackets                                    | Freeze before affected competition; preview/recompute if safely changed |
| Schedule       | Venues/courts, slots, blackout dates, duration, buffers, rest limits                       | Shared coaches, travel optimization                                             | Publish a revision and show affected events/recipients                  |
| Basketball     | Halves/quarters, period duration, overtime, clock policy, foul limits, on-court count      | More advanced rule profiles                                                     | Pregame freeze; in-game correction is an audited operation              |
| Statistics     | Al-Hadi live points/appearance/minutes; explicit completeness and capture mode             | Score-only/box-score modes for independent leagues; sport extensions later      | No invented metrics; formulas/source/rules version retained             |
| Permissions    | Named role presets, league/team/game assignments                                           | Custom roles from approved permissions                                          | Cannot delegate beyond actor authority; cannot remove last owner        |
| Communication  | Sender display, templates, audience, reminder lead time                                    | SMS, web push, localization                                                     | No arbitrary recipient upload or contact export without permission      |
| Publication    | Names format, photos, rosters, live scores, final stats, archive visibility                | Per-program privacy profiles                                                    | Consent/privacy policy has higher priority than theme settings          |
| Media          | Thumbnail, title, provider video URL, game/season association                              | Managed uploads/transcoding                                                     | Draft/review/publish; visible only after authorization                  |

**CFG-02 - Presets.** Deliver an Al-Hadi-compatible basketball preset and a generic basketball preset. Presets initialize configuration; later preset updates show a diff and never overwrite customer edits automatically.

**CFG-03 - Draft/preview/publish.** Separate saved draft from published version. Public visitors see the published version only. Preview links are staff-authorized or signed, short-lived, and excluded from indexing. Optimistic version checks prevent one editor overwriting another.

**CFG-04 - Impact review.** A change from 28 to 24 capacity with 27 allocated players cannot save as an ordinary edit. The admin receives an explicit conflict list and a separate resolution workflow. Moving a game previews changed times, venue, and recipients. A rules change after final games requires a correction process or a new stage/season.

**CFG-05 - Extensibility.** Use a registry of supported page blocks, field types, eligibility checks, schedule strategies, and sport adapters. New plugins are reviewed platform releases; customers do not execute code. Use schema versions for future migration, not an unrestricted JSON object acting as a database.

**CFG-06 - Pilot form builder.** Support text, email/contact fields with dedicated handling, single-select, multi-select, checkbox acceptance, numeric bounded input, and date where justified. Labels/help text have limits and sanitation. Field keys remain stable across label edits. New required fields do not retroactively invalidate submitted applications without a follow-up task.

**CFG-07 - Escape hatch.** When a customer needs unsupported behavior, add a reviewed reusable capability if commercially justified. Keep temporary operational exceptions explicit, reasoned, permissioned, and audited. “The admin can change anything” is not an acceptable implementation rule.

## 4. Experience and screen inventory

| Surface           | Launch screens                                                                                                                                                       | Essential states                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Public            | Home; schedule; game/box score; teams/rosters; standings; player stats; rules/info; registration entry; media                                                        | Upcoming/in progress/final; unconfigured; no games; postponed; archived; unavailable                    |
| Applicant/player  | Sign-in/verification; application; hosted checkout handoff; registration status; team/schedule; latest game; inbox; preferences                                      | Pending payment/eligibility; paid waitlist; approved/placed; refund pending/complete; denied; withdrawn |
| Commissioner      | Overview; season setup; applications; eligibility; payments/refunds; teams; draft; calendar; game assignment; results/corrections; content/media; messages; settings | Draft/published; stale edit; conflicting rules; failed jobs; permission denied                          |
| Scorekeeper       | Assigned games; pregame roster/lineup; tracker; sync/recovery; submit result                                                                                         | Local pending/server saved; offline; takeover; period end; final review                                 |
| School reviewer   | Eligibility queue; narrow participant details; decision/history                                                                                                      | Approved/needs info/rejected; unresolved duplicates                                                     |
| Platform operator | Organizations; owner recovery; configuration health; billing status; queue failures; support grants; audit; export/deletion jobs                                     | Suspended; provider failure; limited access; support session expired                                    |

**UX-01 - Information hierarchy.** The Al-Hadi public home prioritizes next games, season status, and clear intramural identity. Other templates identify their league/program and expose the appropriate division/competition filters; a multi-program organization gets a useful overview. Admin home prioritizes work requiring action: unresolved payments, eligibility, roster vacancies, schedule conflicts, and unfinalized games. Avoid a dashboard dominated by decorative metrics.

**UX-02 - Existing visual direction.** Preserve the calm Al-Hadi concept: restrained burgundy/gold accents, neutral dark public surfaces, real school photography, light administrative workspace, and readable typography. Themes must remain independent of domain logic. The sales deck's simulated headshots do not authorize production identity/name pairings.

**UX-03 - Mobile.** Support 360 CSS-pixel public/registration layouts. Tables provide a compact view or labelled horizontal region; essential actions do not require hover. Desktop/tablet is the recommended initial scorer layout; validate the actual courtside device before committing. Phone scoring needs an explicitly tested layout, not just squeezed columns.

**UX-04 - Accessibility.** Adopt WCAG 2.2 AA as the target: keyboard operation, visible focus, names/labels, error summaries linked to fields, sufficient contrast, zoom/reflow, reduced motion, non-color status cues, and accessible dialogs. Scoring button targets should be at least 44×44 CSS pixels as a product usability target; the full UI still requires accessibility review. [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/).

**UX-05 - Feedback.** Show loading, empty, validation, denied, offline, and retry states. “Saved” means server acknowledgment for authoritative actions. Mark optimistic changes as pending. Never show a fake success toast for a failed mutation.

**UX-06 - Forms.** Autosave drafts when signed in, preserve user input on validation errors, use explicit review before payment, and explain the difference between paid and accepted. Checkout handoff must return to a status screen that reconciles server state.

**UX-07 - Discovery.** Provide shareable stable URLs, semantic page titles, season labels, social preview metadata without private fields, and redirects for renamed public slugs. Public URLs use public identities. Private account/registration IDs must not appear in social previews or analytics.

**UX-08 - Admin usability.** Bulk actions show selected count, scope, effect, and failures per row. Dangerous actions preview impact and require a reason or fresh authentication as appropriate. Avoid forcing confirmations on every harmless edit. Use revision recovery for content and explicit corrections for official records.

**UX-09 - Onboarding.** A checklist moves through identity → roles → season/rules → registration/policies → payments → schedule → public preview → publish. Each task has a readiness check. A league cannot open paid enrollment with an unconfigured merchant or missing refund policy.

## 5. Product scope tiers

**Pilot:** one basketball season and default competition; multi-workspace ownership and competition-scoped records; Al-Hadi individual enrollment, school review, upfront payment/waitlist/refunds, host draft, approved round-robin/playoff preset, game/training calendar, durable live points/minutes, public pages/media, participant account/inbox, email, and audit/recovery/export. These are the selected pilot workflow, not mandatory platform-wide steps.

**Independent-league release:** self-service setup with verified owner; multiple simultaneous competitions; team entry and authorized roster import; free or supported paid-entry modes; optional draft; score-only and box-score capture alongside live scoring; small supported bracket catalog; page composition; first reusable trophy/award module; customer merchant setup; agreed platform billing; exports and migration aids. Custom domains follow a tested ownership/certificate lifecycle.

**Multi-program and network releases:** richer team/family enrollment, memberships/credentials, delegated institutional administration, affiliation/sharing, qualification across competitions, alignment versions, review/appeal processes, officials management, contracted integrations/SSO, enterprise operations, and additional sports. Sequence by demand and the acceptance fixtures in chapter 07. Push/SMS, managed video, trades, and advanced optimization remain optional expansions. “Later” means unimplemented until its gate passes; it does not permit ignoring its ownership contract now.

## 6. Product acceptance examples

- A second organization changes brand, roster size, registration rules, and schedule without a developer edit; the first organization's experience is unaffected.
- A commissioner previews a color/page change and publishes a version; private registration fields never appear in a public page block.
- An admin editing stale settings receives a conflict and can compare revisions.
- Lowering capacity below existing allocations shows a resolution task; it does not evict students silently.
- A keyboard-only applicant completes signup and understands whether payment guarantees a place.
- A completed season remains readable after the new season's teams and rules change.

## 7. Shared-product contracts added by the fit review

**BIZ-07 - Independent organizer setup.** Before selling self-service, prove verified owner signup → idempotent workspace creation → template/module selection → brand/pages → competition/admission rules → merchant or no-payment mode → readiness preview → publication. Resume incomplete setup; handle duplicate names/slugs, failed invitations, unpaid platform subscription, and abandoned trials. Workspace identity stays stable when its plan changes. A free competition must not require a participation-payment merchant.

**CFG-08 - Website composition.** Admins can select supported page templates; add/reorder/remove permitted sections; edit navigation, copy, hero media/focal point, logos, typography/palette presets, sponsors, trophies, fixtures, standings, and media blocks. Each block declares schema/version, permitted data scope, audience, responsive behavior, and dependencies. Preview phone/desktop, compare revisions, and publish atomically. Optional module removal must repair navigation/placeholders. Empty-content states look intentional. Organization overview, league, competition, team, and player pages have appropriate templates; essential policies and privacy controls remain enforced. This is a concrete composition editor, with its supported block catalog agreed before implementation.

**CFG-09 - Module lifecycle.** An optional module has stable key/version, entitlement, dependencies, typed configuration, data owner, permissions, routes/blocks, commands/events, migrations, quotas, export/retention, and enable/disable/upgrade behavior. The platform owns module code and releases; activation never runs customer-supplied code. Disabled modules leave valid historical records, cancel or fence pending jobs as specified, and do not grant permissions or leak data. Compatibility and rollback are reviewed with core releases. Distinguish operational rollout flags from paid entitlements and from customer settings.

**CFG-10 - Customer feature requests.** Classify requests as existing configuration, new reusable block/module, integration, or unsupported scope. Agree acceptance, price, maintenance owner, supported lifetime, and upgrade behavior before custom development. Faraj trophies are the first extension design example: configurable types/art, grants/history, permitted recipients, manual or supported computed criteria, and cabinet blocks. Discover the exact Faraj behavior before claiming parity. Use the same module in another synthetic league with different settings; no `if customer == Faraj` logic in core workflows.
