# Area 4 review of step 2.36: clock, periods, fouls and timeouts

**Step 2.36 may not land yet.** No High finding. A short fix round is asked for: three things in the step's own folder (M1, M2, M3), one more I would take in the same round (M5). M4 is the engine's, not this step's, and needs a step of its own.

Reviewed 2026-11-15 by the area lead for live scoring, who is also the design reviewer of the scoring screen for this step. Lane `lane/2.36-clock` at commit `66668c1c`, the build that was already in the lane (`apps/web/.next`, made two minutes after the commit; working tree clean). I changed no product code, no plan and no test. Everything I wrote is in `.local/review/area4/`: this file, my scripts (`*.mjs`), three logs and 145 pictures in `shots/`.

## How it was done

- The web app was served from the lane's build on its made-up world (`APP_ENV=test`) on port 3741, a server of my own, stopped by its own process id. Two worlds were used: one for the game night, a fresh one for the experiments that spoil a game.
- Driven by script with the installed Edge, a touch screen switched on, and every tap a touch (`locator.tap()`, and for fast double taps two real touch points sent 50 to 520 ms apart). 390 x 664 first, then 390 x 844, 844 x 390, 820 x 1180 and 1180 x 820.
- Both kinds of game: the league's own running clock from tip-off, then the same game switched mid-game to a stop clock with the engine's `clock-mode` tap sent "from another tablet" (accepted mid-game); and a second game that was a stop clock from before tip-off.
- The Al-Hadi tracker was read (`track.js`, `track.css`) and its existing pictures in `artifacts/screenshots/` looked at. I did not run it; its tap counts below are from its code and from the audit's measurements.

## The game night, as it went (390 x 664, touch)

| What I did                                               | What I met                                                                                                                                                                  | Picture               |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Opened the game, confirmed the format                    | Format page lists halves, overtime and "Running clock".                                                                                                                     | `a01`, `a02`          |
| Tapped Start before any lineup                           | The clock started with nobody on the court and nothing said; the game is then live. Same as the Al-Hadi tracker.                                                            | `b01`                 |
| Picked both fives (10 taps)                              | With twelve a side the visitors' players are under the fold until the home five are set: the teams' block scrolls once (578 high in 397). Step 2.35's, not new.             | `b02`, `b03`          |
| Both lineups set                                         | The hint gives way to "Start clock · tip-off", "Start it at the tip."                                                                                                       | `j03`                 |
| Tip-off with the pad's button                            | Running; the clock ticks once a second.                                                                                                                                     | `b05`                 |
| +2, +3, a foul, a substitution on the running clock      | 2 taps each. Under a running clock a foul says nothing and does not stop the clock, as the format says.                                                                     | `b06` to `b09`, `c02` |
| Reloaded mid-clock                                       | Clock came back right (1 s moved in 0.7 s of reload).                                                                                                                       | `c01`                 |
| Timeout under a running clock                            | "Full timeout: Hawks.", clock keeps going.                                                                                                                                  | `c05`, `c06`          |
| Paused by hand, +1, a foul, started again                | All taken on the stopped clock; "The clock is stopped."                                                                                                                     | `c07` to `c09`        |
| Switched to a stop clock, a foul on the running clock    | "Foul on #7 Oz Hawkins. Clock stopped.", the Start clock button says why.                                                                                                   | `d01`, `d02`          |
| Timeout for each team, the third for Hawks               | The question, its answers in the pad's lowest band, "Do not record it" returns to the list.                                                                                 | `d03` to `d08`        |
| − for the latest timeout                                 | "Timeout taken back: Hawks." **A fast double tap took two back.**                                                                                                           | `e01`, `e02`          |
| Fouls to 7 and 10 for both teams                         | Badge, red count, one note then two, "Bonus: Hawks.", "Double bonus: Bears."                                                                                                | `e03` to `e09`        |
| The clock's form: 8, 80, 800, 1200, 99, 2500, 12345      | 0:08, refused ("Seconds go up to 59."), 8:00, 12:00, refused, 25:00 (taken, longer than the half), 12:34. The button says "Set clock to 0:08" before it is set.             | `f01`, `f02-*`        |
| Set 12:00 by mistake (from 16:55), then 16:55 again      | Clock right again. **Every floor player's minutes went from 3:05 to 0:00.**                                                                                                 | `f03` to `f05`        |
| Closed a player's options and tapped Start clock at once | **Nothing happened and nothing was said**; I believed the clock was running.                                                                                                | `f06`                 |
| Ran the half out                                         | "Halftime.", Start greyed "Period over", gold "Pick the next period".                                                                                                       | `g02`                 |
| +2 at 0:00                                               | Taken (a basket at the horn).                                                                                                                                               | `g04`                 |
| Gold button, H2                                          | Picker with H2 marked "next"; 20:00; fouls back to 0.                                                                                                                       | `g05`, `g06`          |
| Back to H1 by mistake, then H2 again                     | H1 comes back at 20:00 with both double bonuses, the horn and "Double bonus: Hawks. Double bonus: Bears."; H2 comes back at 20:00, not the 19:56 it had. Minutes unchanged. | `g07` to `g09`        |
| End of H2, OT1, end of OT1                               | "End of H2.", OT1 marked next (with Hawks ahead 8 to 7), 5:00, fouls carried on, "1 left"; "End of OT1."                                                                    | `h02` to `h07`        |

