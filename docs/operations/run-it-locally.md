# Run it locally

How to install SR Leagues on a computer, run the web app against made-up data, load the made-up database, and run the checks. Everything here uses made-up data on this computer. Nothing needs a password, a vendor account or an internet connection to the platform's services.

## What you need

- **Node.js 24** (`package.json` sets `engines` to `>=24 <25`; CI and the container image use 24 too).
- **npm**, which comes with Node.
- **Git**, to get the code.

Playwright browser checks also need Chromium, installed once with `npx playwright install chromium` (the CI workflow uses `--with-deps` on Linux).

## Install

```sh
npm ci
```

`npm ci` installs exactly what `package-lock.json` records. Use it instead of `npm install` so the versions match the team's.

## Settings

The web app reads its settings from the environment and from a file named `.env` in the repository root. `.env` is git-ignored and must never be committed.

To start, copy the example file:

```sh
cp .env.example .env
```

`.env.example` holds only made-up values, so the copy works as it is for local work. Every setting it lists is checked when the web app starts. The only optional ones are `LOG_LEVEL` and `TRUSTED_PROXY`. If a required setting is missing or invalid, the app refuses to start and names the setting; it never prints a value.

Two rules to keep in mind:

- Put only made-up values in `.env` on a laptop. Real secrets belong in the hosting provider's secret store, never in a file here (`.env.example`, and T-30).
- `APP_ENV=local` (or `test`) is what makes the web app use its made-up stand-in. The stand-in refuses to run unless the public address is `localhost`, `127.0.0.1`, `[::1]` or a `.localhost` or `.test` name, so a wrong `APP_ENV` on a real server cannot hand out made-up sign-ins.

## Run the web app

```sh
npm run dev:web
```

This starts Next.js in development mode, with the address in `PUBLIC_BASE_URL` (the example uses `http://localhost:3000`). Stop it with Ctrl+C.

With `APP_ENV=local`, the web app holds made-up leagues and made-up people in memory, in the process. It opens **no database and no sign-in service**: the sign-in screens and the made-up people are described in record 031 and in the header of `apps/web/src/server/stand-in-ports.ts`. Restarting the app puts the made-up data back to its starting state.

To build and run the production build locally:

```sh
npm run build:web
npm run start:web
```

`build:web` needs no settings. `start:web` reads `.env` like `dev:web` does.

## Load the made-up database

```sh
npm run seed
```

This applies every migration (see [applying migrations](apply-migrations.md)) to a local PGlite database in `.local/seed-db`, then loads two made-up leagues: Lakeside Hoops League and Maple Street Rec League. All their email addresses end in `example.test`. The command is safe to run again: a league already there is reported as such. A league that was only half loaded is refused on a rerun, so it is never reported as complete.

To keep the database in another folder, pass the folder after `--`:

```sh
npm run seed -- path/to/folder
```

Nothing in the web app reads `.local/seed-db` yet. The web app's local mode uses its own in-memory stand-in (above). The seeded database is used by the database tests and is ready for the stage that connects the web app to it (record 048).

The seed script opens a folder on this computer, never a network address (T-201).

## Bring tracker games into the made-up database

```sh
npm run transfer:tracker -- --backup <folder> --league <short name> --season <season> --as <email>
```

