# 044 — Vitest for logic and database tests, node:test for the older suites, Playwright for real browsers

Date: 2026-11-14. Step 1.24 (records). Records T1 choices that stage 1 uses (T1 §1, T9 §2). Decided by the lead (technical).

## What

- **Vitest 3.2.7, pinned**, runs the unit and database tests of the new code. `vitest.config.ts` lists the folders it covers (apps/web, apps/worker, the core, providers, contracts and database packages, and the new parts of sports). About 270 test files import it. `npm run test:units` runs it.
- **Database tests run on PGlite** (record 048). Each test that needs a database applies every migration first, so the timeout is long (180 seconds) and the config reduces the number of parallel workers when a lane folder runs the gate (`.local/lanes/`).
- **node:test is kept for the older suites**: `tests/` and the older parts of `packages/sports`, about 14 files. `npm test` runs them with `node --test`. The Vitest config says these keep their own runner for now.
- **Playwright 1.62.1, pinned**, drives a real browser for the end-to-end checks: `scripts/check-*-browser.mjs` and `tests/browser/*`. CI installs Chromium for them (`npx playwright install --with-deps chromium`).
- **Browser checks run apart from `npm run verify`** (`npm run test:browser`, `test:web:browser` and the others) because they need the browser installed.

## Considered

The spec names Vitest for logic and database tests and Playwright for the browser (T1 §1). The older suites were already on node:test, and the repository kept them rather than rewriting them. No other test runner is recorded as an alternative.

## Revisit if

- The node:test suites are moved to Vitest, which would make one runner for everything.
- The browser checks are needed in the everyday gate, not only in CI. They would then need a faster browser setup.
- Vitest's timeout or worker settings cause flaky database tests as the migrations grow.
