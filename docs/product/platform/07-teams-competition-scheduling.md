# 07 — Teams, competition, and scheduling

[Specification map](README.md) · Status: proposed competition contract · Decisions: D-15–D-17

**Detailed engineering contract:** [Transaction specification](engineering/04-api-and-transactions.md) and [database constraints](engineering/02-database-and-integrity.md) define roster/draft locks, schedule proposals and shared-resource booking.

## Team and roster management

**CP-01 — Placement modes.** Supported methods are manager-submitted teams, organizer assignment, invitations/import, and an optional hosted draft. Team identity can continue across seasons; eligibility, competition entries and effective roster membership remain distinct. Store roster bounds, jersey history where needed, captain/manager assignment, entry category, effective transfers and game-time snapshots. No global uniqueness rule prohibits valid multi-competition participation; explicit exclusivity policies govern it.

**CP-02 — Draft.** Define eligible pool, order/strategy, roster capacity, captain treatment and pick authority. Start with one host and read-only observers. Each pick checks current lease/fencing token, turn, expected revision, capacity, eligibility and duplicate selection inside one transaction; append action, roster change, audit and outbox together. Takeover fences old tabs. Offline picks remain uncommitted; last-pick undo is a reversal record, and earlier corrections require impact review. Team assignment notifications follow publication, not each speculative pick.

## Competition and advancement

**CP-03 — Presets.** Each supported format defines entries, groups, stages, fixture generation, seed source, ranking/tie rules, completion and advancement. Begin with round robin and single elimination as proposed core formats. Six entrants in an eight-slot elimination draw receive two seeded byes, with no fabricated game/win/player appearance. Double elimination, series, pool-to-bracket, consolation and cross-competition qualification need dedicated rules/tests before enabling.

**CP-04 — Versioned rules.** Rules specify sport/variant, scoring outcome, roster constraints, capture requirements, standings points, tie-breaker order, forfeit/abandonment handling and permitted overrides. Seed confirmation and publication freeze relevant versions. Corrections recompute candidates until downstream locking; started downstream games require an explicit adjudication/reseeding workflow. Qualification edges form an acyclic graph with source official revision and destination slot.

## Calendar and resources

**CP-05 — Event model.** Games, practices, tryouts/open sessions, meetings and other activities are distinct. Non-game attendance is not a sporting appearance. Store UTC start/end plus venue/competition timezone and original local recurrence intent. Resolve daylight-saving ambiguity explicitly. Include cancellation/postponement history and private staff details separate from public location.

**CP-06 — Scheduling.** Generator inputs include selected competitions/entries, pair counts/stages, available courts, duration/buffers, closures, locked fixtures, shared coaches/participants, home/away objectives, rest/travel and maximum play limits. Preserve algorithm version and seed. Separate hard constraints from soft preferences and report infeasibility honestly. Large searches run cancellable jobs with time budget and progress.

**CP-07 — Publication and booking.** Candidate schedule → edits/locks → validation → impact/recipient preview → publication. Confirmed resource occupancy is enforced across relevant competitions using database constraints or serialized booking commands. Draft alternatives do not reserve the court automatically. External shared facilities require an authorized booking integration; matching street addresses grants no cross-tenant access. Publishing a change supersedes old reminders.

**CP-08 — Officials and external games.** Scorers/officials have specific assignments, availability and acceptance. Later credentials, replacement and compensation require separate contracts. External opponents can be local references without becoming customer accounts; label source and aggregation policy. A non-league result does not affect standings by accident. Organization dashboards can aggregate operational work while keeping competitive tables distinct.

## Acceptance and next detail

Test stale/duplicate draft picks; capacity-limited teams; transfers preserving past games; six-team bracket with byes; two divisions sharing a court/coach; unschedulable hard constraints; a changed fixture invalidating notices; and a corrected result after a later round starts.

The engineering contracts now define roster/draft records and locks, host leases, schedule input versions and resource booking constraints. Implementation still completes format/ranking fixtures, qualification graphs, specific constraint algorithms, draft/schedule wireframes, DST/calendar behavior and officials/manual fallback. A small league must remain usable without a regional-governance interface.
