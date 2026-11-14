# P7 — Teams, schedule and game day

[Spec home](../README.md) · Decisions S-1 to S-22

Everything between "registration closed" and "champion crowned".

## 1. Season settings

Set in **Admin → Season settings**. This is the first thing an organizer settles, because brackets, standings and the live tracker all follow from it. Every setting has a preset, so it takes a minute, and the admin can change any of it later (S-1).

| Setting                | Choices                                                                                                                                                                                                                                                                                      | Default (basketball)                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Divisions              | None, or named groups. Teams are assigned to one.                                                                                                                                                                                                                                            | None                                                    |
| Game format            | Halves or quarters, their length, overtime length                                                                                                                                                                                                                                            | 2 × 20-minute halves                                    |
| Clock                  | **Stop clock** (it stops by itself when a foul is recorded) or **running clock** (it keeps running through fouls). Optional extras: a stop clock in the last minutes of a half or of the game; a mercy rule that switches to a running clock once a team leads by a chosen number of points. | Running clock                                           |
| Fouls                  | When team fouls reset, when the bonus and double bonus start, and how many personal fouls put a player out (or no limit)                                                                                                                                                                     | Bonus at 7, double bonus at 10, out at 5                |
| How games are recorded | **Final score only**, **box score entered afterwards**, or **live tracking**. Can differ game by game.                                                                                                                                                                                       | Live tracking                                           |
| Statistics kept        | Which stats exist this season: points only; points and fouls; or a fuller set                                                                                                                                                                                                                | Points, 3-pointers, free throws, fouls, minutes         |
| Standings              | Rank by win percentage or by points (and points per win, tie, loss); which columns show                                                                                                                                                                                                      | Win percentage                                          |
| Tiebreakers            | An ordered list: head-to-head, point difference, points scored, fewest points allowed, coin flip (manual)                                                                                                                                                                                    | Head-to-head, then point difference, then points scored |
| Ties                   | Allowed or not                                                                                                                                                                                                                                                                               | Not allowed                                             |
| Forfeits               | The recorded score of a forfeit, and whether it counts in point difference                                                                                                                                                                                                                   | 20–0, not counted in difference                         |
| Rosters                | Smallest and largest roster, the date rosters lock, whether jersey numbers must be unique in a team                                                                                                                                                                                          | No limits, no lock                                      |

**S-1 (agreed, changed November 12): the admin can change the rules at any time, and is shown what a change will do before it applies.** The league is the admin's to run. Before the first game, changes simply save. After it, a change that would move anything (a tiebreaker that reorders the standings, a forfeit score that alters point difference) shows what will move, asks for confirmation, and is logged. Game rules (clock, fouls, period length) apply to games that have not started; a game already played keeps the rules it was played under.

## 2. Teams

Teams come from three places: created by hand, registered by captains ([P6](P6-registration-and-accounts.md) section 3), or carried over from last season. Each has a name, color, optional logo, a division, and a captain or coach. A team's roster is built by dragging registered people onto it, or by the draft. Jersey numbers are set on the roster and can be changed at the scorer's table. A player who leaves or is replaced mid-season stays in the team's history with every game they played (R-17).

## 3. Turning sign-ups into teams

For leagues where individuals register, **Admin → Teams** offers three ways. They can be mixed.

**Place by hand.** A board with the pool of registered players on one side and teams on the other. Each player card shows what the form collected: position, skill level, "wants to play with". Drag to place.

**Suggest balanced teams.** The system proposes teams balanced by the skill rating and honoring friend requests where it can. The admin adjusts by hand before confirming.

**Draft.** This is how Faraj forms teams, and it is a feature of the Draft option. Most leagues will not hold a draft: the option is off unless the organizer turns it on, and without it there is no Draft page, menu item or admin step.

