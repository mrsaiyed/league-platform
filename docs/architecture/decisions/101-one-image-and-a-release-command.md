# 101 — One image, and a release command at a person's terminal

Date: 2026-11-22. Step 2.95, part 1 (T-300). Serves T1 §1, T-48, T-49, R10 and the 2.110 audit's M20, M11 and L2.

**This computer has no Docker: the image file has never been built here. GitHub's job "image" is its first build. Nothing here has run against Render or Supabase.**

## Problem

The test copy needs one image for the web app and the worker, and a way to apply the database's changes before a new version starts. Render's free instance has no step that runs before a deploy (to confirm), and the login that changes the tables sees past every league's fence, so it may not be a setting on the host (M11, M20).

## What

- **`npm run release`** (`scripts/release.mjs`, with `release-source.mjs`, `release-run.mjs` and `release.messages.mjs`). On this computer it uses a PGlite folder. With `--hosted` it needs a person at a terminal and takes `MIGRATION_DATABASE_URL` for that one command, refusing it in `.env`. That address carries no password: the command asks for it at the terminal with the typing hidden (`scripts/release-password.mjs`), and refuses an address that carries one, in the setting or as an argument, in one fixed sentence that repeats none of it (T-300, the fix round's High). The address passes the tracker's database guard (`platformDatabaseProblem`, `trackerProjectProblem`), the certificate comes from `PLATFORM_DATABASE_CA` through `databaseCertificateFrom` (step 2.203), and the database is opened by `openMigrationTarget` in `packages/database`. That function uses the same code as the league-making tool's `openLeagueMakingTarget`, so nothing is copied: no query string, a certificate checked for a database anywhere else, the tracker's schema refused, and the place read from the real connection. The person types the Supabase project's reference (for a host that names none, the host's name), read from the connection, to go ahead; the database's name, `postgres` on every project, told nothing apart (fix round, M1). Before counting live games the login is proved to see every league, and a fenced one is refused rather than counted as 0 (M2). `applyMigrations` then applies the changes, and only when every one has applied does the command name this checkout's commit (refused if `supabase/migrations` has uncommitted changes) to deploy by hand. A failed change names nothing. A connection that fails gets the start-up's sentences, naming the release's settings. No line repeats an address, a password or an error's own words.
- **`platform.Dockerfile`** has two stages: a build, then the image. It copies named paths only, runs as `node`, and starts with `node scripts/web.mjs start --hostname 0.0.0.0`. The worker's command is written at the top of the file. `platform.Dockerfile.dockerignore` (BuildKit reads it in place of the tracker's `.dockerignore`) starts with `*`, lets in only those paths, and ends by shutting out `**/.env` and `**/.env.*`. `tests/platform-image.test.mjs` holds both files to this, and checks that each workspace declares what its code imports.
- **ci.yml, job "image"**: it builds the image, checks that the staging start-up refuses in its own words without its settings, asks the health address for a 200 in the made-up stand-in mode, and loads the worker's code. Nothing is published and no permission or secret is added.

## Part 2

- **Live games (T-158).** Before anything is applied, the release counts the games marked live in every league (`countLiveGames`, as the migration login, one number only) and stops with exit code 3 above `mostLiveGames` unless given `--go-ahead`. The limit is 0: until an open tracker is proved to keep working across a release (T-127), any live game stops it. Raising it is one constant in `scripts/release-run.mjs`.
- **Going back (T-156).** Running the previous commit's website against today's database: the release command run from that commit applies nothing, says the database is ahead and names it; it is then deployed by hand. Safe because of the drop-and-rename rule (T-183); the procedure says what a person never does (undo, delete or edit anything in the database by hand).
- **The host, written down as a checklist** (`docs/operations/render-test-copy.md`), not a `render.yaml` blueprint: a blueprint lets a file in the repository create and change services on Render on every push, while here each setting is typed by the founder and checked by eye. To be looked at again for production, with the worker and Cloudflare.
- **Procedures** in `docs/operations/`: releasing and going back, a new test copy, rotating a secret, restoring the database (the test copy is made again; the full restore is step 2.210's). Each says at its top that it is not yet followed.

## Not done here

The health answer does not name the running version: Render's Events list shows it for now.

## Why not

- **Render's pre-deploy command:** paid instances only (to confirm), and it would need the migration login as a setting on the host.
- **The full staging start in CI:** the staging start-up needs a database and the hosted sign-in service, so the health address is asked in the stand-in mode instead. Staging is proved only as far as its refusal.
