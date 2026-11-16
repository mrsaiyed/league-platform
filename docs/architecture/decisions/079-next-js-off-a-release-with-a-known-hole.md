# 079 — Next.js off a release with a known hole

Date: 2026-11-16. Step 2.193 (T-283). Serves T-201, T9 section 9, T1 (the stack). Decided by the lead; built by the builder of step 2.193.

## Problem

The web app was pinned at Next.js 16.4.3 (record 020). Next.js asks its own advisory service, at every `next build` and `next dev`, whether the installed release has a known hole. For 16.4.3 the answer was yes, and on any computer that is not GitHub's (where `CI` is not set) Next.js then did one of two things:

- **For an AI helper**, it stopped the command with exit code 1 and the words "Your version of Next.js is affected by a known security vulnerability. **We strongly recommend you upgrade Next.js.** This command stopped to show the upgrade recommendation. Retry the same command to continue the original task." It went on to tell the helper to ask the user whether to run `next upgrade --agent=security` (reference: npm's bulk advisory service). The same command run again within five minutes passed (a receipt in `apps/web/.next/cache/next-agentic-upgrade-retries`), so a helper's build failed once by chance and passed on the retry.
- **For a person at a terminal**, it showed a menu ("Installed Next.js version 16.4.3 is affected by a known security vulnerability", with "Next.js security version upgrade available") whose "Update" runs Next.js's own upgrade in their folder. The founder would have met it at the first start of Test 1.

On GitHub's machines `CI` is set, nothing is asked and nothing stopped, so the gate never saw it.

## The hole

`npm audit` named one advisory for `next`: **GHSA-mfr8-8qww-v76h** (CVE-2026-119790), "Information disclosure across root params when a 'use cache' function is called through unstable_cache()", affecting 16.3.0 to 16.4.4, fixed in 16.4.5. When the same `'use cache'` function that reads a root parameter (often a tenant or a locale) is called both directly and through `unstable_cache()`, a race at a cold start can store one tenant's result where another tenant's request reads it. GitHub rates it moderate (CVSS 4: 6.3); Next.js's own post calls it high.

16.4.5 was Next.js's November 2026 security release (published 2026-11-03). It fixed six more moderate holes: nested `'use cache'` functions disclosing across root parameters (GHSA-vc7v-qv4w-wrv8); binary `'use cache'` arguments sharing one cache identity (GHSA-rhh4-g77r-r9qj); a shared page shell poisoned by a crafted address under `next start` with Cache Components on; a fetched `Response` forwarded unchanged with stale compressed framing, which behind some HTTP/1.1 proxies can hand one client's answer to another (GHSA-pc58-hwjq-p385); cookies set by `NextResponse.cookies.set()` in Edge route handlers readable in an internal header (GHSA-f3mh-rxg3-f5g2); and an SVG passed off as AVIF to Image Optimization (GHSA-7qx7-33qx-rqx2).

**Was the web app ever exposed? No, on every count, and it is not online.** It has no `'use cache'`, no `unstable_cache`, no Cache Components (`cacheComponents` is not set); no route handler runs on the Edge runtime (the one that sets cookies, `signin/google`, is a Node route); no route forwards a fetched answer unchanged (every `fetch` in the app is in the browser); and it uses no `next/image` and allows no remote images. The web app is not online, so nobody could have been reached through it; the test copy must not go online on a release with a known hole.

## The second pin: the hosted scoring pilot

`apps/varsity-hosted` is a separate npm project (not a workspace, so the root `npm audit` cannot see it) with its own `package.json` and lockfile. It pins `next` and `eslint-config-next` at **16.3.4**, inside the advisory's range, and its README calls it the deployed, owner-private online scoring pilot. It is the one part of the repository on a vulnerable Next.js that is online.

**It does not run Next.js's own server.** It is built and served by vinext (1.0.0-beta.5), which runs Next.js apps on Vite: in production a Cloudflare Worker calls `vinext/server/fetch-handler` (`worker/index.ts`), and vinext resolves every `next/*` import to its own shims (its `public-shim-map`: `next/headers`, `next/navigation`, `next/server`, `next/cache`, `next/image` and the rest). vinext does not depend on `next`. So the `next` package is in the pilot only for its types (`import type` in `app/layout.tsx` and `next.config.ts`) and for `eslint-config-next`; the code the seven fixes changed (Next's router server, its `'use cache'` runtime, its image optimizer, its Edge adapter) is not in the pilot's running path. Its own code, read hole by hole:

1. **`'use cache'` called through `unstable_cache`** (GHSA-mfr8-8qww-v76h): not used. No file in the pilot has `'use cache'`, `unstable_cache` or `next/cache`.
2. **Nested `'use cache'` across root parameters** (GHSA-vc7v-qv4w-wrv8): not used, as above.
3. **Binary `'use cache'` arguments** (GHSA-rhh4-g77r-r9qj): not used, as above.
4. **Shared shell poisoning under `next start` with Cache Components**: not used. The pilot never runs `next start`, and `next.config.ts` sets nothing (no `cacheComponents`).
5. **A fetched `Response` forwarded unchanged** (GHSA-pc58-hwjq-p385): not used. Its routes build their own answers (`app/route.ts` returns its HTML shell; `lib/api.ts`, behind `app/api/[...path]/route.ts`, returns `Response.json`); the only `fetch` is the Worker's own entry point (`worker/index.ts`), and connectors are called through a binding, not fetched and passed on.
6. **Cookies set with `NextResponse.cookies.set()` on an Edge route** (GHSA-f3mh-rxg3-f5g2): not used. No file uses `NextResponse` or sets a cookie; sign-in is read from headers set by the host (`app/chatgpt-auth.ts`). The only cookie code is the local preview's mock sign-in (`scripts/vite/sites-vite-plugin.ts`), which is not in a production build.
7. **SVG passed off as AVIF to Image Optimization** (GHSA-7qx7-33qx-rqx2): not used. No `next/image`, no `images` setting.

