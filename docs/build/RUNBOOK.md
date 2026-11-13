# Build runbook

How one unattended build run works. A run is a fresh AI session started by a schedule. It has no memory of earlier runs. Everything it needs is in this file, [STATUS.md](STATUS.md), the stage plans (`STAGE-<n>.md`), and the [specification](../specs/v1/README.md).

The session that reads this is the **lead**. The lead plans, delegates, checks every result itself, and is answerable for what gets committed.

**The lead does not build one thing at a time.** The founder asked for this on 2026-11-12: everything that does not have to wait for something else is built at the same time. The lead keeps several builders working at once, each in its own lane, and spends its own time briefing, checking and landing finished work. A lead that is waiting on one sub-agent while lanes stand empty is doing it wrong.

## 1. Start of a run

1. Read `CLAUDE.md`, this file and `STATUS.md`.
2. **If `STATUS.md` says the state is `waiting-for-founder`: stop.** Reply with one line saying why, and do nothing else. This keeps idle runs cheap.
3. **If `docs/build/.lock` exists and there has been a sign of life in the last 40 minutes: stop.** Another run is working. A sign of life is the time in the lock, or the newest commit on any branch (`git log -1 --all --format=%cI`): builders commit to their lanes as they work, so a busy run shows there even when its lead is late rewriting the lock. If both are older than 40 minutes, the earlier run died or is stuck; delete the lock and take over.
4. Write the current time into `docs/build/.lock`. Rewrite it after every landing and at least every 20 minutes, as a heartbeat. Delete it at the end of the run.
5. **Find what the last run left.** Run `git status` in the main folder and `git worktree list`, and read "In progress" in `STATUS.md`.
   - The main folder should be clean and on the build branch. If it is dirty, an earlier run was cut off there. If the change is a half-finished step, finish it; prefer finishing to redoing. Only if it cannot be understood, set it aside with `git stash push -u -m "rescue <date and time>"`, note that in `STATUS.md`, and redo the step. Never use a bare `git stash` or `git stash pop`: the stash list is shared with every lane. Never discard work silently.
   - Every folder under `.local/lanes/` is a step that was being built when the last run ended. Its work is on its lane branch and in its folder. Carry each one on from where it stands (section 3). Do not start it again.
   - A lane branch with no folder, or a lane with nothing on it, is leftover. Remove it (`git worktree remove`, `git worktree prune`, `git branch -D lane/<step>`) only after checking that it holds nothing that has not landed.
6. Run the gate named in `STATUS.md` once in the main folder. If it fails on a clean tree, fixing that is the first job of the run.
7. **See whether the live tracker has moved.** Run `git fetch origin main`. If `git log HEAD..origin/main` prints anything, someone has changed the tracker on `main`. Add a catch-up step to the current stage plan, shaped like step 1.26 in the stage 1 plan, and give it a lane first.
8. **Fill the lanes** (section 3) before doing anything else by hand.

## 2. The life of a step

A stage plan lists steps. Each step says what it **needs**: the steps that must have landed before it can start. A step can be **opened** when all of these are true:

- every step it needs has landed on the build branch;
- every decision it rests on is agreed in `docs/specs/v1/DECISIONS.md` (T-211);
- it is not marked as waiting on the founder.

Every step goes through the same six things:

1. **Brief.** The lead reads the spec sections the step names (not from memory) and writes the brief: the lane folder, the spec sections, the done test, what must not be touched, and any numbers reserved for it (section 3).
2. **Build.** A builder sub-agent works in the step's lane and commits there as it goes. It is finished when the step's done test and the whole gate pass in the lane. If a step looks larger than about 400 changed lines of real code, split it into parts and write the split into the stage plan first.
3. **Check.** The lead reads the diff (`git diff <build branch>...lane/<step>`) and looks at the gate result. A sub-agent's report is a claim, not proof.
4. **Independent review.** A fresh sub-agent that did not write the change and has not seen how it was written. Give it only the diff, the spec sections and this instruction: "Find faults. Check it against the spec and against the rules in CLAUDE.md. List concrete problems with file and line, or say there are none." Every finding is fixed by a builder in the same lane, or answered in one line in the commit message. (T-181.)
5. **Land.** The lead brings the lane onto the build branch as one commit (section 3), with a message that says what changed and which decision IDs it carries out. End the message with the attribution line your session was given.
6. **Record.** Tick the step in its stage plan (a step built in parts is ticked when its last part lands), add one line to the log in `STATUS.md`, update "In progress", rewrite the lock time, run `node scripts/build-dashboard.mjs`, and push if allowed (below). After the push, run `node scripts/promote-to-main.mjs` (section 7): GitHub counts only `main` in the founder's statistics, so `main` follows the build after every landing, not only at the end of a run.

