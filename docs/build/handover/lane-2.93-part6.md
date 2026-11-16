# Handover: lane 2.93 part 6 (the games area and the tracker on the database)

Branch `lane/2.93-part6`, opened from `build/stage-1` at `fabb60f3`. Written 2026-11-16 when the build moved computers. **No code was changed in this lane yet.** All that was done is reading, written down below so the next builder does not have to read it all again.

## What the part is

Step 2.93 part 6 (`docs/build/STAGE-2.md`, search "\*\*2.93 (TEST 2)", then "THE PARTS LEFT"). It is for the founder's first test online: on the test copy they take one league from empty to a final table and score a game live from tip-off to "final".

Today, in `apps/web/src/server/database-ports.ts`, `games: notMovedYet('games area')`, `tracker: notMovedYet('tracker')` and `publishPlays` (throws `NotOnTheDatabaseYet`) still refuse. So on the database these all fail: Admin → Games (the lists, "Needs a result", earlier games), typing and correcting a final score, the box score, forfeit/postpone/cancel, "My games to score", the scorekeepers' rule (any scorekeeper or assigned only), the tracker page, the scoring session (take, renew, release, take over), sending plays (a play sent twice is applied once), the snapshot for the public game page, ending a tracked game, the reopen offer and reopen, mark not started.

Do not touch `adminTeams` (another part), `fixtureImport` (parked), `adminSettings` and `scheduleAdmin` (landing from lane 2.93 part 4: merge the build branch when it lands; `database-ports.ts` will conflict a little).

**Build it in two halves, each committed and pushed:**

1. Half 1: `ports.games` (the games area and "My games to score").
2. Half 2: the tracker's ports, `publishPlays` and the snapshot.

**A result must move the standings in the same transaction.** Pass core's event handlers to the ports' `deps.events`, as the made-up world does. Never `events: []` here (the area 5 lead flagged it: the settings and schedule ports use `[]`, and that must not be copied to the ports that move games).

**Live updates:** `liveFeed` stays `null` on the database. A watcher's page asks again about every 7 seconds through the snapshot. Do not build the real-time service (steps 2.124 and 2.116 are parked).

**The done test:**

