# The first test: one league from empty to a final table

This is the walk for your first test. You take one made-up league, Still Waters, from
nothing at all to a final table, and you score one game live, from tip-off to "final". It
takes about half an hour. Follow it on a phone or on a laptop; every step says what you
should see, in the exact words the screen uses.

An automatic test does every step here, in the same order, each time the product changes.
So if a step is not as written, that is worth telling the lead.

## Before you start

- **Do it in one sitting.** Everything here is made up and lives only in the practice
  site's memory. Every time the practice site is stopped and started again, Still Waters is
  empty again and whatever you added is gone.
- **Any time of day works**, late at night too: the walk does not depend on the hour.
- **If a step is not as written**, stop there and tell the lead its number and what you saw,
  for example: "Step 12: after Set clock it said something else". A photo of the screen
  helps. You do not need to finish the walk first.
- Nothing here sends an email or touches a real league.

## How to open the practice site

The practice site runs on a computer: it is not on the internet. There are two ways to start
it. (An online practice copy, which needs no computer set-up at all, is the next thing being
built.)

**The easy way (nothing technical).** On your own computer, open the Claude desktop app.
Open the app's Settings, choose "Claude Code", then "Remote Control", and add a folder there;
if that screen is not as described, the lead will walk you through it in the chat. Then write
to the lead in the chat: "start the practice site on my computer". The lead does the
technical part on that computer and tells you the address to open in your browser (it will
be `http://127.0.0.1:3000` or the like). Nothing is installed by hand. That address is the
start of every address below: where this page writes `…/signin`, add `/signin` to it.

**By hand (for someone comfortable with a terminal).** You need Node.js 24 and Git. In a
terminal:

```sh
git clone https://github.com/mrsaiyed/league-platform.git
cd league-platform
git checkout build/stage-1
npm ci
cp .env.example .env
```

In the new `.env` file, set `PUBLIC_BASE_URL=http://127.0.0.1:3000`. Then run
`npm run build:web` (a few minutes) and `npm run start:web`, and open
`http://127.0.0.1:3000/signin`. Stop it with Ctrl+C (that wipes the made-up world). Use the
branch `build/stage-1`, not `main`: the newest work is there. `npm run dev:web` also works,
but it is slower. More detail is in [run it locally](run-it-locally.md).

## The walk

1. **Sign in.** Open `…/signin`. The page says "Sign in". Type the email
   `owner@example.test` and the password `made-up owner password`, then tap "Sign in".
   You see "Your account" and, under "Your leagues", "Still Waters League" with "Owner"
   beside it.
2. **Open Still Waters' admin.** Beside "Still Waters League", tap "Admin" (the league's
   name itself opens the public site, the one visitors see). You see "Welcome back." and
   "Everything you run for Still Waters League is here.", with Teams, Schedule, Games,
   Season settings and League settings. On a phone these are behind the menu button at the
   top right: a button with three lines on it and no word. The page itself also has big
   cards for Teams, Schedule and the rest; either way works.
3. **Add three teams, and players for two of them.** Tap "Teams". Scroll down to "Add a
   team" (the "Add a team" button at the top only takes you down to it), type `Ravens` in
   Name and tap "Add team". You see "The team was added." and the Ravens' own page, which
   opens with "Team details": leave those as they are. The "Add a player" button at the top
   only takes you down the page. Under "A new player, not in the league yet" type First name
   `Ann`, Last name `Ravens`, Jersey number `1`, and tap "Add the person and put them on the
   roster". Do the same for `Ben` 2, `Cal` 3, `Dee` 4 and `Eli` 5, all with the last name
   `Ravens`. Further down the page is a second form, "Someone already in the league", for
   putting a person the league already has on this team, and further still "The league
   list", with a "Remove from the league list" button beside each person: leave both alone.
   Tap "Teams" again and add `Wolves` the same way, with Ann, Ben, Cal, Dee and Eli
   `Wolves`, numbers 11 to 15, each typed under "A new player, not in the league yet". Tap
   "Teams" again and add `Owls`, with no players: the Owls play no game, so the table will
   show a team with no games.
