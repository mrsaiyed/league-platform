# League platform

An end-to-end league-management platform with customizable public websites, private administration, and reusable operational modules. Basketball is the first implemented sport. The immediate use case is Al-Hadi varsity keeping its own game records within TCSAAL; the broader product serves organizers through shared, configurable software. Intramurals remain a later opportunity.

**Status: detailed specifications, a local rehearsal and a private hosted SQL scoring pilot.** The hosted MVP saves each accepted action, event and player stat line to a shared database. It uses Sites sign-in and owner-private access; general staff roles, production tenant isolation, public publication, payments and email remain future work. The older intramural demo remains a separate fictional presentation.

**Preserved presentation concept:** [Open the Al-Hadi demo](https://mrsaiyed.github.io/league-platform/).

**Online scorer:** [Al-Hadi Varsity Scoring](https://alhadi-varsity-scoring.fairstone8.chatgpt.site). Sign in with the owner account. Saved game records are shared across computers; browser storage is used only for pending retries. See the [cross-computer handoff](docs/operations/cross-computer-handoff.md).

## Run the local rehearsal

Use **Node.js 24**:

```sh
npm ci
npm run dev:varsity
```

Open `http://127.0.0.1:4174` and choose **Try a practice game**. Select both lineups, start the clock, record baskets/fouls and substitutions, then pause and finalize. Practice results never enter the real team totals. The roster and confirmed fixtures are left empty for later entry.

For a team game, save names/numbers under **Roster**, then add a game and enter the opponent's numbers. Finalized game records update **Season stats** automatically. Reopening a result withdraws it until corrected and finalized again.

Records persist under gitignored `.local/varsity/` on this computer. This local-only server uses embedded PostgreSQL (PGlite); it is not a cloud service, protected account system or production-ready scorer. Keep practice as the working demo until the [game-day release gates](docs/initiatives/alhadi-varsity/01-mvp-contract.md) pass. Stop with Ctrl+C. See the [initiative guide](docs/initiatives/alhadi-varsity/README.md) for exact scope, recovery and run instructions.

GitHub Pages continues to show the preserved intramural concept. The database-backed varsity app is deployed separately through Sites; ordinary GitHub push alone does not deploy it. See [hosting operations](docs/operations/varsity-hosting.md).

## Show the preserved intramural concept

Use Node.js 24 and run:

```sh
npm ci
npm run build:demo
```

Open `dist/Al-Hadi League Demo.html` in a current Chrome or Edge browser. It contains the code, school logo, and illustrative court image in one file and works without a server. Send this **HTML file** to another person; they can download it and open it locally. It is not an account-protected product.

For development:

```sh
npm run dev
```

Open `http://127.0.0.1:4173`. The server binds only to your computer. Stop it with Ctrl+C. The source uses native ES modules and an import map; serve the source through HTTP rather than opening its index file directly.

Use the **Meeting guide** at the top of the concept for a walkthrough. **Public site**, **Commissioner**, and **My league** show different perspectives. The reset icon restores the original fictional data.

## Repository layout

```text
apps/varsity-hosted/         Private hosted API, shared SQL adapter and migrations
apps/varsity-preview/        Shared scorer UI and local loopback HTTP server
packages/contracts/          Validated typed roster/game/command schemas
packages/sports/             Pure basketball state, clock and scoring rules
packages/database/           Local SQL schema, scoped queries and transactions
examples/alhadi-school/       Presentation prototype; deliberately isolated
  assets/                    School seal, Lions crest, and supplied AHS photographs
  src/
    data.js                  Fictional fixtures
    domain.js                Demo calculations, draft, schedule, and game clock
    context.js               Browser-only demo state and helpers
    components.js            Reusable presentation components
    views/public.js          League and personal-player pages
    views/commissioner.js    Commissioner workflows
    router.js                Page composition
    dialogs.js               Dialog presentation and focus handling
    actions.js               Simulated commands
    main.js                  Event wiring
  styles/                    Public, commissioner, overlays, responsive, school branding
  manifest.json              Explicit modules, styles, and asset inventory
docs/product/platform/       Active product specifications; thirteen product sections
  engineering/               Detailed build contracts: source, data, admin, security, scale
docs/initiatives/            Active varsity MVP; preserved intramural plans for later
docs/architecture/           Decisions, boundaries, and future production structure
docs/presentation/           Meeting narrative and asset provenance
docs/operations/             GitHub upload and static-demo sharing
scripts/                     Local server, checks, and reproducible packaging
tests/                       Domain and fixture invariants
.github/workflows/           Continuous checks; manual static-demo deployment
```

Generated `dist/`, screenshots, local dependencies, credentials, and browser profiles are not committed. The example is a design reference, not a shortcut around the production architecture.

## Quality checks

```sh
npm run verify
npm run test:browser
npm run test:varsity:browser
```

`verify` checks demo syntax/assets, strict TypeScript, domain/database tests, formatting and the preserved demo build. The varsity browser check uses a disposable SQL database to exercise roster entry, scoring, lost-response recovery, reload, automatic totals and desktop/mobile layouts. The other browser check exercises the portable intramural artifact. Install the test browser once with `npx playwright install chromium`, or set `BROWSER_EXECUTABLE` to an installed Chrome/Edge executable. `BROWSER_PROFILE_DIR` can select an isolated writable profile directory for restricted Windows environments. Never use a personal browser profile for these tests.

The browser check also exports presentation screenshots under `artifacts/screenshots/`. These are generated deliverables, not source.

## What is interactive in the preserved intramural concept

- Sample signup, simulated upfront payment, private application status, approval, and waitlist refund.
- Single-host draft rehearsal with snake order, duplicate/capacity checks, undo, timer, and reload recovery.
- Round-robin schedule generation, review, and simulated publication.
- Sample scoring, substitutions, playing seconds, finalization, and local recovery.
- Optional public sections, accent colors, and homepage announcements.
- Personal player page, website inbox, read markers, and notification preferences.

Some screens intentionally represent different stages of a season. Draft rehearsal, generated scheduling, sample public results, and the scoring rehearsal are **separate scenarios**. They do not pretend to be a synchronized production season. Clocks pause when leaving the screen or hiding the tab. The prototype does not implement a complete basketball rules engine or durable event replay.

## Product and technical decisions

Start with the [product specifications v0.7](docs/product/platform/README.md). Its thirteen product sections cover the business, domain/data model, setup and website customization, security/privacy, registration, finance, competition, statistics, engagement, architecture, operations, enterprise expansion, and decisions/delivery. The [detailed engineering package](docs/product/platform/engineering/README.md) specifies files/module boundaries, database fields and constraints, admin/editor schemas, API transactions, security controls, durable scoring/jobs, capacity budgets and build evidence.

The earlier customer-centered proposal and combined v0.1–v0.3 drafts are preserved under [Al-Hadi intramural](docs/initiatives/alhadi-intramural/README.md). They inform the new plan but do not set product-wide prices, school eligibility, calendars, or staffing obligations. See also the [architecture boundaries](docs/architecture/README.md).

The proposed production stack remains Next.js, React, strict TypeScript, and Supabase/PostgreSQL. The new local scorer implements validated commands, durable events and atomic stat updates. Hosted authentication, row-level permissions, scorer leases, offline recovery, result publication and financial reconciliation still require production implementation and independent verification. Adding unused application scaffolding now would not provide those guarantees.

## Upload and share

See [GitHub and sharing](docs/operations/github-and-sharing.md). The owner has configured a public repository and GitHub Pages. The Pages workflow publishes when manually dispatched. For slide-ready screenshots, run `npm run capture:presentation` after building and see the [principal review](docs/presentation/principal-review.md).

## Ownership and assets

No open-source license has been selected. Do not treat repository visibility as a license grant. The Al-Hadi logo was supplied for this concept; the school retains its identity rights. The current concept uses founder-supplied AHS photographs; sample rosters and statistics remain fictional. See [asset provenance](docs/presentation/assets.md).
