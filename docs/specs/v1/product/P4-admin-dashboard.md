# P4 — The admin dashboard

[Spec home](../README.md) · Decisions A-1 to A-14

The admin lives at `oursite.com/{league}/admin`. This file describes every area in it, who can use each one, and the rules that apply everywhere.

## 1. Two ways to work

**A-1 (agreed): the admin has a dashboard for running the league, and an "edit the site" mode for changing what the public sees.**

- The **dashboard** is lists and tools: registrations, people, teams, the schedule builder, games, settings. It is designed fresh. The founder does not like Faraj's current admin screens, so the dashboard does not copy them.
- **Edit site** shows the public site itself with an edit handle on every section. You change the thing where you see it ([P5](P5-site-customization.md)). Faraj's current admin edits in place like this, and the founder wants that kept.

There is also a shortcut between them. When a signed-in admin browses the public site, a small pencil appears on things they are allowed to change (a score, a team name, a news post). Clicking it opens the right editor. It is faster than hunting through menus.

**A-2 (agreed): everything works on a phone.** Organizers run leagues from the gym. Game-day tasks (entering a score, moving a game, messaging teams) are designed for a phone first. The schedule builder and site editor are more comfortable on a laptop but must be usable on a phone.

## 2. Home

The first screen answers "what needs me right now?"

- **To do**: registrations waiting for approval, games finished without a final score, schedule changes not yet published, a draft not yet run. Each is a button that goes straight to the task.
- **Today and next**: today's games with their status and scorekeeper; the next game day.
- **Season at a glance**: registered players against capacity, teams, games played out of total.
- **Recent activity**: who changed what.
- During first setup, the checklist from [P3](P3-organizer-signup-and-setup.md) sits at the top.

A season picker is at the top of every screen. Leagues with several programs also get a program picker beside it.

## 3. The areas

| Area                    | What you do there                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | More in                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **Home**                | See what needs attention                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | above                                 |
| **Registration**        | Design the form, set dates, capacity and fee, open and close it, review and approve sign-ups, manage the waitlist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | [P6](P6-registration-and-accounts.md) |
| **People**              | Everyone in the league in one searchable list. Add someone by hand, import a list, fix details, merge duplicates, see one person's whole history                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | [P6](P6-registration-and-accounts.md) |
| **Teams**               | Create teams, set names, colors and logos, name captains or coaches, build rosters, run the draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | [P7](P7-teams-schedule-gameday.md)    |
| **Schedule**            | Venues and time slots, generate a schedule, adjust it by dragging, publish it and later changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | [P7](P7-teams-schedule-gameday.md)    |
| **Games**               | Needs a result (however old), this week by day, earlier games by round; assign scorekeepers, open the tracker, enter or correct a score, forfeit. A game with no time, unless it is under way, is shown nowhere on Games for now, whether scheduled, decided or called off (Earlier games needs a start before today); step 2.129's "To do" is where games with no time are to be counted (S-58). Postponed and cancelled games of past rounds stay with their round under "Earlier games" (S-56). A scorekeeper's own page shows, from other days, only games under way (S-57). A day ends at the league's own midnight, with no grace after it (S-59). | [P7](P7-teams-schedule-gameday.md)    |
| **Standings and stats** | See what the system calculated, apply a penalty or adjustment with a reason, correct a stat line                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | [P7](P7-teams-schedule-gameday.md)    |
| **Site**                | Edit pages, design and menu; write news; manage awards, sponsors and media                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | [P5](P5-site-customization.md)        |
| **Messages**            | Send an announcement, see everything the league has sent and whether it arrived, set the league's reminder and recap rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | [P8](P8-notifications.md)             |
| **Season settings**     | Dates, divisions, game format, standings rules and tiebreakers, which statistics are kept, the league's own wording                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | [P7](P7-teams-schedule-gameday.md)    |
| **League settings**     | League name, address, contact; admins and invitations; features on and off; privacy; agreement and invoices; export; delete                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | below                                 |

A **search box** at the top of the dashboard finds any person, team or game by name.

## 4. Who can do what

**A-3 (agreed): start with fixed roles; add build-your-own roles only when an association needs them.**

