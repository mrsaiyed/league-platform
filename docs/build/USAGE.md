# Usage: how this build spends the week's allowance

Written by the lead on 2026-11-22, after the build used a whole week's allowance and three resets in about two days. The founder's words: "this is unacceptable… diagnose and fix this… without compromising any quality", and: "no more fable except you or the top lead, and allow opus to have decision making power". WHERE THIS FILE AND `RUNBOOK.md` DISAGREE, THIS FILE WINS.

## What went wrong (measured, not guessed)

- On the night of 2026-11-17 the lead opened 40 helper sessions in about 70 minutes. Together they cost $551 at list prices, most of them unfinished: a builder's session cost $17 at the middle and up to $32; one audit cost $69; a review on the strongest model cost $8 against $3 on Opus for the same kind of work.
- Nearly nine tenths of that was RE-READING. Every command a session runs makes it read its whole conversation again. Builders had been told to read whole documents (this build's status file alone had grown to 319 KB, the plan to 449 KB), to run the whole gate, to look at dozens of pictures and to wait for GitHub, so a conversation grew to 150,000 to 480,000 tokens and was re-read 500 to 1,100 times: 60 to 200 million tokens for one step.
- Sessions sat waiting (for GitHub, for the lead, for another lane), and a session that waits more than an hour pays full price to read itself again.
- Thirty lanes at once meant thirty half-finished lanes when the allowance ran out, and merges between them.
- An hourly wake-up fired 100 times while nothing could run.
- Reviews turned small things into long fix rounds, and audits added 35 steps in one night.

## The rules

1. **The meter.** The week's usage is a number the lead can read: `list_events` on the lead's own session with `kinds: ["rate_limit_event"]`; the newest event's `unifiedWindows.seven_day.utilization` (0 to 1) and `resetsAt`. The lead reads it at every landing and writes it in `STATUS.md` ("Usage"). THE PACE LINE is the share of the week that has passed plus five points. Above the line, nothing new is opened until usage is back under it.
2. **Models.** The strongest model is for the lead only. Builders and reviewers are Opus (effort medium; high only where the lead says so: the scoring screen, sign-in and safety, a migration that changes a guard). Merges, publishing, notes and counting are Sonnet or Haiku.
3. **Three lanes at once, not thirty.** A lane is finished and landed before another is opened. The first test's line first, then the second's, then the rest.
4. **A helper session is short.** One part of a step, about 150 commands at most (a review: 80; a confirming look: 40). It never waits: not for GitHub, not for the lead, not for another lane. When its part is done, or it nears its limit, it commits, pushes, writes what is done and what is left at the top of its lane's note (`docs/build/handover/lanes/<step>.md`, 40 lines at most), reports in 12 lines and ends. What is left goes to a fresh session that reads the note.
5. **Reading.** A helper reads what its brief names and nothing else: never `STATUS.md`, never the whole plan or a whole audit. Long files by search and by line range.
6. **Output.** Every command's output is cut to its last 30 lines (`2>&1 | tail -30`); tests run quietly and are read only where they fail. At most six pictures are looked at in a session.
7. **Checks.** A helper runs `npm run check`, the type check, its own test files and its own browser test. The whole gate runs on GitHub's machines only. The lead reads GitHub's answers for all lanes in one command; a lane lands only on a pass, as before.
8. **Decisions.** A builder decides the technical questions of its step and writes them down (a pending decision file, "Agreed (delegated)"). For a product question it takes the written recommendation, or else the choice that leaves a league's admin the most room and is easiest to change, writes it as a pending decision "Decided for you" with its reason, and builds on. The lead reads every one at landing and may change it. What costs the founder money, needs their hands, touches a live site or real people's data, or goes out in their name still waits for the founder.
9. **Reviews.** One independent review for each lane, on Opus, with a limit. A second one, by use in a browser, only for the scoring screen, for sign-in, and where a child's record is shown. A fix round takes what is High or Medium and inside the step; everything Low is one line in `docs/build/polish.md` and is done in batches. A review's leftover becomes a new step only when it is High.
10. **No new audits** until both tests are in the founder's hands.
11. **`STATUS.md` stays short** (a few screens): now, one line for each lane, what needs the founder. The log is `docs/build/LOG.md`, which nobody is told to read.
12. **No timed wake-ups.** A helper's report wakes the lead; nothing else does.
