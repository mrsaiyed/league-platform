# Start here: taking the build over on a computer that has only this repository

You were given this repository's address and told to start. This file is what you need that
the other files do not say, because until 2026-11-16 it lived on the first computer: in the
Claude app's sessions, its scheduled checks, its memory, and a folder git does not carry.

Read `CLAUDE.md` first. Its rules hold for everything below. Then read this file to the end
before you run a command.

**Who you are.** The session the founder talks to is the business and technical lead ("the
chat lead"). The founder owns the product, runs a league, is not an engineer, and often
dictates by voice. Plain everyday words, and always say what is not done or not checked.

## 1. Make sure you are the only lead

Two computers building on the same branch would overwrite each other.

- In `docs/build/STATUS.md`, under "Now", the "Next step" must begin **MOVED TO ANOTHER
  COMPUTER** and say when the first computer stopped. If it does not, the first computer may
  still be building: change nothing, and tell the founder in one plain sentence.
- The first computer was stopped on purpose: a hold file there (`.local/hold.txt`) and its two
  scheduled checks switched off. If the founder ever goes back to it, the same care applies
  in the other direction.

## 2. Get this computer ready (once)

1. **The folder.** Clone the repository into a folder with a short path and switch to the
   build branch named in `STATUS.md` (`git fetch origin`, then `git switch build/stage-1`).
   Never work on `main`.
2. **Node and Git.** `node --version` must say 24 (`package.json`, "engines"), and Git must be
   there. If either is missing, that is the founder's to install (nothing outside the
   repository is ours to change): tell them exactly which one and where it comes from.
3. **Packages and the test browser.** `npm ci` in the folder, then
   `npx playwright install chromium` (the one browser the browser tests use).
4. **Whose commits.** `git config user.name` and `git config user.email` must show the
   founder: every commit is authored by them. If either is empty, ask the founder to set it.
   Never guess one, and never write an email address into a file or a message.
5. **Pushing.** Reading GitHub needs no sign-in; pushing does. Try
   `git push --dry-run origin build/stage-1`. If it asks for a sign-in, the founder does that
   in the window Git opens. Never type a password or a code, and never look for a stored one.
