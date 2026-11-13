# P2 — Leagues and URLs: what happens when many leagues join

[Spec home](../README.md) · Decisions U-1 to U-13

## 1. The short answer

Your instinct is right, it is what I recommended, and it was agreed on November 12.

**U-1 (agreed): every league lives at `oursite.com/{league}`.** Faraj League is `oursite.com/farajleague`. TCSAAL is `oursite.com/tcsaal`. Each is a complete home: its own look, its own menu, its own pages, its own admin. `oursite.com` on its own is our front door: what the product is, find your league, sign in, start a league.

All leagues run on one copy of the software and one database. A league is a set of rows marked with that league's ID, not a separate installation. Adding the thousandth league is the same as adding the second: a new row and a new address. How the leagues are kept apart underneath is in [T4](../technical/T4-tenancy-auth-security.md).

## 2. Why an address path and not `farajleague.oursite.com`

| Question                                     | `oursite.com/farajleague` (now)                         | `farajleague.oursite.com` (later, U-13)                                                           |
| -------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Does a person stay signed in across leagues? | Yes, automatically. One site, one sign-in.              | Yes, by sharing the sign-in across every `*.oursite.com` address. A little extra setup.           |
| A parent with kids in two leagues            | One inbox, one account page, no re-login                | The same, once the sign-in is shared                                                              |
| Setup for a new league                       | Instant                                                 | Instant, after a one-time setup of wildcard addresses and certificates                            |
| Previewing and testing every change          | Simple                                                  | Awkward: preview copies cannot have league subdomains, so both forms must be supported and tested |
| Search engines                               | Every league strengthens one site                       | Each league starts from nothing                                                                   |
| Feels like the league's own site             | Good                                                    | Better                                                                                            |
| Safety between leagues                       | We must never let an admin add their own code to a page | A partial wall between leagues, weakened by the shared sign-in                                    |

The one real cost of the path approach is the last row. Because every league shares one web address, a script on one league's page could reach another league's visitors. So **no admin can paste in their own HTML or JavaScript**. They build pages from our blocks, and embeds are limited to a list we control (YouTube, Instagram and similar). We would have set that rule anyway for maintainability (B-3).

