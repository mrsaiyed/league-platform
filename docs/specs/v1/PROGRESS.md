# Spec v1 progress

This file is the resume point for work on the v1 specification.

## Where things stand (November 12, 2026)

**Three rounds of the argument are done.** The founder answered the main product decisions, delegated the technical files to the technical lead, answered the remaining real choices, and accepted the list of defaults with changes. [DECISIONS.md](DECISIONS.md) has the outcome: what each round settled, the change log, and the full list of 308 decisions with their statuses.

**Stage 1 can start when the founder says so.** Every decision it depends on is settled ([build order](technical/T10-build-order.md) section 4).

**Waiting on the founder:** the "Needs your answer" section at the top of DECISIONS.md: R-11, R-12, B-13, N-15, N-16, F-10, O-1 and F-2. None of it blocks stage 1.

**Founder tasks outside the spec:** two-step sign-in on the business accounts (T-83); the shared password vault with Saif Ghori (T-166); the school's written permission for Al-Hadi's players (section 2 of the [legal brief](LEGAL-BRIEF.md)); booking the TCSAAL meeting for after Al-Hadi's season.

## How a decision changes

1. Discuss it.
2. Edit the spec file where the decision lives.
3. In DECISIONS.md, update its row in the full list, and for a change add a line to the change log. Move it out of "Needs your answer" if it was there.
4. Fix any other file the change affects. The facts most likely to need this are listed below.

## Who marks what

- **Product and business decisions** (B, U, O, A, C, R, S, N, F): only the founder says yes. Status "Agreed" or "Changed".
- **Technical decisions** (T): delegated to the technical lead on November 12, 2026. Status "Agreed (delegated)" or "Changed (delegated)", with the reason in the change log. The founder can reopen any of them. Technical-file decisions that cost the founder money or time (T-181, T-217, T-219) stay with the founder.

## Files

| File                | Status                                           |
| ------------------- | ------------------------------------------------ |
| README.md           | updated for round one                            |
| product/P1 to P9    | updated for round one                            |
| technical/T1 to T10 | updated for round one, reviewed by the lead      |
| DECISIONS.md        | restructured: needs answer, outcomes, change log |
| LEGAL-BRIEF.md      | new: what to tell and ask the lawyer, accountant |

## Facts that several files rely on (keep them consistent when one changes)

- **Words.** A customer is a **league**. A league has **programs** (a sport plus a group), which have **seasons**, which have **divisions**, **teams**, **players** and **games**. Big leagues also have **clubs** (member schools). There is one kind of site, a league; there are no team sites. Each team has its own page, and a league setting decides whether members start at the league home or their team's page.
- **Name.** The working name is SR Leagues. The address is still written `oursite.com`, because no domain is chosen.
- **Addresses.** `oursite.com/{league}` now, with admin at `/{league}/admin`, the tracker at `/{league}/score/{game}`, the personal area at `/account`, and a member's league page at `/{league}/my`. League subdomains (`farajleague.oursite.com`) are switched on before stage 5 (U-13). Every address is built by one function (T-34).
- **Accounts.** One per person across all leagues. Email and password, or Google; an emailed code proves a new address and resets a forgotten password. Signed in with no time limit; the password is asked again for dangerous actions.
- **Stages.** 0 live stats (done) · 1 foundations · 2 a season end to end, in two parts, with the TCSAAL demo as the milestone after part A · 3 site customization, Faraj's look · 4 registration, accounts, notifications, announcement chats, Faraj's first season · 5 sign-up open to strangers, subdomains, charging, payments · 6 big leagues and own domains.
- **Notifications.** Reminder 24 hours before the game, never between 10:00 pm and 8:00 am league time. Recap ten minutes after the final by default; the league can choose once a day, or off.
- **Money.** No published prices. Quoted per league per season; the price itself is decided later. Nothing is charged before stage 5.
- **Sport.** Basketball only for now, built so that sports can be added.
- **Faraj.** The founder's own league. No target season for the move; Seasons 1 and 2 are transferred whole.
- **Al-Hadi.** A team inside a demo league we own. The demo league is the whole of TCSAAL's varsity boys basketball: every district and team, with full statistics only for the games we scored. Its last listed game is January 13, 2027.
- **People.** Saif Ghori is the trusted second person (T-166). Contact details are not kept in this repository.
- **Stack.** TypeScript, Next.js and React, PostgreSQL on Supabase (with its sign-in, storage and live updates), a worker with its queue in PostgreSQL, Resend, Stripe, Render, Cloudflare.
- **Game rules.** Every rule that differs between leagues is a season setting, set first in setup. The admin can change rules at any time. The tracker follows them, and the scorekeeper can switch the running clock on or off mid-game (S-21, T-128).
- **Admin's choice.** The founder's steady principle: the league is the admin's to run. Schedule format, playoff format, walk-up players, rules and who sees statistics (per team, S-22) are all settings, not our decisions.
- **Faraj test.** A private "Faraj test" league runs a whole test season before the real league moves (F-11). It is stage 4's exit test.
- **Review.** No outside engineer for now. Every change is reviewed by a fresh session that did not write it. Outside reviews are reconsidered before stage 5 (T-181).
- **Decision ID letters.** B business, U addresses and structure, O organizer, A admin, C customization, R registration and accounts, S season and game day, N notifications, F reference leagues, T technical.

## How DECISIONS.md is maintained

By hand. A new decision in a spec file needs a new row in the full list. The first full list was collected by a one-time script, and the round-one answers were applied by another; neither is kept in the repository.
