# Area audit: the business

Step 2.111. Area 8 of [LEADS.md](../LEADS.md): "The founder. Pricing, costs, legal duties (children's data above all), what each league is promised, support, and the path from demo to paying leagues are each decided, written down and built into the product where they need to be."

Written 2026-11-17 by the area lead for the business, from build branch commit `ce7a1bf`. It is written for the founder, as someone about to run this as a business. It changes no code, no test, no plan and no decision. It decides nothing and marks nothing agreed: everything below that sounds like an answer is a recommendation.

## In short

- **The product's shape is decided and the plans carry it. The business around it is mostly not decided:** no price, no company, no lawyer's wording, no address for people to write to, no domain. None of that stops the build today. Each starts to block at a point named in section 3.
- **The most urgent thing is not in the new product at all.** Al-Hadi's players are children, their names and statistics are public on today's tracker, and the school's written yes is still not in hand. Ask for it this week: one email.
- **93 answers were given for you, under 87 decision numbers.** I would keep all of them but two. I would start player pages switched off in leagues of under-18s (A-15). And I would have you read the Terms and Privacy note before any real person sees it, not after (B-14). Teenagers' own accounts (R-12) should not be built on until a lawyer has answered.
- **Almost every answer is cheap to change later.** The costly ones are about children's names, because a name that has been public cannot be made private again.
- **The lawyer is planned for "after our own tests". Two things arrive earlier than that plan assumed:** real children in the demo league, and the two or three outside leagues you agreed to recruit during stage 4. I recommend one short meeting now, on the children's questions only.
- **Running it costs about $7 a month for the first online test, $100 to $200 a month once real leagues are on it, and under $450 a month at a hundred leagues.** These are the lead's estimates, not quotes. Hosting is the small cost. Your own time, the lawyer and the accountant are the large ones, and the repository holds no figure for them.
- **Four risks no build can remove:** a child's data, a game night that fails, everything resting on you alone, and a vendor changing its free plan. Each has a cheap first move (section 5).
- **Decide these five first:** get the school's yes in writing; say whether the first outside leagues pay (I recommend a free first season with the price for the next one agreed in writing); see a lawyer now about children; buy a working domain and make one address people can write to; and say yes, or name what to change, to the 93 answers.

## How this was done

- **Read whole:** `CLAUDE.md`; `docs/build/LEADS.md`; the step's own line in `STAGE-2.md`; `docs/specs/v1/PROGRESS.md`; all nine product files (P1 to P9); `docs/specs/v1/DECISIONS.md` (the "Decided for you" table, the record of why, the three rounds, the change log and the full list); the note in `docs/specs/v1/decisions-pending/` (no decision is waiting there on this branch); the legal brief (`docs/specs/v1/LEGAL-BRIEF.md`); "Needs the founder" in `STATUS.md` and in `STAGE-2.md`; `docs/build/handover/founder-design-direction.md`; and, for costs and for what you are asked to do by hand, T1 sections 6 to 8, T4 sections 7 to 12, T8 and T10 of the technical files, `STAGE-1-REPORT.md` and the documents in `docs/operations/`.
- **Counted, not estimated:** the decisions were counted by a small script from `DECISIONS.md` and counted again in this file (section 2).
- **Not done:** no price was looked up, no vendor was contacted and nothing was read on the internet, as the brief requires. No screen was opened: this area has no screens of its own. What else I could not check is the last section.

## 1. What is decided and built into the plans

**The answer first: who the business is for, what it sells, what it refuses to do and the order of its first customers are all decided by you and are in the plans. What it charges, what it promises in writing and who it legally is are not.**

### Decided by you (status "Agreed" or "Changed" in `DECISIONS.md`)

- **The first customers, in order (B-1, B-2, F-4, T-219).** Faraj first, because you run it. A demo for TCSAAL after Al-Hadi's season (its last listed game is January 13, 2027), asking for a pilot, not the whole association. Then two or three more small leagues, recruited by you during stage 4. Then strangers. Then the association.
- **One product, never code for one customer (B-3).** A request is a setting, a feature for every league, or a no.
- **No published prices; a price per league per season; nothing charged before strangers can sign up (B-4, B-5).** The price itself is "decided later".
- **Basketball only for now (B-6).**
- **Support (B-8):** help articles and email, a reply within one business day, no phone; you are reachable directly on game nights for the first leagues; an association gets a named contact; a public status page.
- **A lawyer and an accountant (B-9, B-10, B-11):** terms and a privacy policy before any stranger signs up; children's data confirmed before any youth league other than our own demo; payments and tax before any money is taken. The brief for them is written.
- **The working name is SR Leagues (B-12), and our small mark is on every league's page and email (U-8).** No league can remove it.
- **A league's data is the league's.** The owner can export everything at any time (O-9) and delete the league (O-10). A limit or a missed payment never interrupts a season in progress (O-6). We never delete a league's history because a payment failed (U-9).
- **What we do not do (P1 section 4):** no referees, gyms, insurance, equipment or medical cover; we do not decide a league's rules or settle its disputes; we never hold a league's money.
- **No advertising, no selling of data, no tracking cookies** (legal brief, section 3; T4 section 7).
- **Children are shown little by default, and the league's admin can change it (R-14).** Players' statistics start visible to everyone, and a team can make its own more private (S-22, S-23).
- **One trusted second person, Saif Ghori (T-166).** No outside engineer for now; that comes back before stage 5 (T-181).
- **Made-up data only for every AI session; AI sessions never touch the real service (T-201).**

