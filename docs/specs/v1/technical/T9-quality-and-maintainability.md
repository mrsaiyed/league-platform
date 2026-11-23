# T9 — Quality and maintainability

[Spec home](../README.md) · Decisions T-180 to T-201

This product will be built and kept running by a very small team, with much of the code written by AI assistants, for leagues that depend on it every weekend. That only works if correctness is checked by machines on every change and if the codebase stays one thing that is easy to reason about. This file sets the rules for both.

## 1. Where confidence comes from

**T-180 (agreed, delegated): confidence comes from automatic tests, a preview of every change, and small changes. It does not depend on the founder reading code.** The founder's review is of behavior: open the preview, try the thing, read the plain-language summary. Everything else is the checks below. This is stated outright because the founder is not an engineer and should not be the last line of defence for code correctness.

**T-181 (changed November 12): no outside engineer for now; every change is reviewed by a session that did not write it.** The founder's decision is that the technical lead reviews its own work, and that an outside review can be reconsidered when we get there. An author is the worst reviewer of their own code, because they repeat their own assumptions. So the review is done by a separate AI session that starts fresh, has not seen how the code was written, and is asked only to find faults: once on every change, and once across the whole foundation at the end of stage 1. Its findings are fixed or answered in writing before the change is merged. This is weaker than a second experienced person, and I say so plainly. The question of paying for outside eyes, on the code and on security, comes back before stage 5, when strangers' data and money arrive. My advice then will be yes.

## 2. Kinds of test

| Kind               | What it checks                                                                                                                      | Speed         | Where               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------- |
| **Rule tests**     | Pure logic: the basketball engine, standings and tiebreakers, the schedule generator, permission rules, who receives a notification | Milliseconds  | Beside the code     |
| **Database tests** | Commands and queries against a real PostgreSQL, including its constraints and row-level security                                    | Seconds       | `tests/integration` |
| **Browser tests**  | Whole journeys in a real browser                                                                                                    | Minutes       | `tests/browser`     |
| **Load tests**     | The scenarios in [T8](T8-scale-reliability-operations.md) section 9                                                                 | Run on demand | `tests/load`        |

**T-182: rules with many possible inputs are also tested with generated inputs.** For the engine: any sequence of taps followed by undoing all of them returns to the start; a team's score always equals the sum of its players' points. For the schedule generator: for any valid set of teams and slots, no team is in two places at once and every team gets the right number of games. These catch the cases nobody thought to write down.

### The journeys that must always pass in a real browser

1. An organizer signs up, completes the four steps, adds teams, publishes, and the public site shows them.
2. A player registers, gets an account, closes the browser, returns, and is still signed in.
3. An admin adds a person by hand; the person claims the profile; their statistics are still attached.
4. A schedule is generated, adjusted, published, then changed; the affected people have a notification.
5. A full game is scored; a viewer's page follows it; the game ends; standings change; the recap is captured.
6. A scorekeeper loses connection mid-game, keeps scoring, reconnects; nothing is lost (T-123).
7. An admin edits the site, publishes, then restores the previous version.
8. A second league's admin tries each of the above against the first league and is refused.
9. Faraj's pages match the versions the founder signed off (T-103).

## 3. Checks on every proposed change

A change cannot be merged unless all of these pass. They run automatically.

- Formatting and code style.
- Structure rules: imports only in allowed directions (T-21); no league named in code (T-27); no SQL outside `packages/database`; no secrets in browser code (T-30); steps of the worker's jobs that are not commands are named only by the worker (T-226, record 014).
- Type checking in strict mode.
- Rule tests and database tests, including the two-league harness (T-65) and the role-by-command matrix.
- **T-292: database tests on a real PostgreSQL**, beside those on the in-process one: a throw-away server made on the computer from the programs it already has, this computer only, encrypted, with the roles of a hosted database (`npm run test:real-postgres`, [record 092](../../../architecture/decisions/092-a-real-postgresql-for-tests.md)). It fails, never skips, where no PostgreSQL is found. Run on the builder's computer until GitHub's machines have run it; then it joins these checks (step 2.99).
- The public-field scan (T-81).
- A build of the web app and worker.
- The browser journeys (a fast subset on each change; all of them before release).
- Speed and size budgets (T-161).
- Known-vulnerability scan of dependencies; scan for accidentally committed secrets.
- **T-183: migration safety**: a migration that drops or renames something in one step is rejected (T-49).

