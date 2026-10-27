# Start here on another computer

**October 27, 2026 · Canonical repository: https://github.com/mrsaiyed/league-platform**

## Product direction to preserve

The product is an end-to-end league management platform giving each league a customizable public website and private administration dashboard, with shared core tools and optional modules. Organizers should configure and operate their leagues without a developer creating a separate site or database fork for each customer.

Immediate implementation: **Al-Hadi varsity game statistics while the team participates in externally run TCSAAL**. Intramurals are a later opportunity. The varsity scorer is the first reusable operational module, not a change into a custom-school-website business. Work on the shared platform specs/architecture can proceed in parallel.

The founder explicitly requires database persistence **after each accepted scoring action**, not browser-only storage. The hosted pilot writes game state, event receipt/history and player stat lines atomically to shared SQL. Browser storage holds only a pending retry. Do not replace this with a static simulation to make deployment easier.

## Read in this order

1. [Overall product specification](../product/platform/README.md), then its engineering package.
2. [Current varsity initiative](../initiatives/alhadi-varsity/README.md), including behavior, engineering and Faraj source review.
3. [Hosted operations](varsity-hosting.md) and `apps/varsity-hosted/README.md`.
4. [Preserved intramural work](../initiatives/alhadi-intramural/README.md) only when that opportunity resumes.

## Online access

Open [the private SQL scorer](https://alhadi-varsity-scoring.fairstone8.chatgpt.site) and sign into the same owner account. The older [GitHub Pages concept](https://mrsaiyed.github.io/league-platform/) remains the intramural presentation. They have different purposes; only the private hosted scorer saves accepted game actions to the shared SQL database.

## Code map

| Path                        | Purpose                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `packages/contracts`        | Shared strict API/game/roster validation                           |
| `packages/sports`           | Pure basketball events, clock, lineups, points, fouls and duration |
| `packages/database`         | Local PGlite/PostgreSQL rehearsal adapter                          |
| `apps/varsity-preview`      | Shared scorer UI plus loopback local server                        |
| `apps/varsity-hosted`       | Managed hosted API and D1 SQL adapter/migrations                   |
| `examples/alhadi-school`    | Preserved fictional intramural presentation on GitHub Pages        |
| `docs/product/platform`     | Broader reusable platform specifications and future engineering    |
| `scripts/prepare-varsity-*` | Deterministic shared-source preparation and provider mirror        |

## Continue work

```sh
git clone https://github.com/mrsaiyed/league-platform.git
cd league-platform
npm ci
npm run verify
```

Use Node 24. Root verification prepares the shared hosted-test sources before executing tests. For the local PGlite rehearsal use `npm run dev:varsity` and `http://127.0.0.1:4174`. For the hosted adapter install its dependencies separately and follow the hosting guide. Windows ARM64 requires x64 Node 24 for Cloudflare's local runtime.

The hosted scorer's online database is independent of the computer. Signing into the same owner account gives access on another computer. Git does not contain database records, credentials, browser profiles or local `.local`/`.wrangler` data. Export/backup operations are separate from source control.

## Known constraints and next steps

- No actual roster/jersey numbers or exact current-season fixture link supplied yet; the founder will enter them later. No guessed fixtures or identities from photographs.
- Current stats: points, made 1s/2s/3s, personal and period fouls, appearance and exact stored durations. No captured misses/FG%, rebounds, assists, steals, blocks or turnovers.
- Zero-point appearances count as GP; DNP does not. Practice records never count toward real season totals.
- Midgame clock correction flags minutes for review rather than inventing repaired durations.
- The hosted Site stays owner-private. General staff roles, scorer leases/offline queues, public projections and full multitenant isolation are later implementation gates.
- Team records do not claim to be TCSAAL's official results or standings.
- Managed PostgreSQL is the broader product target; hosted D1 is an explicit pilot adapter, with migration requirements documented. Do not grow customer-specific source forks.
- Registration, payments, drafting and the site editor are independent future modules; they must not block validating this scorer first.

Verification and deployment outcomes belong in [the verification log](verification.md). Record unresolved limitations honestly before game-day reliance.
