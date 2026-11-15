# 060 — The scorekeeper's reopen

Date: 2026-11-14. Step 2.120; serves P7 §5.5, S-36, S-7, A-5, T5 §6, T6 §8, T-98, T-250. Written by the step's builder for the lead (technical). T-263.

## Problem

S-36 (decided for you) says a scorekeeper may reopen a game they ended, with a reason, for as long as the league sets, 30 minutes to begin with, and that after that only an admin reopens it. It did not say who "the scorekeeper who ended it" is in the data, whose clock measures the time, what the setting may be set to, how this sits beside the admin's `games.reopen_game` (which needs `games.correct`, which the scorekeeper role does not have), or how the device knows which game state it is reopening.

## What

- **A second door, the first unchanged.** `games.reopen_tracked_game` (`packages/core/src/modules/games/commands/reopen-tracked-game.ts`) names `games.score`. `games.reopen_game` stays as it was: `games.correct`, any decided game. The new door takes only a game its tracker ended: final, with a saved state the engine ended. A final score or box score entered by hand, a forfeit, or a game decided by hand while its tracker was live is refused (`not-ended-by-tracker`) and is reopened from the games area by someone who may correct games.
- **Who.** Whoever may score the game now (`mayScoreGame`, read fresh: the role, the league's who-may-score setting and the assignment, the league not archived or suspended). Then one of two:
  - they may also correct games at the game's program (owner, admin, scheduler): reopened at any time, as the admin's own door would. So one Reopen button on the tracker works for everyone who could reopen the game either way;
  - or they are the account on the game's latest `end` event (`LiveGamesStore.findLastEnd`, which reads `game_events`), and the game ended within the setting. A scorekeeper who may score the game but did not end it is refused (`not-ended-by-you`): the tap being undone is the one who ended it, and reopening someone else's result is a correction, which is an admin's. Who held the scoring session was considered and not used: the end can come from `games.end_tracked_game` by another account once the lease has run out, and the event records who sent it.
- **The time.** From the game's `finalized_at`, which the database stamps in the transaction that took the end (an offline End game counts from when it reached the server), to the command's clock (`tx.clock`, the app server's). Never the device's clock. Exactly the setting's minutes still counts; a minute more does not. The two are different machines' clocks, both kept by the time service; for a window counted in minutes a second's difference does not matter. Each new end starts the window again.
- **The setting.** `games.scorekeeperReopenMinutes`, a whole number from 0 to 1440, 30 to start, at the league level, changed by `league.settings`, drawn under Scoring on League settings from its declaration (T-98). 0 means never (`scorekeepers-may-not-reopen`). 1440 (a day) is the upper limit: past a day a reopening is a correction of a result people have seen, not the undoing of one wrong tap. Raising the limit is a one-line change.
- **Which state.** The device sends `sequence`, the number of the last tap it knows of (its End game, as the commands endpoint answered), not the game's version, which the tracker does not hold. A game whose saved state has moved on since is refused (`changed-since-read`). The answer gives the reopen's own number.
- **What reopening does** is T-250's: the engine's reopen kept in the event log as the reopener's event, the game live again with the score its plays give, the did-not-play lines gone until it ends again, a `game_corrections` row with who and the reason in the same transaction (S-7; the database refuses the result change without it), the activity log entry `games.reopen_tracked_game`, and `games.reopened`, so standings and season totals follow in the same transaction. The scoring session is left as it is: the device that ended the game opens it again (its own session, lapsed or not, carries on: T-248) and keeps scoring.
- **The endpoint.** `POST /api/v1/leagues/{leagueId}/games/{game}/reopen` (`apps/web/src/server/reopen-game-endpoint.ts`): `{ sequence, reason }`. 200 `{ status: 'reopened', sequence, sentAt }`; 401 and 400 as the other tracker endpoints; otherwise `{ status: 'refused', code, sentAt }` at the code's own status, each code with its sentence in the message files (`error.games.reopen_tracked_game.<code>`), the late ones saying an admin can reopen it. A missing or blank reason is `reason-needed`. Once reopened the game is published for those watching (T-117).

## Considered

- **Widening `games.reopen_game`** to scorekeepers within the window: one permission check would then carry two rules, and the admin's door would change for every caller.
- **Any scorekeeper who may score the game, within the window.** Simpler, and the correction would still name them, but under "any scorekeeper scores any game" it lets anyone in the league reopen a result they had nothing to do with.
- **The device's clock** (the end tap's `tapped_at`): a device whose clock is wrong would shorten or stretch the window.
- **Storing the end time on the server's clock in a new column**: needs a migration; `finalized_at` already says when the server took the end.

## Revisit if

- Step 2.130 archives seasons (O-12): this door must then refuse the scorekeeper's way (not the corrector's) for a game of an archived season.
- Step 2.37 needs to know, before the tap, whether Reopen is still offered and until when: the tracker's state read (step 2.117's protocol) could carry the time the window closes.
- Leagues ask for a longer window than a day.
