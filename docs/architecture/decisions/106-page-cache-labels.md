# 106 — Page cache labels

Date: 2026-11-23. Step 2.26 (T-309). Serves T5 §4, T6 §6 and §7, T-66, T-119, T-130, T-150.

## Problem

A parent opening the standings after a game should get a fast page that is right within seconds of the final, and nothing drawn for one person may ever be served to another (T-66). The spec said labels such as `league:{id}:standings` are cleared "for that season", without saying how a season is named in a label, where labels are made, or what is cached while pages are still drawn per request (T5 §4, step 2.127).

## What

- **Labels** (`packages/providers/src/page-cache/page-cache.ts`): `league:{id}`, `league:{id}:season:{id}:standings|results|stats`, `league:{id}:game:{id}`. Every label starts with its league and holds ids only. The web app labels its answers with these helpers and the worker clears with them, so the two cannot drift.
- **The port** `PageCache.clear(labels)`, with three adapters: the local stand-in (records what it cleared, for tests and local work), "off" (succeeds doing nothing), and Cloudflare's purge by cache tag (`POST /client/v4/zones/{zone}/purge_cache`, `{ "tags": [...] }`, 30 tags a call, 4 s wait). Failures are fixed codes the job queue already knows (`not-authorized` not retried; `rate-limited`, `unavailable`, `unexpected-answer` retried), never Cloudflare's words or the token.
- **Core**: `clearPagesOnGameFinalized` and `clearPagesOnGameReopened` (standings module, in core's `eventHandlers`) record one `cache.clear` job with `{ seasonId, gameId }` in the result's transaction (T-130): no job if the result is refused, and it runs only after commit. No dedupe key: finalized, reopened and finalized again clears each time, and clearing twice is harmless.
- **Worker**: `cache.clear` is always offered; it clears `labelsForGameResult`. Local and test get the stand-in; staging and production get "off" until a zone and token are given.
- **Web**: `cache-headers.ts` has two answers only. `sharedFor(seconds ≤ 2, labels)` is `public, max-age=0, s-maxage=N` plus `Cache-Tag`; `notKept` is `private, no-store`. The snapshot is shared only to a visitor of a live or archived league with no sign-in cookie (as before), now labeled with its league and game. Every page stays `private, no-store`: the account button, the refusal screen's "signed in as" and a staff member's pencil are drawn into the page, so where it is unclear the page is not kept.

## Why "off" outside local work

Nothing a shared cache keeps carries a label there yet except the snapshot, which expires in 2 seconds by itself. Wiring Cloudflare needs a zone and a token from the founder's account, which a builder never holds (T-201).

## Not done, not verified

- The Cloudflare adapter is tested only against made-up answers shaped like Cloudflare's; which plan purges by tag and the per-call limit are checked when the zone is set up.
- Pages are not shared-cached yet: that waits for the personal parts to load after the page (T-95, step 2.127). The labels for standings, results and statistics pages are ready for that step; publishing a release (clearing `league:{id}`) is not wired.
