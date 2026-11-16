# Lane 2.115 handover: the start-up check that email confirmation is on

Branch `lane/2.115-confirmation-check`, opened from `build/stage-1` at fabb60f3. The step's line is in `docs/build/STAGE-2.md` (search "\*\*2.115 (TEST 2)").

## The step

`account_for_sign_in` links an account made in advance (an invited coach, an owner made by `npm run league:make`) to whoever signs in with its email address. That is safe only if the sign-in service confirms addresses. Record 018 needs "Allow new sign-ups" on, so anyone with the project's public key can sign up at Supabase directly. With "Confirm email" off, Supabase would take the typed address as proved, and that person would get the account. So the web app must refuse to start in staging and production unless the service confirms addresses. Nothing on any screen changes.

## What reading found

- **The adapter can learn the setting with what the app already holds.** Supabase Auth's public settings, `GET /auth/v1/settings`, answer `mailer_autoconfirm`: `false` when "Confirm email" is on, `true` when it is off. The call needs only the project key, and the adapter already sends its secret key as `apikey`. It needs no new permission and no admin key. NOT verified against the live service: whether the gateway answers this path with the secret key, and whether the field follows the dashboard switch.
- **Where start-up refuses today:** `apps/web/src/server/startup.ts`. Local and test run on the stand-in. Staging and production open the database, check the login role, and then always stop with "sign-in on the real service is not wired yet…" (step 2.93). The gate's staging start (`scripts/check-web-shell.mjs`) stops earlier, at the unreachable database, so it never reaches the new check and calls no Supabase.
- **Where the last part of 2.93 hooks in:** in `startWebApp`, the line `await requireEmailConfirmation(realSignIn(deps, { projectUrl, secretKey }));` comes just before the final `throw new StartupError('sign-in on the real service is not wired yet…')`. Step 2.93's last part replaces that throw with the real ports. It widens `StartupDeps.realSignIn` to build the whole Supabase adapter (`createSupabaseSignIn` with the database sign-in store), and asks the same `requireEmailConfirmation(adapter)` first. The check must stay above whatever replaces the throw.

## What is built (commit 594ef266, all checks passed locally)

- `packages/providers/src/sign-in/sign-in-service.ts`: `EmailConfirmation = 'on' | 'off' | 'unknown'`, `SignInService.emailConfirmation()` (never throws), and `EmailConfirmationQuestion`.
- `packages/providers/src/sign-in/local/local-sign-in.ts`: the stand-in answers `on`.
- `packages/providers/src/sign-in/supabase/email-confirmation.ts`: `emailConfirmationOf(auth)` reads the settings answer, and `createSupabaseEmailConfirmation({ projectUrl, secretKey, fetch })` is the question on its own, for start-up (https only). Exported from `packages/providers`.
- `gotrue-client.ts`: `settings()` (GET /settings). `checkProjectUrl` moved here from `supabase-sign-in.ts`. The adapter's `emailConfirmation` uses `emailConfirmationOf`.
- The fake Supabase (`fake-supabase-auth.test-helper.ts`) answers GET /settings. Its option `mailerAutoconfirm` is false by default.
- `apps/web/src/server/startup.ts`: `StartupDeps.realSignIn`, and `requireEmailConfirmation`, which stops on `off` and on `unknown` (a throw counts as `unknown`). Each refusal is one sentence that says to turn on "Confirm email" under Authentication, then Sign In / Providers, then Email. Nothing is logged, and no key or address is named. `container.ts` wires it with `createSupabaseEmailConfirmation` and the global fetch.
- Tests:
  - `email-confirmation.test.ts`: 8 tests covering every shape of reply (on, off, missing, null, a string, a number, an array, not JSON, 204, 401, 403, 404, 500, 302, no connection, timeout).
  - `local-sign-in.test.ts`: +1 test.
  - `startup.test.ts`: 15 tests. The new ones cover: off fails with the exact message; unknown and a throw fail; on goes on to 2.93's refusal; local and test never ask; nothing private in the message or logs; a fault while setting up the service gives fixed words.
  - Also run: `supabase-sign-in.test.ts` and `gotrue-client.test.ts` (61 passed), the typecheck, `npm run check` and `npm run format:check`.
- Docs:
  - `docs/operations/make-a-league.md`, "Before the day", step 2: "Confirm email" on, and `grant sign_in_store to app_login;`.
  - Record 018: a paragraph on the check.
  - T4, T-67: a sentence on it.

## Half built / not started

- Nothing half built.
- Not started:
  - GitHub's run on this branch.
  - The review.
  - Step 2.95's procedures file, which does not exist yet. When it is written, it must carry both hand steps.
  - The founder's checklist in `STATUS.md`, which a builder may not edit. The lead adds "Confirm email on" and `grant sign_in_store to app_login;` there.

## Next three things, in order

1. Run GitHub on the pushed branch (`node scripts/wait-for-github.mjs <names>`, then `node scripts/github-check.mjs lane/2.115-confirmation-check`), and fix anything that fails.
2. Have it reviewed (opus, high), above all: that `unknown` can never pass, and that the message and logs hold no value. Then land it on `build/stage-1`. The lead adds both hand steps to the founder's checklist in `STATUS.md`.
3. In the supervised session on the test copy, before 2.93's last part lifts the refusal, check against the real project that `GET /auth/v1/settings` answers with the secret key and shows `mailer_autoconfirm: false` when "Confirm email" is on and `true` when it is off. Also check that the dashboard path in the message is right.
