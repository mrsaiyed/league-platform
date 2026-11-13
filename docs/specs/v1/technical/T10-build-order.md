# T10 — Build order

[Spec home](../README.md) · Decisions T-210 to T-219

What gets built in what order, and what each stage has to prove before the next begins. Other files refer to these stage numbers.

## 1. Rules for every stage

- **T-210: each stage ends with a real league really using what was built**, not with a mock-up. The TCSAAL demo in stage 2 follows the same rule: it is Al-Hadi's real season on the real platform.
- **T-211: nothing is built until the decisions it depends on are marked agreed** in [DECISIONS.md](../DECISIONS.md). This holds stage by stage and, since T-212 changed, step by step. Section 4 lists what stage 1 needs. Changed November 13, 2026: the founder, often away, told the lead to answer open product questions itself and bring them for approval later. A decision marked "Decided for you" counts as settled for building, and the founder can change it at any time.
- **T-212 (changed November 12, 2026): work from a later stage is built early whenever it does not have to wait.** The founder asked for everything that can be built at the same time to be built at the same time, on every stage. A later-stage step may be opened as soon as the steps it needs are finished and its decisions are agreed (T-211). Three things do not move. The earliest unfinished stage gets builders first. Each stage's exit test is still run in order, with real people (T-210). And nothing reaches `main`, a release, a real service or real people before the founder has checked the stage it belongs to. The old rule, "nothing from a later stage is built early", guarded against building a great deal on foundations that later prove wrong on the real services. That risk is real and is now carried another way: the foundations are checked against the real services as early as the founder can open the accounts, and until then every outside service sits behind an interface (decision record 011).
- **T-213: the Al-Hadi tracker keeps running as it is until stage 2 has passed its exit test** (T-16).

Durations are my rough estimates for the founder working steadily with AI assistance. They are for comparing stages and planning around the demo date, not commitments.

**How fast it actually goes.** Since November 12 the building is done by unattended AI runs with several builders working at once ([runbook](../../../build/RUNBOOK.md)), so as working time the week counts below are far too long: on the first day, eleven of stage 1's steps were built, reviewed and committed in about nine hours, with one builder at a time. Two things set the pace now, and neither is the number of builders. The first is the usage allowance of the founder's Claude plan: more builders finish sooner by the clock and use the allowance up sooner. The second is the part of every exit test that needs real people, real devices, vendor accounts or a lawyer, which no number of builders can hurry. The week counts are kept as a measure of how big the stages are compared with each other.

## 2. The stages

### Stage 0 — Live stats for one team · done

The tracker, live game pages, schedule and season totals for Al-Hadi varsity, with its tests.

### Stage 1 — Foundations · about 3 to 4 weeks

**Goal:** the skeleton everything else hangs on, proven with two made-up leagues.

- The repository reorganized as in [T2](T2-repo-and-code-structure.md); `CLAUDE.md`; all automatic checks from [T9](T9-quality-and-maintainability.md) section 3 running.
- Database tables for accounts, profiles, leagues, programs, seasons, roles, invitations, activity log; row-level security; the two-league test harness ([T4](T4-tenancy-auth-security.md)).
- Sign-in by email and password and by Google, with the emailed code for proving an address and for a forgotten password; staying signed in; sign out everywhere.
- Leagues created by an internal tool; `/{league}` addresses with blocked names; draft and live states. One address builder and one place that works out the league (T-34).
- Roles and invitations; the admin shell with its navigation and empty areas.
- Design values producing a themed public shell: header, menu, footer, placeholder pages.
- The worker and queue, with one real job: sending the invitation email.
- Local, preview, staging and production environments; error reporting; uptime checks; continuous backup; release and reverse-release.

**Exit test:** two made-up leagues live at two addresses with visibly different designs. A person signs in, closes the browser, returns and is still signed in. An admin of the first is refused everywhere in the second. An invitation email arrives and works. A release is shipped and then reversed. A fresh review session that did not write the code has reviewed the foundations, and its findings are closed (T-181).

### Stage 2 — A season from start to finish · about 6 to 8 weeks, in two parts

