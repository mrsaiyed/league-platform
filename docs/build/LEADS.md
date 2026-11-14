# Who owns what: the area leads

Every part of the product has an owner on the strongest model, whose job is the result a person gets, not the step that was written down. Every run reads this before it opens, reviews or lands anything.

## Why this file exists

The founder, 2026-11-14, after seeing the product: "the fact that the UI was so poor… worries me that the details for each task, even outside of UI, are not thorough. As the lead you need to ensure everything is perfect, and if you're spread too thin then appoint a lead for each one, maybe even in Fable… this isn't about UI, it's about not compromising on ANY part of this, business or technical." And: "I'm expecting a thorough build design of every single area… ensure we do not lose out on anything… maybe a Fable should sit at the top and review, or a Fable on top of each section."

They were right to worry. The same fault showed three times in one day:

- **The look.** Every page passed its checks and the product looked awful, because no step owned how it looks and nobody had seen a screen.
- **Four large pieces nobody planned.** Stage 1's review found that the website on a real database, a worker that starts, a way to ship and take back a release, and the invitation pages were needed by the stage's own exit test and were in no plan.
- **Steps that vanished.** The progress script hid one step, and a number given out twice hid another; the lead wrote "stage 1 is complete" with two steps left.

One cause: steps had owners and results did not. A step can be done exactly as written while the thing it was for is missing, ugly or unusable. And the lead that runs while the founder is away had been a mid-size model, checking steps one at a time.

So, decided by the lead on 2026-11-14: each area below has a lead on the strongest model (`fable`); each area is audited whole, now and at the end of every stage; nothing a person sees or relies on is built or reviewed below `opus`; and a chief of quality on `fable` starts every run.

## 1. What an area lead is

A sub-agent on `fable`, started fresh each time, given this file, its area's row below and its area's standard. It has three jobs.

- **Audit.** It takes the whole area as it stands today and judges it as the person it is for would: it uses the screens in a real browser, reads the code and the spec, and works examples by hand. It writes `docs/build/audits/<area>.md`: what is finished, what is not, and every finding with a severity (High: a person is stopped, misled or put at risk, or the product cannot go online; Medium: must be fixed before real people use it; Low: tidying), its proof (a picture, the step of a walk-through that failed, a file and line, a worked example) and what the spec says. It ends with the steps it proposes. It changes no product code and no plan: the lead numbers the steps and adds them, or writes in the log why not.
- **Review.** Before a step in its area lands, if the step adds or changes something a person sees, does or relies on (a screen, an email, a file, a number that is shown, a rule about who may see or do what), the area lead judges the result against the area's standard. This is on top of the code review. A step that only adds an inner part (a table, a query nothing shows yet) has its code review and is covered by the next audit.
- **Standard.** Each area has a written "finished" list. The area lead keeps it true and proposes changes to the lead.

An area lead works within every limit in the runbook and CLAUDE.md: made-up data only, nothing on `main`, no secrets, no weakened test, nothing under `apps/live-stats` or `packages/sports` changed outside a plan.

## 2. The areas

