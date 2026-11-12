# T8 — Scale, reliability and operations

[Spec home](../README.md) · Decisions T-150 to T-168

How the product copes with "a league of any size", stays up, recovers from mistakes, and is run day to day by a very small team.

## 1. The sizes we design for

All figures are estimates used as design targets. They become claims only after they are measured (F-5, F-9).

| Size                      | Example       | Teams  | People  | Games a season | Live at once | Watching at once |
| ------------------------- | ------------- | ------ | ------- | -------------- | ------------ | ---------------- |
| **A. Small league**       | Faraj         | 6      | 70      | 30             | 1            | 200              |
| **B. Association**        | TCSAAL-sized  | 1,000  | 15,000  | 6,000          | 40           | 5,000            |
| **C. The whole platform** | 1,000 leagues | 10,000 | 200,000 | 100,000        | 100          | 20,000           |

For a sense of proportion: size C produces perhaps 30 million tap records a year. A single modern PostgreSQL server holds billions of rows. The data volume is not the hard part. The hard parts are busy moments (Friday night, a registration opening) and never letting one league slow another.

## 2. What makes it scale

| Mechanism                                                                                                                       | What it protects against                                 |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Public pages are cached** at Cloudflare and cleared only when their data changes ([T5](T5-customization-engine.md) section 4) | A thousand visitors causing a thousand database reads    |
| **Standings and statistics are calculated when a result changes**, not when a page is viewed                                    | Expensive maths on every page view                       |
| **Live updates are pushed by a service built for it** ([T6](T6-live-stats-and-realtime.md) section 6)                           | Thousands of open connections on our own servers         |
| **Slow work happens in the worker**, never while a person waits                                                                 | An import or a big email send freezing the site          |
| **Our servers remember nothing between requests**                                                                               | Needing one big machine; we add identical copies instead |
| **Every query starts from a league and uses an index**                                                                          | One league's size affecting another league's speed       |
| **Every list is paged and every input is capped**                                                                               | A 15,000-player roster page, a 50 MB upload              |
| **Database connections are pooled**                                                                                             | Running out of connections as copies are added           |
| **Per-league limits and fair job sharing** (T-138)                                                                              | A big league's burst starving small leagues              |

**T-150:** each of these is in place from the first stage. They are cheap to build in and expensive to add later.

## 3. What we do as load grows

| When we see                                     | We do                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Web servers busy over 70% for sustained periods | Add a copy (a setting)                                                                                                         |
| Jobs waiting longer than their targets          | Add a worker (a setting)                                                                                                       |
| Database busy over 60% for sustained periods    | Move to a larger database size (a setting, minutes of slowdown)                                                                |
| Public reads dominating the database            | Add a read-only copy and send public queries to it                                                                             |
| `game_events` past roughly 100 million rows     | Split the table by month (a planned migration)                                                                                 |
| Live-update connections near the plan's limit   | Move to the next plan; beyond that, a dedicated push service                                                                   |
| One league far larger than all others combined  | Consider giving it its own database. The code already scopes everything by league, so this is a hosting change, not a rewrite. |

**T-151:** none of these steps is taken on a guess. Each has a measurement that triggers it, shown on a dashboard.

## 4. Reliability targets

| Target                                     | Value             | Notes                                                                |
| ------------------------------------------ | ----------------- | -------------------------------------------------------------------- |
| Site and tracker available                 | 99.9% of the time | About 43 minutes a month. Depends partly on our vendors.             |
| Most data that could be lost in a disaster | 5 minutes' worth  | Through continuous database backup                                   |
| Time to be running again after a disaster  | 4 hours           | Practised, not assumed                                               |
| A game in progress during an outage        | Not lost          | The tracker keeps scoring offline and sends when we are back (T-114) |

**T-152:** these are targets we publish internally and measure. We promise numbers to customers only in an association contract, and only numbers we have met for six months.

## 5. Backups and getting things back

There are three different kinds of "undo", for three different mistakes.

| Mistake                                     | Remedy                                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| An admin deletes or changes the wrong thing | The bin (30 days), site version history, import undo, score correction. No involvement from us. |
| A bug of ours corrupts calculated data      | Rebuild standings and totals from the game records, which are never edited                      |
| The database is lost or badly damaged       | Restore to any moment in the last 7 days from continuous backup                                 |

- **T-153:** continuous ("point-in-time") backup is switched on before the first outside league joins. Daily backups alone would risk losing a whole game night.
- **T-154: a restore is rehearsed every quarter**: the production backup is restored into a scratch environment and checked. A backup that has never been restored is a hope, not a backup.
- Uploaded files are stored redundantly by the provider and are included in the rehearsal.
- **T-155:** restoring one league from backup without touching the others is possible but manual. That is why the self-service remedies in the first row matter; they must cover nearly every case.
- Any league owner can export everything at any time (O-9), which is also their own backup.

## 6. Releasing changes

