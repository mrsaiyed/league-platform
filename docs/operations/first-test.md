# The first test: one league from empty to a final table

This is the walk for your first test. You take one made-up league, Still Waters, from
nothing at all to a final table, and you score one game live, from tip-off to "final". It
takes about half an hour. Follow it on a phone or on a laptop; every step says what you
should see, in the exact words the screen uses.

Every step here is also done by an automatic test, in the same order, each time the code
changes (`tests/browser/first-test-walk-test.mjs`; its checks carry these step numbers). So
if a step is not as written, that is worth telling the lead.

## Before you start

- **Do it in one sitting.** Everything here is made up and lives only in the app's memory.
  Every time the app restarts, the made-up world starts again from the beginning: Still
  Waters is empty again and whatever you added is gone.
- **If a step is not as written**, stop there and tell the lead its number and what you saw,
  for example: "Step 12: after Set clock it said something else". A photo of the screen
  helps. You do not need to finish the walk first.
- Nothing here sends an email or touches a real league.

## How to open the product

**In the Claude app (the easiest).** Ask the lead to start the app on the cloud machine and
open its preview. The address in the preview is the start of every address below: where
this page writes `…/signin`, add `/signin` to it.

**On a computer of your own.** You need Node.js 24 and Git. In a terminal:

```sh
git clone https://github.com/mrsaiyed/league-platform.git
cd league-platform
git checkout build/stage-1
npm ci
cp .env.example .env
```

In the new `.env` file, set `PUBLIC_BASE_URL=http://127.0.0.1:3000`. Then start it with
`npm run dev:web` and open `http://127.0.0.1:3000/signin`. Stop it with Ctrl+C (that
restart wipes the made-up world). Use the branch `build/stage-1`, not `main`: the newest
work is there, and `main` is not moved from the cloud machine. More detail is in
[run it locally](run-it-locally.md).

## The walk

1. **Sign in.** Open `…/signin`. The page says "Sign in". Type the email
   `owner@example.test` and the password `made-up owner password`, then tap "Sign in".
   You see "Your account" and, under "Your leagues", "Still Waters League" with "Owner"
   beside it.
2. **Open Still Waters.** Tap "Still Waters League". You see "Welcome back." and
   "Everything you run for Still Waters League is here.", with Teams, Schedule, Games,
   Season settings and League settings. On a phone these are behind the menu button at
   the top right.
3. **Add three teams, and players for two of them.** Tap "Teams". Under "Add a team" type
   `Ravens` and tap "Add team". You see "The team was added." Under "Add a player" type
   First name `Ann`, Last name `Ravens`, Jersey number `1`, and tap "Add the person and
   put them on the roster". Do the same for `Ben` 2, `Cal` 3, `Dee` 4 and `Eli` 5, all
   with the last name `Ravens`. Tap "Teams" again and add `Wolves` the same way, with Ann,
   Ben, Cal, Dee and Eli `Wolves`, numbers 11 to 15. Tap "Teams" again and add `Owls`,
   with no players: the Owls play no game, so the table will show a team with no games.
4. **Add a round and two games with no place.** Tap "Schedule". It says "This season has
   no rounds yet." Under "Round name" type `Week 1`, set the date to today, and tap "Add
   round". In Week 1 tap "Add a game": Home team Ravens, Away team Wolves, Time `10:00`,
   leave "Venue and court" on "No venue yet", and tap "Add game". Add a second game the
   same way: Home team Wolves, Away team Ravens, Time `11:00`. (If it is not yet 11 in
   the morning, choose two times earlier today.) Both games say "no venue yet".
5. **Publish the schedule.** Tap "Publish this schedule". It says: "The schedule is
   published, but visitors cannot see this league until it is published." That is true:
   Still Waters itself is still a draft league, and the screen that publishes a league is
   not built yet (step 2.125). Until then only you can see its pages (step 19).
6. **The season is shown already.** Tap "Season settings". Under "Who can see this season"
   it says: "First Season is shown, but visitors cannot see this league until it is
   published." There is nothing to tap here; do not tap "Hide it again".
7. **Open the tracker where a scorer finds it.** Open the league's home page,
   `…/still-waters`. Both games are there, each with a "Score this game" button. Tap it on
   the 10:00 AM game, the one that shows Wolves and Ravens in that order. The tracker
   opens; if it shows "Check the game format", tap "Confirm and start scoring".
8. **Pick the fives.** Under each team it says "Pick the starting 5: tap players below."
   Tap the Ravens' 1, 2, 3, 4 and 5, then the Wolves' 11, 12, 13, 14 and 15. Under each
   team it then says "Everyone is on the court."
9. **Start, score baskets and a foul.** Tap "Start" under the score. Then tap a player and
   one of the buttons that appear: Ravens 1 (Ann), "+2"; Wolves 11 (Ann), "+3"; Ravens 2
   (Ben), "Foul"; Wolves 12 (Ben), "+1". The score reads Ravens 2, Wolves 4, and Ben
   Ravens shows "1F" (one foul).
