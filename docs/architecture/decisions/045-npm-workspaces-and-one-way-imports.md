# 045 — npm workspaces with one lockfile, and imports that point one way

Date: 2026-11-14. Step 1.24 (records). Records T-20, T-21 and T-22, the repository layout choices stage 1 uses (T2 §2). Decided by the lead (technical).

## What

- **One repository, npm workspaces, one lockfile** (T-20). The root `package.json` lists eleven workspaces: `apps/web`, `apps/worker`, and the packages `core`, `site`, `ui`, `emails`, `providers`, `observability`, `contracts`, `database` and `sports`. `package-lock.json` at the root is the only lockfile for them.
- **The older `apps/varsity-hosted` is outside the workspaces.** It keeps its own lockfile and is installed separately (`.github/workflows/ci.yml` installs it in its own job).
- **Imports point one way** (T-21): `contracts` ← `sports` ← `core` ← `database` and `providers`, with `contracts` and `ui` used by `site` and `emails`; the apps wire everything together. The table of who may import what is in `scripts/structure/config.mjs` (`allowedDependencies`). `packages/core` may not use React, SQL text or vendor libraries.
- **A module is used only through its `index.ts`** (T-22). `scripts/structure/index-only.mjs` rejects an import that reaches into another module's files.
- **These are checked on every run** of `npm run check` (`scripts/check.mjs` runs `scripts/structure/`). A new workspace with no row in the table fails the check until one is added.

## Considered

T-20 records that the workspaces were kept "as it is today": the repository already used npm workspaces before stage 1, so the choice was to keep them rather than split into separate repositories or use another tool. The spec gives the reasons for one codebase (T-1: one application, not many services). No other tool is recorded as an alternative.

## Revisit if

- A workspace needs a different dependency set that cannot share the one lockfile. The `apps/varsity-hosted` split is the existing example.
- The checks become slow enough to slow down the gate, or a new kind of import needs a rule.