**U-13 (later; the founder's preference, recorded November 12): `farajleague.oursite.com` becomes the standard address before sign-up opens to strangers.** The founder prefers the subdomain form because it makes the site feel like the league's own, and said: if it delays things, do it later. It does delay things, modestly: about a week of extra work in stage 1, plus a second form of every address for each preview and test to get wrong, at the moment we are trying to reach the TCSAAL demo. So paths come first. Three things keep "later" cheap:

- From stage 1, every address is produced by one function and the league is worked out from the request in one place (T-34). Switching is a setting, not a rewrite.
- When it is switched on, every old path address forwards permanently to the new one, so shared links and printed QR codes keep working.
- It is switched on before stage 5, so the only leagues that ever move are our own (Faraj and the demo).

**U-2 (agreed): a league can later attach its own domain as a paid add-on.** `farajleague.org` would then show the same site. This comes after the core product ([T10](../technical/T10-build-order.md) stage 6) because signing in on a separate domain needs a careful hand-off. Until then, an existing domain simply forwards: `farajleague.org` sends visitors to `oursite.com/farajleague`.

## 3. What is inside a league

The same five words describe a 6-team rec league and a state association. Small leagues never see the levels they do not need.

| Word         | Meaning                                                        | Faraj League                 | TCSAAL                                                  | The demo league (Al-Hadi's)           |
| ------------ | -------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------- | ------------------------------------- |
| **League**   | The customer. One site, one admin, one address.                | Faraj League                 | TCSAAL                                                  | A league we own, laid out like TCSAAL |
| **Program**  | One sport for one group, run again each year                   | Basketball (the only one)    | Varsity Boys Basketball, JV Girls Volleyball, and so on | Varsity Boys Basketball               |
| **Season**   | One running of a program                                       | Fall 2026                    | 2026–27                                                 | 2026–27                               |
| **Division** | A group of teams inside a season that share standings          | Mecca and Medina conferences | Districts and regions                                   | TCSAAL's districts                    |
| **Team**     | A roster in a season                                           | 6 teams                      | Hundreds                                                | Every TCSAAL team                     |
| **Club**     | Optional. An organization that owns teams in several programs. | Not used                     | Each member school                                      | Not used                              |

**U-3 (agreed): a league with one program never sees the word "program".** Faraj's admin shows seasons and teams directly. The level appears only when the organizer adds a second program.

**U-4 (agreed): the words are the league's to rename.** Faraj calls divisions "conferences" and rounds "weeks". TCSAAL says "districts". Each league picks its own labels for division, round, team leader (captain or coach) and club (school). Our internal words stay fixed.

**U-5 (agreed, changed November 12): there is one kind of site, a league. A team's home inside it is its team page, and the league chooses what people see first.**

- Every team has a full page of its own: roster, schedule, results, statistics, its sponsors if the league allows them, and a Follow button.
- A league setting, **Start page for members**, has two choices. "League home" is the default and is what Faraj wants. "My team's page" suits a very large league where most visitors care about one team.
- With "my team's page" on, a signed-in member lands on their team. A visitor who has not signed in can pick "my team" once and that device remembers it; no account is needed (R-10). A link to the league home is always one tap away.
- There is no separate "team site" product. Al-Hadi is a team inside a demo league that we own ([P9](P9-faraj-and-tcsaal.md) section 3).

## 4. Every address

`{league}` is the league's short name. `{program}` appears only in leagues with more than one program.

**Our own pages**

| Address                                              | What it is                                                                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/`                                                  | Signed out: what the product is, a search box to find a league, "Start a league". Signed in: your leagues first. |
| `/find`                                              | Search leagues by name, sport and place. Only leagues that chose to be listed.                                   |
| `/start`                                             | Start a league ([P3](P3-organizer-signup-and-setup.md))                                                          |
| `/signin`                                            | Sign in or create an account                                                                                     |
| `/account`                                           | Your profile, your children's profiles, notification settings, the leagues you belong to                         |
| `/account/inbox`                                     | Every notification across all your leagues                                                                       |
| `/help`, `/contact`, `/terms`, `/privacy`, `/status` | What they say                                                                                                    |

**A league's public site**

| Address                                             | What it is                                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| `/{league}`                                         | League home                                                                   |
| `/{league}/schedule`                                | Schedule and results                                                          |
| `/{league}/standings`                               | Standings by division                                                         |
| `/{league}/teams` and `/teams/{team}`               | All teams; one team's own page with roster, schedule, results and stats (U-5) |
| `/{league}/players/{player}`                        | A player's page, if the league shows player pages                             |
| `/{league}/stats`                                   | Leaders and full statistics                                                   |
| `/{league}/games/{game}`                            | One game: live scoreboard and play-by-play while it is on, box score after    |
| `/{league}/register`                                | Registration                                                                  |
| `/{league}/my`                                      | Signed-in only: my team, my next game, my stats, my registrations here        |
| `/{league}/news` and `/news/{post}`                 | Announcements                                                                 |
| `/{league}/awards`, `/draft`, `/media`, `/sponsors` | Optional features, present only when switched on                              |
| `/{league}/{page}`                                  | Any page the admin created (About, Rules, and so on)                          |
| `/{league}/clubs/{club}`                            | A member school's page, in leagues that use clubs                             |

In a league with several programs, the sports pages move one level down: `/tcsaal/varsity-boys-basketball/schedule`. League-wide pages (home, news, register, clubs, custom pages) stay at the top.

A past season is the same address with `?season=fall-2025`. Without it, you get the current season. A season picker on the page switches between them, as Faraj's site does today.

**Private areas**

| Address                       | What it is                                             |
| ----------------------------- | ------------------------------------------------------ |
| `/{league}/admin`             | The admin dashboard ([P4](P4-admin-dashboard.md))      |
| `/{league}/admin/...`         | Each admin area                                        |
| `/{league}/score/{game}`      | The courtside tracker for one game                     |
| `/{league}/invitation/{link}` | Accepting an invitation: the link in its email (T-226) |

**U-6 (agreed): the address shows where you are asking to go; it never proves you are allowed.** Typing `/farajleague/admin` when you are not a Faraj admin shows "you do not have access", whoever you are.

## 5. Short names

**U-7 (agreed) rules for the `{league}` name:**

- 3 to 40 characters: lowercase letters, numbers and hyphens.
- First come, first served. We keep a blocked list of our own words (`account`, `admin`, `api`, `find`, `help`, `pricing`, `signin`, `start`, `status`, `terms`, `privacy` and a few dozen more) and of obviously offensive words.
- An organizer can change it. The old address forwards to the new one for 12 months and is not given to anyone else during that time.
- We can take back a name that impersonates another organization. This is in the terms.

Inside a league, a program or custom page cannot use a name the site already uses (`schedule`, `teams`, `admin` and so on). The admin is told at the moment they type it.

## 6. What a league's site looks like from our side

**U-8 (agreed, changed November 12): the league's brand leads, and ours is always there, small.**

- The header is the league's logo and menu. There is no platform bar across the top.
- We add two small things to every page of every league: the account button at the top right (your picture, with a bell for notifications, or "Sign in"), and a "Powered by SR Leagues" mark in the footer that links to our front page.
- The same mark is in the footer of every email and on the tracker's opening screen. No league can remove it.
- A league shows its own sponsors, and can let its teams show theirs on team pages (B-13).

**U-9 (agreed): a league is not visible until its organizer publishes it.** States are: **draft** (only admins can see it), **live**, **archived** (read-only, still viewable), and **suspended** (taken down by us for abuse or non-payment, with notice; data is kept and exportable). We never delete a league's history because a payment failed.

**U-10 (agreed): being listed in `/find` is the league's choice**, on by default for adult leagues and off by default for youth leagues. Any league can also ask search engines not to index it.

## 7. One person, many leagues

**U-11 (agreed): a person has one account for the whole site.** The account is theirs, not the league's. Joining a league adds a membership in that league to the same account. This is what makes "stay signed in" and "one inbox" work, and it is why a player who joins a second league does not fill in their name again.

What each side controls:

- The **person** controls their sign-in, their email address, their notification choices, and whether to leave a league.
- The **league** controls the person's record inside that league: team, jersey number, registration answers, statistics, and what the league shows publicly. A league cannot see what other leagues the person is in.

A person can hold different roles in different leagues: organizer of one, player in a second, parent in a third. The front page and the account button list them all, so `oursite.com` really is "navigation to your league".

## 8. How leagues are kept apart

In plain terms; the mechanics are in [T4](../technical/T4-tenancy-auth-security.md).

- An admin of one league can see and change nothing in any other league.
- A league's registration answers, contact details and payments are visible only to that league's admins and to the person they belong to.
- Statistics and history belong to the league where they were recorded.
- Our own staff can open a league's admin only by recording a reason, and the league's owner can see that log.
- We test this on every change by running two pretend leagues side by side and proving neither can reach the other.

## 9. What a big league gets that a small one does not

Same site, same address pattern, more levels switched on:

- Several programs, each with its own seasons, divisions and admins.
- Clubs: a school's athletic director is given power over that school's teams only. They enter rosters and see their own registrations; they cannot touch another school or the league's schedule.
- Admin roles that can be limited to one program ("volleyball commissioner").
- Bulk tools: import teams, rosters and schedules from a spreadsheet; change many games at once.
- Standings across districts and brackets that feed regional and state rounds.

**U-12 (agreed): none of the big-league levels are built in the first release, but the data and the addresses already have room for them.** That is the meaning of "nothing we build blocks the association" in B-1. Concretely: programs and clubs exist in the database from the start, with one hidden default program per league, so adding them later changes screens, not foundations.
