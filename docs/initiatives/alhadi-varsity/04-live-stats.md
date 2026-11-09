# Live stat tracking

[Initiative index](README.md) · November 9, 2026 · Ready for game use; Supabase-ready

The first working module of the wider platform: Al-Hadi's season schedule, a courtside tracker that works like the Faraj League one, and live game pages. Stat tracking will be one option in the full product; this is the baseline it grows from, not the whole of it.

## Where it is

**<https://mrsaiyed.github.io/league-platform/>**, published from `main` by GitHub Pages. It saves to Supabase straight from the browser once the project is connected (about 15 minutes, once). For the setup and the game-day checklist, see [live stats on GitHub Pages and Supabase](../../operations/live-stats-hosting.md).

## Run it on a laptop

```sh
npm ci
npm run dev:stats
```

Open `http://127.0.0.1:4180`. Stop with Ctrl+C. Records are kept in embedded PostgreSQL under gitignored `.local/live-stats/`; set `LIVE_STATS_DATA_DIR` or `LIVE_STATS_PORT` to use another folder or port. Only one server opens a database at a time; a lock left by a crash or a killed process is cleared on the next start. Settings can go in a `.env` file (see `.env.example`).

- **Supabase:** set `DATABASE_URL` in `.env`, check it with `npm run stats:db-check`, and copy games already tracked here with `npm run stats:copy`. See [live stats on Supabase](../../operations/live-stats-hosting.md).

- **Phones watching in the gym:** start with `LIVE_STATS_LAN=1` and open one of the addresses it prints on a phone on the same Wi-Fi. Other devices can watch but not score.
- **Scoring from a tablet:** also set `LIVE_STATS_SCORER_PASSCODE`; every device, this computer included, then signs in at `/sign-in` to score. (`LIVE_STATS_REMOTE_SCORING=1` lets any device on the network score without signing in; only on a network you trust.)
- **Online:** see [putting live stats online](../../operations/live-stats-hosting.md).

## Pages

| Page           | What it does                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| Schedule (`/`) | The 2026–27 TCSAAL fixtures, record, live score and clock for a game in progress, finals with W/L.        |
| Tracker        | Courtside scoring for one game. Opens from **Track live stats**; only on the computer running the server. |
| Game page      | Scoreboard, clock, both box scores and the play-by-play, updating live. Anyone on the network can watch.  |
| Roster & stats | Al-Hadi's roster (name and jersey, no limit), season totals and the team's game log from final games.     |
| Player         | One player's game log: every final game, with the number worn, minutes and stats, or DNP; season totals.  |

## Tracker, compared with Faraj League

| Faraj League tracker                                                    | Here                                                                                                      |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Tap a player: +1, +2, +3, Foul, −Foul                                   | Same, plus **TO** for a turnover                                                                          |
| —                                                                       | Team turnovers in each team's title; tap for each player's, with − to take back                           |
| Bench player's options include "In for" buttons; drag bench onto floor  | Same                                                                                                      |
| Tap five players to set a starting five                                 | Same; a short-handed team can start with fewer                                                            |
| Undo and redo through the play list                                     | Same; undoing a period change also puts the old clock back                                                |
| Tap the clock to set it; setting it back takes minutes off the floor    | Same                                                                                                      |
| —                                                                       | A foul or a timeout stops the clock; a big **Start clock** button then floats over the page until it runs |
| —                                                                       | Each team's timeouts left in its title: full and 30-second, per the format                                |
| Period picker, team fouls, bonus badge and horn                         | Same; quarters or halves per game, and overtime continues the last period's fouls                         |
| Swap colors, Mark not started, End game                                 | Same; End game locks the game until **Reopen game**                                                       |
| Jersey numbers panel                                                    | **Players** panel for both teams: by name and number, or a team's numbers at once                         |
| Play log                                                                | Every play, with the running score; the same play-by-play is on the game page                             |
| Log kept on the device, totals pushed in batches, **Save stats** button | Every tap is saved to the database as it happens, so there is no separate save                            |

## Storage

The tracker talks to one storage interface, so the database can change without touching it. PostgreSQL serves both the local embedded database and hosted ones such as Supabase; a document-store adapter runs the same tests to show a NoSQL database such as Firestore would fit. See [ADR-005](../../architecture/decisions/005-swappable-live-stats-storage.md).

