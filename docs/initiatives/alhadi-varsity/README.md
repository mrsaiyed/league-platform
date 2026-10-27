# Al-Hadi varsity: first scoring slice

**October 27, 2026 · Active private SQL pilot · Full game-day and platform release gates still apply**

The immediate use case is Al-Hadi keeping its varsity basketball records while participating in an externally operated competition, TCSAAL. The broader product remains an end-to-end league management platform. This slice builds the reusable game-operations capability first; it does not change the business into making separate school websites.

The founder will enter the roster, jersey numbers and confirmed fixtures later. Those records are intentionally empty. Intramurals remain a later opportunity, preserved in the [intramural folder](../alhadi-intramural/README.md).

## Documents

- [MVP behavior, scope and acceptance](01-mvp-contract.md).
- [Technical implementation and production migration](02-engineering-contract.md).
- [Faraj review and schedule provenance](03-reference-review.md).
- [Database and preview architecture decision](../../architecture/decisions/004-varsity-scoring-slice.md).
- [Broader product specifications](../../product/platform/README.md).

## Open the hosted SQL scorer

[Al-Hadi Varsity Scoring](https://alhadi-varsity-scoring.fairstone8.chatgpt.site) uses a shared online SQL database with private Site sign-in. Accepted commands save state, event history and player stat lines atomically. A second computer reads the same records. The browser only retains pending retry information. See [hosted operations](../../operations/varsity-hosting.md) and the [cross-computer handoff](../../operations/cross-computer-handoff.md).

## Run the local rehearsal

Use **Node.js 24** from the repository root:

```sh
npm ci
npm run dev:varsity
```

Open `http://127.0.0.1:4174`. Stop with Ctrl+C. Use the printed IP address, not a different hostname; the server deliberately checks its origin.

Choose **Try a practice game** without entering a real roster. Set each lineup, start/pause the clock, select jerseys, record 1/2/3-point baskets and fouls, substitute, review and finalize. Practice players and results never enter the real team totals.

For the team workflow, save the roster under **Roster**, then **Add game**. Enter the opponent's numbers (names optional), home/away status, optional date/venue/source and verified game format. Finalized records populate **Season stats** automatically. Reopen a result with a reason to correct it; it leaves totals until finalized again.

The SQL database persists at `.local/varsity/` on this computer, outside version control. Restarting the server with the same directory retains records. It is not a cloud database or accessible to another device. An export downloads one game's JSON record; it is not a tested disaster-recovery backup or an import facility. `VARSITY_PORT` and `VARSITY_DATA_DIR` can select an isolated local rehearsal.

If startup reports an existing `.local/varsity.lock`, stop the other preview. After a crash, verify the PID in that file is no longer running before removing only the stale lock. Never open the same database directory from two processes.

## What is implemented

Editable saved roster; manual game setup; opponent jerseys; first-five lineup helper; scorer controls; exact stored playing duration; basket/foul undo; period/overtime progression; live box score; persistent event history; result finalization/reopening; SQL season aggregation; game export; pending-action retry after an uncertain response; mobile layout. This is independent of the preserved intramural demo.

## What still gates real game-day use

Full platform identity/game assignments and production schema/RLS; scorer lease/takeover and offline recovery; confirmed sport rules and exceptional outcomes; clock/minute correction review; real-device full-game rehearsal; backup/restore proof; approved public-data rules. The local preview is explicitly labeled as a rehearsal and should not be used as the sole record of a real game.

GitHub Pages continues to host the existing static concept. The hosted varsity scorer uses a separate Sites deployment and shared D1 database. No current TCSAAL fixtures were imported. Hosted D1 is an explicit pilot adapter; managed PostgreSQL remains the broader product recommendation.

## Verification

```sh
npm run verify
npm run test:varsity:browser
```

Browser tests use an isolated temporary database and synthetic names. Set `BROWSER_EXECUTABLE` to an installed Chrome/Edge executable, or install Playwright Chromium. Screenshots appear in ignored `artifacts/screenshots/varsity-*.png`. Neither tests nor practice games seed the real roster.
