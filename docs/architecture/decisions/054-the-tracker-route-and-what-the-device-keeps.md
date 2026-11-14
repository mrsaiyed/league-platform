# 054 — The tracker's address, the scorekeeper's games and what the device keeps

Date: 2026-11-14. Step 2.33; serves P7 §5.1, P4 §4, P2 §4, T6 §2 and §4, U-6, T-115, T-116. Decided by the lead (technical). T-258.

## Problem

`/{league}/score/{game}` was a placeholder that any account holding `games.score` anywhere in the league could open, for any game, real or not. T6 §2 replaces the Al-Hadi tracker's shared passcode with accounts, P4 §4 gives a scorekeeper a list of their games and nothing else, P7 §5.1 has the scorekeeper confirm the game format, and T-115 stores the game's rosters and state on the device when it is opened. Record 049 built the controller and the state read and left two things to this step: rosters (the state names players by id only) and where on the device the opened game is kept.

## What

- **Who opens the tracker.** Two checks on the server before anything is drawn. The league's (league-gate.ts, unchanged): someone who scores nowhere in the league, a visitor and another league's admin included, gets "you do not have access" (U-6, 403). The game's: the page runs `games.read_tracker_rosters` (below), which runs only for whoever may score this game (`mayScoreGame`, read fresh, T-75), so a scorekeeper in a league that scores assigned games only is refused a game not theirs the same way (403). An address that is not a game id, or a game not in this league (another league's game asked for through this one's address included), is "not found" (404).
- **`games.read_tracker_rosters`** (`packages/core/src/modules/games/commands/read-tracker-rosters.ts`): the game's home and away team ids and the players of both rosters, names and numbers only (R-16), those who have left marked (R-17), in the shape of a command (record 014), `games.score` for that game. It reads the existing `GamesStore.listRoster`, so no new query. A team that shows its players to staff only (S-22) is listed in full, as the state read names them by id. It writes nothing to the activity log, has rows in the role matrix and a case in the two-league harness. There is no HTTP door for it yet: the page reads it on the server and hands the rosters to the device with the page. Team names come from the names the games area shows (`games.namesOf`); they are public.
- **The device keeps the opened game** in a browser database of its own, `srleagues-tracker-games` (`indexeddb-opened-game-storage.ts`), beside the queue's (record 024), so adding it upgraded nothing a tracker already open holds (T-127). One row per game: the league, the rosters and when they were stored, the engine's state as the server last gave it, and the format confirmed. It also keeps the device's own id for the scoring session (T-116), made once. A memory version runs the same contract in tests.
- **The state is stored as it is loaded, through the one state read.** `createStoringTrackerServer` wraps the controller's door to the server: each answer of `GET …/state` (opening, after a refusal, after a takeover) is written to the device before the controller sees it. A failure to write does not stop scoring (the taps are in the queue); the page says the device could not save. No second state read was added (record 049).
- **Opening, in order** (`open-tracker-game.ts`): open the device's storage (none, as in some private windows: nothing is opened and the page says why); store the rosters; read or make the device id; make the controller, which takes the session and loads the state. `screenOf` picks what is shown from the controller's status: opening, held by another device (with "Take over scoring"), read-only with its reason (with "Open the game again"), confirm the format, or scoring.
- **Confirming the format** (P7 §5.1): once the device holds the game, the scorekeeper sees the periods and their length, the overtime length and the clock, from the state's rules, and confirms. The confirmation is kept on the device, so the same device is not asked again for the same game; a format changed since is asked again.
- **The scorekeeper's admin**: whoever's only admin area is Games sees "Your games" on the admin's home: `games.list_my_games` (its own rule for which games), each card with "Score this game" to the tracker for a game scheduled or live in a league that may score. Everyone else's admin home is unchanged.
- **Words on the device.** The page hands the device the tracker's own messages (`tracker.*` from the language's message file) and the device makes its translator from them, so the controller's notice and banner helpers (record 049) are used as they are (T-187).
- **The scoring screen** is a placeholder: steps 2.35 to 2.37 draw there.

## Considered

- **An HTTP door for the rosters** (`GET …/rosters`). Not needed while the page is drawn by the server: the rosters reach the device with the page, and offline opening (step 2.38) starts from what the device stored. It can be added when something on the device needs to refresh them alone.
- **Rosters in the state read.** Record 049 kept the state the engine's document; names are not the engine's.
- **A new store in the queue's database.** It would have bumped the queue's version, which a tab of the previous release holding the database open blocks (record 024, T-127).
- **Asking for the format every time the game is opened.** It would ask mid-game after a reload or a takeover; once per device per format is enough for P7 §5.1's purpose.

## Revisit if

- The device opens a game with no network at all (step 2.38): the controller should start from the stored state and rosters (record 049 says the same).
- The rosters change during a game (a player added on the spot, S-6, step 2.35): the device's copy must take the new player.
- The founder decides who may correct a wrong format at the scorer's table (reported by the builder; today the screen tells the scorekeeper to ask a league admin).
