# 038 — Ending and reopening a tracked game

Date: 2026-11-14. Step 2.30; serves T6 §7 and §8, P7 §5.4 to §5.6, S-7, S-11, T-111. Decided by the lead (technical). T-250.

## Problem

T6 §7 says ending a game is a command like any other and that, in one transaction, the game becomes final, its box score lines are settled (who played, minutes, did not play) and standings and totals are worked out again. T6 §8 says reopening needs `games.correct` and a reason, writes a correction, and the game is fixed with the tracker's own tools. Left open: which door the end comes through (the tracker's own End game tap, a command of its own, or both), what "did not play" lines are and who gets one, where a reopened tracked game goes, and what the tracker's own `reopen` tap does.

## What

- **Two doors, one end.** The tracker's End game tap is taken through the tracker's commands (`games.apply_tracker_commands`), so a game ended offline is ended when its queue arrives and the tablet and the server agree. `games.end_tracked_game` (input: the game and the version seen; needs `games.score` for the game, as scoring it does) ends it from anywhere else: an admin's page, the Al-Hadi transfer (step 2.58). Both take the game's lock (T-111), apply the engine's own `end`, save it as an event of the account that ended it, and then share one step (`finish-tracked-game.ts`): the lines are settled, the game becomes final with the score its plays give (the database works out the winner), the end is written to the activity log as `games.end_tracked_game`, and `games.finalized` is announced, so the standings handlers (record 033) work the season out again in the same transaction. Anything that fails rolls all of it back.
- **Not while another tablet holds the game.** `games.end_tracked_game` is refused (`session-held`) while the game's scoring session belongs to another account and its lease has not run out, read as `games.take_over_scoring` reads it: the holder may still be scoring, and taking a game from its tablet is confirmed first (T-116). The holder's own account may end it from elsewhere (the command carries no device, so any device of that account counts as the holder's); once the lease runs out, anyone who may score the game may. The tracker's End tap needs no such check: a batch is refused unless its own session holds the game.
- **A tie is refused at the end** unless the game's rules allow ties (P7 §5.6), as `record_final_score` refuses one: through the tracker it is a refused tap with the reason ("play overtime"), from the command an error. The engine's own refusal (nothing recorded yet) stands.
- **Did-not-play lines.** At the end, everyone whose roster entry on either team was on the team on the game's day and who has no line gets one with `played` false, no seconds and no counts, so the game's page lists them as the Al-Hadi tracker lists its active players. An entry is on the team from its joining date up to the day before its leaving date, a missing date open at that end (migration 0008); the game's day is its start in the league's time zone, or the league's today for a game with no time. So an old game transferred later (step 2.58) lists the roster it was played with: a player who had left by then, or joined after, gets none. A did-not-play line never counts as a game played (P7 §5.6, `seasonTotals`).
- **Reopening a tracked game hands it back to its tracker.** `games.reopen_game` stays the one door for reopening, with its permission, reason and correction (S-7). It now takes the game's lock first. A game with a saved tracker state goes back to `live` with the score its plays give, not to `scheduled`: the engine's `reopen` is applied and saved as an event of the account reopening it, so the event log explains the change, and the did-not-play lines are taken out until it is ended again. The correction records `live` and that score as the result after. A game entered by hand still goes back to `scheduled` with no score. A tracked game that had been decided by hand while its tracker was live goes back to the tracker as its plays left it.
- **The tracker's `reopen` tap is still refused**, with the reason that a final game is reopened by an admin with a reason. A tap carries neither the permission to correct nor a reason.
- **Finalizing again recalculates everything.** Ending again settles the lines afresh against what is saved (written where they differ, taken out where gone) and announces `games.finalized` again; reopening announces `games.reopened`, so a reopened game counts for nothing until it ends (S-11).

## Considered

- **Only a command, the tracker's End tap refused.** The tablet's own engine marks the game final the moment the scorer taps; refusing it on the server would leave every tablet out of step and force a reload at the end of every game.
- **Only the tracker's tap.** An admin could then not end a game whose tablet died after the last basket, and the transfer runner would have to fake a scorer's session.
- **Did-not-play lines for everyone ever on the roster.** A player who left months ago would appear in the box score of every game ended afterwards.
- **A second reopening command for tracked games.** Two doors for one action, and the hand-entered one would have to refuse tracked games anyway, which needs the same stores.

## Left for later steps

- Advancing a bracket and recording the recap and cache jobs (T6 §7 points 4 and 5) come with brackets and notifications.
- The correction notice of S-8 comes with recaps.
- P7 §5.5 lets a scorekeeper reopen within a time the league sets; reopening needs `games.correct` until that setting exists.
- Whether ending also releases the scoring session: it does not; the lease runs out, and a session cannot score a decided game.
