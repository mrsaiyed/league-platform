# Releasing the online scoring pilot, and going back

**2026-11-17 · step 2.220 · for the release session**

The online scoring pilot (`apps/varsity-hosted`, the owner-private site the Al-Hadi games are scored on) runs on older libraries with known holes. Step 2.220 moved them on its lane branch and read every advisory against the pilot's code ([record 079](../architecture/decisions/079-next-js-off-a-release-with-a-known-hole.md), last section). **Nothing has been published.** This page is the release, so that the session with the founder is short.

## For the founder: what you do, in order

The lead does the technical part. Your part is five things, all with your own hands:

1. **Pick the time.** A day with no game in the next 24 hours, when no one is scoring. Tell the lead "release the pilot's new libraries" and the time.
2. **Start the session yourself**, in the Claude app where you publish the pilot today (the one with access to Sites, the host the pilot lives on). The lead cannot release from an unattended run, only from a session you started.
3. **Say yes when the lead asks to publish.** Before asking, the lead will have checked the new version on its own computer (part 1 below) and told you it passed. If the lead says a check failed, nothing has changed online and you do nothing more.
4. **Check it on your phone**, signed in as usual: the scorer opens and says "Saved to shared database"; last season's games and totals look the same as before; start a practice game, add one basket, and see it in another browser. If the scorer shows "One action has not been acknowledged", press **Retry saved action** (it cannot count twice). Tell the lead what you saw.
5. **If anything looks wrong, say "go back".** The lead puts back the version that was live before, in a few minutes (part 3). Your saved games are not touched either way, so nothing is lost by going back.

It costs nothing and takes about half an hour. The address and who can open the site stay the same.

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

1. **Note what is live now, before publishing anything.** The lead writes down, in the session, everything that identifies the build online today: the version Sites shows as published (that version is the way back, and the only one promised), the time, and the commit it was built from if Sites or the built files show it. If nothing shows the commit, the lead writes plainly "the commit of the live build is not known". Nothing is published until this is written down.
2. **Look at the database step before saying yes.** The new libraries write a migrations folder into the built settings (`migrations_dir`, record 079); it points at `apps/varsity-hosted/migrations`, which does not exist (the pilot's one migration is in `drizzle/` and has not changed). If the host's build or publish shows a step that applies database migrations, it must say there is nothing new to apply. If it says it will apply one, or cannot find the migrations, stop: nothing is published, and the lead finds out why first.
3. **Publish**, exactly as `varsity-hosting.md` says, steps 6 to 8: build with `build-site.mjs`, run `npm run prepare:varsity:publish` from the repository's root, save the mirror with a short-lived source credential (never printed or committed), deploy that saved private version. The audience stays private.
4. **Check it on a phone, signed in:**
   - the scorer opens and the bar says "Saved to shared database";
   - last season's games are all there, with the same scores and totals;
   - start a practice game, record one basket, and open the same game in another browser: the basket is there. Practice games are labelled and never count in the season's totals.
   - if the scorer shows "One action has not been acknowledged", press **Retry saved action** (it sends the same action again and cannot count twice).

   These checks are the only proof of four things the release check on a computer cannot reach: signing in (the host does it before the pilot sees the visit), the host's own build, reading the games the old version saved, and Cloudflare's real runtime (the computer runs a local copy of it).

5. **Write it down:** the lead records the commit released, the time and the Sites version in `docs/build/STATUS.md`.

## 3. Going back

**When:** the scorer does not open, a save fails, a game or total looks different from before, or anything is unclear with a game coming up. Going back first and asking afterwards is right.

**How:**

1. In Sites, publish again the version noted in step 2.1. The address and the audience are the same. This is the way back that is promised.
2. **Only as a last resort**, if Sites cannot publish that version again: rebuild the old site from the commit written down in step 2.1, following `varsity-hosting.md`, steps 1 to 8. This is not promised to work: it needs that commit to be known, and a fresh build of an old commit is not proven to be the same as what was live. If step 2.1 says the commit is not known, this way does not exist; tell the founder plainly.
3. Check it on a phone as in step 2.4.

**What going back costs:** minutes. The database is not touched in either direction, so every game saved after the release is still there in the old version. Make sure no one is scoring while the site is switched: a score being sent at that moment is kept in the scorer's browser, but it is not sent again by itself. The scorer shows "One action has not been acknowledged", and the person scoring must press **Retry saved action** (the same action ID is used, so it cannot count twice). It is simpler not to need that.

## After the release

- The lane's test (`tests/varsity-hosted-libraries.test.mjs`) keeps the pilot off the releases with known holes from then on: a lockfile that brings one back fails the gate.
- When the pilot is retired (T-15; the founder's question in the audit of going online, item 7), this page goes with it.