### Where these stand in the plans

Only stages 1 and 2 have a written plan. Stages 3 to 6 are a paragraph each in the build order (T10). So "in the plans" means one of three things:

| What                                                                                  | Where it stands                                                                                                          |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| The demo league, Al-Hadi's transfer, scoring, standings, statistics                   | Stage 2, numbered steps. 99 of the plan's 200 step lines are ticked.                                                     |
| Who sees children's names (R-14, R-23 to R-29)                                        | Built: steps 2.126, 2.162 and part of 2.93. The rest is step 2.146.                                                      |
| Our mark in the footer (U-8)                                                          | Built (the "nothing left out" audit, row P1-21).                                                                         |
| Terms and Privacy pages (B-14)                                                        | Step 2.135, not built. Today both pages say they are not built yet.                                                      |
| Export everything (O-9)                                                               | Step 2.132, named for stage 3. Not built.                                                                                |
| Hand over, delete a league, delete an account (O-7, O-10, O-11)                       | Step 2.133, named for stage 4. Not built. Step 2.114 (a person on a roster can be erased) is not built either.           |
| Our own staff tool: suspend a league, a support visit with a reason, "report this"    | Step 2.136, named for stage 5. Not built.                                                                                |
| Support address, help articles, status page (B-8)                                     | One line of T10's stage 5. No step.                                                                                      |
| The record of what each league agreed with us, fair-use limits, invoices (B-4, T-141) | One line of T10's stage 5. No step. The database already has a place for the agreement (`leagues.agreement`, T3).        |
| The incident procedure (T-84), backups rehearsed (T-154), the game-night watch        | In no step. The "nothing left out" audit found this (its finding M15) and left it for the "going online" audit to place. |
| Payments, a platform fee, charging a league                                           | Stage 5. No payment code exists, which is as decided (B-5).                                                              |
| The lawyer and the accountant                                                         | On your list, timed "before stage 5". Section 3 says why part of that is needed sooner.                                  |
| Two-step sign-in on the business accounts (T-83), the shared vault with Saif (T-166)  | On your list in `STATUS.md`. Both still open.                                                                            |

**What this means.** Nothing decided has been dropped: the "nothing left out" audit (step 2.105) matched every promise in the spec to a step or a later stage, and step 2.141 is to write the later ones into the build order. But the business's own needs sit almost entirely in stage 5's one paragraph, and three of them are needed before stage 5 (section 3, and the steps I propose in section 8).

## 2. Every answer that was "Decided for you"

**The answer first: 93 answers, and I would keep 91 of them unchanged. Nearly all are small rules about screens and scoring that cost little to change. A handful are promises about children, money and your name; those are the ones to read.**

### The counts

- **In `DECISIONS.md`:** the full list has 84 rows marked "Decided for you", 3 marked "Open" and none marked "Recommended". The table "Decided for you, waiting for your yes" has 93 lines under 87 decision numbers: the 84, plus three decisions you had agreed whose details were then answered for you (U-9 with five lines, A-5 and R-15), and R-28 and S-71 each listed a second time because they were changed on November 17.
- **In this report:** all 93 lines under the same 87 numbers (sections 2.1 to 2.5), and the 3 open ones (section 2.6). 90 numbers in all.

How to read each line: what it is · what it commits you to · whether it is cheap or costly to change later · whether I would keep it.

### Where I would decide differently

1. **A-15, player pages start switched on.** I would start them off in a league of under-18s and on in an adult league. The reason given for "on" is that Al-Hadi's families have a player page today. But a page for every child, public from the first day, in a league whose admin never thought about it, is the opposite of the careful start you agreed in R-14. It is one tap for an admin either way. The only question is what happens in a league where nobody decides.
2. **B-14, the Terms and Privacy note worded by the lead.** I would keep the note. I would not let it go in front of a real person on a "decided for you". It is a public statement, in the business's name, of what you do with people's and children's details. That is the kind of thing `CLAUDE.md` says always waits for you. Read it before the first real account exists, and have the lawyer glance at it in the first meeting.
3. **R-12, a player from 13 up has their own account.** Keep it as the plan, but build nothing on it until a lawyer has answered question 17 of the legal brief, which asks what Texas law requires for accounts held by known minors. One case may come early: if any of Al-Hadi's scorekeepers is a student, a teenager gets an account at the demo, long before stage 4.
4. **R-22, a child's profile when a parent deletes their account.** Keep it, with one addition that nobody has decided: a time limit. As written, a child still on a roster is removed "by the league" first. If the league's admin does nothing, the parent waits for ever. I would add "and if the league has not acted in a set number of days, we do it", and ask the lawyer what the number must be.
5. **S-36, the scorekeeper's 30 minutes to reopen a game.** Keep it. But the recap email goes out ten minutes after the final (N-5). So a reopen at minute twenty follows an email with the wrong score, and parents get a correction. When stage 4 is planned, the recap's wait and this window should be set together.

### 2.1 Children, names and accounts (17)

These are the ones that can hurt. What they have in common: when the product is unsure, it shows less of a child.

