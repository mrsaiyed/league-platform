# 03 — Configurable administration and website composition

[Engineering map](README.md) · Refines CW-01–06, PB-04–06, SP-02, ME-06

## E-CONFIG-01 — What maximum customization means

An organizer controls identity, page composition, enabled features, supported competition rules, registration workflow, staff responsibilities and the presentation of approved data. The platform supplies validated building blocks and business operations. We do not execute customer JavaScript, SQL, unrestricted CSS or arbitrary server plugins in the core release.

There are four distinct configuration surfaces:

1. **Website editor:** public theme, content, page layout, navigation and sports blocks.
2. **League settings:** registration, formation, competition, schedule, publication and communication rules.
3. **Staff administration:** role presets/custom roles, scope assignments and workflow queues.
4. **Personal workspace:** each staff member's saved filters, visible columns, pinned navigation and dashboard widgets.

Changing personal navigation does not change permissions. Changing a role cannot enable a feature outside the plan. Enabling a module cannot override publication policy. A theme is a versioned site configuration, not a customer-specific application fork.

## E-CONFIG-02 — Admin information architecture

Routes are relative to `/app/w/{workspaceId}`. Every screen has an authorized server loader and action-level mutation checks. Hide irrelevant scope selectors for a single league/competition; keep the same underlying resource IDs.

| Screen / route               | Main controls and records                                                                     | Required UI states / gate                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `overview`                   | Readiness checklist, upcoming games, approval/payment/result tasks; configurable widget order | New workspace empty state; task counts limited to authorized scope                    |
| `leagues` and `leagues/{id}` | League identity, seasons, competitions, copy selected template                                | Confirm what copies; no copying payments/accepted consent                             |
| `website`                    | Page tree, canvas, block inspector, theme, navigation, desktop/mobile preview                 | Draft/saved/conflict/published state; preview visibility; publish validation          |
| `registrations`              | Filtered applications, review detail, capacity/waitlist, offers                               | Separate payment/eligibility/admission badges; no ambiguous “approved” for all states |
| `people`                     | Participants, account relationships, restricted profile fields                                | Field permissions; duplicate review; publication status                               |
| `teams`                      | Team identity, competition entries, roster dates, captains                                    | Ineligible/duplicate/over-capacity explanations; move preview                         |
| `draft`                      | Approved pool, board, pick history, host lease                                                | Read-only observer; pending pick; disconnected; takeover/reversal                     |
| `competition`                | Format, stages, rules, tiebreakers, advancement                                               | Before/after impact; locked historical rules; supported combinations                  |
| `schedule`                   | Calendar/list, resources, hard/soft constraints, draft generation                             | Constraint report, unscheduled games, stale input, publish diff                       |
| `games/{id}`                 | Assignment, game readiness, final result/revision history                                     | Live/submitted/finalized/special outcome; correction reason                           |
| `score/{gameId}`             | Courtside scoreboard, lineups, clock and event queue                                          | Large controls, acknowledged/pending distinction, lease/offline recovery              |
| `media`                      | Photos, approved video links, featured items                                                  | Upload/quarantine/rejected/approved/withdrawn; rights/publication fields              |
| `communications`             | Announcement drafts, audience preview, inbox/email outcomes                                   | Estimated eligible recipients; queued/sent/failed/superseded                          |
| `finance`                    | Orders, attempts, refunds, reconciliation; separate SaaS plan area                            | Unknown provider state; partial refund; no sensitive eligibility fields               |
| `settings/access`            | Invites, presets/custom roles, scope assignments                                              | Last-owner guard, privileged MFA, grant-change audit                                  |
| `settings/modules`           | Available, entitled, enabled, configuring/ready/degraded modules                              | Explain unmet dependencies; preview disable consequences                              |
| `history` and `exports`      | Archived seasons, authorized export jobs and download expiry                                  | Preparing/ready/expired/failed; clear scope and redaction                             |

Proposed admin widgets: setup checklist, upcoming games, registration queue, waitlist, unresolved results, reconciliation exceptions, delivery failures and recent authorized changes. Default layout is role-specific. A saved view contains filter/sort/column identifiers; no raw query language. Server ignores requested columns the actor cannot read. Mobile administration uses cards/detail drawers where a wide table would hide essential actions.

