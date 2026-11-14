# 036 — Scoring sessions and takeover

Date: 2026-11-13. Step 2.28; serves T6 §4 and §5, S-5, T-75, T-116. Decided by the lead (technical). T-248.

## Problem

T6 §5 says opening a game to score takes a lease, a second scorekeeper can take over after confirming, commands from a session that no longer holds the game are refused, and a lease that runs out after about two minutes frees the game. Record 030 gave the table (`scoring_sessions`, one row per game, takeover deletes and inserts). Left open: what a device finds when it comes back after its lease ran out with nobody else in the game, whose clock times the lease, how two devices opening at the same moment are settled without an error, what the tracker is shown about the holder, and which of these is logged.

## What

- **Four commands** in the games module, each needing `games.score` for that game as scoring it does (`mayScoreGame`, read fresh every call, T-75): `games.open_scoring_session`, `games.renew_scoring_session`, `games.take_over_scoring` and `games.release_scoring_session`. A scorekeeper taken off the game cannot renew, so their lease runs out.
- **A lapsed lease frees the game, but does not end the session by itself.** Anyone else opening the game after the lease ran out takes it: the lapsed row is removed and a new session starts. If nobody has, the same account on the same device carries on with its own session, by renewing or opening again, with the same session id. The tracker queues taps while offline (T-114), and T6 §4 expects games scored through long gaps in the signal; ending the session at the lease's end would refuse every tap queued in a gap longer than two minutes, though no one else touched the game. Step 2.29 uses `sessionStanding`: a batch is accepted while its session is still the game's and the account's own, lapsed or not.
- **The server's clock.** Leases are timed by a `clock` on the transaction (`ScoringTx`), the app server's own time (`systemClock`), never the device's or the database's; tests pass a clock they move by hand. A session's start (`created_at`) is written from the same clock, so its `since` in milliseconds is exact. Every reply carries `sentAt` so the tracker can allow for its own clock being off.
- **Two devices at once.** Starting a session is `insert … on conflict (league_id, game_id) do nothing`: the second insert waits for the first and then does nothing, without an error, and that device is told who holds the game. Ending a lapsed session is a delete that re-checks `held_until`, so a renewal that landed a moment earlier keeps its session.
- **Takeover names the holder it was shown.** The scorekeeper confirms taking over from one holder (`expectedHolderSince`, the holder's `since`). If the game changed hands since, nothing is taken and the new holder is shown to confirm again. A game that is free or lapsed by then is simply opened. The same account may take over from its own other device.
- **The holder is shown by account id.** The commands return the holder's account id and `since`; the page turns the id into a name, since names of other accounts are not readable by the app's database role (record 008).
- **Renewing or releasing a session that is not held is not an error.** It is answered "ended": "taken-over" when another session holds the game, "released" when none does. A session id is only ever matched with its own account. A device's own session can only be released by it.
- **Logged:** taking over is written to the activity log (who took it, from which account). Opening, renewing every half minute and leaving are not.
- **What the commands refuse.** Opening or taking over a game that is missing, in the bin, decided or cancelled. Which recording mode the game uses is not checked here: the tracker route (step 2.33) decides which games it opens.

## Considered

- **Ending the session when its lease runs out, everywhere.** Simpler to state, but a scorekeeper in a gym with no signal for three minutes would come back to find every tap refused and have to re-enter them, with no one else involved.
- **The database's clock (`now()`).** Then tests could not move time, and a lease and the `sentAt` the tracker is told would come from two clocks.
- **Catching the unique-constraint error on a race.** In PostgreSQL that error aborts the transaction, so the losing device could not even be told who won.
- **A takeover naming the holder's session id.** The tracker protocol (`packages/contracts/src/tracker-protocol.ts`) already names `since`; it does the same job without handing one device another's session id.
