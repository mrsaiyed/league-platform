# 050 — The Al-Hadi transfer runner

Date: 2026-11-14. Step 2.58; serves P9 §3, T6 §1 and §7, F-7, T-110, T-137, T-201, T-220. Decided by the lead (technical). T-254. Its product answers are F-12 to F-16, decided for the founder and waiting for their yes (DECISIONS.md).

## Problem

F-7 says the games the current tracker recorded are transferred, not re-entered. Step 2.57 reads a copy of the tracker's backup into plain data; nothing said how those games come into a league here, how anyone knows beforehand what will happen, what is compared afterwards, or what a second run, or one cut off part-way, does (T-137).

## What

- **`npm run transfer:tracker`** (`scripts/transfer-tracker-games.mjs`) is a thin script. `packages/database` (`transferTrackerGames`, `transferTrackerGamesInFolder`) finds the league by short name, the season by short name or name, and the `--as` account by email, and gives `packages/core`'s imports module its reads and its commands' transaction. The plan, the replay, the comparing and the words are core's (`plan-tracker-transfer.ts`, `run-tracker-transfer.ts`, `tracker-replay.ts`, `tracker-matching.ts`, `tracker-lines.ts`, `tracker-transfer-words.ts`).
- **Made-up data only (T-201).** It takes a PGlite folder on this computer, never an address: anything that reads as a connection string is refused before anything is opened, and so is a folder with no database. The backup is read from a working copy (`--work`), never changed.
- **The account is checked first.** Before the backup is read or a plan worked out, the `--as` account must hold, for the whole league, every permission the run's commands ask for (`people.manage`, `rosters.manage`, `games.score`, `games.correct`) in a league that is not archived or suspended (`mayTransferTrackerGames`, read fresh, T-75). Anyone else, another league's admin included, is told "not allowed" and shown nothing. The commands still check each step themselves.
- **The plan comes first and writes nothing.** Teams are matched by name (or school name); one it cannot match is listed. The tracked team's players are found on its roster by name, or by number for one the tracker knows only by number, or are to be added with their numbers. Games are matched by the league's game number, else by day (in the league's time zone) and teams. Each game to transfer is then played through the engine here, as the door plays it, with the season's rules, and its score and every box score line are compared with the tracker's. A game is _transfer_, _already_ (every action here and ended), _skip_ (not played, or not ended in the tracker) or _blocked_, with the reason. **The run starts only when no game is blocked**, so a problem known beforehand never leaves the season half-done. A game the tracker ended that is not found here is blocked, never quietly left behind.
- **The run uses only the product's own commands**, each its own transaction, acting as the `--as` account: `people.create_person` and `teams.add_to_roster` for the people to add; for each game `games.open_scoring_session` (device `tracker-transfer`), the actions in batches through `games.apply_tracker_commands` (step 2.29's door, which ends the game at the tracker's own End game, settles the lines and the standings), `games.reopen_game` between the parts of a game the tracker reopened (at the time it did, so later actions keep their times), and `games.release_scoring_session` however a part ends.
- **Running it again is safe (T-137).** The tracker's own action ids are kept, so a run cut off part-way carries on where it was, and a second run is told every action is a duplicate and changes nothing; a game already here is only compared again. A person an earlier run made but had not yet put on the team is found in the league's list and only put on the roster (F-16).
- **After each game** it must be final here with the tracker's score, and every box score line must match; the run stops at the first difference, at any refused action or at any command that says no, and says where and why.
- **What is not brought over is said.** The plan lists every player found, to be added, or not brought over and why. The tracked team's players who cannot be added are listed in the plan and the report (`notBroughtOver`) even when no game names them, and the script ends with exit code 1 until they are on the roster; it ends with 0 only when nothing was blocked, the run went through and every one of them was brought over.
- **Names (T-220).** The tracker's names are read to match people and to print, and are stored only as the names of the people it adds; box score lines hold ids and numbers.

## Considered

- **Writing the rows directly** (games, events, lines). Faster, but it would skip the rules the door applies (the roster on the game's day, the engine, standings, the activity log) and give a second way of making a tracked game that the product does not have.
- **Transferring what it can and listing the rest.** A season half-transferred is harder to put right than one not started; the plan already shows every problem, so nothing is written until there are none.
- **Bringing every team's players in.** Other schools' students are the school's to show (F-6), so they come in only when asked (F-12).

## Revisit if

- The game shape gains a season (step 2.57's reader): a backup holding other seasons' games blocks the run today, as those games are not found in the chosen season.
- The door stops taking the rest of a batch after it refuses one action: the run then needs no plan-side guard for it (today the plan reads the roster and plays the engine as the door does, so none is refused, and the run stops if one ever is).
- The Faraj transfer (step 2.79) is built: the matching and the words may be shared.
