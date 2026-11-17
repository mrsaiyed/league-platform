# P7 — Teams, schedule and game day

[Spec home](../README.md) · Decisions S-1 to S-22

Everything between "registration closed" and "champion crowned".

## 1. Season settings

Set in **Admin → Season settings**. This is the first thing an organizer settles, because brackets, standings and the live tracker all follow from it. Every setting has a preset, so it takes a minute, and the admin can change any of it later (S-1). Who can see a season is set here too: the league's owner or an admin shows a season to visitors, and can hide it again, each after one question; every new season, a new league's first one included, starts hidden (**A-18**, decided for you).

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

**S-42 (decided for you, November 14): a game under way is never handed to another scorekeeper without a question.** If the first scorekeeper's device has gone quiet (no signal in the gym), the next person who opens the game is told who was scoring and when that device was last heard from, and takes over only by saying yes. **S-43 (decided for you, November 14): plays that were not saved can be sent after all,** by the scorekeeper's own tap, when nobody has recorded anything in that game since; otherwise they are entered again. No play is ever counted twice.

**S-41 (decided for you, November 14): what the roster rules do.** A team's roster cannot grow past the season's largest size. After the lock date only the owner and admins change rosters. A roster under the smallest size is a warning, never a refusal. A player added at the scorer's table (S-6) is refused by neither rule, so a game is never stopped by them, and is marked for the admin to review. **S-44 (decided for you, November 14): a player added at the scorer's table is never refused because their number is already worn.** They are taken, marked for review (S-6), and the clash is marked on both players for the admin; the season's unique-numbers rule applies when the admin confirms the player and on the league's own roster screens. Only a change of number at the table to one already worn is refused (S-37), with a sentence naming who wears it. **S-45 (decided for you, November 14): at the table a scorekeeper may rename, or take off, only a player who was added at a scorer's table and not yet reviewed by an admin.** Never the league's own roster, never a player an admin has confirmed. Taking off is for such a player added at this or an earlier game who has no line in any game, and sends them to the bin (T-45). A player added at the table stays on that team's roster for the season, marked for review.

## 2. Teams

Teams come from three places: created by hand, registered by captains ([P6](P6-registration-and-accounts.md) section 3), or carried over from last season. Each has a name, color, optional logo, a division, and a captain or coach. A team's roster is built by dragging registered people onto it, or by the draft. Jersey numbers are set on the roster and can be changed at the scorer's table by whoever is scoring that game (**S-37**, decided for you); where the season wants unique numbers, a number already worn on the team is refused with a sentence naming who wears it. A player who leaves or is replaced mid-season stays in the team's history with every game they played (R-17). The leaving date cannot be after the league's own today. A player marked as left by mistake can be put back; if another player now wears their number, they come back without one and the screen says so with both names (**R-32**, decided for you). Putting them back is one tap ("Put back on the roster (marked by mistake)"): the leaving date is cleared and no "left" line is kept, and a number is held back only where the season wants unique numbers. It is offered only where it can work: not for someone already back on the team, nor for someone taken off the league list.

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

