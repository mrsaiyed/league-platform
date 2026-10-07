# Contributing

Use Node.js 24 and `npm ci`. Commit dependency changes with the lockfile. Keep changes reviewable and explain observable behavior, tradeoffs, and relevant verification.

1. Keep fictional presentation work under `examples/alhadi-school`.
2. Keep business decisions in `docs/product`; mark confirmed, proposed, open, and later work.
3. Put important technical tradeoffs in `docs/architecture` before relying on them.
4. Do not introduce real school records, production credentials, live payments, or messages into the example.
5. Run `npm run verify`; run `npm run test:browser` when changing behavior, routes, or layout.
6. Inspect the resulting desktop/mobile screenshots when changing visual presentation.
7. Document a failed or omitted check rather than claiming it passed.

Use feature branches and pull requests once the remote repository exists. Enable required CI checks and review on `main` in GitHub settings. Do not force-push shared history or commit generated artifacts unless an explicit release process calls for them.

When production implementation begins, agree on the initial application scaffold and database migrations. Promote a concept interaction only after its domain rules, permissions, persistence, failure modes, accessibility, and tests are suitable for production.
