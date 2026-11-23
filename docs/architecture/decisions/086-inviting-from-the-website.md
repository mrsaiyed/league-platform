# 086 — Inviting people from the website: the accept page, the held link, and the made-up database's emails

Date: 2026-11-17. Step 2.97 (T-288). Carries out P4 §4 and §6, T-226, records 014, 023 and 067. Decided by the builder of step 2.97, to be confirmed when the step lands.

**Not verified against a real PostgreSQL server, Supabase or a real email service.** Everything below runs on the made-up database (PGlite) and the made-up stand-in.

## Problem

A league's owner could not give anyone a role from a screen: the commands existed (record 014) but no page ran them, and no page answered the link an invitation email carries. Three things had to be settled beyond drawing the pages:

1. **Where the link's secret goes once it is opened.** Record 023 keeps the token in the address (`/{league}/invitation/{token}`) and asks that page for `no-store`, `no-referrer` and no logging. But a person who has no account yet must sign in or sign up and come back, and the way back is an address (`/signin?next=…`) that lands in the browser's history, the sign-in screens' own links and the server's request: the token would be in "another page's address".
2. **What a link that does not work says**, and to whom, without telling someone trying links which of "wrong, used, cancelled, run out, replaced" it was, and without giving away a league that is not public (U-9), into which most invitations are made.
3. **How an invitation is emailed on the made-up database.** The worker sends invitation emails (T-226). The made-up database lives in the web app's own memory (record 055), where no worker can reach it, so in local work and tests an invitation was never emailed and its link never existed (record 075, "Not done yet").

## What

- **The link holds its token and forwards.** `/{league}/invitation/{token}` is a route that draws nothing (`app/[league]/invitation/[token]/route.ts`). It sets one cookie, `srl_invitation`, holding the token (HttpOnly; Secure on HTTPS; SameSite=Lax, so it is set and sent on the link followed from a mail app; Path `/{league}/invitation`, so it goes to that league's accept page only; one hour), answers `303` to `/{league}/invitation` with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, and logs nothing. Every league address and every token, of the right shape or not, gets the same answer, so the answer tells nobody anything. A browser history keeps only the token-free address the link forwards to.
- **The accept page has no secret in its address.** `/{league}/invitation` (the address helper's `invitation-held`) reads the cookie on the server and never draws the token, not even into a form: Accept reads it from the cookie again. Signing in or up comes back with `next=/{league}/invitation`. After accepting the cookie is cleared and the person lands on the league's home, in the league's own frame (2.105 audit, H3).
- **Its referrer policy is `same-origin`, not `no-referrer`.** Under `no-referrer` a browser sends a plain form (scripts off) with `Origin: null`, which Next.js refuses as another site's post, so no button on the page could work without scripts. The page's address holds nothing secret, and `same-origin` still sends nothing to another site. The token's own address keeps `no-referrer` (`next.config.ts`: `/:league/invitation/:rest+`).
- **What the page says.** A visitor: sign in or create an account, nothing about the league or the role, since nothing is proved yet. Signed in: `access.read_invitation` (new, `signed-in`), which checks exactly what accepting checks and answers every way a link cannot be used with one code, `invitation-not-usable`; the one other answer is for the account that accepted it, opening it again ("Already accepted"). A link that works shows the league, the role, the account it will go to (T-226: any signed-in holder may accept) and, when the link was sent to another address, says so without naming it, with "Use another account". Everything else, an address of no league included, is one page, "This link does not work", with the same advice for every case. Where the league may not be shown to the person (not public yet, or no league at all) the page stands alone, outside the league's frame, exactly as for an address of no league.
- **The Admins page** (`/{league}/admin/settings/admins`) follows record 067 for every form. People are listed by name, "No name yet" for one not given (A-14), through step 2.92's `access_list_names`; an invitation is listed by the address it was sent to, which is all there is of it until accepted. Only someone who may manage access for the whole league sees the page (League settings, then `access.list_access` at the league).
- **The made-up database takes the worker's turn.** On the made-up database only, right after inviting or re-sending, the web app runs the due jobs of the jobs table through the table queue (the queue the worker uses in local work) with an `email.send` handler of its own (`apps/web/src/server/made-up-invitation-mail.ts`). It does the worker's job in the worker's order (record 014: make the link, commit, then hand the email over) into the made-up capture the kept emails' page reads (step 2.96). It is built only by startup's made-up database branch; a real database's ports have none and the worker sends as before. The structure rule T-226 names this one file as the only place outside the worker that may call `issueInvitationLink`.

## Considered

- **The token through sign-in in `next=`.** Simple, and what every other page does; refused because the token would sit in the sign-in screens' addresses and history.
- **Keeping the token in the server's memory under a handle in the address.** The handle would be as good as the token to whoever saw it.
- **A pglite socket so the real worker could reach the made-up database.** PGlite has one session: the web app's transactions and the worker's would interleave in it.
- **Moving the worker's job into a shared package.** No package may use core, the email templates and the message files together without changing the dependency table (T-21); the made-up copy is about forty lines and is checked end to end by `database-admin-access.test.ts` and the browser test.

## Not done here, and what is left

- **Coaches and captains cannot be invited yet.** Their roles are for one team, and team scopes are not offered by the access commands until they can check the team (record 022, `availableScopeTypes`). The Admins page offers the league-wide roles only.
- **A role limited to one program** is listed and can be removed, but the page invites to the whole league only; a program's own admin cannot open the page (it lists the whole league).
- **Inviting an address that already has the role** is not refused ahead: the account behind an address is out of the league's reach without a new owner-run function (a migration). Accepting keeps the grant they have ("already held", record 014), so nothing doubles.
- **The made-up stand-in** has no invitations (record 075; step 2.88 gives it some): its Admins page lists its grants and its made-up names, and its access commands refuse.
- **A refusal inside a plain form's action answers Next.js's "not found" (404)**, not the 403 the page itself answers (a scheduler who replays an owner's form). Nothing runs; the status is Next.js's.

## Revisit if

The web app runs on more than one server (the held cookie needs nothing shared, but the forms' one-time notices do, record 067); team-scoped roles become available; or Next.js accepts a plain form posted from a `no-referrer` page.
