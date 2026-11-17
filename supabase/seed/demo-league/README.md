# The demo-shaped seed league's files

`npm run seed` loads a made-up league shaped like the demo league (P9 §3, F-6): one program,
a 2026–27 season, four districts of six schools, every game with its result, and one school's
games scored live in the tracker. Every name in it is invented. The league itself (its name,
districts, schools, gyms and the tracker's made-up players) is in
`packages/database/src/seed/demo-league-data.ts`; its games are in the file here.

## `fixtures.csv`: the games and their results

One row for each game, in the columns the product's fixture import reads (Admin → Schedule →
Import), so the seed loads it through that same import:

| Column      | What goes in it                                                         |
| ----------- | ----------------------------------------------------------------------- |
| Game number | The league's own number for the game, if it has one                     |
| Round       | "Week 1" and so on                                                      |
| Date        | The day it is played, as 2026-11-06                                     |
| Time        | The start time, 24-hour, as 18:00 or 19:30                              |
| Home        | The home team, written exactly as the team is named in the league       |
| Away        | The away team, the same way                                             |
| Venue       | Where it is played, written exactly as the venue is named in the league |
| Home score  | The home team's final score; empty for a game not played yet            |
| Away score  | The away team's final score; empty for a game not played yet            |

**As the template for the real results.** Save a copy of this file, replace the rows with the
real season's games (keep the first line, the column names, as it is), and fill in the final
scores as they come in. Leave the scores of the team we score live in the tracker empty: its
games and their box scores come over from the tracker by the transfer (`npm run
transfer:tracker`), not from this file. Save it from the spreadsheet program as CSV (UTF-8).

**Dates.** The seed loads the games on the dates written here when they are all past. While
any of them is still to come, it moves every date back by the same number of whole weeks, so
the last game is before today: a game scored in the tracker cannot have been played in the
future. The real file is imported on its own dates.
