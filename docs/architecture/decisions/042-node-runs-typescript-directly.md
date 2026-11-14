# 042 — Node.js 24 runs the TypeScript directly, with no build step

Date: 2026-11-14. Step 1.24 (records). Records a T1 choice that stage 1 uses (T-2, T-16). Decided by the lead (technical).

## What

- **Node.js 24 is the runtime.** `package.json` sets `engines` to `>=24 <25`. CI (`.github/workflows/ci.yml`) and the live tracker's container image (`Dockerfile`, `node:24-slim`) use Node 24 too.
- **Node runs `.ts` files as they are.** The seed script (`packages/database/scripts/seed-leagues.ts`), the live tracker's server (`apps/live-stats/server.ts`) and the other `.ts` scripts start with `node` directly. The scripts pass `--disable-warning=ExperimentalWarning` to hide Node's notice that this is still experimental.
- **Imports name the `.ts` file**, and the compiler allows it (`allowImportingTsExtensions`).
- **The rule this brings:** code that Node loads as it is may use only syntax that can simply be erased. Enums, namespaces and constructor parameter properties are not erasable. One such property in `guarded-dialect.ts` was turned into a plain field for this reason (record 020).
- **The web app's database package is loaded by Node, not bundled.** Turbopack could not follow the migration runner's folder on disk, so `container.ts` loads `@srleagues/database` at run time (record 020).

## Considered

No build step (a compiler output folder or a bundler) was chosen. The record for the web app (020) explains the one place where bundling was tried and did not work. The docs do not record another runtime as an alternative.

## Revisit if

- A Node release changes how it runs TypeScript (the flag or the default), or the warning turns into an error.
- The code needs syntax that cannot be erased, such as enums or namespaces. Then a compile step is needed for that code.
- Node 24 leaves its supported life, or the container image changes.
