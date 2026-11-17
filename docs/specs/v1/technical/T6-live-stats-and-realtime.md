# T6 — Live stats and realtime

[Spec home](../README.md) · Decisions T-110 to T-129

The game-day part of the product ([P7](../product/P7-teams-schedule-gameday.md) section 5). Most of it is already built and tested in `apps/live-stats`; this file says what is kept, what changes when it joins the platform, and how it holds up with many games and many viewers.

## 1. What already exists and is kept

- **A rules engine** (`packages/sports/src/basketball/live.ts`): given the current state of a game and one action, it returns the new state. It knows scoring, fouls, bonus, substitutions, minutes, clock corrections, periods, overtime, undo and redo, ending and reopening. It has no knowledge of screens, networks or databases, and it is covered by tests.
- **The same engine runs in two places**: in the tracker's browser, so a tap shows instantly, and on the server, which is the authority.
- **Every tap is a command with its own unique ID** and the time it was tapped.
- **One transaction per tap** on the server saves the command, the new state, the score and every affected box score line.
- **Retrying is always safe**: a command the server has already taken is recognized by its ID and ignored.
- **The tracker keeps working without a connection**, queues taps on the device and sends them in order when it can.

**T-110 (agreed, delegated): none of this is redesigned.** It is moved into the platform's `games` module and web app with the same behavior and the same tests.

**T-128 (new, follows S-21): league rules reach the tracker as data, and the clock mode is a command.** The Al-Hadi engine's rules are the number and length of periods, the overtime length, the bonus thresholds and the timeouts, and a foul or a timeout always stops a running clock. The rules gain four things: the clock mode (stop or running), a stop clock in the last minutes, a mercy-rule lead, and a personal foul limit. Under a stop clock the engine pauses the clock itself when a foul or a timeout is recorded; under a running clock neither stops it. Rules without a clock mode mean a stop clock, so every game already recorded reads the same. A new command (`clock-mode`) switches the clock mode mid-game; it is a play like any other, so undo takes it back. Like a lineup, a switch made before tip-off fixes the format; the clock mode a game starts with belongs in its rules. Only the platform's command shape carries the mode and the switch; the Al-Hadi tracker's server keeps refusing both (T-16). Because all of this lives in the engine, it behaves identically on the device and on the server, works offline, can be undone, and appears in the event log, so a box score can always be explained. A game keeps the rules it started with; changing a season's rules affects only games that have not started (S-1).

The other three rules are each off when the rules leave them out, so a game recorded before them reads the same (step 2.67). **Last-minutes stop clock:** in the chosen last seconds of each period, each half (the default) or the game, and of every overtime period, a foul or a timeout stops a running clock as under a stop clock; every overtime period is in it whatever the scope (S-28); a switch to a running clock that the scorer makes inside that window holds for the rest of it (S-29), and inside it the stop clock wins over the mercy rule's switch (S-30). **Mercy lead:** under a stop clock, the basket that brings either team's lead up to the number switches to a running clock and is marked so the tracker can say so; undoing that basket undoes the switch, and the scorer switches back with `clock-mode`. A bigger lead does not switch it again until the lead has dropped below the number (S-31). **Personal foul limit:** a player with that many fouls standing is marked out in their box score line; they are not taken off the floor or kept off it, which stays the scorer's call (S-21, S-32). The platform's command shape carries all three; the Al-Hadi server keeps refusing them.

How the engine keeps these straight (a technical choice, step 2.67): each switch the engine makes or keeps is a flag on the play itself, set when the play is recorded: the basket that triggered the mercy rule carries one, and so does a scorer's switch made inside the last-minutes window. Undoing the play undoes the switch, and setting the clock back, which moves plays' clock times, cannot change what a flag says; a change of period ends a scorer's window switch. Whether a tap is inside the window is judged by the game clock at the time the tap was made, and the server never takes a tap time later than its own clock, so a device whose clock runs ahead cannot put a tap inside the window before the server's game clock reaches it.

