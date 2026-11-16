AREA 4 REVIEW: lanes 2.120 (scorekeeper's reopen) and 2.121 (mark not started)

Both doors do what their records say; I worked the nights by reading the code and by two throwaway runs on the stand-in. Neither door is yet as easy as the Al-Hadi tracker, mostly because of things the device is not told and the controller cannot yet do. One finding in 2.121 can cost a scorekeeper a game scored with no signal.

Not verified by me: lane 2.121's database tests (they need migration 0015), anything in a browser, the standings moving both ways (I relied on each lane's own tests), and the 29/31-minute refusal (the lane's own test).

Throwaway files, all git-ignored, no tracked file touched (`git status` clean in both lanes):

- `C:\Old PC Transfer\Projects-Final\league-platform\.local\lanes\2.120-scorekeeper-reopen\.local\review\reopen-nights.review.test.ts` (and `vitest.review.config.ts` beside it)
- `C:\Old PC Transfer\Projects-Final\league-platform\.local\lanes\2.121-not-started\.local\review\not-started-nights.review.test.ts` (and its config)
  Run with `npx vitest run --config .local/review/vitest.review.config.ts` in the lane folder.

## VERDICTS

- **Lane 2.120: may land after two small named fixes** (R1 and R2), or land as it is if the lead gives both a step with the right folders before 2.37 opens. Nothing in it hurts a game night or the numbers.
- **Lane 2.121: land after two named fixes** (N1 and N2). N1 must not be left for later.

## A. THE REOPEN NIGHTS (lane 2.120)

The standard: "Reopen game" is one tap, no question, no reason, anyone, any time, and it is queued like any tap so it works with no signal (`apps/live-stats/public/js/track.js:931`).

- **Do the plays, clock and period come back exactly?** Yes, run: the state after reopen equals the state at the End tap (plays, redo list, period, rules, clock stopped at the moment of the tap, which is what they wanted from Pause). The engine's reopen only flips the status (`packages/sports/src/basketball/live.ts:670-673`).
- **Noticed at once (inside the first half minute).** The door answers 200, but the device cannot follow (run A):
  - It stays "scoring" with its own picture Final.
  - A tap is refused by the device's own engine ("This game is final").
  - `openAgain()` does nothing in that mode (`tracker-controller.ts:1078`) and a renewal changes nothing. Only a page reload gets back.
  - `status.serverSequence` is 0 here; the number the door wants is `status.queue.sequence` (5 in the run). Sending the wrong one gets "changed since read".
- **Noticed after the first renewal, or 20 minutes later.** Works (run B): the device is told "game over", the reopen answers 200, `openAgain()` carries on in the same session with the plays back, and the next basket is saved.
- **31 minutes later.** Refused `reopen-time-over`: "It is too long since this game ended for a scorekeeper to reopen it. A league admin can reopen it." The scorekeeper has already typed a reason by then (R1).
- **Battery died, second tablet, same account.** The door allows it (the rule is by account), but (run C):
  - The second tablet opens the final game as read-only with no game loaded and no sequence number, so it has nothing to show and nothing to send unless step 2.37 loads the state itself.
  - After reopening, inside two minutes of the dead tablet's last renewal, it is shown the takeover question naming the scorekeeper's own name. After two minutes it takes the game silently today; with step 2.148 it will ask.
- **Signed in as the other scorekeeper.** Refused `not-ended-by-you`: "Only the scorekeeper who ended this game can reopen it here. A league admin can reopen it." It does not say who ended it.
- **No signal at the moment of Reopen.** It is a plain request, not a tap. It cannot be queued: the controller's tap type leaves reopen out (`tracker-controller.ts:68`) and the server refuses a reopen tap (`live-game.ts:40`). Two cases for step 2.37:
  - End tapped with no signal, not yet sent: the server still has the game live, the device shows Final and takes no taps, and the door would answer "not over". Nothing today takes the unsent End back. In a gym with no signal the rest of the game goes on paper, where the standard carries on. The queue can already drop a waiting tap (`tracker-queue.ts:16`, `forget`), so 2.37 can build "take back End game" on the device, with no reason and no server.
  - End already on the server: Reopen must wait for signal. The button should say "No connection. The game reopens as soon as it is back" and keep trying; the time allowed is measured when it arrives.
- **What people watching see.** Final with the score, counted in standings, between the wrong End and the reopen; Live again after, clock stopped. A page that arrived Final checks again every 30 seconds for only 10 minutes (`apps/web/src/features/live-game/follow-game.ts:23-24, 99-100`), so the 20-minute reopen is not seen without a reload (R5).
- **Recap.** Nothing is sent today: only standings listen to a game ending (`packages/core/src/modules/standings/on-game-result.ts`). Stage 4's job must, when it runs ten minutes after a final:
  - check the game is still final from the same end it was queued for (a reopen inside ten minutes means no recap for that end; N-8 and T-144 then hold by themselves);
  - read plays only after the last "not started" marker;
  - accept that the default recap wait (10 minutes) is shorter than the default reopen time (30), so a reopen at 20 minutes follows a recap already sent, and S-8's correction notice covers it.

### Findings, lane 2.120

**R1. Medium. Nothing tells the device, before the tap, whether Reopen is offered or until when.**

- Proof: no read carries the end time, the league's minutes, who ended it, or whether this account may correct games. Record 060 lists it under "Revisit if".
- Standard: the audit's NEW-4 asks for "Reopen game for as long as the league allows; after that, a line saying an admin can reopen it". Without it the scorekeeper types a reason and is then told it is too late.
- Where: this lane (a read at the same address answering offered always / until a server time / no, with the code and the ender's name), or a named step before 2.37. Step 2.37's only folder is `apps/web/src/features/tracker`, so it cannot add it.

**R2. Low. The reply has no shape in `packages/contracts`.**

- Proof: the types sit in `apps/web/src/server/reopen-game-endpoint.ts:46-48`; lane 2.121 has `packages/contracts/src/not-started.ts` with `ownNotStartedReply`. There are also no button, question or reason-label words, which 2.121 wrote.
- Where: this lane, to match 2.121.

**R3. Low. The sequence number protects little here and trips the device.**

- A reopen destroys nothing; a game ended again by someone else is already caught by `not-ended-by-you`, and a double tap by `game-not-decided`.
- The device has the wrong number in run A and none in run C.
- Suggest making it optional (the lead's technical call), or 2.37's line names the number exactly.

**R4. Medium, for step 2.56 (not this lane). A slip undone in five seconds shows "Corrected" publicly for good.**

- Proof: any correction row sets the public date (`packages/database/src/queries/find-game-corrected-date.ts`). This door will be the most common "correction" by far.
- The same mark stays on a try-out game that was ended, reopened, marked not started and later played properly, which is what record 061 avoided for its own reason.
- Suggest: show it only when the score or winner at the next final differs from the first, which is S-8's own test.

**R5. Low, for step 2.45 or 2.104.** A page that arrived Final should keep checking for at least the league's reopen minutes, not a fixed 10.

**R6. Low, for step 2.148.** When the holder is the same account on another device, the takeover question should say "you, on another device". The reply needs a mark for that; a name comparison is not safe.

## B. THE NOT-STARTED NIGHTS (lane 2.121)

The standard: one question, then cleared, by anyone at any time, queued like a tap.

- **Lineups, Start, basket, undo, mark not started.** 200, run: scheduled, no plays, no lineups (the standard clears lineups too), the season's rules again. But the marking device is told nothing (run E):
  - It still shows Live.
  - The next tap is shown, then listed "not saved", and the screen turns to "released".
  - `openAgain()` then starts cleanly.
- **Basket not undone.** 403 `not-allowed`, and a reason does not help: "You cannot mark this game not started. Once a basket, foul or turnover is recorded, only a league admin or scheduler can, with a reason."
- **Is "find an admin" fair for a practice basket?** No, and it is not needed. Because an undone play counts as nothing, one Undo and then Mark not started works for the scorekeeper. The sentence does not say so (N2). I would not allow more; the gate stops one tap wiping real plays, which is A-5.
- **Wrong game started while the right teams are on the floor.** The scorekeeper leaves the wrong game and opens the right one; the wrong one shows Live 4-2 until someone undoes its plays and marks it. Its real scorekeeper later finds a game with plays, is not asked about format, and meets the same refusal. N2 again.
- **A second device with taps waiting.** As the lane's own controller test shows: refused by the server, listed "not saved", never sent.
- **Public pages.** Live 2-0 an hour early until the mark; then scheduled, and open game pages redraw (`live-game-view.tsx` `redrawsFor`, live to scheduled, with its test).

### Findings, lane 2.121

**N1. Medium, fix in the lane. After two quiet minutes anyone who may score can clear a game being scored with no signal, with no question and no reason.**

- Proof (run F): tablet saves lineups and Start, loses signal, three baskets waiting. After one minute the owner is refused `session-held`. After two and a half minutes the owner gets 200 with no reason. The tablet comes back to "released, 3 plays not saved" and a scheduled game with no lineups.
- Code: `mark-not-started.ts:119-122` (`!hasLapsed`). The lane's own test expects it (`mark-not-started.test.ts:284-290`).
- Why it matters: "Live 0-0 with lineups only" is exactly what a real game scored offline looks like from outside. S-42 says such a game is never taken without the question naming who was scoring and when they were last heard from; S-43's "send these plays" cannot help because the game has moved.
- Fix: refuse `session-held` whenever another account's session is on the game, lapsed or not. The way through is the takeover, which asks the question. The same account on another device stays allowed.
- Step 2.148's line should say mark-not-started keeps this.

**N2. Medium, fix in the lane (one sentence). The `not-allowed` words send the scorekeeper to an admin when Undo is the way out.**

- Suggest: "A basket, foul or turnover is recorded. Undo them first, then mark the game not started; or a league admin can clear it with a reason."

**N3. Medium, for step 2.119 (not this lane). A game's own rules given before it started are lost on the mark.**

- Nothing can give a game its own rules today, so nothing is lost today.
- Once 2.119 lands, a game told "8-minute quarters tonight", started and marked not started, falls back to the season's format. The only catch is the confirm-format screen, which is easy to tap through.
- 2.119's line must keep "rules given" apart from "rules fixed at the start", so the mark returns the game to what it had before.

**N4. Low, for stage 4 and T-126.** Anything that reads the event log (the written recap, the tracker backup reader) must start after the last "not started" marker, or the practice plays come back.

## C. BOTH TOGETHER, AND THE EDGES

- **End tapped on a game that should never have started.** Reopen (the ender, inside the time, with a reason), open again, undo every play (End needs at least one), mark not started. It works, with two re-opens of the device and R4's "Corrected" mark left behind. `game-final` says the right thing: "Reopen it to change it."
- **After a reopen, does the ending device carry on?** Yes, in the same session, if it had already been told the game was over (run B). Not if the reopen comes inside the first half minute (run A).
- **Do plays listed "not saved" at the end come back?** No. They stay listed and are never sent by themselves; S-43's button is the way. Step 2.148 must not count an end and reopen pair as "someone recorded something since".
- **Step 2.148.** A reopened game is under way, so the partner opening it must get the question; today, after two minutes, they take it silently. No new harm from these lanes except N1.

## D. WHAT STEP 2.37 NEEDS AND DOES NOT HAVE

From the reopen door:

- whether Reopen is offered, until when, and who ended it (R1);
- the reply's contract and the words (R2);
- which sequence number to send (R3);
- a state read on a device that never had the game (run C).

From the not-started door:

- whether this account may correct games (so it knows before the tap whether it will be refused or asked a reason);
- the "something recorded" rule where browser code can use it (`recorded-plays.ts` is in core).

From the controller (both):

- a call for each door that waits for the queue to empty, sends the right number, and on 200 reloads or opens again, so the same screen carries on with no "released" or "game over" notice;
- taking back an End not yet sent.

## E. THE LEAD'S CHOICES

- **Only the account that ended it reopens.** Right to begin with. An admin at the gym can use the same button at any time. Name the ender in the refusal.
- **30 minutes, one day at most.** Right.
- **Timeouts and colour changes are clock taps.** Right.
- **A play undone is nothing recorded.** Right, and it is the scorekeeper's way out; say so (N2).
- **Refused while another device holds, admins included.** Right, but the hold must not end after two quiet minutes (N1).
- **A game's own rules lost on the mark.** Acceptable today; wrong once step 2.119 exists (N3).

## WHAT STEP 2.37'S LINE MUST ADD

1. Controller calls `reopen(reason)` and `markNotStarted(reason?)`: wait for nothing waiting, send `queue.sequence` (or the state's number when the device never scored), then carry on in place.
2. "Take back End game" while the End is unsent: on the device, no reason, works with no signal.
3. The final panel on a device that did not end the game: load the state, show the score and Reopen.
4. Reopen shown with the time left, then "A league admin can reopen it"; never ask for a reason and then refuse for time.
5. The reason is one tap: "End game tapped by mistake" already chosen, editable.
6. A question before each, as the standard asks:
   - Reopen: says the game goes back to Live and stops counting until ended again.
   - Mark not started with plays standing: a scorekeeper is told "Undo the N plays first"; an admin is told how many plays and what score will be cleared.
7. With no connection both buttons say so, and Reopen keeps trying.
8. While the final panel is open, check for a reopen made by someone else and carry on.
9. Folders: `packages/site/src/messages` and `packages/contracts`.
10. Done test, on one screen with no reload:
    - End for Pause, reopen at once, next basket saved;
    - the same with the network off at End;
    - the try-out night (basket, refusal, undo, mark, lineups again).
