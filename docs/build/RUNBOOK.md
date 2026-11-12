# Build runbook

How one unattended build run works. A run is a fresh AI session started by a schedule. It has no memory of earlier runs. Everything it needs is in this file, [STATUS.md](STATUS.md), the current stage plan, and the [specification](../specs/v1/README.md).

The session that reads this is the **lead**. The lead plans, delegates, checks every result itself, and is answerable for what gets committed.

## 1. Start of a run

1. Read `CLAUDE.md`, this file and `STATUS.md`.
2. **If `STATUS.md` says the state is `waiting-for-founder` or `stage-review`: stop.** Reply with one line saying why, and do nothing else. This keeps idle runs cheap.
3. **If `docs/build/.lock` exists and its time is less than 90 minutes old: stop.** Another run is working. If it is older, the earlier run died; delete it and carry on.
4. Write the current time into `docs/build/.lock`. Rewrite it after every commit, as a heartbeat. Delete it at the end of the run.
5. Check the tree with `git status`. It should be clean and on the build branch named in `STATUS.md`.
   - If it is dirty, an earlier run was cut off mid-step. Run the gate. If it passes and the change is a complete step, commit it. Otherwise move it aside with `git stash push -u -m "rescue <date>"`, note that in `STATUS.md`, and redo the step. Never discard work silently.
6. Run the gate named in `STATUS.md` once. If it fails on a clean tree, fixing that is the first job of the run.

## 2. Doing a step

The stage plan lists steps in order. Take the first one that is not done and whose "needs" are done.

1. **Read** the spec sections the step names. Do not build from memory of the spec.
2. **Plan the change small.** A step is one commit, or a few. If a step looks larger than about 400 changed lines of real code, split it and write the split into the stage plan first.
3. **Delegate or do it.** See section 3. The lead writes the brief; a brief names the files, the spec sections, the done test, and what must not be touched.
4. **Check it yourself.** Read the diff. Run the gate. Run the step's own done test. A sub-agent's report is a claim, not proof.
5. **Independent review.** Start a fresh sub-agent that did not write the change and has not seen how it was written. Give it only the diff, the spec sections and this instruction: "Find faults. Check it against the spec and against the rules in CLAUDE.md. List concrete problems with file and line, or say there are none." Every finding is fixed, or answered in one line in the commit message. (T-181.)
6. **Commit** on the build branch with a message that says what changed and which decision IDs it carries out. End the message with the attribution line your session was given.
7. **Update `STATUS.md`**: tick the step, add one line to the log, rewrite the lock time.

**Then take the next step, in the same run.** Finishing one step is not the end of a run: keep going, step after step, until section 6 says to stop. A run can be cut off at any moment by the usage limit, so the tree must be committed and `STATUS.md` true after every step, not at the end of the run.

## 3. Sub-agents: who does what

Use sub-agents for the building and the reviewing. Keep the lead's own context for planning and checking. Choose the model and effort by the kind of work:

| Kind of work                                                                                       | Model                                    | Effort  |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------- |
| Mechanical: moving files, renames, formatting, boilerplate, config, doc indexes                    | haiku                                    | low     |
| Ordinary building from a clear brief: a command, a query, a page, a test file                      | sonnet                                   | medium  |
| Anything touching the league fence, sign-in, sessions, permissions, migrations, money, the tracker | opus                                     | high    |
| The independent review of a change                                                                 | sonnet, or opus if the row above applies | high    |
| The whole-stage review at the end of a stage                                                       | opus                                     | xhigh   |
| Finding where something is in the code                                                             | the Explore agent                        | its own |

Rules for delegating:

- One writer per set of files at a time. Parallel sub-agents only when their files do not overlap.
- The reviewer is never the author, and is never given the author's reasoning.
- If a sub-agent's work fails the gate twice, the lead does that step itself.

## 4. Decisions that come up while building

- **Technical, and the spec is silent or wrong:** the lead decides. Write a short record in `docs/architecture/decisions/` (what, what else was considered, what would make us revisit), correct the spec file in the same commit, and add a row to the change log in `docs/specs/v1/DECISIONS.md` with status "Agreed (delegated)" or "Changed (delegated)".
- **Product or business:** do not decide. Add it to "Needs the founder" in `STATUS.md` with the question in plain words and your recommendation, then build something that does not depend on it.
- **Needs the founder's hands** (a vendor account, a key, a real device, a payment, a review by eye): same list. Build everything up to that point, with the outside service behind its interface and a local stand-in, so the founder's part is a short checklist at the end.

## 5. What a run must never do

- Commit to `main`, push, or open a pull request, unless `STATUS.md` records that the founder allowed it.
- Touch production, a vendor dashboard, real people's data or any secret.
- Change `apps/live-stats`, `packages/sports` or the Al-Hadi data except where the stage plan says to.
- Weaken or delete a test to make the gate pass, or skip a hook.
- Mark a product decision agreed, or build on one that is not.
- Start the next stage. A stage ends with the founder's check.

## 6. End of a run

Stop starting new steps when your context is more than about 60% full, or when a step fails twice for reasons you cannot resolve. Then:

1. Make sure the tree is clean and the last commit passes the gate.
2. Update `STATUS.md`: what was done this run, what is next, anything new under "Needs the founder".
3. Delete `docs/build/.lock`.
4. Reply with three or four plain lines: what got done, what is next, what is waiting on the founder.

## 7. End of a stage

When every step in the stage plan is done:

1. Run the whole-stage review (section 3) across everything the stage added. Fix what it finds.
2. Write `docs/build/STAGE-<n>-REPORT.md` for the founder in plain words: what now exists, how to see it working on their own computer, what could not be verified without them, and the checklist of things only they can do.
3. Set the state in `STATUS.md` to `stage-review` and stop. Later runs will see that and do nothing until the founder has checked the stage and said to go on.
