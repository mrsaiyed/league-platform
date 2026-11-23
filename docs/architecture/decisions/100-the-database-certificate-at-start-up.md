# 100 — The database's certificate, and a start-up that says what is wrong

Date: 2026-11-22. Step 2.203 (T-299). Serves T4 §9, T-30, T-60 and the 2.110 audit's H1, M1, M2 and L1.

**Run on the throw-away PostgreSQL 16.15 of step 2.202 (record 092) on a cloud machine of the Claude app. Not run against Supabase: its certificate was never handed to either program here.**

## Problem

Supabase's database certificate is signed by an authority no computer knows. The web app had a setting for it as PEM text only (step 2.93's last part); the worker had none, so on the test copy it could only stop, and it said "the database could not be reached" for a certificate, a wrong password and a stopped server alike.

## What

- **One setting, read one way** (`databaseCertificateFrom`, `packages/providers/src/platform-database`): `PLATFORM_DATABASE_CA` is the certificate's PEM text, or else the path of a file holding it. Each program's `config.ts` hands the file reader; the settings check reads the file once, at start. Every PEM block must parse as a certificate (`X509Certificate`), a private key in it is refused, a literal `\n` is taken as a line break (a host's settings page may keep them so). A refusal names the setting with a fixed reason; it never repeats the value, the path or the file.
- **Both connections**: the worker hands it as `ca` to its pool and to pg-boss (one `DatabaseSource`, `wire-worker.ts`); the web app to its pool, as before. Left out, the computer's own authorities are used. The worker has no way to switch the check off (it takes no `PLATFORM_DATABASE_SSL`); the web app keeps "off" for a database on this computer only.
- **Four sentences, by code** (`connectCauseOf`, now by the driver's code alone for a certificate: Node's TLS gives every such refusal one): the certificate was not accepted (naming the setting and both ways to give it), the login was refused, the server was not reached (host, network, timeout and anything that carries no code of the server), and, since the fix round, the server answered but refused the start (any other 5-character code of the server, which is said; its message text is not: Supabase's pooler with a wrong login name answers XX000, a full server 53300). The web app keeps its two more precise ones, a database name that is not there and a server without SSL, and the worker has them too. A failure of pg-boss's own connection at queue start is told the same way.
- **M2, L1**: in staging and production the web app refuses a `PUBLIC_BASE_URL` with a path, a query or a fragment, as the worker already did everywhere; every "not one of the allowed values" names the values (they are ours, never secret).

## Proof

`tests/real-postgres/start-up-certificate.test.ts`, both programs in staging mode: without the setting, and with a made-up certificate that is not the server's, both refuse naming it; with the server's own, as text or as its file, the web app starts and the worker gets past the connection (it then stops at pg-boss's schema, which the release makes and the server does not have yet, record 053); a wrong password is "login refused"; a port where nothing listens is "not reached"; no sentence or log line holds the password, the port or a line of either certificate. In the gate: `apps/worker/src/start-worker-certificate.test.ts` (the setting reaches both connections; six driver codes to their sentences), and the settings tests of both programs.

## Not done

- No release command opens the hosted database yet besides the league-making tool, which already takes `MIGRATION_DATABASE_CA` (record 057); a release that makes pg-boss's schema will take the certificate the same way.
- `connectCauseOf` still reads pg's own fixed words for a server without SSL and for its timeout, which carry no code.