- **R-11 · A child under 13 is registered by a parent and has no sign-in of their own.** Commits you to: never holding a young child's own email address or password in a youth league that asks for birth dates. The lead kept this against your "no age monitoring is needed"; it agrees that we never check anyone's age. · Change later: cheap, nothing is built on it yet; loosening it stays cheap, tightening it after children have accounts would not be. · Keep: yes, until the lawyer says otherwise (legal brief, questions 16 and 21).
- **R-12 · From 13 up, a player has their own account like anyone else.** Commits you to: holding teenagers' email addresses and writing to them directly, with a parent attached only if the league asks. · Change later: cheap today (registration is stage 4); costly once teenagers have accounts. · Keep: as the plan, but see "decide differently", number 3.
- **R-15 (a detail of it) · Adults may ask to appear as initials only if the league switches that on; a person of unknown age counts as a child in youth and mixed leagues.** Commits you to: full names for adults unless the league offers less. "Removed" always works for anyone (R-25). · Change later: cheap, a starting value. · Keep: yes.
- **R-22 · A child's profile goes with a parent's deleted account only if no other guardian manages it.** Commits you to: a parent cannot wipe a child's record alone while the child is on a roster; the league removes them first. · Change later: cheap in the code; the commitment is a legal one. · Keep: yes, with the time limit in "decide differently", number 4.
- **R-23 · A person's request about their name is set on their record by an admin or registrar, with a reason from a fixed list.** Commits you to: until stage 4, someone who wants their name off a public page must ask their league, and the league keeps a record that they asked. · Change later: cheap. · Keep: yes.
- **R-24 · "Names on public pages" has three choices: full names, first name and last initial, or hidden behind the jersey number.** Every league starts on full names, which shows adults in full and children by first name and last initial. Commits you to: adults' full names are public by default; "hidden" exists for a cautious school. · Change later: cheap. · Keep: yes.
- **R-25 · A request to show less of a child always wins.** Commits you to: a guardian's request overrules the league's settings, and no league can refuse it. This is a promise worth making out loud to schools. · Change later: cheap in the code, costly to take back once said. · Keep: yes.
- **R-26 · In an archived or suspended league, a change that shows less of a person still works.** Commits you to: a league that has closed can still take a name down. If nobody runs that league any more, the request falls to us, and our own tool for that is step 2.136, at stage 5. · Change later: cheap. · Keep: yes.
- **R-27 · A recorded request keeps taking effect whatever changes later.** Commits you to: a name never comes back onto a public page as a side effect of another change. · Change later: cheap. · Keep: yes.
- **R-28 (both lines: November 14, and as changed November 17) · A person counts as a child if their birth date says so or the "minor" tick is on; a date that says adult unticks no one; a date that cannot be read counts as a child.** Commits you to: in doubt, a child. An 18-year-old stays shown as a child until an admin unticks them. · Change later: cheap, one rule kept in two places. · Keep: yes; the change of November 17 closed a real hole.
- **R-29 · An admin's choice of initials or hidden covers adults too; children are shown in full only after the admin ticks that parents have agreed.** Commits you to: relying on an admin's tick. The words of that tick are the lead's, the date is kept, and who ticked is in the activity log. · Change later: the setting is cheap; a child's full name once shown is not. · Keep: yes. The wording, and three more questions about it, are on your list for the lawyer in `STATUS.md`.
- **R-31 · "Create an account" with an address that already has one says so only after the emailed code has proved the mailbox.** Commits you to: nobody can learn by typing an address whether a person has an account. · Change later: cheap. · Keep: yes.
- **A-14 · Someone on the Admins page with no name yet is shown as "No name yet", not by their email address.** Commits you to: staff do not see each other's addresses there. · Change later: cheap. · Keep: yes.
- **A-15 · Player pages start switched on.** Commits you to: every league, youth leagues included, has a public page for each player from the start, with the name as the league's name setting allows. Youth leagues' player pages are marked not to appear in search engines (T4 section 7). · Change later: cheap, one tap, and a starting value for new leagues. · Keep: no for leagues of under-18s; see "decide differently", number 1.
- **S-24 · A league starts with teams allowed to choose who sees their players' statistics.** Commits you to: a coach can make a team's numbers more private than the league's, so some box scores show a team's total only. · Change later: one tap. · Keep: yes.
- **S-34 · A player can be added at the scorer's table with a number and no name, shown as "#12".** Commits you to: a child can appear with no name at all, which is the most private choice. It also means a scorekeeper can type the name of a child nobody registered; that player is marked for the admin to review. · Change later: cheap. · Keep: yes.
- **S-48 · Fouls and turnovers get no leaders card unless the league switches it on.** Commits you to: not ranking children by fouls by default. · Change later: one tap. · Keep: yes.

### 2.2 Money, promises and your name (10 numbers, 14 lines)

