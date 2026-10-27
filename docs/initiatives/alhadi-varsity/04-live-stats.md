# Live stat tracking

[Initiative index](README.md) · October 27, 2026 · Baseline MVP, running locally

The first working module of the wider platform: Al-Hadi's season schedule, a courtside tracker that works like the Faraj League one, and live game pages. Stat tracking will be one option in the full product; this is the baseline it grows from, not the whole of it.

## Run it

```sh
npm ci
npm run dev:stats
```

Open `http://127.0.0.1:4180`. Stop with Ctrl+C. Records are kept in embedded PostgreSQL under gitignored `.local/live-stats/`; set `LIVE_STATS_DATA_DIR` or `LIVE_STATS_PORT` to use another folder or port. Only one server opens a database at a time; a lock left by a crash or a killed process is cleared on the next start.

- **Phones watching in the gym:** start with `LIVE_STATS_LAN=1` and open one of the addresses it prints on a phone on the same Wi-Fi. Other devices can watch but not score.
- **Scoring from a tablet:** also set `LIVE_STATS_SCORER_PASSCODE`; every device, this computer included, then signs in at `/sign-in` to score. (`LIVE_STATS_REMOTE_SCORING=1` lets any device on the network score without signing in; only on a network you trust.)
- **Online:** see [putting live stats online](../../operations/live-stats-hosting.md).

## Pages

| Page           | What it does                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| Schedule (`/`) | The 2026–27 TCSAAL fixtures, record, live score and clock for a game in progress, finals with W/L.        |
| Tracker        | Courtside scoring for one game. Opens from **Track live stats**; only on the computer running the server. |
| Game page      | Scoreboard, clock, both box scores and the play-by-play, updating live. Anyone on the network can watch.  |
| Roster & stats | Al-Hadi's roster (name and jersey, no limit) and season totals from final games.                          |

## Tracker, compared with Faraj League

| Faraj League tracker                                                    | Here                                                                                |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Tap a player: +1, +2, +3, Foul, −Foul                                   | Same                                                                                |
| Bench player's options include "In for" buttons; drag bench onto floor  | Same                                                                                |
| Tap five players to set a starting five                                 | Same; a short-handed team can start with fewer                                      |
| Undo and redo through the play list                                     | Same; undoing a period change also puts the old clock back                          |
| Tap the clock to set it; setting it back takes minutes off the floor    | Same                                                                                |
| Period picker, team fouls, bonus badge and horn                         | Same; quarters or halves per game, and overtime continues the last period's fouls   |
| Swap colors, Mark not started, End game                                 | Same; End game locks the game until **Reopen game**                                 |
| Jersey numbers panel                                                    | **Players** panel: add players by name and number for both teams, as many as needed |
| Play log                                                                | Same, with the running score; the full play-by-play is on the game page             |
| Log kept on the device, totals pushed in batches, **Save stats** button | Every tap is saved to the database as it happens, so there is no separate save      |

## Storage

The tracker talks to one storage interface, so the database can change without touching it. PostgreSQL serves both the local embedded database and hosted ones such as Supabase; a document-store adapter runs the same tests to show a NoSQL database such as Firestore would fit. See [ADR-005](../../architecture/decisions/005-swappable-live-stats-storage.md).

## What is saved, and when

Each tap is a command with its own id and the time it was tapped. The server applies it with the same engine the browser uses (`packages/sports/src/basketball/live.ts`) and, in one transaction, records the command, the new game state, the score and status, and every player's box score line. A command it has already taken is ignored, so retrying is always safe.

The browser shows the tap immediately and keeps it in a queue in local storage until the server confirms it. If the connection drops, the tracker keeps scoring, says how many actions are waiting, and sends them in order when the server is back; the clock uses the moment each action was tapped. Live pages receive each saved change from the server as it happens.

Stats kept: points, 3-pointers, 2-pointers and free throws made, personal fouls, minutes and games played. Minutes come from the running clock while a player is on the floor. A player who never got on the floor is DNP and does not get a game played. Season totals count final games only.

## Schedule and format

The ten fixtures were copied from the [TCSAAL team page](https://texascharter.org/tc_team/26-27-al-hadi-school-varsity-boys-basketball/) on October 27, 2026 into `apps/live-stats/data/tcsaal-alhadi-varsity-boys-2026-27.json`, including the two exhibitions and each game's TCSAAL number and link. TCSAAL lists game 533 (January 8) as an Al-Hadi away game at the Al-Hadi Gym; it is kept as published. Each start re-reads that file: a game nobody has touched yet picks up edits (a new time or venue); a game that has been tracked is never changed.

Each game defaults to four 8-minute quarters with 4-minute overtime, team fouls resetting each quarter and the bonus on the fifth, as in high-school play. A **Halves: 2 × 20** preset matches Faraj League. Confirm TCSAAL's varsity format and set it under **Format** before tip-off; it is fixed once the game is under way.

## Not yet

- Deployed online. Everything is ready (Supabase/PostgreSQL support, scorer sign-in, a Dockerfile, the [hosting guide](../../operations/live-stats-hosting.md)); it needs a Supabase project and a host chosen and set up.
- Accounts and roles (scorekeeper, coach, viewer) in place of the shared scorer passcode, and rules for what the public may see.
- Handing a game from one scoring device to another mid-game, and correcting minutes after the fact.
- More stats (rebounds, assists, steals, blocks, turnovers, missed shots) and exports.

The earlier rehearsal (`npm run dev:varsity`) and the hosted Sites pilot are separate and unchanged; they do not share records with this tracker.

## Checks

`npm test` covers the engine (scoring, fouls, bonus, substitutions, minutes, clock corrections, undo/redo, periods, final/reopen); storage, with the same tests run against every database adapter (seeding, unlimited rosters, atomic saves, retries, refused plays, season totals); and the server online (passcode required, sign-in, wrong-passcode limit). `npm run test:stats:browser` drives the whole flow in a real browser with its own throwaway database and saves screenshots to `artifacts/screenshots/live-stats-*.png`.
