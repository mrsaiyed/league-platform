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
- Structure rules: imports only in allowed directions (T-21); no league named in code (T-27); no SQL outside `packages/database`; no secrets in browser code (T-30).
- Type checking in strict mode.
- Rule tests and database tests, including the two-league harness (T-65) and the role-by-command matrix.
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

## 12. What every command records

**T-196:** each command logs its name, league, acting account, how long it took and whether it succeeded, tagged with an ID shared by everything in the same request. When something goes wrong at 8 pm on a Sunday, the question "what happened to this game?" has an answer.

## 13. Working with AI assistants

- **T-197:** a `CLAUDE.md` file at the top of the repository states the rules of [T2](T2-repo-and-code-structure.md) and points here, so every AI session starts from the same structure and conventions. It is written in stage 1.
- **T-198:** work is done in small changes, one decision or feature at a time, each with its tests. A change too large to review by trying its preview is too large.
- **T-199 (changed November 12):** an AI assistant never marks a product or business decision agreed; only the founder does. The founder has delegated the technical decisions (the T files) to the technical lead. Those are marked "agreed (delegated)" after the review recorded in [DECISIONS.md](../DECISIONS.md), and the founder can reopen any of them.
- **T-201: AI assistants work only on made-up data.** An assistant session never holds production secrets, never connects to the production database and never runs a command against production. Releases go through the pipeline. Anything that must be done by hand in production follows a written procedure ([T8](T8-scale-reliability-operations.md) section 11) and is done by the founder or the second person (T-166).

## 14. Documents we keep

| Document             | For whom               | Where                          |
| -------------------- | ---------------------- | ------------------------------ |
| This specification   | Founder and builders   | `docs/specs/v1/`               |
| Decision records     | Builders               | `docs/architecture/decisions/` |
| Operating procedures | Whoever is on call     | `docs/operations/`             |
| Help articles        | Organizers and players | In the product                 |

**T-200:** help articles are written with the feature, as part of "done" (T-184), not afterwards.
