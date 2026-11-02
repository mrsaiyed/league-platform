# Live stats on Supabase

**November 2, 2026 · Ready; Supabase project not created yet**

The tracker saves to embedded PostgreSQL on the scoring computer until it is given a hosted database. Supabase is PostgreSQL, so the same tables, the same saving and the same checks apply. There are two steps, and the second is optional:

1. **Save to Supabase from the scoring laptop.** The tracker still runs on the laptop; every tap is saved in Supabase. About fifteen minutes, no hosting needed.
2. **Put the tracker online** so anyone can follow games from anywhere and scorers can use a tablet. This needs a host as well.

Games tracked on the laptop before Supabase existed are copied up with one command and nothing is doubled, so it is fine to start scoring now.

## 1. Save to Supabase from the scoring laptop

1. Create a project at [supabase.com](https://supabase.com). Choose a region near Houston (for example US East or US Central), and save the **database password** somewhere safe. A password of letters and numbers avoids having to encode symbols.
2. In the project, open **Connect** and copy the **Session pooler** connection string. It works on networks without IPv6, unlike the direct connection. It looks like `postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres`.
3. In this folder, copy `.env.example` to `.env`, and set `DATABASE_URL=` to that string with your password in place of `[YOUR-PASSWORD]`. `.env` is never committed.
4. Check it:

   ```sh
   npm run stats:db-check
   ```

   It connects, creates the tables (in their own `live_stats` schema), writes a test record, reads it back and rolls it back, then reports what is stored and how quickly the database answers. If something is wrong it says what to fix: the placeholder still there, a wrong password, the IPv6-only address, or a paused project.

5. Copy up anything already tracked on this computer. Stop the tracker first (Ctrl+C):

   ```sh
   npm run stats:copy
   ```

   It lists the teams, players and games it will copy and asks before writing. Run it again any time; anything already there is skipped. `-- --dry-run` only shows the list.

6. Start the tracker as usual with `npm run dev:stats`. It prints `Database: PostgreSQL at …pooler.supabase.com`. Every tap now goes to Supabase.

**At the gym:** the laptop needs internet to save. If the connection drops mid-game, keep scoring: taps wait in the browser (the tracker says how many) and go through, once each and in order, when it is back. Keep the tracker tab open until it says **Saved to the database**. With no internet at all, run the tracker without `DATABASE_URL` (rename `.env` for the day), then run `npm run stats:copy` afterwards.

**Backups:** `npm run stats:copy -- --from DATABASE_URL --to .local/backups/2026-12-02 --yes` copies everything from Supabase into a folder on this computer (`.local` is never committed). Supabase's own backups depend on the plan.

**Free projects pause** after a week without use. Open the Supabase dashboard and restore it the day before a game, then run `npm run stats:db-check`.

## 2. Put the tracker online

The tracker runs online as one small Node server. Anyone with the link can follow games live; only scorers who sign in with the scorer passcode can track stats or edit rosters.

| Piece    | First choice                    | Requirement                                                                                                                              |
| -------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Database | Supabase (PostgreSQL)           | Any PostgreSQL works. Another kind of database needs an adapter; see [storage](#changing-the-database).                                  |
| Server   | Any host that runs a Dockerfile | One always-on instance, HTTPS, long-lived responses (live updates). Render, Railway, Fly.io or a VPS all qualify; check current pricing. |
| Settings | Environment variables on host   | Below. Keep the two secrets out of the repository.                                                                                       |

| Variable                     | Value                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`               | **Secret.** The Session pooler connection string, as above.                                                       |
| `LIVE_STATS_SCORER_PASSCODE` | **Secret.** The passcode scorers sign in with; 12 characters or more is best (8 minimum).                         |
| `LIVE_STATS_PUBLIC_URL`      | The site's address, e.g. `https://stats.example.org`. Turns on online mode.                                       |
| `DATABASE_CA` (optional)     | The database's CA certificate, as text or a file path, so the server's identity is verified as well as encrypted. |
| `PORT`                       | Set by most hosts automatically; the image defaults to 8080.                                                      |

1. Do step 1 first, so the database is checked and holds the games so far.
2. On the host, create a web service from this repository's `Dockerfile`, in a region near the database, and set the variables above.
3. Deploy. On start the server creates any missing tables and loads the TCSAAL schedule; games already tracked are left as they are. `/healthz` answers when it is up.
4. Scorers open `/sign-in` once on each device they score from. Changing the passcode signs every device out.

## How the data is protected

- The tables live in their own `live_stats` schema, which Supabase's automatic Data API does not publish. Only the stats server reads and writes them, with the database password it holds. Browsers never talk to the database. Do not add `live_stats` to the API's exposed schemas.
- In case it is exposed by mistake, every start of the server turns on row-level security with no policies on each table and removes access for Supabase's `anon` and `authenticated` roles, so the public API keys can read nothing. The server connects as the tables' owner, which this does not limit.
- Connections are encrypted. Set `DATABASE_CA` to verify the server's identity as well.

## Running it well

- **One instance.** Live updates go out from the server that saved the play. Running more than one needs a shared channel first (PostgreSQL `LISTEN/NOTIFY` or Supabase Realtime).
- **Wake it before warm-ups.** Free hosting plans that sleep when idle take a minute to wake, and free Supabase projects pause after a week; open the schedule and run the database check the day before.
- **Speed.** Each tap takes about a dozen quick database round trips. A server in the same region as the database answers in a blink; from a laptop it depends on the connection. `stats:db-check` reports the round trip and warns when it is slow. Taps never wait on it: the tracker shows them at once.
- **A dropped database connection** fails the request within ten seconds instead of hanging; the scoring device keeps the tap and sends it again.

## Changing the database

The tracker stores nothing directly. It talks to the `LiveStatsRepository` interface in `packages/database/src/live-stats/repository.ts`. Today there are two adapters: PostgreSQL, used for both the embedded local database and hosted PostgreSQL such as Supabase, and an in-memory document store that shows nothing needs SQL. Moving to Firestore, MongoDB or another service means:

1. Write an adapter implementing the interface.
2. Add it to the adapters in `tests/live-stats-storage.test.mjs` and make every test pass.
3. Add a case for it in `apps/live-stats/storage.ts`, chosen by an environment variable.

`npm run stats:copy` copies between PostgreSQL databases only; moving to another kind of database would need its own one-off copy.

How Firestore would map, for example:

| Interface      | Firestore                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| teams, players | `teams` and `players` collections                                                                                      |
| games          | `games` collection; the game state, score, status and revision on the game document                                    |
| `record()`     | `runTransaction`: read the game and `games/{id}/actions/{commandId}`; if new, write the action, the game and its lines |
| `gameLines()`  | `games/{id}/lines`, or a map on the game document                                                                      |
| `finalLines()` | query final games for a team and read their lines                                                                      |
| schedule order | `orderBy('startsAt')`                                                                                                  |

See [ADR-005](../architecture/decisions/005-swappable-live-stats-storage.md) for the reasoning.
