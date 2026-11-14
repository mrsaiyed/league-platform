# 047 — GitHub Actions runs the same gate on every push and pull request

Date: 2026-11-14. Step 1.24 (records). Records the T1 build-and-release choice as stage 1 uses it (T1 §1, T9 §3). Decided by the lead (technical).

## What

- **One workflow, `.github/workflows/ci.yml`**, runs on every push and every pull request. Its `checks` job uses Node 24, runs `npm ci`, then `npm run verify` (the same gate as on a laptop, record 041 to 044 cover its parts).
- **The browser checks run after it**: Chromium is installed (`npx playwright install --with-deps chromium`), then `npm run test:browser`, `test:varsity:browser`, `test:stats:browser`, `test:pages:browser` and `test:web:browser` run in order.
- **A second job, `hosted-build`**, installs the older `apps/varsity-hosted` on its own lockfile, type-checks it and builds it.
- **Permissions are read-only** (`contents: read`), and Next.js telemetry is switched off for the run.
- **Live publishing is a separate workflow.** `.github/workflows/demo-pages.yml` builds the GitHub Pages site from one fixed commit; it is not triggered by an ordinary push to `main`. The rule for moving `main` is in `docs/build/STATUS.md` and is outside this record.
- **Not built yet**: automatic deploys of the platform's web app and worker to hosting, and preview environments for each change (T1 §6). Stage 1 does not deploy the platform.

## Considered

The spec names GitHub Actions (T1 §1), so no other service was weighed in the records.

## Revisit if

- Deploys are added (Render, T-9), in which case the release steps need their own record.
- The browser checks become slow enough that they must run in the everyday gate, or move to a separate schedule.
- The Node version in CI and in the container image diverge (both are 24 today; record 042).