Minutes after all of it added up to the seconds the clock really ran, apart from the wipe above.

## Findings

Severity as in LEADS.md: High, a scorekeeper is stopped, misled, or a wrong thing is recorded; Medium, must be fixed before real people use it; Low, tidying.

### High

None.

### Medium

**M1. The list of timeouts taken is cut through the middle of a line, at all five sizes, in any game that reaches the second half.**
The list holds the whole game's timeouts in a box of fixed height that scrolls inside the pad with no sign that it does. Measured with 6 for one team and 5 for the other (two a half, one in overtime, one over the limit): 390 x 664, the sixth entry is sliced (list 101 high in 90); 390 x 844 the same; 844 x 390, entries fall below the pad's end (152 in 118); 820 x 1180, 117 in 90; 1180 x 820, the fourth entry is sliced, with an empty box right under the pad (137 in 90). On the two lying-down sizes it starts at a team's fourth timeout, which is the second one of the second half. DESIGN.md section 7 line 8: "no number is ever cut". Pictures: `p02-browser-whole-game-timeouts`, `p02-lying-…`, `p02-tabletLying-…`, `p02-tabletUp-…`, `p02-upright-…`.

**M2. A fast double tap on − takes two timeouts back.**
After a take-back the panel stays open and − stays in the same place, so the second touch of a double tap (90 ms apart, tried) removes the next timeout as well: Hawks went from two taken to "None taken". Putting one back gives it the time on the clock now, not its own. The question's answers already wait a moment before they take a tap; − does not. The Al-Hadi tracker also keeps its list open, but its − moves as the list shrinks. Picture: `e02-after-double-minus`.

**M3. The bonus is not seen at a glance on a phone, and the badge is the smallest thing on the scoreboard at every size.**
Measured: the team-foul count is 11 px, 12 px at the bonus and 13 px at the double bonus on all three phone sizes (14, 16, 19 on a tablet); the badge is 11 px everywhere, also in a tablet's 473 x 117 box. So on a phone "larger … larger again" (line 5) is one pixel a step, and what tells the bonus from the double bonus is an 11 px pill, hollow or filled. The Al-Hadi tracker grows the count 12.8 to 16.8 to 20.8 px and changes its color from orange to red. The red color does show. Pictures: `e03`, `e06`, `e09`, `q-fouls-7-bonus-browser`, `q-fouls-7-bonus-tabletLying`, `q-fouls-10-double-tabletLying`.

