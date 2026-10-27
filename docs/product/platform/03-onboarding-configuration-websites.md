# 03 — Onboarding, configuration, and websites

[Specification map](README.md) · Status: proposed experience contract · Decisions: D-07–D-08

**Detailed engineering contract:** [Admin and customization specification](engineering/03-admin-and-customization.md) defines screens, editor behavior, page JSON, block catalog, setting defaults and module lifecycle.

## Self-service and surfaces

**CW-01 — Setup.** Verified organizer signup creates/reuses an account, establishes a workspace owner, selects a supported sport/template, configures competition and admission, chooses modules and website content, connects payments only when needed, previews readiness, and publishes. Provisioning is idempotent; interrupted setup resumes. Staff-assisted onboarding calls the same operations. Trials, duplicate slugs, abandoned setup, domain verification, and plan failures have explicit states.

The product has five surfaces: public website; participant/guardian account area; organizer/staff workspace; courtside scorer; restricted platform support console. An organization overview can link several leagues/competitions. Simple organizers see only the scope selectors they need. Admin home emphasizes unresolved work rather than decorative statistics.

## Customization inventory

| Family         | Proposed controls                                                       | Required safeguard                                                |
| -------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Identity       | Name, logo, palette, font preset, hero image/crop, contact/social links | Validated assets, contrast and permission                         |
| Composition    | Page template, section order, navigation, custom information pages      | Supported block schema; essential disclosures cannot be hidden    |
| Sports content | Fixtures, rosters, tables, leaders, brackets, trophy cabinets           | Approved projection and explicit competition filter               |
| Enrollment     | Entry mode, fields, capacity, eligibility, waitlist, price/policies     | Versioned form/terms; existing applications retain accepted terms |
| Competition    | Roster sizes, categories, formats, clock/rules presets, tiebreakers     | Supported combinations, effective versions, history protection    |
| Operations     | Facilities, schedule constraints, staff, capture mode, notices          | Permission scopes, preview impacts, audit                         |
| Publication    | Public/private sections, name format, photos, live/final visibility     | Applicable privacy/consent and governing policy win               |
| Extensions     | Awards, editorial rankings, sponsors, optional feature blocks           | Manifest, dependencies, module permissions and lifecycle          |

**CW-02 — Publish contract.** Editing changes a draft. Preview on mobile/desktop, validate dependencies and data exposure, compare changes, then atomically publish a revision. Stale edits conflict. Provide recovery of prior content versions without reverting financial or official sporting records. Private preview links require access or short-lived purpose-scoped tokens and do not grant general private-data access.

**CW-03 — Configuration semantics.** Each setting records type, bounds/default, owner/scope, dependencies, permitted overrides, effective time, impact rule, and migration. Resolve platform constraints/entitlements, applicable mandatory governing policies, then allowed workspace/program/competition/stage/game settings. Conflicting mandatory policies block readiness. Lowering capacity below allocated places creates a resolution task; it cannot silently evict participants.

**CW-04 — Extension contract.** Modules declare key/version, config schema, permissions, records, routes/blocks, events, dependencies, migrations, quotas, export/retention, upgrade and disable behavior. Customers configure supported modules; platform-owned code runs them. Disabling an award module stops new grants/jobs as specified and manages public blocks while preserving required history. Keep pricing entitlement, rollout flag, and customer enablement distinct. A requested feature must work through a supported extension point without hard-coded customer names.

**CW-05 — URLs and discoverability.** Stable organization/league/competition URLs, approved social metadata, archive links and slug redirects. Custom domains later require ownership verification, safe hostname routing, certificate renewal, collision checks and cleanup on exit. Hostname selection is not authorization. Decide indexing for optional profiles and minors through privacy policy; private forms/inboxes are never searchable publicly.

**CW-06 — Usability.** Plan responsive registration/public views down to 360 CSS pixels; keyboard access, visible focus, labels, error summary, contrast, zoom/reflow, reduced motion, and non-color status cues. Adopt WCAG 2.2 AA as a proposed accessibility target and verify against the standard during detailed design. Use large court-side controls and test real devices. Show loading, empty, pending, rejected, offline, conflict and recovery states. “Saved” means acknowledged persistence for authoritative operations.

## Acceptance and detail to settle

Two leagues publish different homepages/navigation from one codebase. One enables trophies; another disables the module without broken links. A free competition completes setup without a merchant. A draft page cannot leak private application answers. A keyboard-only applicant can finish a supported application.

The engineering customization contract now supplies the screen map, 16-block catalog, theme/page schemas, setting definitions/defaults, editor states and module lifecycle. Implementation still requires detailed visual wireframes, compiled schemas, domain verification automation and recorded usability/accessibility evidence. D-07 reviews this concrete proposal; arbitrary customer code remains outside the proposed editor.
