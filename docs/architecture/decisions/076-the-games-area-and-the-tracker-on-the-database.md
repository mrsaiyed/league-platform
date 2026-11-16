# 076 — The web app on the database, part 6: the games area and the tracker

Date: 2026-11-16. Step 2.93 part 6 (T-280); follows records 055, 069 and 070. Serves T2 §4, T6 §3 to §6, T-24, T-81. The one-snapshot read was decided by the lead (technical) at the builder's design point; the rest by the builder for the lead, to be confirmed when the part lands.

**Not verified against a real PostgreSQL server or Supabase.** Everything below runs on the made-up database (PGlite) only.

## Problem

On the database the web app's ports refused Admin → Games, "My games to score", the tracker and the public game's snapshot (`games` and `tracker` were `notMovedYet`, `publishPlays` threw). The games and tracker stores already existed in packages/database; what was missing was their wiring, one read of the names beside the games, and a rule for the public reads: the game page and the snapshot read the league's name settings and the game in separate calls, which on the database would be separate transactions, so a name could be shown by a setting read a moment before or after the people it is applied to.

## What

- **One transaction for the games commands, the tracker's too** (`database-games.ts`). `databaseGamesDeps` builds the games module's `TrackerTx` from packages/database's stores (jobs, games, access, activity, scoring sessions, live games, the server's clock) and adds the standings store. Each command is an ordinary league transaction set to the league and account of the command's context, from the session (T-23, T-28), never a page snapshot. `databasePorts` builds it once; `games.deps` and `tracker.deps` are the same object.
- **A result moves the standings in the same transaction** (T-24). Core's event handlers are typed for `StandingsTx`; the commands' deps want handlers of `TrackerTx`. Each handler is wrapped: the command hands it its own copy of the transaction (`define-command.ts`, every store kept), a type guard checks that the standings store is there and narrows to `TrackerTx & StandingsTx`, and throws if it is not. The made-up world does the same with a WeakMap (`stand-in-world.ts`); the guard needs no memory. Never an empty list here: with `events: []` the walk's standings checks fail (tried).
- **The names beside the games** (`games.namesOf`): `listGameNames` (new, one query, three statements each filtered by the league) gives the league's teams (in the bin too, so an old game keeps its names), its seasons and each game's scorekeeper assignments; the accounts are named by `listAccessNames` (0012), which answers for the league's own staff only. An assigned account that holds nothing in the league any more is named ''.
- **What a watcher reads is one snapshot** (the lead's decision; T-280). `TrackerPorts.gameReadsOf(leagueId, work)` is new: on the database it opens one page snapshot (`withTransaction(..., { snapshot: 'page' })`: REPEATABLE READ, READ ONLY, record 070) and gives `work` the game's reads (`gamesReadStore`), the league's audience (`findLeagueAudience`) and its name policy (core's `readNamePolicy` over `listSettingValues`), all read in it. The game page (`game-page.tsx`), the snapshot endpoint (`game-snapshot-endpoint.ts`) and the play publisher (`publish-plays.ts`) read through it. On the database `snapshotStoreOf(...).people` refuses with `GameNamesOnlyWithSettings`, as part 3's `readStoreOf` does, so no new caller can put a name beside settings read at another moment; its other reads each open a page snapshot of their own. The stand-in answers `gameReadsOf` from its one world. Tested: the read opens exactly one transaction, as a page snapshot, and holds the names the setting allows.
- **What another scorekeeper is shown** (`displayNameOf`, T6 §5): the holder's display name from `listAccessNames`, '' for an account not of the league's staff.
- **No live service on the database yet** (steps 2.124 and 2.116 stay parked). `liveFeed` stays `null`, `publishPlays` resolves at once and the tracker's publisher publishes nowhere; a watcher's page follows the game by fetching the snapshot again.
- **What the scorer's device is sent** is core's own reads, `readTrackerRosters` and `readTrackerState`, turned into the reply by `tracker-rosters-reply.ts`, on the database as on the stand-in: no second list of fields. A field core adds there (for example from the season's rules, which `seasonRulesOf` reads through the games store) reaches the database with no change here.
- **No migration.**

## Proved on the made-up database

`database-games.test.ts` (209 cases) and `database-tracker.test.ts` (167), through `databasePorts`: every command and read the games area, "My games to score" and the tracker's endpoints send, as the owner, an admin, a scheduler, an assigned and an unassigned scorekeeper (under "any scorekeeper" and "assigned games only"), a coach, a signed-in stranger, another league's admin and someone signed out, each refusal exactly `not-allowed` with nothing changed (results, versions, sessions, saved states, assignments, the activity log, the standings); a typed final score, a box score and a forfeit move the public standings and a correction moves them back; a game scored live (the session, the lineups, a tap sent twice and saved once, the snapshot as a visitor, the end, a reopening within the time allowed, the end again) moves them in step; a watcher sees the names the league's setting allows while the scorer's device lists everyone; a game of the other league is not found through either league and nothing of it changes, a tap included; a season hidden again takes its games off the snapshot and the schedule's facts while its scorekeeper still scores. `listGameNames` has a two-league case run with row-level security out of the way that fails with any one of its three league filters removed (tried).

## Considered

- **Reading the names settings and the game in two calls, as before.** Two transactions on the database; a save between them would show names by a setting that was no longer the league's.
- **Removing `snapshotStoreOf` and `namesShownOf` from the port.** Every page now reads through `gameReadsOf`; both are kept, as part 3 kept `readStoreOf`, for the stand-in's tests and for reads that show no person, with the people refused on the database.
- **A WeakMap, as the made-up world, to find the whole transaction from a handler.** The command's copy of the transaction keeps every store, so a type guard is enough and holds nothing.
- **Publishing through `createPlayPublisher` to a publisher that drops everything.** It would read a snapshot after every batch for nobody.

## Revisit if

- The live service arrives (steps 2.124, 2.116): `publishPlays` becomes `createPlayPublisher` over it, reading through `gameReadsOf`.
- A league grows many years of games: `listGameNames` reads every assignment of the league; it could be limited to the games a page shows.
- Admin → Teams moves to the database: the roster commands the tests run on their own deps run on its ports.