## 2. What changes on the platform

| Today (Al-Hadi tracker)                     | On the platform                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| One shared scorer passcode                  | Accounts with the scorekeeper role, per league                                         |
| One team's games                            | Any league's games, each inside its league's fence ([T4](T4-tenancy-auth-security.md)) |
| The server pushes updates to viewers itself | Supabase Realtime pushes them (section 6)                                              |
| Queue kept in the browser's simple storage  | Queue kept in the browser's database storage, which is larger and sturdier             |
| Opens only with a connection                | Installable; opens offline once loaded (section 4)                                     |
| Any device with the passcode can score      | One device at a time, with takeover (section 5)                                        |
| Ending a game updates season totals         | Also updates standings, advances brackets and queues recaps                            |

## 3. The command protocol

The tracker sends commands to `POST /api/v1/leagues/{leagueId}/games/{game}/commands`. The league is named by its id, which never changes, so queued commands still arrive after the league changes its short name (T-229).

```json
{
  "sessionId": "…",
  "commands": [
    {
      "commandId": "0192f…",
      "type": "score",
      "payload": { "player": "…", "points": 2 },
      "tappedAt": "2026-11-15T19:04:11.231Z"
    }
  ]
}
```

- **T-111:** the server takes a lock on that one game, applies the commands in order with the engine, saves, and replies with the new sequence number and, for each command, **accepted**, **duplicate** (already had it) or **refused** with a reason.
- **T-112:** the lock is per game. Forty games being scored at once do not wait for each other.
- **T-113:** a refused command (for example a foul on a player the server knows was substituted out by a command the device never saw) makes the tracker reload the server's state and tell the scorekeeper what was not applied. The server's record is always the truth.
- **T-253 (record 049):** the tracker loads the server's state, and reloads it after a refusal, from `GET /api/v1/leagues/{leagueId}/games/{game}/state`: the engine's state as the server holds it and the sequence number of its last tap, for whoever may score the game only, never cached.
- Commands are small and are sent a few at a time; a full offline game replays in seconds.
- **T-261 (record 058): the players the scorer's table adds, changes and takes off travel in the same batch.** Since protocol version 2 a batch carries, besides the taps, `add-player` (a number, a name, or both, with a random id the device makes), `change-player` (a new number, or a new name) and `remove-player`. The server handles each before the engine, in order with the taps, for whoever may score the game and that game's two teams only, and keeps it as one of the game's events with ids and the number, never the typed name. So it works with no signal, a player added a minute ago is on the team before the plays that name them, and the same command sent twice is a duplicate. A player added with a number already worn is taken, with a notice saying who wears it (S-44); only a change of number to one worn is refused in a season that wants unique numbers (S-37). Renaming and taking off are only for a player added at a table and not yet reviewed (S-45); taking off sends them to the bin. A refusal carries a fixed `problem` code, with the player it names, and when an add was refused, every later command naming that player points at it. Each change runs in a savepoint of its own, so no refusal, known or not, ever turns the batch away. Version 1 (taps only) is still read and answered as it was (T-127). These events are not plays: a batch of them alone saves no state, and a game with only them can have its box score entered from paper and reopened without losing it.
- **T-261 (record 058):** the device refreshes the game's rosters from `GET /api/v1/leagues/{leagueId}/games/{game}/rosters`: both teams' players with names and numbers, in the shape the tracker's page hands it, whether the season wants unique numbers, and for each player whether they were added at a table, at which game, and whether they still wait for review; for whoever may score the game only, never cached.
- **T-282 (record 078):** the rosters also say whether a level score may end the game (`allowTies`), read from the rules the game is played under, where the End tap itself is judged from. The device refuses End game at a level score by it at once, with or without a connection (S-73); the server stays the judge of the tap, and a refusal after all (a page opened before the rule changed) leaves the game live on the device, with the reason said on the scoring screen. The fact travels with the rosters because they reach the device as the page's own properties, from the same release as the page; the state read is a strict shape that an older page would refuse with a field it does not know.
- **T-261 (record 058):** a page reads snapshots and live messages leaving out any field it does not know, so a field added after it opened never makes it refuse one.
- **T-265 (record 062): the league's game rules reach the tracker, and its taps are the platform's command shape.** A season's personal foul limit, mercy lead and last-minutes stop clock are handed to the engine with the rest of its rules (T-128), each left out when it is off. The device gets them only in the state it loads (T-253), so it judges every tap by the rules the server will; a game keeps them from the moment it goes live (S-1). Taps take the platform's command shape, the clock-mode switch included, in protocol version 2: everything a version 2 tracker sent before is taken as it was, and version 1 is still read in the Al-Hadi shape (T-127).
- **T-251 (record 039):** the server answers a batch it took with 200 and the reply; a batch that is not one, or an old protocol version, with 400; no session with 401; someone who may not score the game with 403; a game that is not in the league the address names with 404. The game is always the address's, never the body's. Each refusal carries the server's own body (`TrackerRefusal` in `packages/contracts`), and the tracker takes a refusal as the server's word only with that body at its own status: anything else, such as a gym Wi-Fi sign-in page, a filter or a host's error page answering 404 or 403, is no answer and is tried again, so it never stops scoring or sets taps aside.

