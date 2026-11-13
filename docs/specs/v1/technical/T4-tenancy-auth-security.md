# T4 — Keeping leagues apart, sign-in, and security

[Spec home](../README.md) · Decisions T-60 to T-87, T-221

## 1. What we are protecting against

| Risk                                                         | Where it is handled                      |
| ------------------------------------------------------------ | ---------------------------------------- |
| One league seeing or changing another league's data          | Section 2                                |
| Someone taking over another person's account                 | Section 3                                |
| A signed-in person doing something their role does not allow | Section 4                                |
| Content on one league's page attacking visitors              | Section 5                                |
| Spam, fake sign-ups, squatting on names                      | Section 6                                |
| Children's information being exposed                         | Section 7                                |
| Card fraud or mishandled money                               | Section 8                                |
| Leaked passwords and keys; a compromised vendor account      | Section 9                                |
| Our own staff looking where they should not                  | Section 4                                |
| Losing data                                                  | [T8](T8-scale-reliability-operations.md) |

## 2. Keeping leagues apart

All leagues share one database (T-4), so separation is the most important property of the system. It is enforced three times over, so that one mistake is not enough to break it.

**Fence 1 — the request.** For every request the server works out, from the session and the address, _who_ is asking and _which league_ they are asking about. This "context" is built in one place (`server/context.ts`) and passed to every command and query. Nothing the browser sends can set it.

**Fence 2 — the code.** Every database function that touches league data requires a league ID (T-28). There is no function that reads "all teams"; only "teams of league X".

**Fence 3 — the database itself.** PostgreSQL row-level security is switched on for every league table.

