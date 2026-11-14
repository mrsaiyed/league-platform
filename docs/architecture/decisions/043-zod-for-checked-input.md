# 043 — Zod checks every piece of incoming data

Date: 2026-11-14. Step 1.24 (records). Records a T1 choice that stage 1 uses (T1 §1, T-30). Decided by the lead (technical).

## What

- **Zod 4.6.7, pinned exactly**, in the root `package.json` and in `apps/web/package.json`.
- **Commands check their input first.** A command's input is checked by a Zod schema before its transaction opens (record 010). Errors keep the path and the error code, never the value that was sent.
- **Settings are checked the same way.** `apps/web/src/server/config-schema.ts` describes every setting and secret. The app refuses to start if one is missing or invalid, and the message never prints a value (T-30).
- **Shared shapes live in `packages/contracts`** (six files that use Zod): the API, game and roster shapes that the browser and the server both use (T1 §1).
- **Core's modules** (access, leagues, people, games, scheduling, imports) use Zod for their command inputs, and the queue's job shapes are checked the same way (record 012 describes the job checks in the database).

## Considered

The spec chose Zod (T1 §1). No other checking library is written down as an alternative.

## Revisit if

- A check must be shared with something that is not JavaScript or TypeScript, where a plain JSON schema would travel better.
- A Zod major release changes the error shape that the logs and the browser messages depend on (the message text must stay free of values).
