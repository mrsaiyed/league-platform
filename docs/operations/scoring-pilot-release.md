# Releasing the online scoring pilot, and going back

**2026-11-17 · step 2.220 · for the release session**

The online scoring pilot (`apps/varsity-hosted`, the owner-private site the Al-Hadi games are scored on) runs on older libraries with known holes. Step 2.220 moved them on its lane branch and read every advisory against the pilot's code ([record 079](../architecture/decisions/079-next-js-off-a-release-with-a-known-hole.md), last section). **Nothing has been published.** This page is the release, so that the session with the founder is short.

## Who and when

- **Only the technical lead releases it, in a session the founder started** (CLAUDE.md). Never an unattended run or a builder.
- **Never around a game:** not on a game day, and not while anyone is scoring. Pick a time with no game in the next 24 hours, so there is room to go back.
- **What it needs from the founder:** their yes, their access to the site's host (Sites; publishing needs it, `varsity-hosting.md`), and about half an hour. Nothing costs money.
- **What does not change:** the site's address, who can open it (owner-private), and the saved games. This release has no database migration; the games, rosters and season totals stay exactly as they are, in both directions.

## 1. Before anything is published (any computer, nothing online is touched)

From the commit being released (the build branch once the lane has landed), with Node 24:

```sh
npm ci
npm run prepare:varsity:hosted
npm --prefix apps/varsity-hosted ci
cd apps/varsity-hosted
npm audit --package-lock-only        # nothing high or critical: 2 moderate advisories (8 packages), both in record 079
node node_modules/typescript/bin/tsc --noEmit
npm run build
node scripts/check-release.mjs --browser
```

The last command starts the built site on this computer with a fresh local database and checks it as the scorer and a stranger would (record 079 lists the 10 checks). It must end with "Release check passed". Any failure: stop here; nothing has been published.

**The one thing not yet seen:** the host's own build (`build-site.mjs`, step 6 of `varsity-hosting.md`) has not been run on the new libraries. Run it next. If it refuses the new versions (it may expect the older vinext it was made with), stop: nothing is published, and the lead decides whether to move to what it expects or to wait.

## 2. The release (with the founder)

1. **Note what is live now.** In Sites, write down the version that is published today. That is the way back. Also note the time.
2. **Publish**, exactly as `varsity-hosting.md` says, steps 6 to 8: build with `build-site.mjs`, run `npm run prepare:varsity:publish` from the repository's root, save the mirror with a short-lived source credential (never printed or committed), deploy that saved private version. The audience stays private.
3. **Check it on a phone, signed in:**
   - the scorer opens and the bar says "Saved to shared database";
   - last season's games are all there, with the same scores and totals;
   - start a practice game, record one basket, and open the same game in another browser: the basket is there. Practice games are labelled and never count in the season's totals.
4. **Write it down:** the lead records the commit released, the time and the Sites version in `docs/build/STATUS.md`.

## 3. Going back

**When:** the scorer does not open, a save fails, a game or total looks different from before, or anything is unclear with a game coming up. Going back first and asking afterwards is right.

**How:**

1. In Sites, publish again the version noted in step 2.1. The address and the audience are the same.
2. If that version cannot be published, build the old one: the pilot's files on `main` are still the old libraries until the move is promoted, so check out `main` and follow `varsity-hosting.md`, steps 1 to 8.
3. Check it on a phone as in step 2.3.

**What going back costs:** minutes. The database is not touched in either direction, so every game saved after the release is still there in the old version. Make sure no one is scoring while the site is switched: a score being sent at that moment waits in the scorer's browser and is sent again, but it is simpler not to need that.

## After the release

- The lane's test (`tests/varsity-hosted-libraries.test.mjs`) keeps the pilot off the releases with known holes from then on: a lockfile that brings one back fails the gate.
- When the pilot is retired (T-15; the founder's question in the audit of going online, item 7), this page goes with it.