## 4. What "done" means for a feature

**T-184:** a feature is done when:

1. The decisions it rests on are marked **agreed** in [DECISIONS.md](../DECISIONS.md).
2. Its commands, permission rules and tests exist, and the automatic checks pass.
3. Every screen handles: nothing here yet, loading, an error, no permission, and (where relevant) offline.
4. It works at phone width and by keyboard alone.
5. Admin actions it adds appear in the activity log.
6. It has its help text.
7. If it involved a real trade-off, a short decision record is written.
8. If it changed behavior described in this spec, the spec is updated in the same change.

**T-185: the spec stays true.** These files are the description of the product. A change that makes them wrong fixes them at the same time, or it is not finished.

## 5. Decision records

Technical choices that are not obvious are written as a page each in `docs/architecture/decisions/`: what was decided, what else was considered, and what would make us revisit it. The repository already has five. The choices in T1 become records when stage 1 starts.

## 6. Accessibility

- **T-186: the target is the WCAG 2.2 AA standard** for both league sites and the admin.
- Automatic accessibility checks run inside the browser tests on every major screen.
- Every page has its title from its first bytes, so a browser or screen reader never meets it untitled (T-275, T8 section 8); the browser tests read the raw HTML for it.
- Each major screen also gets a manual pass by keyboard and with a screen reader before release.
- League designs are checked for contrast when saved (T5 section 1).
- The tracker has large touch targets and does not rely on color alone (bonus and foul trouble are also shown as text).

## 7. Languages and places