## Before tip-off

Until the game starts, the tracker shows **Before tip-off** with each team's player count and an **Enter jersey numbers** button. The Players panel has both teams side by side. Type a number and name and press Enter, or type a whole team's numbers into **Several numbers** (`3 5 10 12 14 21`) and tap **Add all**: numbers already on the roster are skipped and anything that is not a jersey number is reported. Changes save as you type; a player typed into the add row is added when you leave the row or tap **Done**. Rosters carry over, so the second game against an opponent starts with the numbers from the first: check them, since teams can change jerseys.

Tap players to pick each starting five; picks survive a refresh. A short-handed team can start with fewer than five.

## The clock: fouls, timeouts and the Start clock button

A foul or a timeout stops a running clock where it happened, as the officials' whistle does (NFHS 5-8-1); the tracker says so. Only the scorer starts it again. Turnovers do not stop it, since a steal keeps play going; scores and substitutions never touch it. Undo takes a foul back but leaves the clock stopped.

While the clock is stopped (a foul, a timeout, a pause, a new period, or both starting fives set before the tip) a big green **Start clock** button floats over the bottom of the screen with the period, the clock and why it stopped, so play never runs on with the clock forgotten. Only the button takes taps: players, substitutions, the header and everything around it keep working under it, because free throws, subs and corrections happen on a stopped clock. A player's options open over it. **×** (or Escape) hides it to keep scoring on a stopped clock; it comes back the next time the clock stops or the period changes. It is gone while the clock runs, once a period is over (pick the next one) and when the game is final.

**Timeouts:** each team's title shows how many it has left; tap it to call a **Full timeout** or a **30-second** one, each showing how many are left of that kind, see those taken (period and clock) and take back the latest with −. Calling one stops the clock. A team out of timeouts can still be charged one, after a confirmation, since officials grant it at the cost of a technical foul (NFHS 5-11-6). The live game page shows each team's timeouts left, and timeouts are in both play logs.

## Play log and game logs

- **Play log:** every play (lineups, baskets, fouls, turnovers, substitutions, period changes) with the period, game clock and running score, newest first, under the tracker and on the game page. Plays still on their way to the database are dimmed, and the count says when all are saved.
- **Game history:** the database keeps every scorer action in order, undos and clock changes included (`live_stats.game_events`), alongside the game's current state.
- **Team game log** (Roster & stats): one line per final game: date, opponent, result, team 3PM, 2PM, FTM, turnovers and fouls, and the top scorer.
- **Player game log** (tap a name): one line per final game: the number worn, minutes, points, 3PM, 2PM, FTM, turnovers and fouls, or DNP, with season totals and per-game averages.
- A final game's box score keeps each player's name and number as they were in that game, so editing a roster later does not rewrite past games.

## What is saved, and when

Each tap is a command with its own id and the time it was tapped. The server applies it with the same engine the browser uses (`packages/sports/src/basketball/live.ts`) and, in one transaction, records the command, the new game state, the score and status, and every player's box score line. A command it has already taken is ignored, so retrying is always safe.

The browser shows the tap immediately and keeps it in a queue in local storage until the server confirms it. If the connection drops, the tracker keeps scoring, says how many actions are waiting, and sends them in order when the server is back; the clock uses the moment each action was tapped. A request that gets no answer gives up after 12 seconds and is sent again, so one stalled request never holds up the rest. A tap is only dropped when the rules refuse it (the tracker says so); a server or database error, a timeout, or an expired sign-in keeps it waiting. If the tracker is opened while the server is down, it keeps trying until the game loads. Live pages receive each saved change from the server as it happens.

A tap answered by the server is on disk: a test kills the server outright straight after a tap is confirmed and checks that everything is there on restart. With a hosted database, a connection that drops fails the request within 10 seconds rather than hanging, and is replaced.

Stats kept: points, 3-pointers, 2-pointers and free throws made, personal fouls, turnovers, minutes and games played.

