# 13 — Decisions, roadmap, and specification completion

[Specification map](README.md) · Status: active planning process · Varsity scoring first; no committed launch date

**Detailed engineering contract:** [Engineering specification v0.7](engineering/README.md) supplies concrete implementation recommendations. [Build work packages and evidence](engineering/08-build-plan-and-evidence.md) complement the product gates below.

## How we will finish the specifications

The product sections define intended behavior; the engineering package supplies a concrete proposed implementation. Review both in the following order, then produce executable artifacts and evidence for the approved workflow. The founder owns priorities and product policy; engineering owns technical evidence and communicates risks; qualified advisers resolve jurisdictional/commercial obligations where needed. Assign actual people before launch.

| Review                           | Sections                         | Required output before moving to implementation detail                                               |
| -------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A. Product contract              | 01, master                       | First segment/sport, core offer, supported combinations, business responsibilities, success measures |
| B. Ownership and trust           | 02, 04, 12 structural boundaries | Domain diagram, authority model, identity/privacy boundaries, threat model                           |
| C. Organizer experience          | 03 with 01/02                    | Setup flow, page/block catalog, settings dictionary, module lifecycle, screen states                 |
| D. Entry and money               | 05–06                            | State diagrams, capacity policy, merchant/funds flow, field/consent matrix, refunds and billing      |
| E. Sporting operations           | 07–08                            | Format/rule catalog, schedule constraints, result modes, scorer protocol, stat formulas              |
| F. Participant/public experience | 09 with 03/04                    | Audience/template matrix, media/award publication, personal-area wireframes                          |
| G. Engineering and operation     | 10–11, reviewed throughout A–F   | Stack ADR, executable schemas, transactions/migrations, test/release/recovery plan, cost model       |
| H. Expansion readiness           | 12 and reference fixtures        | Network/institution contracts and workload/enterprise gates; no premature readiness claim            |

Reviews can expose changes to earlier assumptions. Update affected contracts deliberately. Record each item as proposed, approved, revise, deferred or rejected with owner, date, rationale and links. Approval of one feature does not approve every dependency or an unrelated commercial term.

## Decision register

| ID   | Decision                                 | Starting recommendation / open issue                                                                                      | Dependency                            |
| ---- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| D-01 | First product segment                    | Independent organizers; no named customer assumed                                                                         | Product scope and discovery           |
| D-02 | First sport and launch capability matrix | Basketball proposed; agree supported enrollment/payment/competition/capture combinations                                  | Estimates and marketing claims        |
| D-03 | SaaS pricing and lifecycle               | Evaluate subscription/per-season and optional module tiers; trial/grace/export policy open                                | Billing and entitlements              |
| D-04 | Business and merchant roles              | Organizer operates league; separate software subscription and participation seller                                        | Terms and finance design              |
| D-05 | Ownership model                          | Workspace, institution, affiliation and scoped authority separate                                                         | Base identity/data design             |
| D-06 | Competition/identity schema              | Explicit entries, lifetime team/person relationships and effective snapshots                                              | First competition migration           |
| D-07 | Website/editor scope                     | 16-block starting catalog, theme tokens, page schema and editor states specified; breadth subject to review               | Public/admin wireframes               |
| D-08 | Customization and extensions             | Versioned platform-owned modules; request pricing/maintenance policy                                                      | Module implementation                 |
| D-09 | Auth/session/roles                       | Supabase SSR/PKCE proposed; live scoped grants, MFA, CSRF and recovery specified; provider spike required                 | Private access                        |
| D-10 | Supported markets and privacy            | Determine ages/jurisdictions, consent/publication and retention requirements                                              | Real participant data                 |
| D-11 | Initial enrollment modes                 | Individual, team, invite/import paths proposed; release only tested combinations                                          | Forms and readiness checks            |
| D-12 | Admission/waitlist policies              | Free/unpaid flow distinct; paid waiting optional with cap/refund disclosure                                               | Capacity transactions                 |
| D-13 | Payment provider/account model           | Connected customer merchants, hosted checkout; countries/currencies/charge flow open                                      | Paid enrollment                       |
| D-14 | Refund/dispute/fee rules                 | Versioned policy; reserve balance; name liabilities and support owner                                                     | Checkout disclosure and finance tools |
| D-15 | Team formation                           | Manual/team entry plus optional hosted draft; captain/transfer rules open                                                 | Roster/draft design                   |
| D-16 | Competition formats/rules                | Round robin and single elimination proposed; precise tie/bye/forfeit rules                                                | Brackets and standings                |
| D-17 | Schedule/resource scope                  | Shared resources in one workspace; external booking integration later                                                     | Generation/publication                |
| D-18 | Result-capture launch scope              | Final score and box score; live basketball through a separate rehearsal gate                                              | Scorer budget and release claims      |
| D-19 | Basketball and statistics contract       | Clock/period/lineup/special-outcome rules and complete/partial metric definitions                                         | Authoritative scoring                 |
| D-20 | Notifications                            | Inbox plus selected transactional email; audience/reminder policy open                                                    | Real delivery                         |
| D-21 | Media/awards/content                     | Provider video links, approved photos, reusable awards module; exact scope open                                           | Publication and module catalog        |
| D-22 | Application stack                        | Next/React, strict TypeScript, PostgreSQL/Supabase, typed SQL and separate worker recommended; validate versions/provider | Production scaffold                   |
| D-23 | Hosting/providers/regions                | Written usage/budget and data-handling assessment                                                                         | Infrastructure purchase               |
| D-24 | Reliability and load targets             | Three proposed workload envelopes and measurable budgets specified in engineering 07; benchmark before commitment         | Release commitment                    |
| D-25 | Backups, retention, and recovery         | Database plus object backup, restore/reconciliation and erasure replay                                                    | Reliance on real records              |
| D-26 | Support, releases, and cost              | Owners, game coverage, incident response, update cadence and margin targets                                               | Public sale                           |
| D-27 | Affiliated-network contract              | Explicit sharing/delegation; institutional workflow discovery                                                             | Cross-workspace capability            |
| D-28 | Governance and additional sports         | Versioned policies, qualification, credential/case workflows and sport adapters                                           | Expansion estimates                   |
| D-29 | Enterprise offer                         | Contractual identity/integrations, migration, capacity, security/support evidence                                         | Institutional sales promise           |

