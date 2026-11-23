# 107 — The site notice and "do not index"

Date: 2026-11-23. Step 2.60 (T-312, U-18). Serves F-10 (P9 §3), U-10 (P2 §6), T4 §7.

## Problem

The demo league must say on every page that it is an unofficial demo and stay out of search engines until the organization it shows agrees (F-10), and any league may ask not to be indexed (U-10). T4 marked only youth leagues' player pages "do not index", but children's names are now on the team, statistics, home and game pages too.

## What

- **Two league settings** (`packages/core/src/modules/leagues/settings/declarations.ts`): `site.notice` (plain text, trimmed, at most 200 characters, '' for none) and `site.doNotIndex` (off to start; switching it on shows less, so it works in an archived league, R-26). Saved by the ordinary `setSetting` command, so they are in the activity log, with no migration: settings already have their table.
- **One read** `readSiteFacts` (core): the notice and whether the league's pages are "do not index": the league asked, or its audience is youth or mixed (U-18; an audience that cannot be read is youth). A damaged stored value reads as the careful answer: no notice, do not index.
- **One web port** `siteFactsOf(leagueId)` on both the made-up stand-in and the database (a page snapshot, as no one), read once per request (`league-search-marks.ts`).
- **The league's layout** (`apps/web/src/app/[league]/layout.tsx`) draws the notice above the header on every public page (`SiteNotice`: an `aside` named "Notice from the league", text only, no close button), and its `generateMetadata` sets robots `noindex, nofollow, noarchive, noimageindex` for every page under the league. The test copy's own mark (record 082) is `noindex, nofollow`; the league's is told apart from it by `noarchive`.
- **Where the admin changes them**: League settings, in a "Public site" group beside Privacy (step 2.125's Profile screen does not exist yet; when it does, the two may move there).

## Why no header per league

The page's own head is read by the search engines that matter, and every page under a league has it, so no page is missed. Sending `X-Robots-Tag` per league would make the proxy read the league's settings and audience on every answer, assets included. The test copy keeps its header on everything.

## Not done, not verified

- There is no `/find` and no sitemap yet; when they are built they must leave out every league whose site facts say "do not index".
- JSON answers under a league (the game snapshot) carry no robots mark in production.
- An adult league with a child recorded in it is not marked by the children's rule (U-18 says why).
