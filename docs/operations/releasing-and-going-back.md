# Releasing a new version, and going back

> **Not yet followed.** This procedure counts as written only once it has been followed in the supervised session the founder starts with the lead beside them (T8 §11, T-165; audit 2.110, section 10, steps 6, 9, 10, 20 and 21). Until then every step that touches Render or the test copy is **not verified**. When it has been followed, the lead writes "Followed on (date)" here.

This is for the **test copy** (staging): the website on Render, its database on the test copy's own Supabase project, made-up data only. It is never used on the Al-Hadi tracker (`apps/live-stats`, `./Dockerfile`, the project named in `supabase/site.json`): that has its own page, [live stats hosting](live-stats-hosting.md).

## In plain words

A release has two halves, done in this order, by a person:

1. **The database first**, at your own terminal: `npm run release -- --hosted`. It adds the new version's database changes and, only when every one of them worked, prints the commit to put on Render.
2. **Then the website**, in Render's dashboard: deploy exactly that commit, by hand.

Nothing does this by itself. Render's automatic deploys are off ([the test copy on Render](render-test-copy.md)), so a new commit on GitHub changes nothing on the test copy until you deploy it. GitHub only proves, on every push, that the image builds and starts (`ci.yml`, job `image`); it publishes nothing.

**Who types what.** You (the founder) type every address, password and key. The lead reads the screen with you and never holds them. No AI session ever types or keeps one.

## Before you start

- **The commit.** The lead has written the commit to release in `docs/build/STATUS.md`, and GitHub has passed it twice. You will check its id twice below: what the release command prints, and what you pick in Render.
- **No game being scored.** The release command counts the games marked live in every league and stops if there are any (T-158). Release after games are final. Do not release around a game.
- **Your checkout is that commit.** In your copy of the repository: `git fetch` then `git checkout <the commit>`. Change nothing in `supabase/migrations`: the command refuses if anything there differs from the commit.
- **Two things at hand, never in a file in the repository:**
  - the **migration login's** address, **without its password** (the tables' owner, `postgres`, on the Session pooler, port 5432: see [new test copy](new-test-copy.md), "Where each password lives"). It is typed for this one command only. It is never put in `.env` (the command refuses it there) and never put in Render's settings, because that login sees every league's data.
  - that login's **password**, in your password vault only. You paste it when the command asks for it, never in the command itself.
  - the database's **certificate** file, downloaded from the test copy's Supabase dashboard (Database settings, SSL), saved in the folder, for example `staging-ca.crt`.

## 1. The database: run the release command

