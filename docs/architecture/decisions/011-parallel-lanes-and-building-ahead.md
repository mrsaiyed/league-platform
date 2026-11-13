# 011 — Many builders at once, and building later stages early

Date: 2026-11-12 · Decision: T-212 (changed) · Decided by: the technical lead, on the founder's instruction

## What was decided

1. **Each step is built in its own lane.** A lane is a private copy of the repository (a git worktree under `.local/lanes/<step>`, on a branch `lane/<step>`). Up to the number of lanes named in `docs/build/STATUS.md` are open at once. Each lane runs the whole gate by itself. The lead lands finished, reviewed lanes onto the build branch one at a time, as one commit per step.
2. **The end of a stage no longer stops the build.** The stage report is written and the founder's checklist is recorded, and building carries on.
3. **Work from a later stage is built early whenever it does not have to wait** (T-212). The earliest unfinished stage gets builders first; spare lanes take later-stage steps whose needs have landed and whose decisions are agreed.

The rules are in `docs/build/RUNBOOK.md`.

## Why

The founder asked for it twice on 2026-11-12: one builder at a time is too slow, and everything that can be built in parallel should be, across every stage, without waiting for the founder.

Until now a run built one step, then the next. A first version of working side by side kept all builders in one folder with separate sub-folders each. That would have made them wait on each other anyway: the gate checks the whole tree, so one builder's half-finished work would block every other builder's commit.

## What else was considered

- **Several builders in the one folder, split by sub-folder.** Simple, but the gate cannot pass while anyone is mid-change, and a cut-off run leaves several steps tangled together. Rejected.
- **Several lead sessions, one per workstream.** Each lead costs allowance just to read its way in, and they would have to agree on who lands what. One lead with many builders does the same work for less. Rejected for now.
- **Keeping "nothing from a later stage is built early".** That rule guarded against building a great deal on foundations that later prove wrong. It also guarantees idle builders whenever a stage narrows to a few dependent steps. The founder's instruction decides it; the risk is handled as below.

## What was checked

A trial lane on 2026-11-12: creating it and installing took about 10 seconds and 140 MB; the gate ran in about two and a half minutes; the main folder's checks did not see the lane folder (`.local` is ignored by git, by the format check, by the test runner's file patterns and by the structure checks). One timing-sensitive test in the migration runner failed while another gate was running beside it and passed when run alone.

## Risks we are carrying

- **The allowance, not the number of builders, sets the pace.** Five builders use the founder's plan allowance about five times as fast. Lanes finish sooner by the clock; they do not produce more per week on the same plan.
- **Nothing has yet run on the real services.** Everything is tested on the local database. If the hosted database behaves differently (record 008 names one such assumption), the cost of correcting it grows with everything built on top. Building ahead makes this larger. It is contained by keeping every outside service behind an interface, and it is removed by one supervised check as soon as the founder opens the accounts.
- **Tests that depend on timing** fail more often when several gates run at once. They are rerun alone, then made sturdy; never weakened.
- **A cut-off run leaves several lanes open.** Their work is committed on their lane branches as they go, and the next run carries them on.

## What would make us revisit

- Lanes colliding often enough that landing takes longer than building: lower the lane count.
- The first check against the real services finding a foundation wrong: stop opening later-stage steps until it is corrected.
- The founder moving to a larger plan: raise the lane count, and consider a second lead for an independent workstream.
