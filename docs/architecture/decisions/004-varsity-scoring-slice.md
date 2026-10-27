# ADR-004: stats-first team workspace and local SQL rehearsal

**October 27, 2026 · Implemented for local rehearsal; production provider recommendation remains proposed**

The immediate founder direction is Al-Hadi varsity keeping game statistics while participating in TCSAAL. This precedes the intramural opportunity and does not replace the broader end-to-end league platform promise.

Use a team-managed external-competition mode with separate record ownership and official competition authority. Build the scoring core, validated commands and SQL projections first. Defer registration, payment, draft and the full website editor until their own milestones. Before public/real-game rollout, implement identity, isolation, recovery and verified sport rules rather than treating a functioning local form as readiness evidence.

Recommend managed PostgreSQL, with Supabase as the first provider candidate, for the shared product. The relational workload and atomic event/result updates fit this structure. Use PGlite solely for an immediately runnable persistent local rehearsal; keep its schema under `varsity_preview` and keep its HTTP adapter under `apps/varsity-preview`. It is not a substitute for production database-role, pooling, concurrency, capacity or restore tests.

Reusable code lives in `packages/contracts` and `packages/sports`; SQL adapters live in `packages/database`. The rehearsal UI uses native browser modules. The planned Next.js web/worker architecture remains the target for authenticated self-service deployment. Do not build empty future folders or migrate the preserved intramural presentation just to mimic the target topology.

Consequences: local startup needs Node 24 but no cloud secret; durable records can be tested now; hosted use still needs production schema/identity/lease work; any preview data import needs an explicit mapping and verification step. The existing GitHub Pages demo stays unchanged. See the [initiative engineering contract](../../initiatives/alhadi-varsity/02-engineering-contract.md) for exact implemented limits and migration requirements.

## Hosted pilot continuation — October 27

The founder clarified that the online MVP must persist each accepted action to a shared database, not browser-local simulation. Add an isolated Sites/Vinext + managed D1 adapter with atomic state/event/stat writes and owner-private access. This fulfills the shared persistence requirement while broader product work continues in parallel. Managed PostgreSQL remains the general platform target; D1 is a documented pilot adapter. Canonical source and shared sport/contracts stay in GitHub, with a generated provider source mirror. See [hosted operations](../../operations/varsity-hosting.md).
