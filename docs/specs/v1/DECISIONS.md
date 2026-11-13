# Decisions

[Spec home](README.md)

Every decision in the v1 specification, in one place. This is the list we argue over.

## How to use this

- **Recommended**: my answer, waiting for your yes.
- **Agreed**: you said yes.
- **Changed**: you wanted something different, the spec file was edited, and the change log below says what it was before. A changed decision is agreed in its new form.
- **Agreed (delegated)** and **Changed (delegated)**: a technical decision. On November 12 you handed approval of these to me as technical lead. I reviewed them (see "Technical sign-off" below). You can reopen any of them at any time.
- **Needs your answer**: I did not simply do what you said, or your answer raised a new question.
- **Open**: a call that has not been made yet. **Later**: deliberately not part of the first stages. **Dropped** and **Closed**: no longer a decision.
- To disagree, name the ID and say what you want instead.

## Where we stand (November 12, 2026)

Three rounds are done. You answered the "start here" list and most of the product files, delegated the technical files, answered the remaining real choices, and accepted the list of defaults with changes.

- **Stage 1 can start.** Every decision it depends on is settled (listed further down).
- Of 310 decisions: 114 are settled by you, 167 are settled by delegation, 8 are waiting for your answer, and 21 are later, open, dropped or closed.
- The biggest changes from your answers: Faraj first, with a TCSAAL demo at the end of Al-Hadi's season; the demo is the whole TCSAAL league; no single-team sites; no published prices; classic email and password; signed in with no time limit; reminders 24 hours ahead; group chats inside the product; league rules that drive the tracker, with a running-clock switch at the table; each team chooses who sees its players' statistics; a "Faraj test" season before the real league moves; no outside engineer for now.

## Needs your answer

### Where I did not simply do what you said

| ID        | What you said                                                                         | What I did, and why                                                                                                                                                                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-11      | No age monitoring is needed                                                           | Agreed on monitoring: we never check ages. But I kept one rule: in a youth league a child under 13 is registered by a parent and has no sign-in of their own. That comes from United States law on collecting children's details, not from what is on the site. It is on the lawyer's list; if the lawyer says drop it, we drop it. |
| B-13      | Support sponsors as long as we get a cut                                              | Showing sponsors is free. Our cut applies only to sponsor money paid through us (a later feature), because we cannot take a share of a handshake deal.                                                                                                                                                                              |
| T-83      | Two-step sign-in on the business accounts: later, if not needed for the first version | Kept as needed now. It is not something we build; it is about twenty minutes in each vendor's settings, and it is the cheapest protection the business has. Due before stage 2 at the latest.                                                                                                                                       |
| U-1, U-13 | You prefer `farajleague.oursite.com`, unless it delays things                         | It does delay things: about a week, plus ongoing friction in testing. So paths now, and subdomains switched on before sign-up opens to strangers. Old addresses will forward.                                                                                                                                                       |

### New questions your answers raised

| ID   | The question                                                | My answer                                                                                                                                      |
| ---- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| N-15 | Group chats: all at once, or in steps?                      | Announcement chats first (stage 4). Open "everyone can talk" chats after sign-up opens to strangers, together with phone push notifications.   |
| N-16 | Rules for chats                                             | Text only at first, no private one-to-one messages, parents stand in for children under 13, admins can remove and mute, members can report.    |
| F-10 | What does the demo league call itself before TCSAAL agrees? | It carries an "unofficial demo, not run by TCSAAL" notice, does not use their logo, and stays out of search until they agree.                  |
| R-12 | Teenagers' accounts                                         | Simplified after your answer: from 13 up, a player has their own account like anyone else.                                                     |
| O-1  | You read "draft site" as the player draft                   | Reworded: before it is published, a site is never blank. The player draft is a separate optional feature, off unless the organizer chooses it. |

### Still open after round three

- **The two tables above.** R-11, B-13, N-15, N-16, F-10, R-12 and O-1 have not had an answer from you yet.
- **F-2.** The real Faraj League switches to the new site in the gap between two seasons, never in the middle of one. The "Faraj test" season (F-11) comes before that. It stands unless you object.

## What round one settled