**M4. A clock set forward by mistake and then put right wipes the minutes of everyone on the court and moves the period's plays to one time. (The engine's; the same in the Al-Hadi tracker; not this step's to fix.)**
Worked on the screen: 16:55 on the clock, each starter at 3:05. Set 12:00 by mistake (minutes untouched), then 16:55 again: all ten on the court read 0:00, a substitute lost his 1:31, and the public page's play-by-play shows the half's plays at 16:55 (a timeout taken at 16:56 now reads 16:55 in the list). `packages/sports/src/basketball/live.ts:882`: setting forward "leaves minutes alone", setting back winds them back, so the two do not cancel. The form does warn before the second set. Two things make it matter more here than in the standard: the keys now read 8 as 0:08 where the old box read 8:00, and step 2.36's done test says "a clock set wrongly is put right by setting it again". Also the sentence afterwards says "3:06 went back on" when 4:55 went back on the clock and 3:06 came off the minutes, and the form before said 4:55. Belongs to an engine step shared with area 6; the sentence is this step's. Pictures: `f03`, `f04`, `f05`, `g01`.

**M5. The pad's Start clock button swallows a tap without a sign.**
For a third of a second after the pad comes to rest the button takes no tap, and looks exactly as it does when it will. Measured: after × on a player's options, a tap up to 335 ms later did nothing and 362 ms later started the clock; after +1, up to 268 ms nothing, 330 ms started. It happened to me in the game night and I carried on believing the clock ran. The guard has a reason and works (below), so keep it: show the button not ready for that moment, or take the tap when the touch before it was somewhere else. To be tried with a real thumb. Pictures: `f06`, `j04-start-ignored-320ms`.

### Low

- **L1.** At 0:00 the sentence "Halftime." sits in a filled gold strip directly under the filled gold button "Pick the next period", same width and shape: two gold bars, one a button. (`g02`)
- **L2.** The period buttons in the clock's form are 53 x 48 at the top of a full-screen sheet, 7 px apart, far from the thumb, and one tap jumps with no question. A period left by mistake comes back at its full length, not at the time it had. (`g05`, `g07`, `g08`)
- **L3.** After going back a period the strip says only "Double bonus: Hawks. Double bonus: Bears."; "Start of H1. Clock set to 20:00." is pushed out. (`g08`)
- **L4.** "Stopped for a foul on #11 …" and "Stopped for a Hawks timeout." stay as the reason after that foul or timeout has been taken back.
- **L5.** The clock can be set to 25:00 in a 20-minute half with no word; a fifth digit is dropped silently.
- **L6.** On a tablet lying down a player's second line is cut: "On court · 2 fouls · 28 pts · 1:23 played" needs 253 px and has 236. (`m3-tabletLying-options-floor`)
- **L7.** On phones the clock's form covers the scoreboard, and a running clock goes on behind it unseen. (`f06`)
- **L8.** At the end of regulation with a team ahead the gold button still says "Pick the next period" and marks OT1 "next". For step 2.37, with End game. (`h02`, `h03`)
- **L9.** In a stop-clock game Pause is tapped at every whistle and is only in the top row, the far end of an upright phone from the thumb; the pad at rest holds only the hint while the clock runs. Same as the standard; a place to do better.
- **L10.** On a phone lying down two green Start buttons stand one under the other. (`k01-lying-options-clock-stopped`)
- **L11.** Start before any lineup starts the clock and makes the game live, with nothing said. Same as the standard; "Mark not started" is the way back and is not built yet. (`b01`)
- **L12.** In the lying-down panel the timeout entries break unevenly ("OT1 2:44 ·" / "Full"). See the lead's question below. (`m5-lying-timeouts`)
- **L13.** One request answered 404 in the browser's console on some loads; I did not find which.

## What held