4. **Add a round and two games with no place.** Tap "Schedule". It says "This season has
   no rounds yet." Under "Round name" type `Week 1`, set the date to today, and tap "Add
   round". Inside Week 1 tap its "Add a game" (not the one under "Games with no round").
   The form has a "Date" box, already filled with today, and a "How it is recorded" list:
   leave "How it is recorded" as it is. For **the first game**, the one you will score
   live: Home team Ravens, Away team Wolves, leave "Date" on today, type any time in Time
   (it may be later today: a game today can be scored live at any hour), leave "Venue and
   court" on "No venue yet", and tap "Add game". For **the second game**, also in Week 1:
   Home team Wolves, Away team Ravens, change "Date" to **yesterday**, type any time, and tap
   "Add game". Why yesterday: the admin asks for a game's final score only once its time has
   come, and step 14 types the second game's score; a game yesterday has always had its
   time, whatever the hour now. Both games say "no venue yet".
5. **Publish the schedule.** Scroll to the bottom and tap "Publish this schedule" (the
   "Review and publish" button at the top only takes you down to it). It says: "The
   schedule is published. Visitors can see it now."
6. **The season is shown already.** Tap "Season settings". Under "Who can see this season"
   it says: "Everyone can see First Season." There is nothing to tap here; do not tap
   "Hide it again".
7. **Open the tracker where a scorer finds it.** Open the league's home page,
   `…/still-waters`. Both games are there, each with a "Score this game" button. Tap it on
   the first game, today's, the one that shows Wolves and Ravens in that order. The tracker
   opens; if it shows "Check the game format", tap "Confirm and start scoring".
8. **Pick the fives.** Under each team it says "Pick the starting 5: tap players below."
   Tap the Ravens' 1, 2, 3, 4 and 5, then the Wolves' 11, 12, 13, 14 and 15. Under each
   team it then says "Everyone is on the court."
9. **Start, score baskets and a foul.** Tap "Start" under the score. Then tap a player and
   one of the buttons that appear: Ravens 1 (Ann), the +2 button; Wolves 11 (Ann), the +3
   button; Ravens 2 (Ben), "Foul"; Wolves 12 (Ben), the +1 button. The score reads Ravens
   2, Wolves 4, and Ben Ravens shows "1F" (one foul).
