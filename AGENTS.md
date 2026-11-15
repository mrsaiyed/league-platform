# Instructions for any coding agent (Codex and others)

The rules of this repository are in [CLAUDE.md](CLAUDE.md). They were written for every AI session, whatever tool it runs in, and they apply to you word for word: where that file says "the lead", "a run" or "a builder", read "you". Read it now, in full, before anything else. If this file and `CLAUDE.md` ever disagree, `CLAUDE.md` is right.

The rest of this file is for an agent that is asked to carry on the build after the Claude sessions that led it. Everything those sessions knew that matters is in the repository. Nothing depends on a past conversation.

## Taking over the build

1. **Read, in this order:** `CLAUDE.md`; `docs/specs/v1/PROGRESS.md`; `docs/build/STATUS.md` (where the build is, what is open, what waits for the founder); `docs/build/RUNBOOK.md` (how a run works); `docs/build/LEADS.md` (who owns each outcome, and what "good" means there); `docs/build/DESIGN.md` (the standard every screen is held to).
2. **Make sure you are the only lead.** Two leads writing the plans at once has caused a mix-up in this build before.
   - If `docs/build/.lock` holds a time less than 40 minutes old, or a lane branch has a commit that recent, another lead may be working. Stop and tell the founder.
   - Write the git-ignored file `.local/hold.txt` with one line: the UTC time and "another agent is leading the build". While that file exists, the scheduled Claude check on this computer stands aside and wakes no Claude lead. Leave it there for as long as you lead.
3. **Take the lock.** Write the current UTC time (ISO format, one line) into `docs/build/.lock`, and rewrite it at least every 15 minutes while you work.
4. **Find the open work.** "Now" and "In progress" in `docs/build/STATUS.md` are the map: one line per open lane, saying what is built, which reviews are in and what is left. `git worktree list` shows the lanes on disk (folder `.local/lanes/<step>`, branch `lane/<step>`). `node scripts/build-dashboard.mjs` lists the steps that can start now, most useful first, and prints anything that is stuck.
5. **Carry on as the runbook says.** Finish and land the open lanes first, then open the next steps in the order `STATUS.md` gives.

## What is different for a tool that is not Claude Code

- **Model names.** The runbook's table names Claude models (`fable`, `opus`, `sonnet`). Use the strongest model you have, at high reasoning effort, for everything: leading, building and reviewing. Never a small or fast model.
- **Helpers.** The runbook has the lead start helper agents, one per lane, several at once. If your tool can run separate tasks side by side, give each its own lane folder. If it cannot, work one lane at a time.
- **Reviews stay independent.** Nothing lands on the word of the session that wrote it. Every lane is reviewed by a fresh session or task that did not write the code and is given only the step's line, the diff and the files it needs. A step with a screen is also judged from pictures (`node scripts/shots.mjs`; `docs/build/DESIGN.md`).
- **The gate runs on GitHub.** Push the lane branch and read the result with `node scripts/github-check.mjs <branch>`. On this computer run only `npm run check`, `npm run typecheck`, `npm run format:check` and the test files of what changed. GitHub answers about 60 questions an hour from this computer, so never ask in a loop.
- **Landing.** `git merge --no-ff` of the lane into the build branch named in `STATUS.md`; tick the step in its stage plan; write the log line; push; then `node scripts/promote-to-main.mjs`. That script is the only thing that ever moves `main`. Never pass it `--release-tracker`.
- **Commits** are small and frequent, and authored by the git user already set up here. Change no git setting, and do not add a co-author line naming a Claude model to work you did.
- **Product questions** are not asked of the founder and do not stop a step. Answer them as `CLAUDE.md` says ("Decided for you"). Never mark one "Agreed": only the founder's own words do that.
- **Made-up data only.** Never connect to anything but made-up data on this computer. The Supabase project named in `supabase/site.json` is the live Al-Hadi tracker's: never touch it. The file `.env.staging` is used only as `CLAUDE.md`'s hard limits say, by a lead in a session the founder started, never in unattended work.
- **Working files that are not in git** are under `.local/` and exist only on this computer: the founder's design direction (`.local/founder-design-direction.md`), pictures of the first Al-Hadi demo that the look is held against (`.local/reference/first-demo/`), pictures kept for the founder (`.local/for-the-founder/`) and the newest pictures of the product (`.local/shots/`).

## Handing back

Bring `docs/build/STATUS.md` up to date so that the next lead needs nothing else: every open lane on its own line, its work committed in its lane. Leave the main folder clean with its last commit pushed. Then delete `docs/build/.lock`, and delete `.local/hold.txt` so that a Claude lead can be woken again.
