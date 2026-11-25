# Polish: small things left by reviews

One line each (USAGE.md, rule 9). Done in batches; a line is removed when it is done.

- 2.196: no made-up game shows the typed-score sentence or the team-turnover sentence on a game's page, so nobody has looked at either at 390 wide; add one to the made-up data and to the pictures, and look.
- 2.37 part 1 (review by use, 2026-11-22): right after a question appears on the scoring screen its "Keep playing" looks greyed for a moment while it ignores taps; a tired scorekeeper may read it as "backing out is not allowed".
- 2.37 part 1 (review by use, 2026-11-22): after End game, "Take back End game" and one basket with no connection, the banner said "3 to send" for what a person counts as one play.

- 2.37 part 1 (confirming look, 2026-11-22): the queue clears its "sent without an answer" mark when a later resend gets the app's own refusal (signed out, version refused); a Take back after that could drop an End the first send delivered (it corrects itself at the next reload): clear marks only on per-command answers (tracker-queue.ts about line 493), and give the queue a unit test of its own for the mark and the online flag.

- 2.50 (People screens, left by the fix round's part 2): the roster's name link on a team's page is not yet 44 high; the remove button stays red after a tap on a touch screen; the count line above the list counts the page shown, not the whole league.

- 2.50 (the confirming look, 2026-11-22): on a person's record the line under "Child or adult" ends with two full stops when the name is shortened ("Public pages show: Marcus O.."); after "someone else changed this person's details", a box the person did not touch quietly takes the stored value with no mark that it changed meanwhile.

- Home page at 390 wide (seen on the simulated league, `/simulated`, 2026-11-22): after a season has ended "The next matchups" shows only a postponed game and the count reads "1 games to play".

- Seen by the first-test walk (2026-11-22): with a season's default statistics the scoring pad offers Team turnover, which shows in the play-by-play and in no total, and no screen switches a season to the full set of statistics; under each leader card the list ranks players who have 0 (step 2.199 may already cover it).

- Seen while fixing the phone tables (2026-11-22): the notes that explain level teams under each standings table are long, heavy paragraphs at 390; on the statistics page the sentence "Statistics count the games…" sits right against the leaders' lists with no space; a team's roster in the admin is one whole form for each player (17,000 pixels tall for a big team on a phone); a team page's roster column says "Player" on every row.

- 2.98 (left by its reviews): no test reads the code screen's own words when the bot check cannot be reached; the hosted wiring of the bot check's log line is seen only online.

- 2.206 (left by its review): no test runs the command itself as a child process and searches its whole output for planted secrets on a happy run and on a run where the stand-in echoes them back (the reviewer did it by hand: nothing leaked); the stop on a closed window (SIGHUP, SIGTERM) is built and not tested.

- From step 2.93's review (Lows): an http localhost site address is still taken in staging (allow it only when the server listens on this computer alone); the test-only fakes serveFakeSupabaseAuth and serveMadeUpDatabase are exported from the packages' entry files (a test-only entry file); the list of this computer's names is written twice (startup.ts onThisComputer, config-schema.ts thisComputerHosts); comments in bot-check-off.ts and bot-check.ts still say the first online copy has no bot-check keys; three browser tests keep their own wait for a title that the shared check now does.

- From step 2.205: on the test copy the made-up line stands only in the footer of the admin pages, out of sight while an admin types (consider it above the People forms); SignInScreen reads the ports itself (pass the flag in from the page).

- 2.37 part 2: the 5-second Reopen retry in use-end-game.ts has no test of its own and uses window.setInterval directly, not the controller's clock (code review L1).
- 2.37 part 2: the "not entered again" error (againRefused) stays on screen until the next tap, and its words do not fit the not-scoring case (code review L2).
- 2.37 part 2: the screen-level test that another scorekeeper is refused Reopen became an owner case (tracker-controller-end.test.ts); the server rule is still tested in core (code review L3).
- 2.37 part 2: every 5-second hold check still locks the game's row; a plain read would do until a write is due (code review L4).
- 2.37 part 2: the controller imports mayEnterAgain from a module that holds the play's words, and one test pins holdCheckMs <= 5000 (code review L5).
- 2.37 part 2: at 360x640 the second team's five is cut off by the pad while a notice shows (review by use).
- 2.37 part 2: "This game is final. Reopen it to make changes." shows where the panel says only the ender can reopen (review by use).
- 2.37 part 2: a device that lost the game learns that it ended only when "See who is scoring" is tapped (review by use).
- 2.37 part 2: the banner's "1 not saved" stands beside the notice's "1 play was not applied"; one word for both (review by use).
- 2.37 part 2: "Enter it again if it is needed" stands beside "Only the device scoring can enter these again" on a device not scoring (review by use).
- 2.239: the comment at the top of served-person-read-after-add.test.ts blames the database wrongly, and the test is slow and guards nothing the step changed; other-host-render.ts and T-298 should say the empty 404 also answers /signin, /account, /health and /api under a foreign Host; no unit test of the proxy's wiring

- 2.204: in tests/read-kept-emails.test.mjs a variable is still called dotted and a comment says a final dot is not asked; PostgreSQL throws on a NUL in an address where TypeScript answers false (both refuse)
- 2.203: the worker uses one 'not reached' sentence for host not found, timeout and unknown where the web app has one each; a tunnel to localhost gets around the localhost-only limit of PLATFORM_DATABASE_SSL=off (older behaviour)
- 2.37 part 2: when the 15-second look at a final game finds it live and nobody holds it, the device quietly becomes the scorer, as at first opening: decide whether it should ask
- 2.37 part 2: a device showing '<name> is scoring' never learns by itself that the game has ended
- 2.135: when step 2.91 runs the nightly deletion, the Privacy note may say again that someone never on a team's list is deleted for good after 30 days
- 2.95: the release does not refuse the transaction pooler (port 6543), though its run lock needs a session connection; only the pages and the driver's header say so
- 2.95: `samePlace` in `platform-database-guard.ts` does not match a `DATABASE_URL` written with a trailing dot after its host (the Supabase reference check still covers the tracker)
- 2.95: `platform.Dockerfile` gives all of `.next` to the node user, not only `.next/cache`, and `node:24-slim` is not pinned to a digest
- 2.95: the health address does not name the running version (Render's Events list shows it)

- 2.95: an empty answer at the password prompt for a database on this computer signs in silently with PGPASSWORD or .pgpass (release.mjs about line 111); a permission error while counting live games says 'what was applied is in the migration log' when nothing was applied (about line 152)
- 2.49: `packages/core/src/modules/scheduling/place-games.ts:59-62`: a draft names a court by its name, so after a rename the draft no longer holds the court, and drafts of old seasons hold a court for good: count only the current season's drafts, or have a rename update the draft
- 2.49: `apps/web/src/features/venues-area/actions.ts:208-237`: moving a court saves each court on its own (several activity entries, an order half-moved on a failure): one `reorderCourts` command like `reorderDivisions`
- 2.49: `apps/web/src/features/divisions-area/divisions-page.tsx:104-106`: putting a division back asks for `bin.restore` while A-5 says whoever may remove may restore (no effect today): change it as D-L6 did for venues
- 2.46: `staff-numbers-endpoint.ts:154` `.catch(() => null)` turns a failed read into the plain "nothing more" answer and tells an operator nothing: log an error code only, nothing from the request
- 2.240: no screen changes a league's contact email: the must-fix item and the refusal say to ask the people who run SR Leagues (`adminSettings.publish.check.contactEmail.cure`, `error.leagues.set_status.no-contact-email`). The email's own screen comes with step 2.125 part 2; change both sentences to point to it then.
- 2.240: the staff draft notice's link ("Publish it in League settings") shows an admin of one program only the must-fix list with no Publish button and nothing saying who can publish (the owner or a league-wide admin). Say so there, or point the notice elsewhere for them.
- 2.240: the Publish question (`adminSettings.publish.ask`) does not mention Find a league: that page is not built yet and no screen changes a league's listing (`leagues.listed`, U-10). When Find a league lists leagues, add for a listed league that it will be listed there, and where to turn that off.

- 2.163 (Low): a crafted link (?notice=signedOutEverywhere) shows any signed-out visitor 'You are signed out on every device'; show the everywhere and already-signed-out notices only right after the action (apps/web/src/app/(platform)/page.tsx:27, features/shell/signed-out-notice.tsx:20).

- 2.220 (Low): tests/varsity-hosted-libraries.test.mjs pins the resolved version exactly only for react-server-dom-webpack; the others are minimums (upward drift is not stopped); the pilot's lint has 7 warnings.

- 2.97 (Low): the invitation cookie lasts one hour, after which the page says to ask for a new link although the emailed link still works (invitation-request.ts:31); 'Cancel invitation' acts without a question; on the made-up database a failed email gives the admin an error page though the invitation was saved (made-up-invitation-mail.ts:110); anyone signed in who holds the link may accept with another address (T-226): ask the founder whether the admin role should require the invited address; a refused plain form answers 404, not 403; step 2.88's plan line should say it needs 2.96 and 2.97.

- 2.140 (Low): in local and test mode the 14 placeholder pages are served by the catch-all routes and the harmful-text test no longer opens them; an editor's admin home on a live league says 'Nothing to do here yet'; the sentence 'ask the league's owner' for a game whose team is in the bin names someone who has no screen to put a team back until step 2.77 (the bin screens) lands: reword it then.

- 2.221 (Low): question-times.ts prunes only up to the first fresh entry (bounded at 5000 all the same); the scripts-off 'second tap 800 ms later' check in ask-first-test.mjs can pass without testing when a redraw takes longer than 800 ms; ask-first-test.mjs hung once for ten minutes on the cloud machine (2026-11-23) and passed on the rerun: watch it; with scripts off a second tap a second or more later on a 'Yes' drawn where the button stood still goes through (record 094); no screen calls recordImportedScores yet, so the count of scores waiting for postponed games is shown nowhere.

- 2.224 (Low): the roster case's row order rests on where the database stores a rewritten row, not on an ORDER BY (a failure would be a loud SURVIVED, never a silent pass); the arrange step switches off foreign-key triggers (session_replication_role = replica); failureLines has no unit test of its own.

- 2.224 leftovers (review, 2026-11-23): the fence sweep never takes out the league filters inside database functions (game_tracked_past_marker, game_ever_decided, erase_account, take_jobs, access_list_names): sweep the migration functions too; a case's arrange holds all triggers, which also switches off foreign-key checks during arrange; fence-sweep.yml pins its actions by version tag, as ci.yml does.

- 2.56 leftovers (2026-11-23): the activity log could not be checked in a browser on the made-up world (it lists none) until step 2.77 part 2 lands; on a league where any scorekeeper may score any game, assigning only puts the game on their list: say so on the Scorekeepers page.
- The venues page is about 29,000 px tall on a phone at the simulated league's size (one whole form per venue; seen 2026-11-23).

- polish-4 leftovers (2026-11-23): the standings name column can take 60% of the box at 360 with seeds and 71% at 320 without (cap it: `min(…, 55cqi)` in table-css.ts near line 640, and check 320 and 360 with and without seeds in web-exit-test.mjs); `brokenNames` in simulated-league-test.mjs should also assert it found names; the footnote marks beside team names are 24 by 24, below the 44 the design asks.

- 2.77 leftovers (2026-11-23): no browser check yet for the taken-name link on the bin screen; whether a team named with markup reaches the activity log in the harmful-text browser test is unchecked (a unit test shows it as text); the From/To labels on the activity log are not styled like the picker labels.
- 2.77: the activity log's bin link on a publish entry is keyed on the season, so an older publish keeps it while another publish's removed game is still in the bin; use the revision's gameIds.removed.
- 2.77: restore-court answers court-venue-in-bin also when the venue is gone for good; it needs its own code and sentence.
- 2.77: tests/browser/people-on-database-test.mjs:365 searches whole pages for the ordinary word Sample; lengthen it.
- 2.77: not seen in a browser: an admin limited to one program in the bin, the 'its round was removed' sentence, restoring a division, venue or court.

- AN UNRELIABLE TEST, NOT SEEN AGAIN (2026-11-23): `be-made-up-person` (a sign-in test under `apps/web/src/server`) failed once under load in lane 2.56 and passed alone; `npx vitest run apps/web/src/server` then passed twice in a row (77 files, 1129 tests). Watch for it under load.

- 2.56: an award is not linked to a scheduled game; if that game is played later it counts twice (S-85 says so): link it or warn.
- 2.56: the public-pencil browser test covers only a league where scorekeepers cannot reopen; add one inside a tracker reopen window, and an admin limited to another program.
- 2.26: the refused-result test of clear-page-cache covers only a refusal before the event; a job rolled back after a later failure rests on leagues-store.test.ts.
- 2.60: there is no league error.tsx, so a league page's server error shows without the site notice.
- 2.60: site.notice has no protective order, so an archived or suspended league cannot add or remove its notice (R-26).
- 2.56: head-to-head tiebreakers read an overturned game as played (packages/sports/src/standings/order-teams.ts, the head-to-head step, from the games team-records.ts keeps); changing it needs the build plan's leave to change packages/sports.
- 2.56: when a season lists the coin flip before other tiebreakers, sports tries a flip at that step on the wider group, so a flip recorded for the final level set orders nobody there while Admin shows it in use (rebuild-season.ts withCoinFlipLast); accept flips only with coin-flip last, or work level sets out at that step.
- 2.56: record-coin-flip carries no version (two admins at once: the later bins the earlier's order with no "changed since"), and "drawn" is the web action's claim; carry the shown flip's id as the version and draw in core through a random port.
- 2.56: list-later-games reads every game of a year with no limit, twice per Games page load; games past 366 days are on no list though the note says "every game still to come"; "Only the first 100 are shown" does not say to choose a team. Cut in the query and word both notes truly.
- 2.56: coin-flip-test.mjs and later-games-test.mjs find some things on the whole page (getByText(name).first(), the "Later games" link by name though data-to-later exists); find them by their data- marks.
- 2.56: no lock between mark_team_left and add_draft_game (or publish), so a game added at the same moment as the mark can slip through; lock the team row in both.
- 2.56: the team-left refusals carry the team ids (add, put back, fixture import), but the schedule grid and import pages say "one of those teams" without its name: the grid's notice is built from fixed words in the address; name it from the page's own team list.
- 2.77 (review Low): `leagues.restore_game` counts the restored game in its schedule revision's `gamesAdded: 1` and `gameIds.added`, so a future revision history would call it a new game; count it only in `restoredFromBin`, or say in T-220 that "added" includes "restored".

- 2.56: head-to-head tiebreakers read an overturned game as played (packages/sports/src/standings/order-teams.ts): needs the build plan's leave to change packages/sports
- 2.102 (review Low): choose-password stops a password under 8 with the browser's own bubble (`minLength`, `sign-in-parts.tsx`), in the browser's words; drop `minLength` and let the server's refusal under the field say it (T-187).
- 2.102 (review Low): `scripts/shots.mjs --measure` measures league pages only (`publicPage`), so it cannot measure SR Leagues' own pages; let it take the platform pictures too.
- 2.102 (review Low): SR Leagues' own look (`platformDesign`, T-325) has no dark version: with a dark preference its pages draw light; add one or say in T-325 that there is none.
- 2.102 (review Low, league frame): the league frame's footer links "Terms" (36) and "Privacy" (43) are under 44 wide at 320 and 390; give them a 44 minimum width.
- 2.38 (review Low): `recent` keeps 300 ids (packages/sports live.ts), so after more than 300 commands offline under an ended session `carryOnTaps` lists the taps not saved though nobody else scored; compare by sequence instead of ids when the gap is larger.
- 2.38 (review Low): scoring started from the device whose opening is answered 401 (sign-in expired while away) turns read-only instead of M4's keep scoring with a sign-in link (tracker-controller.ts, the opening's 401 branch); the taps are kept.
- 2.38 (review Low): sign-out gives the whole clearing 1.5 s and each worker 1 s (sign-out-form.tsx); on a slow phone it can go before the kept pages are deleted, and an older worker can land a copy after; let the worker check the device mark (T-327) before it keeps a page.
- 2.38 (review Low): plays stored before T-327 name no maker and are now nobody's: never sent, listed to nobody, and not dismissable; they stay on the device until its storage is cleared; give them a clean-up after the 14-day keep.
- 2.38 (review Low): a waiting worker told to update could take over before the opening page saved its game; since T-328 an open page whose game is not stored yet holds it back, but a page opened in the moment between the check and `skipWaiting` can still meet a deleted lazy chunk and need a reload.
- 2.38 (confirming look, accepted): a device upgraded with kept pages has no device mark (T-327) until a signed-in page loads with a signal, so until then a reload with no signal shows the plain offline page, the safe side.
- 2.38 (confirming look, Low): the tracker marks the device with its page's account once the server first answers (tracker-opening.tsx, `writeDeviceAccount`), not with who the server says is signed in, and without `markSignedInHere`'s forgetting; a page opened with no signal whose first answer comes after someone else signed in on another tab marks the earlier person, which only keeps kept pages and games hidden (the safe side) until a page with the account button loads; mark from the server's answer instead.
- 2.61 (review Low): the T-329 fix rests on lists of ids: when the storage cannot be read at a load (`waiting === null`) or the tab closes between keeping the state and keeping the scoring, it falls back to `state.recent`, which the engine caps at 300 commands (`packages/sports/src/basketball/live.ts`), so after a whole game scored from the kept state the oldest taps the server took could show twice until the next load; rare, untested.
- 2.61 (review Low): a takeover between two returns of the signal during an offline reload is not tested (the unit test plays one return and two, the browser test neither for sure, its timing varying).
- 2.61 (review Low): the bad Wi-Fi test's cuts are Chromium's offline switch and Playwright's interception of the page's `/commands`; a send from the worker, a real phone's half-dead radio, `performance.now` moved on and a really discarded tab (`location.reload()` stands in) are not imitated.
- 2.61 (review Low): the seed replays the bad Wi-Fi test's cuts, not their timing; a failing run prints the order of events, enough to read, not to replay.
- 2.61 (review Low): the bad Wi-Fi test's scripted game has no substitutions, clock, periods or end of game: minutes (T-281), the clock's taps and taking back the End are not played under cuts.
- 2.61 (review Low): a wake from `online()` that comes while a send with no signal is still failing is swallowed by that send's retry wait (the queue sends at its end, seconds later, up to 30 s): not a loss, not changed.
- 2.62 (review Low, partly done in its fix round): game-night now reads the play's words on the second screen, but those words are only "Hawks scored 2"; nothing reads the second screen's foul line or a player's line as each play lands.
- 2.62 (review Low, after its fix round): game-night reads the final as the scoreboard's two scores, but its standings check counts only games, wins and losses, not the points for and against that the plays make.
- 2.62 (review Low): the takeover in game-night is by the league's owner, as the made-up league has one scorekeeper only; a second made-up scorekeeper would prove two people of that role hand a game over.
- 2.62 (review Low): demo-hidden-numbers matches hidden players only as "First L."; a full name would pass, and the statistics page's `?by=` and `?season=` views and the game's public snapshot answer are not read.
- 2.62 (review Low, decided): accessibility is checked once per kind of page for each person, not on every one of the 40 demo pages.
- 2.118 (review Low): the jump to the away team shows under 680 wide; that break is measured only at the four sizes.
- 2.118 (review Low): the panel read-only when the game is final is tried in unit tests only, not in a browser.

- 2.61 (last part): bad-wifi-test.mjs still logs 'reached the server' for a failed fetch (:301, :312); after hold's rebuild the screen is not redrawn nor the kept scoring saved until the next state (tracker-controller.ts about :1374); no unit test shows an add or play by somebody else is still caught when the device has its own adds (goes with step 2.242).

- 2.119: the 0026 trigger lets one update set status live and given_format together (no path does); an admin changing the format with the setting off is tested in core only; checklist B1 to B4 is nowhere in the spec (the form follows P7 §1's season-rule rows); a cancelled game is given the reason 'under way'; before the start the device compares only periods, lengths and clock mode with the server's format, not fouls and timeouts; the role matrix covers only a scheduled game for the three format commands.

- 2.148: a scorekeeper whose signal went before the first play reached the server still loses the game after two minutes with no question (scoring-session.ts:92, 'under way' is status live); end-tracked-game.ts:63 lets another account end a live game once the lease has lapsed, with no question (its comment calls the lapse rule deliberate under T-116: check); sessions open when 0027 runs start with heard_seq 0 (one needless 'Enter again'); kept session rows are deleted only when a person is erased; T-338 reloads needlessly after a refused add or duplicates; the browser test moves B's clock, not the server's; tracker-route-test failed once with no reason printed and passed when rerun.

- 2.177: the browser's double-tap check fails only with both protections out (the version check alone is proven by reopen-own-result.test.ts); correction rows cannot be counted from a browser (no page shows them); activity entries keep no reason (it is kept in game_corrections); no role has games.results without games.correct, so the own door for a forfeit is unreachable today (T-350).

- 2.125's confirming look, Lows: the R-14 tick's sentence says people of unknown age may be shown as adults for under-18s to both (admin-settings.ts:74; the code is the safe side); set-league-audience.test.ts:132 never checks the command succeeded; league-profile-test.mjs:346 has no before reading for noindex; no test checks the stored listing goes off; game snapshots keep adult-era names up to 2 s after who plays changes; the listing is stored and read nowhere until /find is built; S-96 must be read again when A-15's player pages are built; the stand-in's public pages keep the old name after a rename; game-format-panel.tsx:163 throws the start button away and draws it again when the read lands (a tap at that instant is lost).

- 2.229 leftovers: the put-back offer never expires on a box score corrected on purpose (one tap months later undoes the fix); the database does not check the shape of a kept sheet and no test checks the 4 MB and 16 KB limits refuse; a scoring session opened by mistake on a reopened game (lineups only) blocks the put back for good: one line in the spec; the mark sorts by created_at, the rule by at; the made-up world's listRoster still lists binned people so 'in the bin' never shows there; the browser test's wait for each page's own heading was not seen failing.

- 2.242's review, Lows: cannotTell stays true until the not-saved list is empty; the sentence 'A play is never counted twice' fails in one older case (storage fails to forget plays after a send was taken, then Enter again); a second tab's stored IDs count as this tab's own and nothing guards two tabs; T-338 still judges by counting (one extra load).

- 2.70 leftovers: T-370's gap (a changed client of another account with scoring permission can name the holder's play IDs and score alongside without the holder being asked) is step 2.244; at 600 plays the tablet lists 251 not saved until the send and then says 'saved 251' when 1 is new; three send passes is a chosen limit, not a proof; the five-minute suggestion has no browser test; the download is untried on iPhone Safari; the 'already has' filter is caught by one test only; the reload step of game-copy-test was not seen failing on the old code.

- 2.159 leftovers: a card under "Waiting for a score" that goes live stays there until reload; the snapshot and live channel still carry a corrected game's running score; a pre-2.229 correction row with no scores reads Live; the laptop layout holes; a live game with no points reads 0-0 on its page and VS on its cards; games with no time in a dated round read "{date}, time to be set"; the teams list's records have no line; a corrected overtime final loses "OT" on its cards; listPublicGames' isolation case never reaches the corrections query.

- 2.130 leftovers: there is no way to abandon a correction once opened (one left open before archiving stays open until an admin enters a result); a refused start loses what was typed (step 2.155); the import screen's "no current season" sentences do not link to the form; run-start-season.ts and run-season-change.ts want fuller unit tests; a genuinely damaged copy in an archived season still answers damaged (the file is read before any server check); the tracker says "cannot be scored now", not "archived".

- 2.241 leftovers: the server and keptForScoring do not read a season's own named list of statistics (record 070), which no command writes today; the transfer's check also reads plays already sent, so it is stricter than it needs to be; saving "Statistics kept" unchanged raises the season's version, so a second click from the same old page is told "changed since read".

- 2.246 leftovers: browser tests that type no date and the database store tests (the database's own clock) were not searched for a dependence on the hour.

- 2.243 leftovers: no browser test reaches the Profile time-zone sentence; the first-child sentence shows only when a yes was put back, not when only a saved "full names" was cleared; an adult league that had a child and an old yes before this step keeps both (made-up data only today; the lead checks the test copy in a session the founder started); the two-connection race wants a run on a real PostgreSQL.

- 2.155 part 2 leftovers: a refused grid form still carries what was typed in the address (a round name ends in history and logs; a reload drops it); the grid's one-time notice does not record which answer it belongs to, so a fresh notice lets an older address show its old words; a refusal is remembered for ten minutes, so retrying an unchanged form gets the old refusal even after its cause was fixed elsewhere; a jersey number a teammate already wears was not walked in a browser.

- 2.155 part 3: not walked in a browser: Profile's "Saved now" with scripts off; a short name refused by the server with scripts on (the browser's own checks stop it first).

- 2.69: the last-minutes sign at a period change, in overtime and with the clock set by hand into the window was checked by reading only; no read-only page shows the clock mode to a second device.

- 2.249: other browser tests that use the real clock and a game dated from now were not run between 00:00 and 03:00 league time; bad-wifi-visitors-test line 291 uses yesterday in UTC.

- 2.155 part 4: with scripts on a save leaves no #setting-… at the end of the address; done=saved remains in the schedule's and rounds' own tests (not converted forms).

- 2.65: a corrected play lands in the period and clock time the game ended in (a foul moved from Q1 counts toward the last period's team fouls and shows there in the play by play); a typo like 30 for 3 adds baskets only Undo takes back; game-states-test "take back, end, reopen, end, reopen" timed out once on GitHub where the twin passed (make its error print the whole message, which names the locator); a scorekeeper who cannot use the grid also sees the subtitle naming "Edit the box score"; the mercy notice waiting behind the Undo question is untested (no made-up game shows both).

- 2.123: the scoring screen's team-foul count has no small word saying what it covers (half, game, quarter): it did not fit on a phone beside a bonus badge within the scoreboard's fifth of the screen; and the game-format panel has no rule for team fouls when the periods change on the night.