## Delivery sequence after section approval

**October 27 priority update:** Al-Hadi varsity scoring precedes the full league offer. The shared product promise and large-league design remain unchanged. The local rehearsal and private shared-SQL pilot are implemented; broader game-day resilience and platform readiness remain gated. See the [active initiative](../../initiatives/alhadi-varsity/README.md).

**Gate 0 — Agree the product contract.** Resolve the first segment, supported-mode matrix, ownership/security boundaries and merchant responsibilities for planned paid features. Produce wireframes, a schema/command slice, threat cases and an estimate with explicit dependencies. Review later network fixtures as architectural checks, not an instruction to build federation tools now.

**Gate 0A — Persistent scoring rehearsal.** Build saved roster → opponent setup → lineups/clock/scoring → final box score → automatic season totals. Use synthetic practice records and defer real roster/fixture inputs. Prove atomic persistence, exact durations, lost-response retry, finalization/correction and practice exclusion.

**Gate 0B — Hosted team game-day release.** Add authenticated identity/game assignments, production team-season/external-competition scope, RLS, scorer lease/takeover/offline recovery, verified sport rules/minute correction, safe publication and tested backup/restore. This gate uses selected foundation/live-operation work before the website builder, enrollment or money.

**Gate 1 — Self-service foundation.** Build verified organizer → workspace/roles → competition template → configurable public site → readiness/publish. Prove two-tenant isolation, safe projections, setup recovery and content versioning. A useful synthetic free competition can exercise the product without collecting live fees.

**Gate 2 — Complete a basic season.** Add authorized team/roster entry, supported formats, schedule editing/publication, score/box-score results, standings, notifications and archive/export. Run a full season scenario and correction. This is a constrained alpha; do not advertise unsupported payment, draft or live-tracker behavior.

**Gate 3 — Enrollment and money.** Deliver the chosen individual/team application modes, eligibility/admission, capacity/waitlist and supported merchant/payment/refund paths. Rehearse concurrent allocation, provider uncertainty, rejected/withdrawn applications, disputes and reconciliation. Approve policies and restore evidence before live collection. This gate may run in parallel with independent sporting work after contracts are stable.

**Gate 4 — Live operations and extensions.** Extend the validated courtside core to league-hosted games and implement the selected draft, optional trophies/media and expanded configuration. Pass full game/offline/takeover/final-correction rehearsals on supported devices. Prove a module can be configured differently by two leagues and disabled without corrupting history.

**Gate 5 — General independent-league release.** A new organizer completes supported setup/workflows without developer provisioning. Pass the launch capability matrix, negative access tests, accessibility/device checks, restore and provider tests. Publish supported limits, support/exit terms and measured costs. Expand beyond the initial team-scoring use case to beta leagues with explicit supported configurations.

**Gate 6 — Multi-program and institutional expansion.** Add validated concurrent programs, affiliations, governing workflows and integrations as needed. Use separate structural/performance/contractual gates for networks and large organizations. Same codebase, supported configuration and explicit authority; no claim that small synthetic fixtures certify statewide operation.

