# P9 — The reference leagues, walked through

[Spec home](../README.md) · Decisions F-1 to F-11

Three real organizations test the design: Faraj League (small, heavily customized, run by the founder), TCSAAL (large), and Al-Hadi (a team we already track live, shown inside a demo league). If the product handles all three without special code, the design holds.

## 1. Faraj League

What I know about Faraj comes from reading its code and documents on November 10, 2026. Where I have it wrong, correct me.

### 1.1 Everything Faraj has today, and where it lands

"Setting" means the admin just configures it. "Option" means a feature any league can switch on. Nothing in this table is special code for Faraj.

| On farajleague.org today                                                                         | On the platform                                                                                                      | Kind    |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------- |
| Dark navy, gold and teal look; its fonts; logo                                                   | Design settings ([P5](P5-site-customization.md) section 2)                                                           | Setting |
| Menu: Home, Standings, Schedule, Teams, Players, Stats, Awards, Draft, Media, About, Sponsors    | Menu editor                                                                                                          | Setting |
| Phone menu as a slide-in drawer with the logo centered and season picker at the bottom           | Standard phone menu, with the season picker position as a setting                                                    | Setting |
| Season picker (Spring 2026, Fall 2026...)                                                        | Seasons                                                                                                              | Core    |
| Home banner with a badge and season tag                                                          | Large banner section                                                                                                 | Setting |
| Home tiles: teams, players, conferences, weeks played, each a link                               | Headline numbers section                                                                                             | Setting |
| Home: recent matchups, standings preview, recent awards, season awards                           | Recent results, compact standings, awards sections                                                                   | Setting |
| Everything on the home page clickable through to the right place                                 | Standard behavior of those sections                                                                                  | Core    |
| **3D champions trophy** with engraved plates                                                     | Trophy display section, 3D style (C-5)                                                                               | Option  |
| Champion card and champion team photo                                                            | Champion banner section                                                                                              | Option  |
| Two conferences (Mecca, Medina) with their own colors and names                                  | Divisions, renamed "Conferences" (U-4), each with a color                                                            | Setting |
| Standings with seeds; tiebreakers head-to-head, point difference, points scored                  | Standings rules ([P7](P7-teams-schedule-gameday.md) section 1)                                                       | Setting |
| Schedule by week: past (collapsed), current, upcoming; week picker; team filter                  | Schedule section with those options                                                                                  | Setting |
| Matchup cards: game number, time, date; logos; VS; "view box score"; winner strip                | Game card, in this style                                                                                             | Setting |
| Admin's "Edit Full Schedule" grid of weeks and slots, week labels and dates                      | Schedule builder's hand-editing grid                                                                                 | Core    |
| Teams page: cards with logo, record and seed; roster opens beneath                               | Team grid section                                                                                                    | Setting |
| Player stats: leaders and a table; "points only" seasons                                         | Stats sections; statistics kept per season                                                                           | Setting |
| Box scores; live scores for fans                                                                 | Game page                                                                                                            | Core    |
| Live courtside tracker with horn, fouls, bonus, undo, jersey numbers                             | The tracker (already matched to Faraj's)                                                                             | Core    |
| Forfeits; players marked did-not-play                                                            | Game outcomes                                                                                                        | Core    |
| Weekly awards (Akhlaq, Men of the Match 1–3); season awards (Champion, MVP, Scoring); MVP ladder | Awards option with league-defined award types                                                                        | Option  |
| Draft: player bank, drag and drop, captains, team order, pick timer, recap                       | Draft option                                                                                                         | Option  |
| Media by week: Top Plays, Baseline Episodes, Match Highlights; Instagram button                  | Media option with league-named collections; social button section                                                    | Option  |
| About page: league story including Arabic text; conference descriptions that expand              | Text and collapsible sections. Text supports right-to-left scripts.                                                  | Setting |
| Sponsors per season, in tiers, including conference sponsors                                     | Sponsors option                                                                                                      | Option  |
| A logo per season                                                                                | Season setting                                                                                                       | Setting |
| Admin signs in with one shared password                                                          | Each admin has their own account and role                                                                            | Better  |
| Admin is the public site with edit buttons on everything                                         | Edit site mode, plus pencils when browsing as an admin. The dashboard itself is new and does not copy Faraj's (A-1). | Core    |
| Spreadsheet export for backup                                                                    | Export                                                                                                               | Core    |

**F-1 (agreed): this table is the acceptance list for "Faraj can run on the platform".** Every row is demonstrated on the platform before Faraj moves.

### 1.2 What Faraj gains that it does not have today

Online registration with a form and waiver in place of whatever is used now; an account for every player; game-day reminders and recaps; a "my next game" strip for signed-in players; a generated schedule with a fairness report; a personal sign-in and activity log for each admin; real page addresses that can be shared.

### 1.3 Moving Faraj over

1. We create `oursite.com/farajleague` in draft.
2. A one-time transfer copies everything from Faraj's current database: every past season complete and unchanged (F-3), with its teams, players, rosters, games, statistics, awards, sponsors, media and editable wording. We check totals match (every team's record, every player's points) before going further.
3. The site is rebuilt in the admin from sections and design settings only.
4. The feature list above is checked row by row, and the founder reviews old and new side by side on a phone and a laptop and signs off (C-7).
5. Faraj's admins are invited with their own accounts. The shared password is retired.
6. All existing players exist as profiles without accounts (R-3). Accounts attach when they register for the next season or claim their profile.
7. `farajleague.org` is pointed at `oursite.com/farajleague`. The old site is kept, unlinked, for one season as a fallback.

**F-2 (recommended): move Faraj between seasons, never during one.** In plain terms: the real league switches to the new site in the gap between two seasons, so no season is ever split across the old site and the new one. The first real season on the platform runs registration, draft, schedule and game days from the start.

**F-11 (agreed, the founder's idea, November 12): a "Faraj test" league runs a whole test season first.** Faraj's seasons are not scheduled in advance, so we do not wait for one. A private copy of Faraj on the platform, with its real history transferred, is used to run a complete pretend season: registration, draft, schedule, scored games, reminders, recaps, awards, and a champion added to the trophy. The founder and a few helpers play the parts. What goes wrong is found there and not in a real season. When the test season passes, the real league moves at its next gap between seasons (F-2).

**F-3 (agreed, changed November 12): there is no target season, and every past season is kept as it is.** Season 2 has just ended and Season 3 is next. The platform does not set Season 3's dates. Faraj moves when the platform is ready, between seasons (F-2). If Season 3 starts first, it runs on the current site and is transferred afterwards. Either way Seasons 1 and 2 (and 3 if it comes to that) are transferred whole: teams, rosters, games, statistics, awards, sponsors and media, with totals checked against the current site before anyone is moved.

### 1.4 What Faraj makes us build earlier than we otherwise would

The 3D trophy, the draft with its timer, media collections, weekly awards, and right-to-left text. Each is useful to other leagues, and having them makes our first showcase league look like nobody else's. I think that is worth it. It does add roughly one stage of work before self-serve sign-up opens (see T10 stage 3).

## 2. TCSAAL

**What I actually know:** TCSAAL runs competitions among Texas charter schools; Al-Hadi's varsity boys basketball team plays in it; it publishes team pages and numbered fixtures on its own website. **Everything else below is my assumption** about an organization of that kind and must be confirmed with TCSAAL before we promise anything: many member schools, several sports each with varsity and other levels for boys and girls, districts and regions, playoffs to a state championship, and a small central office.

### 2.1 How TCSAAL would be laid out

- **League**: TCSAAL at `oursite.com/tcsaal`.
- **Programs**: one per sport, level and group ("Varsity Boys Basketball"), each at `oursite.com/tcsaal/varsity-boys-basketball`.
- **Seasons**: "2026–27" in each program.
- **Divisions**: districts. Regions and state are playoff stages.
- **Clubs**: each member school, with a page at `oursite.com/tcsaal/clubs/al-hadi` listing its teams in every program.
- **Roles**: the league office are owner and admins; each sport may have its own scheduler; each school's athletic director is a club admin; coaches manage their team; schools supply scorekeepers.

### 2.2 A season at TCSAAL's size

1. **Schools join.** The office imports the list of schools and invites each athletic director.
2. **Teams are declared.** Each athletic director says which programs the school will enter. The office approves.
3. **Rosters.** Coaches or athletic directors enter students, or import them from a spreadsheet. Students are minors: a child under 13 is registered by a parent, older students can have their own accounts (R-11, R-12), and public pages show limited names (R-14).
4. **Schedule.** The office builds or imports each program's schedule by district.
5. **Game day.** The home school's scorekeeper records the game, live or as a final score.
6. **Results.** Standings update per district. The opposing coach can **confirm or dispute** the result.
7. **Playoffs.** District standings seed regional brackets; winners feed the state bracket.

### 2.3 What TCSAAL needs that the first release does not have

| Need                                                               | Stage in [T10](../technical/T10-build-order.md)                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Several programs under one league                                  | 6 (the database allows it from stage 1)                             |
| Clubs and club admins                                              | 6                                                                   |
| Roles limited to one program                                       | 6                                                                   |
| Bulk import of schools, teams, rosters and schedules               | Import arrives at stage 2; bulk tools at 6                          |
| Result confirmation and disputes between two schools               | 6                                                                   |
| Brackets fed from several districts                                | 6                                                                   |
| Eligibility records for students                                   | After 6; needs TCSAAL's actual rules                                |
| Live tracking for sports other than basketball                     | Sport by sport after 6                                              |
| Academic competitions                                              | Out of scope unless they fit "teams, schedule, results" as they are |
| A contract: data ownership, student privacy, support hours, uptime | A business matter at sale time (B-9, B-10)                          |

**F-4 (agreed, changed November 12): we show TCSAAL a demo when Al-Hadi's season ends, and we ask for a pilot, not the whole association.** The demo is described in section 3. At that meeting we say plainly what is built, what is not (the table above), and what size we have tested (F-5, F-9). We ask for two things: a pilot next season (one sport, or one district), and an hour of their time to correct the assumptions in this section. The whole association still waits for stage 6 and the load tests. We keep making sure nothing before then blocks it (U-12).

**F-5 (agreed): prove the size before promising it.** Before we promise an association anything about size, we load a pretend league of that scale (as a starting estimate: 150 schools, 1,000 teams, 15,000 players, 6,000 games, 40 games live at once with 5,000 people watching) and measure. See [T8](../technical/T8-scale-reliability-operations.md). The demo conversation (F-4) can happen before that, because it claims only what Al-Hadi's season shows.

### 2.4 How TCSAAL would actually become a customer

Not through the sign-up page. Through the demo (F-4): one of its own member schools, tracked live for a whole season by that school's people, shown as a league site. Then a pilot of one sport or one district. Then the rest.

## 3. Al-Hadi and the TCSAAL demo

Al-Hadi is a team we run ourselves. It is not a kind of customer (B-2).

- **Today**: the live tracker in `apps/live-stats`, with ten 2026–27 TCSAAL fixtures (November 2 to January 13), a roster, live game pages and season totals. One shared scorer passcode.
- **F-6 (agreed, changed twice on November 12): the demo is the whole TCSAAL league, with Al-Hadi as one team in it.** The demo league is laid out the way TCSAAL is: program "Varsity Boys Basketball", season "2026–27", every district as a division, and every team in it. A visitor can go to any team and see its schedule, its results and its place in the standings. Al-Hadi's games carry full live stats, because we tracked them. Other teams' games carry final scores, entered or imported from TCSAAL's public results ([P7](P7-teams-schedule-gameday.md) section 8). The start page for members is "my team's page" (U-5), so Al-Hadi's parents land on Al-Hadi. Real accounts replace the passcode: we own the league, and Al-Hadi's coach and scorekeepers are given roles.
- **What the demo honestly contains.** It covers one program, varsity boys basketball; TCSAAL's other sports and levels would be further programs, which is stage 6. Full statistics exist only for the games we scored. For other schools we show what TCSAAL already publishes: teams, fixtures and results. Another school's roster is shown only where TCSAAL's own site already shows it, and its players' statistics start as "staff only" (S-22) until that school chooses otherwise. Those are other schools' students, and showing them is the school's decision, not ours. That control is also exactly what we want TCSAAL to see.
- **The cost.** The software is the same. The extra work is gathering every team's fixtures and results into a spreadsheet for import, which is a few hours for someone and is repeated as results come in.
- **F-7:** games already recorded in the current tracker are transferred, not re-entered. The current tracker keeps running until the platform version has passed a full rehearsal (T-16). No real game is risked on new software for the sake of the demo date.
  - **How the transfer treats what it cannot bring over as it is** (step 2.58, record 050; decided for you, waiting for your yes). Only Al-Hadi's players are added, unless whoever runs it asks for the other teams' too (F-12). A player the tracker has no first and last name for is not given a made-up one: a game that names them waits until someone puts them on the roster by hand, and any of Al-Hadi's players not brought over are listed, so the transfer is not finished until they are (F-13). A game that already has a result here, entered by hand or imported, is never overwritten: it waits until an admin reopens it (F-14). Players the tracker marks as no longer active are added like the rest, with no leaving date (F-15). Someone already in the league's list with the same full name and on no team is taken to be the player, and the dry run says so (F-16). Nothing is written while any game has a problem, and only an owner or admin of the whole league may run it.
- **F-8:** more Al-Hadi teams (junior varsity, girls, other sports) would be further programs in the same demo league when wanted.

### What TCSAAL is shown

1. Their league as a site: divisions, teams, schedule and standings, at its own address with its own look.
2. One team's whole real season: every game tracked live by the school's own people, with box scores and season leaders.
3. A game scored live in front of them on a phone, appearing on a second screen within two seconds.
4. The admin: roles for a school's staff, a schedule change, a corrected score.

**F-10 (new, recommended; needs the founder's yes): until TCSAAL agrees, the demo league does not present itself as TCSAAL.** It carries a clear "unofficial demo, not run by TCSAAL" notice, does not use TCSAAL's logo, and stays out of `/find` and search engines. Using an organization's public schedule and results to pitch it is normal. A public site that looks like its official one is how a pitch turns into a complaint. The day TCSAAL agrees, renaming and listing the league is a setting.

### Timing, honestly

Al-Hadi's last listed game is January 13, 2027, about nine weeks from November 12. Stage 1 plus the demo part of stage 2 is estimated at seven to nine weeks ([T10](../technical/T10-build-order.md)), and estimates this rough usually slip. So the meeting should be booked for after the season, not for the day of the last game. If the platform version is not ready by then, the season's real games are still safe in the current tracker and are shown from there, with the platform as a preview. Foundations are not rushed to hit the date.

## 4. What the three together prove

| Claim in the vision                           | Proven by                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| "A league of any size"                        | Faraj (6 teams), the demo league (all of TCSAAL's varsity boys basketball), a TCSAAL-sized test league (F-5) |
| "Maximum admin customizability"               | Faraj rebuilt from the admin with no special code (F-1)                                                      |
| "Each get their own home"                     | Faraj and the demo league at two addresses with two looks, on one system                                     |
| "An account is built... keeps them logged in" | Faraj's first registration season                                                                            |
| "Game-day reminders and recaps"               | Al-Hadi parents and Faraj players receiving them                                                             |

**F-9 (honest limit): "any size" at launch means "any size we have tested".** We state the tested sizes publicly and raise them as we measure more, instead of claiming no limit.