- **A fast second tap never started the clock and never recorded twice.** 20 fast double taps on +2 (clock stopped) and 20 on Foul (clock running, stop clock) at each of the five sizes, 200 in all, 50 to 520 ms apart: the clock started by accident 0 times, 0 baskets or fouls recorded twice. Measured too: no option, substitute tile or bench tile lies under the Start clock button at any size (the nearest touch its lower edge). (`x2.log`)
- **The clock is right whatever the device's own clock says.** Scorer's page 30 s fast, then 30 s slow; followers on the public page with a right clock and one 30 s off: all showed the same second in ten samples, after a reload of the scorer, and when a foul stopped it. (`i02`, `i03`, `i04`)
- **Sound broken four ways** (no AudioContext, one that throws, resume refused, an oscillator that throws): nothing broke, the sentence was said, the next tap worked. Opening a game already in the bonus is silent. The horn is one note for the bonus and two for the double, and it sounds again when a foul taken back is given again (the notes were seen starting in Edge; nobody heard them).
- **The five sizes** with the clock running at rest, a floor player's and a bench player's options, the timeouts panel, the question and the clock's form: nothing scrolled (but M1), nothing tapped was under 44 x 44, the point buttons were 56 to 72 high, gaps 7 to 8. Scores and clock: 26 and 32 px at 390 x 664 (jersey numbers 24), 36 and 40 upright, 30 and 32 lying, 56 and 60 on a tablet. Home light and away dark everywhere, the timeouts panel included.
- **Contrast**: clock 11.1 to 1, scores 16.0 and 12.9, jersey numbers the same, saved banner 16.7; Start 6.0, Pause 7.4, Timeouts 6.6; nothing under 6. (`x5.log`)
- × and Escape hide the Start clock button; it returns when the clock next stops.

## Tap counts

|                                                         | New screen                      | Al-Hadi tracker (from its code)                        |
| ------------------------------------------------------- | ------------------------------- | ------------------------------------------------------ |
| A foul that stops the clock, to the clock running again | 3: player, Foul, Start clock    | 3: player, Foul, Start clock                           |
| A timeout, to the clock running again                   | 3: Timeouts, Full, Start clock  | 3: the team's timeouts chip, Full timeout, Start clock |
| 0:00 to the next period running                         | 3: gold button, H2, Start clock | 3: period list, the period, Start clock                |
| Substitution                                            | 2                               | 2                                                      |
| Timeouts left, on a phone                               | 1 tap to see                    | seen at a glance                                       |
| Set the clock to 6:30                                   | 5: clock, 6, 3, 0, Set          | clock, then the device's keyboard in a prompt box      |

On an upright phone the standard adds a full-screen scroll between the two teams; the new screen has none.

## The builder's six answers: my recommendation

1. **"0 fouls" from the start:** keep. Nothing moves when the first foul comes, and it is quiet enough.
2. **At 0:00 the gold button opens the picker:** keep at the end of regulation and of an overtime, where overtime or the end is a real choice; at halftime or between quarters let it say "Go to H2" and go in one tap once step 2.37's Undo can take it back.
3. **Keys fill from the right:** keep. The display and "Set clock to 0:08" make it plain, and "80" is refused in words.
4. **The horn on going back to a period in the bonus:** make it silent, badge only. It is what the standard does, but going back is nearly always a slip, and its sentence pushes out "Start of H1".
5. **Timeouts left one tap away on phones:** accept, and put both numbers on the blue button in the scoreboard's order; coaches ask, and the standard shows them.
6. **The hint gives way to Start clock once both lineups are set:** keep; it is the standard's own behavior.

**The lead's question on `28-timeouts-used-844x390`:** the latest entry, the one − takes back, is bold and can be read. The rest is ragged, time and "Full" breaking apart on some entries and not others, and from the fourth entry it is cut (M1). Where a league has one length of timeout the word "Full" on every entry adds nothing: drop it there, never break inside an entry, and end a list that does not fit with a count ("2 earlier"), as the bench does.

## Against the Al-Hadi tracker

**Better:** both fives, the pad and every clock control on one upright phone screen with nothing scrolling; both teams' fouls and bonus always in view; the clock's form with large keys that says what it will do before it does it, in place of a browser prompt; both teams' timeouts in one panel and the over-the-limit question in the pad, its answers away from the thumb; nothing tapped under 44; the reason the clock is stopped; a fast second tap cannot start the clock; the clock right on a device whose own clock is wrong.

