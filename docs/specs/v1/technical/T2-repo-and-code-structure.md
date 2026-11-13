# T2 — Repository and code structure

[Spec home](../README.md) · Decisions T-20 to T-34

Where every kind of code lives and the rules between the parts. The aim is that a new developer (or an AI assistant) can find where a change belongs in a minute, and that a change in one area cannot quietly break another.

## 1. One repository

**T-20 (agreed, delegated): everything lives in this one repository**, organized as npm workspaces with a single lockfile, as it is today. Two things we run (`apps/`) share a set of libraries (`packages/`).

```text
league-platform/
  apps/
    web/                 The website: public pages, admin, tracker, API
    worker/              Background jobs: reminders, recaps, imports, schedule generation
  packages/
    contracts/           The written shape of every input, output and stored document (Zod)
    core/                All business rules, organized in modules
    database/            All SQL: typed queries, transactions
    sports/              Rules of each sport (basketball today); pure logic, no database
    site/                The sections a league page is built from, and the page renderer
    ui/                  Shared buttons, forms, tables; design tokens
    emails/              Email templates
    providers/           Adapters to outside services (server only): sign-in, email, payments, files, live updates (publishing; pages subscribe through apps/web, T-233)
    observability/       Logging, error reporting, metrics helpers
  supabase/
    migrations/          Ordered SQL files that define the database. The only way the schema changes.
    seed/                Made-up leagues for local work and tests
  tests/
    integration/         Tests that run against a real database
    browser/             Tests that drive a real browser
    load/                Load test scripts
  scripts/               One-off and maintenance scripts (for example the Faraj transfer)
  docs/
    specs/v1/            This specification
    architecture/decisions/   Short records of technical decisions and why
    operations/          How to run, deploy, recover
  .github/workflows/     Automatic checks and releases
```

## 2. What each part may and may not contain

| Part                 | Contains                                                             | Must never contain                                       |
| -------------------- | -------------------------------------------------------------------- | -------------------------------------------------------- |
| `apps/web`           | Pages, screens, request handling, wiring                             | Business rules; SQL                                      |
| `apps/worker`        | Job startup and dispatch                                             | A second copy of any rule                                |
| `packages/contracts` | Zod schemas and the types derived from them                          | Database access; anything that reads settings or secrets |
| `packages/core`      | Every decision the product makes: who may do what, what happens when | React, Next.js, SQL text, vendor libraries               |
| `packages/database`  | Queries and transactions; the job queue and pg-boss (record 012)     | Decisions; calls to outside services                     |
| `packages/sports`    | Scoring engines, standings maths, stat formulas                      | Anything about users, leagues, network or storage        |
| `packages/site`      | Section definitions and the page renderer                            | Private data; arbitrary HTML from users                  |
| `packages/ui`        | Presentational components                                            | Data fetching; knowledge of leagues                      |
| `packages/emails`    | Templates that take data and return an email                         | Deciding who gets what (that is in core)                 |
| `packages/providers` | One adapter per outside service                                      | Business rules                                           |

**T-21: dependencies point one way.**

```text
contracts  ←  sports
contracts, sports  ←  core
core (its interfaces)  ←  database, providers
contracts, ui  ←  site, emails
everything  ←  apps/web, apps/worker   (the only places where parts are wired together)
```

`core` states what it needs ("something that can save a game", "something that can send an email") as interfaces. `database` and `providers` supply them. So `core` can be tested with no database and no network, and a vendor can be replaced without touching a rule (T-14). An automatic check fails the build if any import breaks these directions.

## 3. Inside `packages/core`: modules

Each area of the product is one module.

| Module          | Owns                                                                    |
| --------------- | ----------------------------------------------------------------------- |
| `leagues`       | Leagues, programs, seasons, divisions, clubs, settings, features on/off |
| `access`        | Roles, invitations, permission checks                                   |
| `people`        | People in a league, linking to accounts, guardians, merging duplicates  |
| `registration`  | Forms, agreements, sign-ups, capacity, waitlist                         |
| `payments`      | Leagues' fees, refunds (stage 5)                                        |
| `billing`       | What each league has agreed to pay, and its limits (stage 5)            |
| `teams`         | Teams, rosters, placement                                               |
| `draft`         | The draft                                                               |
| `scheduling`    | Venues, slots, generation, publishing, brackets                         |
| `games`         | Game records, the scoring session, results, corrections                 |
| `standings`     | Standings, statistics, leaders (all calculated)                         |
| `site`          | Design, menu, pages, publishing, versions                               |
| `content`       | News, awards, sponsors, media                                           |
| `notifications` | What to send to whom; the inbox; preferences                            |
| `imports`       | Spreadsheet imports and exports                                         |
| `conversations` | Group chats: who is in them, messages, moderation (stage 4 onward)      |

Each module has the same layout:

```text
packages/core/src/modules/games/
  commands/        One file per thing that changes data
    record-play.ts
    end-game.ts
    reopen-game.ts
    set-final-score.ts
  queries/         One file per thing that reads data for a screen
    get-game-page.ts
    list-games-for-day.ts
  rules/           Pure logic with its tests beside it
  policy.ts        Who may run each command
  events.ts        What this module announces ("game finalized")
  ports.ts         What this module needs from outside (storage, clock)
  index.ts         The only file other modules may import
```

**T-22: a module is used only through its `index.ts`.** No module reads another module's tables or internal files. If `standings` needs a game's result, it asks `games`.

