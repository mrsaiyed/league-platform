# 041 — TypeScript in strict mode everywhere

Date: 2026-11-14. Step 1.24 (records). Records a T1 choice that stage 1 uses (T-2, T-32). Decided by the lead (technical).

## What

- **One language for the whole product**: the browser, the web server, the worker and the scripts are TypeScript. SQL is the only other language, and it lives in `packages/database` and the migration files (record 006).
- **One shared compiler setup**, `tsconfig.base.json`: strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, ES2023 with NodeNext modules. Each workspace's own tsconfig extends it.
- **TypeScript 7.0.2, pinned exactly** in the root `package.json` (no range).
- **`npm run typecheck`** runs the compiler over the workspace configs, the web app's config (`apps/web/tsconfig.json`) and the UI package's config. It is part of `npm run verify`.
- **No `any`** (T-32). Where an error must be ignored, a comment says why. The repository has no lint tool that bans `any`; the rule is kept by review and by the strict settings.

## Considered

The spec gives the reasons (T1 §3, T-2): the live tracker's rules run both in the browser and on the server, so one language means one copy of the code. No other language or compiler setting was written down as an alternative at the time.

## Revisit if

- A tool we need cannot run on TypeScript 7. This already happened once: Next.js's own type check is switched off, and `npm run typecheck` checks the web app instead (record 020).
- `any` or ignored errors appear in volume despite the review rule. Then add a lint tool with the rule written into it.