This brings the games the old live tracker recorded into one league and season of the local database (step 2.58), through the product's own commands. `--backup` is a folder that `npm run stats:copy -- --to <folder>` wrote; the backup is read from a working copy (`--work`, by default `.local/transfer-work`), never changed. `--as` is the email of the league's owner or of an admin for the whole league, whom the transfer acts as; anyone else (another league's admin included) is refused before the backup is read or any plan is shown. `--db` names another database folder than `.local/seed-db`.

Without `--run` it only shows the plan and changes nothing: which teams and players it found here, which players it will add with their numbers, and for each game whether it will be transferred, is already here, is not ended in the tracker yet, or has a problem (with what to put right). A game the tracker ended that cannot be found in the season's schedule is a problem, so nothing is left behind unnoticed. The run starts only when no game has a problem. With `--run` it carries the plan out, then checks that every game is final with the tracker's score and that every box score line matches. Only the tracked team's players are added unless `--with-opponents` is given (F-12). A tracked-team player who cannot be added (no first and last name, say: F-13) is listed under a warning even when no game names them; put them on the roster by hand and run it again. The command ends with exit code 0 only when the plan had no problem, the run went through and every one of the tracked team's players was brought over.

It is safe to run again: a game already brought over is only compared, and a run that was stopped part-way carries on where it was (a person it had added but not yet put on their team is put on it, not added twice).

It opens a database folder on this computer and refuses anything that reads as a network address (T-201). Use it on made-up backups: a backup of the live tracker holds real people's names, and bringing one over waits for the founder.

## Checks

These are the commands to run before a change is committed.

| Command                | What it checks                                                                                                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`        | The structure rules: which imports are allowed (T-21), `index.ts` use (T-22), league names and addresses (T-27, T-34), where SQL is written, secrets kept out of the browser (T-30), and the migration safety rule (T-183). It also checks the offline example. |
| `npm run typecheck`    | The TypeScript compiler, strict mode, over every workspace and the web app (record 041).                                                                                                                                                                        |
| `npm run test:units`   | Vitest: the unit and database tests of the new code. Database tests run on PGlite.                                                                                                                                                                              |
| `npm test`             | The older `node --test` suites in `tests/`. Runs a small preparation step first.                                                                                                                                                                                |
| `npm run test:web`     | Builds the web app, starts it on the stand-in, and checks its pages, refusals and security headers. Takes a minute or two.                                                                                                                                      |
| `npm run format:check` | Prettier, read-only. `npm run format` fixes the formatting.                                                                                                                                                                                                     |
| `npm run verify`       | All of the above except the browser checks, plus the demo build. This is the gate.                                                                                                                                                                              |

To run one test file with Vitest, pass its path:

```sh
npx vitest run packages/database/src/migrations/run-migrations.test.ts
```

### Browser checks

These drive a real browser and need Chromium installed (see "What you need"):

```sh
npm run test:browser
npm run test:varsity:browser
npm run test:stats:browser
npm run test:pages:browser
npm run test:web:browser
```

CI runs them after `npm run verify`.

## Schema types

After adding a migration, regenerate the typed description of the schema:

```sh
npm run db:types
```

It reads the migrations back from a database and rewrites `packages/database/src/db/schema-types.ts`. A test fails if the checked-in file has drifted from the migrations (record 009).

## The live stat tracker

The tracker is a separate program with its own settings (the second part of `.env.example`):

```sh
npm run dev:stats
```

Open `http://127.0.0.1:4180`. Without `DATABASE_URL`, it saves to embedded PostgreSQL in `.local/live-stats/` on this computer. `npm run stats:db-check` and `npm run stats:copy` work with a Supabase connection string in `.env`; they are covered in `docs/operations/live-stats-hosting.md`.

## What not to do

- Do not put a real connection string, password or key in `.env` for local work.
- Do not point `DATABASE_URL` at a production database. Real people's data is only in production, and nothing on a laptop should reach it (T-13, T-201).
- Do not commit `.env`, `.local/` or any `.env.*` file except `.env.example`. Git ignores them, but check `git status` before committing.

## If something does not start

- A `ConfigError` names each missing or invalid setting. Fix that line in `.env`; the message never shows a value.
- If `npm run dev:web` fails with a stand-in refusal, check that `PUBLIC_BASE_URL` uses `localhost` and that `APP_ENV` is `local`.
- If a test fails only on one run, run `npm run test:units` again on its own. Database tests can be slow on a busy machine; they use long timeouts on purpose.

Related: [applying migrations](apply-migrations.md), [verification](verification.md), and the decisions in `docs/architecture/decisions/` (records 041 to 048 cover the stack this guide uses).
