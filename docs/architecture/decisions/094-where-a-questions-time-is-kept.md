# 094 — Where a question's time is kept

Date: 2026-11-23. Step 2.221 (the area 3 lead's confirming look at step 2.158). Serves A-5, S-75 and T-271 ([record 067](067-how-a-forms-answer-travels.md)). Its decision row waits for a T- number from the lead (none was reserved for this step).

## Problem

Step 2.158 made "Forfeit, postpone or cancel" ask first, and took a "Yes" sent within 0.8 seconds of the question as the second tap of a double tap, which asks again. Three things were left:

1. The time came from a hidden field of the form, so a hand-made post could say the question was asked long ago.
2. Every "Yes" too soon asked again with a NEW time, so the wait started again on every tap: "Yes, cancel it" tapped every 250 to 450 ms never went through in 6 seconds. With scripts on, "Yes" took no tap for its first half second and said nothing about it.
3. With scripts off, if the button tapped stood exactly where "Yes" lands on the page drawn anew, a second tap 0.8 seconds later went through.

## What

- The server keeps the time a question was first asked, in its memory, keyed by who asked and in which league (from the session), the asking form's one-time token, the game and the change (`apps/web/src/server/question-times.ts`), for an hour, at most 5000. The form's own time is never read.
- A "Yes" too soon, or a "Yes" the server knows no question for, asks again, keeping the first time if there is one. "No" forgets the question; the change running forgets it. Sending the asking form again is a new question.
- The wait is 1 second (`askRestMs`, `call-off-step.ts`): longer than a second tap at 0.9 seconds with scripts off, and no longer than the browser tests' "read the question" pause.
- The server's answer says how much of the wait is left (`readyInMs`). With scripts on, "Yes" is drawn as not ready (`aria-disabled`, a dashed edge, a waiting pointer) for exactly that long, takes no tap meanwhile, and takes the first tap after. A tap too soon sends nothing, so it can never start the wait again.

## Why so

- Kept with the token, as the answers to saves are (record 067; the web app runs as one server, T-270): no new table, nothing in the address, and a hand-made post gains nothing. A restart forgets the questions; a "Yes" then asks once more, which loses nothing.
- The wait measured on the server holds with scripts off too. The page's own wait comes from the server's answer, never its own clock against the server's, so the two agree on any machine.
- One second, not more: a person who has read the question is not kept waiting, and "Yes" tapped every 300 ms goes through within 1.5 seconds.

## What it does not do

With scripts off, a second tap one second or more after the first, on a "Yes" drawn exactly where the button stood, goes through. By then the question has been on the screen for most of a second; nothing short of a second step can tell that tap from a person's "Yes".
