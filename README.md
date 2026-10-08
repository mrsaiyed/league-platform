# League platform

A basketball-first league-management product, starting with an Al-Hadi school intramural pilot. This repository currently contains the product specification, architecture decisions, and a working presentation concept.

**Status: concept and planning.** There is no production authentication, database, payment processing, email delivery, or tenant isolation in this repository yet. All demo records are fictional. The school has not approved the sample rules, dates, fee, or program.

**Live concept:** [Open the Al-Hadi demo](https://mrsaiyed.github.io/league-platform/).

## Show the concept

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
docs/product/                School specification and account/notification addendum
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
```

`verify` checks syntax, module references, asset presence, the offline boundary, domain tests, formatting, and the build. Browser checks exercise the portable artifact on desktop and mobile. Install the test browser once with `npx playwright install chromium`, or set `BROWSER_EXECUTABLE` to an installed Chrome/Edge executable. `BROWSER_PROFILE_DIR` can select an isolated writable profile directory for restricted Windows environments. Never use a personal browser profile for these tests.

The browser check also exports presentation screenshots under `artifacts/screenshots/`. These are generated deliverables, not source.

## What is interactive

- Sample signup, simulated upfront payment, private application status, approval, and waitlist refund.
- Single-host draft rehearsal with snake order, duplicate/capacity checks, undo, timer, and reload recovery.
- Round-robin schedule generation, review, and simulated publication.
- Sample scoring, substitutions, playing seconds, finalization, and local recovery.
- Optional public sections, accent colors, and homepage announcements.
- Personal player page, website inbox, read markers, and notification preferences.

Some screens intentionally represent different stages of a season. Draft rehearsal, generated scheduling, sample public results, and the scoring rehearsal are **separate scenarios**. They do not pretend to be a synchronized production season. Clocks pause when leaving the screen or hiding the tab. The prototype does not implement a complete basketball rules engine or durable event replay.

## Product and technical decisions

Read the [school specification](docs/product/school-pilot-spec-v0.1.md), [accounts and notifications proposal](docs/product/accounts-and-notifications-v0.2.md), and [architecture boundaries](docs/architecture/README.md).

The proposed production stack remains Next.js, React, strict TypeScript, and Supabase/PostgreSQL. Its authentication, server-side commands, row-level permissions, financial reconciliation, and durable game events must be implemented and tested independently. Adding unused application scaffolding now would not provide those guarantees.

## Upload and share

See [GitHub and sharing](docs/operations/github-and-sharing.md). The owner has configured a public repository and GitHub Pages. The Pages workflow publishes when manually dispatched. For slide-ready screenshots, run `npm run capture:presentation` after building and see the [principal review](docs/presentation/principal-review.md).

## Ownership and assets

No open-source license has been selected. Do not treat repository visibility as a license grant. The Al-Hadi logo was supplied for this concept; the school retains its identity rights. The current concept uses founder-supplied AHS photographs; sample rosters and statistics remain fictional. See [asset provenance](docs/presentation/assets.md).