| ID          | Outcome                                                                                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B-1         | Faraj first, because you run it. A demo for TCSAAL by the end of Al-Hadi's season, asking for a pilot.                                                                                                             |
| B-2, U-5    | No single-team sites. One kind of site, a league. Each team has its own page, and the league chooses whether members start at the league home or their team's page. Al-Hadi is a team inside a demo league we own. |
| B-3         | Agreed: never code for one customer                                                                                                                                                                                |
| B-4         | No published prices. Quoted per league per season. The price itself is decided later.                                                                                                                              |
| B-5         | Agreed: charge nothing until sign-up is open and payments exist                                                                                                                                                    |
| B-6         | Basketball only for now, built so any sport can be added. A basketball league gets everything.                                                                                                                     |
| B-9 to B-11 | Lawyer and accountant after our own tests, before strangers. The [brief](LEGAL-BRIEF.md) lists everything to tell and ask them.                                                                                    |
| B-12        | Working name: SR Leagues. Final name and domain later.                                                                                                                                                             |
| U-1, U-2    | `oursite.com/{league}` now; league subdomains later (U-13); a league's own domain later still                                                                                                                      |
| U-8         | The league's brand leads; a small "Powered by SR Leagues" mark is on every league's pages                                                                                                                          |
| U-11        | One account for the whole site                                                                                                                                                                                     |
| O-7         | One owner; any number of admins with the same access; every team has a captain or coach                                                                                                                            |
| A-1         | A dashboard designed fresh (not Faraj's), plus editing the site in place                                                                                                                                           |
| C-1         | Arrange and configure what we built; a league's own code maybe later                                                                                                                                               |
| C-2         | Yes: Faraj's look is a starting design others can pick                                                                                                                                                             |
| C-5         | Trophy display is a feature. Faraj's trophy is built first; a league uploading its own trophy comes later.                                                                                                         |
| C-7         | "Exactly as it is" means visitors lose nothing that matters; checked by a feature list and your side-by-side review                                                                                                |
| C-8         | Real pages with their own addresses                                                                                                                                                                                |
| R-1         | Email first                                                                                                                                                                                                        |
| R-2         | Email and password, plus Google                                                                                                                                                                                    |
| R-9         | Signed in with no time limit, admins included; the password is asked again only for dangerous actions                                                                                                              |
| R-10        | Fans can follow a team; nobody needs an account to look                                                                                                                                                            |
| S-2         | Admin runs the draft on one screen; captains' own devices later. Most leagues will not draft at all.                                                                                                               |
| N-2         | Reminder 24 hours before the game; the league can change it                                                                                                                                                        |
| N-5         | The admin chooses: a recap after each game, one a day, or none                                                                                                                                                     |
| N-7         | Group chats inside the product (N-15, N-16)                                                                                                                                                                        |
| F-3         | No target season. Seasons 1 and 2 are kept exactly as they are.                                                                                                                                                    |
| T-166       | Saif Ghori is the trusted second person                                                                                                                                                                            |

## What round two settled

| ID           | Outcome                                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-7          | Not decided now. Revisited after a full season with Faraj or the demo league. Nothing is spent on marketing or sales until then.                                                                                      |
| B-8          | Agreed: help articles and email, with a reply within one business day                                                                                                                                                 |
| R-4          | Changed: the admin can mark a waiver "collected by the league" for someone they added by hand. The record says which admin marked it. It never says the person accepted online when they did not.                     |
| R-8          | Agreed: a lost email is recovered through a league admin who knows the person                                                                                                                                         |
| R-14         | First name and last initial is the starting setting in a youth league, and the admin can switch to full names. It is not a legal requirement I can point to; the lawyer's answer decides whether it must be stricter. |
| R-17         | Changed: leaving is not erasing. A player who leaves stays in the history with their name, as in Faraj's Season 2. A name comes off only if the person asks.                                                          |
| S-1          | Changed: the admin can change the rules at any time, and is shown what will move first. Setting the rules is the first step of setup.                                                                                 |
| S-8          | Agreed: a correction notice goes out only if the score or winner changed                                                                                                                                              |
| S-21         | New, your direction: every game rule that differs between leagues is a setting. The tracker follows it, and the scorekeeper can switch the running clock on or off mid-game.                                          |
| N-9          | No limit on announcements for now. Revisited before strangers can sign up.                                                                                                                                            |
| F-11         | New, your idea: a "Faraj test" league runs a whole test season before the real league moves                                                                                                                           |
| T-181, T-217 | No outside engineer for now. Every change is reviewed by a fresh session that did not write it. Reconsidered before stage 5.                                                                                          |
| T-219        | Agreed: recruit two or three more small leagues during stage 4                                                                                                                                                        |

## What round three settled

| ID                                                | Outcome                                                                                                                                                                                   |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-3, R-6, R-7, R-13, R-15, R-16, R-18, R-19, R-20 | Agreed as written                                                                                                                                                                         |
| N-1, N-3, N-4, N-8, N-10 to N-13                  | Agreed as written                                                                                                                                                                         |
| S-7, S-9 to S-12                                  | Agreed as written                                                                                                                                                                         |
| F-1, F-5, F-7, F-8, F-9                           | Agreed as written                                                                                                                                                                         |
| S-3                                               | Changed: the admin decides the schedule's format. Any schedule can be built or imported by hand from the first release; the generator automates "everyone plays everyone" first.          |
| S-4                                               | Changed: the admin chooses the playoff format. Single elimination and hand-built custom brackets come first, then double elimination and best-of series, then pool play.                  |
| S-5                                               | Agreed, with an addition: a game can be saved to a file on the device and uploaded later from any phone or computer.                                                                      |
| S-6                                               | Changed: the league decides whether players can be added at the scorer's table                                                                                                            |
| S-22                                              | New, your direction: who can see players' statistics is a setting, and each team can choose for itself, down to "only the team's staff"                                                   |
| F-6                                               | Changed: the demo is the whole TCSAAL league, every district and team, with Al-Hadi as one team in it. Other schools' player statistics start hidden until that school chooses otherwise. |

## Technical sign-off (November 12, 2026)

You asked me to approve the technical decisions on my own professional judgment, and to make sure nothing important to a proper engineer was missed. I re-read all ten technical files against the list below before marking anything.

### What I checked, and where each is covered

| Viewpoint                                            | Covered in                                                                        |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| One league never seeing another's data               | T4 section 2: three separate fences, and a test that attacks them on every change |
| Account takeover, passwords, sessions                | T4 section 3                                                                      |
| Who may do what, including our own staff             | T4 section 4                                                                      |
| Malicious content, uploads, spam and bots            | T4 sections 5 and 6                                                               |
| Children's information                               | T4 section 7, pending the lawyer                                                  |
| Card data and money                                  | T4 section 8: card details never touch our servers                                |
| Secrets, vendor accounts, the release pipeline       | T4 section 9                                                                      |
| Losing data, and getting it back                     | T8 section 5: continuous backup, rehearsed restores, three kinds of undo          |
| Staying up, and failing safely when a vendor is down | T8 sections 4 and 12                                                              |
| Growth from 6 teams to an association                | T8 sections 1 to 3 and 9: load tests before any claim                             |
| A scorekeeper in a gym with bad Wi-Fi                | T6 sections 3 to 5                                                                |
| Nothing sent twice, nothing lost                     | T7 sections 1, 3 and 5                                                            |
| Correctness without the founder reading code         | T9 sections 1 to 4                                                                |
| Keeping the code changeable for years                | T2 throughout; T9 sections 9 and 10                                               |
| Not being trapped with a vendor                      | T1 section 7                                                                      |
| Accessibility, languages, old phones                 | T9 sections 6 to 8                                                                |
| Cost                                                 | T1 section 8; T8 section 10                                                       |
| The founder being unavailable                        | T8 section 12 (T-166)                                                             |

### PostgreSQL or Firebase?

PostgreSQL on Supabase. The reasoning is in [T1](technical/T1-stack-and-architecture.md) section 3. In short: Supabase already gives us what makes Firebase convenient. Security is not easier in Firebase, only different, and its usual failure (a browser reading the database through a mistaken rule) cannot happen in our design, because browsers never reach the database. And PostgreSQL can refuse bad data by itself where Firebase's database cannot.

### What the review changed or added

| ID           | What                                                                                      | Why                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| T-34         | Every address is built by one function                                                    | So moving to league subdomains or own domains later is a setting, not a rewrite              |
| T-85         | Password rules                                                                            | You chose passwords (R-2); this is what makes them safe                                      |
| T-70         | No session time limit; the password again for dangerous actions; an email on a new device | You chose "forever" (R-9); these replace the expiry as protection                            |
| T-80         | Stored uploads are images only; import spreadsheets are read once and never served        | The first draft contradicted itself here                                                     |
| T-86         | No personal content in logs or error reports; fixed retention; exports by expiring link   | Missing from the first draft                                                                 |
| T-127        | A tracker that is open keeps working across a release                                     | Missing from the first draft; a release could otherwise break a game in progress             |
| T-139        | Sign-in mail and announcements go from different sending addresses                        | So a complaint about an announcement cannot stop sign-in codes arriving                      |
| T-147, T-148 | How group chats work and how their rules are enforced                                     | New feature (N-15, N-16)                                                                     |
| T-201        | AI assistants never touch production                                                      | Most of the code will be written with AI help; real people's data must stay out of its reach |
| P2 section 2 | Corrected my own comparison of paths and subdomains                                       | The first draft overstated how hard sign-in is with subdomains                               |

### What can only be confirmed when we build

- Prices and plan limits of each vendor (T-167, T-216), including how many live viewers the push service allows at once.
- That Cloudflare's "clear by label" is on the plan we buy. The fallback is in T5 section 4.
- That the sign-in service's leaked-password check is on the plan we buy (T-85).
- Every size and speed figure in T8. They are targets until the load tests are run.

### Technical-file decisions that are still yours

T-83 is the one left: turn on two-step sign-in for the business accounts. T-181 (an outside review) comes back before stage 5. T-167, T-168 and T-216 are mine to settle at build time.

## Needed before stage 1 can start: all settled

U-1, U-3, U-5, U-6, U-7, U-11 · R-2, R-5, R-9 · B-3 · T-1 to T-12 · T-20 to T-28, T-34 · T-40 to T-47 · T-60 to T-71, T-85

## Change log

All dated November 12, 2026.

| ID                    | Was                                                                          | Now                                                                                                           | Why                                                                                                |
| --------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| B-1                   | Small independent leagues first; no approach to an association until stage 6 | Faraj first; a TCSAAL demo at the end of Al-Hadi's season                                                     | Founder                                                                                            |
| B-2                   | The "one team" customer is free and our way in                               | No one-team customer; Al-Hadi is a team in a demo league we own                                               | Founder                                                                                            |
| B-4                   | Free up to 8 teams, $29 a month, quoted for associations, 1–2% of fees       | No published prices; quoted per league per season; decided later                                              | Founder                                                                                            |
| B-6                   | Any sport from the start, except live tracking                               | Basketball only for now; built so sports can be added                                                         | Founder                                                                                            |
| B-12                  | Open                                                                         | Working name "SR Leagues"                                                                                     | Founder                                                                                            |
| B-13                  | New                                                                          | Sponsor display is free; our cut only on sponsor money paid through us                                        | Founder asked for a cut of sponsorships                                                            |
| U-5                   | Two kinds of site, league and team                                           | One kind; team pages; a start-page setting                                                                    | Founder                                                                                            |
| U-8                   | Only the league's brand; "Powered by" only on the free plan                  | Our small mark on every league's pages, always                                                                | Founder                                                                                            |
| U-13                  | New                                                                          | League subdomains later, before stage 5                                                                       | Founder prefers subdomains unless they delay things                                                |
| O-1                   | "The draft site is never blank"                                              | "Before it is published, the site is never blank"                                                             | It was read as the player draft                                                                    |
| O-7, A-3              | Admins had everything except billing, ownership and deletion                 | Any number of admins with the owner's access, except ownership, deletion and the payout account               | Founder                                                                                            |
| C-2                   | Open                                                                         | Yes                                                                                                           | Founder                                                                                            |
| C-5                   | A 3D trophy style any league could use                                       | Faraj's trophy built first; a league's own trophy later, from its photos                                      | Founder                                                                                            |
| C-7                   | A visitor cannot tell old from new; screenshot comparison                    | Visitors lose nothing that matters; feature list plus the founder's review                                    | Founder                                                                                            |
| R-2                   | No passwords: emailed code or Google                                         | Email and password, plus Google                                                                               | Founder                                                                                            |
| R-9                   | Signed out after 180 days away (30 for admins)                               | No time limit; the password again for dangerous actions                                                       | Founder                                                                                            |
| R-12                  | Ages 13 to 17 guardian-managed by default                                    | Own account from 13                                                                                           | Simplified after the founder's "no monitoring"                                                     |
| S-18                  | Later                                                                        | Dropped                                                                                                       | There are no team sites (U-5)                                                                      |
| N-2                   | 9:00 on the morning of the game                                              | 24 hours before the game                                                                                      | Founder                                                                                            |
| N-5                   | One recap per game                                                           | The admin chooses: per game, daily, or off                                                                    | Founder                                                                                            |
| N-7                   | A "copy for group chat" button only                                          | Group chats inside the product, plus the button                                                               | Founder                                                                                            |
| N-15, N-16            | New                                                                          | Chats in two steps; rules for chats                                                                           | Follows N-7                                                                                        |
| F-3                   | Open                                                                         | No target season; past seasons kept whole                                                                     | Founder                                                                                            |
| F-4                   | No approach to TCSAAL until stage 6                                          | A demo at the end of Al-Hadi's season; ask for a pilot                                                        | Founder                                                                                            |
| F-6                   | Al-Hadi as its own team site                                                 | Al-Hadi as a team in a demo league                                                                            | Follows U-5                                                                                        |
| F-10                  | New                                                                          | The demo league is labeled unofficial until TCSAAL agrees                                                     | Follows F-6                                                                                        |
| T-6, T-67, T-85       | Emailed codes and Google only                                                | Passwords added, with rules                                                                                   | Follows R-2                                                                                        |
| T-70                  | 180-day and 30-day limits                                                    | No limit; three protections in its place                                                                      | Follows R-9                                                                                        |
| T-34                  | New                                                                          | One address builder                                                                                           | Makes U-13 cheap                                                                                   |
| T-80                  | "Uploads are images only"                                                    | Stored uploads are images only; import files are read once                                                    | The draft contradicted itself                                                                      |
| T-86, T-127, T-201    | New                                                                          | Log hygiene; the tracker survives a release; AI assistants kept out of production                             | Gaps found in the technical review                                                                 |
| T-103                 | Automatic screenshot match against the old Faraj site                        | Feature list and founder review; screenshots guard the new site afterwards                                    | Follows C-7                                                                                        |
| T-134 to T-136, T-143 | Reminder at a fixed hour; recap per game                                     | 24 hours ahead; the recap mode is the league's choice                                                         | Follows N-2 and N-5                                                                                |
| T-147, T-148          | New                                                                          | How chats work and stay safe                                                                                  | Follows N-15 and N-16                                                                              |
| T-199                 | Only the founder marks any decision agreed                                   | Technical decisions delegated to the technical lead                                                           | Founder                                                                                            |
| T-218                 | Open                                                                         | Closed                                                                                                        | F-3 sets no target season                                                                          |
| B-7                   | No marketing spend or sales hires before 10 leagues                          | Decided later, after a season with Faraj or the demo league                                                   | Founder                                                                                            |
| R-4                   | An admin could never accept a waiver for someone else                        | The admin can mark it "collected by the league"; the record shows who marked it                               | Founder: admins run their own league                                                               |
| R-14                  | Full names of children only where a parent agreed on the form                | A starting setting the admin can change                                                                       | Founder: only if legally required, which is not confirmed                                          |
| R-17                  | A person who leaves has their name removed                                   | Leaving keeps the full history with the name; removal only on request                                         | Founder                                                                                            |
| S-1                   | Rules fixed once the first game is played                                    | The admin can change them at any time, shown the effect first                                                 | Founder                                                                                            |
| S-21, T-128           | New                                                                          | League rules drive the tracker; a running-clock switch mid-game                                               | Founder                                                                                            |
| N-9                   | 5 announcements a day, 2 essential a week                                    | No limit for now; revisited before stage 5                                                                    | Founder                                                                                            |
| F-11                  | New                                                                          | A "Faraj test" league runs a whole test season first                                                          | Founder                                                                                            |
| T-181                 | An outside engineer reviews after stage 1 and before stage 5                 | No outside engineer for now; a fresh session reviews every change; reconsidered before stage 5                | Founder                                                                                            |
| T-217                 | Open                                                                         | Closed                                                                                                        | Follows T-181                                                                                      |
| S-3                   | The first builder handles a round-robin season only                          | The admin decides the format; any schedule by hand from the first release; round robin automated first        | Founder: we cannot decide for the admin                                                            |
| S-4                   | Single elimination first; others when a league needs them                    | The admin chooses the playoff format; custom brackets by hand from the start                                  | Founder                                                                                            |
| S-5, T-129            | One device at a time with takeover                                           | The same, plus saving a game to a file and uploading it from any device                                       | Founder                                                                                            |
| S-6                   | Players added at the table are always allowed and flagged                    | The league's choice: allowed and flagged, allowed, or not allowed                                             | Founder                                                                                            |
| S-22, T-87            | New                                                                          | Each team chooses who can see its players' statistics                                                         | Founder                                                                                            |
| F-6                   | The demo league was Al-Hadi's district                                       | The demo is the whole TCSAAL league; other schools start with hidden player statistics                        | Founder                                                                                            |
| T-220                 | New                                                                          | History keeps ids; erasure empties the account row in place; an owner-only function purges a league's history | History could not be kept unchanged while accounts are erased and leagues purged (step 1.6 review) |
| T-221                 | New                                                                          | Lookups before a league or account is known go through a few narrow owner-run functions, never a wider policy | The league fence (step 1.7) left sign-up, sign-in, invitations and access lists with no way in     |
| T-222                 | New                                                                          | Typed queries and the transaction helper (record 009)                                                         | Step 1.8 needed a transaction helper that cannot leak a league across pooled requests              |
| T-223                 | New                                                                          | The command shape and where it lives (record 010)                                                             | Step 1.10 needed one shape for every change to data                                                |
| T-226                 | New                                                                          | Invitation links, accepting in the league's fence, what the activity log holds (record 014); T-221 narrowed   | Step 1.12 needed them; the link names the league, so accepting needs no owner-run function         |
| T-212                 | Nothing from a later stage is built early                                    | Later-stage work is built early whenever it does not have to wait (record 011)                                | The founder asked for every stage that can be built in parallel to be built in parallel            |
| T-224                 | New                                                                          | Jobs recorded in our own fenced `jobs` table; pg-boss runs them in production (record 012)                    | Step 1.19: pg-boss's tables have no league fence, so a job there would be open to every league     |
| T-225                 | New                                                                          | Sign-in numbers and the shape of the sign-in interface (record 013)                                           | Step 1.13 turned "a few" and "for a while" into numbers the stand-in and Supabase share            |
| T-229                 | New                                                                          | Agreed (delegated): endpoints name their league by id; one spelling per address (record 017)                  | Step 1.16 review: endpoints had no league; other spellings were served                             |
| T-230                 | New                                                                          | The Supabase adapter and the small store of our own it needs (record 018)                                     | Step 1.15: Supabase has no session list, devices or per-address limits                             |
| T-235                 | New                                                                          | Templates in plain TypeScript until React is in; the invitation link stays in the path, unlogged (record 023) | Step 1.19 part 2 review: no React toolchain yet; the link must not leak or be lost                 |

## The full list

Each line is the decision's opening sentence. The reasoning and detail are in the linked file.

### [P1 — Business](product/P1-business.md)

| ID   | Decision                                                                                                              | Status                        | Stage 1 |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------- |
| B-1  | Faraj League is the first customer, and a demo for TCSAAL at the end of Al-Hadi's season is the first sales target    | Changed                       |         |
| B-2  | There is no "one team" customer for now; Al-Hadi is a team inside a demo league we own                                | Changed                       |         |
| B-3  | We never write code for one customer                                                                                  | Agreed                        | yes     |
| B-4  | No published prices for now; quoted per league per season; the price itself is decided later                          | Changed (price decided later) |         |
| B-5  | Charge nothing until self-serve sign-up and online payments exist                                                     | Agreed                        |         |
| B-6  | Basketball now, built so that any sport can be added                                                                  | Changed                       |         |
| B-7  | Whether and when to spend on marketing or hire for sales is decided after a full season with Faraj or the demo league | Later                         |         |
| B-8  | Help articles inside the admin, and support by email with a one-business-day reply target                             | Agreed                        |         |
| B-9  | Terms of service and privacy policy, written by a lawyer, before any stranger signs up                                | Agreed                        |         |
| B-10 | Children's data: a lawyer confirms our legal duties before any youth league other than our own demo uses the product  | Agreed                        |         |
| B-11 | Payment terms and tax treatment of the platform fee, confirmed by an accountant before billing is switched on         | Agreed                        |         |
| B-12 | The working name is "SR Leagues"; the final name and domain come later                                                | Changed                       |         |
| B-13 | Showing sponsors is free, and our cut applies only to sponsor money that is paid through us                           | Needs your answer             |         |

### [P2 — Leagues and URLs](product/P2-leagues-and-urls.md)

| ID   | Decision                                                                                                                | Status  | Stage 1 |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | ------- | ------- |
| U-1  | Every league lives at `oursite.com/{league}` (for now; see U-13)                                                        | Agreed  | yes     |
| U-2  | A league can later attach its own domain as a paid add-on                                                               | Agreed  |         |
| U-3  | A league with one program never sees the word "program"                                                                 | Agreed  | yes     |
| U-4  | The words are the league's to rename                                                                                    | Agreed  |         |
| U-5  | There is one kind of site, a league; each team has its own page, and the league chooses what members see first          | Changed | yes     |
| U-6  | The address shows where you are asking to go                                                                            | Agreed  | yes     |
| U-7  | Rules for the `{league}` name                                                                                           | Agreed  | yes     |
| U-8  | The league's brand leads, and a small "Powered by SR Leagues" mark is on every league's pages                           | Changed |         |
| U-9  | A league is not visible until its organizer publishes it                                                                | Agreed  |         |
| U-10 | Being listed in `/find` is the league's choice, on by default for adult leagues and off by default for youth leagues    | Agreed  |         |
| U-11 | A person has one account for the whole site                                                                             | Agreed  | yes     |
| U-12 | None of the big-league levels are built in the first release, but the data and the addresses already have room for them | Agreed  |         |
| U-13 | `farajleague.oursite.com` becomes the standard address before sign-up opens to strangers                                | Later   |         |

### [P3 — Organizer sign-up and setup](product/P3-organizer-signup-and-setup.md)

| ID   | Decision                                                                                                                                                              | Status            | Stage 1 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------- |
| O-1  | Before it is published, the site is never blank: empty sections show placeholders only admins see (this is not about the player draft)                                | Needs your answer |         |
| O-2  | An organizer can fill the unpublished site with sample teams and games in one click, and remove them in one click                                                     | Agreed            |         |
| O-3  | Publishing the site and opening registration are separate switches                                                                                                    | Agreed            |         |
| O-4  | Import is part of the first release, not an extra                                                                                                                     | Agreed            |         |
| O-5  | The admin home always shows "what needs you now" for the current point in this cycle, not a wall of charts (P4 section 2)                                             | Agreed            |         |
| O-6  | A limit or a missed payment never interrupts a season in progress                                                                                                     | Agreed            |         |
| O-7  | A league has exactly one owner, any number of admins with the same access, and a captain or coach for every team                                                      | Agreed            |         |
| O-8  | If an owner disappears (no sign-in for a long period and no response), another admin can ask us to transfer ownership                                                 | Agreed            |         |
| O-9  | An owner can export everything at any time                                                                                                                            | Agreed            |         |
| O-10 | An owner can delete the league. It is hidden at once, kept for 30 days in case of regret, then erased. People's accounts are not deleted; only their records in that… | Agreed            |         |

### [P4 — Admin dashboard](product/P4-admin-dashboard.md)

| ID   | Decision                                                                                                                                                                 | Status | Stage 1 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------- |
| A-1  | The admin has a dashboard for running the league, and an "edit the site" mode for changing what the public sees                                                          | Agreed |         |
| A-2  | Everything works on a phone. Organizers run leagues from the gym. Game-day tasks (entering a score, moving a game, messaging teams) are designed for a phone first. The… | Agreed |         |
| A-3  | Start with fixed roles; add build-your-own roles only when an association needs them                                                                                     | Agreed |         |
| A-4  | "Saved" always means stored on our servers                                                                                                                               | Agreed |         |
| A-5  | Nothing important is lost by one wrong tap                                                                                                                               | Agreed |         |
| A-6  | An activity log records who changed what and when, visible to the owner and admins                                                                                       | Agreed |         |
| A-7  | Changes the public will feel are previewed before they go out                                                                                                            | Agreed |         |
| A-8  | Two admins editing the same thing do not silently overwrite each other                                                                                                   | Agreed |         |
| A-9  | The public never sees half-finished work                                                                                                                                 | Agreed |         |
| A-10 | Every screen has help where it is needed                                                                                                                                 | Agreed |         |
| A-11 | No place to paste code, scripts or custom CSS (U-1, B-3)                                                                                                                 | Agreed |         |
| A-12 | No direct editing of calculated things                                                                                                                                   | Agreed |         |

### [P5 — Site customization](product/P5-site-customization.md)

| ID   | Decision                                                                                                                                                                  | Status  | Stage 1 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------- |
| C-1  | An admin can change anything about how their site looks and what it shows by choosing, arranging and configuring parts we built                                           | Agreed  |         |
| C-2  | Faraj's current look becomes one of the starting designs, under a neutral name, for any league to pick                                                                    | Agreed  |         |
| C-3  | Site edits are always draft-then-publish, and restoring an old version never touches league data                                                                          | Agreed  |         |
| C-4  | Content that changes weekly is edited in the dashboard, not by redesigning pages                                                                                          | Agreed  |         |
| C-5  | The trophy is a "Trophy display" section; Faraj's trophy is built first, and a league bringing its own trophy comes later                                                 | Changed |         |
| C-6  | Other Faraj-specific parts follow the same rule and are listed one by one in P9                                                                                           | Agreed  |         |
| C-7  | "Exactly as it is" means Faraj's visitors lose nothing that matters; checked by the feature list and the founder's side-by-side review                                    | Changed |         |
| C-8  | Each page gets a real address. Today Faraj is one page with tabs (`#schedule`). On the platform it is `/farajleague/schedule`. Moving between pages stays instant, links… | Agreed  |         |
| C-9  | Approved embeds at launch are YouTube, Vimeo, Instagram, Google Maps and Google Calendar                                                                                  | Agreed  |         |
| C-10 | Uploaded images are resized and compressed automatically                                                                                                                  | Agreed  |         |
| C-11 | News posts are written in a simple editor                                                                                                                                 | Agreed  |         |
| C-12 | Every page has a title and description for search engines and link previews, filled in sensibly by default and editable                                                   | Agreed  |         |
| C-13 | Design is set once for the whole league                                                                                                                                   | Agreed  |         |
| C-14 | A club page (a member school) uses a fixed layout showing that school's teams across programs, with the school's logo and colors                                          | Later   |         |

### [P6 — Registration and accounts](product/P6-registration-and-accounts.md)

| ID   | Decision                                                                                                                                   | Status            | Stage 1 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ------- |
| R-1  | Ask for the email first, not last                                                                                                          | Agreed            |         |
| R-2  | Classic email and password, plus Google; an emailed code proves a new address and resets a forgotten password                              | Changed           | yes     |
| R-3  | A league's record of a person and the person's account are separate things that get linked                                                 | Agreed            |         |
| R-4  | The admin decides what to do about a waiver for someone added by hand, and can mark it collected by the league                             | Changed           |         |
| R-5  | One account per person, for the whole site (U-11)                                                                                          | Agreed            | yes     |
| R-6  | The account is identified by a verified email address                                                                                      | Agreed            |         |
| R-7  | One account can manage several people                                                                                                      | Agreed            |         |
| R-8  | If someone loses their email address, we restore access only after checking with a league admin who knows them                             | Agreed            |         |
| R-9  | Once signed in on a device, a person stays signed in until they sign out, with no time limit; dangerous actions ask for the password again | Changed           | yes     |
| R-10 | Fans can follow a team, and nobody needs an account just to look                                                                           | Agreed            |         |
| R-11 | In a youth league, a child under 13 is registered by a parent and has no sign-in of their own                                              | Needs your answer |         |
| R-12 | From 13 up, a player can have their own account like anyone else                                                                           | Needs your answer |         |
| R-13 | A child can have more than one guardian                                                                                                    | Agreed            |         |
| R-14 | Public pages show little about children by default; the league's admin can change it                                                       | Changed           |         |
| R-15 | Adults are shown by full name by default, and the league decides whether a player may ask to appear as initials                            | Agreed            |         |
| R-16 | Sensitive answers are seen only by those who need them                                                                                     | Agreed            |         |
| R-17 | Leaving is not erasing: a player who leaves stays in the history with their name; a name is removed only on request                        | Changed           |         |
| R-18 | A person on the waitlist is not charged until they accept a place                                                                          | Agreed            |         |
| R-19 | A league can also mark someone "paid in person"                                                                                            | Agreed            |         |
| R-20 | Returning players register in one tap, with last season's answers filled in and only the agreements and anything changed to confirm        | Agreed            |         |

### [P7 — Teams, schedule and game day](product/P7-teams-schedule-gameday.md)

| ID   | Decision                                                                                                                                                                    | Status  | Stage 1 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------- |
| S-1  | The admin can change the rules at any time, and is shown what a change will do before it applies                                                                            | Changed |         |
| S-2  | In the first release the admin runs the draft from one screen, as Faraj does now                                                                                            | Agreed  |         |
| S-3  | The admin decides the schedule's format; any schedule can be built or imported by hand, and what we automate grows over time                                                | Changed |         |
| S-4  | The admin chooses the playoff format: single elimination, double elimination, best-of series, pool play, or custom                                                          | Changed |         |
| S-5  | One device scores a game at a time, a second device can take over, and a game can be saved to a file                                                                        | Agreed  |         |
| S-6  | The league decides whether players can be added at the scorer's table                                                                                                       | Changed |         |
| S-7  | Every correction is logged with who, when and why                                                                                                                           | Agreed  |         |
| S-8  | If a correction changes the winner or the score, people who got the recap get a short correction notice                                                                     | Agreed  |         |
| S-9  | Standings are always calculated from final games                                                                                                                            | Agreed  |         |
| S-10 | An admin can add an adjustment (a points deduction, a forfeit win awarded by ruling) with a reason                                                                          | Agreed  |         |
| S-11 | Only final games count. A live game's numbers show on its own page but not in season totals until it ends                                                                   | Agreed  |         |
| S-12 | Marking the season's champion fills the champion banner and adds a plate to the trophy display (P5 section 6)                                                               | Agreed  |         |
| S-13 | Captains drafting from their own phones                                                                                                                                     | Later   |         |
| S-14 | Referee and official assignment                                                                                                                                             | Later   |         |
| S-15 | Availability polls ("who is coming Sunday?")                                                                                                                                | Later   |         |
| S-16 | Live tracking for sports other than basketball                                                                                                                              | Later   |         |
| S-17 | Shot charts and fuller basketball stats (rebounds, assists, steals, blocks, turnovers, missed shots)                                                                        | Later   |         |
| S-18 | Linking a team site's games to an official league on the platform (dropped: there are no team sites)                                                                        | Dropped |         |
| S-19 | Multi-venue travel-aware scheduling                                                                                                                                         | Later   |         |
| S-20 | Video attached to plays                                                                                                                                                     | Later   |         |
| S-21 | Every game rule that differs between leagues is a setting, and the scorekeeper can override anything automatic at the table, including switching the running clock mid-game | Agreed  |         |
| S-22 | Who can see players' statistics is a setting, and each team can choose for itself                                                                                           | Agreed  |         |

### [P8 — Notifications](product/P8-notifications.md)

| ID   | Decision                                                                                                                                                              | Status                           | Stage 1 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------- |
| N-1  | Two channels at launch, the site inbox and email                                                                                                                      | Agreed                           |         |
| N-2  | The reminder goes 24 hours before the game starts; the league can change it                                                                                           | Changed                          |         |
| N-3  | A parent with two children playing, or a player on two teams, gets one reminder listing all of that day's games, not several                                          | Agreed                           |         |
| N-4  | For games recorded as final-score-only, the recap is shorter but still goes out                                                                                       | Agreed                           |         |
| N-5  | The league's admin chooses how recaps go out: after each game (the default), once a day, or off                                                                       | Changed                          |         |
| N-6  | A written summary of the game produced automatically from the play-by-play ("Jaysh pulled away with a 12–2 run to open the second half")                              | Later                            |         |
| N-7  | Group chats inside the product, and a "copy for group chat" button as well                                                                                            | Changed                          |         |
| N-8  | Nothing is ever sent twice. If a game is ended, reopened and ended again, the recap does not repeat (the correction rule in the table applies instead)                | Agreed                           |         |
| N-9  | No limit on announcements for now; revisited before sign-up opens to strangers                                                                                        | Changed (revisit before stage 5) |         |
| N-10 | Bad addresses are handled. After a hard bounce we stop emailing that address, flag it to the league admin, and ask the person to fix it at their next sign-in         | Agreed                           |         |
| N-11 | A message is built at the moment it is sent, so it reflects the latest time and venue, not what was true when it was queued                                           | Agreed                           |         |
| N-12 | Delivery does not depend on anyone having a page open                                                                                                                 | Agreed                           |         |
| N-13 | Emails come from an address on our own mail domain with the league's name shown, for example `Faraj League <farajleague@mail.oursite.com>`                            | Agreed                           |         |
| N-14 | In order of likely value: phone push notifications (people add the league site to their home screen and allow notifications; no app store needed); text messages for… | Later                            |         |
| N-15 | Group chats arrive in two steps: announcement chats at stage 4, open chats after stage 5                                                                              | Needs your answer                |         |
| N-16 | Rules for every chat: text only, no private one-to-one messages, parents stand in for children under 13, moderation and reporting                                     | Needs your answer                |         |

### [P9 — Faraj, TCSAAL and Al-Hadi](product/P9-faraj-and-tcsaal.md)

| ID   | Decision                                                                                                   | Status            | Stage 1 |
| ---- | ---------------------------------------------------------------------------------------------------------- | ----------------- | ------- |
| F-1  | This table is the acceptance list for "Faraj can run on the platform"                                      | Agreed            |         |
| F-2  | Move Faraj between seasons, never during one                                                               | Recommended       |         |
| F-3  | There is no target Faraj season, and every past season is kept as it is                                    | Changed           |         |
| F-4  | We show TCSAAL a demo when Al-Hadi's season ends, and ask for a pilot, not the whole association           | Changed           |         |
| F-5  | Prove the size before promising it                                                                         | Agreed            |         |
| F-6  | The demo is the whole TCSAAL league, with Al-Hadi as one team in it                                        | Changed           |         |
| F-7  | Games already recorded in the current tracker are transferred, not re-entered                              | Agreed            |         |
| F-8  | More Al-Hadi teams (junior varsity, girls, other sports) would be further programs in the same demo league | Agreed            |         |
| F-9  | "any size" at launch means "any size we have tested"                                                       | Agreed            |         |
| F-10 | Until TCSAAL agrees, the demo league does not present itself as TCSAAL                                     | Needs your answer |         |
| F-11 | A "Faraj test" league runs a whole test season before the real league moves                                | Agreed            |         |

### [T1 — Stack and architecture](technical/T1-stack-and-architecture.md)

| ID   | Decision                                                                                                                                                                   | Status              | Stage 1 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------- |
| T-1  | One application organized into modules, not many small services                                                                                                            | Agreed (delegated)  | yes     |
| T-2  | TypeScript. The live tracker's rules run in the browser (for instant response and offline use) and on the server (as the authority). One language means that is one piece… | Agreed (delegated)  | yes     |
| T-3  | Next.js and React. Public league pages must load fast on a phone in a gym and be readable by search engines, which favors building the page on the server. The admin, the… | Agreed (delegated)  | yes     |
| T-4  | PostgreSQL, and one database for everyone                                                                                                                                  | Agreed (delegated)  | yes     |
| T-5  | Supabase as the host for database, sign-in, files and live updates                                                                                                         | Agreed (delegated)  | yes     |
| T-6  | Sign-in by Supabase Auth: password storage, emailed codes, Google sign-in, session cookies and rate limiting are solved problems we should not rebuild                     | Changed (delegated) | yes     |
| T-7  | A worker with its queue in PostgreSQL                                                                                                                                      | Agreed (delegated)  | yes     |
| T-8  | Supabase Realtime for live game pages                                                                                                                                      | Agreed (delegated)  | yes     |
| T-9  | Render and Cloudflare. Render runs containers with almost no setup, has separate "web service" and "background worker" types that match our two programs, and scales by…   | Agreed (delegated)  | yes     |
| T-10 | Stripe. The standard, and its Connect product is designed for exactly our situation: money goes to the league's account, we take a fee, and card details never touch our…  | Agreed (delegated)  | yes     |
| T-11 | Resend for email. Simple, good delivery, and templates are written in the same React we already use. Postmark is the fallback choice if delivery quality disappoints       | Agreed (delegated)  | yes     |
| T-12 | The website is the app. It is built to work well on phones and can be added to the home screen, where it opens full-screen and the tracker works offline. This reaches…    | Agreed (delegated)  | yes     |
| T-13 | Real people's data exists only in production                                                                                                                               | Agreed (delegated)  |         |
| T-14 | Every outside service sits behind a small interface of our own                                                                                                             | Agreed (delegated)  |         |
| T-15 | The existing code is kept: the basketball rules and contracts stay, the tracker is rebuilt inside the web app with the same behavior, the older experiments are retired    | Agreed (delegated)  |         |
| T-16 | The Al-Hadi tracker keeps running untouched while the platform is built beside it                                                                                          | Agreed (delegated)  |         |

### [T2 — Repository and code structure](technical/T2-repo-and-code-structure.md)

| ID   | Decision                                                                                                                                                               | Status             | Stage 1 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------- |
| T-20 | Everything lives in this one repository, organized as npm workspaces with a single lockfile, as it is today                                                            | Agreed (delegated) | yes     |
| T-21 | Dependencies point one way                                                                                                                                             | Agreed (delegated) | yes     |
| T-22 | A module is used only through its `index.ts`                                                                                                                           | Agreed (delegated) | yes     |
| T-23 | Every change to data is a command, and every command has the same shape                                                                                                | Agreed (delegated) | yes     |
| T-24 | Things that happen afterwards are events                                                                                                                               | Agreed (delegated) | yes     |
| T-25 | Pages and handlers are thin. A page asks a query for data and renders it. A form action or API handler parses the request, builds the context, calls one command, and… | Agreed (delegated) | yes     |
| T-26 | Two ways in, one set of commands                                                                                                                                       | Agreed (delegated) | yes     |
| T-27 | No league is ever named in code                                                                                                                                        | Agreed (delegated) | yes     |
| T-28 | No query without a league. Every function in `packages/database` that touches league data requires a league ID argument; there is no way to call it without one. The…  | Agreed (delegated) | yes     |
| T-29 | What goes to the browser is chosen, not leaked                                                                                                                         | Agreed (delegated) |         |
| T-30 | Settings and secrets are read in one place at startup, checked against a schema, and the app refuses to start if one is missing                                        | Agreed (delegated) |         |
| T-31 | Naming. Files are `kebab-case.ts`. One command or query per file, named for what it does (`end-game.ts`). Tests sit beside the code as `end-game.test.ts`. Database…   | Agreed (delegated) |         |
| T-32 | Strict TypeScript settings, no `any`, no ignored errors without a comment saying why                                                                                   | Agreed (delegated) |         |
| T-33 | Size is a signal. A file past about 300 lines, or a command doing three separate things, gets split                                                                    | Agreed (delegated) |         |
| T-34 | Every address is built by one function, and the league a request is for is worked out in one place                                                                     | Agreed (delegated) | yes     |

### [T3 — Data model](technical/T3-data-model.md)

| ID    | Decision                                                                                                                                                                          | Status             | Stage 1 |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------- |
| T-40  | Every table that holds league data has a `league_id` column, and every link between two such tables includes it                                                                   | Agreed (delegated) | yes     |
| T-41  | IDs are UUIDs (version 7, which sort by creation time)                                                                                                                            | Agreed (delegated) | yes     |
| T-42  | Times are stored in UTC; each league has a time zone used for display, for reminder timing and for quiet hours. Dates without a time (a birthday) are stored as dates             | Agreed (delegated) | yes     |
| T-43  | Money is whole cents plus a currency code                                                                                                                                         | Agreed (delegated) | yes     |
| T-44  | Real columns for anything we search, sort, join or constrain                                                                                                                      | Agreed (delegated) | yes     |
| T-45  | Things that the bin can restore have `deleted_at`                                                                                                                                 | Agreed (delegated) | yes     |
| T-46  | Rows that two people might edit at once have a `version` number                                                                                                                   | Agreed (delegated) | yes     |
| T-47  | The database itself enforces the key rules (unique names, one registration per season, no double-counted taps, capacity), so they hold even if the application has a bug          | Agreed (delegated) | yes     |
| T-48  | The schema changes only through numbered SQL files in `supabase/migrations/`, reviewed like code and applied automatically on release                                             | Agreed (delegated) |         |
| T-49  | Changes are made in two steps when needed                                                                                                                                         | Agreed (delegated) |         |
| T-50  | JSON documents carry a version number, and reading an old version upgrades it in code, so a format change never requires rewriting every league's pages at once                   | Agreed (delegated) |         |
| T-51  | The bin holds soft-deleted rows for 30 days, then a nightly job removes them for good                                                                                             | Agreed (delegated) |         |
| T-52  | When a person leaves a league (R-17), their `people` row loses its name, contact details and link, and their statistics rows remain attached to the now-nameless record           | Agreed (delegated) |         |
| T-220 | History keeps ids, so erasure and purging never rewrite it: an erased account's row is emptied in place, and a purged league's history is removed only by one owner-only function | Agreed (delegated) | yes     |

### [T4 — Keeping leagues apart, sign-in, security](technical/T4-tenancy-auth-security.md)

| ID    | Decision                                                                                                                                                                                                                                         | Status              | Stage 1 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | ------- |
| T-60  | The web app and worker connect as a restricted database user that cannot change the schema and cannot bypass row-level security                                                                                                                  | Agreed (delegated)  | yes     |
| T-61  | At the start of each transaction the app tells the database which league and account it is acting for                                                                                                                                            | Agreed (delegated)  | yes     |
| T-62  | Tables that belong to a person and not a league (`accounts`, `profiles`, `notifications`) have policies keyed to the account instead                                                                                                             | Agreed (delegated)  | yes     |
| T-63  | Jobs that must look across leagues (finding today's games for reminders) run as a list of per-league steps, each inside its own league's fence                                                                                                   | Agreed (delegated)  | yes     |
| T-64  | Supabase's feature that lets browsers query the database directly is given no access to our tables                                                                                                                                               | Agreed (delegated)  | yes     |
| T-65  | An automated test creates two leagues and, for every command and every query in the product, tries to use league A's access against league B's records                                                                                           | Agreed (delegated)  | yes     |
| T-66  | Anything cached is keyed by league, and nothing personal or private is ever cached where another visitor could be served it                                                                                                                      | Agreed (delegated)  | yes     |
| T-67  | Email and password, or Google; a new address is proved with an emailed 6-digit code, which is also the forgotten-password route                                                                                                                  | Changed (delegated) | yes     |
| T-68  | The sign-in screen behaves identically whether or not an account exists, so it cannot be used to discover who has an account                                                                                                                     | Agreed (delegated)  | yes     |
| T-69  | The session is a cookie the page's scripts cannot read, sent only over HTTPS, and not sent on requests started by other websites                                                                                                                 | Agreed (delegated)  | yes     |
| T-70  | Staying signed in follows R-9: no time limit; the password again for sensitive actions; an email on a new device                                                                                                                                 | Changed (delegated) | yes     |
| T-71  | The account page lists active sessions by device and time, with "sign out everywhere"                                                                                                                                                            | Agreed (delegated)  | yes     |
| T-72  | A second sign-in step (an authenticator app) is offered to league owners at launch and required for owners once a league collects money (stage 5)                                                                                                | Agreed (delegated)  |         |
| T-73  | Changing an account's email needs confirmation from the new address and sends a notice to the old one                                                                                                                                            | Agreed (delegated)  |         |
| T-74  | Permissions are checked on the server, inside each command                                                                                                                                                                                       | Agreed (delegated)  |         |
| T-75  | Roles are read from the database on every request, so removing someone's access works immediately                                                                                                                                                | Agreed (delegated)  |         |
| T-76  | Private fields are filtered by permission in the query, not in the page                                                                                                                                                                          | Agreed (delegated)  |         |
| T-77  | Staff have no standing access to any league                                                                                                                                                                                                      | Agreed (delegated)  |         |
| T-78  | No league-supplied HTML, JavaScript or CSS exists anywhere in the system                                                                                                                                                                         | Agreed (delegated)  |         |
| T-79  | A content security policy tells browsers to run scripts only from us and to show embedded frames only from the approved list (C-9)                                                                                                               | Agreed (delegated)  |         |
| T-80  | Stored uploads are images only, re-encoded and served from a separate address; import spreadsheets are read once and never served                                                                                                                | Changed (delegated) |         |
| T-81  | Public pages get names only through one function that applies the league's display policy and the guardian's consent                                                                                                                             | Agreed (delegated)  |         |
| T-82  | Card details are entered only on Stripe's pages                                                                                                                                                                                                  | Agreed (delegated)  |         |
| T-83  | Two-step sign-in must be on for every account that controls the business                                                                                                                                                                         | Agreed              |         |
| T-84  | A written incident procedure before the first outside league joins                                                                                                                                                                               | Agreed (delegated)  |         |
| T-85  | Password rules: a one-way hash held by the sign-in service, at least 8 characters, leaked passwords refused, guesses limited                                                                                                                     | Agreed (delegated)  | yes     |
| T-86  | Logs and error reports carry no personal content and are kept for a fixed time; exports are delivered by an expiring link                                                                                                                        | Agreed (delegated)  |         |
| T-87  | Who may see statistics (S-22) is enforced in the same one function as names, and never leaks through the cache or live updates                                                                                                                   | Agreed (delegated)  |         |
| T-221 | What must happen before a league or account is known (short-name lookup, sign-up, sign-in by email, accepting an invitation, names on an access list) goes through a few narrow owner-run functions, never a wider policy                        | Agreed (delegated)  | yes     |
| T-222 | Typed queries use Kysely behind a hidden handle; one transaction helper sets league and account for that transaction only and refuses stray queries after commit; `date` columns read as text (record 009)                                       | Agreed (delegated)  | yes     |
| T-223 | The command shape: Zod input, one transaction, permission inside it, events inside it, jobs through the transaction object, one log line; core defines ports, database implements them (record 010)                                              | Agreed (delegated)  | yes     |
| T-225 | Sign-in numbers: codes last 10 minutes, 5 tries, 5 an hour per address and 30 per network; passwords 8 characters to 72 bytes, NFKC; wrong guesses slowed, then locked, per address and network (record 013)                                     | Agreed (delegated)  | yes     |
| T-226 | Invitation links hold a random secret stored only as a hash, made as the email is sent and held only in the email; 14 days; re-send replaces it; any signed-in holder accepts once in the league's fence; activity entries hold ids (record 014) | Agreed (delegated)  | yes     |
| T-229 | Endpoints name their league by its id under `/api/v1/leagues`; each address has one proper spelling, and others forward to it (record 017)                                                                                                       | Agreed (delegated)  | yes     |
| ID    | Decision                                                                                                                                                                                                                                         | Status              | Stage 1 |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------                        | ------------------- | ------- |
| T-60  | The web app and worker connect as a restricted database user that cannot change the schema and cannot bypass row-level security                                                                                                                  | Agreed (delegated)  | yes     |
| T-61  | At the start of each transaction the app tells the database which league and account it is acting for                                                                                                                                            | Agreed (delegated)  | yes     |
| T-62  | Tables that belong to a person and not a league (`accounts`, `profiles`, `notifications`) have policies keyed to the account instead                                                                                                             | Agreed (delegated)  | yes     |
| T-63  | Jobs that must look across leagues (finding today's games for reminders) run as a list of per-league steps, each inside its own league's fence                                                                                                   | Agreed (delegated)  | yes     |
| T-64  | Supabase's feature that lets browsers query the database directly is given no access to our tables                                                                                                                                               | Agreed (delegated)  | yes     |
| T-65  | An automated test creates two leagues and, for every command and every query in the product, tries to use league A's access against league B's records                                                                                           | Agreed (delegated)  | yes     |
| T-66  | Anything cached is keyed by league, and nothing personal or private is ever cached where another visitor could be served it                                                                                                                      | Agreed (delegated)  | yes     |
| T-67  | Email and password, or Google; a new address is proved with an emailed 6-digit code, which is also the forgotten-password route                                                                                                                  | Changed (delegated) | yes     |
| T-68  | The sign-in screen behaves identically whether or not an account exists, so it cannot be used to discover who has an account                                                                                                                     | Agreed (delegated)  | yes     |
| T-69  | The session is a cookie the page's scripts cannot read, sent only over HTTPS, and not sent on requests started by other websites                                                                                                                 | Agreed (delegated)  | yes     |
| T-70  | Staying signed in follows R-9: no time limit; the password again for sensitive actions; an email on a new device                                                                                                                                 | Changed (delegated) | yes     |
| T-71  | The account page lists active sessions by device and time, with "sign out everywhere"                                                                                                                                                            | Agreed (delegated)  | yes     |
| T-72  | A second sign-in step (an authenticator app) is offered to league owners at launch and required for owners once a league collects money (stage 5)                                                                                                | Agreed (delegated)  |         |
| T-73  | Changing an account's email needs confirmation from the new address and sends a notice to the old one                                                                                                                                            | Agreed (delegated)  |         |
| T-74  | Permissions are checked on the server, inside each command                                                                                                                                                                                       | Agreed (delegated)  |         |
| T-75  | Roles are read from the database on every request, so removing someone's access works immediately                                                                                                                                                | Agreed (delegated)  |         |
| T-76  | Private fields are filtered by permission in the query, not in the page                                                                                                                                                                          | Agreed (delegated)  |         |
| T-77  | Staff have no standing access to any league                                                                                                                                                                                                      | Agreed (delegated)  |         |
| T-78  | No league-supplied HTML, JavaScript or CSS exists anywhere in the system                                                                                                                                                                         | Agreed (delegated)  |         |
| T-79  | A content security policy tells browsers to run scripts only from us and to show embedded frames only from the approved list (C-9)                                                                                                               | Agreed (delegated)  |         |
| T-80  | Stored uploads are images only, re-encoded and served from a separate address; import spreadsheets are read once and never served                                                                                                                | Changed (delegated) |         |
| T-81  | Public pages get names only through one function that applies the league's display policy and the guardian's consent                                                                                                                             | Agreed (delegated)  |         |
| T-82  | Card details are entered only on Stripe's pages                                                                                                                                                                                                  | Agreed (delegated)  |         |
| T-83  | Two-step sign-in must be on for every account that controls the business                                                                                                                                                                         | Agreed              |         |
| T-84  | A written incident procedure before the first outside league joins                                                                                                                                                                               | Agreed (delegated)  |         |
| T-85  | Password rules: a one-way hash held by the sign-in service, at least 8 characters, leaked passwords refused, guesses limited                                                                                                                     | Agreed (delegated)  | yes     |
| T-86  | Logs and error reports carry no personal content and are kept for a fixed time; exports are delivered by an expiring link                                                                                                                        | Agreed (delegated)  |         |
| T-87  | Who may see statistics (S-22) is enforced in the same one function as names, and never leaks through the cache or live updates                                                                                                                   | Agreed (delegated)  |         |
| T-221 | What must happen before a league or account is known (short-name lookup, sign-up, sign-in by email, accepting an invitation, names on an access list) goes through a few narrow owner-run functions, never a wider policy                        | Agreed (delegated)  | yes     |
| T-222 | Typed queries use Kysely behind a hidden handle; one transaction helper sets league and account for that transaction only and refuses stray queries after commit; `date` columns read as text (record 009)                                       | Agreed (delegated)  | yes     |
| T-223 | The command shape: Zod input, one transaction, permission inside it, events inside it, jobs through the transaction object, one log line; core defines ports, database implements them (record 010)                                              | Agreed (delegated)  | yes     |
| T-225 | Sign-in numbers: codes last 10 minutes, 5 tries, 5 an hour per address and 30 per network; passwords 8 characters to 72 bytes, NFKC; wrong guesses slowed, then locked, per address and network (record 013)                                     | Agreed (delegated)  | yes     |
| T-229 | Endpoints name their league by its id under `/api/v1/leagues`; each address has one proper spelling, and others forward to it (record 017)                                                                                                       | Agreed (delegated)  | yes     |
| T-230 | The Supabase adapter calls Supabase Auth's web API directly, sends codes through our email service, and keeps devices, sessions, our limits and code attempts in its own store (record 018)                                                      | Agreed (delegated)  | yes     |

### [T5 — Customization engine](technical/T5-customization-engine.md)

| ID    | Decision                                                                                                                                            | Status              | Stage 1 |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------- |
| T-90  | The league layout turns this into CSS variables (`--color-primary` and so on) once per page                                                         | Agreed (delegated)  |         |
| T-91  | The document is validated when saved and again when published                                                                                       | Agreed (delegated)  |         |
| T-92  | A section's options hold arrangement and wording, never league data                                                                                 | Agreed (delegated)  |         |
| T-93  | A section can only load data through public queries                                                                                                 | Agreed (delegated)  |         |
| T-94  | Adding a new section type touches only its folder and one registry line                                                                             | Agreed (delegated)  |         |
| T-95  | Personal additions (the bell, "my next game", my team highlighted) are loaded separately after the cached page, with the visitor's session          | Agreed (delegated)  |         |
| T-96  | A release is never changed after it is written                                                                                                      | Agreed (delegated)  |         |
| T-97  | The editor is the public renderer plus overlays, not a separate imitation of the site                                                               | Agreed (delegated)  |         |
| T-98  | The admin screens for settings are generated from these declarations, so a setting cannot exist without a default, limits, a label and a permission | Agreed (delegated)  |         |
| T-99  | Switching a feature off hides all of that and stops its jobs                                                                                        | Agreed (delegated)  |         |
| T-100 | Three separate questions are never mixed                                                                                                            | Agreed (delegated)  |         |
| T-101 | A sport without a live engine still works everywhere else (B-6), because schedules, final scores and standings do not depend on the engine          | Agreed (delegated)  |         |
| T-102 | The 3D code is downloaded only on pages that use that style, so no other league's pages get slower because the trophy exists                        | Agreed (delegated)  |         |
| T-103 | Faraj's acceptance is the feature list plus the founder's side-by-side review; after sign-off, screenshots of the new pages guard against drift     | Changed (delegated) |         |
| T-104 | Every document (design, page, form, season rules) carries a version                                                                                 | Agreed (delegated)  |         |

### [T6 — Live stats and realtime](technical/T6-live-stats-and-realtime.md)

| ID    | Decision                                                                                                                                                                   | Status             | Stage 1 |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------- |
| T-110 | None of this is redesigned. It is moved into the platform's `games` module and web app with the same behavior and the same tests                                           | Agreed (delegated) |         |
| T-111 | The server takes a lock on that one game, applies the commands in order with the engine, saves, and replies with the new sequence number and, for each command, accepted,… | Agreed (delegated) |         |
| T-112 | The lock is per game. Forty games being scored at once do not wait for each other                                                                                          | Agreed (delegated) |         |
| T-113 | A refused command (for example a foul on a player the server knows was substituted out by a command the device never saw) makes the tracker reload the server's state and… | Agreed (delegated) |         |
| T-114 | A tap is written to the device's storage before the screen confirms it                                                                                                     | Agreed (delegated) |         |
| T-115 | The tracker is an installable web app                                                                                                                                      | Agreed (delegated) |         |
| T-116 | Opening a game to score takes a scoring session                                                                                                                            | Agreed (delegated) |         |
| T-117 | After a command is saved, the web app publishes a small message on a Realtime channel for that game                                                                        | Agreed (delegated) |         |
| T-118 | Messages are numbered. If a viewer notices a gap (a missed message), the page fetches a fresh snapshot instead of guessing                                                 | Agreed (delegated) |         |
| T-119 | If the live connection cannot be made at all (some school and office networks block it), the page silently re-fetches the snapshot every 5 seconds                         | Agreed (delegated) |         |
| T-120 | Only our server can publish to these channels, and messages contain only what everyone may see (T-81, T-87)                                                                | Agreed (delegated) |         |
| T-121 | The clock is not broadcast every second                                                                                                                                    | Agreed (delegated) |         |
| T-122 | The grid also produces commands, so the event log always explains the final numbers                                                                                        | Agreed (delegated) |         |
| T-123 | A "bad gym Wi-Fi" test: a scripted full game is played while the test randomly cuts and restores the connection; the final box score must equal the known correct one      | Agreed (delegated) |         |
| T-124 | More basketball stats (S-17) are new command types and new keys in `stats`                                                                                                 | Later              |         |
| T-125 | Another sport's live tracker is a new engine in `packages/sports` and a new tracker screen                                                                                 | Later              |         |
| T-126 | A written recap from the play-by-play (N-6) reads `game_events`, which already holds everything it needs                                                                   | Later              |         |
| T-127 | A tracker that is already open keeps working across a release                                                                                                              | Agreed (delegated) |         |
| T-128 | League rules reach the tracker as data, and the clock mode is a command                                                                                                    | Agreed (delegated) |         |
| T-129 | A game can be saved to a file and uploaded from any device, without anything being counted twice                                                                           | Agreed (delegated) |         |

### [T7 — Notifications and jobs](technical/T7-notifications-and-jobs.md)

| ID    | Decision                                                                                                                                                                   | Status              | Stage 1 |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------- |
| T-130 | A job is recorded in the same transaction as the change that causes it                                                                                                     | Agreed (delegated)  |         |
| T-131 | A job carries identifiers, not content, with no exception: an invitation's link is made as its email is sent (T-226)                                                       | Agreed (delegated)  |         |
| T-132 | The dedupe key is the guarantee against duplicates                                                                                                                         | Agreed (delegated)  |         |
| T-133 | Guardians are resolved at step 2, through `profile_access`                                                                                                                 | Agreed (delegated)  |         |
| T-134 | `reminders.send` is one job per person per league per game day, sent for the first of that person's games and listing all of them                                          | Changed (delegated) |         |
| T-135 | Recaps follow the league's choice (N-5): after each game, once a day, or off                                                                                               | Changed (delegated) |         |
| T-136 | Each game's reminder moment is worked out in its league's time zone, including daylight-saving changes and quiet hours                                                     | Changed (delegated) |         |
| T-137 | Jobs may run more than once; their effects may not. Every job is written so that running it twice does no harm: dedupe keys for notifications, a recorded delivery row…    | Agreed (delegated)  |         |
| T-138 | Fairness between leagues. Jobs run in three priority classes: account and registration messages first, then reminders and recaps, then announcements. Large sends are cut… | Agreed (delegated)  |         |
| T-139 | All mail goes from our sending domain (N-13), set up with the standard proofs of authenticity (SPF, DKIM, DMARC) so that mailbox providers trust it                        | Agreed (delegated)  |         |
| T-140 | Outside production, no email leaves the building                                                                                                                           | Agreed (delegated)  |         |
| T-141 | Each league has a monthly email allowance (fair use, B-4)                                                                                                                  | Agreed (delegated)  |         |
| T-142 | An alert fires if a job has waited more than 10 minutes or any job lands in the failed list                                                                                | Agreed (delegated)  |         |
| T-143 | Reminder planning with a controlled clock: each person gets exactly one reminder per game day, at the right moment                                                         | Changed (delegated) |         |
| T-144 | End, reopen and end a game: exactly one recap. Change the winner: exactly one correction                                                                                   | Agreed (delegated)  |         |
| T-145 | A bounced address is suppressed and flagged to the league                                                                                                                  | Agreed (delegated)  |         |
| T-146 | Fairness: a 20,000-recipient announcement and a small league's reminders queued together; the reminders finish within their 15-minute target                               | Agreed (delegated)  |         |
| T-147 | A chat is ordinary league data plus the delivery we already have                                                                                                           | Agreed (delegated)  |         |
| T-148 | Chat safety is enforced by the server, not by the screen                                                                                                                   | Agreed (delegated)  |         |
| T-224 | Jobs are recorded in our own fenced `jobs` table, ids only; pg-boss runs them in production, the table itself locally (record 012)                                         | Agreed (delegated)  | yes     |
| T-235 | Templates are plain TypeScript until React is in; the invitation link stays in the path, never sent on, cached or logged; its email is built before it commits (rec. 023)  | Agreed (delegated)  | yes     |

### [T8 — Scale, reliability and operations](technical/T8-scale-reliability-operations.md)

| ID    | Decision                                                                                                                                               | Status             | Stage 1 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ------- |
| T-150 | Every scaling mechanism (caching, calculated standings, pushed live updates, background work, paging, fair sharing) is in place from the first stage   | Agreed (delegated) |         |
| T-151 | None of these steps is taken on a guess                                                                                                                | Agreed (delegated) |         |
| T-152 | These are targets we publish internally and measure                                                                                                    | Agreed (delegated) |         |
| T-153 | Continuous ("point-in-time") backup is switched on before the first outside league joins                                                               | Agreed (delegated) |         |
| T-154 | A restore is rehearsed every quarter                                                                                                                   | Agreed (delegated) |         |
| T-155 | Restoring one league from backup without touching the others is possible but manual                                                                    | Agreed (delegated) |         |
| T-156 | Every release can be reversed in minutes by promoting the previous version                                                                             | Agreed (delegated) |         |
| T-157 | Unfinished features ship switched off behind our own rollout flags (T-100), so releasing is routine and small                                          | Agreed (delegated) |         |
| T-158 | No releases while many games are live                                                                                                                  | Agreed (delegated) |         |
| T-159 | Alerts go to a phone for: the site down, error rate spiking, a job waiting over 10 minutes (T-142), database nearly full, bounce rate rising           | Agreed (delegated) |         |
| T-160 | Game-night watch for the first leagues                                                                                                                 | Agreed (delegated) |         |
| T-161 | These are checked automatically on every change for a set of sample pages                                                                              | Agreed (delegated) |         |
| T-162 | A script generates a made-up league of size B in staging                                                                                               | Agreed (delegated) |         |
| T-163 | Four scripted scenarios are run against it                                                                                                             | Agreed (delegated) |         |
| T-164 | Usage is counted per league (emails, storage, live connections) both to enforce fair-use limits (B-4) and so we know what each kind of league costs us | Agreed (delegated) |         |
| T-165 | A procedure counts as written only after someone has followed it start to finish                                                                       | Agreed (delegated) |         |
| T-166 | Saif Ghori is the trusted second person who can reach the vendor accounts and the written procedures in an emergency                                   | Agreed             |         |
| T-167 | Which paid tier of each vendor to start on (decided from prices at build time)                                                                         | Open               |         |
| T-168 | Whether to pay for a second database region (not until an association contract requires it)                                                            | Open               |         |

### [T9 — Quality and maintainability](technical/T9-quality-and-maintainability.md)

| ID    | Decision                                                                                                                                                           | Status              | Stage 1 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | ------- |
| T-180 | Confidence comes from automatic tests, a preview of every change, and small changes                                                                                | Agreed (delegated)  |         |
| T-181 | No outside engineer for now; every change is reviewed by a fresh session that did not write it                                                                     | Changed             |         |
| T-182 | Rules with many possible inputs are also tested with generated inputs                                                                                              | Agreed (delegated)  |         |
| T-183 | Migration safety: a migration that drops or renames something in one step is rejected (T-49)                                                                       | Agreed (delegated)  |         |
| T-184 | A feature is done only when its decisions are agreed, its tests pass, every screen state is handled, it works on a phone and by keyboard, and its help text exists | Agreed (delegated)  |         |
| T-185 | The spec stays true. These files are the description of the product. A change that makes them wrong fixes them at the same time, or it is not finished             | Agreed (delegated)  |         |
| T-186 | The target is the WCAG 2.2 AA standard for both league sites and the admin                                                                                         | Agreed (delegated)  |         |
| T-187 | English only at launch, but all interface text lives in message files from day one, never inside components                                                        | Agreed (delegated)  |         |
| T-188 | League content can be in any language and script, including right-to-left (Faraj's Arabic)                                                                         | Agreed (delegated)  |         |
| T-189 | One currency per league, set when it connects payments                                                                                                             | Agreed (delegated)  |         |
| T-190 | The tracker is tested on real hardware before each stage is called done                                                                                            | Agreed (delegated)  |         |
| T-191 | Few and mainstream. Each new dependency needs a reason written in the change that adds it                                                                          | Agreed (delegated)  |         |
| T-192 | Roughly a fifth of each stage is kept for tidying what the stage revealed                                                                                          | Agreed (delegated)  |         |
| T-193 | A shared abstraction is created the third time something is needed, not the first                                                                                  | Agreed (delegated)  |         |
| T-194 | Code that is no longer used is deleted, not left "in case"                                                                                                         | Agreed (delegated)  |         |
| T-195 | Three seed leagues are maintained and used by tests, previews and demos                                                                                            | Agreed (delegated)  |         |
| T-196 | Each command logs its name, league, acting account, how long it took and whether it succeeded, tagged with an ID shared by everything in the same request          | Agreed (delegated)  |         |
| T-197 | A `CLAUDE.md` file at the top of the repository states the rules of T2 and points here, so every AI session starts from the same structure and conventions         | Agreed (delegated)  |         |
| T-198 | Work is done in small changes, one decision or feature at a time, each with its tests                                                                              | Agreed (delegated)  |         |
| T-199 | An AI assistant never marks a product or business decision agreed; the technical decisions are delegated to the technical lead                                     | Changed (delegated) |         |
| T-200 | Help articles are written with the feature, as part of "done" (T-184), not afterwards                                                                              | Agreed (delegated)  |         |
| T-201 | AI assistants work only on made-up data and never touch production                                                                                                 | Agreed (delegated)  |         |

### [T10 — Build order](technical/T10-build-order.md)

| ID    | Decision                                                                                                                                                                                                                   | Status              | Stage 1 |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------- |
| T-210 | Each stage ends with a real league really using what was built, not with a demo                                                                                                                                            | Agreed (delegated)  |         |
| T-211 | A stage starts only when the decisions it depends on are marked agreed in DECISIONS.md                                                                                                                                     | Agreed (delegated)  |         |
| T-212 | Work from a later stage is built early whenever it does not have to wait; the earliest stage gets builders first, exit tests stay in order, nothing reaches main or a real service before the founder's check (record 011) | Changed (delegated) |         |
| T-213 | The Al-Hadi tracker keeps running as it is until stage 2 has passed its exit test (T-16)                                                                                                                                   | Agreed (delegated)  |         |
| T-214 | Stage 3 before stage 4, because Faraj cannot move until its site can be rebuilt, and Faraj's first season on the platform is stage 4's exit test                                                                           | Agreed (delegated)  |         |
| T-215 | Fuller basketball statistics can be pulled forward into stage 2 if Al-Hadi's coaches want rebounds and assists this season                                                                                                 | Agreed (delegated)  |         |
| T-216 | The hosting vendor between equivalents (T-9), by price when stage 1 starts                                                                                                                                                 | Open                |         |
| T-217 | Whether the outside engineer in T-181 is someone the founder already knows (closed: no outside engineer for now)                                                                                                           | Closed              |         |
| T-218 | The target Faraj season (closed: F-3 sets none)                                                                                                                                                                            | Closed              |         |
| T-219 | Whether to recruit two or three more small leagues during stage 4, so that stage 5 opens with more than two real customers                                                                                                 | Agreed              |         |