In a terminal, in the repository folder, type this on one line, with the test copy's project reference in place of `<reference>` and the pooler's host in place of `<pooler host>` (both are in the Supabase dashboard's **Connect** panel, under Session pooler; to confirm on the day). There is **no password** in it:

```bash
MIGRATION_DATABASE_URL='postgres://postgres.<reference>@<pooler host>:5432/postgres' PLATFORM_DATABASE_CA=./staging-ca.crt npm run release -- --hosted
```

It then asks for **the migration login's password**. Copy it from your password vault, paste it and press Enter. **Nothing appears while you paste or type**: that is on purpose. This way the password is never on the screen, never in the terminal's history (the list of commands it remembers), and never in terminal text you copy into a chat.

**Never put the password in the command.** The address Supabase shows may have `[YOUR-PASSWORD]`, or the password itself, between a `:` and the `@`: take that part out, the `:` with it. If an address you give has a password in it, the command stops at once with: "That address carries a password, so nothing was opened and none of it is shown: give the address without its password (the release asks for the password itself, with the typing hidden), and clear that line from your terminal’s history." Then:

1. Close that terminal window, open a new one, and delete the line from the terminal's history file in a text editor: on a Mac, the hidden file `.zsh_history` in your home folder; on Linux, `.bash_history` (to confirm on your computer).
2. If that terminal text was copied anywhere (a chat, a note), change the password: [rotating a secret](rotating-a-secret.md), "The tables' owner".
3. Run the command again, as above, without the password.

What you see, in order:

1. **Where.** A "Where" line naming the database, its host and the Supabase project, and saying "NOT on this computer: a hosted database". Read the project's reference aloud and compare it with the test copy's project in the Supabase dashboard. It must **not** be the one in `supabase/site.json` (the tracker's). If anything is not what you expect, press Ctrl+C: nothing is changed.
2. **Live games.** It first checks that the login sees every league's games; if it does not, it says so and stops ("That login does not see every league … Nothing was applied"): use the tables' owner, as above. If any game is being scored, it says how many and stops: "Nothing was applied. Do not deploy." Wait until they are final and run it again. Only for an urgent fix, with the lead, add `--go-ahead` at the end of the command.
3. **The question.** It shows "Supabase project:" and the project's reference again, and asks you to type that reference. Type it yourself, from the test copy's dashboard (the short code in its address), not copied from the screen: that is the check that you are where you mean to be. Anything else stops it with nothing applied. (For a database whose host names no Supabase project, it shows "Host:" and asks for the host's name instead.)
4. **The changes.** "Applied now:" lists the changes added this time ("none" if there were none), then "Already applied: N files".
5. **The commit.** Last line: "The database is ready. Deploy commit `<id>` now, by hand on the host." Check that id is the one in `STATUS.md`.

If instead it says **"A change could not be applied … Do NOT deploy"**: do not touch Render. That one change was undone; the ones before it stay, and the version running now keeps working with them (every change must leave the previous version working, T-49). Tell the lead: the fix is a new commit and a new release.

If it stops **before the "Where" line**, nothing was changed. Its sentence ends "Nothing was opened." or starts "Nothing was applied:", and says what to fix, for example: "Nothing was applied: the database refused the password or login: check the migration login’s name in MIGRATION_DATABASE_URL and the password you typed, then run the release again." It never prints the address or the password.

Run it a second time if you like: it applies nothing and names the same commit. That is how you check where the database stands.

## 2. The website: deploy that commit on Render

1. In Render's dashboard, open the test copy's web service.
2. **Manual Deploy**, then **Deploy a specific commit** (Render's wording, to confirm on the day), and choose the commit the release command named. Check the first characters of the id match.
3. Open **Logs** and read them together while it builds and starts. Building takes several minutes on the free instance.

What you see:

- **Next.js prints "✓ Ready" before our own checks speak** (audit 2.110, L2). "Ready" alone does **not** mean it started. Keep reading.
- If a line starts with **"The app cannot start"** or **"The web app cannot start"**, it did not start: the sentence after it says what is wrong and which setting to change. Render keeps the previous version running when the new one fails its health check (to confirm on the free instance).
- The health address, `https://<the service>.onrender.com/api/v1/health`, answers with `"status":"ok"` and `"database":"ok"`. Anything else (`"down"`, a 503) means stop and tell the lead.
- In Render's **Events** list, the newest deploy names the commit you chose. That list is how you see which version is running (the health answer does not name the version yet: that is left for a later step).

## 3. The first check on a hosted copy: save one form

After every deploy, before anything else: sign in as the made-up league's owner, change one thing in a form (for example the league's description) and **save**. See the page it leads to, with the change on it (step 2.239). If the page is an error, a blank page or the form again without the change, go back (section 4) and tell the lead.

## 4. Going back to the previous version (T-156)

Going back means **running the previous commit's website against today's database**. The database is never taken back: there are no "undo" files, by design.

**What "the previous version" is on Render:** the commit of the deploy before the newest one in the service's **Events** list. The lead also writes each released commit in `STATUS.md`, so the previous one is the line before.

1. **At your terminal**, check out that earlier commit and run the release command exactly as in section 1. It changes nothing: it says "The database is ahead of this commit (…), as after going back to an earlier version (T-156): nothing to do", counts the live games like any release, and names the earlier commit.
2. **In Render**, deploy that earlier commit by hand, as in section 2 (or use Render's **Rollback** on that earlier deploy in Events, which redeploys the same build; to confirm on the day). Read the logs the same way.
3. **Check**: the health answer is `"ok"`; in Events the running commit is the earlier one; a finished game, its box score and the standings are exactly as before; the release command's log line shows that no change was undone.

This is done once in the supervised session, after a finished game, with the table unchanged (audit 2.110, section 10, step 21).

### A database change the previous version cannot live with

Going back is safe only because every database change leaves the previous version working. `npm run check` refuses any change that drops or renames something in one step (T-183, "the drop-and-rename rule" in [applying migrations](apply-migrations.md)). The safe way is always two releases: add the new thing first, remove the old one in a later release.

So, when going back:

- **Do** go back to the commit just before, and only to a commit that has run against these same database changes before (the one in Events).
- **Do not** go back further than one release without the lead checking `apply-migrations.md`'s list of "migrations after which every server is switched together": after one of those, an older website may refuse some changes cleanly until it runs the new version again.
- **Do not** undo, delete or edit anything in the database by hand, in the SQL editor or anywhere else, to "make it match" the older version. Never remove a row from the migration log.
- **Do not** remove or edit a file in `supabase/migrations` to go back. If a change itself was wrong, the lead writes a new change that corrects it, and it is released forward like any other.

## What the supervised session must prove (not verified until then)

- The release command, on the test copy: changes applied up to the newest, a second run applies none (step 6).
- Render builds `platform.Dockerfile` on the free instance from a commit chosen by hand, with automatic deploys off (step 9).
- The log: "Ready", then no refusal; the health answer `"ok"` with its database check (step 10).
- With a game live, the release refused until told to go ahead (step 20).
- A release of the next commit, then going back to the first: the game, its box score and the table unchanged; no database change undone (step 21).
