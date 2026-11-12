# SR Leagues (working name) — instructions for every AI session

This repository is becoming a league management platform. One person, the founder, owns it. The founder runs Faraj League, is not an engineer, and has made an AI session the business and technical lead.

## Read these first

1. `docs/specs/v1/PROGRESS.md` — where the specification stands and the facts several files share.
2. `docs/build/STATUS.md` — where the build stands and what to do next.
3. `docs/build/RUNBOOK.md` — how a build run works. Follow it exactly when you are asked to continue the build.

The specification in `docs/specs/v1/` is the description of the product. If code and spec disagree, one of them is wrong: fix it in the same change (T-185).

## Who decides what

- **Technical decisions** (IDs starting `T-`): the lead decides, records the decision, and tells the founder plainly. Do not ask the founder to choose between technical options.
- **Product and business decisions** (every other ID): only the founder. Never mark one agreed and never build something whose decision is still "Recommended" or "Needs your answer" in `docs/specs/v1/DECISIONS.md`. If you need one, write it under "Needs the founder" in `docs/build/STATUS.md` and work on something else.
- Anything that costs the founder money or time is the founder's call.

## Rules for all code (from `docs/specs/v1/technical/T2-repo-and-code-structure.md`)

- Dependencies point one way: `contracts ← sports ← core ← database, providers`; `apps/*` wire everything together. `packages/core` contains no React, no SQL text and no vendor library.
- Every change to data is a command: `command(context, input, deps) → result | error`. `context` comes from the server's session, never from the request body.
- A module is used only through its `index.ts`.
- No league is ever named in code. Differences between leagues are data.
- No query without a league ID. No SQL outside `packages/database`.
- Every league address is built by the one address helper (T-34). Never write `/{league}/...` by hand.
- All interface text lives in message files, not in components (T-187).
- Strict TypeScript, no `any`. One command or query per file, test beside it. Files are `kebab-case.ts`; tables and columns are `snake_case`.
- Each outside service sits behind an interface in `packages/providers`.

## Hard limits

- **Made-up data only.** Never hold production secrets, never connect to a production database, never run anything against production or a vendor account (T-201).
- **The Al-Hadi tracker keeps working.** Do not change the behavior of `apps/live-stats`, `packages/sports` or their tests except as the build plan says. `npm run verify` must pass after every change (T-16).
- Work on the build branch named in `docs/build/STATUS.md`. Never commit to `main`. Never push, force, rebase shared history or delete branches unless `STATUS.md` says the founder allowed it.
- Never skip checks or hooks to get a commit through. If a check fails, fix the cause.
- Do not install global tools or change anything outside this repository.

## Checks

```bash
npm run verify
```

This is the gate today: structure check, type check, tests, formatting, demo build. Stage 1 extends it; `docs/build/STATUS.md` names the current gate.

## Talking to the founder

Plain everyday words, no jargon without a short explanation, and say what is not done or not verified. The founder often dictates by voice: "Farge" means Faraj. Their steady principle is that a league is its admin's to run, so prefer settings the admin can change over rules we impose, unless there is a real legal or safety reason.