| Role                 | Can do                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Owner**            | Everything. Exactly one.                                                                                                                      |
| **Admin**            | The same access as the owner, except handing over ownership, deleting the league and changing the payout account. Any number of admins (O-7). |
| **Registrar**        | Registration and People                                                                                                                       |
| **Scheduler**        | Schedule and Games                                                                                                                            |
| **Editor**           | Site, news, media, awards, sponsors                                                                                                           |
| **Scorekeeper**      | Score games. Either any game, or only games assigned to them (league's choice; a new league starts with any game, A-13).                      |
| **Club admin**       | Big leagues only. Their own club's teams, rosters and registrations. Reads the schedule.                                                      |
| **Coach or captain** | Every team has one. Their own team: roster changes the league allows, lineup, messaging the team                                              |

A person can hold several roles. A role can be limited to **one program** ("volleyball scheduler") in leagues that have several.

What each role sees is trimmed to what they can use. A scorekeeper who opens the admin sees a list of their games and nothing else, tonight's first; games recorded live carry a "Score this game" button (S-38, decided for you; the same button is on the game's public card and page for them, S-50), and the others say how they are recorded, with a link to enter the score ([P7 §5.1](P7-teams-schedule-gameday.md)). Coaches and captains do not use the admin at all; their tools are on the team page under `/{league}/my`.

**Inviting someone:** enter an email, pick a role, send. They get a link, sign in (or create their account), and they are in. Pending invitations can be re-sent or cancelled. Access can be removed at any time and takes effect immediately.

**A-14 (decided for you, November 14): someone on the Admins page who has not given their name yet is shown as "No name yet".** Not their email address: the page shows names and roles, and an address is personal. Everyone is asked their name right after signing up (R-21), so this is rare.

## 5. Rules that apply everywhere

**A-4: "Saved" always means stored on our servers.** If a save fails, the screen says so and keeps what was typed.

**A-5: nothing important is lost by one wrong tap.** Deleting a team, a game, a person's league record or a page moves it to a **bin** for 30 days, from which it can be restored. Things with consequences for other people (a finished game's result, an approved registration) cannot be deleted, only corrected or cancelled with a reason. Whoever may remove a kind of thing may also restore it from the bin (a scheduler a game, a registrar a person's league record); admins and the owner can restore anything. A place on a team that is in the bin does not hold a person in the league, so they can still be removed; restoring the team restores its roster (**A-16**, decided for you). Until the bin has its own screen (build step 2.77), a removal says the thing is kept for 30 days and that the screen to bring it back is not ready yet, and promises nothing more. Two undos do not need the bin: a game removed from an unpublished schedule draft is put back in one tap, exactly as it was, and a player marked as having left by mistake is put back on the roster ([P7](P7-teams-schedule-gameday.md) section 2).

**A-6: an activity log records who changed what and when**, visible to the owner and admins. It covers settings, schedule changes, score corrections, role changes and exports.

**A-7: changes the public will feel are previewed before they go out.** Publishing a schedule change shows which games move and how many people will be notified, and asks for confirmation.

**A-8: two admins editing the same thing do not silently overwrite each other.** The second person to save is told it changed, shown the latest version, and can reapply their edit.

**A-9: the public never sees half-finished work.** Schedule edits, site edits and registration form edits are drafts until published.

**A-10: every screen has help where it is needed**: a short explanation at the top of each area the first time it is opened, and a "?" that opens the relevant help article.

## 6. League settings in detail

- **Profile**: league name, address (short name), logo, contact email, city and time zone, adult or youth.
- **Admins**: the people with roles, pending invitations, the activity log.
- **Features**: switches for the optional parts: registration fees, draft, awards and trophies, sponsors, media, news, player pages, live stats. Switching a feature off hides it from the site and the admin but keeps its data. Player pages start switched on (**A-15**, decided for you, November 14).
- **Wording**: the league's own words for division, round, team leader and club (U-4).
- **Start page for members**: the league home, or each member's own team page (U-5).
- **Privacy**: what is public about players ("Names on public pages": full names, first name and last initial, or hidden by jersey number only, followed for every player once chosen, every league starting on full names, R-24 and R-29; the parents' confirmation that lets children be shown in full, R-14; and whether adults may ask to appear as initials, R-15), whether photos are shown, whether the league is listed in search ([P6](P6-registration-and-accounts.md) section 7).
- **Agreement and invoices** (owner and admins): what the league has agreed with us (B-4), usage against fair-use limits, invoices.
- **Payments** (owner only, when fees are on): connect the league's own payment account so fees go to the league.
- **Export** (owner and admins, with the password re-entered, and logged): download everything.
- **Delete league** (owner only): as in O-10.

## 7. What the admin deliberately does not have

**A-11:** no place to paste code, scripts or custom CSS (U-1, B-3). The founder has left the door open to revisit this later (C-1).
**A-12:** no direct editing of calculated things. Standings and statistics come from game results. To change them, an admin corrects the game or adds a visible adjustment with a reason. This keeps every number on the site explainable.
