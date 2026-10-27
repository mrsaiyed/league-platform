# 07 — Platform fit review: from one league to a governing body

> Historical snapshot: this prospective-client initiative is inactive. Use the [active overall product plan](../../../../product/platform/README.md) for current direction. Earlier approval/customer statements below retain their historical context.

**Review date: October 11, 2026. Scope: all seven v0.3 specification documents and the founder's clarified product goal.**

[Back to the specification](README.md)

## Verdict

The original v0.3 draft was a strong Al-Hadi delivery specification with useful shared-platform foundations. It was not yet a sufficient specification for the full ambition. Its security, payments, correction history, and modular application approach are worth retaining. Its organizational model, participation paths, competition model, extension lifecycle, and delivery gates needed expansion.

This review distinguishes three outcomes: **fits the goal as specified**, **requires a contract change now**, and **requires a later product capability**. None means the capability is implemented or verified in production. Companion chapters now include the recommended corrections; founder approval remains pending.

The central product definition stays unchanged. The larger interpretation is explicit: a customer may operate one league, several leagues and divisions, or a network of affiliated institutions. The public website, administrative responsibility, billing customer, and competition structure do not always share the same boundary.

## Evidence and limits

These sources establish reference patterns, not a complete competitor audit or a promise to match every feature. Public pages cannot establish private admin behavior, security, commercial terms, or measured capacity.