1. A change is proposed as a pull request. Automatic checks run ([T9](T9-quality-and-maintainability.md)) and a preview copy of the site is created.
2. Once approved and merged, it is deployed to **staging** automatically, where a short set of browser tests runs against it.
3. It is promoted to **production** with one action. New copies start, are checked, and take over from the old ones with no downtime.

- **T-156: every release can be reversed in minutes** by promoting the previous version. That works because database changes are always made so that the previous version still runs against them (T-49).
- **T-157: unfinished features ship switched off** behind our own rollout flags (T-100), so releasing is routine and small.
- **T-158: no releases while many games are live.** The release step checks how many games are in progress and refuses above a small number unless overridden for an emergency fix.

## 7. Knowing what is happening

- **Errors** from the web app, the worker and visitors' browsers go to Sentry, grouped and deduplicated.
- **Uptime checks** every minute from outside: our home page, one league page, the health check of the web app, and the worker's heartbeat.
- **A dashboard** shows: page speed, error rate, database load, oldest waiting job, live connections, email bounce rate.
- **T-159: alerts go to a phone** for: the site down, error rate spiking, a job waiting over 10 minutes (T-142), database nearly full, bounce rate rising.
- **A public status page** shows current state and past incidents.
- **T-160: game-night watch for the first leagues.** For each early league's first few game days, someone on our side watches the dashboard during games.

## 8. Speed budgets

| Page or action                                    | Budget                                               |
| ------------------------------------------------- | ---------------------------------------------------- |
| A league page on a mid-range phone on mobile data | Main content visible within 2.5 seconds              |
| Our server's answer for a cached public page      | Under 300 ms, 95 times in 100                        |
| The same when not cached                          | Under 800 ms, 95 times in 100                        |
| Admin screens                                     | Under 1 second, 95 times in 100                      |
| Code sent to the browser for a public page        | Under about 150 KB (the 3D trophy excepted, T-102)   |
| Tracker and live pages                            | As in [T6](T6-live-stats-and-realtime.md) section 10 |

**T-161:** these are checked automatically on every change for a set of sample pages; a change that breaks a budget fails its checks.

## 9. Load testing

- **T-162:** a script generates a made-up league of size B in staging.
- **T-163:** four scripted scenarios are run against it:
  1. **Ordinary browsing**: thousands of visitors moving between schedule, standings and team pages.
  2. **Friday night**: 40 games being scored at realistic tap rates with 5,000 viewers spread across them.
  3. **Registration rush**: 500 people trying to register for 100 places within five minutes. The pass condition is exact: 100 confirmed, the rest on the waitlist in order, nobody charged twice.
  4. **Big send**: an announcement to 20,000 people while a small league's reminders are due (T-146).
- Results are written up in `docs/operations/`. The scenarios are re-run before stage 6 is called done and before any conversation with an association.

## 10. Keeping costs in hand

- Spending alerts on every vendor account.
- **T-164:** usage is counted per league (emails, storage, live connections) both to enforce fair-use limits (B-4) and so we know what each kind of league costs us.
- Image uploads are resized and capped (T-80), since storage and bandwidth are otherwise the easiest costs to lose control of.

## 11. Written procedures

`docs/operations/` holds a short, tested procedure for each of: releasing and reversing a release; restoring the database; rotating a secret; suspending and restoring a league; handling a bounce or spam-complaint spike; granting support access; responding to an incident (T-84); and the game-night checklist.

**T-165:** a procedure counts as written only after someone has followed it start to finish.

## 12. When things outside our control fail

| Failure                            | Effect                                                 | What we have done about it                                                                         |
| ---------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Database provider down             | Site unavailable                                       | Trackers keep scoring offline; cached public pages keep showing at Cloudflare; status page updated |
| Hosting provider down              | Same                                                   | Same; the app is a standard container and can be started elsewhere                                 |
| Cloudflare down                    | Site unreachable                                       | Rare and short; DNS can be pointed straight at the host                                            |
| Email service down                 | Emails late                                            | Jobs wait and retry; inbox still works                                                             |
| Live-update service down           | Live pages update every 5 seconds instead of instantly | Automatic fallback (T-119)                                                                         |
| Payment provider down              | Paid registration paused                               | Registrations can be held as "payment pending"                                                     |
| A release of ours breaks something | Varies                                                 | Reverse in minutes (T-156)                                                                         |
| **The founder is unavailable**     | Nobody can operate the business                        | See T-166                                                                                          |

**T-166 (agreed by the founder November 12): Saif Ghori is the trusted second person.** He can reach the vendor accounts and the written procedures through a shared password vault with emergency access. A product that leagues depend on every weekend cannot have a single person as its only point of recovery. Setting up the vault is a founder task during stage 1. Contact details are kept in the vault, not in this repository.

## 13. Open

**T-167** which paid tier of each vendor to start on (decided from prices at build time). **T-168** whether to pay for a second database region (not until an association contract requires it).

The estimates in section 1 are replaced by measurements after the first load test.