6. **The computer itself** (the founder's to set): plugged in, sleep set to never, lid open,
   Windows power mode "Best performance". Section 6 says why this matters.
7. **Prove the set-up.** Run `npm run verify` once in the main folder, before any lane
   exists. This one time is allowed here: nothing else is running. If it fails, fix the
   set-up, never the tests.
8. **Approvals.** An unattended build cannot wait for a click on every command. If sessions
   stall on approval prompts, tell the founder: which mode sessions run in is theirs to pick
   in the app.

## 2a. If "this computer" is a cloud session of the Claude app (since 2026-11-16)

The founder may start you in the app's cloud instead of on a computer of their own. The
repository is then already cloned on a temporary Linux machine. What differs from section 2:

- **Nothing is the founder's to install, and nothing outside the repository's folder is
  changed.** Node 24 is on the machine (`/opt/node24`) but Node 22 comes first; the
  project's Playwright looks for one Chromium build and the machine has another, and
  downloading a browser is not allowed there (do NOT run `npx playwright install`). Both
  are settled by one git-ignored file that every command starts with,
  `. <the repository folder>/.local/env.sh`:

  ```bash
  export PATH="/opt/node24/bin:$PATH"
  # Node's own fetch does not use the machine's network proxy unless told to (github-check.mjs needs it).
  export NODE_USE_ENV_PROXY=1
  # Links in .local/pw-browsers give the machine's Chromium under the name Playwright looks for.
  export PLAYWRIGHT_BROWSERS_PATH="<the repository folder>/.local/pw-browsers"
  export BROWSER_EXECUTABLE="/opt/pw-browsers/chromium"
  # As on GitHub's machines: the browser tests and picture scripts pick Edge unless CI is set, and
  # Next.js does not stop a first start with its upgrade notice.
  export CI=1
  ```

  and by links made once in `.local/pw-browsers` (the numbers are the builds on the day:
  read the error a first launch prints and `ls /opt/pw-browsers`):
  `ln -s /opt/pw-browsers/chromium-1243 chromium-1234`, the same for
  `chromium_headless_shell-…`, and `ln -s /opt/pw-browsers/ffmpeg-1011 ffmpeg-1011`.
  Every helper's brief gives it the line to start its commands with.

- **Whose commits.** The machine's git is set to the cloud session's own name and signs
  with its key: leave that alone. Set only the AUTHOR, for this repository, from the
  branch's own history, without printing it:
  `git config author.name "$(git log -1 --format=%an origin/build/stage-1)"` and the same
  with `author.email` and `%ae`. Lanes share the setting.
- **Pushing.** The app's safety check refused the lead's first push of a lane branch on
  2026-11-16, until the founder said in the chat that lane branches may be pushed; a
  scheduled check was refused in the same way until they approved it. A founder's own
  words in the chat are what the app goes by, so if a push or a schedule is refused, say
  so to the founder in one plain sentence and carry on with what does not need it. Some
  helpers' own pushes are still refused: the lead pushes every lane each time it takes a
  turn. Deleting a branch on GitHub is not possible from a cloud session (403).
- **The machine is taken away when it stands idle.** Only what is on GitHub survives.
  Section 5's two lead sessions and two scheduled checks rest on one shared folder and do
  not exist in the cloud: there is one lead, and one scheduled check of the app that
  wakes it every hour (`STATUS.md`, "Next step", says how the build is led there).
- **The progress page** cannot be served from the cloud machine to the founder: a small
  copy of it is published as a private page of the app (`STATUS.md`, the log line of
  2026-11-16, 22:39 UTC).
- **Speed.** Four processors: three heavy turns, one whole lane gate at a time
  (`STATUS.md`, "Lanes").

## 3. What did not come with the repository

| What                                                         | What to do                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The open lanes' folders                                      | Made again from their branches (section 4). Every open lane's work was committed and pushed before the move.                                                                                                                                                                                                                                                   |
| `.env.staging`, the test copy's keys                         | Not needed to build. Needed only for the supervised step "put the test copy online" (T-270), by the chat lead in a session the founder started. The founder carries the file over by hand, or fills a new one from the Supabase dashboard using `.env.example` for the names. Never in chat, never committed, never opened by an unattended run or a builder.  |
| `.local/` working files                                      | Made fresh here (section 5). None of them is needed from the first computer.                                                                                                                                                                                                                                                                                   |
| Pictures of the first demo and pictures made for the founder | `DESIGN.md` is the rule and is complete without them. They were kept out of git because the first demo shows a real school. The first demo's pictures, which `DESIGN.md` sends design leads to, are made again on any computer with `node docs/build/handover/first-demo-shoot.mjs <the repository folder>`. The pictures made for the founder are not needed. |
| The earlier conversations and the app's memory               | What matters from them is in `CLAUDE.md`, the files under `docs/build/`, and sections 6 and 7 here. Save to your own memory what you will need again.                                                                                                                                                                                                          |
| The two scheduled checks                                     | Their prompts are in `docs/build/schedules/` (section 5).                                                                                                                                                                                                                                                                                                      |

## 4. Pick the build up

1. Read, in this order: `docs/specs/v1/PROGRESS.md`, `docs/build/STATUS.md`,
   `docs/build/RUNBOOK.md`, `docs/build/LEADS.md`, `docs/build/DESIGN.md`.
2. "In progress" in `STATUS.md` has one line per open lane, written for you: its branch, what
   is built, what its reviews found, what is left. For each: `git fetch origin`, then
   `git worktree add .local/lanes/<name> lane/<name>` (git makes the local branch from
   GitHub's), and set the lane up as the runbook's section 3 says.
3. Nobody from the first computer exists here. Every lane gets a **fresh** helper, briefed
   from the lane's line and its commits. Each open lane's branch carries a note of its own,
   `docs/build/handover/lane-<step>.md`: read it before you brief that lane's helper. The
   builders' common brief is `docs/build/BUILDER-BRIEF.md`, and the founder's design direction
   in their own words is `docs/build/handover/founder-design-direction.md`.
4. From there the runbook is the method, from its section 1.

## 5. How the build is led: the parts that live in the Claude app

- **The chat lead does not build.** It starts the build's lead session, directs it, checks
  what it reports against the files, and talks to the founder.
- **Two lead sessions** (runbook, section 1): one on the strongest model at high effort, and
  a standby on Opus at high effort that leads only while the week's allowance for the
  strongest model is used up. Start each with the app's session tool and a brief of this
  kind: "You are the lead of the SR Leagues build. Read CLAUDE.md and docs/build/RUNBOOK.md,
  then lead the build from docs/build/STATUS.md exactly as the runbook says. Read line 1 of
  .local/fable-lead.txt at the start of every turn." Tell the standby that it is the standby.
- **`.local/fable-lead.txt`**, four lines: the id of the lead in charge; the UTC time of the
  last wake; `fable <id of the lead on the strongest model>`; `opus <id of the standby>`.
- **Two scheduled checks**, made with the app's scheduled-task tool from the prompts in
  `docs/build/schedules/`: `doorman.md` every ten minutes on a mid-size model (it wakes the
  lead in charge when nobody has shown life for 25 minutes, and switches leads by the
  allowance), and `overseer.md` once an hour (it writes orders when something is stuck). Put
  this computer's folder where the prompts say `<THE REPOSITORY FOLDER>`. Bring the
  doorman's items 5 and 6 in line with the runbook first: since 2026-11-16 a builder pushes
  its own lane with `scripts/push-lane.mjs`. Change a scheduled check only through that
  tool, never by editing its file.
- **Directing the lead:** a message to its session, and for anything that must survive a
  change of lead, one line in `.local/overseer-orders.md` in the form
  `- <UTC time> — <the order>`. The lead's progress command prints every such line.
- **`.local/hold.txt`:** while it exists the doorman does nothing. It is for another tool
  leading, or a deliberate pause. The Claude leads never write it; the chat lead removes it.
- **What the founder looks at** (`.claude/launch.json`): `build-progress` on port 3230, a
  page that shows who is working on what; and `product-preview` on port 3210, the product
  itself (first `node scripts/preview-web.mjs --prepare`, then open
  `http://127.0.0.1:3210/north-valley`: 127.0.0.1, not localhost). Look at the preview
  yourself before you say it is ready.
- **If this app has no session tool or no scheduled-task tool,** lead the build yourself as
  the runbook says, one run at a time, and tell the founder that nothing will restart it
  when a run ends.

## 6. Speed: what the first computer taught (measured 2026-11-16)

The founder asked why a whole night with six lanes landed five steps. Measured from the
helpers' own records: the helpers were at work nearly all the time, and more than half of
that time (54%) was waiting for a command on the computer. It was a 15-watt laptop
processor with six lanes of tests, pictures and test browsers at once: 21 to 26 jobs in
line. Ten helper-hours of one night went into waiting loops, each turn of which is a paid
model call. So:

- **Nothing whole runs on this computer.** A helper runs the test files that cover its
  change, by name, plus `npm run check` and the typecheck of the packages it touched. The
  whole gate is GitHub's, on its own machines: `node scripts/push-lane.mjs` in the lane, then
  `node scripts/wait-for-github.mjs <the names it printed>`.
- **No waiting loops**: no `sleep`, no `until grep`, no "echo waiting". A long command runs
  in the foreground with a time limit of 600000.
- **Heavy commands take a turn**: `node scripts/heavy.mjs -- <command>` for a typecheck, a
  site build, a browser test, pictures. At most three at once on the whole computer; a
  number in `.local/heavy-slots.txt` changes the three. On a stronger computer raise it and
  watch whether commands slow down.
- **One helper carries its lane** through the fix round, the catch-up merge and the reruns.
  Fresh helpers are for the independent reviews, which run at the same time on one commit.
- **A landing queue**, and shared lists that no longer collide (step 2.188; runbook,
  section 3).
- **GitHub gives this repository twenty machines at once.** When its check runs as many
  jobs side by side (step 2.191: eleven of them, the whole result in under five minutes),
  pushing a lane and its twin at the same moment asks for more than twenty and doubles the
  wait. Push the twin when the first run is done, or only for the last pass before a
  landing.
- **If the app refuses a builder's push,** the lead pushes that lane itself, and nobody
  looks for a way round the refusal. It happened once, in a lane whose brief still said
  that builders never push.
- When the founder asks why something is slow, measure before you answer. The app keeps a
  record per helper under its projects folder (`<session>/subagents/agent-*.jsonl`): the
  times of the entries and of each command and its result are enough.

## 7. What the founder has said that is not in CLAUDE.md

- **The allowance.** The plan has weekly limits that reset on Saturdays at 22:00 UTC. The
  founder, 2026-11-15: use the week to the end, no reserve, and never let the build die out.
  Their last extra reset was used on 2026-11-16, so when the strongest model's week runs out
  the standby leads until Saturday. Turning on paid extra usage costs money: theirs alone.
- **Thorough and fast, both.** 2026-11-14: "this isn't about UI, it's about not compromising
  on ANY part of this". Nothing is built or reviewed below Opus, leads and design work are on
  the strongest model, and a mid-size model decides nothing. 2026-11-16: steps being added
  by reviews is welcome ("it means we are thorough"); what is not welcome is a step taking
  hours. Do not answer a question about pace by pointing at the growing plan.
- **They will not change models or settings by hand** for the build, and must never have to
  come and check that it is moving.
- **What they test first** (the chat lead's order of work, 2026-11-16). Test 1, on the
  computer: one made-up league from empty to a final table, with a game scored live from
  tip-off to final. Test 2, online and on phones: the same on the test copy (T-270). Lanes go
  to those first; everything else keeps its place in the plan and follows.
- **What waits for them** is listed under "Needs the founder" in `STATUS.md`. None of it
  stops the build.

## 8. Your first words to the founder

A few plain lines: whether this computer is ready or what is missing and who must fix it;
where the build stands; what you have started. Then keep it moving without asking.
