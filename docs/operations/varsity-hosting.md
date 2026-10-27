# Varsity hosting and database operations

**October 27, 2026 · Private shared-SQL pilot**

The hosted scorer is a server application with a shared database. GitHub Pages remains the older intramural presentation and cannot host its API/database. The hosted Site identity is recorded in `apps/varsity-hosted/.openai/hosting.json`; preserve it across computers and deployments. Never create a replacement Site just because local source is missing.

## Data boundary

- The hosted deployment uses Cloudflare D1 (SQLite) through `HostedStore`. Local PGlite/PostgreSQL remains a separate rehearsal adapter.
- Each accepted action saves the full game snapshot, append-only event and current player game lines in one atomic D1 batch. A compare-and-swap revision fences every dependent write. A failed projection rolls back the action.
- Stable command IDs and payload hashes make uncertain-response retries safe. Same ID with different content conflicts. Season totals query saved final non-practice game lines; reopening withdraws the record immediately.
- Only unacknowledged commands use browser storage. Accepted game records are shared and load from another browser/computer.
- One owner-private Site protects one pilot workspace. This is not the production multitenant authorization model. Keep it private; public read-only fan pages and staff roles require a separate implementation.
- The real roster and fixtures remain to be entered. Practice games remain labeled and excluded from real totals.

## Architecture decision

Managed PostgreSQL remains the broad platform recommendation. D1 is the deployable managed SQL provider available for this initial hosted pilot. The scorer and schemas are shared; the storage/HTTP adapters are isolated under `apps/varsity-hosted`. This is an explicit pilot deployment decision, not a silent replacement of the long-term architecture.

Before expanding to paid/general leagues, agree the managed PostgreSQL/provider decision, team-season/competition mapping, auth/roles/RLS, immutable result versions, scorer leases/offline recovery and outbox publication. Preserve stable IDs and source events in a reviewed export/import migration. Never copy browser state into production as authoritative records without reconciliation.

## Reproduce and deploy

1. Clone the canonical GitHub repository and install root dependencies with Node 24.
2. Run `npm run prepare:varsity:hosted` to copy the shared rules/contracts/UI into the host build.
3. Run `npm --prefix apps/varsity-hosted ci`. For Windows ARM64, use x64 Node 24 for Cloudflare tools.
4. Run the host's TypeScript check and framework build. Root unit/database tests include the actual hosted SQL through a SQLite test adapter. Browser verification uses local Miniflare D1 and a separate fresh browser context.
5. Apply new local migrations only to the local D1 preview. Hosted migrations apply through Sites publication; they are not created during request handling.
6. Build with the Sites skill's `build-site.mjs` in `apps/varsity-hosted`. Then run root `npm run prepare:varsity:publish` to create the ignored sibling provider source mirror and copy the matching artifact.
7. Retrieve a short-lived source credential for the existing project. Use the Sites source helper to open/save/push the mirror and package the artifact. Never commit or print its credential.
8. Deploy the exact saved private version using Sites. Verify a practice action via a fresh API read and database inspection before announcing completion.
9. Commit all authored code, migrations, current specs and handoff updates to GitHub. The provider mirror is generated deployment source, not a second authoring repository.

Native Sites access is needed to publish; ordinary GitHub push alone does not deploy the scorer. The GitHub Pages workflow affects only the preserved static intramural concept.

## Local hosted-adapter preview

After building, apply each new migration in order:

```sh
cd apps/varsity-hosted
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_useful_princess_powerful.sql
npm run dev -- --port 4175 --hostname 127.0.0.1
```

This updates only local Miniflare data. Use `HOSTED_TEST_URL` for the browser check if choosing another port. Never replay the same local migration on an existing database without checking its state. The sign-in simulation is development-only; hosted sign-in remains Sites-owned.

## Remaining game-day work

Confirmed roster/fixtures and rules; full-game operator rehearsal; timed outage/takeover recovery; minute repair after clock correction; exceptional outcomes; explicit season scope; backup/restore and operational support evidence. Do not describe the MVP as an unlimited, fully released league platform. It is the first working game-operations module being developed alongside that larger product.
