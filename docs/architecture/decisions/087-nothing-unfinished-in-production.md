# 087 — Nothing unfinished in production

Date: 2026-11-17. Step 2.140 (T-289). Serves T-157 (unfinished features ship switched off behind our own rollout flags) and T-100 (the third question: have we released it). Answers finding M13 of the audits of 2026-11-15 (`docs/build/audits/nothing-left-out.md` and `using-it.md`). Decided by the lead's builder of step 2.140, to be confirmed when the step lands.

## Problem

Step 2.95 releases whatever is on the branch. Before this step a live league's admin listed Registration, People, Standings and stats, Site and Messages, each an empty panel ("This part of the admin is not ready yet."), and public addresses such as `/register`, `/my`, `/news`, `/terms` and `/start` answered "This page is not built yet." to every visitor. Nothing in the code said what was released.

A second, quieter leak: Next.js sends, inside every page that a dynamic route answers, the names of the routes beside it (the tree's `"s"` list, used by its router to guess where a link goes). Every league page named `my`, `news`, `players` and `register`; every unknown admin address named `people`, `registration`, `site`, `standings` and `messages`; every league page named `terms`, `privacy`, `start`, `find`, `help`, `contact` and `status`. So even a page that answered "not found" for an unbuilt address would have been told apart from an address that does not exist: its answer was drawn by a different route, and every other answer named it.

## What

- **One list.** `apps/web/src/server/releases.ts` names every page of ours (`platformPages`), every page of a league (`leaguePages`) and every area of the admin as `released` or `not-built`, typed against the address helper's own tables, so a page added there and not classified here fails the type check. It replaces the staff area's own list of areas with a screen (`readyAreas`).
- **The mode.** `showsUnreleased`: pages not built yet are drawn in local work and tests (`APP_ENV` local or test, the same one test that chooses made-up data, `made-up-mode.ts`) unless `LOCAL_UNRELEASED=hidden`; never in staging (the online test copy) or production, whatever else is set. `LOCAL_UNRELEASED` is a new setting, refused outside local and test like the other `LOCAL_` settings: it exists so a check on this computer can see exactly what a live league shows, since neither staging nor production can start here (record 055). Nothing a request carries changes it.
- **No route of its own.** A page not built yet has no route file. Its address falls to the route that answers every unknown address at its place: the league home for one word (`/terms`, `/start`), `[league]/(site)/[...missing]` below a league or one of our words (`/{league}/register`, `/account/inbox`), `[league]/admin/[...missing]` in the admin. That route asks `features/unreleased` first; only where pages not built yet are shown does it draw the placeholder, and otherwise it goes on exactly as for an address that does not exist. This is how step 2.96 made its two local-only pages unreachable outside local work (record 075), and it is the only way found to be exact: with the route file kept and told to answer "not found", the answer's page data still carries the static route and Next.js's lists still name it.
- **Nothing leads to one.** The admin's menu lists only the areas that may be shown; its home names no area still to come (the "Coming" list is local only), and someone whose areas are all still to come (an editor today) is told calmly that what their role looks after will be listed there, with the way to the site. Terms and Privacy, the footer's links, are built (step 2.135), so the footer is the same in every mode. The public menu already listed only built pages; no sitemap exists yet (when one is built it must read the list).
- **Access is untouched.** Who may open the admin or an area is the league gate's alone, the same in every mode. A registrar may still open the admin's home; an area not built yet is simply not there.

## Proof

`tests/browser/nothing-unfinished-test.mjs` starts the same build as local work runs it and with `LOCAL_UNRELEASED=hidden`: each kind of staff walks the admin's menu at 390 wide by taps, scripts on and off; every public address is asked as a visitor, a member and the owner, and every link drawn is followed; every unbuilt page's and area's address is compared over HTTP with an unknown address (status, headers but the date and length, markup and page data, the asked word put in the same place), for a visitor, the owner, a scheduler at an area not theirs and a registrar at their own; and the routes Next.js lists at each level are read. `apps/web/src/server/releases.test.ts` fails if a page the list calls not built gets a route of its own, or a released area loses its route.

## Considered

1. **The route file stays and calls `notFound()` outside local work.** Refused: the page data carries the matched route (a static segment, not the catch-all's value), and every neighbouring answer names the route. A page not built yet could be told from one that does not exist.
2. **The proxy rewrites an unbuilt address to a known unknown one.** Refused: the answer then carries the address it was rewritten to, not the one asked.
3. **The list in `packages/core`.** Refused for now: it is about this web app's routes and modes; core holds the address tables it is typed against. The worker builds no address to an unbuilt page today; if it ever needs to know, the list moves to core.

## Building a page from now on

A page is released by building it: its own route file, and `released` in the list, in the same change (the test above fails on one without the other). A page built but not to be shown yet stays `not-built` and is drawn from `features/unreleased` until it is. Steps 2.135 (Terms and Privacy), 2.168 (`/{league}/my`) and the People area were built while this step waited: each is marked released, and `releases.test.ts` fails if a folder of the admin is an area the list leaves out or leaves not built.

## Not done yet

- A league's own switch (T-100's second question) and the agreement (the first) are features' own and not built.
- Our own placeholders in local work have no way on (DESIGN.md section 4, line 19); they are never seen outside local work.

## Revisit if

A page must be released to some leagues before others (then the flag needs a league's id, and the list becomes data), or the worker or emails must link to a page that may not be released.
