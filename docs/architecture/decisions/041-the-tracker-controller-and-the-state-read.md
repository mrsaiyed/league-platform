# 041 — The tracker's controller and the engine's state for the device

Date: 2026-11-14. Step 2.34; serves T6 §1, §3, §4 and §5, T-113, T-114, T-116. Decided by the lead (technical). T-253.

## Problem

T6 §1 says the engine runs on the device so a tap shows at once, and the server is the authority. T-113 says a refused tap makes the tracker reload the server's state. Record 039 built the commands, the session and the visitor's snapshot, and left open the read the device needs: the snapshot is the visitor's view, without a hidden team's players and without the engine's own document, so a device cannot load a game from it, nor reload after a refusal, nor pick up a game another device was scoring after taking it over.

## What

- **`GET /api/v1/leagues/{leagueId}/games/{game}/state`** answers the engine's state as the server holds it, and the sequence number of its last tap (`TrackerGameState` in `packages/contracts`). It runs one read, `games.read_tracker_state`, in the shape of a command (record 014): `games.score` for that game (`mayScoreGame`, read fresh, T-75). Like the tracker's other doors (record 039): 401 signed out, 403 may not score the game, 404 no such game in the league the address names (another league's included). Never cached (`private, no-store`): the state names every player by id, a team that shows its numbers to staff only included, which a scorekeeper of the game needs to score it.
- **It is the state the next batch starts from**: the saved one, given the game's current rules while it holds only line-ups (S-1, `withCurrentRules`), or a new game under those rules made at time 0 when nothing has been tapped. A device that applies its waiting taps to it gets what the server will get.
- **The contract checks only the marks of the engine's version 1** (version, status, rules, clock, plays, redo, recent), because `packages/contracts` comes before `packages/sports` and cannot name the engine's type; the device reads the rest as the engine's.
- It writes nothing to the activity log (a read), has rows in the role matrix and a case in the two-league harness.

## Considered

- **A richer snapshot for signed-in staff.** Record 039 kept the snapshot one view for everyone so it can be cached; the engine's state is a different thing for a different reader.
- **Rebuilding the server's state on the device** from what it sent and what was accepted. It would not be the server's record (rules applied on the server, a tap's time capped at the server's now, another device's taps), and T-113 says the server's record is the truth.

## Revisit if

- The tracker route (step 2.33) stores rosters and state on the device (T-115): it should load through this read rather than a second one.
- The engine's document gets a version 2: the contract's marks and `readState` change together.