**Worse:** the bonus and double bonus are smaller and less distinct on a phone (M3); timeouts left are not at a glance on a phone; the timeouts list is cut where the standard's grows (M1); − stays put under a double tap (M2); Start clock can swallow a tap (M5); 8 no longer means 8:00, which someone used to the old tracker will meet once.

A scorekeeper would find the new screen at least as easy at all five sizes, and much easier on an upright phone, once M1 to M3 are put right.

## DESIGN.md section 7, lines not met

- **Line 8:** "no number is ever cut", and nothing scrolling in the pad: M1.
- **Line 5:** team fouls "red and larger … larger again at the double": met by one pixel a step on phones, and the badge is 11 px at every size (M3). "The scoreboard never leaves": the clock's form covers it on phones (L7).
- **Line 2:** the gold strip beside the gold button (L1). Red is also used on timeouts ("Timeouts 0", "none left"), where blue is their color; the standard does the same and I would leave it.
- **Line 9:** a tap answering within a tenth of a second was not measured by me.
- Lines 1, 3, 4, 6, 7, 10 and 11: met in what I saw.

## Not tried

The Al-Hadi tracker itself in a browser; a whole game at any size but 390 x 664 (the other four were measured and fast-tapped, not played through); quarters ("End of Q1"); 30-second timeouts; fifteen a side; swapped colors with the clock's parts; the keyboard beyond Escape; a screen reader; dragging a substitution by touch; undo and redo, ending a game, offline (steps 2.37 and 2.38); the mercy rule and the last-minutes stop clock; tap speed on a slowed processor; the lane's own unit and browser tests (not run, as told).

## Nobody can verify without a real device

Whether the horn is heard and allowed on a real phone (above all an iPhone, where sound starts only from a tap); the badge and the count at arm's length in a bright gym; real thumbs: the third-of-a-second guard, two thumbs at once on a phone lying down, and whether − is double-tapped in practice; the height a real phone's browser leaves; a tablet that sleeps and wakes mid-clock; a five-year-old tablet keeping up.

---

# Second look, 2026-11-16: the fix round (lane at 7519c2e2)

**Step 2.36 may land.** M1, M2, M3 and M5 are closed. One new Medium (N1) and the banner at its longest are the same fault and can go onto step 2.37's line as one rule; nobody scores a real game before 2.37 lands.

The web app was built again in the lane (`buildNext`, as the tests do) and served on port 3741, stopped by its process id. Touch as before, 390 x 664 first, then 844 x 390; the tablets where a point asked. Scripts `y1` to `y3`, logs `y1.log` to `y3.log`, pictures `s*` and `u*` in `shots/`. Nothing in the lane was changed.

|                                      | Result                                                                                                                                                                                                                                             | Counts                                                                                                                                                                                           | Picture                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| M1 timeouts taken                    | **Closed.** Six each at all five sizes: the latest two, then "and 4 earlier"; three lines, nothing cut, nothing scrolls, − is 44 x 44 beside the latest.                                                                                           | 5 sizes of 5                                                                                                                                                                                     | `s10-browser-six-timeouts-each`, `s10-lying-…`, `s10-tabletLying-…`      |
| M2 double tap on −                   | **Closed.** Exactly one came back, nothing else recorded, at 60, 90, 150 and 250 ms. The sentence now says which ("Timeout taken back: Hawks, H2 20:00.").                                                                                         | 80 of 80                                                                                                                                                                                         | `u01-browser-after-double-minus-90ms`                                    |
| M3 the bonus at a glance             | **Closed.** Count: 11, 13, 15 px on the upright phone (was 11, 12, 13); 11, 13, 16 lying down; 14, 20, 26 on a tablet. Badge: 11 hollow then 12 filled, a bar across the box, on the upright phone; 12 then 13 lying down; 15 then 19 on a tablet. | measured at 5 sizes, 3 levels                                                                                                                                                                    | `s20-bonus-home-shoots-*`, `s20-double-and-bonus-*`, `s20-both-double-*` |
| M5 Start clock swallowing a tap      | **Closed.** Of the taps not taken, every one met the button hollow; none was refused while drawn full. Every tap 354 ms or more after the rest itself started the clock.                                                                           | 100, 200, 300 ms: 0 of 60 taken, 60 hollow. 340 ms: 7 taken, 13 not (13 hollow). 360 ms: 16 taken, 4 not (4 hollow; that group was really 317 to 366 ms after the rest itself). 500 ms: 20 of 20 | `u02-browser-start-clock-not-ready`, `u03-…-ready`                       |
| Start and Pause under the scoreboard | One double tap is one tap at 100, 150 and 250 ms. Start, a wait of 1 s, 0.6 s or 0.45 s, Pause: both taken.                                                                                                                                        | 30 of 30 and 30 of 30; 10 of 10                                                                                                                                                                  | `y2.log`                                                                 |

