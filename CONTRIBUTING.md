# Contributing

Use Node.js 24 and `npm ci`. Commit dependency changes with the lockfile. Keep changes reviewable and explain observable behavior, tradeoffs, and relevant verification.

1. Keep fictional intramural presentation work under `examples/alhadi-school`. The local stats app is under `apps/varsity-preview`; pure rules, contracts and SQL have separate responsibilities under `packages`. Never commit `.local/` or exported player records.
2. Keep active product decisions in `docs/product/platform`; mark confirmed, proposed, open, and later work. Preserve prospective-client plans separately under `docs/initiatives`.
3. Put important technical tradeoffs in `docs/architecture` before relying on them.
4. Do not introduce real school records, production credentials, live payments, or messages into the example.
5. Run `npm run verify`; run `npm run test:browser` for intramural changes and `npm run test:varsity:browser` for varsity changes. Browser tests use temporary databases and synthetic people.
6. Inspect the resulting desktop/mobile screenshots when changing visual presentation.
7. Document a failed or omitted check rather than claiming it passed.

Use feature branches and pull requests once the remote repository exists. Enable required CI checks and review on `main` in GitHub settings. Do not force-push shared history or commit generated artifacts unless an explicit release process calls for them.

The local SQL preview is a rehearsal exception recorded in ADR-004. Before hosted production, implement the authenticated application scaffold and production migrations/policies; do not expose the preview server. Promote a concept interaction only after its domain rules, permissions, persistence, failure modes, accessibility, and tests are suitable for production.
