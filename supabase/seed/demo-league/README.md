# The demo-shaped seed league's files

`npm run seed` loads a made-up league shaped like the demo league (P9 §3, F-6): one program,
a 2025–26 season of ten Fridays from November to January, four districts of six schools,
every game with its result, and one school's games scored live in the tracker. Every name in
it is invented. The league itself (its name, districts, schools, gyms, each school's strength
and the tracker's made-up players) is in `packages/database/src/seed/demo-league-data.ts`; its
games are in the file here.

**Who is listed.** The tracked school's players are on its roster, with their statistics
public. The tracker also keeps the other side's players in every game it scores, and the
transfer brings a game in only when they are on that team's roster, so the five schools it
played are listed too, with their players' statistics for staff only. The other eighteen
schools list no one. Whether a school's roster is public at all is a question for the lead
and the product (P9 §3), not for this seed.

## `fixtures.csv`: the games and their results

One row for each game, in the columns the product's fixture import reads (Admin → Schedule →
Import), so the seed loads it through that same import:

| Column      | What goes in it                                                         |
| ----------- | ----------------------------------------------------------------------- |
| Game number | The league's own number for the game, if it has one                     |
| Round       | "Week 1" and so on                                                      |
| Date        | The day it is played, as 2025-11-07                                     |
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

**Rounds.** The import does not keep the Round column yet (step 2.166 will). The seed makes
each week a round of the schedule with the schedule builder's own commands and puts each game
in its week, so the season reads as its ten weeks. A real file imported today lands with no
rounds; they are made in Admin → Schedule.

**Dates.** The games are loaded on the dates written here, which are all in the past, and the
whole load acts as if on the day after the last game: it reads no clock, so a load on any day
writes the same league. The results were played from each school's strength (a home side a few
points better), so the season reads as a real one: one school went 9–1, one 1–9.