## Reference scenarios with no named customer

| Fixture                     | Purpose                                                                 | Acceptance                                                                                     |
| --------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| V-01 Small adult league     | Six teams, free entry, one bracket                                      | No school fields/checkout; correct byes; easy setup/public navigation                          |
| V-02 Paid individual league | Limited places with approved review and optional paid waiting           | Honest status, atomic capacity, disclosed priority/refunds, no duplicate charges               |
| V-03 Team-entry league      | Manager submits roster; some players have no account                    | Valid authority, separate team/player requirements, safe account claim                         |
| V-04 Distinct brand/module  | Two leagues use different layouts; one enables trophies                 | One maintained application; configurable blocks/awards; safe disable/export                    |
| V-05 Multi-program operator | Two divisions plus a concurrent cup share venue/coaches                 | Separate entries/rankings; permitted multi-entry; conflict-free resource booking               |
| V-06 Mixed score sources    | Live-tracked game, box score, final-score-only game                     | Correct coverage/averages; authoritative revisions; no fabricated player records               |
| V-07 Delegated network      | Host and institutions with local and independent workspaces             | Only authorized sharing; revocation/expiry; one official-result authority                      |
| V-08 Governing structure    | Regions/districts, classifications and qualification                    | Policy locks, scoped administration, alignment history, case/appeal and downstream corrections |
| V-09 Recovery and pressure  | Concurrent payment/draft/scorer commands, outage, restore, large tenant | Idempotent effects, retained evidence, measured loss/time, fair resource usage                 |
| V-10 Customer exit          | Canceled plan, scoped export/deletion and retained history              | No other tenant data, disclosed retention, domain/module/job cleanup                           |

Future-sport fixtures must test a genuinely different rules/stat model. Do not represent every sport by renaming basketball points or periods.

## Implementation-ready checklist for every approved workflow

1. Actor, outcome, supported configurations, prerequisites, state transitions and exclusions.
2. Wireframes for relevant devices; loading, empty, pending, invalid, denied, conflict, offline and recovery states.
3. Full field dictionary: type, unit, enum/bounds, required/default, validation, sensitivity, owner, permission and retention.
4. Database relationships/checks/indexes, transaction locks, idempotency keys and audit/history consequences.
5. Request/query/event schemas, safe errors, pagination/limits, versioning, expected revisions and side effects.
6. Effective configuration and policy snapshots; publication/projection/cache behavior.
7. Abuse/failure/race cases, meaningful automated/manual tests and acceptance evidence.
8. Provider/data responsibilities, cost/limits, telemetry, recovery/rollback and support runbook.
9. Dependencies, open decisions, estimate, owner and release gate; explicit approval status.

The engineering package supplies the proposed design artifacts; each implementation workflow still needs its executable contracts and recorded evidence. Do not equate prose length with finished or validated code. Keep decisions in the relevant active section and architectural ADRs rather than creating conflicting copies.

## Coverage carried forward from earlier engineering work

The archived [v0.3 package](../../initiatives/alhadi-intramural/specifications/platform-spec-v0.3/README.md) remains an audit trail. The active documents are self-contained planning contracts; old customer-specific choices do not automatically become approved requirements.

| Prior subject / requirement families                                  | Active owner                                                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| BIZ, commercial boundaries and scope                                  | 01; platform finance in 06; decisions here                                                       |
| CFG, UX, theme/page configuration and extensibility                   | 03                                                                                               |
| DAT, ownership, keys, competition/entry model                         | 02; implementation boundaries in 10                                                              |
| SEC, PRI, identity, permissions, privacy, abuse                       | 04; governance additions in 12                                                                   |
| REG, capacity/eligibility/waitlist and identity separation            | 05                                                                                               |
| PAY, merchant separation, idempotency/refunds/reconciliation          | 06                                                                                               |
| DFT, SCH, teams, scheduling and qualification                         | 07                                                                                               |
| GAM, STA, durable events, appearance/minutes and corrections          | 08                                                                                               |
| MSG, MED, inbox, media, trophies, editorial content                   | 09                                                                                               |
| ARC, API, adapters, jobs, integration authority and portability       | 10                                                                                               |
| OPS, QA, REL, recovery, quality, releases and costs                   | 11                                                                                               |
| Platform-fit review: delegation, large workloads and enterprise gates | 12; generic validation scenarios here                                                            |
| Customer fees, school grades/calendar, staffing/equipment services    | Preserved only in the later intramural initiative; optional product policies need fresh approval |

No old requirement IDs have been reassigned. Detailed historical acceptance cases can inform new tests after checking that the selected general-product workflow still requires them.