1. A test on the real `databasePorts` against the local seeded database, in the style of lane 2.93 part 4's `apps/web/src/server/database-admin-ports.test.ts`. It walks through the ports: in a seed league, type a final score for one game and check that the public standings read shows it. Score another game live: take the session, set the lineups, send plays (one of them twice), read the snapshot as a visitor (the score, and only the names the league's policy allows), end the game, check the standings, reopen it inside the allowed time and end it again.
2. Who may do what, for each command these screens and endpoints send: owner, admin, a scorekeeper (under "any scorekeeper", and under "assigned only" both assigned and not), a scheduler, a signed-in stranger, another league's admin, a signed-out visitor. Each refusal must be exact, with nothing changed. In every command and read, a game id of another league is refused or not found, and the other league's rows are untouched.
3. A hidden season: after "Hide it again" (the season's status goes back to `draft`), the game's public snapshot and facts stop answering for a visitor. Say what a cache could still serve (the snapshot endpoint sets `s-maxage=2`). A game being scored in that season can still be scored by its scorekeeper.
4. Replace the "refuses on the database" expectations for `games`, `tracker` and `publishPlays` in `apps/web/src/server/database-ports.test.ts` (the test "refuses each area not yet on the database…", about line 361) with tests that prove they work.
5. No browser journey until step 2.96 lands (no staff member can sign in in a browser on the seeded database before then).

Rules: read `docs/build/RUNBOOK.md` section 3. Nothing whole on the laptop: run the named test files, `npm run check`, `npm run format:check`, and the typecheck through `node scripts/heavy.mjs --`. No migration is expected (if one is needed, stop and report; the next free is 0021). Record 076 and T-280 are reserved only for a technical decision, reported first.

## What reading found

### The ports and where their made-up versions are

- `apps/web/src/server/ports.ts`: `games: GamesAreaPorts`, `tracker: TrackerPorts`, `publishPlays: PublishPlays`, `liveFeed`.
- `apps/web/src/server/games-area-ports.ts`: `GamesAreaPorts = { deps: CommandDeps<TrackerTx>; namesOf(leagueId) → { teams: id→name, scorekeepers: gameId→names[], seasons: id→name } }`.
- `apps/web/src/server/tracker-ports.ts`: `TrackerPorts = { deps: CommandDeps<TrackerTx>; snapshotStoreOf(leagueId) → GameSnapshotStore; namesShownOf(leagueId) → { audience, policy }; displayNameOf(leagueId, accountId) → string; publisher: LivePublisher; clock: Clock }`.
- `apps/web/src/server/publish-plays.ts`: `createPlayPublisher` reads the snapshot as a visitor and publishes. It is used only on the stand-in.
- The made-up versions: `stand-in-games.ts` (`standInGames`: `deps = world.deps`; `namesOf` from the world's teams, assignments and seasons; `displayNameOf` from a fixed people map; `snapshotStoreOf` = `worldGameSnapshot` in `stand-in-world-reads.ts`, about line 169). They are wired in `stand-in-ports.ts`, about lines 343 to 410: `namesShownOf(namePolicyOf(adminSettings.deps), world.audienceOf)`, then `tracker = { ...games.tracker, publisher: hub }` and `publishPlays: createPlayPublisher(...)`.
- How the made-up world passes the handlers: `stand-in-world.ts`, lines 214 to 223. Core's `eventHandlers` are typed `EventHandler<StandingsTx>[]`, and `CommandDeps<TrackerTx>` wants `EventHandler<TrackerTx>[]`. Under strict function types they do not fit directly, so the world wraps each handler and finds the whole transaction, standings store included, through a WeakMap keyed by `tx.activity`. On the database, do the same: either the WeakMap, or a type guard such as `'standings' in tx` that narrows to `TrackerTx & StandingsTx` and throws if the store is missing. The commands hand handlers a shallow copy of the tx with a checked job queue, so `activity` keeps its identity and the standings field is still there.
- Who uses the ports in the app:
  - `features/games-area/games-page.tsx` and `box-score-page.tsx`: `games.deps`, `games.namesOf`.
  - `features/tracker/my-games-page.tsx` and `tracker-page.tsx`: `games.deps`, `games.namesOf`.
  - `features/live-game/game-page.tsx`: `tracker.namesShownOf`, `snapshotStoreOf`, `clock`.
  - `server/game-snapshot-endpoint.ts`: the same three.
  - `server/scoring-session-endpoint.ts` and `reopen-game-endpoint.ts`: `deps`, `displayNameOf`, `clock`.
  - `tracker-state-endpoint.ts`, `tracker-rosters-endpoint.ts`, `not-started-endpoint.ts` and `tracker-commands-endpoint.ts`: `deps` (and `publishPlays`).

### The transactions in core, and the database stores that fill them

`packages/core/src/modules/games/ports.ts`:

- `GamesTx = CommandTx & { games: GamesStore; access: AccessReader; activity: ActivityLog }`
- `ScoringTx = GamesTx & { scoringSessions: ScoringSessionsStore; clock: Clock }`
- `TrackerTx = ScoringTx & { liveGames: LiveGamesStore }`
- For the handlers (`modules/standings/ports.ts`): `StandingsTx = CommandTx & { standings; games (findSeason, listDecided, listDecidedLines); access; activity }`

Every store already exists in `packages/database/src/stores` (exported from `@srleagues/database`), each taking the scope:

| tx field                       | database store                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `jobs`                         | `jobsStore(scope)`                                                                                                 |
| `games`                        | `gamesStore(scope)` (a full `GamesStore`, which also covers StandingsTx's `games`)                                 |
| `access`                       | `accessStore(scope)`                                                                                               |
| `activity`                     | `activityLogStore(scope)`                                                                                          |
| `scoringSessions`              | `scoringSessionsStore(scope)`                                                                                      |
| `liveGames`                    | `liveGamesStore(scope)`                                                                                            |
| `clock`                        | not a store: `{ now: () => now().getTime() }` from the ports' `now` option, the same clock as `TrackerPorts.clock` |
| `standings` (for the handlers) | `standingsStore(scope)`                                                                                            |

How to build the transaction: `database.commandTransaction(db, (scope) => ({ ... }))`, as in `packages/database/src/stores/tracker-commands.test.ts` (about line 70) and `src/seed/seed-season-under-way.ts` (about line 205, `events: eventHandlers`). The scorekeepers' rule needs no extra store: the games store's `leagueSettingRows` reads `games.whoMayScore` (`core/src/modules/games/scoring-access.ts`).

For the snapshot reads, `gamesReadStore(scope)` already is a `GameSnapshotStore`. It leaves out a game whose season is not `active` or `completed` (`publicSeasonStatuses`), the same as the stand-in's `worldGameSnapshot`.

For the names a visitor sees: `findLeagueAudience` and core's `readNamePolicy` over `listSettingValues`, as `settingsIn` does in `apps/web/src/server/database-public-stats.ts`.

`displayNameOf`: `listAccessNames(scope)` (`public.access_list_names()`, migration 0012) gives the display name of every account holding a grant in force in the league, and of its owner. Pick the one asked for, or `''`. No new query is needed.

### What has no read yet: one new query, for `games.namesOf`

For a league it must give its teams (id → name, binned ones included so old games keep names), its seasons (id → name) and its game assignments (`game_assignments`: game id and account id). Map the account ids to names with `listAccessNames`. Write it as one query file in `packages/database/src/queries/` with its test beside it, the league id in every statement, and a case in the two-league test that fails when the league filter is removed (prove it, and say how).

### A design point for the lead (report it, do not decide it alone)

Record 070 says every public page's reads run in one page snapshot: `withTransaction(db, ctx, work, { snapshot: 'page' })`. But the game page and the snapshot endpoint read `namesShownOf` and `snapshotStoreOf` separately, so on the database they would be several transactions, and a name setting could be read at a different moment from the people it is applied to. Proposal: add to `TrackerPorts` a read that gives `work` the store and the names in one snapshot (like `publicStats.statisticsOf` in part 3), switch `game-page.tsx` and `game-snapshot-endpoint.ts` to it, and make the database `snapshotStoreOf().people` refuse, as part 3's `readStoreOf` does. This changes a port's shape, so it may need record 076 / T-280. The lead decides.

### Other facts for the test

- `database.madeUpDatabase({ underWay: true })`. Lakeside (adult league) has divisions North (Herons, Otters, Pines) and South (Gulls, Foxes, Owls). One game a week ago in each division is played, Herons–Otters and Gulls–Foxes, with box scores. One game a week on is not: Otters–Pines and Foxes–Owls.
- Only teams that played have players. Pines and Owls have no roster, and a lineup needs 5 players a side. So the test must add people and roster places first, through core's `createPerson` and `addToRoster` on a test-built deps.
- Seed staff: `owner@`, `admin@`, `scheduler@` and `scorer@lakeside.example.test`, and `admin@maple.example.test` for the other league. Sign them in as part 4's test does (`accountFor`, using a stand-in `identify`).
- Hide or show a season with core's `updateSeason` (`status: 'draft'` or `'active'`). Until part 4 lands, run it on a test-built leagues deps, not `ports.adminSettings`.
- Shapes for the tracker's plays: `apps/web/src/server/tracker-commands-endpoint.test.ts` and `tracker-endpoints.test-helper.ts` (`tap`, lineup, start, score).

## What is built and committed

Nothing yet, apart from this note.

## Half built

Nothing.

## Not started

All of half 1 and half 2.

## The next three things to do, in order

1. Write `apps/web/src/server/database-games.ts`. It holds one `CommandDeps<TrackerTx>` for both the games area and the tracker: the stores in the table above, plus `standings`, and `events` set to core's `eventHandlers` adapted as described. It also holds `namesOf`, on the new query. Wire it as `games` in `database-ports.ts`, write the half-1 tests (the typed final score moves the standings; roles; another league's game id), commit, and push with `node scripts/push-lane.mjs --times=2`.
2. Write `apps/web/src/server/database-tracker.ts`: the same `deps`; `snapshotStoreOf` on `gamesReadStore` in page snapshots; `namesShownOf` in one page snapshot; `displayNameOf` through `listAccessNames`; `clock`; a publisher that publishes nowhere. Set `publishPlays` to resolve at once (nothing listens; `liveFeed` stays `null`). Settle the snapshot design point above with the lead first, or build the one-snapshot read and report it.
3. Write the walk through the ports, the role and other-league tests, and the hidden-season test. Replace the old refusal expectations in `database-ports.test.ts`. Then push, wait for GitHub (`node scripts/wait-for-github.mjs`) and report.