- **B-13 · Showing sponsors is free; our cut applies only to sponsor money paid through us.** Commits you to: no income from sponsors until payments exist, at stage 5 or after. You asked for a cut of sponsorships; this is a cut only of what passes through us. · Change later: cheap now; once leagues have been told that showing sponsors is free, charging for it would cost goodwill. · Keep: yes. A share of a handshake deal cannot be collected.
- **B-14 · Until the lawyer's versions exist, the Terms and Privacy pages hold a short plain note worded by the lead.** Commits you to: a public statement of what you keep, why, who sees it and who to write to, written by no lawyer, and saying the lawyer's terms come before any stranger signs up. It needs an address to write to, and none exists. · Change later: any word, any time. · Keep: the note, yes; its order, no: see "decide differently", number 2.
- **B-15 · The six measures of whether it is working are counted by the product from stage 5; until then by hand, with no tracking of visitors.** Commits you to: reading them by hand from Faraj and the demo league until then. · Change later: counting earlier is a step of its own. · Keep: yes.
- **N-15 · Group chats arrive in two steps: announcement chats at stage 4, open chats after sign-up opens to strangers.** Commits you to: no "everyone can talk" chat for at least two stages. · Change later: cheap, nothing is built. · Keep: yes. I would decide on open chats only after seeing whether announcement chats are used; an open chat competes with a free one already on every phone.
- **N-16 · Chat rules: text only, no private one-to-one messages, parents stand in for children under 13, admins remove and mute, members report.** Commits you to: one thing that is easy to miss. Reports go "to us if the league does not act" (P8 section 10). That makes the business a moderator, with no named person and no time to answer in. · Change later: cheap now. · Keep: yes; question 20 of the legal brief asks what else is owed.
- **F-2 · The real Faraj League moves between two seasons, never during one, after the "Faraj test" season.** Commits you to: Faraj's next season may well run on the old site. · Change later: it is a date, not code. · Keep: yes.
- **F-10 · Until TCSAAL agrees, the demo league says "unofficial demo, not run by TCSAAL", uses no TCSAAL logo and stays out of search.** Commits you to: showing an association's schedule and results in public, under a notice, before it has said yes. · Change later: one tap each. · Keep: yes, and I would go one step further (section 6, number 2).
- **U-9 (line 1) · The states of a league: the owner or an admin publishes and archives; a live league cannot go back to draft; only we suspend.** Commits you to: being the only one who can take a league down, "for abuse or non-payment, with notice". How much notice is not written anywhere. · Change later: a contained change. · Keep: yes.
- **U-9 (line 2) · Everyone with an admin area sees a league before it is published.** Commits you to: little; a scorekeeper sees an unpublished league. · Change later: cheap. · Keep: yes.
- **U-9 (line 3) · In a read-only league, inviting is refused; cancelling an invitation and removing someone always work.** · Change later: cheap. · Keep: yes.
- **U-9 (line 4) · Mixed-age leagues are unlisted in the league finder unless they choose to be listed.** · Change later: a starting value. · Keep: yes.
- **U-9 (line 5) · Short names refused as offensive come from our own word list.** Commits you to: keeping that list and being the judge. It is empty today; step 2.98 adds a first list for you to review. · Change later: the list is data. · Keep: yes.
- **U-14 · The owner and any admin may publish, archive and un-archive the league and change its name, its address and its listing.** Commits you to: any admin, not only the owner, can change the league's web address or archive it. If two admins fall out, the owner has no lock on those. · Change later: cheap. · Keep: yes; it follows your own "admins have the owner's access".
- **O-11 · An owner cannot delete their own account while they own a league.** Commits you to: a person's request to delete their account waits until they hand the league over or delete it. · Change later: cheap. · Keep: yes; mention it to the lawyer with question 9.

### 2.3 How a league is run day to day (23)

None of these touches money, the law or a promise to a league. Each is a starting rule in one place. I would keep every one.

- **O-1 · An unpublished site is never blank; staff see placeholders.** Not built yet. · Cheap. · Keep.
- **O-12 · An archived season changes only by a correction with a reason.** An old wrong score can still be put right, and shows as corrected. · Cheap. · Keep.
- **A-5 (a detail of it) · Whoever may remove a kind of thing may restore it from the bin; admins and the owner restore anything.** · Cheap. · Keep.
- **A-16 · A player on a team that is in the bin can still be taken off the league.** · Cheap. · Keep.
- **A-17 · A team with games to play, or with results, cannot be moved to the bin.** Other teams' records rest on its results. · Cheap. · Keep.
- **A-18 · Every new season starts hidden; the owner or an admin shows it.** The public never sees a half-built season. · Cheap. · Keep.
- **U-15 · A signed-out person at a staff page is sent to sign in and brought back.** · Cheap. · Keep.
- **R-21 · A person is asked their first and last name once, right after choosing a password.** Every account has a name. · Cheap. · Keep.
- **R-30 · Signing out leaves a person on the league page they were on.** · Cheap. · Keep.
- **R-32 · A player put back on a roster whose number is now worn comes back without a number.** · Cheap. · Keep.
- **S-41 · Roster limits: a roster cannot pass the largest size; after the lock date only the owner and admins change it; under the smallest size is a warning; a player added at the table is never refused.** Paperwork never stops a game. · Cheap. · Keep.
- **S-49 · Postponing a game offers a new date at once, or "decide later".** · Cheap. · Keep.
- **S-51 · A cancelled game can be put back, with a reason.** · Cheap. · Keep.
- **S-53 · A game is flagged as outside its round only when it truly is.** · Cheap. · Keep.
- **S-54 · A game moved to another round is asked whether it takes that round's date.** · Cheap. · Keep.
- **S-55 · A round added later is numbered after the others.** Round addresses people know do not change. · Cheap before a season is published, harder after. · Keep.
- **S-56 · Postponed and cancelled games of past rounds stay with their round, not under "Needs a result".** · Cheap. · Keep.
- **S-57 · A scorekeeper's own page shows, from other days, only games under way.** · Cheap. · Keep.
- **S-58 · A game with no time yet is not on the Games screen.** The admin's home is to count such games (step 2.129), or they are easy to forget. · Cheap. · Keep.
- **S-59 · A day on the Games screen ends at the league's own midnight.** · Cheap. · Keep.
- **S-60 · A game in the bin does not hold its round.** · Cheap. · Keep.
- **S-61 · Rounds are listed by their dates everywhere.** · Cheap. · Keep.
- **S-62 · Games outside their round are named when the schedule is published and never stop it.** · Cheap. · Keep.

