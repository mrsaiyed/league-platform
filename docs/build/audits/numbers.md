# Area audit: the numbers are right

Step 2.109. Area 6 of [LEADS.md](../LEADS.md): "Players, coaches and parents who will argue about them. Scores, fouls, clocks, standings, tie-breaks, statistics, corrections and history are right in every case, and say why when a rule decided them."

Written 2026-11-16 by the area lead for the numbers, from build branch commit `df2074c`. It changes no code, no test and no plan.

## The first test, in plain words

The founder's walk (a new season on the default rules, two teams, one game scored live with an Undo and ended in the middle of the second half, one game whose final score was typed) gives **the right score, the right points and fouls for every player, the right team totals, the right standings and the right order of the two teams**. Every number the product shows in that walk was worked by hand and matched (section 1).

What the founder would notice:

1. **Minutes are missing.** The engine counts every player's minutes correctly (30:00, 3:00, 27:00 and so on), and the default season keeps minutes, but no public page shows them: not the game's box score, not the statistics page (finding M1). This is a missing number, and it is the one step below marked (TEST 1).
2. **A puzzling sentence under the table.** Both teams level on wins carry the note "Placed above the teams level with it by the difference between points scored and allowed", including the team that was placed below (M2).
3. **Puzzling per-game numbers.** The statistics page says Ravens score 7.0 points a game, while the standings say 52 points in 2 games: statistics count only the game that has a box score, as the spec says (P7 section 8), but the page never says so (M5).
4. **No leaders after one game.** "No leaders yet" and "A player needs at least 3 games to be ranked": right by S-63, and the page says why. `first-test.md` (step 2.194) should say it too, or the walk should set the minimum to 1.

No number in the walk is wrong. One number is missing.

## How this was done, and what was not checked

- **Read in full:** the engine (`packages/sports/src/basketball/live.ts`), the standings (`packages/sports/src/standings`) and statistics (`packages/sports/src/stats`) maths and their tests, the server half that turns plays into lines and results (`packages/core/src/modules/games`: `live-game.ts`, `finish-tracked-game.ts`, `apply-tracker-commands.ts`, `record-final-score.ts`, `record-forfeit.ts`, `set-box-score.ts`, `decide-game.ts`, `read-game-page.ts`), the standings module (`packages/core/src/modules/standings`), the page builders (`apps/web/src/features/stats-pages`, `apps/web/src/features/live-game`), P7, T6, T3 section 9 and the S-decisions.
- **Run, not just read:** every case below marked "run" was played through the product's own core commands (`openScoringSession`, `applyTrackerCommands` with the tracker's protocol, `recordFinalScore`, `recordForfeit`, `setBoxScore`, `reopenGame`, `postponeGame`, `cancelGame`, `addAdjustment`) on the stand-in's made-up world (`testWorld`, the same rows and the same event handlers the local app uses), and read back through the same functions the public pages call (`readStandings` and `buildStandingsViews`, `loadStatsPage`, `loadHomeLeaders`, `readGamePage`, `buildBoxScores`, `buildPlays`). The scripts were one-off test files in my scratch space, outside the repository; none is kept. Engine cases were run on the engine with the rules the server hands it (`engineRulesOf(defaultSeasonRules())`).
- **Pictured:** `node scripts/shots.mjs --dev --only=game-final,standings,stats` (pictures in `.local/shots`, which git ignores): the made-up North Valley league's standings, statistics and a final game scored by the tracker; Harbor City's standings. Its two tables were then worked by hand from the seed's games (cases 43 to 45).
- **Not checked:** the walk in a browser. No made-up league starts empty until step 2.192, and Undo and End game on the new scoring screen are step 2.37; the numbers were judged through the engine and the server's commands, as the brief asked. The database's stores (PGlite) were not run: only the stand-in. The live updates a viewer gets mid-game were read, not run. A clock that is set (S-71, step 2.189) was left alone: every game here runs its clock without a set. The box score grid's own rule for empty boxes (P7 section 5.2) lives in the form; the cases passed lines straight to the command. When the dev server first started, Next.js printed an upgrade recommendation and stopped; nothing it suggested was run.

## Summary

|                                |                                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Cases worked by hand           | 45, each against the product's answer; 42 run through the product                                                          |
| Findings                       | 1 High, 9 Medium, 11 Low                                                                                                   |
| The engine                     | Right in every case: scores, fouls, bonus, foul limit, mercy rule, last-minutes stop clock, period ends, overtime, minutes |
| Standings and statistics maths | Right in every case by their written rules; one written rule (head-to-head among three or more) will be argued with (M4)   |
| What the public pages show     | Mostly right; one wrong total (H1), one missing number (M1), and several numbers that are right but never say why (M2, M5) |

## 1. The first-test walk, worked by hand

**The league.** One season on `defaultSeasonRules()`: two halves of 20:00, overtime 5:00, a running clock, bonus at 7 team fouls and double bonus at 10 in a half, out at 5 personal fouls, win percentage, tiebreakers head-to-head then point difference then points scored, no ties, forfeits 20 to 0 not counted in the difference, statistics "standard" (points, 3-pointers, free throws, fouls, minutes), leaders from 3 games (S-63). Ravens (players R1 to R7, numbers 1 to 7) and Wolves (W1 to W7, numbers 11 to 17). Game 1, Wolves at Ravens, scored live. Game 2, a week later, Ravens at Wolves, typed in as 50 to 45 for Wolves.