## 4. Offline

- **T-114:** a tap is written to the device's storage before the screen confirms it. Closing the tab or the battery dying loses nothing that was tapped, as long as the device itself survives.
- **T-115:** the tracker is an installable web app. Its code is stored on the device the first time it opens, so reopening it in a gym with no signal works. The game's rosters and state are stored when the scorekeeper opens the game. They stay on the device, players' names included, for as long as the game is open on it: a sign-in that runs out mid-game does not clear them, because scoring carries on (below). They are cleared when the game is closed on the device, or when the scorekeeper signs out on purpose from the tracker; and opening a game lets go of another account's or league's, a final game's and one stored more than two weeks before (record 054).
- **T-258 (record 054):** the tracker's address opens only for a signed-in account that may score that game. The page brings the two rosters (names and numbers only) from a staff read, and the device keeps them, the engine's state each time it loads it, and the game format the scorekeeper confirmed, in a browser database of its own beside the queue. A scorekeeper confirms the format once per device; a format changed since is asked again.
- **T-127: a tracker that is already open keeps working across a release.** The server accepts commands from the previous version of the tracker as well as the current one, and the tracker replaces its stored code only when no game is open on the device. With T-158, this means a release never interrupts a game that is being scored.
- A banner always shows the truth: "All saved", or "12 actions waiting to send", with "3 actions not saved" beside it when the server refused some. If the device's own storage fails, the banner says that, never that the device is offline (record 024). On a phone whose scoreboard is short of room (lying down, or upright in its browser) the scoring screen says the same things shorter and no fewer of them: "12 to send", "3 not saved", "Storage failed" (docs/build/DESIGN.md, section 7, line 5).
- Minutes and clock use the time each action was tapped, so a late upload gives the same result as a live one.
- A player added at the scorer's table with no signal (S-34, S-5) is kept in the same queue as the taps and sent before the plays made after it, so a visiting team with no roster here can be entered by number during warm-ups and scored straight away (T-261, record 058).
- If the sign-in runs out mid-game, the tracker keeps taking taps and keeps them on the device, says it is signed out, and sends them once the scorekeeper is signed in again (A-5). The banner can name each play still waiting and the time of the last save.
- **T-129 (new, follows S-5): a game can be saved to a file and uploaded from any device.** "Save a copy" writes the game's commands, with their IDs, to a file on the device. Opening that file on another phone or computer sends the same commands through the same door the tracker uses. Because every command carries its ID, anything the server already has is recognised and skipped, so a file and a late-uploading tablet can never count a basket twice. Uploading a file needs the same permission as scoring the game.
- **Known limit, stated to users:** if a device is offline for the whole game and is then lost or wiped before reconnecting, and no copy was saved, that game's taps are gone. After several minutes offline the tracker says so plainly and suggests saving a copy.