### 2.4 Scoring a game and its numbers (32)

What these commit the business to is one thing: that the scoreboard and the box score behave as a referee, a coach and a parent expect. A wrong one means an argument at a gym, not a legal problem. The scorekeeper can always correct the clock, the fouls and the score by hand (S-21, yours). I would keep every one, with the notes shown.

- **S-25 · The "full" box score adds rebounds, assists, steals, blocks and turnovers.** · Cheap. · Keep.
- **S-26 · A typed team score that differs from its players' points is saved, with a warning first.** A public box score can show a total its lines do not add up to. · Cheap. · Keep.
- **S-27 · A box score game saved again as a final score only loses its player lines.** Lines already cleared are not kept, so this one cannot be undone for a game already saved. · The rule is cheap to change. · Keep.
- **S-28 · Every overtime period ends in the last-minutes stop clock.** · Cheap. · Keep.
- **S-29 · A scorer's switch to a running clock inside the last minutes lasts for that stretch only.** · Cheap. · Keep.
- **S-30 · Inside the last minutes the stop clock wins over the mercy rule.** · Cheap. · Keep.
- **S-31 · The mercy rule switches again only after the lead has dropped below the number.** · Cheap. · Keep.
- **S-32 · A player at the foul limit is only marked; the tracker does not take them off the floor.** The referee and the scorekeeper enforce fouling out, not the software. · Cheap. · Keep.
- **S-33 · Until step 2.104, the list of plays on a live game's page updates only on "Show newer plays".** Temporary. · Step 2.104 ends it. · Keep until then.
- **S-35 · Scorekeepers may change a game's format before it starts, unless the league switches that off.** A volunteer at the table can change one game's rules before tip-off. · One tap. · Keep.
- **S-36 · The scorekeeper who ended a game may reopen it, with a reason, for 30 minutes to begin with.** A result can change for half an hour after "final" without an admin. · A setting. · Keep, with "decide differently", number 5.
- **S-37 · A scorekeeper may change a jersey number at the table.** · Cheap. · Keep.
- **S-38 · "Score this game" appears only on games recorded live.** · Cheap. · Keep.
- **S-39 · The format a scorekeeper confirms includes the clock mode.** · Cheap. · Keep.
- **S-40 · A game started by mistake can be marked "not started" by its scorekeeper until a basket, foul or turnover stands; after that by an admin, with a reason; never once it was final.** · Cheap. · Keep.
- **S-42 · A game under way is never handed to another scorekeeper without a question.** No signal in the gym does not cost a scorekeeper their plays. · Cheap. · Keep.
- **S-43 · Plays listed as "not saved" can be sent by the scorekeeper's own tap, if nobody has recorded anything since.** · Cheap. · Keep.
- **S-44 · A player added at the table with a number already worn is taken and marked, never refused.** · Cheap. · Keep.
- **S-45 · The table may rename or take off only a player added at a table and not yet reviewed.** A scorekeeper cannot alter the league's own roster. · Cheap. · Keep.
- **S-46 · A final score cannot be typed over a game that has live plays.** · Cheap. · Keep.
- **S-47 · While a result is reopened, the public sees the result as it stood, marked "Being corrected".** · Cheap. · Keep.
- **S-50 · A person who may score a game sees "Score this game" on its public card and page; nobody else does.** · Cheap. · Keep.
- **S-52 · A scorekeeper may reopen a final score they typed by hand themselves, within the same minutes.** · Cheap. · Keep.
- **S-63 · A player needs at least 3 games to be ranked among the leaders; the league can change it.** · One value. · Keep.
- **S-64 · The scoring screen shows "0 fouls" from the start.** Differs from today's Al-Hadi tracker. · Cheap. · Keep.
- **S-65 · When a period runs out, the screen offers the next period and waits for a tap.** · Cheap. · Keep.
- **S-66 · The clock's keys fill from the right: 8 is 0:08.** Today's Al-Hadi tracker reads 8 as 8:00, so Al-Hadi's scorekeepers must be shown this before their first game on the new product. · Cheap. · Keep.
- **S-67 · The bonus horn sounds when a team reaches the bonus by a foul.** · Cheap. · Keep.
- **S-68 · On a phone the timeouts left are one tap away.** · Cheap. · Keep.
- **S-69 · Before tip-off, once both lineups are set, the hint gives way to the Start clock button.** · Cheap. · Keep.
- **S-70 · The button to score a game shows on public pages, to a person who may score it, from the start of the game's own day until it is final.** · Cheap. · Keep.
- **S-71 (both lines: November 16, and as changed November 17) · Minutes played follow the game clock, and a clock set wrongly and put right changes nobody's minutes, even if it ran in between.** Commits you to: minutes on the new product are counted differently from today's Al-Hadi tracker. Games already played keep the minutes they were recorded with, so a coach comparing the two may ask why. · One function; cheap for games to come. · Keep.

### 2.5 Bringing Al-Hadi's recorded games over (5)