1. Set captains (one per team) and the pick order: snake or straight, randomized or chosen.
2. Draft night: one screen shows the player bank, each team's column, whose pick it is and a countdown timer. The admin drags or taps a player onto the team picking. Picks can be undone. Players can be moved between teams afterwards.
3. A public draft board (optional) lets everyone watch picks appear live.
4. When finished, the admin confirms. Rosters are saved, every player is notified of their team, and a **draft recap** appears on the Draft page.

**S-2 (agreed): in the first release the admin runs the draft from one screen, as Faraj does now.** Captains picking from their own phones is a planned later addition (S-13).

## 4. The schedule builder

This is the tool organizers ask about first. It has four parts.

### 4.1 Tell it what you have

- **When**: the season's first and last dates, the days you play, and the time slots on those days ("Sundays at 6:00, 7:00 and 8:00").
- **Where**: venues and courts. A league with one gym has one.
- **How much**: games per team, or number of times each team plays each other.
- **Dates to skip**: holidays, gym closures.
- **Fairness rules**, each a switch: no team plays twice in one day; spread early and late slots evenly; balance home and away; avoid the same matchup two weeks running; keep games within a division, or allow cross-division games.
- **Team requests**: "Team A cannot play on October 12."

### 4.2 Generate

The builder produces a full schedule and a **fairness report**: for each team, how many early and late slots, home and away games, byes and back-to-back weeks, and any rule it could not fully satisfy and why. The admin can generate again for a different arrangement, or lock the games they like and regenerate the rest.

### 4.3 Adjust by hand

