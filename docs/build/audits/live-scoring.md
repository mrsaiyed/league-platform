# Area audit: scoring a game live

Step 2.107. Area 4 of [LEADS.md](../LEADS.md): "A scorekeeper at a noisy table. They record a whole game on a phone or tablet without hunting for a button, undo any mistake, and lose nothing when the connection drops. People watching see it within seconds."

Written 2026-11-14 by the area lead for live scoring, from build branch commit `4360f77`, with lane 2.33 at `da21bf6` and lane 2.45 at `130eb10` read as they stood (neither has landed). It changes no code and no plan.

## How this was done, and what was not checked

- **Read in full:** the Al-Hadi tracker's scoring screen (`apps/live-stats/public/track.html`, `js/track.js`, `js/roster-editor.js`, `js/sound.js`, `css/track.css`), its live page (`js/game.js`), its browser test (`scripts/check-live-stats-browser.mjs`), the engine (`packages/sports/src/basketball/live.ts`), the command shapes (`packages/contracts/src/live-stats.ts`, `tracker-protocol.ts`), the server half (`packages/core/src/modules/games`), the device half (`apps/web/src/features/tracker`), the spec's P7 and T6, and sections F, G, M, N and O of the stage 2 plan.
- **Used in a real browser:** the Al-Hadi tracker, started on this computer on a throwaway database of its own with 24 made-up players, driven with the `playwright` package in Edge, and measured at four sizes: a phone upright (390 × 844), a phone lying down (844 × 390), a tablet upright (820 × 1180) and a tablet lying down (1180 × 820). The measurements are quoted below. The pictures were kept outside the repository, because this step writes one file; `npm run test:stats:browser` takes the same kind of pictures into `artifacts/screenshots`.
- **Not done:** the new tracker was not used in a browser, because its scoring screen does not exist yet: lane 2.33 draws a placeholder where it will go. I read lane 2.33's and 2.45's code and did not run their browser tests. I ran no unit tests. Nothing was tried on a real phone or tablet (that is the founder's, T-190). The size of the player's menu on a phone was not measured reliably and is not quoted.

## Summary

|                                        |                                                                                                                                                                                        |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Findings                               | 4 High, 13 Medium, 9 Low                                                                                                                                                               |
| The server half (steps 2.27 to 2.32)   | Built and landed. No High finding in it.                                                                                                                                               |
| The device's logic (2.6, 2.12, 2.34)   | Built and landed. Works for a device that stays loaded; four Medium findings for the screens that will sit on it.                                                                      |
| The scoring screens (2.35 to 2.38)     | Not started. Their plan lines leave out about a third of what the Al-Hadi tracker does, and two of the things they leave out cannot be built inside the folders the steps are allowed. |
| What people watching see (2.45, 2.104) | Built in a lane, not landed. Shows less during a game than the Al-Hadi live page does.                                                                                                 |

The three things to act on first:

1. **Players cannot be put into a game at the scorer's table** (H1). There is no command, no address and no screen for it, a person here must have a first and last name, and step 2.35 is not allowed to touch the folders where the missing parts go. The demo league's own games need it: the other schools' rosters are mostly empty.
2. **Three ways out of a mistake that the Al-Hadi tracker has are gone, with nothing planned in their place** (H2, H3): changing the game format before tip-off, reopening a game ended by mistake, and marking a game "not started".
3. **Copying the Al-Hadi screen as it is fails this area's own definition on an upright phone** (H4): measured, the second team sits a full screen below the first.

## 1. What is finished

Each of these is built, tested and on the build branch.

- **The rules engine**, unchanged and shared by server and device (`packages/sports/src/basketball/live.ts`), with the clock mode, the last-minutes stop clock, the mercy rule and the foul limit added (steps 2.66, 2.67).
- **Who may score a game, and the list of a scorekeeper's games** (step 2.27).
- **One scorer at a time**, with a lease, takeover and release (step 2.28).
- **The server taking taps**: one lock per game, each tap once by its ID, a refusal with its reason, the score and every changed box score line saved together (step 2.29, `commands/apply-tracker-commands.ts`).
- **Ending and reopening a tracked game** on the server, with standings and totals following (step 2.30).
- **Live messages** on a local stand-in, and the addresses the tracker and viewers use (steps 2.31, 2.32).
- **The device's queue**: every tap written to the device before it is shown, sent in order, kept until answered (step 2.12).
- **The device's controller**: tap, refusal and reload, takeover and read-only, the "not saved" and "not applied" lists (step 2.34, `tracker-controller.ts`).
- **The banner's wording rules** ("All saved", "12 actions waiting to send", "3 actions not saved", storage failing) as pure functions (`queue-banner.ts`, `tracker-notice.ts`).

## 2. What is not finished

- **Every scoring screen** (steps 2.35 to 2.38): nothing is drawn. A scorekeeper today reaches "This device is scoring the game. The scoring screen will appear here in a later version." (lane 2.33, `packages/site/src/messages/en.ts:613`).
- **Step 2.33** (the tracker's address, sign-in, format confirmation, what the device keeps): built in its lane, not reviewed, not landed.
- **Step 2.45** (the public game page, live): built in its lane, reviewed, not landed. **Step 2.104** (its play-by-play live): not started.
- **Step 2.113** (six known faults in the controller, from its review): not started.
- **The website on a real database** (step 2.93): the tracker runs only on the made-up stand-in.
- **League rules reaching the tracker beyond the clock mode** (steps 2.68, 2.69), **save a copy** (2.70) and **the scorer's-table setting** (2.71): part B, not started.
- **The bad Wi-Fi test** (2.61) and the demo browser tests (2.62): not started.
- **Not verified anywhere:** the real live-update service, how many viewers it carries, and any real phone or tablet.

## 3. The standard: what the Al-Hadi tracker does, as a checklist

Steps 2.35 to 2.38 answer this list line by line in their done tests. Each line says what a scorekeeper sees or does today, where that is in the Al-Hadi tracker, and the step it belongs to. "NEW" means a step proposed in section 6. "Better" marks a place where the new tracker must do better than the standard; the reason is beside it. The sections are lettered A to K, then T (the clock), P (the Players panel) and S (the screen's layout), so that no checklist line shares a name with a finding (H, M and L are findings).

File names without a folder are in `apps/live-stats/public/js/`; `track.css` is in `apps/live-stats/public/css/`.

### A. Opening the game

- **A1.** Only someone allowed to score reaches the screen; anyone else is sent to sign in or shown the public game. `track.js:1048-1054`. Step 2.33 (built: account and role in place of the passcode).
- **A2.** If the server cannot be reached, the title says it is waiting and how many unsaved actions are kept on the device, and keeps trying. `track.js:1057-1070`. Steps 2.37, 2.38.
- **A3.** The title line names the game: away at home, day and time, and the kind of game if it is not a regular-season one. `track.js:1071-1079`. Step 2.35.
- **A4.** A link back to the schedule and a link that opens the public live page in a new tab. `track.html:16-18`. Step 2.35 (back to "Your games"; the live page is the league's game page).
- **A5.** If either team has no players, the Players panel opens by itself. `track.js:1085-1087`. Step NEW-1/NEW-2.
- **A6.** Before tip-off a banner says how many players each team has and what to do next: "Check both teams' jersey numbers, tap each starting five, then start the clock", with a button to the Players panel. `track.js:636-645`, `track.html:79-84`. Step 2.35.
- **A7.** The Players button carries a badge: "!" in red when a team has no players, otherwise the number of players with no jersey number. `track.js:620-634`. Step NEW-2.

### B. The game format

- **B1.** A Format button opens a form: halves or quarters, minutes per period, overtime minutes, bonus on which team foul, double bonus (or none), full and 30-second timeouts, timeouts per game or per half, timeouts each overtime, whether unused timeouts carry over. `track.html:216-272`, `track.js:933-975`. Step NEW-3 (today refused: finding H2).
- **B2.** Three one-tap presets fill the form. `track.html:264-266`. Step NEW-3 (the league's presets: high-school, rec-league, the season's own).
- **B3.** The format can be changed only before anything is recorded and before the clock has run; after that the button is greyed and the engine refuses. `track.js:455`, `live.ts:656-661`. Step NEW-3.
- **B4.** Saving says the format back in one line, timeouts included. `track.js:971-974`. Step NEW-3.
- **B5.** NEW behaviour (P7 §5.1): the scorekeeper confirms the format before scoring. Built in lane 2.33, but it lists only periods, overtime and the clock mode. It must list every rule in B1 plus the foul limit, the mercy lead and the last-minutes stop clock (finding L5). Step NEW-3.

### C. Starting lineups

- **C1.** Until a team's lineup is set, all its players are listed and tapping one picks or unpicks them; picked players are outlined in gold. `track.js:366-377`, `699-710`, `track.css:397-400`. Step 2.35.
- **C2.** A line counts the picks ("3 of 5 picked"); the fifth pick sets the lineup at once; a "Start with 3" button sets a short-handed lineup of one to four. `track.js:367-372`, `707`. Step 2.35.
- **C3.** Picks survive a reload of the page. `track.js:96-113`. Step 2.35 (kept on the device; finding L2).
- **C4.** Setting lineups does not make the game live for viewers. `live.ts:722-725`. Step 2.35 (the engine does it; check on the public page).
- **C5.** A team with no players shows "No players yet" and an "Add players" button in place of its floor. `track.js:354-358`. Step NEW-2.

### D. The players and their options

- **D1.** Each team has its own panel: five floor tiles, then a "Bench" row. A floor tile shows the jersey number large above the name, then fouls ("2F", red), points ("7 pts") and minutes played ("4:12"), which tick while the clock runs. `track.js:311-326`, `655-661`, `track.css:347-387`. Step 2.35.
- **D2.** Players are in jersey order; a player with no number shows a faint dash. Players no longer on the roster are hidden unless they have a line in this game or are on the floor. `track.js:300-309`, `319`. Step 2.35 (finding L7).
- **D3.** Home is drawn light and away dark, on the scoreboard and around each panel; "Swap colors" swaps them, is saved with the game, and works even on a final game. `track.js:142`, `912`, `track.css:211-229`, `live.ts:608`. Step 2.35.
- **D4.** Tapping a player opens their options directly under their tile, without moving any other tile; the open tile is ringed. Tapping the tile again, anywhere else, or pressing Escape closes them. `track.js:711-712`, `793-799`, `862-873`, `track.css:433-464`. Step 2.35.
- **D5.** The options are two rows: **+1, +2, +3** (green), then **Foul** (red), **−Foul** and **TO**. −Foul is greyed when the player has no foul. `track.js:69-76`, `329-347`. Step 2.35.
- **D6.** The options stay inside their team's panel and are scrolled into view. `track.js:671-687`. Step 2.35.
- **D7.** A basket, foul or turnover closes the options and shows on the tile and the scoreboard at once. `track.js:722-762`, `181-195`. Step 2.35 (finding M6: "at once" must be measured).
- **D8.** A foul on a running clock says "Foul — #4 Jordan Ellis. Clock stopped." `track.js:730-734`. Step 2.36.
- **D9.** A turnover says "Turnover — #4 Jordan Ellis." Turnovers are not on the tiles. `track.js:753-755`. Step 2.35.
- **D10.** A player with five fouls is dimmed with a red edge; they can still be tapped and scored. `track.js:317`, `track.css:401-404`. Step 2.35. Better: the number comes from the league's foul limit (`Line.fouledOut`, `live.ts:514-516`), not a fixed five, and the tile says "Out" in words (finding M7).
- **D11.** −Foul takes back that player's latest foul, whenever it was given, and the team's count for that period drops with it. It is there because Undo only reaches the last play. `live.ts:451-458`, `track.js:5-6`. Step 2.35.
- **D12.** Tapping a player on a final game says "This game is final. Reopen it to make changes." `track.js:700`. Step 2.37.

### E. Substitutions

- **E1.** A bench player's options start with an "In for" row: one button for each player on the floor ("#23 Yusuf"). One tap makes the substitution. `track.js:331-339`, `760`. Step 2.35.
- **E2.** Dragging a bench player onto a floor player substitutes them. A label follows the finger and the tile under it lights up. A press that moves less than 8 pixels is a tap. `track.js:764-823`. Step 2.35.
- **E3.** A wrong drag is explained: "Substitutions have to stay within one team." or "Drag a bench player onto someone on the floor." `track.js:808-811`. Step 2.35.
- **E4.** A bench player can be given points, fouls and turnovers without being brought on. `track.js:346`. Step 2.35.
- **E5.** With everyone on the floor the bench says "Everyone is on the floor." `track.js:387`. Step 2.35.

### F. Team fouls, bonus and the horn

- **F1.** Each panel's title shows the team's fouls this period ("3 team fouls"); nothing at zero. `track.js:404-407`. Step 2.36.
- **F2.** The count grows and changes colour when that team has put the other in the bonus, and again at the double bonus. `track.js:408-409`, `track.css:271-281`. Step 2.36.
- **F3.** A "Bonus" or "Double bonus" badge sits beside the name of the team that is shooting it. `track.js:412-415`, `track.css:282-300`. Step 2.36.
- **F4.** When a team's bonus level rises, a horn sounds (one note for the bonus, two higher ones for the double) and the screen says "Al-Hadi — Bonus." Opening a game already in the bonus is silent. The sound is made in the tap that recorded the foul, so phones allow it, and never stops the screen if it fails. `track.js:293-296`, `416-422`, `sound.js:37-49`. Step 2.36.
- **F5.** Team fouls start again each period; overtime carries on the last period's count. `live.ts:518-523`. Step 2.36 (finding M8: the league's "reset each half" setting does not reach the engine).

### G. Turnovers and timeouts

- **G1.** Each panel's title has a "4 turnovers ▾" chip. Tapped, it lists each player's count, most first, each with a − to take one back, and "No turnovers yet. Tap a player, then TO." when empty. `track.js:566-599`. Step 2.35.
- **G2.** The list ends with "+ Team turnover" for one charged to no player, shown as "Team 1" with its own −. `track.js:592-598`. Step 2.35.
- **G3.** Each panel's title has a "5 timeouts left ▾" chip; "No timeouts left" turns red. `track.js:528-539`, `track.css:1037-1040`. Step 2.36.
- **G4.** Tapped, it offers "Full timeout" and "30-second" buttons, each saying how many are left. `track.js:548-555`. Step 2.36.
- **G5.** Calling one when none are left asks first: "…has no full timeouts left. Officials charge a technical foul for an extra one. Record it anyway?" `track.js:739-746`. Step 2.36.
- **G6.** A timeout says "Full timeout — Al-Hadi. Clock stopped." and the list closes. `track.js:747-750`. Step 2.36.
- **G7.** The list shows each timeout taken with its period and clock time, a − that takes back the latest, and the rule in one line ("3 full and 2 30-second a game · 1 more each overtime · none carried over"). `track.js:540-559`, `511-522`. Step 2.36.

### T. The clock and periods

- **T1.** The scoreboard stays at the top while the page scrolls: each team's name and score in its colour, the clock between them. `track.css:31-38`, `59-116`. Step 2.35 (the frame).
- **T2.** One button under the clock reads Start (green) or Pause (red). At 0:00 it is greyed, with the reason "Period over: pick the next period". `track.js:429-435`. Step 2.36.
- **T3.** The clock counts down by itself, four times a second, and turns red at 0:00. It is worked out from when it was started, so a sleeping tablet does not stop game time. `track.js:648-668`, `live.ts:377-388`. Step 2.36 (finding M1: it must use the server's time).
- **T4.** When the clock reaches 0:00 the screen says "End of Q1." or "Halftime." `track.js:662-667`. Step 2.36.
- **T5.** Tapping the clock asks for a new time ("minutes, or m:ss"), with a warning that setting it back takes that time off the minutes of whoever was on the floor. A wrong entry says "Enter minutes like 8, or m:ss like 6:30." Setting it back says how much was taken off. Setting the clock stops it. `track.js:889-906`, `live.ts:882-903`. Step 2.36. Better: a proper form with large number keys, not the browser's own prompt box.
- **T6.** A period picker lists every regulation period and three overtimes (more if the game ran past them). Picking one stops the clock and sets it to that period's length. `track.js:438-449`, `907-909`, `live.ts:354-360`, `698-707`. Step 2.36.
- **T7.** While the clock is stopped with time left, in a game under way or with both lineups set, a large "Start clock" button floats at the bottom of the screen, by the thumbs, showing the period and time. Before the game it reads "Start clock · tip-off". `track.js:475-493`, `track.css:1088-1127`. Step 2.36.
- **T8.** Only the button takes taps: players, substitutions and everything else keep working around and under it, for free throws on a stopped clock. A player's open options draw above it. `track.css:1097`, `444-447`. Step 2.36.
- **T9.** A line under it says why the clock is stopped ("Stopped for a foul on #4 Jordan Ellis.", "Stopped for a Al-Hadi timeout.", "Start of Q2.", "Start it at the tip.") and "Stats and subs still work; × hides this." `track.js:495-508`. Step 2.36.
- **T10.** × (or Escape) hides it until the clock next stops or the period changes. It is hidden while the Players panel is open. `track.js:468-469`, `883-888`, `1003`. Step 2.36.
- **T11.** The page leaves room to scroll its last rows out from under the button. `track.css:1194-1197`. Step 2.36.
- **T12.** NEW (P7 §5.2, S-21): a switch for running clock or stop clock, usable at any moment; a notice when the mercy rule switches it, with a way back; a sign when the last-minutes stop clock is on. Step 2.69.

### I. Undo, the play log and messages

- **I1.** Undo takes back the last play and Redo puts it back; each is greyed when there is nothing to act on. A new play empties Redo. `track.js:451-452`, `910-911`, `live.ts:640-655`, `721`. Step 2.37.
- **I2.** Undo acts on plays: baskets, fouls, turnovers, timeouts, substitutions, lineups, period changes and their take-backs. It never touches the clock: Start, Pause and setting the clock are not plays. Undoing a period change puts the clock back where it was. `live.ts:222-233`, `640-647`. Step 2.37 (finding M2: step 2.36's done test says otherwise).
- **I3.** The Undo button's hint says what it will undo ("Undo: #4 Jordan Ellis +2"). `track.js:453-454`. Step 2.37. Better: a hint needs a mouse. On a tablet the scorekeeper cannot see what Undo will remove; the new tracker shows it in words on or beside the button.
- **I4.** The play log lists every play, newest first, in a box that scrolls: period and clock, what happened, and the running score after a basket. Its title counts them: "42 plays · all saved" or "42 plays · 3 saving". Plays not yet on the server are dimmed. `track.js:601-618`, `track.css:574-618`. Step 2.37 (finding L1).
- **I5.** One message line shows the latest thing said for about three seconds and is read out by screen readers. `track.js:689-695`, `track.html:175`. Step 2.37.
- **I6.** An action the rules refuse says why in a sentence the scorekeeper can act on ("This period is over. Pick the next period first.", "That player is already on the floor."). `track.js:186-189`, the `fail(…)` lines of `live.ts`. Step 2.35 (finding M3).
- **I7.** A hint under the panels says in four sentences how the screen works. `track.html:162-167`. Step 2.35 (A-10).

### J. Ending, reopening and starting over

- **J1.** End game asks first: "End this game? The final score goes on the schedule and the box score counts toward season stats. You can reopen it to correct something." Then: "Game over — final score and stats saved." `track.js:921-929`. Step 2.37.
- **J2.** A game with nothing recorded cannot be ended. `live.ts:665-666`. Step 2.37.
- **J3.** NEW: a level score cannot be ended unless the season allows ties; the scorekeeper is told to play overtime. `commands/apply-tracker-commands.ts:187-190`. Step 2.37.
- **J4.** A final game shows "Final. Everything is saved." with a Reopen button; End game disappears; the clock, the period picker, Undo and Redo are greyed. `track.html:86-89`, `track.js:451-460`. Step 2.37 and NEW-4 (today a scorekeeper cannot reopen: finding H3).
- **J5.** "Mark not started" asks first, then clears the score and every stat and shows the game as scheduled again. `track.js:913-920`, `live.ts:674-678`. Step NEW-5 (today refused: finding H3).

### K. Saving, the connection and signing in

- **K1.** One line under the buttons always says where things stand: "Nothing recorded yet." / "Saving…" / "Saved to the database · 7:04:11 PM" (green) / "Not connected — 12 actions kept on this device and sent when the connection is back." (red, bold) / "Not saved yet — (reason) 3 actions kept on this device; trying again." `track.js:264-290`. Step 2.37 (A-4: "saved" only ever means on our servers; finding L1 for the time).
- **K2.** A tap is kept on the device before it is sent, sent in order, and sent again after a pause that doubles up to 15 seconds. `track.js:115-130`, `215-254`. Built (steps 2.12, 2.34).
- **K3.** Only an answer that means the action can never be saved drops a tap, and the scorekeeper is told "Not saved: (why)". No answer, a server fault or a sign-in problem keeps it. `track.js:206-212`, `246-249`. Built (the "not applied" and "not saved" lists); their screens are step 2.37.
- **K4.** When the connection comes back, sending starts at once. `track.js:1081-1084`. Built; step 2.37 wires the browser's "online" event (lane 2.33 already does).
- **K5.** If the sign-in runs out mid-game, the tracker keeps taking taps and the line says "Signed out — 12 actions kept on this device. Sign in to send them", with a link that comes back to this game. `track.js:199-200`, `233-236`, `269-273`. Step 2.37 (finding M4: the new controller stops taking taps).
- **K6.** A reload or a closed tab loses nothing that was tapped. `track.js:81`, `115-122`. Built (step 2.12) while there is a connection; with no connection the reload cannot get back to scoring (finding M5). Step 2.38.
- **K7.** NEW (T6 §4, §5): after several minutes offline a plain warning that suggests saving a copy; the takeover question naming who holds the game; the read-only notice saying why, with what was not saved listed play by play so it can be entered again. Steps 2.37, 2.70.

### P. The Players panel

- **P1.** A panel slides in from the left over the dimmed tracker with both teams side by side, each in its colour, and a Done button. Tapping outside it or Escape closes it. `track.js:978-1036`, `track.css:627-700`. Step NEW-2.
- **P2.** Every player is a row: jersey number box, name box, a mark (… saving, ✓ saved, ! failed) and × to remove. A change is saved 0.6 seconds after typing stops and when the row is left. `roster-editor.js:60-65`, `104-148`. Step NEW-2.
- **P3.** An add row takes a number, a name, or both; one alone is enough. Enter moves from number to name, then adds and returns to the number box for the next player. `roster-editor.js:35-39`, `150-185`, `255-275`, `packages/contracts/src/live-stats.ts:12-14`. Step NEW-2.
- **P4.** A second box takes several numbers at once ("3 5 10 12"). It adds each new one, says which were already there and which are not jersey numbers, and after a failure leaves in the box only those still to add. `roster-editor.js:14-23`, `187-234`. Step NEW-2.
- **P5.** A jersey is 0 to 99 or 00; other characters cannot be typed. Two players on one team with the same number are both marked, with "#5 is down for 2 players." It warns; it does not refuse. `roster-editor.js:10`, `77-94`, `236-241`. Step NEW-2.
- **P6.** Removing asks first: "Remove … from the roster? Games they already played keep their stats." `roster-editor.js:279-294`. Step NEW-2.
- **P7.** Nothing typed is lost: Done, closing the panel and closing the page all save what is in the boxes, a half-typed new player included. `roster-editor.js:297-310`, `track.js:1014-1040`. Step NEW-2.
- **P8.** While typing on a touch screen the panel leaves room above the keyboard. `track.css:733-737`. Step NEW-2.
- **P9.** A save that fails is said on the tracker too, since the panel may be closed by then. `track.js:998-999`. Step NEW-2.

### S. Layout, measured

Measured in the Al-Hadi tracker with 12 players a side, a game under way and the clock stopped by a foul.

| Size                       | Scoreboard and buttons          | The two teams                                                                                            | Floor tile | Option button | Start clock button |
| -------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------- | ------------- | ------------------ |
| Tablet lying down 1180×820 | 212 px high, one row of buttons | Side by side, 566 px wide each, both on screen; the Start clock button covers part of the last bench row | 128 × 98   | 66 × 60       | 560 × 92           |
| Tablet upright 820×1180    | 204 px                          | Stacked, 396 px high each; both on one screen                                                            | 148 × 98   | 58 × 54       | 560 × 80           |
| Phone upright 390×844      | 281 px, a third of the screen   | Stacked; the first is 725 px high, so the second starts 741 px lower: a full screen below                | 166 × 98   | 58 × 54       | 358 × 80           |
| Phone lying down 844×390   | 114 px                          | Side by side, 411 px wide, 235 px high, each scrolling by itself; the play log is hidden                 | 76 × 80    | 46 × 42       | 400 × 54, one-line |

- **S1.** Dark background, light text, gold for labels, green for points and Start, red for fouls and Pause, blue for timeouts. Nothing on the screen can be selected by a long press, and a double tap does not zoom. `track.css:2-23`. Steps 2.35, 2.103 (finding M10: nobody has decided the new tracker's look).
- **S2.** Two teams side by side above 880 px wide; stacked at 880 px and below; on a phone lying down, side by side again in one screen with the title line, hint and play log hidden. `track.css:232-237`, `800-945`. Step 2.35.
- **S3.** Stated target: 44 px or more for everything tapped (`track.css:320`). Measured misses in the standard: the clock itself is 80 × 30 (it is the button that sets the clock), the timeouts and turnovers chips are 27 px high, and on a phone lying down every header button is 30 px high and the options are 46 × 42. Step 2.35/2.36. Better: nothing tapped during play is under 44 × 44 at any of the four sizes (finding L3).
- **S4.** Keyboard: Enter or Space on a player or option does what a tap does; focus moves into the opened options and back to the tile afterwards; Escape closes options, the Players panel, then the Start clock button; a blue outline shows focus. `track.js:825-873`, `track.css:405-411`. Steps 2.35 to 2.37.
- **S5.** The Start clock button's pulse and the panel's slide stop for people who ask their device for less motion. `track.css:738-743`, `1189-1193`. Steps 2.35, 2.36.
- **S6.** Better, and the rule for the new screens (finding H4): **on an upright phone (390 × 844) the scorekeeper records a basket, a foul or a substitution for either team's floor players without scrolling.** The score, clock, Start or Pause, period and the saved banner stay in view and take no more than about a quarter of the screen. The buttons used once a game (swap colors, players, format, mark not started, end game) go behind one "More" button on a phone. How it is laid out is the builder's to design and the area lead's to review, with pictures at all four sizes.

## 4. Findings

Each has its severity, its proof, what the spec says, and the step it belongs to. Proposed steps are in section 6.

### High

**H1. A player cannot be put into a game at the scorer's table.**

- _What a scorekeeper meets:_ a team arrives with a player who is not on its roster, or with no roster at all. There is nothing to tap.
- _Proof:_ (1) No command adds a person to a team from a game: a search of `packages/core` and `apps/web` for the walk-up mark finds only the table columns (`supabase/migrations/0010_live_game_calculated_imports.sql:511-536`) and test helpers. (2) The server refuses a tap naming anyone not on the roster: "That player is not on this team. Reload the roster." (`packages/core/src/modules/games/live-game.ts:133-144`). (3) A person here needs a first and a last name (`packages/core/src/modules/people/commands/create-person.ts:18-19`; decision F-13: "a person needs a first and last name"), so "#12" with no name, which is how the Al-Hadi scorekeeper enters an opposing team (checklist L3, L4), cannot exist. (4) The device gets rosters once, with the page; record 054 says "There is no HTTP door for it yet", so a device cannot pick up a player added a minute ago. (5) Step 2.35 says "add a player on the spot by name and number" but its folders are `apps/web/src/features/tracker` only, so it cannot add the command, the address or the rule. Step 2.71 has those folders but is part B and "Needs: 2.35".
- _Worked example:_ the demo league. Al-Hadi's games are tracked; "Other schools' rosters only where TCSAAL already shows them" (STAGE-2.md, "Needs the founder"). Al-Hadi hosts a school with no roster here. In the Al-Hadi tracker the Players panel opens by itself and the scorekeeper types "3 5 10 12 14 21 23 30" during warm-ups: eight players in one line. In the new tracker, as planned, the visiting team cannot be scored at all.
- _Spec:_ P7 §5.2 "Add a player on the spot (name and number) for either team"; S-6: allowed and flagged is the starting setting "so game night is never blocked by paperwork"; P7 §2 "Jersey numbers are set on the roster and can be changed at the scorer's table"; T6 §4 and S-5: no Wi-Fi in the gym is not a problem.
- _Also missing with it (Medium on their own):_ changing a jersey number at the table, renaming and removing (P7 §2; checklist P2, P6) are in no step.
- _Belongs to:_ NEW-1 (the server half, part A) and NEW-2 (the panel); step 2.71 keeps the league setting and the admin's review list.
- _Product answers the lead needs to give first_ (each is the founder's to change later): whether a player may be added with a number and no name (recommended: yes, shown as "#12" everywhere, which is also the most private choice for a child); whether a scorekeeper may change the jersey number of a player in the game they are scoring (recommended: yes, P7 §2 says so); what happens when the season wants unique numbers and two players wear the same one at the table (recommended: refuse with a plain sentence naming who already has it).

**H2. A wrong game format cannot be put right at the table, and in part A not by anyone for one game.**

- _What a scorekeeper meets:_ the confirmation screen says "2 halves of 20 minutes" and the officials are playing 8-minute quarters. The screen's answer is "ask a league admin to change the game format before you start" (lane 2.33, `packages/site/src/messages/en.ts:610-611`).
- _Proof:_ the server refuses the tracker's `rules` command: "The game's rules come from the league's settings." (`live-game.ts:38-39`), and the device cannot even make one (`tracker-controller.ts:50`). An admin's way to give one game its own rules is step 2.68, part B, not built. The season settings screen (step 2.47) is not built either: there is a command that sets a season's rules (step 2.15) and no screen that calls it. Record 054 lists it as open: "The founder decides who may correct a wrong format at the scorer's table."
- _The standard:_ a Format button with three presets, usable until the first play (checklist B1 to B4).
- _Spec:_ P7 §5.1 "confirms the game format"; S-21: "A single game can be given different rules before it starts" and "the scorekeeper can override anything automatic at the table".
- _Why High:_ a game played under the wrong format has the wrong clock, the wrong periods and the wrong bonus for its whole length, and the format is fixed the moment the game goes live (`apply-tracker-commands.ts:215-229`), with no way back (H3).
- _Belongs to:_ NEW-3, in part A.
- _Product answer needed:_ who may change one game's format before tip-off. Recommended: a league setting, "scorekeepers may change a game's format before it starts", on by default, which is how Al-Hadi's games are run today and leaves the choice with the admin.

**H3. Two ways out of a mistake are gone: reopening a game just ended, and marking a game not started.**

- _Proof, reopening:_ `games.reopen_game` needs `games.correct` (`packages/core/src/modules/games/commands/reopen-game.ts:26`); the scorekeeper role has only `games.score` (step 2.13), and `reopen-game.test.ts:89` checks that a scorekeeper is refused. The tracker's own reopen tap is refused: "A final game is reopened by an admin, with a reason." (`live-game.ts:40`). No step gives the scorekeeper a window: a search of STAGE-2.md and DECISIONS.md for the rule finds nothing. The admin's own reopen screen is step 2.56, not built.
- _Worked example:_ with 1:40 left the scorekeeper means to tap Pause and taps End game, then OK. The game is final, standings move, and in stage 4 the recap goes out ten minutes later. In the Al-Hadi tracker: tap "Reopen game", carry on (checklist J4). Here: find an admin. Until then the last 1:40 cannot be scored.
- _Spec, reopening:_ P7 §5.5: "An admin (or the scorekeeper, within a time the league sets) can reopen a final game with a reason"; A-5: "Nothing important is lost by one wrong tap".
- _Proof, not started:_ the server refuses `reset`: "Resetting a game is not taken here yet." and its comment says "a game is reset through a later step's own command" (`live-game.ts:33-41`). No step in STAGE-2.md is that step.
- _Worked example:_ a new scorekeeper tries the tracker on tonight's game an hour early: picks lineups, taps Start, scores a basket. They can undo the basket and set the clock back, but the game stays live: the public schedule shows "Live, 0–0" an hour before tip-off, and its format is fixed. The Al-Hadi tracker has "Mark not started" (checklist J5).
- _Belongs to:_ NEW-4 (reopen) and NEW-5 (not started).
- _Product answer needed:_ how long after the end a scorekeeper may reopen. Recommended: a league setting starting at 30 minutes, with a reason required as for an admin (S-7).

**H4. On an upright phone the standard itself does not meet this area's definition, and the plan says to copy it.**

- _Proof (measured, section 3 S):_ at 390 × 844 the Al-Hadi tracker's scoreboard and buttons hold 281 px, a third of the screen, at the top. The first team's panel is 725 px high. The second team's panel starts 741 px further down. With 563 px of screen left under the scoreboard, the scorekeeper sees part of one team; a basket for the other team is a full-screen scroll away, and the next basket for the first team is a full-screen scroll back. The whole page is about 2,470 px high, close to three screens.
- _What the plan says:_ step 2.35 "behaving as the current tracker does… Large targets for a phone or tablet"; step 2.36 "all as the current tracker does". The Al-Hadi tracker's own answer for a phone is to turn it on its side (`track.css:826`), which works, but nothing tells the scorekeeper so, and there every header button is 30 px high.
- _Spec:_ P7 §5.1 "on a phone or tablet"; A-2 (works at phone width); LEADS.md area 4: "without hunting for a button".
- _Belongs to:_ step 2.35, which should own the screen's frame at all four sizes before 2.36 and 2.37 fill it. The rule is checklist line S6.

### Medium

**M1. The clock on the scoring screen has no server time to count from.**
The engine's clock is anchored to server time: a tap's time is the device's clock plus an offset the controller measures (`tracker-controller.ts:216`, `298`, `644`). The offset is private; the controller's status (`tracker-controller.ts:87-100`) gives the screens no way to ask "what time is it on the server". The Al-Hadi tracker paints its clock with `serverClock.now()` (`track.js:392`, `657`). Worked example: a tablet whose clock is 30 seconds slow. The scorekeeper taps Start at server time T; the state says the clock started at T. A screen that paints with the device's own time reads T minus 30, so the clock stands still for 30 seconds, and minutes played with it. A tablet 30 seconds fast shows 30 seconds gone the moment Start is tapped. Spec: T6 "The clock" (T-121); record 036 "timed by the server's clock, never the device's". Belongs to: step 2.113 (it already changes how the offset is measured), which should expose a `now()`; step 2.36 uses only that.

**M2. Step 2.36's done test asks for something the engine does not do: undoing a clock correction.**
The line says "a clock correction and a period change can be undone". Undo takes back the last _play_ (`live.ts:640-647`); setting the clock is not a play (`live.ts:222-233`, `637-639`). Worked example: Q1, 6:30, the last play is "#4 +2". The scorekeeper sets the clock to 7:00, then taps Undo to get 6:30 back. The engine removes #4's basket; the score drops by two and the clock still reads 7:00. T-110 says the engine is not redesigned, so the done test is wrong, not the engine. On a tablet the scorekeeper also cannot see what Undo will remove (checklist I3). Belongs to: step 2.36 (correct the line: a clock correction is put right by setting the clock again) and step 2.37 (Undo names its play on the button).

**M3. Nothing turns the engine's sentences into the tracker's own words.**
The engine refuses with English sentences written for the scorekeeper (47 `fail(…)` lines in `live.ts`) and describes plays in English (`describePlay`, `live.ts:925-959`); the Al-Hadi tracker shows both as they are. The platform's rule is that every word on a screen comes from the message files (T-187), and the controller hands the screens the engine's sentence marked "for the log, not the screen" (`tracker-controller.ts:106`). No step makes the table from the engine's refusals and play kinds to message keys, so each of three builders would make their own, or show nothing. A scorekeeper who is not told "This period is over. Pick the next period first." taps Start again and again. Lane 2.45 already words plays for the public page (`apps/web/src/features/live-game/game-words.ts`); the tracker's play log should read the same. Belongs to: step 2.35 (first screen step), shared by 2.36 and 2.37, with a test that fails when the engine gains a refusal or a play kind that has no words.

**M4. When the sign-in runs out mid-game, the new tracker stops taking taps.**
The controller turns read-only on a 401 (`tracker-controller.ts:541`, `170-176`) and a read-only device refuses every tap (`639-641`). The Al-Hadi tracker keeps taking taps and holds them until the scorekeeper signs in (checklist K5). Lane 2.33's notice says "Sign in again to keep scoring" with no link, and offers no "open again" for this case (`tracker-opening.tsx:187-188`). So the scorekeeper must leave the game, sign in with a code or password, find the game again and reopen it, while play goes on unrecorded. Spec: T6 §4, T-114; A-5. Belongs to: step 2.113 (keep scoring while signed out; hold the taps) and step 2.37 (a sign-in link that returns to this game).

**M5. A reload with no signal cannot get back to scoring, and step 2.38's line does not say what must change.**
After a reload the controller asks the server for the scoring session first and, unanswered, waits and asks again (`tracker-controller.ts:525-534`); the screen stays on "Opening the game…". Phones reload a page by themselves when the scorekeeper switches apps and comes back. The device keeps the rosters, the server's last state and the confirmed format, but not the session it held (lane 2.33, `opened-game-storage.ts:60-69`), and each tap must be stored with the session it was made under (T-253). So "opens with no signal once loaded" needs the controller to start from what the device holds, with the session kept on the device, as records 049 and 054 both say under "Revisit if". Step 2.38's done test covers it ("goes offline, reloads and keeps scoring"); its text names only a manifest and a service worker. Belongs to: step 2.38 (name it in the line).

**M6. How long a tap takes to show has never been measured.**
T6 §10: "Tap to visible on the tracker: Immediate". In the new tracker a tap is shown only after a durable write to the device's database and then a read of the whole queue (`tracker-controller.ts:657-663`, `tracker-queue.ts:398-415`, `indexeddb-queue-storage.ts:84`, `144`), and taps go one at a time. The Al-Hadi tracker shows a tap in the same instant (`track.js:190-192`). After a half offline with 300 taps waiting, every tap reads 300 rows first. On a five-year-old tablet (T6 §10) this may be felt; nobody knows. Belongs to: step 2.35's done test: with 500 taps waiting and the processor slowed four times, a tap is painted within 100 milliseconds 95 times in 100; if it is not, the fix is in the queue, and the write-before-show rule (T-114) stays.

**M7. In part A the new tracker knows nothing about fouling out; the Al-Hadi tracker does.**
The season's rules carry a foul limit (default five, P7 §1), but the function that hands rules to the engine drops it, with the mercy lead and the last-minutes stop clock (`packages/core/src/modules/games/engine-rules.ts:15-29`), and the tracker's door takes only the Al-Hadi command set, so the clock-mode switch is refused (`packages/contracts/src/tracker-protocol.ts:50` uses `Envelope`, not `PlatformEnvelope`, `live-stats.ts:113-120`). All of that is step 2.68, part B. The Al-Hadi tracker dims a player at five fouls today (`track.js:317`). So at the demo the rebuilt tracker would do less than the one it replaces. Belongs to: bring the rules half of step 2.68 into part A (NEW-6); the fouled-out mark then belongs to 2.35.

**M8. A league whose team fouls reset each half, playing quarters, gets the bonus late or never.**
The season setting has three choices (`packages/contracts/src/season-rules.ts:58`); the engine always counts by period (`live.ts:518-523`); `engine-rules.ts:7-11` says so and names step 2.68, whose line does not mention it, and only steps 2.66 and 2.67 (both landed) may change the engine. Worked example: quarters, bonus on the 7th team foul of the half. Home commits 4 fouls in Q1 and 3 in Q2: seven in the half, so the visitors are in the bonus. The tracker shows "3 team fouls", no badge, no horn, and the public page shows 3. (The note in `engine-rules.ts` says the bonus "can show early"; it is the other way round: finding L8.) Spec: P7 §1 "When team fouls reset". Belongs to: NEW-7 (an engine step), or hide the choice until then. Shared with area 6 (the numbers).

**M9. Three builders are set to draw one screen, and their needs leave out the two steps they stand on.**
Steps 2.35, 2.36 and 2.37 are in one wave, share one folder, and each owns a part of one screen; none owns the screen. That is the fault LEADS.md describes ("no step owned how it looks"). Their "Needs" name 2.34, 1.18 and 2.107 but not step 2.33, inside whose page they draw (`tracker-opening.tsx:295-311`), nor step 2.113, which fixes six known faults in the controller they call, two of them about taps being lost from the "not saved" list. Belongs to: the plan. Step 2.35 first, owning the frame at four sizes; then 2.36 and 2.37 side by side; all three need 2.33 and 2.113.

**M10. Nobody has decided how the new tracker looks.**
The standard is dark, with its own colours, whatever the league's site looks like (checklist S1); Al-Hadi's own site is light. The platform's rule is that pages are styled only through a league's design values (T-90), DESIGN.md does not mention the scoring screen, and step 2.103 covers "the frame of the scoring screen" only. A scoring screen in a league's pale colours, in a bright gym, with team colours that may be two shades of blue, is worse than the standard. Recommended (a technical and design choice for the lead and the design lead): the tracker has one fixed courtside look of its own, as SR Leagues' own pages have a neutral one, with light and dark for the two teams and the swap. Belongs to: DESIGN.md, before step 2.35 opens.

**M11. People watching see less during a game than on the Al-Hadi live page.**
The Al-Hadi live page shows, live: team fouls, timeouts left and the bonus under each score, and for every player minutes, points, 3-pointers, 2-pointers, free throws, turnovers and fouls, with those on the floor marked (`game.js:49-95`). The new page, while a game is live, shows each player's points and fouls only (lane 2.45, `apps/web/src/features/live-game/build-game.ts:90`), because the snapshot carries only those (`tracker-protocol.ts:248-257`); it has no bonus and no timeouts, and its play-by-play stands still until step 2.104. Spec: P7 §5.3 "the scoreboard and clock, both teams' box scores and the play-by-play, updating within about two seconds". Belongs to: step 2.104 (widen it: the snapshot carries the bonus, timeouts left and each player's full line as the season's statistics and the team's setting allow).

**M12. Live updates on the real service are in no step.**
Locally, pages listen to a stand-in inside the web app. For the real service two things are missing and unplanned: the rules on the Supabase project that let a browser only listen, and only to leagues it may open (T-233; STATUS.md: "a migration that does not exist yet"), and pointing the game and schedule pages at the real service (record 051, "Revisit if"). Without them an online game page still follows a game by asking again every 5 seconds (T-119), so it works, but misses the two-second target, and the service must not be switched on before the rules exist. Belongs to: NEW-8; shared with areas 5 and 7.

**M13. The first-time path is never rehearsed in a test.**
Step 2.61 (bad Wi-Fi) and step 2.62 play a game on a seeded league with full rosters. Nothing tests the table as it really is: a team with no roster, a reload with no signal, more than an hour offline before the connection returns (the sign-in's access token lasts 60 minutes, T-225, and is renewed on the way in, which nobody has tried for the tracker's address), a phone that reloads the page by itself. Belongs to: step 2.61 (add these four cases).

### Low

- **L1.** The controller's status gives the count of taps waiting, not which plays they are, and no time of the last save; the standard dims unsaved plays and shows "Saved · 7:04:11 PM" (checklist I4, K1). Step 2.113 exposes both; step 2.37 uses them.
- **L2.** Lineup picks must survive a reload (checklist C3); the device's game store has no place for them yet. Step 2.35.
- **L3.** Do not copy the standard's small targets (checklist S3). Steps 2.35, 2.36.
- **L4.** `scripts/shots.mjs` photographs pages as they open; the scoring screen needs a scripted game to photograph each state (lineups, options open, clock stopped, timeouts open, offline, read-only, final). Step 2.35 adds the script; 2.36 and 2.37 add states.
- **L5.** The format confirmation lists four of the rules (lane 2.33, `opened-game-storage.ts:38-43`). A wrong bonus number or timeout count is exactly what a scorekeeper should catch before tip-off. NEW-3.
- **L6.** Step 2.37 names the "A-4, A-5" decisions but not the standard's messages; the checklist's K and I sections are now its list.
- **L7.** Players who have left a team reach the device marked `left` (lane 2.33, `opened-game-storage.ts:19-26`); the screen should hide them unless they have a line in this game, as the standard does (checklist D2). Step 2.35.
- **L8.** `packages/core/src/modules/games/engine-rules.ts:9-10` says the bonus "can show early"; it shows late (M8). Correct the note with NEW-7.
- **L9.** The tracker's browser code is about 231 KB (STATUS.md, lane 2.33's note). It is stored on the device and must load on a slow phone; slim it before step 2.38, as the lead already noted.

## 5. The plan against the standard, step by step

| Step                          | State                | What its line lacks, against section 3                                                                                                                                                                                                                                                                                   |
| ----------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2.27 to 2.32                  | Landed               | Nothing for the standard. They refuse three of its commands (rules, reopen, reset) on purpose: H2, H3.                                                                                                                                                                                                                   |
| 2.33                          | Built, not landed    | Format confirmation lists four rules (L5) and cannot be corrected (H2); signed-out notice has no link (M4); no session kept on the device (M5).                                                                                                                                                                          |
| 2.34                          | Landed               | No server time for the clock (M1); stops taking taps when signed out (M4); cannot start with no signal (M5); does not say which plays wait (L1). Six more faults are step 2.113.                                                                                                                                         |
| 2.35 Lineups and scoring pad  | Not started          | The frame and the phone layout (H4, M9); −Foul, taking back a turnover, team turnovers (D5, G1, G2); swap colors (D3); the pre-game banner and hint (A6, I7); the engine's words (M3); the look (M10); the fouled-out mark (M7); the tap-speed measure (M6). Adding players cannot be built in its folders (H1).         |
| 2.36 Clock, periods, fouls    | Not started          | A done test the engine contradicts (M2); server time (M1); why the clock is stopped, × and Escape (T9, T10); the over-the-limit timeout question, taking a timeout back, the list of those taken (G5, G7); "End of Q1" and "Halftime" (T4); what the horn is for, exactly (F4): it is the bonus horn, not a period horn. |
| 2.37 Plays, undo, end, banner | Not started          | Undo naming its play (I3); the final panel and reopen (J4, H3); mark not started (J5, H3); the level-score refusal (J3); the signed-out state (K5, M4); which plays are unsaved (I4).                                                                                                                                    |
| 2.38 Installable, offline     | Not started          | The controller starting from what the device holds, and the session kept on the device (M5); a slimmer download (L9).                                                                                                                                                                                                    |
| 2.45, 2.104                   | 2.45 built in a lane | Bonus, timeouts and full player lines while live (M11).                                                                                                                                                                                                                                                                  |
| 2.61                          | Not started          | The four real-table cases (M13).                                                                                                                                                                                                                                                                                         |
| 2.68, 2.69                    | Not started, part B  | The rules half is needed in part A (M7); team fouls reset is in neither (M8).                                                                                                                                                                                                                                            |
| 2.70 Save a copy              | Not started, part B  | Nothing found. Its warning after several minutes offline is in 2.37 (K7).                                                                                                                                                                                                                                                |
| 2.71 Scorer's-table setting   | Not started, part B  | Needs the server half of H1 to exist first; then it adds the setting and the review list.                                                                                                                                                                                                                                |
| 2.113                         | Not started          | Should also carry M1, M4 and L1, and be a need of 2.35 to 2.37.                                                                                                                                                                                                                                                          |

## 6. Proposed steps

The lead numbers these and adds them, or writes in the log why not. "Needs" lists steps by their present numbers. Every screen step also carries the page-step checks, pictures at the four sizes of section 3 S, the design review and this area lead's review.

### Changes to steps 2.35 to 2.38

**2.35 The scoring screen's frame, lineups and the scoring pad.**

- _Who it is for:_ a scorekeeper at the table with a phone or a tablet.
- _What they see and do:_ the whole scoring screen in its final arrangement at four sizes (checklist T1, S1, S2, S5, S6), with the places for the clock controls, the play log and the banner left for 2.36 and 2.37; the title, the links and the pre-game banner (A3, A4, A6); picking lineups (C1 to C4); player tiles and their options (D1 to D11); substitutions by "In for" and by dragging (E1 to E5); turnovers and team turnovers (G1, G2); swap colors (D3); the hint (I7); and every refusal said in a sentence from the message files (I6).
- _It also makes, for 2.36 and 2.37 to share:_ the table from the engine's refusals and play kinds to message keys (M3), and the script that plays a game for the pictures (L4).
- _Needs:_ 2.33, 2.113, 2.107, NEW-6, and the look decided in DESIGN.md (M10).
- _Done test:_ checklist sections A (A3, A4, A6), C, D, E, G1 and G2, I6, I7 and S answered line by line with pictures at 390 × 844, 844 × 390, 820 × 1180 and 1180 × 820; at 390 × 844 a basket, a foul and a substitution for each team's floor players are recorded in a browser test that never scrolls; nothing tapped during play is under 44 × 44 at any size; with 500 taps waiting and the processor slowed four times a tap is painted within 100 ms 95 times in 100 (finding M6); a test fails if the engine has a refusal or a play kind with no message; component tests for each action against the engine's own results; usable by keyboard (S4).
- _Model:_ fable, high. Opened alone; 2.36 and 2.37 open when it lands.

**2.36 Clock, periods, fouls and timeouts.**

- _Who it is for:_ the same scorekeeper, once the game is under way.
- _What they see and do:_ checklist D8, F1 to F5, G3 to G7 and T2 to T11: Start and Pause, the clock counting from the server's time, setting it through a form with large keys, the period picker with overtime, "End of Q1" and "Halftime", the floating Start clock button with its reason, × and Escape, team fouls growing at the bonus, the badge, the bonus horn with its sentence, timeouts by length with the over-the-limit question, the list of those taken and taking the latest back.
- _Needs:_ 2.35 (as changed), 2.113.
- _Done test:_ those checklist lines answered with pictures at four sizes; a tablet whose clock is 30 seconds wrong shows the same clock as a correct one, in a test with a controlled clock (M1); a period change is undone and the clock returns to where it was; a clock set wrongly is put right by setting it again, and Undo after it removes the last play and says so before it is tapped (M2, with 2.37); component tests for each control; the horn's failure never stops the screen.
- _Change to the line:_ remove "a clock correction… can be undone".

**2.37 Plays, undo, ending and the saved banner.**

- _Who it is for:_ the scorekeeper who has made a mistake, lost the connection, lost the game to another device, or finished.
- _What they see and do:_ checklist I1 to I5, J1 to J4, K1, K3 to K5, K7 and D12: Undo and Redo, with Undo naming its play in words; the play log with unsaved plays dimmed and its count; the banner with the time of the last save; the warning after several minutes offline; the "not applied" and "not saved" lists play by play, in the tracker's words; the takeover question; the read-only notice; signed out with a link that returns to this game; End game with its question, the level-score refusal, and the final panel.
- _Needs:_ 2.35 (as changed), 2.30, 2.113, NEW-4.
- _Done test:_ those checklist lines answered with pictures; a component test for each state of the banner, each read-only reason and each dialog; a browser test in which the sign-in is ended mid-game, three taps are made, the scorekeeper signs in from the link and the three taps are saved once (M4).

**2.38 Installable, offline tracker.**

- _Who it is for:_ a scorekeeper in a gym with no signal, whose phone has just reloaded the page.
- _What they see and do:_ add the tracker to the home screen; reopen a game they opened earlier with no signal and carry on scoring within a few seconds, with the banner saying how many actions are waiting; a new version never arrives mid-game.
- _Add to the line:_ the controller starts from the state, rosters and scoring session the device holds when the server does not answer, and settles with the server when it does (M5; T-248, T-253); the session is kept on the device and cleared with the game; the download is slimmed first (L9).
- _Needs:_ 2.33, 2.37, 2.113.
- _Done test:_ as written, plus: the reload happens with the network off from before the page loads; the taps made after it are accepted when the network returns if nobody took the game, and listed as not saved if somebody did; signing out still clears the kept games.

### New steps

**NEW-1. Players at the scorer's table: the server half (part A).**

- _Who it is for:_ a scorekeeper facing a team with a missing player or no roster.
- _What they can do when it lands:_ nothing new on screen; it is the door NEW-2 uses.
- _What it builds:_ a way for whoever may score a game to add a player to either of its teams (a number, a name, or both), change a number or a name, and take a player off the game's list, each for that game's two teams only. Added players carry the game and the "to review" mark the tables already have (migration 0010), following S-6's starting setting. A technical choice for the lead to record: these travel in the tracker's own queue as commands the server handles before the engine (so they work with no signal, arrive in order before the plays that name the player, and are safe to send twice), or through an address of their own that needs a connection, as in the Al-Hadi tracker. I recommend the queue: the spec promises a gym with no Wi-Fi. Also an address from which the device refreshes a game's rosters.
- _Needs:_ 2.29, 2.19; the three product answers under H1.
- _Folders:_ `packages/contracts/src`, `packages/core/src/modules/games`, `packages/core/src/modules/teams`, `packages/core/src/modules/people`, `packages/database`, `apps/web/src/app/api/v1`, `apps/web/src/server`.
- _Done test:_ a scorekeeper adds eight number-only players to the visiting team and scores one of them; the same request sent twice adds each once; a scorekeeper of another game, and another league's admin, are refused; in a season with unique numbers a second "5" is refused in a plain sentence; the added players are marked for review and named as "#12" on the public page; isolation cases; role tests.
- _Model:_ opus, high.

**NEW-2. The Players panel on the tracker (part A).**

- _Who it is for:_ the same scorekeeper, during warm-ups.
- _What they see and do:_ checklist A5, A7, C5 and P1 to P9: the panel opens by itself when a team has no players; both teams side by side; add one player, or several numbers in one line; fix a number or a name; remove; duplicates marked; nothing typed is lost; with no signal the panel still works and the banner counts what is waiting.
- _Needs:_ 2.35 (as changed), NEW-1.
- _Folders:_ `apps/web/src/features/tracker`.
- _Done test:_ those checklist lines answered with pictures at four sizes; a browser test that opens a game whose visiting team has no roster, types "3 5 10 12 14", sets both lineups and scores a basket for #12, then does the same with the network off.
- _Model:_ fable, high.

**NEW-3. The game format at the table (part A).**

- _Who it is for:_ a scorekeeper told by the officials that tonight is played differently, and the admin who decides whether scorekeepers may change it.
- _What they see and do:_ before the first play, the confirmation lists every rule (B5, finding L5) and has "Change the format": the form of checklist B1 with the league's presets (B2), saved for this game only, said back in one line (B4), greyed once the game is under way (B3). An admin sees a league setting, "Scorekeepers may change a game's format before it starts", and can give any game its own format from the games area.
- _What it builds:_ the "one game, its own rules" half of step 2.68 brought forward, the league setting (T-98), and the tracker's form.
- _Needs:_ 2.33, 2.55, NEW-6; the product answer under H2.
- _Done test:_ a scorekeeper changes one game from halves to quarters and the clock, the periods and the bonus follow, on the device and on the server; the season's other games are untouched; with the setting off the button is absent and the server refuses; after the first play both refuse; isolation case; pictures.
- _Model:_ opus, high (the screen part: fable).

**NEW-4. A scorekeeper reopens a game they just ended (part A).**

- _Who it is for:_ the scorekeeper who tapped End game too soon.
- _What they see and do:_ on the final panel, "Reopen game" for as long as the league allows after the end, asking for a short reason; after that, a line saying an admin can reopen it. An admin sees the league setting for how long.
- _Needs:_ 2.30, 2.14; the product answer under H3.
- _Done test:_ with a controlled clock, a scorekeeper reopens at 29 minutes and is refused at 31 under a 30-minute setting; the reason and who are in the corrections history (S-7); standings follow both ways; a scorekeeper who may not score that game is refused; isolation case.
- _Model:_ opus, high.

**NEW-5. Mark a game not started (part A).**

- _Who it is for:_ a scorekeeper who started the wrong game or was only trying the tracker.
- _What they see and do:_ "Mark not started", with the Al-Hadi tracker's question (checklist J5). The game is scheduled again, its score and lines are gone, the public page no longer says Live, and its format can be changed again.
- _What it builds:_ the command `live-game.ts` says a later step would add, written to the activity log. Recommended rule: whoever may score the game may do it while nothing but lineups and clock taps are recorded; once a basket, foul or turnover is recorded it needs the permission to correct games and a reason.
- _Needs:_ 2.29, 2.30.
- _Done test:_ both cases, each with its refusal; the event log keeps what was cleared; standings are untouched; another device's waiting taps for the cleared game are refused and listed as not saved; isolation case.
- _Model:_ opus, high.

**NEW-6. The league's game rules reach the tracker (part A; the first half of step 2.68).**

- _Who it is for:_ a scorekeeper in a league with a foul limit, a mercy rule or a last-minutes stop clock.
- _What changes for them:_ a player at the limit is marked out (checklist D10); the tracker's door takes the clock-mode switch that step 2.69 will draw.
- _What it builds:_ `engineRulesOf` carries the foul limit, the mercy lead and the last-minutes stop clock; the tracker's command shape becomes the platform's (`PlatformEnvelope`), still taking everything the present one sends (T-127).
- _Needs:_ 2.29, 2.67.
- _Done test:_ a season with a limit of four marks a player out at four on the device and in the server's state; a game already started keeps the rules it started with (S-1); a batch from the present tracker version is still taken.
- _Model:_ opus, high.

**NEW-7. Team fouls that reset each half or once a game.**

- _Who it is for:_ a league playing quarters with the bonus counted by the half.
- _What they see:_ the right team-foul count, bonus badge and horn in the tracker and on the public page.
- _What it builds:_ the engine learns the setting, off when absent so every recorded game reads the same; an engine step under the plan's "The engine" rule. Until it lands, the season settings screen (2.47) should not offer the two choices the tracker cannot follow.
- _Needs:_ 2.67.
- _Done test:_ the worked example in M8 gives 7 team fouls and the bonus in Q2; the engine's existing tests pass unchanged; the note in `engine-rules.ts` is corrected.
- _Model:_ opus, high.

**NEW-8. Live updates on the real service.**

- _Who it is for:_ a parent watching from home.
- _What they see:_ each play within two seconds, online as locally.
- _What it builds:_ the migration with the listening rules T-233 describes, and the game and schedule pages pointed at the real service when the web app runs on it, falling back to asking again every 5 seconds.
- _Needs:_ 2.45, 2.93.
- _Done test:_ on the made-up test copy, in a session the founder started: a browser can listen to a published league's game and cannot send; a draft league's channel is refused; a play reaches a second screen within two seconds. Marked not verified until then.
- _Model:_ opus, high.

### Changes to other steps

- **2.104:** the snapshot and the page also carry the bonus, the timeouts left and each player's full line while the game is live (M11).
- **2.113:** add a server-time reading for the screens (M1), keep taking taps while signed out (M4), and say which taps are waiting and when the last one was saved (L1). Make it a need of 2.35, 2.36, 2.37 and 2.38.
- **2.61:** add a team with no roster, a reload with no signal, 61 minutes offline before reconnecting, and a page the phone reloads by itself (M13).
- **2.71:** needs NEW-1 and NEW-2 in place of 2.35; keeps the three-way league setting and the admin's "walk-up players to review".
- **2.68:** keeps what is left after NEW-3 and NEW-6 (nothing may be left; the lead decides whether to close it).
- **DESIGN.md:** a section for the courtside look before 2.35 opens (M10).

### For the founder, in plain words

Nothing here needs you today. The lead will answer four questions for you and mark each "Decided for you", so you can change any of them later:

1. May a scorekeeper add a player by jersey number alone, with no name? (Recommended: yes.)
2. May a scorekeeper change a game's format before tip-off? (Recommended: yes, unless the league's admin switches it off.)
3. For how long after ending a game may its scorekeeper reopen it? (Recommended: 30 minutes, set by each league.)
4. May a scorekeeper change a player's jersey number at the table? (Recommended: yes.)

One thing will need your hands later, as already listed: a rehearsal on real phones and tablets, upright and lying down.
