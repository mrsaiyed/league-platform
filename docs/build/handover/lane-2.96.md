# Handover: lane 2.96 (and step 2.192)

Branch `lane/2.96-kept-emails` (also pushed as `lane/2.96-again`), opened from `build/stage-1`, with `build/stage-1` merged in at b18b11a1's tools. Written 2026-11-16 by the builder of step 2.96.

## The step, with the lead's three additions

- **2.96 "Reading kept emails"** (`docs/build/STAGE-2.md`, search `**2.96 `): on a local run the made-up data's emails are kept in `.local/captured-email/` and shown on ONE local-only page, so a new address finishes signing up by reading its code there and an invitation link can be followed; a local-only "be this made-up person" page; both answer "not found" outside APP_ENV local and test, decided on the server; no code in any log line; decision record 075 (T-279) on how the lead reads the test copy's emails.
- **Addition 1:** both pages also work with `LOCAL_DATA=made-up-database` (the seeded local database), so a browser test signs in there as a seed league's owner by reading the code. Never give anyone a password; never change how start-up signs people in.
- **Addition 2:** no browser chain and no `npm run test:web` on the old computer: the browser test and the web shell cases were written and left to GitHub (the new browser test was allowed to run once by name, and passed).
- **Addition 3 = step 2.192**, its own commit: the made-up draft league Still Waters gets one current season and nothing else, adults.

## What reading found

- The stand-in's refusal outside local and test was `appEnv === 'local' || appEnv === 'test'`, written twice (startup.ts, stand-in-ports.ts). It is now one function, `runsOnMadeUpData` (`apps/web/src/server/made-up-mode.ts`), used by startup, the stand-in and the pages' gate.
- Staging and production cannot serve any page today: start-up refuses them (record 055), so "not found" in those modes cannot be asked of a running server. It is proved in unit tests that run the real pages and the real action with the real settings check for staging and production (below); the web shell check proves both modes refuse to start.
- packages/providers' `captureEmail` already writes `.json` + `.html` files given a folder; the worker uses it with `EMAIL_CAPTURE_DIR`.
- The stand-in cannot send invitations (its access store refuses them), so the browser test writes its own kept invitation email.
- No query lists people across leagues; on the made-up database the people are listed from packages/database's `seedLeagues` (the data the database is loaded from).
- The made-up sign-in service has no code-only sign-in: on the made-up database "be this person" asks for a code, reads it from the capture in memory, proves it, and leaves the browser on "Choose your password", as after any sign-up.

## Built and committed (all checks below passed locally)

- `0bf9ed54` the pages, the gate and their unit tests: `apps/web/src/server/{made-up-mode,kept-emails,local-tools,local-only,made-up-database-people}.ts`, `sign-in/{be-made-up-person,local-actions}.ts`, pages `apps/web/src/app/(platform)/signin/{kept-emails,made-up-people}/page.tsx`, `localTools` in `ports.ts` / `stand-in-ports.ts` / `database-ports.ts` / `startup.ts` / `container.ts`, `platformPages.keptEmails` and `.madeUpPeople` in core, messages `standIn.keptEmails.*` and `standIn.madeUpPeople.*` in `packages/site/src/messages/en/site.ts`, names on `stand-in-sign-ins.ts`, `membershipsInWords` in features/shell.
- `f73eb3e3` `tests/browser/kept-emails-test.mjs` (passed once here, 17 checks), the web shell check's cases, record `docs/architecture/decisions/075-reading-kept-emails.md`, pending row `docs/specs/v1/decisions-pending/T-279.md`, T7 §6 note, `docs/operations/run-it-locally.md`.
- `92a470cc` step 2.192: `stand-in-world-seed.ts` (`emptyLeague` in the cast, `standInSeasonIds.empty`, season "First Season", rules `{version: 1}`, audience adult), `stand-in-cast.ts`, `stand-in-world-seed.test.ts` (counts of every league asserted; the "one round today" check names the empty league as the one current season with no round), two web shell cases, four lines in run-it-locally.md.

## How each page is refused outside local and test

1. Both pages and the action first call `localTools()` (`local-only.ts`), which asks `runsOnMadeUpData(getConfig().APP_ENV)` BEFORE the app's ports; outside local/test it gives undefined and the page or action calls Next.js's `notFound()`.
2. Only ports built on made-up data carry `localTools` (the stand-in's; the made-up database's from startup); a real database's ports carry `null`.
   No header, cookie or address takes part. Proved by `apps/web/src/server/local-only.test.ts` (staging and production: both pages and the action, posted directly, throw `NEXT_HTTP_ERROR_FALLBACK;404` and never ask for the ports), `made-up-mode.test.ts` (the gate and the stand-in's refusal share the test). Web shell: `/signin/kept-emails/*.json|.html` are 404, no visitor page links to either page, staging and production refuse to start. "Be this person" makes no session of its own: it runs `signInWithPassword` (stand-in) or `askForCode` + `enterCode` (made-up database) on the sign-in stand-in (`be-made-up-person.test.ts`). Kept files: only addresses on made-up names (`.test`, example.com …), only after start-up, in git-ignored `.local/`; nothing serves them. Log check: `be-made-up-person.test.ts` greps every logger line and console call of a sign-up for the code, address and token.

## Record 075 / T-279 choice

Local: kept on disk for made-up addresses, read on one local-only page. Test copy: kept in the test copy's own database table (owner-only), read by the lead with a script in a supervised session with `.env.staging`; built only when the test copy first sends email (it cannot serve today).

## How a browser test signs in as a seed person on the made-up database

Ask on `/signup` ("Email me a code"), open `/signin/kept-emails`, read `li[data-kept-email="<address>"] code[data-code]`, type it on `/signup/code`, choose any 8+ character password on `/signup/password` (see `signUpByTheKeptCode` in `tests/browser/kept-emails-test.mjs`).

## Half built / not started

- Not run here (left to GitHub): `npm run test:web` with its new cases (the two pages, file routes 404, no links, production refusing to start, Still Waters' Teams and Schedule), and the other browser tests that sign in (web exit, find-their-way). GitHub's result for `92a470cc` was still running when this was written.
- Not built: the test copy's kept-emails table and script (record 075, needs a migration); offering the stand-in's token-only staff (draft league admin and others), who have no sign-in.

## Next three things

1. `node scripts/wait-for-github.mjs lane/2.96-kept-emails lane/2.96-again`; on a failure `node scripts/github-check.mjs lane/2.96-kept-emails`, fix (most likely a web shell case's expected words) and push with `node scripts/push-lane.mjs --times=2`.
2. Hand the lead what to record: step 2.96 and 2.192 done, T-279 to fold, record 075, the made-up database's sign-in by code for later tests.
3. When the test copy first sends email, build record 075's table, store and script.
