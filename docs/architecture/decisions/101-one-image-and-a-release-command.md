# 101 — One image, and a release command at a person's terminal

Date: 2026-11-22. Step 2.95, part 1 (T-300). Serves T1 §1, T-48, T-49, R10 and the 2.110 audit's M20, M11 and L2.

**This computer has no Docker: the image file has never been built here. GitHub's job "image" is its first build. Nothing here has run against Render or Supabase.**

## Problem

The test copy needs one image for the web app and the worker, and a way to apply the database's changes before a new version starts. Render's free instance has no step that runs before a deploy (to confirm), and the login that changes the tables sees past every league's fence, so it may not be a setting on the host (M11, M20).

## What

- **`npm run release`** (`scripts/release.mjs`, with `release-source.mjs`, `release-run.mjs` and `release.messages.mjs`). On this computer it uses a PGlite folder. With `--hosted` it needs a person at a terminal and takes `MIGRATION_DATABASE_URL` for that one command, refusing it in `.env`. The address passes the tracker's database guard (`platformDatabaseProblem`, `trackerProjectProblem`), the certificate comes from `PLATFORM_DATABASE_CA` through `databaseCertificateFrom` (step 2.203), and the database is opened by `openMigrationTarget` in `packages/database`. That function uses the same code as the league-making tool's `openLeagueMakingTarget`, so nothing is copied: no query string, a certificate checked for a database anywhere else, the tracker's schema refused, and the place read from the real connection. The person types the database's name to go ahead. `applyMigrations` then applies the changes, and only when every one has applied does the command name this checkout's commit (refused if `supabase/migrations` has uncommitted changes) to deploy by hand. A failed change names nothing. A connection that fails gets the start-up's sentences, naming the release's settings. No line repeats an address, a password or an error's own words.
- **`platform.Dockerfile`** has two stages: a build, then the image. It copies named paths only, runs as `node`, and starts with `node scripts/web.mjs start --hostname 0.0.0.0`. The worker's command is written at the top of the file. `platform.Dockerfile.dockerignore` (BuildKit reads it in place of the tracker's `.dockerignore`) starts with `*`, lets in only those paths, and ends by shutting out `**/.env` and `**/.env.*`. `tests/platform-image.test.mjs` holds both files to this, and checks that each workspace declares what its code imports.
- **ci.yml, job "image"**: it builds the image, checks that the staging start-up refuses in its own words without its settings, asks the health address for a 200 in the made-up stand-in mode, and loads the worker's code. Nothing is published and no permission or secret is added.

## Not done here (part 2)

The T-158 count of live games, going back to the previous version (T-156), the Render checklist, the `docs/operations/` procedures, and the corrections to the hosted-database notes. The lane's note lists them.

## Why not

- **Render's pre-deploy command:** paid instances only (to confirm), and it would need the migration login as a setting on the host.
- **The full staging start in CI:** the staging start-up needs a database and the hosted sign-in service, so the health address is asked in the stand-in mode instead. Staging is proved only as far as its refusal.