10. **One team turnover.** Tap the Wolves' "0 turnovers" button. It shows "Wolves
    turnovers", "No turnovers yet. Tap a player, then Turnover." and "+ Team turnover".
    Tap "+ Team turnover" (a turnover charged to the team, not a player, such as a
    shot-clock violation). It says "Team turnover: Wolves." and the button now reads "1
    turnover". Tap that button again to close the list. Where this number shows: here on
    the tracker, and on the game's page in the play by play as "Turnover by Wolves". It is
    not in the box score or the statistics, because this league keeps the standard
    statistics (points, 3-pointers, free throws and fouls), which have no turnovers column.
11. **A wrong basket, taken back.** Tap Ravens 1 (Ann) and "+3": the Ravens show 5. That
    basket was a mistake. The "Undo" button names it ("+3 #1 Ann"). Tap "Undo". The Ravens
    are back to 2 and the screen says "Undone:" with that basket.
12. **More baskets, then the clock set wrongly and right again.** Ravens 4 (Dee) "+2";
    Wolves 13 (Cal) "+2": Ravens 4, Wolves 6. Tap "Pause" and note the time on the clock.
    Tap the time: "Clock and period" opens. Type `1200` and tap "Set clock": the clock
    reads 12:00 and the screen says "Clock set to 12:00." and how much was added to the
    minutes of the players on the court. That was wrong. Tap the time again, type the time
    you noted, and set it: the screen says the earlier change "was taken back: minutes and
    play times are as they were."
13. **The second half, then End game from More.** Tap the time again and, under "Period",
    tap "H2" ("Picking a period stops the clock and sets it to that period's length."). Tap
    "Start". Ravens 3 (Cal) "+2"; Wolves 11 (Ann) "Foul"; Ravens 5 (Eli) "+1": Ravens 7,
    Wolves 6. Let the clock run a little if you like. Tap "More" at the top right, then
    "End game". It asks first: "End the game? Ravens 7, Wolves 6 H2 still has … on the
    clock. This becomes the final score and goes into the standings. A game ended by
    mistake can be reopened.", with "Keep playing" and "End game". Tap "End game". You see
    "FINAL", "Ravens won, 7–6" and "Saved. It counts in the standings."
14. **Type the second game's final score.** Go back to the admin (`…/still-waters/admin`)
    and tap "Games". On the 11:00 AM game, which says "AWAITING RESULT", tap "Enter the
    final score". Type 50 for the Wolves and 45 for the Ravens, and tap "Save final score".
    It asks: "Ravens 45, Wolves 50. Make this final?" Tap "Yes, make it final". It says
    "Saved:" and that the result is final. Now each team has won one and lost one.
15. **Let one game be enough for the leaders.** Tap "League settings". Find "Games a player
    must have played to be ranked among the leaders. 0 ranks everyone. A player with fewer
    still shows in the full table." It says "Now: the default." and "Default: 3". Type `1`
    and tap "Save" beside it. It says "Now: set for this league." Why: by default a player
    needs 3 games to be ranked, so after one game the statistics page would only say "No
    leaders yet." and "A player needs at least 3 games to be ranked." The number is your
    league's to choose.
16. **The game's page.** Open `…/still-waters` and tap the 10:00 AM game, now final. It
    says "Wolves at Ravens", Wolves 6, Ravens 7 with "Winner" beside the Ravens. The box
    scores have PTS (points), 3PM (3-pointers made), FTM (free throws made) and PF (fouls):
    Ann Wolves 3, 1, 0, 1; Ben Wolves 1, 0, 1, 0; Cal Wolves 2, 0, 0, 0; the Wolves' Total
    6, 1, 1, 1. Ann Ravens 2; Ben Ravens 0 with 1 foul; Cal Ravens 2; Dee Ravens 2; Eli
    Ravens 1 (a free throw); the Ravens' Total 7, 0, 1, 1. In the play by play the 3 you
    took back is not there. Players' minutes are kept but not shown on any public page yet
    (step 2.197), so do not look for them here.
17. **The standings.** Tap the menu at the top right, then "Standings". The Wolves are
    first and the Ravens second: both GP 2, W 1, L 1, PCT .500; the Wolves PF 56, PA 52,
    DIFF +4, STRK W1; the Ravens PF 52, PA 56, DIFF -4, STRK L1. The Owls are third with no
    games. Beside both the Wolves and the Ravens is "Note 1", and under the table: "Wolves
    and Ravens are level on win percentage (.500). Point difference puts Wolves ahead: +4
    against -4." In plain words: they have the same record and beat each other once each,
    so the next rule is points scored minus points let in, where the Wolves are 4 ahead.
    The note is beside both because it explains both their places.
18. **The statistics.** Tap the menu, then "Stats". It says "A player needs at least 1 game
    to be ranked." and "Statistics count the games that were scored live or entered as a
    box score. A game with only a final score counts in the standings, not here." So the
    typed 50 to 45 counts in the table but not here. The points leader is Ann Wolves, 3.0
    per game (Per game is shown first; "Season totals" shows 3). Under each leader, the list
    of the next players includes players with 0 (for example under 3-pointers made): that is
    known and reported, not something you broke.
19. **As a visitor.** Open a private window (or another browser) where you are not signed
    in, and open `…/still-waters`. It says "Page not found". That is expected for now:
    Still Waters is a draft league, and visitors will see it once a league can be published
    (step 2.125). Until then, what you read in steps 16 to 18 is what visitors will see.

That is the whole walk: an empty league to a final table, with one game scored live.
