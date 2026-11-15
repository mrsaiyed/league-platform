# 058 — Players at the scorer's table: in the tracker's own queue, and a rosters address

Date: 2026-11-14. Step 2.117 (part A); answers the 2.107 audit's finding H1 (the server half); serves P7 §2 and §5.2, S-5, S-6, S-34, S-37, T6 §3 and §4, T-87, T-127. Decided by the builder of step 2.117 for the lead (technical). T-261.

## Problem

A scorekeeper could not put a player into a game. No command added a person to a team from a game, the server refused any tap naming someone not on the roster, a person needed a first and a last name, and the device received the rosters once, with the page (record 054). A school arriving with eight players and no roster here, in a gym with no Wi-Fi, could not be scored at all.

## What

**The changes travel in the tracker's own queue (protocol version 2).** A batch now carries, besides the taps, three commands of the door's own (`TablePlayerInput` in `packages/contracts/src/tracker-protocol.ts`), each with a command id and the moment it was made, like a tap:

- `add-player`: a side, an id the device makes, a jersey (0 to 99 or 00, or empty) and a name typed in one box (empty for number only). One of the two is needed (S-34).
- `change-player`: a side, the player, and a new jersey (empty takes it away) and/or a new name.
- `remove-player`: a side and the player.

The server (`games.apply_tracker_commands`) handles each before the engine, in the batch's order, in the batch's transaction, and the engine never sees them (`packages/core/src/modules/games/table-players.ts`). Each one taken is kept as one of the game's events (`game_events`, type `add-player` and so on), so a retry, a replayed queue or a saved copy uploaded later is answered `duplicate` like any tap (T3 §12, T-129). A player added with no signal is on the team before the plays that name them, because the queue sends in order and the server applies in order; the rosters the batch holds are changed as it goes, so a lineup in the same batch can name the new player. The lines the batch started with are worked out from the rosters as they were, so a number changed in the batch is written to the lines it reaches.

**Who may.** Whoever may score this game (`mayScoreGame`, read fresh, asked once for the batch), for its two teams only: the side names the team. A device that no longer holds the game, a game that cannot be scored now, someone who may not score it (a scorekeeper of another game where only those assigned score, another league's admin, a visitor) are refused as for any tap.

**What each does.**

- _Adding_ makes a new person with the device's id (first word of the name as the first name, the rest as the last name; both empty for number only) and puts them at the end of that side's team's roster as a player, naming the game (`added_at_game_id`) and marked to review (`needs_review`), the columns of migration 0010. S-6's starting setting is "allowed and flagged", so the mark is always set; step 2.71 adds the league's other two choices.
- _A number_ is changed for any current player of the team (S-37). It is the team's roster number, so this game's lines and the games after it carry it; games already played keep the number they were played in.
- _A name_ is changed only for a player added at a scorer's table (any game's): everyone else's name is the league's record, changed by those who manage people. A change that would leave a player with neither number nor name is refused.
- _Taking off_ is only for a player added at this game's table, as a mistake undone: their roster entry goes, and their person with it when nothing else holds them (no other entry, no account, no line, no season total, no record merged into them). A player any play of this game names, on its list of plays or waiting to be redone, is kept, so their box score line never vanishes; one with a line in any game is kept too.

**Refusals the tracker can word.** Each refusal of a change of players is the code `rule` (it is about that one command, so the queue sets it aside and sends the rest, record 024) with a fixed `problem` (`jersey-taken`, `needs-name-or-number`, `player-id-taken`, `not-on-team`, `not-added-here`, `name-from-roster`, `has-plays`) and, for `jersey-taken`, `wornBy`: the player who wears the number, whom the device finds on its rosters. `message` stays for the log: "Number 5 is already worn by Jordan Ellis on this team." (or "by another player on this team" for a wearer with no name).