**Goal:** a league can run a season. The TCSAAL demo is ready partway through.

**Part A, the demo cut · about 4 to 5 weeks.** What the demo needs comes first.

- Programs (hidden when single), seasons, divisions, venues.
- People and teams added by hand; rosters and jersey numbers.
- Fixtures entered by hand or imported from a spreadsheet; the hand-editing grid; publish.
- Games in two recording modes: live tracking and final score only. The tracker and live game page rebuilt inside the web app with the same behavior; accounts and the scorekeeper role in place of the passcode; one scorer at a time with takeover; offline as an installable app; live updates through the push service ([T6](T6-live-stats-and-realtime.md)).
- Standings with tiebreakers, statistics, corrections with reasons, forfeits. Each team's choice of who sees its players' numbers: everyone, or staff only (S-22).
- Standard public pages with fixed layouts: home, schedule, standings, teams and each team's page, stats, game. The "start page for members" setting (U-5).
- The transfer of Al-Hadi's recorded games from the current tracker (F-7).

**Milestone: the TCSAAL demo** (F-4, F-6). The demo league exists on the platform with every TCSAAL varsity boys team and its results, and Al-Hadi's real season in full, Al-Hadi's staff have accounts and roles, and a full rehearsal game has been scored on real devices, including the bad-Wi-Fi test (T-123).

**Part B · about 2 to 3 weeks.** The rest of a season.

- The schedule generator with its fairness report.
- Import of people and teams with preview and undo.
- The third recording mode, box score entered afterwards.
- League game rules in the tracker: the clock mode with its mid-game switch, stopping on fouls, the mercy rule, the personal foul limit (S-21, T-128).
- Saving a game to a file and uploading it from another device (T-129).
- A league setting for whether players can be added at the scorer's table (S-6).
- The bin and the activity log screens.
- The transfer of Faraj's whole history into an unpublished league.

**Timing.** Today is November 12, 2026, and Al-Hadi's last listed game is January 13, 2027. Stage 1 plus part A is seven to nine weeks by these estimates, with the holidays in the middle, so the demo is ready around mid-January at the earliest and probably later. The code can be ready much sooner than that if the allowance allows (see "How fast it actually goes"); the rehearsal on real devices and the school's permission cannot be skipped. The founder should still book the TCSAAL meeting for after the season, not for the last game. If part A is late, the real season is still safe in the current tracker (T-213) and is shown from there.

**Exit test:** the demo milestone above has been met and a real game has been scored on the platform. Faraj's whole history is transferred into an unpublished league and every team record and player total matches the current site.

### Stage 3 — Make it theirs · about 5 to 7 weeks

**Goal:** an admin can shape the site. Faraj's site is rebuilt without special code.

- Edit site: sections, design, menu, in-place text, phone and laptop preview, draft, publish, history and restore ([T5](T5-customization-engine.md)).
- The section catalog of [P5](../product/P5-site-customization.md) section 4.
- Optional features: awards with the trophy display including Faraj's 3D trophy (C-5), draft, sponsors for the league, a division or a team, media, news.
- The league's own wording; season picker; right-to-left text.
- Playoff brackets: single elimination, and custom brackets laid out by hand (S-4).

**Exit test:** every row of the Faraj table (F-1) is demonstrated. The founder reviews old and new Faraj side by side and signs off (C-7). A second made-up league uses the same features with a completely different look.

### Stage 4 — People · about 4 to 6 weeks

**Goal:** the centre of the vision. People register, get accounts, and hear from their league.

- First, because it needs the least and serves Al-Hadi's parents at once: **follow a team**, the inbox, and **game-day reminders and recaps** by email, with preferences ([P8](../product/P8-notifications.md), [T7](T7-notifications-and-jobs.md)).
- Registration: form builder, agreements, individual and team sign-up, approval, capacity and waitlist ([P6](../product/P6-registration-and-accounts.md)).
- Claiming a hand-added profile; duplicate detection and merging.
- Guardians and children; the privacy rules for youth leagues.
- `/{league}/my`; calendar links; captain and coach tools. Statistics that only league members, or only a team, can see (S-22).
- Schedule-change notices, announcements with audiences, announcement chats (N-15, step 1), "copy for group chat", delivery history.