**Turnovers** are charged to a player: tap them, then **TO** (the tracker confirms it, since player tiles do not show turnovers). Each team's title shows its total, the sum of its players' turnovers; tap it to see each player's, and tap − beside one to take back a turnover recorded by mistake (Undo only reaches the last play). **+ Team turnover** in that list records one charged to the team rather than a player (a shot-clock or 5-second violation, say): it counts in the team's total, the box score total (with a note saying how many were the team's) and the team game log, never in a player's stats. They count in the box score, season totals and both game logs, and do not touch the score, fouls or bonus. Games tracked before turnovers were added count none; a database made before then gains the column on the next start. Minutes come from the running clock while a player is on the floor. A player who never got on the floor is DNP and does not get a game played. Season totals count final games only.

## Schedule and format

The ten fixtures were copied from the [TCSAAL team page](https://texascharter.org/tc_team/26-27-al-hadi-school-varsity-boys-basketball/) on October 27, 2026 and updated on November 2, 2026, when TCSAAL moved five games (159, 438, 287, 126 and 583) to new dates, into `apps/live-stats/data/tcsaal-alhadi-varsity-boys-2026-27.json`, including the two exhibitions and each game's TCSAAL number and link. TCSAAL lists game 533 (January 8) as an Al-Hadi away game at the Al-Hadi Gym; it is kept as published. Each start re-reads that file: a game nobody has touched yet picks up edits (a new time or venue); a game that has been tracked is never changed.

Each game defaults to TCSAAL varsity's format, checked against the [TCSAAL 2025–26 basketball rules](https://s3.amazonaws.com/rsportz-production/file_assets/attachments/000/027/859/original/TCSAAL_Basketball_Rules_2025-2026.pdf) on November 9, 2026: four 8-minute quarters and 4-minute overtimes; team fouls resetting each quarter with the bonus on the fifth, as NFHS rules have it; and each team's **three full (60-second) and two 30-second timeouts a game, plus one full timeout each overtime, with none carried into overtime or from one overtime to the next**. TCSAAL plays NFHS rules except where it says otherwise, uses no shot clock, and stops the clock "for out-of-bounds, time-outs, free-throws and any other time under NFHS/UIL rules."

**Format** offers three presets, to set before tip-off (the format is fixed once the game is under way):

| Preset            | Periods                  | Timeouts                                                                                             |
| ----------------- | ------------------------ | ---------------------------------------------------------------------------------------------------- |
| TCSAAL: 4 × 8     | 8-min quarters, 4-min OT | 3 full + 2 × 30 s a game, 1 full each overtime, none carried over                                    |
| UIL (NFHS): 4 × 8 | The same                 | The same, but unused ones carry into overtime (NFHS rule 5-11-1, which UIL plays)                    |
| Halves: 2 × 20    | Faraj League's halves    | 2 full a half, 1 each overtime, none carried over: a common rec-league rule; confirm with the league |

Any of it can be changed by hand: full and 30-second timeouts, per game or per half, how many each overtime, and whether unused ones carry over. Games saved before timeouts were tracked count TCSAAL's.

## Not yet

- A Supabase project. Everything is ready: create it, put the connection string in `.env`, run `npm run stats:db-check`, then `npm run stats:copy` (see the [guide](../../operations/live-stats-hosting.md)).
- Deployed online. Scorer sign-in, a Dockerfile and the guide are ready; it needs a host chosen and set up.
- Accounts and roles (scorekeeper, coach, viewer) in place of the shared scorer passcode, and rules for what the public may see.
- Handing a game from one scoring device to another mid-game, and correcting minutes after the fact.
- More stats (rebounds, assists, steals, blocks, missed shots) and exports.

The earlier rehearsal (`npm run dev:varsity`) and the hosted Sites pilot are separate and unchanged; they do not share records with this tracker.

## Checks

`npm test` covers the engine (scoring, fouls, bonus, substitutions, minutes, clock corrections, fouls and timeouts stopping the clock, timeouts per game, per half and in overtime with and without carry-over, undo/redo, periods, final/reopen); storage, with the same tests run against every database adapter (seeding, unlimited rosters, atomic saves, retries, refused plays, season totals, team and player game logs); the server online (passcode required, sign-in, wrong-passcode limit) and killed outright mid-game; and Supabase readiness (the public API roles locked out, connection-string advice, copying games up to a database reached over the network and back down as a backup, without doubling anything). `npm run test:stats:browser` drives the whole flow in a real browser, the Start clock button included (it comes up at the tip, after a foul, a timeout and a pause; stats and subs work under it; × and Escape hide it) with its own throwaway database and saves screenshots to `artifacts/screenshots/live-stats-*.png`.
