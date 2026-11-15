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

`.env.example` holds only made-up values, so the copy works as it is for local work. Local work needs only the lines that are not commented out: `APP_ENV`, `PUBLIC_BASE_URL` and `EMAIL_FROM` (with `LOG_LEVEL` and `TRUSTED_PROXY`, which have defaults). The database address, the sign-in service and the email key are needed only in staging and production, and the session secret and the two Stripe keys only once something uses them (finding R8); any of them given is still checked. If a setting the app needs is missing, or one given is invalid, the app refuses to start and names the setting; it never prints a value.

The web app and the worker name their database `PLATFORM_DATABASE_URL`. The live tracker's is `DATABASE_URL`. The names differ on purpose, so a settings file made for one can never point the other at its database.

Two rules to keep in mind:

- Put only made-up values in `.env` on a laptop. Real secrets belong in the hosting provider's secret store, never in a file here (`.env.example`, and T-30).
- `APP_ENV=local` (or `test`) is what makes the web app use its made-up stand-in. The stand-in refuses to run unless the public address is `localhost`, `127.0.0.1`, `[::1]` or a `.localhost` or `.test` name, so a wrong `APP_ENV` on a real server cannot hand out made-up sign-ins.

## Run the web app

```sh
npm run dev:web
```

This starts Next.js in development mode, with the address in `PUBLIC_BASE_URL` (the example uses `http://localhost:3000`). Stop it with Ctrl+C.

With `APP_ENV=local`, the web app holds made-up leagues and made-up people in memory, in the process. It opens **no database and no sign-in service**: the sign-in screens and the made-up people are described in record 031 and in the header of `apps/web/src/server/stand-in-ports.ts`. Restarting the app puts the made-up data back to its starting state.

### One made-up world you can walk through

Everything the made-up leagues hold is one set of rows in the app's memory, per league
(step 2.152, `apps/web/src/server/stand-in-world.ts`, seeded from
`apps/web/src/server/stand-in-world-seed.ts`). Every screen reads and writes the same rows
through the product's own commands, so what the admin does is what a visitor sees:

- a team added in Admin → Teams, and the players put on it, are on the public Teams page and
  the team's own page, in the schedule grid, the fixture import and the tracker;
- a schedule built and published in Admin → Schedule (or filled from a fixture file) is the
  public schedule, the home page's games and the games area's list;
- a final score, a forfeit or a box score typed in Admin → Games, or a game the tracker ends,
  changes the game's page, the home page, the standings and the statistics at once: core
  works the standings out again from the results, as on the database;
- a postponed or cancelled game says so everywhere, and a reopened one is open again;
- League settings take effect: who may score, the start page for members, how names show and
  the statistics settings for teams.

The two made-up leagues are apart: North Valley (adults, nine teams, `/north-valley`) and
Harbor City (children, three teams, `/harbor-city`), each with its own look and its own
venues. **The world is made again every time the server starts**: whatever you added is gone
after a restart, and the games' days move with the time it starts, so this week's round is
always this week, the games already played are in the past and the live game is under way.
Every league page says so in one quiet line at the foot of the page: "A made-up league on
this computer. It starts over when the app restarts."

**Open it at the `127.0.0.1` address.** The made-up world listens on this computer's
loopback address only (`127.0.0.1`), so no other computer can reach it at all, and a league
page answers only for the exact address `PUBLIC_BASE_URL` names. So:

- put `PUBLIC_BASE_URL=http://127.0.0.1:3000` in `.env` and open
  `http://127.0.0.1:3000/north-valley`;
- the preview (`node scripts/preview-web.mjs`) sets this itself: open
  `http://127.0.0.1:3210/north-valley`. There `http://localhost:3210` answers "not found"
  (404), because `localhost` is not the address `PUBLIC_BASE_URL` names;
- `http://[::1]:<port>` reaches nothing at all: the server does not listen on that address.

Before any page is looked at, the server answers only a request addressed to `localhost`,
`127.0.0.1`, `[::1]`, a name ending in `.localhost`, or the `.test` name `PUBLIC_BASE_URL`
gives, and only one not passed on by another server (no `Forwarded` or `Via` header, no
`X-Forwarded-For` or `X-Forwarded-Host` from elsewhere). Anything else gets a plain page and
nothing more. On the made-up database (`LOCAL_DATA=made-up-database`)
it listens on `127.0.0.1` only too, as everything does with `APP_ENV` local or test: the
made-up member's password is written in the code there as well.

To try it as a league's admin:

1. With `PUBLIC_BASE_URL=http://127.0.0.1:3000` in `.env`, start it with `npm run dev:web`
   and open `http://127.0.0.1:3000/north-valley`.
2. Be the made-up owner: in the browser's developer tools, add a cookie `srl_session` with
   the value `local-owner-token` for `127.0.0.1` (the made-up people are given only by this
   cookie, see `stand-in-cast.ts`), then open `http://127.0.0.1:3000/north-valley/admin`
   (nothing links to the admin from the public pages yet). Step 2.127 replaces these two
   steps: it gives the made-up owner a password, so you sign in by tapping.
3. Teams: under "Add a team" type a name and tap "Add team". On the team's page, under
   "Someone not in the list yet", type a first and last name and a number and tap "Add the
   person and put them on the roster"; do it again for a second player.
4. Schedule: in this week's round open "Add a game", choose the new team and another, a time
   and a court, and tap "Add game"; then tap "Publish this schedule".
