# Live stats on GitHub Pages and Supabase

**November 2, 2026 · Site published; Supabase project not created yet**

**The site:** <https://mrsaiyed.github.io/league-platform/>

Anyone can open it to see the schedule, follow a game live, and see box scores, the play-by-play, season stats and game logs. Scorers sign in with the scorer passcode to track games and edit rosters. The site saves to Supabase straight from the browser; there is no server to run or pay for. The earlier concept demo is now at <https://mrsaiyed.github.io/league-platform/demo/>.

Until Supabase is connected, the site says "This site is not connected to its database yet". The one-time setup below fixes that.

## One-time setup (about 15 minutes)

### 1. Create the Supabase project

1. Sign in at [supabase.com](https://supabase.com) and choose **New project**.
2. Name it (for example `alhadi-live-stats`). Choose a **region near Houston**, such as East US or Central US.
3. Set a **database password** and keep it somewhere safe. The site never needs it; only the optional laptop tools below do.
4. Choose the **Free** plan, create the project and wait a minute or two while it starts.

### 2. Create the tables, API and schedule

1. On GitHub, open [`supabase/setup.sql`](../../supabase/setup.sql), choose **Raw**, then select all and copy.
2. In Supabase, open **SQL Editor**, start a new query, paste, and choose **Run**. It should finish with "Success. No rows returned".

It creates the stats tables in their own `live_stats` schema, the functions the site calls, and the ten 2026–27 TCSAAL fixtures. It is safe to run again; nothing tracked is ever changed by it.

### 3. Set the scorer passcode

In the SQL Editor, run this as a new query, with your own passcode of 12 characters or more:

```sql
select live_stats.set_scorer_passcode('choose-a-long-passcode');
```

Everyone who scores uses this passcode. Running it again with a new passcode signs every device out. It is stored only as a salted hash, never in the repository.

### 4. Copy the project address and public key

In Supabase, open **Project Settings → API Keys** (on some dashboards, **Connect** shows them too):

- **Project URL:** `https://<project-ref>.supabase.co`. It is under **Project Settings → Data API** if it is not on the keys page.
- **Public key:** the **publishable key** (`sb_publishable_…`), or the **anon** key from the legacy keys tab. Either works.

Never use the **secret** or **service_role** key on the site. The site build refuses it.

### 5. Connect the site to it

1. On GitHub, open the repository's **Settings → Secrets and variables → Actions → Variables** tab.
2. Choose **New repository variable** twice:
   - `SUPABASE_URL` set to the project URL.
   - `SUPABASE_ANON_KEY` set to the public key.
3. Open **Actions → Publish site → Run workflow** on `main`, and wait for the green check (about 3 minutes).

### 6. Check it

1. Open <https://mrsaiyed.github.io/league-platform/>. The schedule shows the ten games.
2. Choose **Scorer sign-in** and enter the passcode. **Track live stats** appears on each game, and **Sign out** in the header.
3. Open **Roster & stats** and enter Al-Hadi's roster (number and name). It saves as you type and carries over to every game.

The site is ready. A small daily job (**Keep Supabase awake** in Actions) stops the free project from pausing during long gaps between games, such as mid-December to January. It starts working once the two variables are set.

## Game day

**The day before**

- Open the site and check the schedule loads. If it does not and the Supabase dashboard says the project is paused, choose **Restore** there.
- On the scoring device (a laptop or tablet, charged), sign in. The sign-in lasts 7 days on that device.
- Check Al-Hadi's roster and numbers on **Roster & stats**.

**At the gym, before tip-off**

1. Connect the scoring device to Wi-Fi or a phone hotspot.
2. Open the site, find the game and choose **Track live stats**.
3. Under **Before tip-off**, choose **Enter jersey numbers**. Check Al-Hadi's numbers and enter the opponent's: type them all into **Several numbers** (`3 5 10 12 14 21`) and choose **Add all**. Names are optional. Choose **Done**.
4. The format defaults to four 8-minute quarters. If TCSAAL's differs, set it under **Format** now; it is fixed once the game starts.
5. Tap each team's starting five, then **Start** the clock at tip-off.
6. Share the game with parents: the **Live page ↗** link at the top of the tracker, or the game on the schedule. It updates every couple of seconds; no sign-in needed.

**During the game**

- Tap a player for +1, +2, +3, Foul, −Foul or TO. Tap a bench player to sub them in, or drag them onto whoever is coming off. Tap a team's turnovers to see each player's, with − to take one back.
- Watch the line under the buttons. **Saved to the database** means everything is saved. **Not connected — N actions kept on this device** means keep scoring: the taps are kept on the device and saved, once each and in order, when the connection is back. **Signed out** means sign in again from the link; the waiting taps then save.
- Do not close the tab, clear the browser's data or use a private window while taps are waiting.
- **Undo** reverses the last play. Tap the clock to correct it. Use one scoring device per game.

**After the final buzzer**

- Choose **End game**. The final goes on the schedule, and the box score counts toward season stats and the game logs. **Reopen game** corrects anything later.

**If something goes wrong**

- **The site will not load the game, or there is no internet at all:** score on a laptop with `npm run dev:stats` (see below), then copy the game up afterwards with `npm run stats:copy`.
- **"Too many wrong passcodes":** wait 15 minutes. A device that is already signed in keeps scoring.
- **"Not connected to its database yet" or "key was refused":** check the two GitHub variables, then run **Publish site** again.
- **"The stats database is not set up yet":** run `supabase/setup.sql` again in the SQL Editor.

## How the data is protected

- The stats tables live in the `live_stats` schema, which Supabase's Data API does not publish. Row-level security is on, and the public roles have no access to them.
- The site reaches the data only through the functions `setup.sql` creates. Reading (watching) is open. Every change needs a scorer session from the passcode: sessions last 7 days, and there are at most 20 wrong passcodes per 15 minutes.
- The public key in the site is meant to be public. The database password and the secret key are never used by the site.
- What is public: the schedule, rosters (names and numbers as entered), box scores and stats. Enter only what the team is comfortable showing; numbers without names work everywhere.

## On a laptop as well (optional)

The same tracker runs on a laptop with Node.js 24 (`npm ci`, then `npm run dev:stats`, then <http://127.0.0.1:4180>). This is useful at a gym with no internet, or to keep scoring if the site cannot be reached.

- **Saving to this laptop:** this is the default. Copy the games up to Supabase afterwards:
  1. Copy `.env.example` to `.env` and set `DATABASE_URL` to the Supabase **Session pooler** connection string (**Connect → Session pooler**), with the database password in place of `[YOUR-PASSWORD]`.
  2. Run `npm run stats:db-check`. It connects, checks saving works and reports how fast the database answers.
  3. Stop the laptop tracker, then run `npm run stats:copy`. It lists what it will copy and asks first. Nothing is doubled, and it is safe to repeat.
- **Saving to Supabase from the laptop:** with `DATABASE_URL` in `.env`, `npm run dev:stats` saves to the same database as the site. The laptop's scorer passcode is separate (`LIVE_STATS_SCORER_PASSCODE`, only needed for other devices).
- **Backups:** `npm run stats:copy -- --from DATABASE_URL --to .local/backups/2026-12-02 --yes` copies everything from Supabase into a folder on the laptop.

## How it works

The site is static files on GitHub Pages: the pages, the basketball rules engine and the stats logic, bundled by `npm run build:pages`. In the browser, the same stats service the laptop server runs works against Supabase through the API in `packages/database/src/live-stats/002-api.sql`.

**Saving a tap:** the tracker applies the tap at once and keeps it in an outbox on the device. It reads the game, works out the result with the rules engine, and sends it to `ls_record`. That saves the action, the new state, the score and every box score line in one transaction, and only if the game has not changed since it was read; otherwise it reads again. An action already saved is never saved twice, so retries are always safe.

**Live pages:** watching pages ask every 2 seconds (the schedule every 10) whether the game has changed, and fetch it only when it has.

**Clock:** the game clock runs on the database's time, so every device shows the same clock.

**Checks:** `npm run test:pages:browser` runs the built site under `/league-platform/` against PostgreSQL behind Supabase's REST conventions, and the shared storage tests run against the Supabase adapter. A real Supabase project has not been tested yet; see [verification](verification.md).

## Hosting the server instead (not needed)

The Node server (`Dockerfile`) can still be hosted on Render, Railway, Fly.io or a VPS with `DATABASE_URL`, `LIVE_STATS_PUBLIC_URL` and `LIVE_STATS_SCORER_PASSCODE`. It gives instant live updates rather than polling, but needs an always-on host. The GitHub Pages site makes it unnecessary for now.

## Changing the database

The tracker talks to the `LiveStatsRepository` interface (`packages/database/src/live-stats/repository.ts`). Adapters today: PostgreSQL (the laptop's embedded database and any hosted PostgreSQL), Supabase from the browser (the static site), and in-memory documents (tests). A new database means a new adapter that passes `tests/live-stats-storage.test.mjs`. See [ADR-005](../architecture/decisions/005-swappable-live-stats-storage.md).