- **T-187: English only at launch, but all interface text lives in message files from day one**, never inside components. Adding a language later is then translation work, not a rewrite.
- **T-188:** league content can be in any language and script, including right-to-left (Faraj's Arabic).
- Dates and times are shown in the league's time zone and a clear format; viewers in another zone see the league's time with the zone named.
- **T-189:** one currency per league, set when it connects payments.

## 8. Devices and browsers

- The two most recent versions of Chrome, Safari, Edge and Firefox; Safari on iPhones and iPads from the last five years; Chrome on Android from the last five years.
- **T-190:** the tracker is tested on real hardware before each stage is called done: an iPad, an Android tablet, an iPhone and an Android phone.

## 9. Dependencies

- **T-191: few and mainstream.** Each new dependency needs a reason written in the change that adds it.
- Versions are pinned. Updates are proposed automatically each week and merged when checks pass.
- **T-283:** a pinned release that an advisory names as vulnerable is left at once for the newest patch release of its line, without the usual two-week wait, changed by hand with the lockfile made again, never by a framework's own upgrade command or by what a tool's output suggests ([record 079](../../../architecture/decisions/079-next-js-off-a-release-with-a-known-hole.md)).
- Major versions of the framework are adopted within about six months of release, so we are never stranded on something unsupported.

## 10. Keeping the code healthy

- **T-192:** roughly a fifth of each stage is kept for tidying what the stage revealed.
- **T-193:** a shared abstraction is created the third time something is needed, not the first. Two similar pieces of code are fine.
- A short list of known shortcuts lives in `docs/` with why each was taken and what would trigger fixing it.
- **T-194:** code that is no longer used is deleted, not left "in case". Git remembers it.

## 11. Made-up leagues for testing

**T-195:** three seed leagues are maintained and used by tests, previews and demos:

- a Faraj-like league (6 teams, two divisions, draft, awards, sponsors, several past seasons);
- a demo league like Al-Hadi's: one team tracked live, the other games with final scores only;
- an association of size B, generated by script (T-162).

None contains real people.

_Stage 1 (step 1.21):_ stage 1 seeds two simple made-up leagues (`npm run seed`, data in `packages/database/src/seed/`): different designs, an owner, an admin and other members, one season, divisions, teams and people. The Faraj-like league, the Al-Hadi-like demo league and the generated association above come in later stages, as further entries of the same seed data. Until the design editor exists, a seed league's design is kept in the seed data, not in the database (T-185).

_Stage 2 (step 2.59):_ `npm run seed` loads three leagues. The two of stage 1 have their season under way: divisions, venues, teams, rosters, a published schedule, final scores and one game scored live through the tracker. The third is the demo-like league above, made up and shaped like a large association (not a copy of one): one program, a past 2025–26 season of ten weeks, four districts, 24 teams with results played from each school's strength, every game final, loaded through the product's own fixture import from `supabase/seed/demo-league/fixtures.csv` (which doubles as the template for real results) and put into weeks with the schedule builder's commands, and one team's games scored live, brought in by the tracker transfer from a made-up backup; every other team's players' statistics are for staff only. Only the tracked team and the five it played list players. This is what the league does not yet show as a real association's demo must: the five schools the tracked school played have their players listed on their own team pages, because the tracker's games name them; steps 2.219 (whether a roster is public) and 2.233 (the transfer brings the other side in as its team's totals) must land before a real association's league is loaded. The load reads no clock, so it is the same on any day. The web app's made-up database holds it when asked (`LOCAL_DEMO_LEAGUE=on`), since it adds seconds to every start. The Faraj-like league and the generated association are still to come.

## 12. What every command records

**T-196:** each command logs its name, league, acting account, how long it took and whether it succeeded, tagged with an ID shared by everything in the same request. When something goes wrong at 8 pm on a Sunday, the question "what happened to this game?" has an answer.

## 13. Working with AI assistants

- **T-197:** a `CLAUDE.md` file at the top of the repository states the rules of [T2](T2-repo-and-code-structure.md) and points here, so every AI session starts from the same structure and conventions. It is written in stage 1.
- **T-198:** work is done in small changes, one decision or feature at a time, each with its tests. A change too large to review by trying its preview is too large.
- **T-199 (changed November 12):** an AI assistant never marks a product or business decision agreed; only the founder does. The founder has delegated the technical decisions (the T files) to the technical lead. Those are marked "agreed (delegated)" after the review recorded in [DECISIONS.md](../DECISIONS.md), and the founder can reopen any of them. Since November 13, 2026, at the founder's instruction, the lead answers an open product question itself when the founder is away and marks it "Decided for you"; it becomes "agreed" only when the founder says so.
- **T-201: AI assistants work only on made-up data.** An assistant session never holds production secrets, never connects to the production database and never runs a command against production. Releases go through the pipeline. Anything that must be done by hand in production follows a written procedure ([T8](T8-scale-reliability-operations.md) section 11) and is done by the founder or the second person (T-166).
- **T-276 (agreed, delegated): builders working side by side do not collide in shared lists** ([record 072](../../../architecture/decisions/072-lanes-do-not-collide-in-shared-lists.md)). The web app's browser tests are the files in `tests/browser` themselves (`npm run test:web:browser` runs `scripts/run-web-browser-tests.mjs`: the exit test first, building the app, the rest in alphabetical order); a new test is its file and nothing else. A builder's lane does not edit [DECISIONS.md](../DECISIONS.md): it writes its rows in `docs/specs/v1/decisions-pending/<ID>.md`, one file per decision, and the lead folds them in when the lane lands (`node scripts/fold-pending-decisions.mjs`), in the same commit as the spec change, so the decision and the spec still land together (T-185). The interface text is one file per area that one index joins (T-187), and every shared list keeps its entries in alphabetical or ID order, a new one in its place, never at the end.

## 14. Documents we keep

| Document             | For whom               | Where                          |
| -------------------- | ---------------------- | ------------------------------ |
| This specification   | Founder and builders   | `docs/specs/v1/`               |
| Decision records     | Builders               | `docs/architecture/decisions/` |
| Operating procedures | Whoever is on call     | `docs/operations/`             |
| Help articles        | Organizers and players | In the product                 |

**T-200:** help articles are written with the feature, as part of "done" (T-184), not afterwards.
