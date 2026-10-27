# 02 — Domain model, ownership, and data

[Specification map](README.md) · Status: proposed structural contract · Decisions: D-05–D-06

**Detailed engineering contract:** [Database specification](engineering/02-database-and-integrity.md) defines field types, scoped keys, constraints, locks, indexes and migration groups.

## Model and boundaries

```text
Owning workspace
  League/program
    Season
      Competition
        Entries, groups, stages, games, results

Separate relationships:
  Institutions and affiliations
  Administrative units and scoped authority
  Accounts, people, guardians/payers, sporting memberships
  Stable teams, season rosters, competition entries, game snapshots
```

**DM-01 — Tenant ownership.** A workspace is the data-owning tenant. A school, club, or association is an institution and need not have a login or its own workspace. Affiliations never grant blanket access to another workspace. A competition has one owning workspace and each game one official-result authority. Cross-workspace cooperation later uses explicit sharing/delegation contracts.

**DM-02 — Competition scope.** Season is a calendar context; competition owns admission, entries, rules, standings, and qualification. A small league gets one default competition with redundant selectors hidden. Independent titles/enrollment/rules may justify separate competitions; groups represent subdivisions within a competition. Avoid one universal uniqueness rule that prevents a permitted player from entering two competitions in the same season.

**DM-03 — Identity lifetime.** Login account is distinct from participant, payer, guardian, staff membership, and sporting membership. Store person records under their lawful owning workspace. Do not merge people by name/email or build a globally searchable private athlete directory. Team identity can persist while rosters and competition entries change; historic game participants retain the snapshot applicable at play time.

## Entity families to specify

| Family           | Records                                                                                              | Essential boundaries                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Ownership/access | workspaces, institutions, access memberships, roles/delegations                                      | Tenant, resource scope, effective dates, revocation; last-owner protection        |
| Identity/privacy | people, private contacts, account links, consents, public profiles                                   | Relationship proof, purpose, private/public separation, erasure                   |
| Configuration    | programs, seasons, competitions, config versions, module installations, page versions                | Typed scope, immutable published/effective versions, dependencies                 |
| Enrollment       | forms, applications, answers, eligibility decisions, admission policies, capacity pools, allocations | Subject type, independent states, uniqueness, transaction locks                   |
| Finance          | billable subjects, orders/items, attempts, entries, refunds, disputes, provider inbox                | Currency, merchant, immutable terms, provider/account IDs, reconciliation         |
| Competition      | teams, season rosters, entries, entry rosters, stages, qualification edges                           | Effective membership, typed competitor references, acyclic advancement            |
| Operations       | venues/resources, sessions, schedule versions, bookings, staff assignments                           | Time ranges, resource ownership, confirmed occupancy versus draft alternatives    |
| Results          | games, participant snapshots, scorer leases, events, stints, projections, result revisions           | Authority, sequence, capture coverage, provenance, correction chain               |
| Engagement       | notification intents/items/deliveries, media, award types/grants, rankings                           | Recipient scope, approved assets, module state, official versus editorial content |
| Platform         | audit, command deduplication, outbox/jobs, support grants, exports/deletion jobs                     | Actor, retry/lease, expiry, safe diff, retained evidence                          |
| Expansion        | affiliations, credentials, sporting memberships, alignment, cases/appeals                            | Issuer, purpose, validity, data-sharing agreement, decision authority             |

This is the schema work inventory, not permission to create every future table immediately. The first migration for a workflow must establish its relevant ownership and history boundaries.

## Persistence contracts

**DM-04 — Types.** Use opaque IDs without relying on secrecy for authorization; UTC instants plus IANA timezone and local recurrence intent; integer currency minor units; integral game durations; explicit null for unknown data; monotonically increasing aggregate revisions and payload/schema versions. SQL lengths, enum/check values, defaults, retention and field visibility must be finalized in the dictionary.

**DM-05 — Relationships.** Tenant-owned rows have a non-null owner key. Composite keys enforce workspace/competition relationships, including game entries and rosters. A game cannot reference an entry from another competition. Typed nullable references need check constraints; avoid unconstrained polymorphic IDs. A narrow audited bridge handles intentional cross-workspace sharing rather than weakening normal constraints.

**DM-06 — Concurrency.** Capacity, duplicate picks, refundable balance, official-result publication and confirmed bookings are database invariants. Lock the aggregate/resource, validate expected revision, commit state/audit/outbox together, and use stable lock order. Retry serialization failures with the original command key. A preflight count in the UI is insufficient.

**DM-07 — Read models and lifecycle.** Publish only approved fields through explicit projections. Cache keys include owner, competition, publication revision and filters; private views never enter public caches. Final results and financial facts retain revision history. Erasure removes eligible personal information while preserving required facts under an approved policy. Backups, exports, search and derived objects participate in that process.

## Acceptance and next detail

Test wrong-tenant and wrong-competition references at database level; concurrent last-place allocation; a person permitted in two competitions; expired roster membership with an intact past result; consent withdrawal propagating to public projections; and clean export of one tenant only.

The engineering data contract now supplies the main field dictionary, typed ownership, scoped constraints, transaction locks, index patterns and migration sequence. Implementation must produce executable SQL/policies, verified query plans, complete per-feature dictionaries and identity merge/unmerge/retention procedures before relying on real records.

## DM-08 — Team participation in an external competition

A team-owned record is distinct from a competition host's official game. A workspace can own `team_seasons`, descriptive `external_competitions`, scoped participation links and `team_game_records` without owning the external competition. The initial varsity use case requires this mode. Never provision a fake governing workspace or claim authority by storing a source URL.

Hosted `games` retain their competition/entry constraints and one official-result authority. Team records have their own actor, revision, source and publication scope; linking to a hosted game is an explicit audited reconciliation workflow. Team records cannot feed host-official standings merely because names/scores match. Opponent identities remain per-game snapshots until intentionally linked. See the [exact proposed entities and migration path](../../initiatives/alhadi-varsity/02-engineering-contract.md).

Production acceptance: two workspaces independently track the same external fixture; neither can overwrite the other or publish an official host result. A later approved link preserves original evidence and identifies the chosen authoritative revision.