## 5. One scorer at a time

- **T-116:** opening a game to score takes a **scoring session**: a short lease renewed automatically while the tracker is open.
- A second scorekeeper opening the same game sees who holds it and can **take over** after confirming. The first device immediately becomes read-only and says why.
- Commands from a session that no longer holds the game are refused. Anything that device had not yet sent is shown to its user as "not saved", so the new scorekeeper can re-enter it. The same happens when the game is decided or removed while that device holds it. The list is kept on the device until the scorekeeper dismisses it, through a reload, and a second loss adds to it rather than replacing it.
- If a device simply disappears, its lease runs out after about two minutes and the game can be opened by someone else. **S-42 (decided for you, November 14):** a game that is under way is never handed over without a question, even then: whoever opens it is shown who was scoring and when that device was last heard from, and takes the game only by confirming. A scorekeeper with no signal for ten minutes is not displaced by someone who merely opens the game. The same device and account carries straight on (record 036). Step 2.148 builds it; until then a lapsed lease frees the game without a question.
- **S-43 (decided for you, November 14):** a play listed as "not saved" is never sent by the device itself (T-253), but the scorekeeper can send the list by their own tap when the server's game has not moved since those plays were made; the server refuses otherwise, and the plays are entered again. A play can never count twice either way. Step 2.148 builds it.
- **T-251 (record 039):** the tracker opens, renews, takes over and releases its session at `POST /api/v1/leagues/{leagueId}/games/{game}/session`; opening and taking over name the device, and another scorekeeper is shown the holder's name, never their account.
- **T-253 (record 049):** a device that lost the game never sends what it listed as not saved, even if it takes the game back or the page is reloaded: each tap is kept on the device with the session it was made under, and is never sent under another; leaving releases the game only when nothing is waiting to send, so a device that leaves with taps waiting still has them taken when it opens the game again.
- **T-248 (record 036):** a lease that ran out frees the game for anyone else, but if nobody has taken it, the same device coming back carries on with its own session, so taps it queued while offline are still accepted. Leases are timed by the server's clock, never the device's. Leaving the game releases it at once; only taking over is written to the activity log.

## 6. Getting each play to the people watching

