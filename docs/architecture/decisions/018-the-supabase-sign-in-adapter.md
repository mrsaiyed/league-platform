# 018 — The Supabase sign-in adapter

Date: 2026-11-13. Step 1.15; carries out T-5, T-6 and the interface of record 013; decides T-230. Decided by the lead (technical).

**Not verified against the live service.** Everything below is tested against a fake Supabase Auth written by hand from Supabase's published API and its server's behavior, with no network and no project (T-201). The list at the end is what the supervised session of step 1.25 checks on a staging project before the adapter signs a real person in.

## What

- **Where:** `packages/providers/src/sign-in/supabase/`, used through `@srleagues/providers` as `createSupabaseSignIn`. It implements the same `SignInService` as the local stand-in, with the same numbers (`signInDefaults`, now shared by both in `sign-in-settings.ts`).
- **No vendor library.** The adapter calls Supabase Auth's HTTP API (`/auth/v1/...`) through an injected `fetch`, with the project's secret key from the app's config (T-30). `supabase-js` would add a dependency (T-191) built for browsers that keep their own session, which we never do (T-69: the app holds the tokens in its cookie). An answer that does not have the shape we rely on, a 5xx or no connection is thrown as `SupabaseAuthUnexpected`, which carries a status and Supabase's error code but never an address, password, code or token (T-86). Supabase being busy (429) becomes our own `too-many-attempts` with its wait.
- **Codes:** the adapter asks for each code with the admin call that makes one without sending anything (`/admin/generate_link`: `magiclink` for sign-up, which makes an unconfirmed user for a new address; `recovery` for a reset) and hands it to our `SignInCodeSender` (T4 §3). Supabase's own sender is never used. This replaces record 013's plan of Supabase's send-email hook: the hook needs a public address Supabase calls with a signed request, and would put a second, different way of sending codes beside the stand-in's; with the admin call both adapters hand the same message to the same sender.
- **What the adapter keeps itself, in an injected store (`SupabaseSignInStore`),** because Supabase does not: the devices an account has used (T-70); the session list by device and time with "ended" (T-71: Supabase's API has no list); our own counts of wrong guesses per address typed and per network, and of codes asked for (T-85, T-225: Supabase counts per network only, by its own numbers, and every call reaches it from our server's address); the attempts left on each code (Supabase answers a wrong code and an expired one alike, and allows more tries); the proof between a right code and a new password (it holds the Supabase session the code made, at most 15 minutes); and whether an account has finished signing up through us and has a password. Tokens are kept only as SHA-256. Each store method is one atomic step, which is what keeps tries at once inside the limits (record 013). `createMemorySignInStore` is the development and test one: it refuses to start outside those, like the stand-in.
- **The production store is not built.** It needs tables of our own (devices, sessions, attempt counts, pending codes and proofs), so a migration number. Until then the adapter runs only with the in-memory store, which signs everyone out on restart and cannot be shared by two servers.
- **An account is ours once it finished signing up through us,** by a code and a password or by Google. A Supabase user left behind by a sign-up never finished is not an account: a reset for it sends no code, and a password sign-in is just wrong.
- **Refresh tokens: no reuse window (T-69).** Supabase accepts an old refresh token again for a few seconds. The adapter remembers which refresh tokens it has seen used and ends the session, at Supabase too, when one comes back. A renewal Supabase could not answer is released, so the person can try again without being signed out.
- **Passwords over 72 bytes (T-225).** Supabase's hash reads no further, so it would accept a longer password cut short. New ones over 72 bytes are refused before Supabase sees them; one typed at sign-in is never sent and is just wrong. In its place, as for an address that is not one, the adapter still makes one sign-in call with a random password, so every wrong try costs the same (T-68). A reset for an address with no account, and a code checked where no code was sent, likewise make the same single call as the real case. A test compares the calls made for an address with an account and one without.
- **The password again (T-70)** is checked by a password sign-in whose new session is ended at once: Supabase has no "check this password" call, and its reauthentication sends an email.
- **Password changes** end every other session at Supabase (it does so itself; the adapter asks again, which also covers the same password set again) and in our list. Leaked passwords are refused by Supabase's own check.
- **Google** uses Supabase's authorize address with a PKCE challenge; the verifier goes back to the app as `verifier`, and our return-address check (record 013) runs first.
- **Which session a token belongs to** is read from the `session_id` claim of the access token Supabase has just handed us, not verified again (it came over our own TLS connection from Supabase). `identify` asks Supabase on every call whether the session is still alive there.

## The Supabase project's settings

Set to match T-225 and T-70 when the project is made (step 1.25): access token (JWT) expiry 3600 seconds; email code length 6 and expiry 600 seconds; minimum password length 8, no character rules; leaked-password protection on; email confirmation on; refresh-token rotation on, with the reuse interval as low as Supabase allows; no session time-box or inactivity limit; Google as the only other provider; the redirect allow-list holding only our own origins; and Supabase's own emails switched off or left unused (we send nothing through it).

## To check on staging (step 1.25)

1. The shapes of `generate_link`, `verify`, `token` (password, refresh, PKCE), `user` and `logout` answers, and the error codes the adapter reads (`weak_password` with `pwned` and `length`, `same_password`, `invalid_credentials`, `email_not_confirmed`, `otp_expired`, `user_not_found`, `session_not_found`).
2. That `generate_link` sends no email and is not held back by Supabase's once-a-minute limit per address.
3. That a magic-link code for a new address must be checked as `signup`.
4. Supabase's per-network limits on sign-in and refresh: every call comes from our server, so they would apply to all our users together. They must be raised far above our own, or the person's address passed on to Supabase if it supports that.
5. That a password over 72 bytes is cut, not refused, and that our refusal therefore matters.
6. That the reuse interval can be set to 0, and what a refresh at the edge of it answers.
7. That a password change ends the user's other sessions, and `logout?scope=others` does too.
8. That leaked-password protection is available on the project's plan (it is a paid-plan feature at Supabase): **the founder's call**, since it costs money. Without it the adapter cannot refuse leaked passwords (T-85).

## Considered

- **`supabase-js`.** Less code, but a new dependency, browser-shaped session handling we would have to switch off, and harder to test without a network.
- **Supabase's send-email hook.** See "Codes" above.
- **Relying on Supabase's own limits.** Different numbers, per network only, and our server is the one network it sees.
- **Supabase's reauthentication for the password again.** It sends an emailed code, which T-70 does not ask for.
- **Keeping no store and asking Supabase for everything.** It has no session list, no devices and no per-address counts.

## Revisit if

- The staging checks above find a difference: fix the adapter and the fake together.
- Supabase adds a session list or a password check to its API.
- The production store is built: it must pass the same tests as the in-memory one (`memory-sign-in-store.test.ts`), and the adapter's tests run against it too.
