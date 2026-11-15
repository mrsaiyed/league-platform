# 060 — The scorekeeper's reopen

Date: 2026-11-14 (revised after the code review and the area 4 review the same day). Step 2.120; serves P7 §5.5, S-36, S-7, A-5, T5 §6, T6 §8, T-98, T-250, T-251. Written by the step's builder for the lead (technical). T-263.

## Problem

S-36 (decided for you) says a scorekeeper may reopen a game they ended, with a reason, for as long as the league sets, 30 minutes to begin with, and that after that only an admin reopens it. It did not say who "the scorekeeper who ended it" is in the data, whose clock measures the time, what the setting may be set to, how this sits beside the admin's `games.reopen_game` (which needs `games.correct`, which the scorekeeper role does not have), how the device learns before the tap whether it may, or what happens when the answer is lost on the way.

## What

- **A second door, the first unchanged.** `games.reopen_tracked_game` (`packages/core/src/modules/games/commands/reopen-tracked-game.ts`) names `games.score`. `games.reopen_game` stays as it was: `games.correct`, any decided game. The new door takes only a game its tracker ended: final, with a saved state the engine ended. A final score or box score entered by hand, a forfeit, or a game decided by hand while its tracker was live is refused (`not-ended-by-tracker`) and is reopened from the games area by someone who may correct games.
- **One rule, read before and checked at the tap** (`reopen-window.ts`). Whoever may score the game now (`mayScoreGame`, read fresh: the role, the league's who-may-score setting and the assignment, the league not archived or suspended). Then one of two:
  - they may also correct games at the game's program (owner, admin, scheduler): reopened at any time, as the admin's own door would. So one Reopen button on the tracker works for everyone who could reopen the game either way. An account that may correct games only in another program counts as a scorekeeper here;
  - or they are the account on the game's latest `end` event (`LiveGamesStore.findLastEnd`, which reads `game_events`), and the game ended within the setting. A scorekeeper who may score the game but did not end it is refused (`not-ended-by-you`), told who did: the tap being undone is the one who ended it, and reopening someone else's result is a correction, which is an admin's. An end with no account on it (a game brought over by a transfer) is no scorekeeper's. Who held the scoring session was considered and not used: the end can come from `games.end_tracked_game` by another account once the lease has run out, and the event records who sent it.
- **The time is measured inside the database** (`LiveGamesStore.endedAgo`: the game's `finalized_at`, which it stamped itself in the transaction that took the end, taken from the start of the asking statement, `statement_timestamp()`, not the transaction's `now()`, so a wait for the game's lock counts), so one clock gives both ends. An offline End game counts from when it reached the server; the device's clock never counts. Exactly the setting's minutes still counts. Each new end starts the window again. Only the time the offer is shown until is turned into the app server's clock (`tx.clock`), for the device to line up with `sentAt`.
- **The setting.** `games.scorekeeperReopenMinutes`, a whole number from 0 to 1440, 30 to start, at the league level, changed by `league.settings`, drawn under Scoring on League settings from its declaration (T-98). 0 means never (`scorekeepers-may-not-reopen`). 1440 (a day) is the upper limit: past a day a reopening is a correction of a result people have seen, not the undoing of one wrong tap. S-36's details were decided for the founder by the lead and are written in DECISIONS.md and P7.
- **Before the tap** (`games.read_reopen_offer`): Reopen offered always, until a server time, or not with the reason, and who ended the game, by the name staff are shown. The device never asks for a reason and then refuses for time.
- **Safe to send twice.** The request carries `requestId`, made once by the device for the reopen and sent with every retry. It becomes the reopen event's command id (`game_events` keeps each command id once per game), so a retry finds it (`LiveGamesStore.findEvent`) and is answered `reopened` again with the game's number now, never "this game is not over". The same id from another account, or one a tap already used, is refused (`changed-since-read`).
- **Which state.** `sequence`, the number of the last tap the device knows of, is optional: a reopen takes nothing away, and a device that never scored the game has none. When given, a game whose saved state has moved on since is refused (`changed-since-read`). The answer gives the game's number now.
- **What reopening does** is T-250's: the engine's reopen kept in the event log as the reopener's event, the game live again with the score its plays give, the did-not-play lines gone until it ends again, a `game_corrections` row with who and the reason in the same transaction (S-7; the database refuses the result change without it), the activity log entry `games.reopen_tracked_game`, and `games.reopened`, so standings and season totals follow in the same transaction. The scoring session is left as it is: the device that ended the game opens it again (its own session, lapsed or not, carries on: T-248) and keeps scoring.
- **The address and its contract** (`packages/contracts/src/reopen-game.ts`, `apps/web/src/server/reopen-game-endpoint.ts`): `/api/v1/leagues/{leagueId}/games/{game}/reopen`.
  - GET: 200 `ReopenOffer`; 401, 403 and 404 the `TrackerRefusal`, as the state endpoint answers.
  - POST `ReopenRequest` `{ requestId, reason, sequence? }`: 200 `{ status: 'reopened', sequence, sentAt }`; otherwise `{ status: 'refused', code, endedBy, sentAt }` at `reopenRefusalStatus[code]`; 401 and 400 the `TrackerRefusal`. A missing or blank reason is `reason-needed`.
  - The tracker takes an answer as the server's word only through `ownReopenReply`, `ownReopenOffer` or `ownTrackerRefusal` (the body at its own status), so a gym Wi-Fi page is never read as a refusal (T-251, step 2.113).
  - Every code has its sentence in the message files (`error.games.reopen_tracked_game.<code>`; `not-ended-by-you` names who ended it), and the button, the question, the reason's label and the ready-made reason ("End game tapped by mistake") are there for step 2.37 (`tracker.reopen.*`). Once reopened the game is published for those watching (T-117).

## Considered

- **Widening `games.reopen_game`** to scorekeepers within the window: one permission check would then carry two rules, and the admin's door would change for every caller.
- **Any scorekeeper who may score the game, within the window.** Simpler, and the correction would still name them, but under "any scorekeeper scores any game" it lets anyone in the league reopen a result they had nothing to do with.
- **The device's clock** (the end tap's `tapped_at`): a device whose clock is wrong would shorten or stretch the window.
- **The app server's clock against `finalized_at`**: two machines' clocks; measuring both ends in the database removes the question.
- **A table of request ids**: needs a migration; the reopen event already holds one id per game, once.
- **The game's version as the staleness check**: the tracker never holds it.

## Revisit if

- Step 2.130 archives seasons (O-12): this door must then refuse the scorekeeper's way (not the corrector's) for a game of an archived season (`reopen-window.ts` says where).
- Leagues ask for a longer window than a day.
