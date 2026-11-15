# 067 — How a form's answer travels: never in the address

Date: 2026-11-15. Step 2.155, part 1 (the games list and the box score grid); answers the 2.106 audit's findings H6, M2 and M8 and the review of step 2.154; serves A-4, A-8, T-26 and T-184. Decided by the lead (technical), written by the step's builder. T-271.

## Problem

Every admin form answered by sending the browser back to its page with the answer in the address (`?problem=tie-not-allowed`, `?done=final&game=…`, on the games list even `?ask=…&home=51&away=47`). The page was then drawn again from what is saved, so:

- a refusal emptied every field: twelve players' points copied from a paper sheet, gone after one tie (H6);
- "Saved" stood at the top of a page whose changed thing could be two screens below, in the same words for everything (M2);
- a reload repeated an old "Saved: …", because the answer stayed in the address (review of 2.154);
- a double tap was answered "Someone else changed …": the second post carried the version the first had just moved on (M8);
- a tie in a season without ties was asked about, refused after "Yes", and the boxes shut with what was typed gone.

## What

**A form's answer never rides in the address.** The address says which screen and, after a save, the place on it (`#game-…`, `#box-score-scores`); nothing typed and nothing about the answer.

**A refusal is answered in the response to the post itself, drawn from the posted values.** Each form that can be refused is a client component using React's `useActionState`; its server action returns the refusal (`form-state.ts`: the command's error code, the posted fields as typed, the names of the wrong fields, and the general sentence from the message files). Every box is drawn again with what was posted, the wrong ones carry `aria-invalid` and point to the sentence (`aria-describedby`), and the sentence, in the shared `ui-field-error` style, sits beside them and names the box or the score ("Tigers 30, Lions 30 is a tie, and this season does not allow ties. …"). Nothing typed is kept anywhere else. With scripts off, React's form state does the same in the page that answers the post: the form's permalink takes the browser to the game's place on the list, or to the grid's scores. When the game itself may have changed (any refusal but a typing mistake), the screen is drawn again as it is now in the same answer (Next.js `refresh()`), keeping what was typed (A-8: the latest is shown).

**A save is answered with a one-time notice, read once, so a reload shows nothing old.** The action leaves a notice for the person who saved, in that league (`server/saved-notice.ts`): only which screen, which thing (a game) and what was done to it, as the last part of a message key. The screen takes it as it is drawn, which clears it, and says "Saved" beside the thing, naming it from the game as it is now ("Saved: Tigers 47, Lions 51 is final."; on the grid, beside the scores, "… is final, with its box score."). With scripts off the answer is a post-redirect-get to the screen's place for the thing. With scripts on, when the screen is the form's own, it is drawn again in the answer to the post (`refresh()`), where the person is looking, and the notice line brings itself into view if the redraw moved it (`saved-line.tsx`). A reload is a fresh get: the notice is gone, and the address never held it.

**A repeated post of the same save is the same request.** Each form that saves carries a one-time token made as it is drawn (`requestToken`). The server keeps the answer to each post for ten minutes, by who sent it, the token and exactly what the form held (`server/same-request.ts`): a second post of the same form waits for the first and is given its answer, so it saves nothing more and is never answered "someone changed this game". The same form with something changed is a new request, so a person who corrects a refused box is not given the old refusal. With scripts on the form also goes quiet once sent (`use-one-submit.ts`): a second tap before the answer sends nothing.

## How it was fitted to the code

- **Why not post-redirect-get with scripts on.** It was built that way first and failed in a real browser, twice: a cookie the action sets is not seen when Next.js draws the redirected page inside the answer to the post; and when the redirect is to the form's own page with only a different place (`#game-…`), Next.js's router keeps the page it has and only scrolls. So with scripts on, a save on the form's own screen is answered by drawing that screen again in the answer (Next.js's documented `refresh()` for server actions); a save that leads to another screen (a game reopened from its grid goes back to the games list) is still a redirect. Both leave the same notice and neither puts anything in the address, which is what this decision is for.
- **Why in the server's memory, not a cookie.** Because of the first point: a cookie set by the post is invisible to the drawing that answers it. The notice and the answers to posts are kept in this server's memory, on `globalThis` (Next.js may load a file twice in one process, as `container.ts` says). The web app runs as one server (T-270). A notice nobody takes is gone after a minute. If the app ever runs on more than one server, both stores move behind a port the servers share (a table, or a cache); until then a restart forgets them, and the commands' own version checks still refuse a stale repeat.
- **The commands are unchanged.** `runBoxScoreAction` now says which boxes are wrong (`wrongBoxScoreFields`) and, for a tie, the score the sheet came to; nothing in `packages/core` changed. The double-tap answers of step 2.154 (`run-game-action.ts`, the reopen) stay as they were.

## What else was considered

- **The answer in the address, the typed values too.** Refused: the values would sit in history and in a link someone shares, a reload repeats the answer, and it does not scale to a twelve-player grid.
- **Each form's typed values kept in the browser's storage.** Refused: it needs scripts, survives into the next visit, and says nothing to a person with scripts off.
- **A token kept in the database.** Not now: no migration in this step, and one server needs none. It is the way to go with more than one server.

## Not done here

- Part 2 of step 2.155 (the schedule grid, teams and rosters, league settings) still answers in the address; it takes this record's pieces (`form-state.ts`, `same-request.ts`, `saved-notice.ts`, `use-one-submit.ts`, `saved-line.tsx`), which today live in the games area and the web app's server folder.
- The sign-in screens still show a problem by its name in the address (record 031). They are not admin forms and hold no typed data in it; whether they follow this record is for the lead.
- There is no shared style for a marked field: the wrong box carries `aria-invalid`, and its sentence the shared `ui-field-error` style, but the box itself looks as before (DESIGN.md section 1: the design lead adds the piece).
- A tie in a season without ties is still found only after "Yes" on the games list (the command knows the season's rules; the list does not). It is now said beside the boxes, which stay open with the tie in them.

## Revisit if

The app runs on more than one server; Next.js draws a redirected page with the cookies the post set, or redraws a page sent to its own address with a new place on it (then a save can be a post-redirect-get with scripts on too); or a form needs to keep a file it was given.
