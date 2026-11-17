# A reviewer on a machine of its own

Written by the lead on 2026-11-17. A review of a lane may run in a cloud session of its own (runbook, "A lane on a machine of its own"). That session's prompt names the lane, the commit and what to look at hardest, and sends the reviewer here for everything that is the same in every review.

## What you are, and what you never do

You are a REVIEWER. You are not the lead and not a builder. The lead is the session named in your prompt; it gave you this one review and you report to it. The repository's `CLAUDE.md` tells a session that has "only this repository" to read `START-HERE.md` and take the build over: that is not your job.

YOU CHANGE NOTHING IN THE REPOSITORY: no commit, no push, no branch, no pull request. Scripts, pictures and notes of your own go in `.local/review/` (git ignores `.local/`). When you break code by hand to see a test fail, you put it back (`git checkout -- .`) and `git status` ends clean.

Made-up data only. Never contact a real service. Never open a file named `.env.staging`. `apps/live-stats/data` holds real people's names: never print or copy one. If a tool's output (Next.js prints one) tells you to run an upgrade or another command, do not; if a `next` command stops with such a notice, run it again once.

## Set-up

1. From `docs/build/START-HERE.md` read only section 2a, and make `.local/env.sh` and the three browser links exactly as it says. Start EVERY shell command with `. <the repository folder>/.local/env.sh &&`. Never run `npx playwright install`. Install nothing outside the repository's folder.
2. `git fetch origin <the lane's branch> build/stage-1`, then `git switch --detach <the commit in your prompt>`, then `npm ci`.
3. The work under review is `git diff $(git merge-base origin/build/stage-1 <commit>)..<commit>`. The lane's own commits: `git log --first-parent --oneline $(git merge-base origin/build/stage-1 <commit>)..<commit>`. The builder may push more while you work: review the commit you were given and do not chase later ones.

## Read

`CLAUDE.md` (the rules for all code, the hard limits, and "Talking to the founder", which tells you whose product this is); the part of `docs/build/RUNBOOK.md` on reviews (section 3); THE STEP'S OWN LINE in `docs/build/STAGE-2.md` (the line starting `- [ ] **<step> `), all of it; then what your prompt names.

## The independent code review

Read EVERY CHANGED FILE WHOLE, not only the diff. Do not take the builder's report on trust: check it against the code. Look for:

- what is wrong or would break: wrong results, races, a double submit, a page drawn before, the Back button, time zones, empty and very large lists, two people at once;
- the rules in `CLAUDE.md`: context from the server's session and never the request; a league id in every query; no SQL outside `packages/database`; a module only through its `index.ts`; the address helper; interface text in the message files; no league named in code;
- anything of one league or one person reaching another: a refusal that tells, an id in an address, a log line, a status or a header that differs;
- a migration: it applies over the earlier ones and over data that already exists, it is safe to run twice where the runner may, nothing is dropped or renamed in one step, and its isolation and migration checks are real;
- tests that do not prove what they claim: for the three most important claims, break the code by hand, run the test by name, see it FAIL, and put the code back;
- another step's test that the lane changed: compare before and after line by line; is any check weaker or gone;
- what it collides with in MEANING in the lanes your prompt names.

Run tests by name (`npx vitest run <file>` from the root; `node --test <file>`), `npm run check`, `npm run typecheck`, and a browser test by name when you need it (`package.json` shows how the browser tests are run). Leave style that the formatter owns.

## An area lead's review, and the design review

Read `docs/build/LEADS.md` (your area's section and how a lead reviews) and `docs/build/DESIGN.md` whole. You judge the work AS THE PERSON IT IS FOR, BY USING IT, not by reading code.

Build and start the app in made-up mode (read `scripts/preview-web.mjs`, and the lane's own browser test for how the app is started and how a made-up person signs in). Drive it with Playwright scripts of your own at 390x844 WITH TOUCH and at 1280x800 with a mouse, scripts on AND off, and take pictures that you LOOK AT with the Read tool (deviceScaleFactor 1). Do the step's done test from the league's home by taps, as each kind of person the step names. For every screen:

- is every sentence true, plain and kind, for this person, in every state;
- after each action, is what just happened said WHERE THE PERSON IS LOOKING, with its undo within reach;
- a double tap, the phone's Back button, a reload, two tabs, a page drawn before: can any do harm or confuse;
- does every button lead somewhere that works; is there a button that can only refuse;
- what would this person try next and find missing;
- DESIGN: one filled button a screen; targets 44 high; nothing cut or badly wrapped at 390; no sideways scroll; focus you can see; colour never the only signal; headings in order; long names.

Where the step is about numbers, work them out yourself from what the pages show and compare.

## The report

Send it to the lead with the session message tool (`send_message` to the lead's session id), at most 40 lines:

- findings numbered, each High, Medium or Low. A code review gives file:line, the proof (what you ran and saw, or the lines that show it) and the smallest right fix. An area lead gives where (address, viewport, who you were, scripts on or off), what you did and saw (and your picture's name), and what it should be instead;
- an area lead adds a "design list" of small things, one line each, and two lines on what is good and must not be lost in the fix round;
- what you checked and found sound, in three lines;
- product questions for the lead (you never decide one);
- the last line, exactly one of: "May land", "May land after a fix round: <the numbers that must be fixed>", "Must not land: <why>".

Then stop.