## E-CONFIG-03 — Website editor interaction contract

Desktop: left page/block tree, center preview canvas, right selected-block inspector; top bar has scope, draft status, viewport preview, history and publish. Mobile: page list → block list → focused inspector, with a separate preview action; never require drag-and-drop to reorder. Provide move up/down, duplicate, hide and delete controls usable by keyboard.

Autosave starts after 800 ms idle and on explicit Save, with one save in flight. Save against the last acknowledged draft revision. An edit made during the request remains dirty and saves afterward. A stale revision returns a conflict with reload/compare/duplicate-draft options; it must not silently replace another editor's work. Leaving with unacknowledged edits shows a warning. “Saved” appears only after server acknowledgment. Crash recovery can store a bounded local draft without contact/eligibility data, scoped to account/site and cleared on logout.

Undo/redo is local to the draft editing session; proposed history limit 50 operations. Published rollback creates a **new** release copied from a previous valid release. It revalidates current policy, assets and module versions. It never rewinds orders, games, role grants or removed consent.

## E-CONFIG-04 — Page schema and component registry

Initial page types: `home`, `schedule`, `standings`, `statistics`, `teams`, `media`, `registration`, `information`, `awards`, `season-archive`. Most are templates composed of blocks, not hardcoded customer routes. Registration blocks launch the platform workflow; the content editor cannot redefine the payment command.

Each block is a discriminated union with stable `id`, `type`, `version`, validated `props` and optional approved layout properties. Templates reference registered blocks. Block code owns a props schema, editor control definition, public renderer, required module, data query descriptor, migration and accessibility examples.

```ts
type BlockDefinition<Props> = {
  key: string;
  version: number;
  propsSchema: RuntimeSchema<Props>; // concrete implementation: Zod schema
  requiredModule?: string;
  allowedDataSources: readonly string[];
  render: PublicBlockComponent<Props>;
  editor: InspectorDefinition<Props>;
  migrate: (oldVersion: number, oldProps: unknown) => Props;
};
```

`RuntimeSchema`, `PublicBlockComponent` and `InspectorDefinition` are named conceptual interfaces here; the implementation must define/import them and compile the registry. Never accept a renderer/module import path supplied by a customer. Registration into the registry requires reviewed platform code.

Example persisted site document (asset/resource IDs are illustrative):

```json
{
  "schemaVersion": 1,
  "theme": {
    "preset": "courtside-light",
    "colors": {
      "brand": "#8C2338",
      "accent": "#B85B2D",
      "surface": "#FFFFFF",
      "background": "#F6F4EF",
      "text": "#18252D"
    },
    "fontPreset": "system-sans",
    "radius": "medium",
    "contentWidth": "wide",
    "density": "comfortable"
  },
  "navigation": [{ "pageId": "home", "label": "Home" }],
  "pages": [
    {
      "id": "home",
      "slug": "",
      "title": "Home",
      "visibility": "public",
      "blocks": [
        {
          "id": "hero-1",
          "type": "hero",
          "version": 1,
          "props": {
            "heading": "Your league. Your court.",
            "layout": "split",
            "assetId": "1b3159a2-5c74-4310-b152-c7fcb95af715",
            "focalPoint": { "x": 0.5, "y": 0.4 },
            "action": { "kind": "page", "pageId": "schedule" }
          }
        },
        {
          "id": "fixtures-1",
          "type": "fixtures",
          "version": 1,
          "props": {
            "competitionId": "ef79fd42-f763-42ef-82e9-6b9516831ef3",
            "mode": "upcoming",
            "limit": 4,
            "layout": "cards"
          }
        }
      ]
    },
    {
      "id": "schedule",
      "slug": "schedule",
      "title": "Schedule",
      "visibility": "public",
      "blocks": [
        {
          "id": "fixtures-2",
          "type": "fixtures",
          "version": 1,
          "props": {
            "competitionId": "ef79fd42-f763-42ef-82e9-6b9516831ef3",
            "mode": "all",
            "limit": 20,
            "layout": "list"
          }
        }
      ]
    }
  ]
}
```

