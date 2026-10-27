# Security boundary

This repository contains an offline intramural concept, a local SQL-backed rehearsal and a private hosted SQL pilot. The pilot is not the full production league platform.

## Hosted varsity pilot

The hosted Site must remain owner-private. Sites validates visitor sign-in/access or owner service access before dispatch; the app writes one shared pilot workspace. Its API checks request origin, bounds and validates input, and saves state/events/stat lines atomically. Keep the source credential and owner service token out of source and logs. Do not change the audience to public or assume that adding viewers implements scorer permissions. General roles, tenant isolation, leases, safe public projections and backup/restore evidence remain separate requirements. See [hosting operations](docs/operations/varsity-hosting.md).

## Varsity rehearsal

The Node server binds only to loopback and checks Host/Origin, validates bounded requests, escapes user text and uses parameterized SQL. It has no authentication or production RLS. Anyone with access to the computer/session can use it. Never expose it through a tunnel or public bind. Records persist in gitignored `.local/`; exports can contain player names. Use synthetic practice data until identity, privacy and recovery gates are passed. SQL persistence is not a cloud backup. See the [varsity security and migration contract](docs/initiatives/alhadi-varsity/02-engineering-contract.md).

## Preserved intramural concept

- Anyone opening the demo can view every fictional persona, including the commissioner. There is no real login or access boundary.
- Browser storage holds only demonstration state. Do not enter real student, payer, medical, or school records.
- Payment, email, eligibility, publication, and account actions are simulations. There are no production provider credentials.
- A private source repository does not automatically make a hosted demo private. Verify hosting access independently.
- Report concerns privately to the repository owner rather than posting student data, credentials, or sensitive details in a public issue.

Before handling real users, implement the production design: verified identity, scoped memberships, server-side authorization, database policies and constraints, secure sessions, minimal public projections, provider validation, secret management, audit history, retention, and tested recovery. Follow the active [security/privacy](docs/product/platform/04-identity-security-privacy.md) and [communication](docs/product/platform/09-communication-media-engagement.md) contracts for recipient-level privacy.

Keep `.env` files and secrets out of version control. If a secret is ever committed, revoke/rotate it and follow a deliberate incident process; removing the current file alone is insufficient.