**A number already worn does not lose the batch.** The database refuses it (0008's trigger), and a refused statement would end the whole transaction. Each write of a change of players therefore runs in a savepoint of its own (`packages/database/src/queries/in-savepoint.ts`): only that write is rolled back, the command answers `jersey-taken`, and the rest of the batch is saved.

**Events keep no names.** A change's event holds ids, the side and the number (`named` / `renamed` as yes or no), never the typed name: events are history that is never changed, and a name must stay erasable (T-52). Each change is also logged (A-6) under `games.apply_tracker_commands` with ids and fixed words ("Changed a team's players at the scorer's table").

**They are not plays.** `gameHasPlays` leaves their types out (`tablePlayerCommandTypes`), so a game with only changes of players can still have its box score entered from a paper sheet. Note that the database still refuses to put such a game in the bin (`check_game_bin_unscored` counts any event); changing that is a migration, left until someone needs it.

**An older tracker is still understood (T-127).** Version 1 batches are read by their own schema (`CommandBatchV1`, taps only) and answered as before; version 2 is the current one. The device's queue stores each tap with the version it was made under, so taps stored before the release go out as version 1 and new ones as version 2.

**A number-only person needs no migration.** `people.first_name` and `last_name` already allow empty (0008, for erasure). The people commands still ask an admin for a name, and F-13 (the Al-Hadi transfer) is unchanged. The one name function already answers "no name" for such a person (`showName`, `no_name`); the pages now word that as "#12": a team's roster, a game's box score (`PlayerRef.unnamed`, and `unnamed: true` on a snapshot's player, present only when true so a page opened before this still reads every other snapshot) and its plays, which already read "#12" for any player shown without a name. A name withheld (removed, hidden, a team for staff only) is still said to be withheld. The statistics, which list no numbers (record 056), show such a player as "A player (name not shown)".

**The rosters address.** `GET /api/v1/leagues/{leagueId}/games/{game}/rosters` (`apps/web/src/server/tracker-rosters-endpoint.ts`) answers whoever may score the game with `TrackerRosters`: the game's two team ids, how it is recorded, its status and both rosters' players with names and numbers, those who left marked, in the shape the tracker's page hands the device (record 054), never cached. It runs `games.read_tracker_rosters`, which is step 2.33's command, brought into this lane unchanged so the two lanes merge cleanly. 401, 403 and 404 carry the tracker's own refusal bodies (record 039).

**The device.** The queue and its storage hold any command of protocol 2 (`BatchCommand`) and keep a refusal's `problem` and `wornBy`; the controller never hands a change of players to the engine. There is no screen: step 2.118 adds the Players panel, which enqueues these commands, updates the device's rosters, and reads this address.

## Considered

- **An address of its own, as in the Al-Hadi tracker** (`POST …/roster`). Simpler on the server, but it needs a connection, and a player added offline would arrive after, or never with, the plays that name them: the spec promises a gym with no Wi-Fi (T6 §4, S-5). Refused.
- **A table of its own for the changes' ids** (migration 0015). It would keep them out of `game_events`, but needs a table, a fence, grants and its own order with the taps; the events table already gives each command once and in order. Not needed.
- **Mapping a device id to a server id.** The plays the device records next name the player by the id it made; keeping that id as the person's avoids rewriting them. A device id already someone's is refused (`player-id-taken`).
- **Adding someone already in the league's list to a team at the table.** Not asked for here; a player added at the table is always a new person, which the admin can merge later.

## Revisit if

- Step 2.71 adds the league's choice (S-6): read it where `needsReview: true` is set, and refuse `add-player` when the league allows none.
- A product answer changes who may rename or take off a player at the table (see the step's report): both are one check in `table-players.ts`.
- A game with only changes of players needs to go to the bin: `check_game_bin_unscored` must leave their types out (a migration).
- Step 2.118 needs to know on the device which players were added at the table (to offer removing and renaming only for them): add `addedAtGameId` to the rosters read, in step with step 2.33's page.

## Checks

Contract: `tracker-protocol.test.ts` (the three commands, version 1 kept, the refusal's `problem` and `wornBy`, the rosters reply, the snapshot's `unnamed`). Core: `table-players.test.ts` (the done test: eight number-only visitors and #12 scoring; the same batch twice; an answer lost; who may; unique numbers naming the wearer; numbers, names, taking off, plays named or waiting to be redone; events and activity without names), `apply-tracker-commands.test.ts`, `read-tracker-rosters.test.ts`. Database: `table-players-commands.test.ts` (the same on PGlite, the savepoint keeping the rest of the batch, nothing left behind, not plays, and "#12" with no name on the game page, snapshot and roster), the two-league harness (each new query and the batch that adds and renumbers), the role matrix (the batch and the rosters read). Web: `tracker-rosters-endpoint.test.ts`, `table-players-queue.test.ts` (with no signal, players before plays, a lost answer), `game-words.test.ts`, `game-content.test.ts`, `team-pages.test.ts`, `activity-messages.test.ts`.