5. Games: under the new game type both scores and tap "Save final score" (or tap "Box score",
   type each player's points and tap "Save box score and make it final"). Then remove the
   cookie and look at the home page, the team, the game, the standings and the statistics.

To run it on the made-up database instead, put `LOCAL_DATA=made-up-database` in `.env` (local and test only). The app then builds a database in memory when it starts, with every migration and the two seed leagues (below), and reads leagues, signed-in people and what they hold from it. Sign-in still uses the stand-in's screens; the stand-in's made-up people do not exist there. The areas not yet moved onto the database (step 2.93, record 055) show an error page. It too opens no address and is gone when the app stops.

To see the first made-up league (`/north-valley`) under another design, put `LOCAL_DESIGN=<name>` in `.env` (local and test only; the app refuses to start with it anywhere else, and with a name it does not know). The names are the starting designs (`crest`, `crest-light`, `midnight-gold`, `clean-court`) and `pine`, a made-up green league's design kept for pictures and tests. `node scripts/shots.mjs --design=<name>` takes pictures of that league's pages under a design this way (the script's own first lines say how).

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

Nothing in the web app reads `.local/seed-db`: its local mode uses its own in-memory stand-in, or with `LOCAL_DATA=made-up-database` a fresh database in memory loaded the same way (above). The seeded folder is for the database tests and the tracker transfer (record 048).

The seed script opens a folder on this computer, never a network address (T-201).

## Bring tracker games into the made-up database

```sh
npm run transfer:tracker -- --backup <folder> --league <short name> --season <season> --as <email>
```

This brings the games the old live tracker recorded into one league and season of the local database (step 2.58), through the product's own commands. `--backup` is a folder that `npm run stats:copy -- --to <folder>` wrote; the backup is read from a working copy (`--work`, by default `.local/transfer-work`), never changed. `--as` is the email of the league's owner or of an admin for the whole league, whom the transfer acts as; anyone else (another league's admin included) is refused before the backup is read or any plan is shown. `--db` names another database folder than `.local/seed-db`.

Without `--run` it only shows the plan and changes nothing: which teams and players it found here, which players it will add with their numbers, and for each game whether it will be transferred, is already here, is not ended in the tracker yet, or has a problem (with what to put right). A game the tracker ended that cannot be found in the season's schedule is a problem, so nothing is left behind unnoticed. The run starts only when no game has a problem. With `--run` it carries the plan out, then checks that every game is final with the tracker's score and that every box score line matches. Only the tracked team's players are added unless `--with-opponents` is given (F-12). A tracked-team player who cannot be added (no first and last name, say: F-13) is listed under a warning even when no game names them; put them on the roster by hand and run it again. The command ends with exit code 0 only when the plan had no problem, the run went through and every one of the tracked team's players was brought over.

It is safe to run again: a game already brought over is only compared, and a run that was stopped part-way carries on where it was (a person it had added but not yet put on their team is put on it, not added twice).

It opens a database folder on this computer and refuses anything that reads as a network address (T-201). Use it on made-up backups: a backup of the live tracker holds real people's names, and bringing one over waits for the founder.

## Make a league

```sh
npm run league:make -- --name "Made-up Hoops" --short-name made-up-hoops --city Springfield --contact-email hello@example.test --owner-email owner@example.test --as you@example.test
```

This makes a league in draft, with its first season as the current one, in one step through the product's own commands (step 2.125, [record 057](../architecture/decisions/057-making-a-league-from-this-computer.md)). It is how we put a league on the platform until self-serve sign-up exists (P3 §8). Anything not given is asked for. **Who plays** (adults, under-18s or both) is left out of the example on purpose, so it is always answered when asked: it decides how players' names are shown and whether the league finder lists the league, and there is no screen to change it afterwards yet. The sport (basketball), the time zone (this computer's; a named zone such as America/Chicago, never an offset or an abbreviation) and the first season's name (from today's date in the league's time zone, such as "Fall 2026" or "Winter 2026–2027") have suggestions; the season's start and end dates (`--season-starts`, `--season-ends`, YYYY-MM-DD) may be left out. `--listed yes` or `--listed no` chooses whether the league finder lists it; otherwise adult leagues are listed and leagues with under-18s are not. `--as` is your own email, as our staff. The owner needs no account: one is made for their email, and it becomes theirs when they first sign in with it.

It shows everything it will make, and where, and makes nothing unless you type `yes` at a terminal. Where: on this computer, in `--db <folder>` if given, otherwise the local test database in `.local/seed-db`, even when hosted settings are in the environment or `.env` (it says it is not using them). A short name another league holds, or a database that is not at this code's migrations (none applied, behind or ahead), makes nothing. If the league is refused, the accounts the run made are removed again, and it says so.

A hosted database needs `--hosted`, a person at a terminal, two logins given for that one command, and the league's short name typed as the answer: follow [make a league on a real database](make-a-league.md), and only for the test copy, in a session the founder started (T-201).

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
- Do not point `PLATFORM_DATABASE_URL` or `DATABASE_URL` at a production database. Real people's data is only in production, and nothing on a laptop should reach it (T-13, T-201).
- Do not commit `.env`, `.local/` or any `.env.*` file except `.env.example`. Git ignores them, but check `git status` before committing.

## If something does not start

- A `ConfigError` names each missing or invalid setting. Fix that line in `.env`; the message never shows a value.
- If `npm run dev:web` fails with a stand-in refusal, check that `PUBLIC_BASE_URL` uses `127.0.0.1` (or `localhost`) and that `APP_ENV` is `local`. If a league page answers "not found", check that the address in the browser is exactly the one `PUBLIC_BASE_URL` names.
- If a test fails only on one run, run `npm run test:units` again on its own. Database tests can be slow on a busy machine; they use long timeouts on purpose.

Related: [applying migrations](apply-migrations.md), [verification](verification.md), and the decisions in `docs/architecture/decisions/` (records 041 to 048 cover the stack this guide uses).