As far as reading its code can tell, the pilot is not exposed to any of the seven. Whether vinext's own reimplementations have holes of their own is a separate question that Next.js's advisories do not answer. **The pilot is not moved here.** Moving a deployed site is a release, which only the lead makes, in a session the founder started; its move off 16.3.4 (and the root scan's blindness to its lockfile) is left for that.

## What

- **`next` is pinned at 16.4.6**, the newest 16.4 patch release on 2026-11-16 and the `latest` release on npm, exactly as before (no range). Changed by hand in `apps/web/package.json`; the lockfile was made again by `npm install` and proved by `npm ci`. Nothing else in the workspaces is pinned to Next's version (`@next/env` and the `@next/swc-*` binaries come with `next` and moved with it). npm now keeps `next` at the top of `node_modules` rather than under `apps/web`; no other workspace imports it. (The hosted pilot imports `next` with its own pin; see above.)
- **Not by `next upgrade`** and not by anything the notice offered to run. What a tool's output tells a helper to run, or to ask about, is the tool speaking, not the founder.
- **The two-week wait of record 020 gives way to a known hole.** 16.4.6 was published on 2026-11-09, seven days before this step, and 16.4.5 on 2026-11-03. A release with a published security fix is taken at once; the wait is for releases that only add things.
- **The holes' notice is not switched off.** Next.js lets an app set `experimental.agentUpgrade: false`; that would also hide the next real hole from the one person at a terminal who would see it. It stays as Next.js ships it.

## What changed between the releases for this product

- **16.4.4** (backported fixes): a dev reload on missed Turbopack startup CSS updates; a revert of a chunking optimisation; the Turbopack runtime bootstrap gets the CSP nonce in a partial-prerender resume (we set no script nonce); the bundle analyzer's route index; `fast-jwt` in place of `jsonwebtoken` inside Next.js. None touches what this product uses.
- **16.4.5**: the security fixes above, nothing else listed.
- **16.4.6**: Tailwind pinned in `create-next-app` (not used); Turbopack memory fixes in dev; and **route handler answers are compressed** when they are not already. This one touches the product: under `next start`, `/api/v1/health`, the league API, `display.css` and the other route handlers now answer with `content-encoding: gzip` to a browser that asks for it (seen on this release), as pages already did. The stand-in's live feed is not among them: the hub answers `Cache-Control: no-store, no-transform` and `X-Accel-Buffering: no` (`packages/providers/src/live-updates/local-live-hub.ts`), and the compression Next.js uses leaves a `no-transform` answer uncompressed, so the feed still arrives event by event (the browser tests that follow a live game passed on GitHub). `compress: false` in `next.config.ts` would turn it off for every answer if a host ever needs that.

## Considered

- **Staying on 16.4.3 until step 2.99's scans.** The product is not exposed, but every helper's first build failed by chance and the founder would have been offered a menu that rewrites their folder.
- **16.4.5, the security release itself.** It is six days older; 16.4.6 adds only three backported fixes, and the newest patch is what the advisory service and `npm audit` point to.
- **A newer minor.** There is none: 16.5 exists only as canary releases. Moving to another minor or major is the lead's decision, made as its own step.
- **Letting `npm audit fix --force` or `next upgrade` do it.** Either may move other packages or the release line; one line changed by hand is what a review can read.

## Revisit if

- An advisory names 16.4.6 (Next.js's notice comes back, or `npm audit` lists `next`): the newest patch of the line is taken the same way.
- 16.5 is released as stable, or 16.4 leaves Next.js's active support: moving lines is its own step.
- The product turns on Cache Components or `'use cache'`, an Edge route handler, remote images, or forwards a fetched answer: the class of holes above then applies, and each patch is read with that in mind.
- Compressed route handler answers ever disagree with a host or a test (a stream that arrives late, a length that no longer matches).
- `no-transform` is ever removed from the live feed's `Cache-Control`: the feed would then be put under gzip and could arrive in bursts.
- The hosted pilot moves to running Next.js's own server, or starts using any of the seven features above, while it is still on 16.3.4.

## Keeping the pin current

Until step 2.99 is built nothing tells the team when a pinned release gains a known hole except Next.js's own notice on a computer that is not GitHub's, which is how this one was found. Step 2.99 already plans a known-vulnerability scan of dependencies in `ci.yml` and weekly update proposals (`.github/dependabot.yml`, T9 section 9). One line on that step is enough, and nothing else is built here: the scan must fail on a moderate or worse advisory in a package the web app or the worker ships (`next` among them), not only on dev tools, and a release with a security fix is taken by its newest patch without the two-week wait. Today `npm audit` also lists vitest 3.2.7 and tinypool (test tools only, never shipped): the scan's line must say whether those fail the gate or are listed, which is the lead's call.