- **T-60:** the web app and worker connect as a restricted database user that cannot change the schema and cannot bypass row-level security.
- **T-61:** at the start of each transaction the app tells the database which league and account it is acting for, for that transaction only. Every table's policy allows only rows whose `league_id` matches (for `leagues` itself, its `id`), for reading and writing alike. A query that forgot its `WHERE league_id = ...` returns nothing from other leagues, because the database filters it anyway; a transaction that set no league sees and writes nothing.
- **T-62:** tables that belong to a person and not a league (`accounts`, `profiles`, `notifications`) have policies keyed to the account instead.
- **T-63:** jobs that must look across leagues (finding today's games for reminders) run as a list of per-league steps, each inside its own league's fence. A separate, more powerful database user exists only for migrations.
- **T-64:** Supabase's feature that lets browsers query the database directly is given no access to our tables. All access goes through our web app (T-5).
- **T-221: what must happen before a league or account is known goes through a few narrow functions, never a wider policy.** Finding a league from the short name in an address, creating and erasing an account, finding an account by email at sign-in (without revealing whether it exists, T-68), accepting an invitation by its token, and showing the names on a league's access list each get one function that runs as the tables' owner, does one job and returns the fewest columns. Each is reviewed and listed in a test that fails on any it does not know. The short-name lookup exists from step 1.7; the others come with the access and sign-in steps. Detail: [decision record 008](../../../architecture/decisions/008-what-the-app-role-cannot-reach-yet.md).

**And we prove it continuously.**

- **T-65:** an automated test creates two leagues and, for every command and every query in the product, tries to use league A's access against league B's records. Any success fails the build. New commands are included automatically.
- **T-66:** anything cached is keyed by league, and nothing personal or private is ever cached where another visitor could be served it.

## 3. Sign-in

- **T-67: email and password, or Google** (R-2). A new address is proved with an emailed 6-digit code (valid 10 minutes, a few attempts per code, a few codes per hour per address; the numbers are T-225) before a password is set. The same code is the forgotten-password route: asking to sign up with an address that already has an account sends a code too, and finishing it sets a new password.
- **T-85: password rules.** Passwords are handled only by the sign-in service, which keeps a one-way hash; we never store, log or see one. At least 8 characters, no rules about symbols or capitals, and refused if it appears in the public lists of leaked passwords. Wrong guesses are limited per address typed (whether or not it has an account, T-68) and per network, then slowed and locked for a while (T-225), with the bot check (section 6) in front. Changing or resetting a password signs out every other device and emails the account. There are no security questions and no hints.
- **T-225: the numbers** ([record 013](../../../architecture/decisions/013-the-sign-in-interface.md)). A code is valid 10 minutes and takes 5 attempts; an address gets at most 5 codes an hour, and one network at most 30, whatever the addresses. Passwords are 8 characters (counted as characters, so an emoji is one) to 72 bytes (the one-way hash reads no further, so a longer one is refused rather than silently cut), put in Unicode's compatible form (NFKC) before anything else so the same password typed on two keyboards is one password. Wrong passwords are counted against the address typed, whether or not it has an account, and against the network; wrong codes against the network too. For an address: from 5 wrong in 15 minutes each try waits 30 seconds, and at 10 it is locked for 15 minutes. For a network: from 30 each try waits 5 seconds, and at 100 it is locked for 15 minutes. A network is an IPv4 address, or an IPv6 /64 (one household or phone usually has a whole /64). Every try is counted before the password is checked, so tries sent at once cannot slip past the limit together. The access token behind the session lasts 60 minutes and is replaced on renewal; the session itself has no limit (T-70). Google may send the browser back only to our own addresses (https, or plain http to this machine in development).
- **T-68:** the sign-in and sign-up screens behave identically whether or not an account exists ("wrong email or password"; "if that address can sign in, we have sent it a code"), so they cannot be used to discover who has an account.
- **T-69: the session is a cookie the page's scripts cannot read**, sent only over HTTPS, and not sent on requests started by other websites. Behind it are a short-lived token and a renewing token that changes on every use; a stolen old one is rejected and ends the session.
- **T-70: staying signed in** follows R-9: no time limit for anyone, and the session renews itself on every visit. In place of an expiry there are three protections. Sensitive actions (export, permanent deletion, roles and ownership, payout details) need the password again if it was last entered over an hour ago. A sign-in on a device the account has not used before sends an email. A password change or "sign out everywhere" ends every other session at once.
- Sign-in emails (codes, resets, new-device notices) are sent through our own email service (T-11) from their own sending address. The sign-in vendor's built-in sender is limited to a few messages an hour and is not meant for real use.
- **T-71:** the account page lists active sessions by device and time, with "sign out everywhere".
- **T-72: a second sign-in step** (an authenticator app) is offered to league owners at launch and required for owners once a league collects money (stage 5).
- **T-73:** changing an account's email needs confirmation from the new address and sends a notice to the old one.

## 4. Who may do what

- **T-74: permissions are checked on the server, inside each command.** Hiding a button is a courtesy, not a control.
- Roles ([P4](../product/P4-admin-dashboard.md) section 4) map to named permissions in code, for example `games.score`, `games.correct`, `schedule.publish`, `registration.read_answers`, `people.read_sensitive`, `site.publish`, `league.billing`. Each command names the permission it needs and the scope it applies to (the league, a program, a club, a team).
- **T-75:** roles are read from the database on every request, so removing someone's access works immediately.
- **T-76:** private fields are filtered by permission in the query, not in the page. A scorekeeper's roster query cannot return a date of birth because the query for that role does not select it.

**Our own staff.**

- **T-77:** staff have no standing access to any league. To open one, a staff member records a reason; access lasts one hour, is read-only unless the league owner asked for a change, and every such visit appears in a log the league owner can see. Staff accounts require the second sign-in step.

## 5. Safe pages on a shared address

Because every league is on `oursite.com` (U-1), content from one league must never be able to run code in a visitor's browser. The same holds after the move to league subdomains (U-13), because the sign-in is shared across them.

- **T-78: no league-supplied HTML, JavaScript or CSS exists anywhere in the system.** Formatted text (news, About pages) is stored as a structured document ("paragraph, bold text, link to X") and drawn by our own renderer. There is no raw HTML to slip a script into.
- **T-79: a content security policy** tells browsers to run scripts only from us and to show embedded frames only from the approved list (C-9).
- **T-80: stored uploads are images only.** Every upload is decoded and re-encoded on our side (which strips anything hidden in the file), size-limited, and served from a separate web address that has no access to anyone's session. Vector logos are converted to safe form or rejected. Spreadsheets uploaded for an import are a separate path: read once by the worker, limited in size and rows, never kept for download and never served to anyone.
- Links supplied by admins must be ordinary web links. Our pages cannot be framed by other sites.
- Every request that changes data is checked to have come from our own pages.

## 6. Abuse

- Limits on how often one address or account can try a password, request codes, submit registrations, upload files or post in a chat. Announcements have no limit for now (N-9); the email allowance in T-141 is the only backstop until that is revisited before stage 5.
- An invisible bot check (Cloudflare Turnstile) on sign-in and public registration.
- A "report this league" link in every league's footer, reaching us.
- The short-name rules of U-7, and the right to suspend a league (U-9).

## 7. Children's information

Product rules are in [P6](../product/P6-registration-and-accounts.md) section 7. Technically:

- **T-81: public pages get names only through one function** that applies the league's display policy (R-14: one league-level switch the admin controls, first name and last initial to start with, full names once the admin switches; no per-guardian consent is asked or stored), the person's own request (R-15, R-17) and who may see the team's statistics (T-87). The person's request is the `visibility` column of `people` (T3), read by the function as `nameRequest`: `none`, `initials` or `removed`; any other stored value counts as `removed`. No public query can select a raw name, birth date, contact field or home address; a test scans public responses for these fields and for each made-up person's private values.
- **T-87: who may see statistics (S-22) is enforced in that same one function.** The cached public page and the live-update messages contain only what everyone may see; for a team whose numbers are restricted, that is the team's totals and no player lines. Viewers who are allowed more receive it in the separate signed-in request (T-95), checked against their membership on the server. A test loads every statistics page as each kind of viewer and fails if a restricted number appears.
- Youth leagues' player pages are marked "do not index" for search engines by default.
- No advertising or third-party tracking scripts, ever. Page analytics are cookieless and count visits, not people.
- We collect only what a league's form asks for, and encourage forms to ask for less.
- The legal review in B-10 may add requirements; this section is updated when it does.

## 8. Money

- **T-82:** card details are entered only on Stripe's pages. We store Stripe's reference numbers, amounts and statuses.
- Messages from Stripe about payments are verified by signature and handled so that the same message arriving twice has no second effect.
- Refunds need the `payments.refund` permission and are logged.
- A league's payout account is the league's own Stripe account; we cannot move its money.

## 9. Keys, vendors and the pipeline

- Secrets live in the hosting provider's secret store, are different in every environment, and are never in the repository or in browser code (T-30).
- The production database accepts connections only from our servers, encrypted.
- **T-83 (agreed by the founder November 12; due before stage 2 puts real accounts into production): two-step sign-in must be on for every account that controls the business**: GitHub, Supabase, Render, Cloudflare, Stripe, Resend, the domain registrar and the email account they all recover to. The founder asked whether this could wait until after the first version. It should not: this is not something we build, it is about twenty minutes in each vendor's own settings, and a stolen vendor password is the most likely way a small company loses everything.
- The main branch is protected: changes arrive by pull request with all checks passing.
- Dependencies are pinned and scanned for known vulnerabilities automatically; updates are proposed weekly.

## 10. Records

- The **activity log** (A-6) records admin actions per league.
- A **security log** records sign-ins, failed attempts, role changes, exports, deletions and staff access.
- Logs never contain passwords, sign-in codes, session tokens, form answers or message bodies.
- **T-86:** logs and error reports carry no personal content: names, email addresses and form answers are removed before an error report leaves our servers. Application logs are kept for 90 days and the security log for one year. An export of a league's data is delivered through a link that works for 24 hours and only for the signed-in person who asked for it, and every export appears in the activity log.

## 11. If something goes wrong

**T-84:** a written incident procedure before the first outside league joins: how we notice, how we stop it, how we tell affected leagues (promptly, and within 72 hours for anything involving personal data), and a written account afterwards of what happened and what changed. Until there is a team, the founder is the named person responsible.

## 12. What must be tested before each release

| Test                                                                           | Proves    |
| ------------------------------------------------------------------------------ | --------- |
| Two-league isolation across every command and query (T-65)                     | Section 2 |
| Every role against every command: allowed ones succeed, all others are refused | Section 4 |
| Password and code attempt limits and lock-outs                                 | Section 3 |
| Script-injection strings in every text field come out as harmless text         | Section 5 |
| Disallowed and disguised file uploads are rejected                             | Section 5 |
| Public responses contain no private fields (T-81)                              | Section 7 |
| A repeated payment message changes nothing                                     | Section 8 |
| Browser code contains no secrets                                               | Section 9 |

Before sign-up opens to strangers (stage 5), the founder decides whether to commission an independent security review (T-181). My advice at that point will be yes, because that is when strangers' data and money arrive.