**Push, only if allowed.** If the "Pushing to GitHub" line in `STATUS.md` starts with `allowed`, run `git push origin <build branch>` after each landing. Only the build branch: never `main`, never a lane branch, never with force. If that line says anything else, do not push. A push that fails (no network, sign-in needed) is noted in the log and never retried in a loop.

## 3. Lanes: many steps at once

A **lane** is one step, one builder, and one private copy of the repository. Lanes do not see each other's half-finished work, so each can run the whole gate and commit at its own pace.

### How many

The "Lanes" line in `STATUS.md` says how many may be open at once. Keep that many open whenever there are steps that can be opened. The moment a lane lands or a builder finishes, look for the next step to open.

**Never slide back to one builder.** Landing the first wave of lanes is not the end of working side by side; it is when the next wave starts. After every landing, and every time you rewrite the lock, count the open lanes against the "Lanes" number. `node scripts/build-dashboard.mjs` does the counting for you: it prints how many lanes are open and lists every step that can start now, across all stage plans. When it prints that lanes are free and steps can start, open those lanes before anything else: before the next review, before the next landing, before ending the run. The only checks left to you are that each step's decisions are agreed (T-211) and that no two open lanes change the same table.

Which steps get the lanes:

1. Steps of the earliest unfinished stage come first.
2. Spare lanes go to steps of later stages that can be opened (T-212). Never leave a lane empty because "that is a later stage".
3. If the plans hold fewer steps that can be opened than there are lanes, give one lane to planning (section 8).

### Opening a lane

```bash
git worktree add ".local/lanes/<step>" -b "lane/<step>" <build branch>
cd ".local/lanes/<step>" && npm ci
```

This takes about ten seconds. `.local/` is ignored by git and by every check, so the main folder never sees lane folders.

Before starting the builder, write the lane under "In progress" in `STATUS.md`: the step, the lane folder, and any **reserved numbers**. Two lanes must never invent the same number, so only the lead hands them out, at opening time:

- the migration file number, for a step whose plan line says "Migration: yes";
- the decision record number and the `T-` number, for a step likely to need a technical decision (give one to any step touching the stack, the database shape, sign-in or the tracker; an unused number is simply given to the next lane).

### What the builder is told

Every builder's brief says, in these words or close to them:

- Work only inside your lane folder, `<absolute path>`. Start every shell command with `cd "<absolute path>" &&`, and use absolute paths inside that folder for every file you read or write. Never touch the main folder or another lane.
- Do not edit `docs/build/STATUS.md` or any stage plan. Say what should be recorded in your report.
- Commit to your lane branch as you go: one commit for each part that works by itself (an interface, a table, a command with its test, a page). Each commit must type-check and pass its own package's tests, and its message says what that part is and why, in plain words, ending with the attribution line you were given. No "wip" messages: these commits are kept and the founder reads them on GitHub. A cut-off run must not lose your work. Never push, never switch branches, never use `git stash`.
- Use only the numbers reserved for you. If you need one you were not given, stop and say so.
- You are done when the step's done test and `npm run verify` pass in your lane. Report what you built, what you left out and why, and anything the lead should know.

Start all the builders you are opening in one message, so they run together. While they work, the lead checks, reviews and lands other lanes.

### Checking and reviewing a lane

When a builder reports done: read its diff, then start its independent reviewer at once (read-only, given the diff and the spec sections). Do not wait for other lanes. Findings go back to a builder working in the same lane.

### Landing a lane

The lead lands lanes one at a time, in the main folder. Nobody else writes to the build branch.

