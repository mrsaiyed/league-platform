# Polish: small things left by reviews

One line each (USAGE.md, rule 9). Done in batches; a line is removed when it is done.

- 2.196: no made-up game shows the typed-score sentence or the team-turnover sentence on a game's page, so nobody has looked at either at 390 wide; add one to the made-up data and to the pictures, and look.
- 2.37 part 1 (review by use, 2026-11-22): right after a question appears on the scoring screen its "Keep playing" looks greyed for a moment while it ignores taps; a tired scorekeeper may read it as "backing out is not allowed".
- 2.37 part 1 (review by use, 2026-11-22): after End game, "Take back End game" and one basket with no connection, the banner said "3 to send" for what a person counts as one play.

- 2.37 part 1 (confirming look, 2026-11-22): the queue clears its "sent without an answer" mark when a later resend gets the app's own refusal (signed out, version refused); a Take back after that could drop an End the first send delivered (it corrects itself at the next reload): clear marks only on per-command answers (tracker-queue.ts about line 493), and give the queue a unit test of its own for the mark and the online flag.

- 2.50 (People screens, left by the fix round's part 2): the roster's name link on a team's page is not yet 44 high; the remove button stays red after a tap on a touch screen; the count line above the list counts the page shown, not the whole league.

- 2.50 (the confirming look, 2026-11-22): on a person's record the line under "Child or adult" ends with two full stops when the name is shortened ("Public pages show: Marcus O.."); after "someone else changed this person's details", a box the person did not touch quietly takes the stored value with no mark that it changed meanwhile.

- Home page at 390 wide (seen on the simulated league, `/simulated`, 2026-11-22): the small standings card cuts off the win-percentage column at the right edge ("1.00"); the page is no wider than the screen, so the width check does not see it. After a season has ended "The next matchups" shows only a postponed game and the count reads "1 games to play".

- Seen by the first-test walk (2026-11-22): with a season's default statistics the scoring pad offers Team turnover, which shows in the play-by-play and in no total, and no screen switches a season to the full set of statistics; under each leader card the list ranks players who have 0 (step 2.199 may already cover it).

- Seen while fixing the phone tables (2026-11-22): the notes that explain level teams under each standings table are long, heavy paragraphs at 390; on the statistics page the sentence "Statistics count the games…" sits right against the leaders' lists with no space; a team's roster in the admin is one whole form for each player (17,000 pixels tall for a big team on a phone); a team page's roster column says "Player" on every row.

- 2.98 (left by its reviews): no test reads the code screen's own words when the bot check cannot be reached; the hosted wiring of the bot check's log line is seen only online.