- **F-12 · The transfer brings in only Al-Hadi's players unless asked for the other teams'.** Other schools' students are not added unasked. · Cheap. · Keep.
- **F-13 · A tracker player with no full name is given no made-up name; games naming them wait.** The transfer is not finished until someone adds those players by hand. · Cheap. · Keep.
- **F-14 · A result already entered here is never overwritten by the transfer.** · Cheap. · Keep.
- **F-15 · Players the tracker marks as no longer active are added like the rest, with no leaving date.** · Cheap. · Keep.
- **F-16 · A player to add who has the full name of someone already listed here on no team is taken to be that person.** Two different students with one name could be joined; the practice run names each case before anything is written. · A contained change. · Keep.

### 2.6 The three decisions still marked "Open"

All three are the technical lead's to settle, and all three spend your money, so the spending is yours (`CLAUDE.md`).

- **T-167 · Which paid plan of each vendor to start on.** Commits you to: the monthly bill in section 4. It starts to block before the first real people's data is on the product: continuous backup and the leaked-password check may both need a paid plan.
- **T-168 · Whether to pay for a second database region.** Not until an association's contract requires it. Nothing to decide now. The repository holds no price for it.
- **T-216 · The hosting vendor, between equals, by price.** Since this was written, the first online test copy was put on Render (T-270). The row still says "Open". Changing host later is allowed for: the program runs anywhere a standard container runs (T8 section 12).

**One note for the lead, not for you.** Eight of these answers are still worded in the product files as "recommended, needs the founder's yes" (B-13 in P1; O-1 in P3; R-11 and R-12 in P6; N-15 and N-16 in P8; F-2 and F-10 in P9), while `DECISIONS.md` calls them "Decided for you". The spec should say one thing (T-185).

## 3. What is still undecided, and when it starts to block

**The answer first: nothing undecided blocks the first online test. A short list blocks the first real people. The large ones (a price in writing, the lawyer's wording, a company) block the first outside league, and your own plan brings that league in stage 4, one stage before the plan says the lawyer is needed.**

Four points in time matter. Each list below says what must be settled by then and who settles it.

### 3.1 Before the first online test (made-up data only)

Nothing in the business is undecided here. It needs your hands and about $7 a month.

- **Your list in `STATUS.md`:** a new password for the test database, Supabase's certificate file, a Render account with a payment card, then one supervised session with the lead.
- **Still open, and worth doing first:** two-step sign-in on GitHub and the email account it recovers to (T-83), and the shared vault with Saif (T-166).
- **One thing to settle while it is cheap: whose accounts these are.** The test database sits in an account from Saif (`STATUS.md`). That is fine for made-up data. The accounts that will hold real people's data should be opened by you, on an address that belongs to the business, with two-step sign-in, and with Saif's emergency access through the vault. Moving a live database from one person's account to another later is real work.

### 3.2 Before the first real people have accounts

Who they are: Al-Hadi's coach and scorekeepers at the demo (stage 2's milestone), then the helpers in the "Faraj test" season, then Al-Hadi's parents when they follow a team (stage 4).

1. **The school's written permission** (legal brief, section 2). Yours: one email. Open on your list. It is about today's tracker as much as the new product.
2. **The words on the Terms and Privacy pages (B-14).** The lead writes them; you read them first (section 2, "decide differently").
3. **An address people can write to.** The note promises to say "who to write to", and the site has a `/contact` page in its plan (P2 section 4). No such address exists. Yours.
4. **A domain, and email that really sends.** An invitation to Al-Hadi's coach is a real email. The test copy sends none: every email is kept, not sent (T-270). Real email needs a domain to send from, with its proofs of authenticity (step 2.137 puts them on your list). No domain is chosen (B-12). So the name question arrives here in a small form: a working domain is enough, and the final name can wait.
5. **Whether any of Al-Hadi's scorekeepers is under 18.** If so, a teenager has an account before any lawyer has answered (R-12). Yours to find out.
6. **A way to remove a person, and to remove a league.** `docs/operations/make-a-league.md` lists both as missing "before a real school's league": step 2.114 (a person on a roster can be erased) and step 2.133 (a league that has been used can be deleted). Step 2.133 is named for stage 4, which is after the demo. The lead's, as a change of order (section 8).
7. **Backup switched on and restored once, and a release that can be taken back.** Step 2.95 builds the procedures. Continuous backup (T-153) costs money and needs your yes. As written it is due "before the first outside league joins". Real children's records arrive sooner, with Al-Hadi's season.
8. **One page on what happens if details leak:** who notices, who is told, how fast. The incident procedure (T-84) names you as the person responsible and is due only "before the first outside league". I would have a short version before the first real account.
9. **What the demo league is called, and whether other schools' rosters appear in it** (F-10, F-6; question 30 of the legal brief). Yours, with the lawyer.
10. **Your own sign-off on holding children's data.** `make-a-league.md` lists "the founder's legal sign-off on holding children's data" as a condition. Your decision of November 12 puts the lawyer after our own tests. Put together, that means you would give this sign-off alone. That is yours to choose. Choose it knowingly; my recommendation is one short meeting first (section 7).

### 3.3 Before the first league that is not your own

When this is: stage 4, by your own decision to recruit two or three more small leagues then (T-219), and whenever TCSAAL says yes to a pilot.

**The gap in the plan's wording.** The lawyer's terms are due "before any stranger signs up" (B-9), which the build order reads as stage 5. Children's data is due "before any youth league other than our own demo" (B-10). But the players of a friend's league are strangers to us, even if its organizer is not. So some of stage 5's list is needed in stage 4:

1. **The lawyer's terms and privacy policy,** if those leagues' players register online. The other way is to keep those first leagues to adults whom the organizer adds by hand, with a one-page agreement signed by the organizer. Yours to choose; either works.
2. **A price in writing, and whether they pay yet (B-4, B-5).** B-5 says nothing is charged until strangers can sign up and payments exist. P1 section 7 says we "agree a price with each" of these leagues. Both are true only if the price is agreed now and charged later. Each league is meant to carry "a record of what was agreed (price, term, any limits)" (P1 section 5); no step gives that record a screen before stage 5.
3. **One page saying what a league is promised and what it is not** (section 3.5 has the list). Today the promises are spread over nine files.
4. **A company, and insurance.** The spec only asks: "Should this be a company before any outside league uses it?" and "Do we need insurance before strangers sign up?" (legal brief, questions 1 and 4). Nobody has answered. Until a company exists, the business is you in person; ask the lawyer what that means for you.
5. **Support:** the address; who answers when you are away; who watches the first game nights (T-160).
6. **The incident procedure (T-84), continuous backup (T-153) and our own staff tool** (step 2.136: suspending a league, a support visit with a recorded reason). The spec dates the first two "before the first outside league". The plan has the tool at stage 5, one stage late for these leagues.
7. **A limit on email.** Every league sends from our one mail domain, so one careless league hurts delivery for all (N-9, T-139). The monthly allowance (T-141) has no number, and announcements have no limit "for now".
8. **If any of them is a youth league:** the lawyer first (B-10). No way round it.
9. **For TCSAAL:** nothing is signed, "even for a small pilot", without a pilot agreement from the lawyer (legal brief, section 1 and question 31), and nothing is promised about size before the load test (F-5, F-9).
10. **The name.** These leagues will print an address and a QR code. A change of the product's domain later is cheap only if the old domain is kept and forwards. The spec says that for a league's short name (U-7) and for league addresses of their own (U-13); it does not yet say it for our own domain.

### 3.4 Before the first dollar is charged (stage 5)

