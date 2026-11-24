# The MVP lists: PROPOSED, waiting for the founder to approve

Made on 2026-11-24 at the founder's request ("mvp done earlier while you still work as long as needed on the rest"). Until the founder says yes, this is a proposal.

# What Faraj League needs first: the 94 open steps of stage 2, sorted

**Summary.** Of the 94 steps not yet done in `docs/build/STAGE-2.md`: **38 are needed before Faraj League can run a real season** on the platform (list A, in the order to build them), **54 can wait** until after that (list B), and **2 should not be built at all** because other steps already did or will do their work (list C). 38 + 54 + 2 = 94.

How this was judged: a step is in A when, without it, a real season cannot be run safely: people sign in; teams, rosters, schedule, results, standings and public pages work; a game can be scored courtside with bad signal and corrected afterwards; Faraj's old data comes over; children's records and private data are safe; the legal must-haves hold (terms, privacy, consent, deleting a person); and the site can be published, backed up, restored and watched. Everything that serves other leagues or sports, is a convenience, polish, a second way of doing something, or paperwork for the build, is in B. "(unsure: ...)" marks a call that could go the other way.

Two things to know before reading:

- **Faraj's own acceptance list is bigger than stage 2.** The list the founder agreed (F-1, in `docs/specs/v1/product/P9-faraj-and-tcsaal.md`) also has weekly and season awards, the draft, media by week, sponsors, the About page with Arabic text, a logo per season and "edit the site" mode. None of those are stage 2 steps; they come in stage 3. So list A is what is needed to **run games, results and standings for real**. Moving Faraj off its old site completely also needs those stage 3 parts.
- **Step 2.78 is stuck on the founder.** Reading Faraj's export needs the layout of Faraj's current database (its "migration" files, which hold no one's data). That is already under "Needs the founder" in `docs/build/STATUS.md`.

---

## A. Needed before Faraj League runs a real season (build in this order)

### Game night: scoring courtside, with bad signal, and fixing mistakes afterwards

1. **2.118 The Players panel on the tracker.** Add or fix players at the table before tip-off. Why: a visiting team often arrives with no list; this is nearly finished (built and reviewed, waiting to land).
2. **2.61 Bad gym Wi-Fi test, the last part.** Why: proves a game scored with the connection dropping still ends with the right box score; the last part (a visiting team added by number, a number clash with no signal) needs 2.118.
3. **2.148 A game under way is never taken over without a question, and unsaved plays can be sent.** Why: today a second phone can take a game from a scorer with no signal, and their plays are lost.
   - **2.242 The device tells its own commands from somebody else's by their IDs** (added 2026-11-24, found while finishing 2.61; built right after 2.148). Why: after players are added at the table, a phone can wrongly list its taps as not saved.
4. **2.70 Save a copy and upload it.** Why: the rescue when a phone never gets signal or loses what it stored; nothing counts twice. (unsure: the offline queue already covers most bad-signal nights; this is the backup for the worst one.)
5. **2.119 The game format at the table.** Why: when officials say "tonight is played differently" (shorter game, other clock), the scorer can set it. Once it lands, step 2.68 is ticked (list C). (unsure: needed only if Faraj ever changes a game's format on the night; it is common in rec leagues.)
6. **2.177 A scorekeeper undoes a final score they typed themselves.** Why: brought in by 2.229, which works on the same commands and screen and must come after it.
7. **2.229 A correction keeps what it replaces.** Why: today saving a corrected game again can delete every player's line in it; a correction must never lose data.
8. **2.65 Correcting a tracked game in a grid.** Why: lets an admin fix a live-scored game afterwards so the play list still explains the final numbers. (unsure: a scorer can already reopen the game in the tracker; this is the practical way for an admin.)
9. **2.155 A refused save keeps what was typed.** Why: today one mistake empties every box, for example twelve players' points copied from a paper score sheet.
10. **2.159 A game's page tells the truth in every state.** Why: today a game with no score yet says "has not started" and sits under "Upcoming"; parents read this on game night.

### Faraj's league, seasons and old data

11. **2.125 Making, naming and publishing a league.** Why: the way to create Faraj's league in draft, set its name, time zone and contact, and publish it.
12. **2.130 Starting a new season.** Why: Faraj's first real season on the platform must be started after the old seasons come over; today a league with no current season has no way to add one.
13. **2.78 Faraj export reader.** Why: reads Faraj's current data. Blocked until the founder supplies the table layout (see above).
14. **2.79 Faraj transfer runner.** Why: puts Faraj's past seasons, teams, players and games into the platform through the normal commands, with a dry run first.
15. **2.80 Faraj totals check.** Why: proves every team's record and every player's totals match the old site before anyone relies on it.

### Signing in and people

16. **2.128 Your name, your password, your email.** Why: new accounts give their name once (so admins can tell people apart), and anyone can change their password and email; also needed by 2.133. (unsure: sign-in and "forgot password" already work; this is the account page.)
17. **2.90 Teams screens: browser test and paging.** Why: today an admin can pick only from the first 200 people when building a roster. (unsure: Faraj's players across all past seasons may or may not pass 200.)
18. **2.234 Limits on wrong passwords do not lock out the wrong person.** Why: today a stranger can lock a named coach out, and everyone on one gym's or school's network can be locked out together.

### Children's records and each league's private data

19. **2.223 One league gate for every way into a league.** Why: today the tracker's routes reach a league that is not published yet; Faraj will sit unpublished during the move and the test season.
20. **2.225 No person's ID in any public answer.** Why: a hidden or removed player, a child above all, must not be traceable through the public pages.
21. **2.226 Names on the scoring screens.** Why: the scorer's phone is sent every child's full name whatever the league's rule; it needs a decision first (the lead answers it, as the rules allow).
22. **2.146 The "Show as" control.** Why: the way an admin honours a parent's request to show their child by initials or remove them.
23. **2.227 Reads checked in the core, not only by the page.** Why: today a scorekeeper's role opens unpublished drafts and more than it should.
24. **2.228 The role-against-command test, whole.** Why: the proof that coaches, captains and limited staff cannot do more than their role; it follows 2.227. (unsure: it adds no feature, but it is the check that roles hold.)
25. **2.238 The start-up guard reads the protections themselves.** Why: the website refuses to start with a database login that could see every league's data.
26. **2.112 The background-job queue gets its own owner.** Why: the website's login must never read or change queued jobs (emails, exports, purges); also needed by part 2 of 2.209.
27. **2.213 The tracker's database connection checks who it talks to.** Why: the founder's laptop tools reach the live Al-Hadi tracker's database, where real children's names are; the connection must be checked and encrypted.

### What the law requires: deleting a person, getting your data out

28. **2.114 Account erasure for a person on a roster.** Why: today a parent or player on a roster can never delete their account; the law requires it.
29. **2.91 The bin's nightly emptying and purging.** Why: deleted things must really go after 30 days, and old sign-in codes must be cleared; also needed by 2.133.
30. **2.133 Handing over, deleting and leaving.** Why: the "delete my account" screen a person uses. (unsure: only that part is a must; handing a league to another owner and deleting a league could wait, but it is one step.)
31. **2.132 Exporting everything.** Why: Faraj's acceptance list keeps "spreadsheet export for backup" as a core row, and it is how a league takes its data with it.

### Publishing safely, backing up, restoring, and noticing when it breaks

32. **2.99 The missing automatic checks.** Why: a known-unsafe library or a leaked secret is caught before it reaches the live site. (unsure: protects the site rather than adding to it, but it guards the publishing.)
33. **2.211 Each program knows which database changes it needs.** Why: a new version started before its database is updated should refuse and say why, not serve error pages. (unsure: careful releases avoid it, but one mistake would take the site down.)
34. **2.212 When the sign-in service cannot answer.** Why: today a restart while the sign-in service is slow takes the public pages down too, and the free host restarts often.
35. **2.208 The database checks, as a script.** Why: the forty-odd checks that protect each league's data on the real database run as a script, not by hand; needed before 2.210.
36. **2.209 Being told when something breaks.** Why: today no error is reported, nothing checks that the site is up, and a failed job tells nobody.
37. **2.210 A restore, tried.** Why: no backup has ever been restored; it must be tried once before relying on it.
38. **2.214 The incident procedure and the game-night checklist.** Why: what to do when something goes wrong (including telling affected leagues within 72 hours, as the law requires) and the checklist for a game night; each tried once as a drill.

---

## B. Can wait until after Faraj's first real season (54 steps)

### For other leagues, other sports, schools and the association demo

- **2.63 Review of the demo cut** — it is the review for the association (TCSAAL) demo, and its long "needs" list would pull a dozen waiting steps in. A review of list A should be held before Faraj goes live instead. (unsure)
- **2.69 Running-clock switch and the mercy rule in the tracker** — only for leagues that use them. (unsure: needed if Faraj plays a running clock or a mercy rule)
- **2.123 Team fouls that reset each half** — only for leagues that count the bonus by the half. (unsure: needed if Faraj does)
- **2.169 No leaders card for fouls in youth leagues** — youth leagues; a settings question.
- **2.219 Whether a team's roster is public, set by the league** — for school associations; names already follow the league's rule.
- **2.232 A team with no roster listed says so truly** — for the association demo, where most schools have no roster.
- **2.233 Tracker games come over without making people of the other side's players** — only when Al-Hadi's games move over, which is for the association demo, not Faraj. (unsure: it protects other schools' students, so it must land before Al-Hadi's games move)
- **2.237 A big season's schedule stays fast** — for leagues with hundreds of games.
- **2.216 Lists that grow** — for leagues with years of games or thousands of players.
- **2.136 Our own staff tool, part two** — needed before the first outside league joins.
- **2.174 League settings → Features switches** — the parts they switch on and off (fees, draft, awards, media) do not exist yet.

### Conveniences and second ways of doing something

- **2.74 Generating a schedule** — a schedule can be typed in the grid or imported.
- **2.75 Importing people and teams** — Faraj's players come over through the transfer; new ones can be typed.
- **2.166 The fixture import keeps its promises** — a second way to enter a schedule; the grid works.
- **2.144 Overtime mark on a result, and the import template** — small additions.
- **2.173 Dragging a game in the schedule grid** — the forms already do the job.
- **2.183 Rounds in date order, a removed round put back** — the schedule works without it; care is needed when removing a round.
- **2.129 The admin's home page** — a shortcut page; every task is reachable already.
- **2.137 Knowing whether an email arrived** — invitations already work; this shows bounces.
- **2.71 Players added at the scorer's table: the other settings and the review list** — the starting setting already works; Faraj's rosters are known in advance.
- **2.131 The player's page** — the statistics page and box scores already show players' numbers; Faraj's acceptance list asks for leaders and a table, not a page per player. (unsure: Al-Hadi has one today)
- **2.197 Minutes on the game page and statistics page** — an extra statistics view; minutes are already counted and saved.
- **2.222 A coin flip recorded for teams still level** — rare; a standings adjustment can settle it meanwhile.
- **2.138 Season settings that do what they say** — roster limits not yet enforced are already marked "not in use yet".
- **2.104 The game page's play-by-play, live** — the page already updates the score; this adds the play list as it happens.
- **2.124 Live updates on the real live service** — pages already update by asking every few seconds.
- **2.116 The game page on live updates, not asking** — the same: a few seconds faster; needs 2.124.

### Polish and wording

- **2.134 Page titles and link previews** — polish.
- **2.139 The league's own words ("Conference", "Week")** — pages say "Division" and "Round" meanwhile. (unsure: the founder will notice it when comparing old and new sites side by side)
- **2.164 Team names lead to the team; short words explained** — polish.
- **2.165 Times written one way, with the time zone named** — the times are already right; this makes them read the same everywhere.
- **2.167 A league that cannot be changed says so** — only for archived or suspended leagues.
- **2.170 The team color you picked is kept** — a small bug with a workaround.
- **2.171 The words pass** — clearer wording across screens.
- **2.172 Visitor tidying; a past season says so** — polish.
- **2.184 A team's page in parts** — makes a long page easier on a phone; it works today.
- **2.186 The box score adds up each team's points** — helpful totals; the save already checks.
- **2.190 The public pages' last small things** — polish.
- **2.217 Error pages with scripts switched off** — rare browsers.
- **2.218 Email addresses with non-English letters** — rare.

### Further safety and speed work that can follow

- **2.230 Two admins changing the same thing at the same moment** — rare; small leagues have few admins.
- **2.231 History that cannot be emptied; a clearer activity log** — only the database owner could empty it today.
- **2.235 What the page-script protection still lets through** — extra protection; no way in is known today.
- **2.215 The speed figures, measured** — needed before speed is promised to anyone.
- **2.176 League pages kept and served faster** — speed and hosting cost; pages work today.

### Paperwork and the build's own housekeeping

- **2.81 Browser tests for part B** — tests steps that are themselves in this list.
- **2.82 Records and operations pages** — waits on 2.81; its rehearsal checklist is folded into 2.214 (list A), and the "run the Faraj transfer" page should be written with 2.79. (unsure)
- **2.83 Whole-stage review and report** — comes after every step of the stage.
- **2.88 Browser test gaps** — the invitation half looks done already (2.97's invitations test); adding the accessibility checker axe remains.
- **2.100 Specification catch-up** — documents only.
- **2.141 Bringing the build order up to the spec** — planning for later stages.
- **2.142 Retiring the old trackers** — only after the stage ends, never during a season.
- **2.143 A list of known shortcuts** — documents only.
- **2.191 GitHub's checks in parallel** — makes the build faster, not the product.

---

## C. Not to be built: replaced, or probably done already (2 steps)

- **2.68 Each game gets its season's rules** — the step says itself it is replaced by 2.122 (done) and 2.119 (list A): tick it when 2.119 lands.
- **2.89 Games area: real standings and a browser test** — probably done by other steps: the database-backed games and the standings that move when a score is saved came with 2.93's last part (`apps/web/src/server/database-games.ts`, `database-event-handlers.ts`), and the league's own time came with 2.33 and 2.165. Check that a browser test sees standings move after a final score and a forfeit (the games-area and standings tests are the place); if one does, tick it; if not, that test is the only thing left and it belongs at the top of list A.

---

Notes:

- The founder's "second test" document was not found under `docs/operations`; step 2.93 ("TEST 2, the website on the real database") is done.
- Every step list A needs that is not itself in list A is already done. Steps that list A pulls in because of a "Needs:" line: 2.177 (by 2.229), 2.112 (by 2.209), 2.208 (by 2.210), 2.128, 2.91 and 2.114 (by 2.133), 2.227 (by 2.228), 2.118 (by 2.61).