| Area                          | Who it is for, and what finished means                                                                                                                                                                                                                                             | Held against                                                                                                                                                                                                                                 | Covers in stage 2                                                                                               | Audit                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1. The look                   | Anyone who opens a page. It looks finished and deliberate on a phone and a laptop, in both starting designs.                                                                                                                                                                       | [DESIGN.md](DESIGN.md): the first Al-Hadi demo first (the founder, 2026-11-14), then Faraj's site and the Al-Hadi tracker's pages.                                                                                                           | Every step with a screen (the design review); steps 2.85, 2.147, 2.102, 2.103.                                  | Step 2.85 is the first; then every screen step.                 |
| 2. Nothing left out           | The founder. Every promise in the specification is built, is in a plan, or is named for a later stage with a reason. Nothing is lost between the spec and the plans.                                                                                                               | Every file in `docs/specs/v1/`, line by line, against the stage plans, the build order (T10) and the code.                                                                                                                                   | All of it.                                                                                                      | Step 2.105, and again at each stage's end.                      |
| 3. Using it                   | Each kind of person. They can do their whole job from start to finish on a phone without being told how: an admin sets up and runs a season, a scorekeeper finds and scores a game, a coach or captain sees their team, a visitor follows a team, a new person signs up and joins. | The journeys in the spec's product files (P2, P4, P6, P7), and how Faraj's and Al-Hadi's own sites let people do the same jobs.                                                                                                              | Sections C, D, H and I; the invitation and sign-up pages; help text and wording everywhere.                     | Step 2.106.                                                     |
| 4. Scoring a game live        | A scorekeeper at a noisy table. They record a whole game on a phone or tablet without hunting for a button, undo any mistake, and lose nothing when the connection drops. People watching see it within seconds.                                                                   | The Al-Hadi tracker in this repository (`apps/live-stats`), which is used for real games and which the founder holds up as the standard; the first demo's scoring view (`examples/alhadi-school`, the "scoring" page); the spec's P7 and T6. | Sections F, G, M, N and O; steps 2.45 and 2.104. Steps 2.35 to 2.38 (the scoring screens) are built on `fable`. | Step 2.107, before 2.35 to 2.38 open.                           |
| 5. Each league's data is safe | Every league and every person in it, children first. One league never sees another's data, a person sees only what their role allows, private numbers and contact details stay private, and nothing is lost or deleted by accident.                                                | The spec's T4 and T5, the two-league test, the role-against-command test, and the decisions on privacy and children's accounts.                                                                                                              | Section A, D, Q and R; step 2.46; every step the plan's "Fence, sign-in, sessions and permissions" rule names.  | Step 2.108.                                                     |
| 6. The numbers are right      | Players, coaches and parents who will argue about them. Scores, fouls, clocks, standings, tie-breaks, statistics, corrections and history are right in every case, and say why when a rule decided them.                                                                           | The rules in P7 and the S-decisions, worked by hand; `packages/sports` and its tests.                                                                                                                                                        | Sections B, E, L, P and S; steps 2.66 and 2.67.                                                                 | Step 2.109.                                                     |
| 7. Going online               | The founder and the leagues that will depend on it. It runs for real: a real database, a worker, releases that can be taken back, backups that have been restored once, alarms, no secret where it should not be, and a written way to handle each kind of failure.                | The spec's T1, T9 and T10 and their exit tests; `docs/build/STAGE-1-REPORT.md`.                                                                                                                                                              | Sections J and T; steps 2.92 to 2.100.                                                                          | Stage 1's report was the first. Step 2.110.                     |
| 8. The business               | The founder. Pricing, costs, legal duties (children's data above all), what each league is promised, support, and the path from demo to paying leagues are each decided, written down and built into the product where they need to be.                                            | The spec's product files and `docs/specs/v1/DECISIONS.md`, including every answer marked "Decided for you".                                                                                                                                  | No build section of its own: it checks that what the business needs is in the plans.                            | Step 2.111. Its findings go to the founder, not into the build. |

A step belongs to the area whose row names its section or its number. A step with a screen also gets the design review of area 1.

## 3. The chief of quality

At the start of every run, before anything is opened or landed, the lead starts one sub-agent on `fable` at high effort and gives it this file, `STATUS.md`, the log lines of the last day, the open findings of every audit and the list of steps the progress script offers. It answers four things, in a few lines each:

1. What landed since the last run that it doubts, and why. The lead re-opens a doubted step's review before building on it.
2. Which area is being neglected: an audit not yet run, findings left open, a standard not followed.
3. What to open first, and what to hold back until an audit has landed.
4. Anything the founder would be unhappy to find that nobody has written down.

The lead writes its answer into the log in one line and acts on it. The chief of quality does not build.

## 4. Before a step is opened: the brief check

The lead reads the step's line and answers, in the builder's brief:

- Who is this for?
- What will that person see or be able to do when it is done?
- Does the done test check exactly that, the way that person would meet it? For a screen that means in a browser, with pictures.
- Which area is it in, and what does that area's standard and latest audit say about it?

If the step's line cannot answer these, the lead corrects the line first and says so in the log. A builder's brief always carries the area's standard and the audit findings that touch the step.

## 5. Order and cost

- Audits come first, but not all at once: at most two audit lanes are open at a time, so that building goes on. Order: 2.85 (the look), 2.105 (nothing left out), 2.106 (using it), 2.107 (scoring a game live), 2.108, 2.109, 2.110, 2.111.
- An audit's High findings are the next steps opened in that area, ahead of new features.
- This costs speed. The strongest model uses more of the plan's allowance, so fewer steps land in a day. That is the founder's choice (2026-11-14): no compromise on any part.