A grid of rounds and slots (Faraj's "Edit Full Schedule" view). Drag a game to another slot, swap two games, add or remove a game, rename a round ("Week 5 — Rivalry Week"), change a round's date. Clashes are flagged the moment they happen: a team in two places, a court double-booked, a game on a skipped date.

### 4.4 Publish

The schedule is a draft until published. After that, every change is also a draft: the admin makes edits, sees a summary ("3 games moved, 4 teams and 38 people affected"), and publishes. Affected people are notified ([P8](P8-notifications.md)).

### Also

- **Import** a schedule from a spreadsheet, for leagues that already have one. This is how the demo league's fixtures come in.
- **Game states**: scheduled, live, final, postponed, cancelled, forfeited. A postponed game sits in a "to be rescheduled" list until given a new slot.
- **Calendar feed**: every team and the whole league has a calendar link that phones subscribe to.

**S-3 (agreed, changed November 12): the admin decides the schedule's format; what we automate grows over time.** We do not choose a league's format for it. From the first release an admin can build or import any schedule by hand in the grid: any number of games, any matchups, any mix of divisions. The generator automates the common case first: every team plays every other team a chosen number of times, within divisions or across them, with the fairness rules above. More automatic formats are added as leagues ask. What the generator does not handle yet is referee assignment, travel distance and sharing venues between programs, which come with stage 6.

### 4.5 Playoffs

When the regular season ends, the admin creates a **bracket**: choose how many teams qualify (per division or overall) and the system seeds them from the standings, with byes where needed. Winners advance automatically as games go final. The admin can override any seeding or matchup before it starts.

**S-4 (agreed, changed November 12): the admin chooses the playoff format.** The choices are single elimination, double elimination, best-of series, pool play followed by a bracket, or custom. With each: how many teams qualify, seeding from the standings or by hand, a fixed bracket or reseeding each round, and whether there is a third-place game. They are built in this order: single elimination and custom first, then double elimination and best-of series, then pool play. "Custom" means the admin lays out the rounds and games by hand and says who advances, so any format can be run from the first release, even before we automate it.

## 5. Game day

### 5.1 Before the game

- The league's reminders go out ([P8](P8-notifications.md)).
- A scorekeeper is assigned to the game, or any scorekeeper opens it from their list. The league chooses which.
- The scorekeeper opens `/{league}/score/{game}` on a phone or tablet and confirms the game format.

### 5.2 Three ways to record a game

**Final score only.** Two numbers and a tap. For leagues and sports where that is all that is wanted.

**Box score afterwards.** A grid of players and stats filled in from a paper sheet.

**Live tracking.** This is the tracker already built and proven at Al-Hadi's games, itself modeled on Faraj's:

- Tap five players per team to set the starters. A short-handed team can start fewer.
- Tap a player, then **+1, +2, +3, Foul**. Substitute by tapping a bench player's "in for" or dragging onto the floor.
- Clock with start and stop; tap it to correct it. Period selector, team fouls, bonus indicator, horn.
- **Running clock switch.** The clock follows the league's rule (section 1). Under a stop clock it stops by itself when a foul is recorded. Under a running clock it keeps going. A switch on the tracker turns the running clock on or off at any moment of the game, whatever the rule says. If the league has a mercy rule, the tracker switches to a running clock when the lead reaches the chosen number and says so; the scorekeeper can switch it back.
- **Undo and redo** through the list of plays.
- Add a player on the spot (name and number) for either team.
- **Every tap is saved as it happens.** If the gym's connection drops, the tracker keeps working, shows how many actions are waiting, and sends them when the connection returns.
- **End game** locks the result.

**S-5 (agreed, with an addition, November 12): one device scores a game at a time, a second device can take over, and a game can be saved to a file.**

- If a tablet dies, another scorekeeper opens the game, is told who was scoring, confirms the takeover, and continues from the last saved tap.
- Every tap is kept on the device first and uploads by itself as soon as there is a connection. No Wi-Fi in the gym is not a problem.
- The scorekeeper can also **save a copy of the game** to the device as a file at any time. If that tablet never gets back online, the file can be opened on any other phone or computer and uploaded from there. Nothing is counted twice if the tablet uploads later as well.

**S-6 (agreed, changed November 12): the league decides whether players can be added at the scorer's table.** Three choices: allowed, with the added player flagged for the admin afterwards ("2 walk-up players to review"); allowed with no flag; or not allowed, so only rostered players can be scored. The first is the starting setting, so game night is never blocked by paperwork.

**S-21 (new, the founder's direction, November 12): every game rule that differs between leagues is a setting, and the scorekeeper can override anything automatic at the table.** Leagues play by different rules. A high school league stops the clock on every foul. A rec league lets it run. Some switch to a running clock once a team leads by a set number of points. So nothing about the rules is built in.

- Each rule is a season setting, with presets to start from: a high-school-style stop clock, a rec-league-style running clock, or custom.
- A single game can be given different rules before it starts.
- During a game the clock mode can be switched at any moment, and the clock, period, fouls and score can always be corrected by hand.
- Built first: the clock mode and its switch, stopping on fouls, the mercy rule, a stop clock in the last minutes, and the personal foul limit. Timeouts and technical fouls follow when a league asks for them.
- How those rules meet (decided for you, S-28 to S-32): every overtime period ends in the last-minutes stop clock; the scorekeeper's switch to a running clock inside those last minutes lasts until they end; inside them the stop clock wins over the mercy rule; the mercy rule switches again only after the lead drops below the number, and the scorekeeper switches back by hand; a player at the foul limit is marked out, but the tracker does not take them off the floor or keep them off.
- This is built in stage 2, after the demo cut. It does not hold up the demo, because the clock can always be stopped by hand, as it is today.

### 5.3 What fans see

`/{league}/games/{game}` shows the scoreboard and clock, both teams' box scores and the play-by-play, updating within about two seconds of each tap, with no refreshing. The league home and schedule show a **Live** marker and the running score.

### 5.4 When the game ends

1. The scorekeeper taps **End game**. The result is final.
2. Standings, team records, player totals and stat leaders update at once.
3. If it is a playoff game, the winner moves on in the bracket.
4. **Ten minutes later** the recap goes out ([P8](P8-notifications.md)). The pause is there to catch a mistaken final.

### 5.5 Corrections

- An admin (or the scorekeeper, within a time the league sets) can **reopen** a final game with a reason, fix it, and finalize again. Everything recalculates.
- **S-7:** every correction is logged with who, when and why. The public page shows "corrected" with the date, not the reason.
- **S-8:** if a correction changes the winner or the score, people who got the recap get a short correction notice. Other fixes (a foul moved to the right player) send nothing.

### 5.6 Unusual outcomes

| Outcome      | Effect                                                                           |
| ------------ | -------------------------------------------------------------------------------- |
| Forfeit      | Winner and loser recorded with the league's forfeit score. No player statistics. |
| Cancelled    | Does not count for anything                                                      |
| Postponed    | Waits for a new date                                                             |
| Tie          | Only if the season allows ties                                                   |
| Overtime     | Added periods; shown on the result                                               |
| Did not play | A rostered player who never entered gets no "game played"                        |

## 6. Standings and statistics

- **S-9: standings are always calculated from final games; nobody types them in.** Each division has its own table with seeds. When teams are level, the page can show why one is ahead ("head-to-head").
- **S-10: an admin can add an adjustment** (a points deduction, a forfeit win awarded by ruling) with a reason. It shows as a footnote under the table.
- **Statistics**: season totals and per-game averages for every stat the season keeps; leaders with a minimum-games rule the league sets; a full sortable table.
- **Player pages** (if the league shows them): this season, past seasons, and career totals within the league.
- **S-11: only final games count.** A live game's numbers show on its own page but not in season totals until it ends.
- **S-22 (new, the founder's direction, November 12): who can see players' statistics is a setting, and each team can choose for itself.**
  - Four levels: everyone; signed-in members of the league; the team's own players, parents and staff; or only the team's staff and the league's admins.
  - The league sets the starting level and whether teams may choose their own. A team's coach or admin then picks for their team. A new league starts at "everyone" (S-23, the founder, November 13) with teams allowed to choose (S-24).
  - It covers individual numbers: box score lines, season totals, stat leaders, and players' names in the play-by-play.
  - Scores, results and standings stay visible to everyone, because a game belongs to both teams. Where a team's numbers are hidden from a viewer, the box score shows that team's total only.
  - "Everyone" and "staff only" are built with the first statistics pages (stage 2). The two middle levels need registered members, so they arrive with accounts (stage 4).

## 7. Awards

Part of the Awards option.

- The league defines its own **award types**: weekly ones (Faraj's Akhlaq award and Men of the Match) and season ones (Champion, MVP, Scoring Champion).
- Each round, the admin picks winners. For awards tied to a stat, the system suggests the leader.
- Winners appear on the Awards page, the home page's recent awards, and the player's own page, and the winner is notified.
- **S-12:** marking the season's **champion** fills the champion banner and adds a plate to the trophy display ([P5](P5-site-customization.md) section 6).

## 8. A league where only some games are tracked

How a game is recorded can differ game by game (section 1). So a league can have live tracking for some games and only final scores for others.

- Standings count every final game, however it was recorded.
- Statistics count only the games where they were recorded, and averages are worked out over those games only.
- A team's page shows its record and results either way.

This is how the demo league works ([P9](P9-faraj-and-tcsaal.md) section 3): Al-Hadi's games are tracked live, and the league's other games carry final scores when someone enters or imports them, or stay as fixtures. There is no separate "team site" (U-5).

## 9. Things deliberately left for later

**S-13** captains drafting from their own phones · **S-14** referee and official assignment · **S-15** availability polls ("who is coming Sunday?") · **S-16** live tracking for sports other than basketball · **S-17** shot charts and fuller basketball stats (rebounds, assists, steals, blocks, turnovers, missed shots) · **S-19** multi-venue travel-aware scheduling · **S-20** video attached to plays.

S-17 is the first of these I would bring forward; the tracker's design already allows for more stat buttons.

**S-18** (linking a team site's games to an official league) was dropped on November 12, because there are no team sites (U-5).