| Reference          | Verified observation                                                                                                                                                                                                                                                               | Implication for our design                                                                                                                                                                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Faraj              | The public site shows six teams, two named conferences, weekly/season awards, rankings, media, and sponsors. The founder also requests preservation of distinctive trophy functionality. Exact trophy rules have not been newly audited here.                                      | Test both the founder's simple six-team/one-bracket example and optional conference views; provide real extension and page-composition contracts. [Faraj public site](https://farajleague.org/)                                                                                                                       |
| Filhoops Houston   | Its accessible TeamPages directory includes multiple named seasons, age-based divisions, and a 3-on-3 tournament. Many entries are historical; this does not establish its complete current operating structure.                                                                   | A useful multi-program operator reference: concurrent competitions, category filters, recurring teams, and organization-level navigation. [Filhoops league directory](https://filhoopshouston.teampages.com/organizations/14431/leagues)                                                                              |
| RSportz ecosystem  | RSportz is a platform reference, not one league. A PFF announcement describes its RSportz partnership, different membership categories, and planned event integration in 2017. The main RSportz site was inaccessible during this review; no current feature-parity claim is made. | Treat membership, institution affiliation, and event participation as separate concepts. [PFF's historical announcement](https://pff.org.ph/philippine-football-federation-goes-live-with-my-pff/)                                                                                                                    |
| UIL basketball     | The official bracket page distinguishes conferences, divisions, regions, and districts and uses MaxPreps for bracket/team information.                                                                                                                                             | Governance structure, competition grouping, qualification, and external systems need separate contracts. [UIL basketball brackets](https://www.uiltexas.org/basketball/playoff-brackets)                                                                                                                              |
| UIL administration | Official material describes alignment/assignment processes and appeals, while basketball guidance covers eligibility-related topics and ejections. These pages are evidence of workflow categories; we do not encode their changing rules as universal defaults.                   | Later enterprise scope includes effective-dated policies, decisions/appeals, delegated administration, and rule-provider integrations. [UIL conferences and districts](https://www.uiltexas.org/policy/constitution/general/conferences), [basketball guidance](https://www.uiltexas.org/basketball/rules-guidelines) |

“UIL-level” means an architectural and operational target for sports competition administration in this review. It does not promise replacement of every UIL academic, music, legal, or institutional process, nor readiness to serve UIL itself. That scope would need separate discovery and procurement validation.

## Fit by customer pattern

| Pattern                                                                    | Original draft fit                   | Material gap                                                                                                                             | Proof required before selling this capability                                                                                                |
| -------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Al-Hadi: four teams, school approval, paid individual signup, hosted draft | Strong on workflow and risk coverage | Many policies remain undecided; no production controls implemented                                                                       | Complete pilot gates and actual courtside rehearsal                                                                                          |
| Faraj-style: six teams, one bracket, distinctive public identity/trophies  | Partial                              | Preset/byes must be concrete; trophies are only vaguely described as awards; workflows assume Al-Hadi-like enrollment                    | Six-team season rehearsal, two byes in an eight-slot single-elimination draw, optional conferences, configurable trophy module               |
| Filhoops-style operator: many divisions/seasons/tournaments                | Partial                              | A season/group is overloaded; team entry, roster reuse, multiple competition scopes, and organization-wide scheduling need contracts     | Two simultaneous divisions plus a tournament, shared resources, returning teams, separate rankings, no customer branch                       |
| RSportz-style affiliated network                                           | Weak                                 | Durable memberships, institution affiliation, credential expiry, delegated authority, and cross-workspace sharing are missing            | Multiple institutions under an approved network agreement, narrow data sharing, renewal/expiry and revocation tests                          |
| UIL-like sports governing body                                             | Insufficient                         | Administrative hierarchy and competitive alignment conflated; qualification, appeals, integration and enterprise operations underdefined | Staged district/region/state fixture, school-specific permissions, policy locks, correction/appeal handling, migration and capacity evidence |

## Findings and amendments

Priority meanings: **F** = settle the foundational contract before its first production schema/workflow; **P** = implement before claiming general independent-league fit; **E** = later capability before serving the relevant enterprise/network customer. These are dependency categories, not numerical severity scores or dates.

| Finding                                                                 | Original evidence                                                    | Why it matters                                                                                                                                    | Amendment / priority                                                                                                                                                            |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-01 Organization means too many things                                 | 01 hierarchy; DAT-01; role matrix                                    | A school can participate in several competitions and keep its own private workspace. A federation cannot become an unrestricted parent superuser. | Separate owning workspace, institution, affiliation, and scoped governance authority. ARC-10, SEC-21. **F contract; E federation UI**                                           |
| G-02 Season and competition are conflated                               | Groups/stages under season; games and roster indexes                 | Concurrent divisions and a cup can have different admission, standings, and rosters inside one calendar season.                                   | Add competition and competition-entry scope; one default competition in the pilot. DAT-11. **F**                                                                                |
| G-03 Registration is treated as the universal entry path                | REG-01/02, orders tied to registration, DFT flow                     | Existing teams, school-submitted rosters, and free leagues must work without a student checkout or draft.                                         | Separate enrollment, admission, payment requirement, team placement, and account claim. REG-13/14, PAY-11. **F contract; P paths**                                              |
| G-04 Configurable website is underspecified                             | CFG-05 registry; pages table                                         | A polished branded league needs control of composition, navigation, content, and module placement.                                                | Explicit page-builder contract with schema, preview, safe components, reusable templates. CFG-08. **F contract; P editor breadth**                                              |
| G-05 Optional features lack lifecycle and ownership                     | CFG-05/07; STA-04; awards entity                                     | Faraj's special request otherwise becomes scattered tenant-specific conditionals.                                                                 | Module manifests, dependencies, permissions, migrations, disable/export rules; trophy example. CFG-09/10, DAT-12. **F contract; P first extension**                             |
| G-06 Self-service is postponed without a clear release promise          | BIZ-04; Gate 6                                                       | A manually provisioned program does not prove an organizer can buy and start independently.                                                       | Self-service gate with idempotent creation, ownership, template, readiness, billing recovery. BIZ-07. **P**                                                                     |
| G-07 Generic grouping is not a competition engine                       | SCH-07 preset without detail                                         | Six-team byes, qualification from divisions, and late corrections require precise transitions.                                                    | Stage/entry/qualification contracts with acyclic advancement and versioned seeding. SCH-09/10. **F contract; P/E formats**                                                      |
| G-08 Small-player identity could block durable affiliations             | Organization-local people and optional recurring team                | Login, person, sporting membership, club relationship, and season roster have different lifetimes.                                                | Stable team identity and scoped links; future membership/credential module; no global identity merging by email/name. REG-14, DAT-13. **F boundaries; E federation membership** |
| G-09 Detailed live scoring is assumed everywhere                        | GAM-01; required points/minutes settings                             | Large organizations may receive only scores or external box scores. Forcing a scorer app can prevent adoption.                                    | Versioned capture modes and explicit completeness/provenance; import correction arbitration. GAM-14. **F mode contract; P/E adapters**                                          |
| G-10 Institutional governance is not modeled                            | Reviewer + commissioner presets                                      | Delegated authority, non-overridable rule policies, eligibility expiry and appeals differ from a single commissioner.                             | Scoped delegation, locked policy rules, eligibility evidence/decision workflow, approvals. SEC-21/22, REG-15. **F authority boundary; E full workflows**                        |
| G-11 Scheduling and game operations stop at one organization            | SCH-05 shared-venue deferral; staff_assignments                      | Multi-competition scheduling must see shared coaches/courts. Larger events need officials and assignment acceptance.                              | Cross-competition resource planning in one workspace; approved shared-booking integration later; officials module boundaries. SCH-11. **P/E**                                   |
| G-12 Integration is too far down the list                               | Public API/partners later; API endpoints mostly interactive commands | Established organizations need safe imports, stable external IDs, reconciliation, and ownership of each data field.                               | Import boundary now; supported API/service principals and integration contracts before enterprise onboarding. API-07. **F boundary; P/E adapters**                              |
| G-13 Scale figures cover many small tenants, not a large governing body | OPS-01 tiers; one default pilot season                               | Tenant count does not test one huge customer, qualification cascades, or concurrent regional administrators.                                      | Structural and workload tests, large-tenant fairness, explicit procurement/SLA/identity gate. OPS-17/18. **F load design; E evidence**                                          |
| G-14 Delivery proves only a second similar customer                     | Gate 6; A-15                                                         | Two school presets could pass while team entry, extensions, and governance remain impossible.                                                     | Named acceptance fixtures and staged commercial claims. Chapter 06 Gate 7 and X-01–X-08 below. **P/E**                                                                          |

## Ownership model: three different structures

These structures must be related explicitly rather than collapsed into one unrestricted tree.

```text
Data ownership and access
  Workspace A: operator or governing body
  Workspace B: independent school/club (if it needs its own workspace)
  Explicit affiliation + scoped sharing/delegation joins selected work

Administration inside a workspace
  Governing body -> region/district offices -> assigned staff responsibilities
  Institutions may instead be local records with delegated staff
  A tree location alone grants no access to private records

Competition
  League/program -> season -> competition -> groups/stages -> entries/games
  Category/classification and qualification are versioned competition concepts
```

For Al-Hadi, one workspace, one institution if needed, one league, one season, and one competition are sufficient. Hide redundant selectors in the UI. For a multi-program operator, one workspace can own several competitions and share courts/staff. For a network, a school can remain independent while contributing an authorized roster and result to a host competition.

**Recommended ownership rule:** every competition has one owning workspace and one authoritative official result per game. Participating schools get explicit permissions on their entries; they do not gain access to the host's full database. The host receives an approved participant/eligibility snapshot, not automatic access to each school's private files. Affiliations do not transfer ownership of school billing or unrelated programs.

Do not solve this by globally removing tenant filters, copying full student profiles, or assuming everyone under a federation can see everyone else's contacts. Cross-workspace cooperation is a dedicated authorized operation. A plain database foreign key can enforce relationship integrity; it does not establish the legal or product authority to share that record.

## Competition and roster contract

The logical model is workspace → league/program → season → competition. Competitions own entries, admission policies, stage graphs, result scopes, and publication settings. A division can be a group inside one competition when rules/entry boundaries are shared; use separate competitions when enrollment, titles, or permissions are independent. The setup UI explains the choice through templates.

- A stable team/club identity is distinct from its season roster and entry into a particular competition.
- A game references entries in its owning competition, with participant snapshots at game time.
- A participant may enter two compatible competitions if policy permits. Exclusivity is a named eligibility scope, not a blanket unique constraint across an entire season or account.
- A category such as age band, skill level, or classification has typed criteria and effective dates. A region/district assignment can change between alignment versions without rewriting previous results.
- A stage can be round robin or a supported elimination format. Stage transitions specify source rank/winner, qualification count, seeding, tie resolution, byes, and locked downstream events. Each advancement has an origin and revision.
- A winner shown in a bracket is a reference to an official result, not a duplicated editable text field. Double-counting the same game in several standings requires explicit aggregation rules to prevent it.

Pilot implementation uses one competition, a small set of presets, and team entries. A general arbitrary tournament designer, individual-event sport engine, and federation-wide qualification system remain later implementations. Their interfaces and ownership semantics must be agreed before production schema choices exclude them.

## Faraj trophy feature as an extension test

“Trophy functionality” is an example requirement supplied by the founder. Exact award mechanics, any collectible/points behavior, profile ownership, and historical display must be discovered from Faraj before porting. Do not assume the current public award labels describe its entire behavior.

A first reusable awards/trophies module can define:

1. Award types: name, artwork, description, eligible recipient kind, scope, and manual/supported calculation method.
2. Grants: recipient, competition/season or bounded cross-season scope, issuer, source result/revision, issue date, visibility, and revocation/correction history.
3. Trophy cabinet blocks on player, team, season, or league pages with approved visibility and filtering.
4. Module-specific permissions, quotas, schema versions, test cases, and enable/disable behavior.
5. Optional automated grants that are idempotent and re-evaluated after a result correction. Manual/editorial awards stay distinguishable from computed statistics.

Faraj can configure its own names, art, criteria, and placement. Another league can use the same supported module differently or disable it. An unusual feature can be commissioned subject to a defined maintenance and pricing agreement, then delivered as a versioned platform module. It must not silently become a separate application maintained forever for one customer.

Module disable removes new actions and public blocks as configured; it does not delete historical grants, corrupt score records, or leave orphaned permissions. Re-enable and export behavior are part of the module contract. Awarding a trophy cannot change the authoritative match score.

## What to establish now and what to defer

| Boundary              | Establish with the first relevant implementation                                    | Build later with evidence of demand                                             |
| --------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Workspace/institution | Explicit data owner; role scope; institution is not automatically a tenant          | Federation affiliation provisioning and cross-workspace administration          |
| Competition           | Stable competition/entry IDs; per-competition roster and rule scopes; pilot default | Many concurrent formats and qualification pipelines                             |
| Enrollment            | Independent person/account, admission, payment, placement states                    | Team/family packages, installments, ongoing federation memberships              |
| Website/modules       | Versioned blocks, safe configuration, module identity and dependencies              | Rich template catalog, advanced editor, third-party developer ecosystem         |
| Rules                 | Typed validated policies, source/version, allowed overrides                         | Multi-tier governance templates, appeals, classification changes                |
| Results               | Capture mode, provenance, stable IDs, final revisions                               | Certified feed integrations and advanced multi-sport stats                      |
| Integrations          | Import staging, external ID mapping, dry run, idempotency                           | Public API products, enterprise SSO/provisioning, SIS and federation connectors |
| Operations            | Metrics by workload, quotas, recoverable jobs, restore evidence                     | Contract-specific availability, staffed support, isolation deployment tiers     |

The new long-term requirements do not justify building an enterprise organization editor before Al-Hadi can register students. They do justify correcting ownership and competition identifiers before data accumulates.

## Reference acceptance fixtures

These are proposed synthetic scenarios, not claims about actual customer counts or current software capacity. Implement each only at its release gate; discuss all at schema/API review.

| ID                           | Fixture                                                                                                   | Pass condition                                                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| X-01 Small league            | Six teams, optional two conference labels, one championship bracket                                       | Generic template; two byes if six entries use an eight-slot draw; no fake games for byes; valid advancement; no mandatory school fields              |
| X-02 Custom identity         | Faraj-style trophy cabinet and editorial rankings; another league disables them                           | Different page composition and module settings from one release; no tenant-name conditionals or public/private leakage                               |
| X-03 Multi-program operator  | Two age divisions and a 3-on-3 cup in overlapping dates, with returning clubs                             | Separate entry/stat scopes; permitted multi-entry player; shared-court and shared-coach conflicts; distinct winners                                  |
| X-04 Team enrollment         | Captain submits team roster; some players have no account; free entry or approved offline payment         | No fake player checkout; lawful collection; claim/invitation cannot expose another person; team and player requirements independent                  |
| X-05 Affiliated institutions | Host competition plus two schools, one managed locally and one in a separate workspace                    | School sees only delegated entry; host gets agreed sports/eligibility fields; expired affiliation stops new sharing without erasing required history |
| X-06 Governing-body workflow | Synthetic two regions × four districts × eight schools, qualification into a championship                 | Scoped district admins; locked parent rule; approval and appeal records; effective alignment; correction after qualification handled explicitly      |
| X-07 Mixed result sources    | One event-scored game, one submitted box score, one imported final score                                  | Honest metric completeness; no fabricated minutes/appearances; conflicting feed cannot overwrite official result; revision-consistent standings      |
| X-08 Self-service and scale  | Organizer provisions/publishes a league; separate workload tests for one large tenant and many small ones | No developer provisioning steps; recoverable setup/payment failure; tenant fairness; measured query/queue/cache performance                          |

Fixture X-06 demonstrates structural suitability only. A dataset of 64 schools cannot establish UIL-scale performance, institutional rule compliance, or procurement readiness. Workload budgets must separately specify participants, teams, seasons, games, writes per second, concurrent scorers/admins, spectator fanout, imports, retention, and failure recovery.

## Document-by-document outcome

| Chapter                  | Retain                                                 | Changed by this review                                                                          | Still to settle                                                            |
| ------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Master                   | Product definition, Al-Hadi baseline, modular monolith | Explicit customer ladder and scope interpretation                                               | Initial commercial segment and supported launch claims                     |
| 01 Product/configuration | Safe settings, preview/publish, branding/accessibility | Ownership hierarchy, self-service gate, page builder, module lifecycle, staged roadmap          | Editor controls and first general-market templates                         |
| 02 Workflows             | Payment integrity, durable scoring, corrections        | Enrollment/payment modes, memberships, competition progression, mixed result sources, officials | Rules and workflow policies per supported customer type                    |
| 03 Architecture/data/API | PostgreSQL, scoped keys, command boundaries, outbox    | Competition scopes, institution/affiliation extension, trophy contract, integration boundaries  | Executable field schemas, migrations, federation ADR                       |
| 04 Security/privacy      | Least privilege, RLS, student privacy, audit           | Delegated authority, cross-workspace sharing, service accounts, rules authority                 | Actual agreements, identity providers, permissions per enterprise customer |
| 05 Operations            | Recovery/testing, measured scaling, cost ownership     | Large-tenant workload, enterprise readiness and module support economics                        | Vendor cost/capacity tests and contractual service levels                  |
| 06 Delivery              | Pilot gates and risk-first reviews                     | Early structural review, general-product gate, affiliated-network gate, new decision rows       | Staffing, estimates, release prioritization                                |

## Business implication

These customer types are related but have different buying processes, integration needs, service expectations, and operating risks. Build the small independent-league product and use larger scenarios to constrain the design. Approve a new commercial tier only after its workflows, support, migration, and pricing have evidence.

Enterprise support, custom feature maintenance, migration work, and venue operations must not disappear into one low subscription price. Track reusable product development separately from customer-specific implementation services. End-to-end means a coherent workflow with an accountable source of truth; approved payment, email, video, identity, and external-results integrations can supply parts of that workflow.

The revised draft describes a credible expansion path. It does not establish that the platform already handles these cases or eliminate the need for detailed architecture review and customer discovery before each expansion.