- **T-117:** after a command is saved, the web app publishes a small message on a Realtime channel for that game: sequence number, score, period, clock reference, team fouls and the latest play.
- A viewer's page arrives already drawn with the current state, then subscribes to the channel and applies each message.
- **T-118:** messages are numbered. If a viewer notices a gap (a missed message), the page fetches a fresh snapshot instead of guessing.
- **T-119:** if the live connection cannot be made at all (some school and office networks block it), the page silently re-fetches the snapshot every 5 seconds. The snapshot address is cached for 2 seconds at Cloudflare, so a thousand viewers polling cost us one database read every 2 seconds.
- A second, lighter channel per league carries only scores of live games, for the "Live now" markers on the home and schedule pages.
- **T-251 (record 039):** one message per saved batch, carrying the batch's last sequence number; a replayed queue is a jump a viewer answers with a snapshot. The message is cut from the snapshot as a visitor sees it, which is the same for everyone (`GET /api/v1/leagues/{leagueId}/games/{game}/snapshot`); a hidden team's players are left out of it, and the latest play names nobody while either team is hidden. A draft or suspended league's snapshot is never cached and is not found by anyone who may not open the league. Locally, pages listen at `GET /api/v1/live`, only to leagues they may open.
- **T-255 (record 051):** a viewer's page also fetches a snapshot each time its live connection opens (messages may have been missed while connecting), at most every 5 seconds while the players it shows are older than the score (messages carry no players), and every 30 seconds while a live game is quiet (a lost last message leaves no gap to notice). One fetch at a time; a final game is not followed. The device lines its clock up by the page's own snapshot, each message and each fetched snapshot, keeping the largest offset measured, so a cached snapshot, sent earlier than it arrived, never lowers it. The play-by-play is the one the page arrived with; the latest play is shown live. When the game starts or ends (or is reopened, or marked not started, T-264), the page is drawn again from the server once, so a page opened before tip-off gets its play-by-play and one kept open to the end its box scores.
- **T-280 (record 076):** the snapshot, the game's page and each live message read the game and the league's own name settings and audience in one snapshot of the league (REPEATABLE READ and READ ONLY on the database, as every public page's reads, T-274), so a name is never shown by settings read at another moment; the game's reads alone read no person. On the database there is no live service yet (steps 2.124 and 2.116): nothing is published, and a watcher's page follows the game by fetching the snapshot again. Hiding a season, or showing fewer names, reaches a watcher's snapshot within 2 seconds, as the answer may be kept that long by the cache in front of the site (T-119, T-251).
- **T-120:** only our server can publish to these channels, and messages contain only public information (names and numbers as the league's and each team's settings allow, T-81 and T-87).
- **T-233 (record 021):** the publishing half is in `packages/providers` with the other outside services; the subscribing half is browser code, so it lives in the web app (`apps/web/src/features/live-updates`), because `packages/providers` is server-only (T-30). Channel names and the message shapes are in `packages/contracts`, shared by both. The server takes the league from the saved game, makes the latest play's name follow the strictest statistics setting, and sends one game's messages in order. A viewer's page retries with random spread and waits much longer after a refusal. Before the platform's Supabase project is used, its `realtime.messages` policies must let browsers receive only on published, visible leagues, refuse every browser broadcast, and "Allow public access" must be off.

### The clock

**T-121:** the clock is not broadcast every second. A message says "running, 7:42 left as of this instant" or "stopped at 7:42". Each viewer's device counts down by itself from that. Starting, stopping and correcting the clock are the only clock messages. The tracker counts from the server's time too, never the device's: it measures the difference from each scoring-session reply, taking the server's time as the middle of the request's round trip (so it is off by at most half of it) and not trusting a slow reply over a closer one; every tap is timed by it and the scoring screen paints the clock from it.

## 7. Ending a game

`End game` is a command like any other. In its one transaction:

1. the game becomes final with its scores and winner;
2. box score lines are settled (who played, minutes, did-not-play);
3. standings and season totals for that season are recalculated ([T3](T3-data-model.md) section 9);
4. a playoff bracket, if any, is advanced;
5. jobs are recorded: recaps in ten minutes, cache labels to clear ([T7](T7-notifications-and-jobs.md)).

Either all of that happens or none of it does.

**T-250 (record 038):** the tracker's own End game tap ends the game in the batch that carries it, and `games.end_tracked_game` ends it from anywhere else; both do the same steps. A level score is refused unless the season allows ties (the device, told with its rosters, refuses it first: T-282). An End that has not reached the server is taken back on the device alone: the waiting tap is withdrawn from the queue and, if the clock was running when it was made, a pause timed at that moment takes its place, so the clock stays stopped where the End found it (S-72). Settling the lines gives everyone on either team's current roster who never entered a "did not play" line, which never counts as a game played.

## 8. Corrections

- Reopening requires the `games.correct` permission and a reason, and writes a `game_corrections` row.
- **T-263 (record 060):** the scorekeeper's way back from End game tapped too soon (S-36) is a second door, `games.reopen_tracked_game` (`POST /api/v1/leagues/{leagueId}/games/{game}/reopen`, with a request id made once for the reopen, a reason and, when the device has it, the number of the last tap it knows of). It takes only a game its tracker ended, from whoever may score that game now, if they may also correct games (at any time) or sent the game's latest end and it ended no longer ago than the league's `games.scorekeeperReopenMinutes` (30 to begin with, 0 for never, at most 1440). The time is measured inside the database (`statement_timestamp() - finalized_at`), never by the device's clock. The same request sent again is answered "reopened" again. `GET` at the same address tells the device before the tap whether Reopen is offered (always, until a server time, or not, with the reason) and who ended the game. The shapes are in `packages/contracts` (`reopen-game.ts`). It writes the same correction, hands the game back to its tracker as below, and leaves the scoring session as it is, so the device that scored it opens it again and carries on.
- Fixes are made with the tracker's own tools (undo, or adding and removing plays) or through an "edit box score" grid. **T-122:** the grid also produces commands, so the event log always explains the final numbers.
- Finalizing again recalculates everything. Whether a notice is sent follows S-8.
- **T-250 (record 038):** reopening a tracked game hands it back to its tracker: it is live again with the score its plays give, the engine's reopen is kept in the event log, and it counts for nothing until it is ended again. The tracker's own reopen tap is refused, since a tap carries no reason.
- **T-264 (record 061):** marking a game not started (S-40) is its own command, `games.mark_not_started`, at `POST /api/v1/leagues/{leagueId}/games/{game}/not-started`, never a tap. A scorekeeper who may score the game but not correct it, with a basket, foul or turnover standing, is refused `plays-recorded` (undo them first); `not-allowed` is for someone who may not score it at all. In one transaction, with the game's lock taken before the plays are judged: a `reset` event naming the last cleared play is added after them (nothing in the log is edited), the saved state starts again from it with the season's rules, the game is scheduled with no score, no lines and no rules of its own (S-1 does not apply to a game never played), its scoring session ends, and the activity log keeps who, the reason (from a fixed list) and the score, fouls and turnovers cleared. Another device's waiting taps are then refused as not held and listed as not saved there; while another account's scoring session is on the game, lapsed or not, it is refused (taking it over, which asks, is the way through). The live message goes out, so open pages stop saying Live at once. A game that was ever decided is never cleared, and the database lets the rules be emptied only behind the marker. Whatever reads the event log (the box score grid, a publication removing a game, the bin, the Al-Hadi transfer, and in future the recap and the backup reader) counts only what came after the last marker.

## 9. The simpler ways of recording

"Final score only" and "box score afterwards" use the same tables and the same finalization step through two extra commands, `set-final-score` and `set-box-score`. They do not involve the clock or the live engine. A game recorded this way looks the same to standings and statistics, with fewer stats filled in. Averages are calculated only over games where a stat was actually recorded, so mixing modes in one season does not distort them.

## 10. Targets

| Measure                                               | Target                               |
| ----------------------------------------------------- | ------------------------------------ |
| Tap to visible on the tracker                         | Immediate (no network involved)      |
| Tap to safely stored on the server, normal connection | Under half a second, 95 times in 100 |
| Tap to visible for viewers                            | Under 2 seconds, 95 times in 100     |
| Works on                                              | A five-year-old phone or tablet      |
| Simultaneous live games (load test, F-5)              | 40, with 5,000 viewers in total      |

These are targets to measure against in staging, not claims.

## 11. Tests this area must keep passing

- The engine's existing unit tests.
- Protocol tests: the same command sent twice; commands arriving after a takeover; a long offline queue replayed; a refused command.
- **T-123: a "bad gym Wi-Fi" test**: a scripted full game is played while the test randomly cuts and restores the connection; the final box score must equal the known correct one.
- The existing real-browser test that plays a game end to end, extended to cover sign-in and takeover.
- A viewer-side test: messages dropped on purpose; the page must recover by snapshot.

## 12. Room left for later

- **T-124:** more basketball stats (S-17) are new command types and new keys in `stats`; no table changes.
- **T-125:** another sport's live tracker is a new engine in `packages/sports` and a new tracker screen; the protocol, storage, fan-out and finalization are shared.
- **T-126:** a written recap from the play-by-play (N-6) reads `game_events`, which already holds everything it needs.