**Game 1, as tapped** (seconds from tip-off; the clock reads 20:00 less the time it has run in the half):

| Time | Clock    | Tap                                            | Score (Wolves–Ravens) |
| ---- | -------- | ---------------------------------------------- | --------------------- |
| −30  | H1 20:00 | both starting fives (R1 to R5, W1 to W5)       |                       |
| 0    | 20:00    | Start                                          |                       |
| 60   | 19:00    | R1 +2                                          | 0–2                   |
| 90   | 18:30    | W1 +3                                          | 3–2                   |
| 120  | 18:00    | foul R2 (running clock: the clock keeps going) |                       |
| 150  | 17:30    | W2 +1                                          | 4–2                   |
| 180  | 17:00    | R6 in for R3                                   |                       |
| 240  | 16:00    | R1 +3, then Undo at 245                        | (4–5, taken back)     |
| 250  | 15:50    | R4 +2                                          | 4–4                   |
| 300  | 15:00    | W3 +2                                          | 6–4                   |
| 1200 | 0:00     | the half runs out; the clock stops by itself   |                       |
| 1500 | H2 20:00 | Half 2, Start                                  |                       |
| 1560 | 19:00    | R6 +2                                          | 6–6                   |
| 1570 | 18:50    | foul W1                                        |                       |
| 1620 | 18:00    | W6 in for W2                                   |                       |
| 1700 | 16:40    | R5 +1                                          | 6–7                   |
| 2100 | 10:00    | End game                                       |                       |

**By hand.** The clock ran 1200 seconds in the first half and 600 in the second: 1800 seconds, 30:00. R3 played 0 to 180 (3:00); R6 from 180 to the end (27:00); W2 from 0 to 1320 of running time (22:00); W6 the last 480 (8:00); everyone else who started, 30:00. Each team's minutes add to 150:00, five times 30:00. R7 and W7 never came on.

| #   | What                                  | By hand                                                                                                                                                                                                          | The product (run)                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The final score (P7 5.2, Undo)        | Ravens 2+2+2+1 = 7, Wolves 3+1+2 = 6; the undone 3 counts for nothing                                                                                                                                            | Final, Ravens 7, Wolves 6. The undone basket is in no line and not in the play-by-play. Right.                                                                                                                                                                                      |
| 2   | Each player's points and fouls        | R1 2, R4 2, R5 1, R6 2; R2 one foul. W1 3 and one foul, W2 1, W3 2                                                                                                                                               | The same on the game page's box score (PTS, FTM, 3PM, PF, TO). Right.                                                                                                                                                                                                               |
| 3   | Each player's minutes (P7 5.2 and 6)  | As above: 30:00, 3:00, 27:00, 22:00, 8:00                                                                                                                                                                        | Saved exactly so in each player's line (`secondsPlayed`). **Shown on no public page** (M1).                                                                                                                                                                                         |
| 4   | Team totals and the box score         | Ravens PTS 7, FTM 1, 3PM 0, PF 1; Wolves PTS 6, FTM 1, 3PM 1, PF 1                                                                                                                                               | The same in each box score's Total row. R7 and W7 are listed with a dash in every column (L5).                                                                                                                                                                                      |
| 5   | Game 2, typed (S-46)                  | Final 50–45; no player numbers                                                                                                                                                                                   | Final 50–45; the page says "No statistics were recorded for this game." Right.                                                                                                                                                                                                      |
| 6   | Each standings row (P7 1 and 6)       | Both 2 played, 1 won, 1 lost, .500. Ravens 7+45 = 52 for, 6+50 = 56 against, −4, lost the latest (L1). Wolves 56 for, 52 against, +4, W1                                                                         | Wolves GP 2, W 1, L 1, PCT 0.500, PF 56, PA 52, DIFF +4, STRK W1; Ravens 2, 1, 1, 0.500, 52, 56, −4, L1. Right. The page shows PF, PA and STRK although the default columns are GP, W, L, PCT and DIFF (M7), and writes 0.500 for .500 (L3).                                        |
| 7   | Two teams level on wins (tiebreakers) | Head-to-head: each won one, still level. Point difference: Wolves +4, Ravens −4. Wolves first                                                                                                                    | Wolves 1, Ravens 2, both "ordered by point difference". Right. But both carry the note "Placed above the teams level with it by the difference between points scored and allowed", the Ravens too, who were placed below (M2).                                                      |
| 8   | Leaders and per-game numbers (S-63)   | Each player has 1 game with numbers (game 2 has none). Leaders need 3: nobody. Per game = the game's numbers. Ravens' team: 7 points in the 1 game with a box score; the standings count both games: 26.0 a game | "No leaders yet.", "A player needs at least 3 games to be ranked.", every player "not ranked yet", GP 1; the home page leaves its leaders out. Right by the rules. The Teams table says Ravens PTS 7.0 a game beside the standings' 52 points in 2 games, with no word on why (M5). |

Fouls and their limits never came near a threshold in the walk (one team foul each half); cases 11 and 12 work them. The clock at the end of a period is case 9.
