# The builders' common brief

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
- A product question is never yours to decide: build what the product does today and report the question to the lead.

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
- GitHub's machines run the whole gate. Push early: `node scripts/push-lane.mjs --times=2` (it pushes your lane and a twin, `lane/<step>-again`, so the same commit is checked twice), then `node scripts/wait-for-github.mjs <the names it printed>` with a time limit of 600000 (PASSED, FAILED, NOT PUSHED or STILL RUNNING: run it again). `node scripts/github-check.mjs <branch>` says what failed. If the app's permission check refuses your push, do not look for another way: say so in your report and the lead pushes.
- GitHub's machines draw letters about a sixth wider than a Windows computer. A failure there is believed.

## For a step with a screen

Read [DESIGN.md](DESIGN.md) first. Take the pictures before you change anything and after each round (`node scripts/shots.mjs --dev --only=<names>`, or `node scripts/tracker-shots.mjs` for the scoring screen), and look at them: nobody writes a look, or passes one, without having looked. Only the design's variables and scales; text from the message files; logical properties; every address by the one address helper. The first demo's pictures that DESIGN.md names are made on your computer by `node docs/build/handover/first-demo-shoot.mjs` (they show the first demo's own photographs, so they are never committed).

## Your report

At most 40 lines: what you built (files) and its commits; what you reused; the proofs your brief asks for, with counts; what you ran, and what GitHub said; what you left out and why; anything not verified; what should be recorded; questions for the lead; the newest commit id.