The example is valid composition, not evidence that its referenced assets/competition exist. The server resolves ownership, approval and visibility before allowing publication. Internal links use page IDs, not fragile copied slugs. External links require an approved HTTPS scheme and safe rendering. Unknown keys are rejected to prevent mass assignment; unsupported future schema versions are not guessed.

## E-CONFIG-05 — Initial block catalog and limits

| Block                | Configurable properties                                                 | Data and constraints                                                                |
| -------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Hero                 | Split/full image, heading/subtitle, alignment, focal point, two actions | Approved asset; heading 100 chars; subtitle 240; contrast overlay validated         |
| Rich text            | Headings, paragraphs, lists, approved links                             | Structured document; 10,000 chars; no script/style/iframe/raw HTML                  |
| Image / gallery      | Caption, crop/fit, alt text, grid/strip                                 | 1–12 approved images; meaningful alt or explicit decorative flag                    |
| Journey / timeline   | Up to 12 labeled milestones with images and text                        | No fabricated dates; optional year labels; editorial content                        |
| Announcement list    | Scope, count, compact/cards                                             | Published announcements only; 1–10                                                  |
| Registration callout | Label, description, competition                                         | Computed open/closed/waitlist state; cannot claim a guaranteed place                |
| Fixtures / results   | Competition/stage/team filter, upcoming/recent/all, cards/list          | Published safe game summaries; 1–20 initial page; pagination for more               |
| Standings            | Competition/stage, columns, compact/full                                | Registered public columns; one coherent projection revision                         |
| Player leaders       | Metric, competition, count, photos on/off                               | 3–20; approved identities/photos; metric coverage labels                            |
| Teams / rosters      | Grid/list, competition, roster visibility                               | Per-person publication policy overrides editor choice                               |
| Bracket              | Stage, compact/full                                                     | Published stage slots/results; accessible textual alternative                       |
| Media                | Featured full game, highlight grid, filter                              | Registered provider video IDs or approved assets; no autoplay with sound            |
| Awards cabinet       | Period/category, display style, count                                   | Awards module required; 1–24; valid published grants                                |
| Sponsors             | Logos, labels, approved links, grid                                     | 1–12; disclosure/market policy validation                                           |
| Information / FAQ    | Question/answer list, accordions                                        | Up to 20; keyboard accessible; safe rich text                                       |
| Contact / footer     | Public contact/social links, policies                                   | No automatic exposure of staff private email/phone; mandatory policy links retained |

Proposed first editor bounds: 25 pages/site, 30 blocks/page, 12 primary navigation items, nesting depth at most 2, 512 KiB document JSON, 2 MiB API request maximum for non-upload transport. Standard API writes use the lower endpoint limit in section 04. No recursive block-within-block system initially. These protect usability/render cost, not permanent commercial ceilings. Quotas can increase after measured validation.

There are two levels of visual control: presets for quick setup and individual semantic tokens/section variants for detail. Tokens include brand/accent/surface/text/border, approved heading/body font pair, content width, spacing density, border radius and button treatment. Do not permit arbitrary pixel positioning that breaks mobile layout. Theme validation covers contrast, focus treatment and readable live-table states. Store no untrusted stylesheet text. Approved fonts are bundled/self-hosted or explicitly reviewed for privacy/performance.

## E-CONFIG-06 — Setting definition and resolution

Every setting definition includes `key`, `schemaVersion`, `valueSchema`, `default`, `allowedScopes`, `editPermission`, `impact`, `dependencies`, `lockedByPolicy`, `migration`, and `helpText`. Help text explains consequences in league language. `impact` is one of `immediate`, `nextPublication`, `newApplication`, `newGame`, or `requiresMigration`.

Resolution order is deliberate:

1. Platform safety/operating constraints and capability entitlement are enforced.
2. Applicable governing policies are intersected; conflicting mandatory rules block readiness.
3. Defaults → workspace → league → competition → supported stage/game overrides are applied only where each definition allows that scope.
4. Validate the complete effective configuration, including cross-setting constraints.
5. Save a version/hash and bind it to new applications, games or site publications as appropriate.

