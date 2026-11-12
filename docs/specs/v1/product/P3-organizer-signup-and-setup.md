# P3 — Organizer sign-up and setup

[Spec home](../README.md) · Decisions O-1 to O-10

This is the path from "I want to host a league" to a live league. The targets: an organizer sees a draft of their own site within **5 minutes**, and can publish within **30 minutes**, without talking to us.

## 1. Starting

The organizer clicks **Start a league** on `oursite.com`. Four short steps follow. Each step saves as it goes, so closing the tab and returning later resumes at the same place. Steps 3 and 4 can be skipped.

### Step 1 — You

- Enter an email address, type the 6-digit code we send to prove it is yours, and choose a password. Or "Continue with Google".
- Enter your name.
- If the email already has an account (they play in another league here), they are simply signed in. No second account is created.

### Step 2 — Your league

| Field       | Notes                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| League name | "Faraj League"                                                                                            |
| Address     | Suggested from the name: `oursite.com/farajleague`. Checked as they type; alternatives offered if taken.  |
| Sport       | Basketball, for now. The field exists so that other sports can be added later (B-6).                      |
| Who plays?  | Adults, under-18s, or both. This sets privacy defaults ([P6](P6-registration-and-accounts.md) section 7). |
| Where       | City. Time zone is filled in from the browser and can be changed.                                         |

### Step 3 — Your look

- Upload a logo (optional). We read its main colors and propose a palette.
- Choose one of a handful of starting designs. Each is a complete, good-looking site.
- A live preview of their home page, with their name, logo and colors, updates as they choose.

### Step 4 — Your first season

| Field                    | Notes                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Season name              | Suggested from today's date: "Fall 2026"                                                                                                                    |
| Rough dates              | Optional                                                                                                                                                    |
| How do teams get formed? | "I already have my teams" · "Players sign up, then I place them on teams" · "Players sign up, then we hold a player draft" · "Captains sign up whole teams" |
| About how many teams?    | Used to pre-size things; changeable                                                                                                                         |

Then: **Create my league.**

## 2. Landing in the admin

They arrive at `oursite.com/{league}/admin`. The league exists **unpublished** (its status is called "draft", which has nothing to do with a player draft): its real address works, but only admins can see it. At the top is a checklist built from their step 4 answer. For "players sign up, then we hold a player draft" it reads:

1. **Set your league's rules** — game format, clock, fouls, standings and tiebreakers. A preset gets this done in a minute. It comes first because brackets, standings and the live tracker all follow from it ([P7](P7-teams-schedule-gameday.md) section 1).
2. **Set up registration** — choose what to ask, then open it.
3. **Add your teams** — names, colors, captains.
4. **Make your site yours** — pages, sections, wording.
5. **Invite your helpers** — other admins and scorekeepers.
6. **Publish** — make the site public and get a link to share.
7. _After registration closes:_ **Run your draft.**
8. _After teams are set:_ **Build your schedule.**

Each item opens the right admin area and ticks itself when done. The checklist is a guide, not a gate; items can be done in any order. Most leagues do not hold a player draft. For any other answer in step 4 the "Run your draft" step is simply absent, and so are the Draft page and menu item ([P7](P7-teams-schedule-gameday.md) section 3).

**O-1 (recommended, reworded November 12; needs the founder's yes): before it is published, the site is never blank.** This is about the unpublished site, not the player draft. Empty sections show a friendly placeholder that only admins see ("Your schedule will appear here once you build it"), so the organizer always sees the shape of the finished site. Sections with nothing in them are hidden from the public after publishing.

**O-2 (agreed): an organizer can fill the unpublished site with sample teams and games in one click, and remove them in one click.** People understand a site far faster when it has content. Sample data can never be published; publishing asks them to remove it first.

## 3. Publishing

**Publish** runs a readiness check and shows two lists.

- **Must fix** (blocks publishing): sample data still present; no contact email for the league; for youth leagues, privacy choices not confirmed.
- **Worth a look** (does not block): no teams yet, no schedule yet, registration not opened, no logo.

After publishing they get: the public link, a QR code to print, a ready-made image for sharing in group chats and social media, and a suggested first message to send.

**O-3 (agreed): publishing the site and opening registration are separate switches.** Many leagues want the site up, with dates and rules, before sign-ups open.

## 4. Bringing an existing league over

Most organizers already have a season under way or years of history.

- **Spreadsheet import** for teams, players and games. They download our template, or paste straight from their own sheet and match the columns. We show what will be created and what looks wrong before anything is saved. An import can be undone as a whole.
- **Past seasons**: final standings, champions and award winners can be entered or imported so history and trophy displays are complete from day one.
- **Hands-on migration** for the first leagues. For Faraj we write a one-time transfer from its existing database ([P9](P9-faraj-and-tcsaal.md)).

**O-4 (agreed): import is part of the first release, not an extra.** A product that only works for brand-new leagues has almost no customers.

## 5. The yearly rhythm

A league's life after setup repeats:

1. **Start a new season** — copies the previous season's settings, registration form and site. The organizer chooses whether teams and rosters carry over or start fresh.
2. **Registration opens**, people join ([P6](P6-registration-and-accounts.md)).
3. **Teams are formed** — placed by hand, drafted, or registered as teams ([P7](P7-teams-schedule-gameday.md)).
4. **Schedule is built and published.**
5. **Games are played and scored**; standings, statistics, reminders and recaps run by themselves.
6. **Playoffs**, champion, awards.
7. **Season is archived.** It stays on the site under the season picker, read-only.

**O-5 (agreed): the admin home always shows "what needs you now"** for the current point in this cycle, not a wall of charts ([P4](P4-admin-dashboard.md) section 2).

## 6. Paying us

- Nothing is charged before stage 5 (B-5), and there are no published plans for now (B-4). Each league carries a record of what was agreed with us: the price, the term, and any limits.
- Fair-use limits (email volume, storage) apply to every league. Reaching one shows a plain message and tells us; it does not cut anything off.
- When a league does pay, it pays through a page hosted by our payment provider. We never see card numbers.

**O-6 (agreed): a limit or a missed payment never interrupts a season in progress.** Games already scheduled can always be scored, and the public site stays up. What is paused is adding more: new teams, new seasons. The organizer gets 14 days of notices before anything is paused.

## 7. Ownership and leaving

- **O-7 (agreed):** a league has exactly one owner. The owner can make as many admins as they like, each with the same access as the owner except for three things only the owner can do: hand over ownership, delete the league, and (once money is collected) change where it is paid out. The owner can hand ownership to another admin, who must accept. Every team also has a captain or coach with their own team tools ([P4](P4-admin-dashboard.md) section 4).
- **O-8:** if an owner disappears (no sign-in for a long period and no response), another admin can ask us to transfer ownership. We verify with the league's contact details and wait 14 days before acting.
- **O-9 (agreed):** an owner can export everything at any time: teams, people, registrations, games, statistics, site content, as spreadsheet files. In plain terms: a league's data is never trapped with us. If they leave, they take all of it.
- **O-10:** an owner can delete the league. It is hidden at once, kept for 30 days in case of regret, then erased. People's accounts are not deleted; only their records in that league are.

## 8. Before self-serve sign-up exists

Until stage 5 of the [build order](../technical/T10-build-order.md), the public **Start a league** button is not live. We create each league ourselves using an internal version of the same four steps. This is deliberate: the first leagues are set up side by side with their organizers so we learn where the steps confuse people before strangers meet them.