**Exit test:** a whole test season is run in the "Faraj test" league (F-11), from registration through draft, schedule and scored games, with reminders and recaps reaching the people taking part. The real Faraj League then moves at its next gap between seasons (F-2), and `farajleague.org` forwards to the new site.

### Stage 5 — Open the doors · about 5 to 7 weeks

**Goal:** a stranger can start a league without us, and money can change hands.

- The public four-step sign-up, the setup checklist, sample data, the readiness check ([P3](../product/P3-organizer-signup-and-setup.md)).
- Our own front page, league search, help articles, status page, support address. Whether a starting price is published is decided before this stage (B-4).
- League subdomains switched on, with the old path addresses forwarding (U-13).
- Charging leagues what was agreed, by invoice; fair-use limits.
- Leagues' registration fees paid to their own accounts; refunds; "paid in person". Sponsor packages paid through a league's site, if B-13 is agreed.
- A second sign-in step required for owners of leagues that collect money.
- Terms and privacy policy from a lawyer (B-9, B-10); the accountant's review (B-11).
- The decision on outside reviews of the code and of security (T-181, T4 section 12).

**Exit test:** five organizers we have never coached each create and publish a league in under 30 minutes while we watch silently. A paid registration and a refund complete correctly with real money.

### Stage 6 — Big leagues · about 8 to 12 weeks

**Goal:** an association can run on the platform.

- Several programs under one league, with the program level visible in addresses and admin.
- Clubs, club admins, roles limited to a program.
- Bulk tools; result confirmation and disputes between two schools; brackets fed from several divisions.
- A league's own domain name (U-2).
- The four load scenarios passed at association size ([T8](T8-scale-reliability-operations.md) section 9).

**Exit test:** a made-up association of size B passes all four load scenarios. A person playing the part of a school athletic director completes their whole season flow unaided.

### After stage 6, in rough order of value

Fuller basketball statistics (S-17) · phone push notifications (N-14) · open chats where everyone can talk (N-15, step 2) · a league's own trophy (C-5) · live tracking for a second sport · written game recaps (N-6) · captains drafting from their phones (S-13) · double elimination, best-of series and pool play (S-4) · more languages.

## 3. Two choices about the order

**T-214 (agreed, delegated): stage 3 before stage 4**, because Faraj cannot move until its site can be rebuilt, and the Faraj test season (F-11) is stage 4's exit test. F-3 sets no target season, so no swap is planned: if Season 3's registration opens before stage 3 is finished, Season 3 stays on the current Faraj site and is transferred afterwards.

**T-215 (agreed, delegated): fuller basketball statistics can be pulled forward into stage 2** if Al-Hadi's coaches want rebounds and assists this season. It is self-contained (T-124) and adds about a week.

## 4. What stage 1 needed, and where it stands

Stage 1 builds foundations, so it depends on the decisions that are hardest to change later:

- How leagues are addressed and structured: U-1, U-3, U-5, U-6, U-7, U-11.
- Accounts and sign-in: R-2, R-5, R-9.
- No per-customer code: B-3.
- The stack: T-1 to T-12.
- The code structure: T-20 to T-28, T-34.
- Data conventions: T-40 to T-47.
- The league fence and sessions: T-60 to T-71, T-85.

**All of these were settled on November 12, 2026**: the product ones by the founder, the technical ones by delegation ([DECISIONS.md](../DECISIONS.md)). Stage 1 can start when the founder says so. Everything still unanswered can be argued while stage 1 is being built.

## 5. Decisions still open in this file

**T-216** the hosting vendor between equivalents (T-9), by price when stage 1 starts; this is the technical lead's call. **T-217** is closed: there is no outside engineer for now (T-181). **T-218** is closed: F-3 sets no target Faraj season. **T-219** (agreed November 12): the founder recruits two or three more small leagues during stage 4, so that stage 5 opens with more than two real customers.
