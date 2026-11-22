# The builders' common brief

> **SINCE 2026-11-22 THE USAGE RULES COME FIRST ([USAGE.md](USAGE.md), rules 4 to 9), and they overrule the lines below where the two differ.** In short: your session is short (about 80 commands for a builder, 60 for a review, 40 for a confirming look or a small fix: what a session costs grows with the square of its length) and never waits; you read only what your brief names; every command's output is cut to its last 30 lines; you run your own checks and never the whole gate, and you do not wait for GitHub; you decide your step's technical questions and take the plain default on a product question, writing each as a pending decision; and you end by writing what is done and what is left at the top of your lane's note, `docs/build/handover/lanes/<step>.md`, pushing, and reporting in 12 lines.

What every builder's brief says, in these words or close to them, as of 2026-11-16. The lead pastes it into a brief and adds the step: who it is for, what that person can do when it is done, the done test, the spec sections, the numbers reserved for it, and what the reviews of earlier parts found. The rules themselves are the runbook's ([RUNBOOK.md](RUNBOOK.md), section 3, "What the builder is told"); this file is the short form a brief carries.

## Where you work

- Work only inside your lane folder, `<absolute path>` (branch `lane/<step>`). Start every shell command with `cd "<absolute path>" &&` and use absolute paths inside that folder for every file you read or write. Never touch the main folder or another lane.
- First run `npm ci` in the lane, in the foreground with a time limit of 600000.
- Read `CLAUDE.md` at the lane root first: the rules for all code and the hard limits.
- You carry your lane to its landing: the build, the fix round after its reviews, the catch-up merges and the reruns are yours.

## What you never do

- Never edit `docs/build/STATUS.md` or any stage plan: say in your report what should be recorded.
- Never switch branches, never `git stash`, never push anything but your own lane with `node scripts/push-lane.mjs`.
- Never open any file named `.env.staging`. Made-up data only: no real service, no key, no real person.
- Never change `apps/live-stats`, `packages/sports` or their tests unless your step's line says to.
- Never weaken or delete a test. A check may be pointed at where a thing now is; it is never loosened.
- Never stop processes by name (`pkill`, `taskkill`): other builders' checks run on this computer. Stop only a process you started, by its own id.
- Never write a file outside your lane. Change files with the editing tool, not with `sed -i`.
- A product question: take the written recommendation, or else the choice that leaves a league's admin the most room and is easiest to change; write it as a pending decision file marked "Decided for you" with its reason, and build on it (USAGE.md, rule 8). Never mark one "Agreed".

## Commits

One commit for each part that works by itself (an interface, a query with its test, a page). Each commit type-checks and passes its own tests; its message says what that part is and why, in plain words, and ends with the attribution line your session gives you. No "wip" messages, except at a hand-over, when a commit that is half done starts with "Work in progress:" and says what is missing.

## Shared files a lane does not edit (since step 2.188)

- **Decisions:** never edit `docs/specs/v1/DECISIONS.md`. A new or changed row is a file of its own, `docs/specs/v1/decisions-pending/<ID>.md`, as that folder's README says; correct the spec file itself in your lane. Use only the numbers the lead reserved for you.
- **Browser tests:** a new browser test is just a file, `tests/browser/<name>-test.mjs`; `package.json` is not touched. A file there that is not a test is added to the list of helpers in `scripts/web-browser-chain.mjs`.
- **Messages:** a new or changed message goes in its area's file under `packages/site/src/messages/en/`, in alphabetical place (the map of areas is at the top of `en.ts`), never in `en.ts` itself.
- A new entry in the commands' list, the role matrix, the isolation helper, the ports or the web shell check goes in its stated alphabetical place, never at the end.
- After every merge of the build branch into your lane, run `node scripts/check-lane-messages.mjs <the commit your lane started from>` and say what it printed.

## Checks: nothing whole on the computer you work on

- No whole unit suite (`npm test`, `vitest run` with no file or with a whole package), no `npm run test:web`, no whole browser chain, no `npm run verify`. Run the test FILES that cover what you changed, named one by one, plus `npm run check` and `npm run format:check`.
- Anything that runs for minutes (the typecheck, building the site, a browser test, pictures) goes through `node scripts/heavy.mjs -- <command>`, in the foreground with a time limit of 600000. Not for one test file or the formatter.
- No waiting loops: no `sleep`, no `until grep`, no `echo waiting`, no background command that you then poll.
- GitHub's machines run the whole gate. Push early: `node scripts/push-lane.mjs --times=2` (it pushes your lane and a twin, `lane/<step>-again`, so the same commit is checked twice), and DO NOT WAIT for the result (USAGE.md, rule 4): the lead reads it. `node scripts/github-check.mjs <branch>` says what failed, if you are sent back for a failure. If the app's permission check refuses your push, do not look for another way: say so in your report and the lead pushes.
- GitHub's machines draw letters about a sixth wider than a Windows computer. A failure there is believed.
- Three checks that each cost a lane a whole trip to GitHub on 2026-11-22, so run them every time: (1) if you added or changed any interface text, run `npx vitest run packages/site/src/messages` (the keys of each message file stay in alphabetical order, and the test is one second); if you added anything that `packages/database` exports, run `npx vitest run packages/database/src/isolation/isolation-coverage.test.ts` (every exported function has an isolation case or a reviewed reason there); (3) before your LAST push, merge the build branch into your lane (`git fetch -q origin build/stage-1 && git merge --no-edit origin/build/stage-1`), put right whatever the two sides' meeting broke, and run the type check again: GitHub then checks what will really land, and a lane that passed GitHub before others landed can still conflict with them.

## For a step with a screen

Read [DESIGN.md](DESIGN.md) first. Take the pictures before you change anything and after each round (`node scripts/shots.mjs --dev --only=<names>`, or `node scripts/tracker-shots.mjs` for the scoring screen), and look at them: nobody writes a look, or passes one, without having looked. Only the design's variables and scales; text from the message files; logical properties; every address by the one address helper. The first demo's pictures that DESIGN.md names are made on your computer by `node docs/build/handover/first-demo-shoot.mjs` (they show the first demo's own photographs, so they are never committed).

## Your report

At most 12 lines, the rest is in your lane's note (USAGE.md, rule 4): what you built (files) and its commits; what you reused; the proofs your brief asks for, with counts; what you ran, and what GitHub said; what you left out and why; anything not verified; what should be recorded; questions for the lead; the newest commit id.