The effective-setting API returns `{key, value, sourceScope, sourceVersion, locked, reason, impact}`. The admin can see why a value is locked. A game does not query today's mutable rule settings every time an old event replays.

| Setting                           | Type / proposed default                                             | Allowed scope and change behavior                                                    |
| --------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `league.timezone`                 | Valid IANA zone; organizer chooses during setup                     | League; changing display zone does not shift existing UTC fixtures                   |
| `registration.entryMode`          | `individual` / `team` / `invite`; setup selection required          | Competition; new applications; cannot reinterpret existing subjects                  |
| `registration.openAt/closeAt`     | Nullable UTC timestamps                                             | Competition; validate order; recheck on submit                                       |
| `registration.reviewRequired`     | Boolean, default false                                              | Competition; existing pending reviews resolved explicitly                            |
| `registration.formFields`         | Versioned list, max 40 fields                                       | Competition; immutable submitted schema; sensitivity classification required         |
| `registration.capacity`           | Integer >= 1 when limited; explicit unlimited mode                  | Competition/pool; cannot set below allocated + held without resolving holds          |
| `registration.waitlistEnabled`    | Boolean, default true for limited capacity                          | Pool; disabling cannot delete active queue/refund obligations                        |
| `registration.waitlistOrder`      | `submittedOrder` or reviewed priority buckets                       | Pool; changes require queue preview and audit                                        |
| `payments.mode`                   | `none`, `onApplication`, `onOffer`, `offlineRecorded`; default none | Competition; onApplication permits paid waitlist only with separate disclosed policy |
| `payments.priceMinor/currency`    | Bounded integer + approved currency                                 | Competition; applies only to new orders                                              |
| `payments.paidWaitlist`           | Boolean, default false                                              | Competition; merchant readiness, cap, refund deadline and disclosure required        |
| `teams.formationMode`             | `manual`, `teamEntry`, `hostedDraft`                                | Competition; selected combinations validated                                         |
| `teams.rosterMin/Max`             | Integers 1–100; sport template supplies starting values             | Competition; lowering triggers violations to resolve, never silent removal           |
| `teams.multiEntryPolicy`          | `oneActiveEntry` default / allowed scopes                           | Competition; affects transfers and player eligibility                                |
| `competition.format`              | Registered format/version; round robin or single elimination first  | Stage; lock when dependent games become official                                     |
| `competition.tiebreakers`         | Ordered registered comparator list                                  | Competition/stage; correction/rebuild impact required midseason                      |
| `basketball.periods/durationMs`   | Validated sport preset                                              | Competition/game before ready; game snapshot freezes values                          |
| `basketball.overtime`             | Registered policy + positive period duration                        | Same as rules; no arbitrary formula text                                             |
| `games.captureMode`               | `finalScore`, `boxScore`, `live`; finalScore initial default        | Competition/game; downgrade records coverage loss explicitly                         |
| `schedule.minimumRestMinutes`     | Integer 0–1440                                                      | Competition; hard/soft choice explicit and disclosed                                 |
| `schedule.gameSlotMinutes`        | Integer 5–360                                                       | Competition; includes defined buffers; affects new generation                        |
| `schedule.blackouts`              | Bounded resource intervals                                          | Resource/competition; conflicts surfaced before publication                          |
| `publication.liveScores`          | Boolean; default off until configured                               | Competition; does not publish player personal fields implicitly                      |
| `publication.playerName`          | `hidden`, `firstNameInitial`, `fullName`                            | Person policy and market constraints override league default                         |
| `publication.playerPhotos`        | Boolean, default off pending valid publication authority            | League/competition; individual restrictions always win                               |
| `notifications.reminderLeadHours` | List 1–168, max 3; initially `[24]` when reminders enabled          | Competition; opt-in/out and essential notice policy applied                          |
| `website.theme/pages/navigation`  | Typed document described above                                      | Site draft → publication; prior records unchanged                                    |
| `admin.savedViews`                | Filter/sort/column schema, max 20/user/scope                        | Account personal settings; cannot expand access                                      |
| `modules.awards.enabled`          | Boolean, default false                                              | Supported scope; only usable after entitlement/dependency/readiness checks           |