**T-23: every change to data is a command, and every command has the same shape.**

```ts
endGame(context, input, deps) → result | error
```

- `context` says who is acting and in which league. It is established by the server from the session, never taken from the request body.
- `input` is checked against its Zod schema before anything else.
- The command checks permission (`policy.ts`), applies the rules, saves everything in one transaction, and records any follow-up jobs in that same transaction.
- It returns a typed result or a typed, expected error ("game already final"). Unexpected failures are thrown and reported.

Because the admin, the tracker, the worker and an import all call the same commands, a rule exists in exactly one place.

**T-24: things that happen afterwards are events.** `games` announces "game finalized". `standings` recalculates, `notifications` queues recaps, `scheduling` advances a bracket. `games` does not know they exist. Calculations that must be right immediately (standings) run in the same transaction; things that can wait (email) become jobs.

## 4. Inside `apps/web`: pages map to addresses

The folders mirror the addresses in [P2](../product/P2-leagues-and-urls.md).

```text
apps/web/src/
  app/
    (platform)/                    Our own pages
      page.tsx                     /
      find/  start/  signin/  help/  contact/  terms/  privacy/
      account/                     /account, /account/inbox
    [league]/
      layout.tsx                   Loads the league, its design and menu once
      (site)/                      The league's public site
        page.tsx                   /{league}
        schedule/  standings/  stats/  register/  my/  news/
        teams/[team]/  players/[player]/  games/[game]/  clubs/[club]/
        awards/  draft/  media/  sponsors/
        [...path]/page.tsx         Custom pages, and /{program}/... in multi-program leagues
      admin/                       /{league}/admin and every area under it
        registration/  people/  teams/  schedule/  games/  standings/
        site/  messages/  season/  settings/
      score/[game]/page.tsx        The tracker
    api/
      v1/                          JSON endpoints (tracker, calendar feeds, exports)
      webhooks/stripe/  webhooks/email/
  features/                        Screens too large for one file
    tracker/  site-editor/  schedule-builder/  draft-board/  registration-form/
  server/
    context.ts                     Turns a request into "who, which league"
    container.ts                   The one place adapters are plugged into core
    actions/                       Thin wrappers that call core commands
```

Our own top-level names (`account`, `find`, `start`...) are real folders, so they always win over `[league]`. The same list is the blocked list for league short names (U-7), kept in one file that both use.

**T-25: pages and handlers are thin.** A page asks a query for data and renders it. A form action or API handler parses the request, builds the context, calls one command, and formats the answer. If a page file contains an `if` about league rules, it is in the wrong place.

**T-26: two ways in, one set of commands.** Admin screens submit through server actions. The tracker and anything that must work offline or be retried uses versioned JSON endpoints under `/api/v1`. Both end at the same command.

## 5. Sections of a page

Each section type from [P5](../product/P5-site-customization.md) is one folder:

```text
packages/site/src/sections/standings/
  schema.ts        Its options and their limits (Zod)
  load.ts          Fetches the public data it needs, for a given league and season
  view.tsx         Renders it
  editor.tsx       Its options panel in Edit site
  index.ts         Registers it: name, icon, default options, which feature it belongs to
```

Adding a section type is adding a folder and one line in the registry. No other code changes ([T5](T5-customization-engine.md)).

## 6. Rules for all code

- **T-27: no league is ever named in code.** A check fails the build on anything like `if (league.slug === 'farajleague')`. Differences between leagues are data.
- **T-28: no query without a league.** Every function in `packages/database` that touches league data requires a league ID argument; there is no way to call it without one. The database enforces the same thing again underneath ([T4](T4-tenancy-auth-security.md)).
- **T-29: what goes to the browser is chosen, not leaked.** Queries return objects built field by field for their screen. A new private column is invisible to every screen until someone deliberately adds it.
- **T-30: settings and secrets are read in one place** at startup, checked against a schema, and the app refuses to start if one is missing. Secrets never appear in browser code; a build check confirms it.
- **T-31: naming.** Files are `kebab-case.ts`. One command or query per file, named for what it does (`end-game.ts`). Tests sit beside the code as `end-game.test.ts`. Database tables and columns are `snake_case`.
- **T-32: strict TypeScript settings**, no `any`, no ignored errors without a comment saying why.
- **T-33: size is a signal.** A file past about 300 lines, or a command doing three separate things, gets split.
- **T-34: every address is built by one function, and the league a request is for is worked out in one place.** No page or email writes `/{league}/...` by hand; it calls one helper (`leagueUrl(league, 'schedule')`). `server/context.ts` is the only code that turns a request's host and path into a league. Today both read the first part of the path. Switching to `farajleague.oursite.com` (U-13) or to a league's own domain (U-2) changes those two places and nothing else. A check fails the build on a hand-written league address.

## 7. Worked example: adding "availability polls"

A league wants players to answer "are you coming Sunday?".

1. `supabase/migrations/`: a new SQL file creating `availability_responses` (with `league_id`).
2. `packages/contracts`: the shape of a response.
3. `packages/core/src/modules/teams/commands/set-availability.ts`, with its permission rule and test.
4. `packages/database`: the query that saves and reads responses.
5. `packages/core/src/modules/notifications`: include the question in the game-day reminder when the feature is on.
6. `apps/web`: a button on `/{league}/my` and a column on the captain's team page.
7. `packages/core/src/modules/leagues`: a feature switch so each league can turn it on.

Seven small, predictable places. Nothing in schedules, games, the site editor or any other league is touched.
