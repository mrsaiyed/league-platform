# League platform specification v1

**Started November 10, 2026 · first round of decisions settled November 12, 2026 · working name: SR Leagues**

## The vision this answers

In the founder's words (November 10, 2026):

> Someone wants to host a league of any size. They sign up through us where they get a full end-to-end league management platform with maximum admin customizability: schedule building, live stats, all that. They put their league live. People register through the league (or the admin adds people manually if he prefers). Through each registration an account is built, and when that person visits the site again it should keep them logged in. They'll get a notification in the site and to email with game-day reminders and game-day recaps.
>
> Say Faraj League signs up with us. It's a smaller rec league with only 6 teams. They have a lot of customizations, like the trophy display on their page, but everything else we should be able to have them set up through admin to look exactly as it currently is and behave as it currently is.
>
> The harder question: when multiple leagues join, then what? Ideal seems to be Faraj League has a URL like oursite.com/farajleague, and TCSAAL, which is much larger, is still under oursite.com/tcsaal, so they each get their own home. oursite.com can just be navigation to your league.

## The product in one paragraph

A person who runs a league signs up on our site and gets two things at one address: a public website for their league and a private admin area to run it. From the admin area they set up teams, build the schedule, open registration, score games live, and change how their site looks and what it shows. Players and parents register on the league's site, which gives them an account that stays signed in. The platform reminds them of games and sends them a recap afterwards. Every league runs on the same software; what differs between leagues is settings, never code.

## How this is organised

There are two halves. Read the product half first; the technical half exists to deliver it.

**Product (how everything works for people)**

| File                                                                       | What it settles                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [P1 Business](product/P1-business.md)                                      | Who buys, what they pay, what we do and do not do                   |
| [P2 Leagues and URLs](product/P2-leagues-and-urls.md)                      | What happens when many leagues join; every address on the site      |
| [P3 Organizer sign-up and setup](product/P3-organizer-signup-and-setup.md) | From "I want to host a league" to a live league                     |
| [P4 Admin dashboard](product/P4-admin-dashboard.md)                        | Every area of the admin and who can use it                          |
| [P5 Site customization](product/P5-site-customization.md)                  | What an admin can change about the site, and what they cannot       |
| [P6 Registration and accounts](product/P6-registration-and-accounts.md)    | How people join, get an account and stay signed in                  |
| [P7 Teams, schedule and game day](product/P7-teams-schedule-gameday.md)    | Teams, drafts, the schedule builder, scoring, standings, stats      |
| [P8 Notifications](product/P8-notifications.md)                            | Reminders, recaps and everything else we send                       |
| [P9 Faraj and TCSAAL](product/P9-faraj-and-tcsaal.md)                      | Faraj, TCSAAL and the Al-Hadi demo league walked through end to end |

**Technical (how it is built)**

| File                                                                                 | What it settles                                               |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| [T1 Stack and architecture](technical/T1-stack-and-architecture.md)                  | Languages, frameworks, database, hosting, and why             |
| [T2 Repository and code structure](technical/T2-repo-and-code-structure.md)          | Folders, where each kind of code goes, the rules between them |
| [T3 Data model](technical/T3-data-model.md)                                          | Every table and how they relate                               |
| [T4 Tenancy, sign-in and security](technical/T4-tenancy-auth-security.md)            | Keeping leagues apart, accounts, roles, privacy               |
| [T5 Customization engine](technical/T5-customization-engine.md)                      | How themes, pages, blocks and modules work underneath         |
| [T6 Live stats and realtime](technical/T6-live-stats-and-realtime.md)                | The tracker, offline play, live pages for many viewers        |
| [T7 Notifications and jobs](technical/T7-notifications-and-jobs.md)                  | Scheduled and background work, email delivery                 |
| [T8 Scale, reliability and operations](technical/T8-scale-reliability-operations.md) | Load targets, caching, backups, monitoring, cost              |
| [T9 Quality and maintainability](technical/T9-quality-and-maintainability.md)        | Testing, code rules, releases, how the code stays healthy     |
| [T10 Build order](technical/T10-build-order.md)                                      | What gets built first and what each stage proves              |

**[DECISIONS.md](DECISIONS.md)** lists every decision in one place with its status. That is the list we argue over. **[LEGAL-BRIEF.md](LEGAL-BRIEF.md)** is what to tell and ask the lawyer and the accountant.

## How we argue

Every choice that could reasonably go another way has an ID (for example **U-1**) and a status.

- **Recommended** means I, as business and technical lead, have picked an answer and given the reason. This is where everything starts.
- **Agreed** means the founder has said yes. Only agreed decisions get built.
- **Changed** means we argued and the answer moved. The file is edited and the old answer is noted in DECISIONS.md.
- **Agreed (delegated)** applies to the technical decisions. On November 12 the founder handed their approval to the technical lead, who reviewed them and recorded the review in DECISIONS.md. The founder can reopen any of them.

To disagree, name the ID and say what you want instead. If something you care about has no ID, that is a gap in the spec; say so and it gets one.

Two honesty rules apply throughout. Where a number is my estimate and not a measured fact (prices, sizes of other leagues, traffic), it is marked as an estimate. Where something needs a lawyer or an accountant and not an engineer (children's data, payment terms), it is marked as needing that review.

## What this replaces

The earlier [v0.7 platform specification](../../product/platform/README.md) described the same product in requirement language and left most choices open. Its engineering package goes deeper than this one on some internals (exact table columns, transaction protocols). v1 keeps what was sound there and decides what was left open. Where the two disagree, v1 wins once agreed, and v0.7 stays as reference material.

The Al-Hadi live stat tracker in `apps/live-stats` is working software. It becomes the game-day part of this product ([T6](technical/T6-live-stats-and-realtime.md)); it is not thrown away.