1. **The starting price, and whether it is published** (B-4; T10 stage 5). Yours.
2. **Our share of money paid through us:** registration fees, and sponsor money if B-13 stands. "The rate is not decided" (P1 section 5). The first draft said 1 to 2 percent (change log, B-4). Yours, with the accountant.
3. **The accountant's six questions (B-11):** sales tax on what we charge, how our share is taxed, who issues tax forms to leagues, whether we need a licence to handle money, who bears refunds and chargebacks, and what changes for nonprofit leagues.
4. **A company and a bank account for the money to arrive in.** The spec only asks the question.
5. **How a league pays us.** The legal brief and the build order say "by invoice". P3 section 6 says "through a page hosted by our payment provider". These are probably one thing; the spec should say it once.
6. **Our own refund and cancellation terms** for a league that leaves in the middle of a season it paid for. This is nowhere in the spec. (A league's refund policy toward its own players is covered, P6 section 9.)
7. **What happens when a league does not pay.** Decided (O-6): 14 days of notices; what pauses is adding teams and seasons; a season in progress is never interrupted. It is in no step yet.
8. **The lawyer's terms and privacy policy, and how people accept them** (B-9; questions 5 to 7).
9. **An outside security review** (T-181). The lead has already written that its advice will be yes (T4 section 12). It costs money; the repository holds no figure.
10. **A second sign-in step for owners who collect money** (T-72). Decided; stage 5.
11. **The final name and domain (B-12),** whether to register the name (question 3), and league addresses of their own (U-13, before stage 5).
12. **Later, and blocking nothing now:** spending on marketing (B-7), and text messages, which cost money per message (N-14).

### 3.5 The same, by subject

- **Prices and how money is taken.** Undecided: the amount, our share of fees, how an invoice is paid, our own refund terms. The unit is only "likely" one price per league per season. A written price blocks the first outside league. Everything else blocks the first dollar.
- **What a league is promised.** Decided in pieces: export of everything at any time (O-9); deletion on request, with 30 days to change your mind (O-10); a season never interrupted (O-6); history never deleted over a failed payment (U-9); a reply within one business day (B-8); our own staff inside a league only with a recorded reason the owner can see (T-77); the whole database restorable to any moment of the last seven days (T8 section 5).
- **What a league is not promised.** Any figure for staying up: 99.9% is our own target, and a number is promised only in an association's contract, and only once met for six months (T-152). Restoring one league alone from backup: "possible but manual" (T-155). Any sport but basketball (B-6). Removing our mark (U-8). Code of its own (B-3). Any size we have not tested (F-9). Referees, gyms or insurance (P1 section 4). All of it blocks the first outside league, as one page the organizer reads before saying yes.
- **Terms, privacy and children's data.** Undecided: everything the lawyer must say (32 questions in the brief). In its place for now: the lead's plain note (B-14). The note blocks the first real account. The children's answers block real children on the new product, in my view; the first outside youth league, in the plan's. The full terms block the first outside league whose players register.
- **Support.** Decided: email, one business day, no phone, you on game nights (B-8). Undecided: the address; who besides you; what leagues are told when you travel; who answers a report about a chat (N-16). The address blocks the first real account. The rest blocks the first outside league.
- **Who owns a league's data, and how they leave with it.** Decided: the league owns it, can export all of it and can delete it. Not built: export (step 2.132, stage 3), deletion (step 2.133, stage 4), an owner who disappears (O-8, in no step). Undecided, for the lawyer: how long waivers and payment records are kept (question 12), and whether keeping a nameless line of statistics is acceptable (question 11). Deletion blocks real children's data. Export blocks the first outside league.
- **The name and the domain.** The working name is SR Leagues; no domain is chosen or checked (B-12). A working domain blocks the first real email. The final name blocks the lawyer's terms and the first stranger.
- **A company, and insurance.** The spec speaks of both only as questions for the lawyer. By the wording of question 1 they block the first outside league; at the very latest, the first dollar.

## 4. What it costs to run

**The answer first: about $7 a month for the first online test; $100 to $200 a month from the day real leagues are on it, whether one or ten; under $450 a month at a hundred; and, by my own estimate, $1,000 to $4,000 a month at a thousand. None of these is a quote.**

| Leagues                 | A month          | Where the figure comes from                                                                                                                                                      |
| ----------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| None online yet (today) | $0               | Nothing of the new product is running. Today's Al-Hadi tracker has "no server to run or pay for" (`docs/operations/live-stats-hosting.md`).                                      |
| The first online test   | about $7         | T1, decision T-270: the worker on Render's smallest paid instance; the website on Render's free one; the database on the free Supabase test project. To be confirmed at sign-up. |
| 1, with real people     | $100 to $200     | P1 section 5 says "$100 to $200"; T1 section 8 says "under $150". Both are the lead's, "from my knowledge of typical pricing, not quotes".                                       |
| 10                      | $100 to $200     | An estimate. How: P1 section 5 says "one small league adds almost nothing", and T1 gives one "launch" column for all the early leagues.                                          |
| 100                     | under $450       | T1 section 8, "with around 100 leagues".                                                                                                                                         |
| 1,000                   | $1,000 to $4,000 | An estimate, mine; the repository has no figure. How: below.                                                                                                                     |

**For each league, that is** $10 to $20 a month at ten leagues, under $4.50 at a hundred, and $1 to $4 at a thousand.

**The lines behind T1's figures** (a month, at launch, then at around a hundred leagues): the database, sign-in and files at Supabase, about $25, then $25 to $100 · the servers at Render, $15 to $50, then $50 to $150 · Cloudflare in front, $0 to $20, then $20 · email through Resend, $0 to $20, then $20 to $90 · error reports and uptime checks, $0 to $30, then $30 to $60.

**How I made the figure for a thousand.** I took T1's hundred-league column, multiplied by ten the three lines that grow with use (database, servers, email), and by one to three the two that mostly do not. That gives about $1,000 at the low end and about $3,600 at the high end, which I rounded up to $4,000 because of the doubt about email below. T8 says its own sizes are estimates until the first load test, and the product is to count each league's use (T-164) so that this becomes a measurement.

**What those figures leave out.** Each is named in the repository with no price:

- Continuous backup: "a paid extra on Supabase" (`STAGE-1-REPORT.md`, your checklist, item 7).
- Refusing leaked passwords: "it may need a paid Supabase plan" (the same report).
- A domain. An estimate from my general knowledge, not looked up: tens of dollars a year.
- Stripe: no monthly cost; it takes a share of each payment (T1 section 8). The share is not in the repository.
- Text messages, if they are ever sent: a cost per message (N-14).
- A second database region (T-168): not until an association's contract asks for it.

**The line most likely to be wrong is email.** Worked from the spec's own sizes: T8 says a thousand leagues play 100,000 games a season, so a hundred leagues play about 10,000. Each game sends a reminder and a recap to the players, guardians, coaches and followers of both teams (P8 section 2). Faraj has 70 people in 6 teams (T8 section 1), about 12 a team, so 24 players a game; add coaches, guardians and followers and call it 30 to 50 people a game, with two emails each. That is 600,000 to 1,000,000 emails a season at a hundred leagues, or 150,000 to 330,000 a month if a season lasts three or four months, and ten times that at a thousand. Whether "$20 to $90" buys that is the first thing the vendor decision (T-167) should check. I have not looked the price up. It matters for your price too: email is the one cost that grows with every league, which is why the email allowance (T-141) should be a number before you quote anyone.

**The costs that are not hosting.** The repository holds no figure for any of these, and they are the large ones:

- **The lawyer:** 32 questions and three documents (terms, a privacy policy, a pilot agreement). **The accountant:** six questions. Ask each for a fixed price against the written brief.
- **A company,** its yearly upkeep, insurance, registering the name. Only questions so far.
- **An outside security review** before stage 5 (T-181).
- **The AI plan that builds and maintains the product.** `STATUS.md` speaks of the week's allowance and says extra usage "costs money, so that stays yours"; it gives no dollar figure. This cost does not end at launch: fixes and changes will be made the same way.
- **Your time:** quoting each league by hand (B-4); answering support within one business day (B-8); watching the first game nights (T-160); a supervised session for every change to the real service, because AI sessions may not touch it (T-201); and gathering TCSAAL's fixtures and results by hand, "a few hours… repeated as results come in" (P9 section 3).

**What this means for the price.** At ten leagues, hosting is covered by $10 to $20 a league a month. So hosting is not what the price has to cover. The professionals, the build and your own time are. A real break-even needs their figures, which only you can get.