“Default” is a proposed product preset, not a rule inherited from any school. Exact basketball presets and supported mode combinations receive acceptance fixtures before release. Limits beyond the verified operating envelope are rejected with a clear explanation, not accepted and silently truncated.

## E-CONFIG-07 — Publication transaction and cache safety

Publish performs: authenticated editor + `website.publish` permission → lock site/draft → compare expected revision → validate schema, links, assets, module readiness and public data policy → create immutable release → write safe published site document → switch active release pointer → audit/outbox → commit. Roll back all writes on failure.

A prepublish check outside the transaction may improve UI responsiveness, but authoritative checks run again against the version being committed. Every blocked item identifies page/block/field and a repair action. Normal cache refresh is asynchronous and revisioned; a privacy withdrawal denies new origin reads immediately and starts priority CDN purge. Person-bearing content has at most a 60-second shared-cache lifetime and cannot use stale-on-error fallback after expiry. Renderers must not deliberately fall back to an older blocked release; already delivered content cannot be recalled from viewers' devices. Capture visibility versions during publish and recheck/lock affected publication-policy records so concurrent withdrawal cannot republish a newly restricted asset/person.

Preview endpoints require the editor's current access, return `Cache-Control: private, no-store` and `noindex`. A shareable review link, if added, is scoped to one site revision, expires within 24 hours, is revocable and displays only public-safe preview content. It does not show applicant data or act as staff login.

## E-CONFIG-08 — Module manifest and lifecycle

Example supported extension contract:

```json
{
  "key": "awards",
  "version": "1.0.0",
  "configSchemaVersion": 1,
  "dependencies": ["people", "competition", "statistics"],
  "permissions": ["awards.configure", "awards.grant", "awards.publish"],
  "adminRoutes": ["awards"],
  "publicBlocks": ["awards-cabinet"],
  "subscribedEvents": ["game.result-finalized.v1", "game.result-corrected.v1"],
  "exportKinds": ["award-definitions", "award-grants"],
  "disablePolicy": "stop-new-grants-preserve-history"
}
```

The actual registry also supplies handlers, validation/migrations, quota costs and operational health checks from trusted source code. The JSON declares capability; it cannot name a customer-loaded executable. Product module version, config schema version, event version and database migration version are distinct.

Lifecycle: available → entitled → configuring → ready/enabled → disabled or degraded. Entitlement belongs to commercial packaging; enablement to the organizer; rollout/kill switch to the platform. `usable = entitled AND enabled AND dependenciesReady AND rolloutAllowed`. An installed module does not itself grant any role permission.

Disabling awards previews affected navigation/blocks and jobs, stops new automatic grants, removes/pauses public blocks according to the selected policy, and preserves grant history/export. Re-enabling is idempotent. A kill switch stops unsafe execution promptly and displays a clear unavailable state; it must not erase data. An upgrade migrates cloned configuration, validates it, then switches version; failed validation leaves the prior supported version active or safely disables the affected feature.

## E-CONFIG-09 — A unique trophy feature without a custom codebase

League A wants standard season MVP and champion awards. League B wants a named recurring trophy with its own artwork, qualification rule and historical winners. Both store award definitions, asset references, eligible periods, grant records and cabinet layout in the same tables. Supported computed criteria are an allowlisted rule AST (`metric`, comparator, threshold, period), never `eval` or customer SQL.

If League B requests a rule outside the registry, engineering evaluates a reusable rule implementation with tests, permissions, migration, cost and disable behavior. A genuinely new interaction may add a reviewed block or module. It must not introduce `if (workspaceSlug === "league-b")` throughout core. This is where specific feature requests fit the platform business.

## E-CONFIG-10 — Acceptance evidence

Publish a restrained light site with a team photo and a very different dark tournament site with bracket-first navigation from one deployed release. Configure one with individual signup/manual approval and one with team entry/no review. Save two staff layouts without affecting each other's permissions. Enable trophies in only one site. Upgrade its config and disable/re-enable it without losing history. Race two editors and prove the stale writer cannot overwrite. Attempt a private asset/cross-workspace competition reference, unsafe URL, invalid contrast and unknown block; publish must fail with field-level errors. Verify keyboard/mobile use without dragging and test rendering at 360 px and 200% zoom.
