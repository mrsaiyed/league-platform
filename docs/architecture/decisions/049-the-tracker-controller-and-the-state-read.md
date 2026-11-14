# 049 — The tracker's controller and the engine's state for the device

Date: 2026-11-14. Step 2.34; serves T6 §1, §3, §4 and §5, T-113, T-114, T-116. Decided by the lead (technical). T-253.

## Problem

T6 §1 says the engine runs on the device so a tap shows at once, and the server is the authority. T-113 says a refused tap makes the tracker reload the server's state. Record 039 built the commands, the session and the visitor's snapshot, and left open the read the device needs: the snapshot is the visitor's view, without a hidden team's players and without the engine's own document, so a device cannot load a game from it, nor reload after a refusal, nor pick up a game another device was scoring after taking it over.

## What

- **`GET /api/v1/leagues/{leagueId}/games/{game}/state`** answers the engine's state as the server holds it, and the sequence number of its last tap (`TrackerGameState` in `packages/contracts`). It runs one read, `games.read_tracker_state`, in the shape of a command (record 014): `games.score` for that game (`mayScoreGame`, read fresh, T-75). Like the tracker's other doors (record 039): 401 signed out, 403 may not score the game, 404 no such game in the league the address names (another league's included). Never cached (`private, no-store`): the state names every player by id, a team that shows its numbers to staff only included, which a scorekeeper of the game needs to score it.
- **It is the state the next batch starts from**: the saved one, given the game's current rules while it holds only line-ups (S-1, `withCurrentRules`), or a new game under those rules made at time 0 when nothing has been tapped. A device that applies its waiting taps to it gets what the server will get.
- **The contract checks only the marks of the engine's version 1** (version, status, rules, clock, plays, redo, recent), because `packages/contracts` comes before `packages/sports` and cannot name the engine's type; the device reads the rest as the engine's.
- It writes nothing to the activity log (a read), has rows in the role matrix and a case in the two-league harness.

## The controller (`apps/web/src/features/tracker/tracker-controller.ts`)

Plain TypeScript with no drawing; the screens of steps 2.35 to 2.37 read its status and call it. Its words are chosen by `tracker-notice.ts` from the message files (T-187).

- **The game shown is the server's state with this device's own taps on top** that the state does not have. After a reload, a tap is kept on top when the state's `recent` ids do not hold it and it was either still waiting when the reload began or made since; a tap the server took before the reload began is in the state. Opening a tab closed mid-game shows its waiting taps at once on the loaded state, and they go out if this device's session is still the one they were made under (T-114, T-248).
- **A tap** is applied to the device's engine at once; the engine's own "no" is answered on the device and nothing is stored or sent. Otherwise it is stored in the queue (T-114) and only then shown. Its time is the device's clock moved by the server's `sentAt` of the latest session reply, so it is in server time as the protocol says.
- **A refusal** (T-113): the game is rebuilt at once without the refused tap, then on the state reloaded from the server; the refused taps are listed as not applied until the scorekeeper dismisses them, which drops them from the queue.
- **Losing the game** (T6 §5): a renewal answered "ended" or "held by someone else", or the queue halted because the session no longer holds the game (checked with a renewal), turns the device read-only with a fixed reason. What it had not sent is listed as not saved, nothing more is sent, and it shows the server's state as it is now. Taps listed as not saved are **never sent under another session**. Each tap is stored with the session it was made under (`sessionId` on the queued tap), so this holds across a reload or a closed tab: whenever the device is given a session (opening, opening again, taking the game back), a waiting tap made under a different session is dropped from the queue and listed as not saved until the scorekeeper dismisses it, so it can be entered again. Opening again into the same session (after signing in again, say, or a tab closed while nobody else took the game, T-248) keeps and sends them. A tap stored before the session was kept has none and is sent as before.
- **The other halts** turn the device read-only with their reason: signed out (401), may not score (403), no such game (404), the game cannot be scored now, or a protocol version the server no longer speaks (T-127).
- **Renewing** every 30 seconds while it holds the game (`sessionRenewSeconds`); no answer is not a loss of the game (T-248). With no network, opening and loading try again after a wait that doubles up to half a minute; `online()` asks at once.
- **Leaving** releases the session only when nothing is waiting to send. Otherwise its lease runs out by itself, and the same device opening the game again carries on with it, so the waiting taps are still taken (record 036).

## Considered

- **A richer snapshot for signed-in staff.** Record 039 kept the snapshot one view for everyone so it can be cached; the engine's state is a different thing for a different reader.
- **Rebuilding the server's state on the device** from what it sent and what was accepted. It would not be the server's record (rules applied on the server, a tap's time capped at the server's now, another device's taps), and T-113 says the server's record is the truth.

- **Sending taps listed as not saved when the game is taken back.** The other scorekeeper may already have entered them again (T6 §5 says they are shown so they can be); sending them too would count them twice.
- **Rebuilding by replaying every tap since the game was opened.** Dropping the taps the state's `recent` ids hold is enough while fewer than 300 are taken between reloads, and the "waiting when the reload began" rule covers taps older than that.

## Revisit if

- The tracker route (step 2.33) stores rosters and state on the device (T-115): it should load through this read rather than a second one.
- The device opens a game with no network at all (T-115): the controller needs the stored state to start from; today it waits until the server answers.
- The engine's document gets a version 2: the contract's marks and `readState` change together.