1. **Catch the lane up.** In the lane: `git merge <build branch>`, to take in what has landed since the lane opened. If that brings anything in, the gate must pass in the lane again. Conflicts are settled in the lane, by a builder for that lane, never in the main folder. Generated files (the database types) are made again by their generator, not merged by hand.
2. **Bring it over with its commits.** In the main folder: `git merge --no-ff lane/<step> -m "<the step's message>"`. The lane's own commits are kept, so the history shows the step being built part by part, and the merge commit names the step and the decision IDs it carries out. The founder asked for frequent commits (2026-11-13): several small, sound commits for a step are better than one large one. Before landing, read the lane's commit list (`git log --oneline <build branch>..lane/<step>`): if a message is unclear or says "wip", have the builder reword it in the lane first.
3. **Check the result.** If `package-lock.json` changed, run `npm ci` in the main folder. Then run the gate in the main folder. It takes about two and a half minutes; use them to brief the next lane.
4. **Record and push** (section 2, item 6).
5. **Close the lane.** `git worktree remove ".local/lanes/<step>"` and `git branch -D "lane/<step>"`.

### Inside one step

A large step can also be split among builders inside its lane, when their files do not overlap (the commands in `packages/core`, the queries in `packages/database`, the tests of each). Start them in one message. Split a large review the same way.

### What is never done side by side

- Two lanes changing the same table. Migration numbers are in order and reserved; a migration that builds on another waits for it to land.
- The whole-stage review of a stage while a lane of that stage is still open.
- Two landings at once.

### When it goes wrong

- **A test that fails only when the machine is busy.** Several gates running at once make timing-sensitive tests fail. Run the failing test file once more by itself. If it passes, it is a flaky test: note it in the log and open a small step to make it sturdy. Never delete or weaken it.
- **A lane fails the gate twice for its own reasons.** The lead takes that step over itself, or closes the lane and splits the step smaller.
- **A step that will not come right.** Nobody is here to ask. If a step has been tried in two runs and still does not pass, park it: keep its lane branch, write what was tried and what fails under "Needs the founder" in `STATUS.md`, mark the step in its plan as parked, and give the lane to another step. Do not spend a third run on it.
- **Something outside the build is broken** (GitHub refuses a push, the network is down, a tool is missing). Note it in the log once, carry on with everything that does not need it, and try it again at the start of the next run. Never change a setting, a sign-in or a permission to get past it.
- **Lanes themselves stop working** (installing fails, the machine runs out of memory, paths break). Close what is open, lower the "Lanes" number in `STATUS.md`, say why in the log, and go on. One step at a time in the main folder is the last resort, not the habit.

Working side by side finishes sooner by the clock. It does not make the usage allowance go further: five builders use it about five times as fast.

## 4. Sub-agents: who does what

Use sub-agents for the building and the reviewing. Keep the lead's own context for planning, checking and landing: a lead that does the building itself fills its context and has to end the run early. Choose the model and effort by the kind of work:

| Kind of work                                                                                       | Model                                    | Effort  |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------- |
| Mechanical: moving files, renames, formatting, boilerplate, config, doc indexes                    | haiku                                    | low     |
| Ordinary building from a clear brief: a command, a query, a page, a test file                      | sonnet                                   | medium  |
| Anything touching the league fence, sign-in, sessions, permissions, migrations, money, the tracker | opus                                     | high    |
| The independent review of a change                                                                 | sonnet, or opus if the row above applies | high    |
| Fixing a reviewer's findings                                                                       | the model that built it                  | medium  |
| Writing a stage plan (section 8)                                                                   | opus                                     | high    |
| The whole-stage review at the end of a stage                                                       | opus                                     | xhigh   |
| Finding where something is in the code                                                             | the Explore agent                        | its own |

Rules for delegating:

- One writer per lane at a time, unless the step is split by files as section 3 allows.
- The reviewer is never the author, and is never given the author's reasoning.
- The allowance is what limits the build, so do not spend a stronger model than the table says, and do not have a sub-agent re-read the whole specification when the brief can name the sections.

## 5. Decisions that come up while building

- **Technical, and the spec is silent or wrong:** the lead decides. Write a short record in `docs/architecture/decisions/` (what, what else was considered, what would make us revisit), correct the spec file in the same commit, and add a row to the change log in `docs/specs/v1/DECISIONS.md` with status "Agreed (delegated)" or "Changed (delegated)". Use the numbers reserved for that lane.
- **Product or business:** do not decide. Add it to "Needs the founder" in `STATUS.md` with the question in plain words and your recommendation, and open a different step. A step that rests on an unsettled decision is skipped, never guessed.
- **Needs the founder's hands** (a vendor account, a key, a real device, a payment, real people's data, a review by eye): same list. Build everything up to that point, with the outside service behind its interface and a local stand-in, so the founder's part is a short checklist.

