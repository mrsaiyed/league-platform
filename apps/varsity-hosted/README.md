# Hosted varsity SQL adapter

This is the private, online scoring pilot of **League Platform**, not a separate customer website product. The canonical source is the `mrsaiyed/league-platform` GitHub repository. Pure basketball rules and command schemas live in the root `packages` directories; the scorer UI lives in `apps/varsity-preview/public` and is prepared for this host by the root script.

The managed Sites/Vinext host provides Cloudflare D1. Every accepted command atomically updates the game snapshot, appends an event with actor and receipt, and updates player stat lines. Expected revisions and command fingerprints prevent silent overwrite or duplicate baskets. Finalization/reopening determines which records enter SQL season totals.

The current deployment is **owner-private**. Sites performs sign-in/access enforcement before invoking this app. The shared pilot workspace relies on that private Site boundary, including owner service access; do not change the audience to public. A broader platform needs explicit memberships, assigned scorer permissions, leases, tenant isolation and public DTOs. This is not a replacement for those requirements.

## Build from the main repository

Use Node 24. Windows ARM64 requires the x64 Node runtime for Cloudflare's local tooling; Linux/macOS and Windows x64 use their supported runtime.

```sh
npm ci
npm run prepare:varsity:hosted
npm --prefix apps/varsity-hosted ci
cd apps/varsity-hosted
npm run db:generate
npm run build
```

Do not regenerate an existing migration just for deployment. Inspect and commit new migrations/snapshots only after a real schema change. For local D1 setup and Sites publication, follow the root [hosted operations guide](../../docs/operations/varsity-hosting.md).

Prepared `shared/`, static UI files and `lib/shell.ts` are generated and ignored in the GitHub source. `scripts/prepare-varsity-publish.mjs` creates the self-contained provider mirror, including those exact shared sources and the built artifact. Author changes in GitHub's canonical modules, not the mirror. Sites source credentials and runtime data are never copied into the main repository.

The framework starter's maintained build/auth/plugin helpers and optional UI library files are retained as upstream infrastructure. The authored app paths are `app/route.ts`, `app/api/[...path]/route.ts`, `lib/api.ts`, `lib/store.ts` and `db/schema.ts`. No registration, payment or custom-site fork is implemented here.