10. **One team turnover.** Tap the Wolves' "0 turnovers" button. It shows "Wolves
    turnovers", "No turnovers yet. Tap a player, then Turnover." and "+ Team turnover".
    Tap "+ Team turnover" (a turnover charged to the team, not a player, such as a
    shot-clock violation). It says "Team turnover: Wolves." and the button now reads "1
    turnover". Tap that button again to close the list. Where this number shows: here on
    the tracker, and on the game's page in the play by play as "Turnover by Wolves". It is
    not in the box score (the table of each player's points and fouls for one game) or the
    statistics, because this league keeps the standard statistics (points, 3-pointers, free
    throws and fouls), which have no turnovers column.
11. **A wrong basket, taken back.** Tap Ravens 1 (Ann) and the +3 button: the Ravens show 5. That basket was a mistake. The "Undo" button names it ("+3 #1 Ann"). Tap "Undo". The
    Ravens are back to 2 and the screen says "Undone: #1 Ann Ravens +3."
12. **More baskets, then the clock set wrongly and right again.** Ravens 4 (Dee), the +2
    button; Wolves 13 (Cal), the +2 button: Ravens 4, Wolves 6. Tap "Pause" and write down
    the time on the clock (say it shows 19:43). Tap the clock itself, the big time with
    "H1" beside it: a form called "Clock and period" opens, with number keys 0 to 9 and
    "Clear". Tap the keys 1, 2, 0, 0. The form shows 12:00 and "This adds … to the minutes
    of the players on the court." Tap "Set clock to 12:00". The clock reads 12:00 and the
    screen says "Clock set to 12:00. … was added to the minutes of the players on the
    court." (the … is how long). That was wrong. Tap the clock again and type the time you
    wrote down, its digits without the colon (for 19:43, tap 1, 9, 4, 3; "Clear" starts
    again if you slip). The form says "This takes back … of an earlier change to this
    period’s clock. Minutes and play times go back as they were." Tap "Set clock to 19:43"
    (your time). The screen says "Clock set to 19:43. … of an earlier change to this
    period’s clock was taken back: minutes and play times are as they were."
13. **The second half, then End game from More.** Tap the clock again and, under "Period",
    tap "H2" ("Picking a period stops the clock and sets it to that period’s length."). Tap
    "Start" (there are two start buttons now, "Start" under the score and a big "Start
    clock" lower down: either works). Ravens 3 (Cal), the +2 button; Wolves 11 (Ann),
    "Foul"; Ravens 5 (Eli), the +1 button: Ravens 7, Wolves 6. Let the clock run a little if
    you like. Tap "More" at the top right, then "End game". It asks first: "End the game?
    Ravens 7, Wolves 6 H2 still has … on the clock. This becomes the final score and goes
    into the standings. A game ended by mistake can be reopened.", with "Keep playing" and
    "End game". Tap "End game". You see "FINAL", "Ravens won, 7–6" and "Saved. It counts in
    the standings."
14. **Type the second game's final score.** Go back to the admin (`…/still-waters/admin`)
    and tap "Games". On the second game, which says "AWAITING RESULT", tap "Enter the
    final score". Type 50 for the Wolves and 45 for the Ravens, and tap "Save final score".
    It asks: "Ravens 45, Wolves 50. Make this final?" Tap "Yes, make it final". It says
    "Saved: Ravens 45, Wolves 50 is final." Now each team has won one and lost one.
15. **Let one game be enough for the leaders.** Tap "League settings". Find "Games a player
    must have played to be ranked among the leaders. 0 ranks everyone. A player with fewer
    still shows in the full table." It says "Now: the default." and "Default: 3". Type `1`
    and tap "Save" beside it. It says "Now: set for this league." Why: by default a player
    needs 3 games to be ranked, so after one game the statistics page would only say "No
    leaders yet." and "A player needs at least 3 games to be ranked." The number is your
    league's to choose.

## As a visitor sees it (steps 16 to 18)

Open a private window (or another browser) where you are not signed in, and open
`…/still-waters`. You see the league's home page, not "Page not found" and not a sign-in
page. In the finished product a new league stays hidden until its owner publishes it; that
screen is not built yet, so this practice league starts already public.

16. **The game's page.** In the private window, on `…/still-waters`, tap the first game,
    now final. It says "Wolves at Ravens", "Played" with the day and your first game's
    time, Wolves 6, Ravens 7 with "Winner" beside the Ravens, and "Wolves 6, Ravens 7." The
    box scores have PTS (points), 3PM (3-pointers made), FTM (free throws made) and PF
    (fouls): Ann Wolves 3, 1, 0, 1; Ben Wolves 1, 0, 1, 0; Cal Wolves 2, 0, 0, 0; the
    Wolves' Total 6, 1, 1, 1. Ann Ravens 2; Ben Ravens 0 with 1 foul; Cal Ravens 2; Dee
    Ravens 2; Eli Ravens 1 (a free throw); the Ravens' Total 7, 0, 1, 1. In the play by play
    the 3 you took back is not there. Players' minutes are kept but not shown on any public
    page yet (that is being built), so do not look for them here.
17. **The standings.** Tap the menu at the top right, then "Standings". The table's
    headings: SEED the team's place, GP games played, W won, L lost, PCT the share of games
    won (.500 is half), PF points scored, PA points let in, DIFF the difference between the
    two, STRK the streak (W1: won the last game; L1: lost it). The Wolves are first and the
    Ravens second: both GP 2, W 1, L 1, PCT .500; the Wolves PF 56, PA 52, DIFF +4, STRK
    L1; the Ravens PF 52, PA 56, DIFF -4, STRK W1 (the last game played is today's, which
    the Ravens won). The Owls are third with no games. Beside both the Wolves and the Ravens
    is "Note 1", and under the table: "Wolves and Ravens are level on win percentage (.500).
    Point difference puts Wolves ahead: +4 against -4." In plain words: they have the same
    record and beat each other once each, so the next rule is points scored minus points
    let in, where the Wolves are 4 ahead. The note is beside both because it explains both
    their places.
18. **The statistics.** Tap the menu, then "Stats". It says "A player needs at least 1 game
    to be ranked." and "Statistics count the games that were scored live or entered as a
    box score. A game with only a final score counts in the standings, not here." So the
    typed 50 to 45 counts in the table but not here. The points leader is Ann Wolves, 3.0
    per game ("Per game" is shown first; choose "Season totals" in the list labelled "Show",
    and the page changes by itself to show 3). Under each leader, the list of the next
    players also shows players with 0 (for example under 3-pointers made): you did nothing
    wrong, and that list is being fixed.

That is the whole walk: an empty league to a final table, with one game scored live.