## 6. What a run must never do

- Commit to `main`, merge into `main`, push `main` by hand, or open a pull request. `main` is the live Al-Hadi site. The only way `main` ever moves is `node scripts/promote-to-main.mjs` (section 7), which refuses unless it is safe.
- Push anything, unless the "Pushing to GitHub" line in `STATUS.md` starts with `allowed`; and then only the build branch, never a lane branch, never with force.
- Touch production, a vendor dashboard, real people's data or any secret.
- Change `apps/live-stats`, `packages/sports` or the Al-Hadi data except where a stage plan says to.
- Weaken or delete a test to make the gate pass, or skip a hook.
- Mark a product decision agreed, or build on one that is not.
- Call a stage finished. A stage is finished when the founder has checked it (section 9); the building carries on meanwhile.

## 7. End of a run

**The only reasons to end a run** are: your context is more than about 60% full; no step in any plan can be opened and no lane is open; or the state is `waiting-for-founder`. "A good share of the run is used", "a step just finished" and "the next step is a big one" are not reasons. If you are unsure whether to stop, open the next lane.

When one of the real reasons holds:

1. Stop opening lanes. Let builders that are close to done finish; tell the others to commit where they are.
2. Land every lane that is built and reviewed. Every other lane keeps its folder and its branch, with its work committed there, for the next run.
3. Make sure the main folder is clean and its last commit passes the gate.
4. Update `STATUS.md`: what landed this run, and under "In progress" each lane still open with what is left to do in it.
5. **Move `main` forward if it is safe.** Run `node scripts/promote-to-main.mjs` once more (it is also run after every landing, section 2). It moves GitHub's `main` up to the newest build commit only when the move is a plain fast-forward, nothing the live tracker is built from differs, GitHub's checks have passed on that exact commit, no game is within 24 hours, and `STATUS.md` allows it. It picks the newest commit GitHub has finished checking, so `main` is usually one landing behind, which is fine. This is what makes the founder's commits count in GitHub's statistics. Copy the one line it prints into the log at the end of a run, and during a run only when it refuses for a new reason. If it refuses, leave `main` alone: never work around it.
6. Delete `docs/build/.lock` and run `node scripts/build-dashboard.mjs`.
7. Reply with three or four plain lines: what landed, what is open, what is waiting on the founder.

## 8. Planning ahead

The lanes must never run dry for want of a plan. When a stage plan has fewer than about ten steps left that are not yet landed, or when lanes stand empty because nothing can be opened, and the next stage has no plan yet: give one lane to a planning sub-agent (opus, high effort). It writes `docs/build/STAGE-<n>.md` for the next stage from [the build order](../specs/v1/technical/T10-build-order.md) and the spec files that stage names, in the same shape as the existing plans. Every step line carries: what to build, `Spec:`, `Needs:`, `Migration: yes or no`, `Folders:`, `Done test:`, `Model:`. A step resting on an unsettled decision is kept in the plan and marked `Blocked on founder: <ID>`.

The lead reads the plan before landing it and checks three things: the needs are honest (no step claims to need nothing when it does), the steps are small, and nothing in it breaks a rule of `CLAUDE.md`.

## 9. End of a stage

When every step in a stage's plan has landed:

1. Run the whole-stage review (section 4) across everything the stage added, when no lane of that stage is open. Fix what it finds, as steps in lanes.
2. Write `docs/build/STAGE-<n>-REPORT.md` for the founder in plain words: what now exists, how to see it working on their own computer, what could not be verified without them, and the checklist of things only they can do. Put that checklist under "Needs the founder" in `STATUS.md` too.
3. **Do not stop.** Carry on with the steps of later stages that can be opened. What waits for the founder's check is only this: calling the stage finished, anything reaching `main`, any release, and anything that touches a real service or real people.
4. Set the state to `waiting-for-founder` only when no step in any plan can be opened, no lane is open and no plan is left to write.