Also seen right: 25:00 in a 20-minute half is refused in words ("H1 is 20:00 long: type 20:00 or less."); the form says truthfully what comes off the minutes; the horn is silent on going back to a period in the bonus and "Start of H2. Clock set to 20:00." is said; the blue button says "1 · 2" in the scoreboard's order, red at none; the sentence at halftime is no longer a second gold bar; a short half by touch took the same taps as before (3 for a foul to running again, 3 for a timeout, 2 for a substitution) and nothing hunted, moved or lied.

## New

- **N1 (Medium, for 2.37's line).** At 390 x 664 a team name that takes two lines makes the scoreboard 12 px higher and the teams' block then overflows by 4 px: the visitors' panel loses its lower edge and the block can be dragged 4 px. "Northside Academy" (17 letters) is one line; "Northside Academy Hawks" (23) is two. The demo league's opponents have names of that length. Measured with the name written into the page, as the builder's picture 40 does: the made-up data has no long name. `u20-390x664-two-line-name`.
- **N2 (Low).** The rest on − ends about a third of a second after the first tap, measured lift to lift, so a slow double tap can still take two back: 1 of 20 at 302 to 314 ms between touches, 5 of 20 at 331 to 345 ms, and − was still drawn dim when those were taken. A take-back is never urgent: − could rest half a second or more. Real thumbs will say.
- **N3 (Low).** At the very end of a rest a tap can be taken while the button is still drawn hollow (12 of 60 in the edge run); the drawing lags the decision by a frame. Harmless for Start; it is what N2 shows on −.
- **N4 (Low).** A 37-letter name is cut with "…" after two lines at 390 x 664 when the clock reads 20:00 (it fits beside 5:00), and after one line at 844 x 390. Readable; the commit's "never cut" holds for the builder's picture, not for every clock.
- **N5 (Low).** The Start clock button, the largest on the screen, goes hollow and fills again each time the pad comes to rest: after every free throw on a stopped clock. To be judged on a real device against line 9.

## The banner at its longest

Land 2.36 with it written onto 2.37's line, with N1, as one rule: at 390 x 664 nothing above the teams' block may grow (a second line of the banner, a two-line name, both badges, all at once) without both fives still whole and nothing scrolling; and 2.37's pictures include that state. With plays simply waiting ("6 actions waiting to send") the banner is one line at 390 x 664 and nothing is cut (`u10-browser-banner-waiting`).

## Is a third of a second of "not ready" annoying?

No. Between a foul and the clock starting again there are seconds, not a third of one; × and then Start inside 350 ms takes a deliberate hurry, and it is now shown. See N5 for the one doubt.

## Still nobody can verify without a real device

The bonus at arm's length in a bright gym (the first bonus on a phone is the weakest: a 13 px red count and an 11 px hollow pill); real double taps on − and on Start; the hollow flash of Start clock in a real rhythm; the horn heard; a long real team name on a real phone's browser height.
