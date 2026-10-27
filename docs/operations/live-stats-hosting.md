# Putting live stats online

**October 27, 2026 · Ready to deploy; not deployed yet**

The live stat tracker runs online as one small Node server with a hosted database. Anyone with the link can follow games live; only scorers who sign in with the scorer passcode can track stats or edit rosters.

## What it needs

| Piece    | First choice                      | Requirement                                                                                                                              |
| -------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Database | Supabase (PostgreSQL)             | Any PostgreSQL works. Another kind of database needs an adapter; see [storage](#changing-the-database).                                  |
| Server   | Any host that runs a Dockerfile   | One always-on instance, HTTPS, long-lived responses (live updates). Render, Railway, Fly.io or a VPS all qualify; check current pricing. |
| Settings | Environment variables on the host | Below. Keep the two secrets out of the repository.                                                                                       |

| Variable                     | Value                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`               | **Secret.** The database connection string.                                                                       |
| `LIVE_STATS_SCORER_PASSCODE` | **Secret.** The passcode scorers sign in with; 12 characters or more is best (8 minimum).                         |
| `LIVE_STATS_PUBLIC_URL`      | The site's address, e.g. `https://stats.example.org`. Turns on online mode.                                       |
| `DATABASE_CA` (optional)     | The database's CA certificate, as text or a file path, so the server's identity is verified as well as encrypted. |
| `PORT`                       | Set by most hosts automatically; the image defaults to 8080.                                                      |

## Steps with Supabase

1. Create a Supabase project. Note the database password.
2. Open **Connect** in the project and copy the **Session pooler** connection string; it works from hosts without IPv6. Put the database password into it.
3. Optionally download the project's SSL certificate (database settings) for `DATABASE_CA`.
4. On the host, create a web service from this repository's `Dockerfile` and set the variables above.
5. Deploy. On first start the server creates its tables in a `live_stats` schema and loads the TCSAAL schedule. `/healthz` answers when it is up.
6. Scorers open `/sign-in` once on each device they score from. Changing the passcode signs every device out.

The tables are in their own schema, which Supabase's automatic Data API does not publish, so they are reachable only with the database password that the server holds. Do not add `live_stats` to the API's exposed schemas.

## Running it well

- **One instance.** Live updates go out from the server that saved the play. Running more than one needs a shared channel first (PostgreSQL `LISTEN/NOTIFY` or Supabase Realtime).
- **Wake it before warm-ups.** Free plans that sleep when idle take a minute to wake; open the schedule before the game.
- **Backups.** Check the database plan's backups, or take a `pg_dump` after each game day.
- **Local games stay local.** Games tracked on a laptop before going online are not copied up automatically.

## Changing the database

The tracker stores nothing directly. It talks to the `LiveStatsRepository` interface in `packages/database/src/live-stats/repository.ts`. Today there are two adapters: PostgreSQL, used for both the embedded local database and hosted PostgreSQL such as Supabase, and an in-memory document store that shows nothing needs SQL. Moving to Firestore, MongoDB or another service means:

1. Write an adapter implementing the interface.
2. Add it to the adapters in `tests/live-stats-storage.test.mjs` and make every test pass.
3. Add a case for it in `apps/live-stats/storage.ts`, chosen by an environment variable.

How Firestore would map, for example:

| Interface             | Firestore                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| teams, players        | `teams` and `players` collections                                                                                      |
| games                 | `games` collection; the game state, score, status and revision on the game document                                    |
| `record()`            | `runTransaction`: read the game and `games/{id}/actions/{commandId}`; if new, write the action, the game and its lines |
| lines, `finalLines()` | `games/{id}/lines`, or a map on the game document; query final games for a team and read their lines                   |
| schedule order        | `orderBy('startsAt')`                                                                                                  |

See [ADR-005](../architecture/decisions/005-swappable-live-stats-storage.md) for the reasoning.