A grid of rounds and slots (Faraj's "Edit Full Schedule" view). Drag a game to another slot, swap two games, add or remove a game, add a round (a name and a date), remove a round that has no games, rename a round ("Week 5 — Rivalry Week"), change a round's date. A new round is numbered after the others, whatever its date (S-55). A game moved to another round is asked whether it takes that round's date, never moved silently (S-54). A game is flagged as outside its round only when its date is before its round's date or on or after the next round's (for the last round: a week or more after its date), because a round often holds games on several days (S-53). Clashes are flagged the moment they happen: a team in two places, a court double-booked, a game on a skipped date. A game in the bin does not hold its round: the round can still be removed, and the game comes back from the bin with no round (S-60). A game with no date yet still holds its round, and the round says how many it holds ("1 game with no date yet"), so a round offers to be removed only when it can be. Rounds are listed by their dates everywhere, rounds with no date last and rounds of one date by number, and each is shown by its name (S-61). Games outside their round are named when the schedule is published and never stop it (S-62). A game removed by mistake is answered "Removed: Herons at Otters, Round 4" with "Put it back", which adds it to the draft again exactly as the draft last held it, until the draft is published or discarded; if its round has since been removed from the draft, it comes back with no round, under "Games with no round", and the answer says so before and after the tap (S-60). The grid's count of changes is what publishing would change, so a game removed and put back counts as nothing.

### 4.4 Publish

The schedule is a draft until published. After that, every change is also a draft: the admin makes edits, sees a summary ("3 games moved, 4 teams and 38 people affected"), and publishes. Affected people are notified ([P8](P8-notifications.md)).

### Also

- **Import** a schedule from a spreadsheet, for leagues that already have one. This is how the demo league's fixtures come in.
- **Game states**: scheduled, live, final, postponed, cancelled, forfeited. A postponed game sits in a "to be rescheduled" list until given a new slot. Postponing offers a new date at once, or "decide later" (**S-49**, decided for you).
- **Calendar feed**: every team and the whole league has a calendar link that phones subscribe to.

**S-3 (agreed, changed November 12): the admin decides the schedule's format; what we automate grows over time.** We do not choose a league's format for it. From the first release an admin can build or import any schedule by hand in the grid: any number of games, any matchups, any mix of divisions. The generator automates the common case first: every team plays every other team a chosen number of times, within divisions or across them, with the fairness rules above. More automatic formats are added as leagues ask. What the generator does not handle yet is referee assignment, travel distance and sharing venues between programs, which come with stage 6.

### 4.5 Playoffs

When the regular season ends, the admin creates a **bracket**: choose how many teams qualify (per division or overall) and the system seeds them from the standings, with byes where needed. Winners advance automatically as games go final. The admin can override any seeding or matchup before it starts.

**S-4 (agreed, changed November 12): the admin chooses the playoff format.** The choices are single elimination, double elimination, best-of series, pool play followed by a bracket, or custom. With each: how many teams qualify, seeding from the standings or by hand, a fixed bracket or reseeding each round, and whether there is a third-place game. They are built in this order: single elimination and custom first, then double elimination and best-of series, then pool play. "Custom" means the admin lays out the rounds and games by hand and says who advances, so any format can be run from the first release, even before we automate it.

## 5. Game day

### 5.1 Before the game

- The league's reminders go out ([P8](P8-notifications.md)).
- A scorekeeper is assigned to the game, or any scorekeeper opens it from their list. The league chooses which. Signed in, they also find the button on that game's card and page on the league's public site, shown only to a person who may score that game and never to a visitor (**S-50**, decided for you): "Score this game" for a game recorded live (one with plays already too), "Enter the score" for a game recorded as a final score or a box score, which leads to that game in Games. It shows on a game being played, and on a game still to play from the start of the game's own day in the league's time zone (today's games, and earlier days' games that still have no result), until the game is final (**S-70**, decided for you). A game days ahead, a game with no date yet, and a final game that can still be reopened show nothing: the menu's "My games to score" and Admin → Games lead to those.
- The scorekeeper opens `/{league}/score/{game}` on a phone or tablet and confirms the game format. Only games recorded live have a "Score this game" button (**S-38**, decided for you); an admin can switch a game to live in the schedule. A game recorded as a final score or a box score says so on the scorekeeper's list and on its tracker address, with a link to enter its score in Games, which a scorekeeper may do.
- The scorekeeper's list puts tonight first: games being played now, then today's games still to play, then the days ahead, and finished games last.
- Someone not signed in who opens the tracker's address, or the scorekeeper's list, is sent to sign in and brought back to it (**U-15**, decided for you); a device signed out while a game is open keeps scoring and offers the same. In an archived league, a scorekeeper who still holds the role is told the league is archived, with a way back, rather than "you do not have access". A scorekeeper who may not score a game (one assigned to someone else, in a league that scores assigned games only) is told so, with the way back to their games.
- The confirmation lists every rule of the game, the clock mode (stop or running) included (**S-39**, decided for you). If the officials are playing a different format, the scorekeeper changes it for this game before the first play, where the league allows it: a league setting, "Scorekeepers may change a game's format before it starts", on to begin with (**S-35**, decided for you). With it off, the scorekeeper asks an admin, who can give any game its own format.

### 5.2 Three ways to record a game

**Final score only.** Two numbers and a tap. For leagues and sports where that is all that is wanted. A game that has plays recorded by the live tracker is refused here too, in a plain sentence, and is ended in the tracker (**S-46**, decided for you); a game set to live tracking that has no plays yet can still be finished with two numbers.

**Box score afterwards.** A grid of players and stats filled in from a paper sheet.

How the grid works (built in step 2.64):

- **Columns follow the season's "Statistics kept" (section 1).** Points only: points. Points and fouls: points, fouls. The standard set: points, 3-pointers, free throws, fouls, and minutes. The full set (**S-25**, decided for you): the standard set plus rebounds, assists, steals, blocks and turnovers.
- **Each team's roster is listed**, players who have left the team since included (R-17), as they may have played that game.
- **Empty boxes.** A player who is ticked as played, or has any number filled in, played. A column with at least one number for a team was kept for that team, so its empty boxes are 0. A column left wholly empty was not kept, and does not count in that player's averages. A team score left empty is the total of its players' points, 0 when none has any.
- **A typed score that differs from the players' points is not refused** (**S-26**, decided for you): the admin may know better than the sheet. The page shows a warning as they type, before saving, and the score saved is the one typed. On the game's public page the score stays as typed, in the box score's Total too, and one plain sentence under the box score says what the players' points add to ("The players' points add to 48. The final score was entered as 50."). No "team" row is made up to make the numbers meet, because the difference can go either way (S-26 as changed by step 2.196, decided for you). A team for which nothing was entered has no table of dashes: one sentence stands in its place ("No player numbers were recorded for this team."), and its score is on the board.
- **A game scored with the live tracker is refused here.** It is corrected in the tracker, so its list of plays still explains its numbers.
- **A final game is corrected by reopening it** with a reason (S-7), then saving the grid again.
- **Switching back to a final score only** (**S-27**, decided for you): if a reopened box score game is saved with two numbers only, its old lines are cleared in the same save, so they no longer count in season totals or stat leaders.

**Live tracking.** This is the tracker already built and proven at Al-Hadi's games, itself modeled on Faraj's:

- Tap five players per team to set the starters. A short-handed team can start fewer.
- Tap a player, then **+1, +2, +3, Foul**. Substitute by tapping a bench player's "in for" or dragging onto the floor.
- Clock with start and stop; tap it to correct it. Period selector, team fouls, bonus indicator, horn.
- **Running clock switch.** The clock follows the league's rule (section 1). Under a stop clock it stops by itself when a foul is recorded. Under a running clock it keeps going. A switch on the tracker turns the running clock on or off at any moment of the game, whatever the rule says. If the league has a mercy rule, the tracker switches to a running clock when the lead reaches the chosen number and says so; the scorekeeper can switch it back.
- **Undo and redo** through the list of plays.
- Add a player on the spot for either team: a number, a name, or both (**S-34**, decided for you). A player added by number only is shown as "#12" everywhere.
- **Mark not started**, for a game started by mistake (**S-40**, decided for you): whoever is scoring may do it while nothing but lineups and clock taps are recorded; once a basket, foul or turnover is recorded it needs the permission to correct games and a reason. The game is scheduled again and the event log keeps what was cleared. Lineups, substitutions, timeouts, jersey colors and every clock tap (start, pause, period, setting the clock, the clock mode) count as lineups and clock taps; a basket, foul or turnover (a team turnover too) counts only while it stands, so one recorded and then undone is nothing recorded. S-1 (a game keeps the rules it was played under) does not apply: the game was never played, so it has no rules of its own again and takes the season's when it next starts. A game that was ever final (ended and reopened, or decided by hand and reopened) is never marked not started, by anyone: it was played, and it is corrected instead. While another account's scoring session is on the game, its lease run out or not, it is refused: that device may be scoring with no signal, and the way through is taking the game over, which asks first; the same account on another device may. The reason, where one is needed, is chosen from a fixed list: started by mistake, only trying the tracker, wrong game, wrong game format, or another reason.
- **Every tap is saved as it happens.** If the gym's connection drops, the tracker keeps working, shows how many actions are waiting, and sends them when the connection returns.
- **End game** locks the result.

**S-5 (agreed, with an addition, November 12): one device scores a game at a time, a second device can take over, and a game can be saved to a file.**

- If a tablet dies, another scorekeeper opens the game, is told who was scoring, confirms the takeover, and continues from the last saved tap.
- Every tap is kept on the device first and uploads by itself as soon as there is a connection. No Wi-Fi in the gym is not a problem.
- The scorekeeper can also **save a copy of the game** to the device as a file at any time. If that tablet never gets back online, the file can be opened on any other phone or computer and uploaded from there. Nothing is counted twice if the tablet uploads later as well.

**S-6 (agreed, changed November 12): the league decides whether players can be added at the scorer's table.** Three choices: allowed, with the added player flagged for the admin afterwards ("2 walk-up players to review"); allowed with no flag; or not allowed, so only rostered players can be scored. The first is the starting setting, so game night is never blocked by paperwork.

**S-21 (new, the founder's direction, November 12): every game rule that differs between leagues is a setting, and the scorekeeper can override anything automatic at the table.** Leagues play by different rules. A high school league stops the clock on every foul. A rec league lets it run. Some switch to a running clock once a team leads by a set number of points. So nothing about the rules is built in.

- Each rule is a season setting, with presets to start from: a high-school-style stop clock, a rec-league-style running clock, or custom.
- A single game can be given different rules before it starts: by an admin, or at the table by the scorekeeper where the league allows it (S-35).
- During a game the clock mode can be switched at any moment, and the clock, period, fouls and score can always be corrected by hand.
- Built first: the clock mode and its switch, stopping on fouls, the mercy rule, a stop clock in the last minutes, and the personal foul limit. Timeouts and technical fouls follow when a league asks for them.
- How those rules meet (decided for you, S-28 to S-32): every overtime period ends in the last-minutes stop clock; the scorekeeper's switch to a running clock inside those last minutes lasts until they end; inside them the stop clock wins over the mercy rule; the mercy rule switches again only after the lead drops below the number, and the scorekeeper switches back by hand; a player at the foul limit is marked out, but the tracker does not take them off the floor or keep them off.
- **Minutes follow the game clock (S-71, decided for you, November 16).** In each period the time a player has played is counted on the game clock: what the period started with, less what the clock shows, for the stretches that player was on the court. When the scorekeeper sets the clock, time put back comes off the players who were on the court (it was not played) and time taken off is added to them (it was played with the clock stopped). A clock set wrongly and set right before it is started again changes nothing, and a correction never reaches into another period. The clock form says what a set will do before it is made.
- This is built in stage 2, after the demo cut. It does not hold up the demo, because the clock can always be stopped by hand, as it is today.

### 5.3 What fans see

`/{league}/games/{game}` shows the scoreboard and clock, both teams' box scores and the play-by-play, updating within about two seconds of each tap, with no refreshing.

**A box score's Total counts everything the team did** (step 2.196; S-26 as changed, decided for you). Its columns are the season's "Statistics kept" (section 1), in that order, as the statistics page shows them, each one the game recorded. A turnover charged to the team rather than a player (the scoring screen offers one in every season) is in the team's Total of turnovers, and a sentence under the box score says so ("The Total includes 1 turnover charged to the team, not to a player."); its points are the game's score. Every Total the page shows is what its column adds up to, or a sentence under the table says why not. **S-33:** until step 2.104 the play-by-play is the list as it stood when the page was opened, with a "Show newer plays" link; the latest play, the score, the team fouls and the clock update live. The league home and schedule show a **Live** marker and the running score.

### 5.4 When the game ends

1. The scorekeeper taps **End game**. The result is final.
2. Standings, team records, player totals and stat leaders update at once.
3. If it is a playoff game, the winner moves on in the bracket.
4. **Ten minutes later** the recap goes out ([P8](P8-notifications.md)). The pause is there to catch a mistaken final.

### 5.5 Corrections

- An admin (or the scorekeeper, within a time the league sets) can **reopen** a final game with a reason, fix it, and finalize again. Everything recalculates. The scorekeeper's time is a league setting, 30 minutes after the end to begin with, 0 for never and at most a day (**S-36**, decided for you); after it, only an admin reopens the game. Only the account that ended the game reopens it this way; someone who may correct games (an admin, a scheduler) can reopen it at any time. Before the tap the tracker is told whether Reopen is offered and until when, so no one gives a reason and is then told it is too late.
- **S-7:** every correction is logged with who, when and why. The public page shows "corrected" with the date, not the reason.
- **S-52 (decided for you, November 15):** the scorekeeper's own reopen time (S-36) also covers a final score or a forfeit they recorded by hand themselves: within the league's minutes, with a reason. After that, or for a result someone else recorded, an admin or scheduler reopens it.
- **S-47 (decided for you, November 15):** while a final game is reopened, its public page shows the result as it stood, marked "Being corrected". It never says the game has not started.
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

A cancelled game can be put back, with a reason, by whoever may cancel it; it is a scheduled game again (**S-51**, decided for you).

## 6. Standings and statistics

- **S-9: standings are always calculated from final games; nobody types them in.** Each division has its own table with seeds. When teams are level, the page can show why one is ahead ("head-to-head").
- **S-10: an admin can add an adjustment** (a points deduction, a forfeit win awarded by ruling) with a reason. It shows as a footnote under the table.
- **Statistics**: season totals and per-game averages for every stat the season keeps (a team's totals count everything the team did, as its box scores' Totals do: its turnovers include those charged to the team itself, and its points are the final scores of the games the statistics count, as the game pages and the standings have them, while a player's points stay their own lines; step 2.196, S-26 as changed, decided for you); leaders with a minimum-games rule the league sets, which starts at 3 games (**S-63**, decided for you); a full sortable table. Fouls and turnovers get no leaders card unless the league switches it on (**S-48**, decided for you); they stay in the tables. The rule is the league setting `statistics.minimumGamesToRank`, set from 0 to 1000 on the league's settings screen; 0 ranks everyone, and a player with fewer games still shows in the full table.
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
